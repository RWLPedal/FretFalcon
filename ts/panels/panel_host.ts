// ts/panels/panel_host.ts
// Manages panel instances, coordinates layout strategies (FloatingLayout /
// TabbedLayout), and owns the view lifecycle. Replaces panel_manager.ts.

import { View } from "../core/view";
import { ViewId, CORE_VIEW_IDS } from "../core/ids";
import { AppSettings } from "../settings";
import { LinkManager } from "./link_manager";
import { SignalSink } from "./link_types";
import {
  getFloatingViewDescriptor,
  getViewIcon,
  getViewIconByFeatureType,
} from "./panel_registry";
import {
  getFeatureTypeNameByViewId,
  getBroadcastSourceViewId,
} from "./drive_registry";
import { isFretboardDescriptor, FloatingViewDescriptor } from "./panel_types";
import { resolveSizing, Orientation } from "./panel_sizing";
import { onEvent, emitEvent } from "../core/events";
import { ScreenConfigManager } from "../screen_config/screen_config_manager";
import {
  CurrentPayload,
  LinkRecord,
} from "../screen_config/screen_config_types";
import {
  DEFAULT_CONFIG_OPTIONS,
  MOBILE_STARTER_KEY,
  MOBILE_STARTER_LAYOUT,
} from "../screen_config/default_configs";
import {
  GRID_COLS,
  DESIGN_ROWS,
  GridGeometry,
  fitGridGeometry,
  colToPx,
  rowToPx,
} from "./grid_constants";
import {
  packShelves,
  reconcileLayout,
  tidyLayout,
  layoutBottomRow,
  ReconcileItem,
  PlacedRect,
} from "./layout/grid_packer";
import { FloatingLayout } from "./layout/floating_layout";
import { TabbedLayout } from "./layout/tabbed_layout";
import type {
  LayoutData,
  LayoutStrategy,
  PanelChrome,
  PanelSpawnInfo,
} from "./layout/layout_strategy";
import {
  TABBED_MEDIA_QUERY,
  mergeLayoutData,
  pairLinkState,
  tabbedDefaultOrientation,
  tabbedPaneSize,
  PairLink,
} from "./layout/layout_mode";

const FLOATING_VIEW_AREA_ID = "floating-view-area";

/** Views that are never re-created for a settings or orientation change: they own
 *  running audio/timing state that a re-render would reset. */
const NEVER_RECREATE_VIEW_IDS = new Set<ViewId>([
  "instrument_floating_metronome" as ViewId,
  "floating_timer" as ViewId,
]);

type PersistedEntry = CurrentPayload["instances"][string];

// Retain FloatingViewManager as an alias so existing imports keep working.
export { PanelHost as FloatingViewManager };

interface PanelRecord {
  instanceId: string;
  viewId: ViewId;
  viewState?: unknown;
  collapsed?: boolean;
  /** Per-instance orientation in the floating layout (the desktop rotate button). */
  orientationOverride?: Orientation;
  /** Per-instance orientation in the tabbed layout. Kept apart from
   *  orientationOverride so a rotate on a phone never re-shapes a desktop panel. */
  tabbedOrientation?: Orientation;
  /** The orientation the current viewInstance was built with. */
  renderedOrientation: Orientation;
  /** Last title shown in the chrome, so a strategy switch can carry it over. */
  title: string;
  zoomActive?: boolean;
  viewInstance: View;
  contentEl: HTMLElement;
  chrome: PanelChrome;
  _unlistens: Array<() => void>;
}

export class PanelHost {
  private instances = new Map<string, PanelRecord>();
  private nextInstanceId = 1;
  public appSettings: AppSettings;
  private screenConfigManager: ScreenConfigManager;
  private linkManager: LinkManager | null = null;
  private sinks = new Map<string, SignalSink>();

  private floatingLayout: FloatingLayout;
  private tabbedLayout: TabbedLayout;
  private currentStrategy: LayoutStrategy;
  private _mql: MediaQueryList;
  private _resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  /** Set by the page so the grid background + drag-snap can re-sync to the live
   *  (fit-aware) cell size after a load / resize / tidy. */
  private _onGeometryChanged: () => void = () => {};
  /** Monotonic counter bumped each time a layout pass finishes applying geometry
   *  (resize relayout, restore, tidy, strategy switch). Observability only — the
   *  test bridge polls it to await layout stability instead of sleeping past the
   *  resize debounces. Never read by app logic. */
  private _layoutEpoch = 0;

  /** True while restoreViewsFromState is rebuilding panels. Saves are held back
   *  until it finishes: a save mid-restore would persist a half-built state (links
   *  are only registered once every panel exists). */
  private _restoring = false;
  /** Last-known layout data for the strategy that is NOT live, kept so a save
   *  while tabbed still carries the floating geometry (and vice versa). */
  private _dormantLayout: LayoutData = {};
  /** Saved instances that are not instantiated in the tabbed layout (the broadcast
   *  source). They stay in the persisted payload and come back when floating. */
  private _dormantInstances = new Map<string, PersistedEntry>();
  /** Saved links that touch a dormant instance. */
  private _dormantLinks: LinkRecord[] = [];
  private _openSettings: () => void = () => {};
  private _startTour: () => void = () => {};

  constructor(
    appSettings: AppSettings,
    screenConfigManager: ScreenConfigManager,
  ) {
    this.appSettings = appSettings;
    this.screenConfigManager = screenConfigManager;

    this.floatingLayout = new FloatingLayout(
      () => this.saveState(),
      () => {
        this._layoutEpoch++;
        this._onGeometryChanged();
      },
    );
    this.tabbedLayout = new TabbedLayout({
      spawn: (viewId) => this.spawnView(viewId),
      openSettings: () => this._openSettings(),
      startTour: () => this._startTour(),
      closeAll: () => this.closeAllViews(),
      starterLayouts: () => [
        { key: MOBILE_STARTER_KEY, label: "Mobile starter" },
        ...DEFAULT_CONFIG_OPTIONS.filter((o) => o.key !== "empty"),
      ],
      loadStarterLayout: (key) => this.loadNamedLayout(`default:${key}`),
      instrument: () =>
        (this.appSettings.instrumentSettings as any)?.instrument ?? "",
      pairLink: (leftId, rightId) => this._pairLink(leftId, rightId),
      togglePairLink: (leftId, rightId) => this._togglePairLink(leftId, rightId),
      incomingLinks: (instanceId) =>
        (this.linkManager?.getLinks() ?? [])
          .filter((l) => l.targetInstanceId === instanceId)
          .map((l) => l.sourceInstanceId),
      unlink: (sourceId, targetId) => {
        this.linkManager?.removeLinkBetween(sourceId, targetId);
        this.saveState();
      },
      // A reorder only changes tab order. Links are never pruned to fit it: the tab
      // bar shows links between non-adjacent tabs as a badge instead.
      orderChanged: () => this.saveState(),
    });

    const area = document.getElementById(FLOATING_VIEW_AREA_ID);
    if (!area) {
      console.error(`PanelHost: #${FLOATING_VIEW_AREA_ID} not found`);
    }

    this._mql = window.matchMedia(TABBED_MEDIA_QUERY);
    const isMobile = this._mql.matches;
    this.currentStrategy = isMobile ? this.tabbedLayout : this.floatingLayout;
    this._stampLayoutKind();
    if (area) this.currentStrategy.mount(area);

    this._mql.addEventListener("change", this._syncStrategyToViewport);

    window.addEventListener("resize", () => {
      if (this._resizeDebounceTimer !== null)
        clearTimeout(this._resizeDebounceTimer);
      this._resizeDebounceTimer = setTimeout(() => {
        this._resizeDebounceTimer = null;
        // Belt and braces: the media-query change event is the primary trigger, but
        // the resize path re-checks so the strategy can never disagree with the viewport.
        this._syncStrategyToViewport();
        // A phone turned on its side stays tabbed but flips portrait ↔ landscape.
        this._syncRenderedOrientations();
        this.currentStrategy.handleResize?.();
        this._layoutEpoch++;
      }, 100);
    });
  }

  private _syncStrategyToViewport = (): void => {
    const area = document.getElementById(FLOATING_VIEW_AREA_ID);
    if (!area) return;
    const newStrategy = this._mql.matches ? this.tabbedLayout : this.floatingLayout;
    if (newStrategy === this.currentStrategy) return;
    this._switchStrategy(area, newStrategy);
  };

  /** Publish the live strategy on <html data-layout> — the stylesheets key off this
   *  instead of repeating the media query, so JS and CSS cannot disagree. */
  private _stampLayoutKind(): void {
    document.documentElement.dataset.layout = this.currentStrategy.kind;
  }

  private _switchStrategy(
    area: HTMLElement,
    newStrategy: LayoutStrategy,
  ): void {
    // Fold the outgoing strategy's layout into the dormant data before dismantling
    // its chromes; from here on it describes both strategies.
    this._dormantLayout = mergeLayoutData(
      this._dormantLayout,
      this.currentStrategy.serializeLayout(),
      this._persistedInstanceIds(),
    );

    // Release all chromes and collect freed contentEls
    for (const record of this.instances.values()) {
      record.contentEl = record.chrome.destroy();
    }

    this.currentStrategy.unmount();
    this.currentStrategy = newStrategy;
    this._stampLayoutKind();
    newStrategy.mount(area);

    const toFloating = newStrategy === this.floatingLayout;

    // Going floating: every panel returns to its saved grid rect (panels opened
    // while tabbed have none and are placed below the rest).
    const dormantEntries = toFloating ? [...this._dormantInstances.values()] : [];
    const canonical = toFloating
      ? this._resolveCanonicalRects(
          [...this.instances.values(), ...dormantEntries],
          this._dormantLayout.floating?.perInstance ?? {},
        )
      : {};
    const g = this.floatingLayout.currentGeometry();

    // Sort by saved zIndex so floating z-order is preserved
    const sorted = [...this.instances.values()].sort(
      (a, b) =>
        (canonical[a.instanceId]?.zIndex ?? 100) -
        (canonical[b.instanceId]?.zIndex ?? 100),
    );

    for (const record of sorted) {
      const rect = canonical[record.instanceId];
      record.chrome = newStrategy.createChrome(
        this._chromeInfoFor(record, rect ? this._placementFor(rect, g) : undefined),
      );
      this.linkManager?.registerInstanceEl(record.instanceId, record.contentEl);
      if (record.chrome.wrapperEl) {
        this.linkManager?.onWindowSpawned(
          record.instanceId,
          record.chrome.wrapperEl,
        );
      } else {
        this.linkManager?.refreshForInstance(record.instanceId);
      }
    }

    // Panels held back while tabbed (the broadcast source) come back with their links.
    if (toFloating && dormantEntries.length) {
      const dormantLinks = this._dormantLinks;
      this._dormantInstances.clear();
      this._dormantLinks = [];
      for (const entry of dormantEntries) {
        const rect = canonical[entry.instanceId];
        this._createPanel(entry.instanceId, entry.viewId as ViewId, entry.viewState, {
          ...(rect ? this._placementFor(rect, g) : {}),
          collapsed: entry.collapsed,
          orientationOverride: entry.orientationOverride,
          tabbedOrientation: entry.tabbedOrientation,
          zoomActive: entry.zoomActive,
        });
      }
      for (const l of dormantLinks) {
        this.linkManager?.createLink(
          l.sourceInstanceId,
          l.sourceHandle,
          l.targetInstanceId,
          l.targetHandle,
        );
      }
    }

    if (toFloating) {
      const rectsOnly: Record<string, PlacedRect> = {};
      for (const [id, r] of Object.entries(canonical)) {
        if (this.instances.has(id)) {
          rectsOnly[id] = { col: r.col, row: r.row, colSpan: r.colSpan, rowSpan: r.rowSpan };
        }
      }
      this.floatingLayout.applyRects(rectsOnly);
    }

    newStrategy.applyLayoutData(this._dormantLayout);

    // The two strategies orient fretboards differently (global setting vs. the
    // viewport's long axis), so views built for the old one may need a rebuild.
    this._syncRenderedOrientations();

    // Fire resize on each contentEl so canvases redraw at new dimensions. The tabbed
    // layout sizes its own panels (hidden tabs have no box to measure here).
    if (toFloating) {
      for (const record of this.instances.values()) {
        requestAnimationFrame(() => {
          emitEvent(
            record.contentEl,
            "wrapper-user-resized",
            {
              width: record.contentEl.clientWidth,
              height: record.contentEl.clientHeight,
            },
            { bubbles: false },
          );
        });
      }
    }

    this.saveState();
    this._layoutEpoch++;
  }

  /** Everything the layout strategy needs to build a panel's chrome. Shared by the
   *  spawn/restore path and the strategy switch so the two can't drift apart. */
  private _chromeInfoFor(
    p: Pick<
      PanelRecord,
      | "instanceId"
      | "viewId"
      | "viewState"
      | "title"
      | "contentEl"
      | "collapsed"
      | "zoomActive"
      | "orientationOverride"
      | "tabbedOrientation"
    >,
    placement?: {
      position?: { x: number; y: number };
      size?: { width: number; height: number };
      zIndex?: number;
    },
  ): PanelSpawnInfo {
    const desc = getFloatingViewDescriptor(p.viewId);
    // For legacy configurable_instrument_feature entries, resolve the icon from the
    // feature-specific viewId descriptor so the tab shows the right icon.
    let icon = desc?.icon ?? getViewIcon(p.viewId);
    if (p.viewId === CORE_VIEW_IDS.ConfigurableFeature) {
      const featureTypeName = (p.viewState as any)?.featureTypeName;
      if (featureTypeName) icon = getViewIconByFeatureType(featureTypeName) ?? icon;
    }
    const fretboard = !!desc && isFretboardDescriptor(desc) ? desc : undefined;
    const supportsRotate = !!fretboard?.supportsRotate;
    const supportsZoom = !!fretboard?.supportsZoom;
    return {
      instanceId: p.instanceId,
      title: p.title,
      icon,
      contentEl: p.contentEl,
      collapsed: p.collapsed,
      zoomActive: p.zoomActive,
      sizing: resolveSizing(desc, this._effectiveOrientation(p)),
      supportsRotate,
      supportsZoom,
      supportsConfigToggle: desc?.supportsConfigToggle,
      position: placement?.position,
      size: placement?.size,
      zIndex: placement?.zIndex,
      onRotate: supportsRotate
        ? () => this._handleRotateRequest(p.instanceId)
        : undefined,
      onZoom: supportsZoom
        ? () => this._handleZoomRequest(p.instanceId)
        : undefined,
      onClose: (id) => this.destroyView(id),
    };
  }

  /** px placement for a canonical grid rect. Position is only lower-bounded (no upper
   *  clamp — the fit cell keeps it on-screen, and clamping a tall panel upward is what
   *  used to cause overlaps). Size derives from the span; CSS min/max does the rest. */
  private _placementFor(
    rect: PlacedRect & { zIndex?: number },
    g: GridGeometry,
  ): {
    position: { x: number; y: number };
    size: { width: number; height: number };
    zIndex?: number;
  } {
    return {
      position: {
        x: Math.max(g.originX, colToPx(rect.col, g)),
        y: Math.max(0, rowToPx(rect.row, g)),
      },
      size: { width: rect.colSpan * g.cell, height: rect.rowSpan * g.cell },
      zIndex: rect.zIndex,
    };
  }

  // --- Public API ---

  /** Which layout strategy is live. Mirrors the 768px matchMedia breakpoint. */
  public getStrategyKind(): "floating" | "tabbed" {
    return this.currentStrategy === this.tabbedLayout ? "tabbed" : "floating";
  }

  /** Tab order, active tab and the tabs on screen (two on a tablet) when the tabbed
   *  (mobile) strategy is live; null on desktop. */
  public getTabbedState(): {
    order: string[];
    activeId: string | null;
    visible: string[];
  } | null {
    if (this.currentStrategy !== this.tabbedLayout) return null;
    return {
      order: this.tabbedLayout.getOrder(),
      activeId: this.tabbedLayout.getActiveId(),
      visible: this.tabbedLayout.getVisibleIds(),
    };
  }

  /** Activate a tab by instanceId (tabbed strategy only; no-op on desktop). */
  public activateTab(instanceId: string): void {
    if (this.currentStrategy !== this.tabbedLayout) return;
    if (!this.instances.has(instanceId)) return;
    this.tabbedLayout.focus(instanceId);
  }

  /** See _layoutEpoch — test-bridge observability, not app state. */
  public getLayoutEpoch(): number {
    return this._layoutEpoch;
  }

  public setLinkManager(lm: LinkManager): void {
    this.linkManager = lm;
  }
  public getLinkManager(): LinkManager | null {
    return this.linkManager;
  }

  /** Live fit-aware grid geometry (cell size + content origin). The page uses this to
   *  paint the grid background and configure drag-snap at the same scale as the panels. */
  public getGridGeometry(): GridGeometry {
    return this.floatingLayout.currentGeometry();
  }

  /** Register a callback invoked whenever the live cell size may have changed
   *  (load / resize / tidy), so the grid background + drag-snap stay in sync. */
  public setGeometryChangedCallback(cb: () => void): void {
    this._onGeometryChanged = cb;
  }

  /** Link state between two adjacent tabs, in either direction. */
  private _pairLink(leftId: string, rightId: string): PairLink {
    const lm = this.linkManager;
    if (!lm) return { state: "incompatible" };
    return pairLinkState(
      leftId,
      rightId,
      (s, t) => lm.hasLink(s, t),
      (s, t) => lm.canLink(s, t),
    );
  }

  /** Link or unlink two adjacent tabs; returns the resulting state. */
  private _togglePairLink(leftId: string, rightId: string): PairLink {
    const lm = this.linkManager;
    const before = this._pairLink(leftId, rightId);
    if (!lm || !before.sourceId || !before.targetId) return before;
    if (before.state === "linked") {
      lm.removeLinkBetween(before.sourceId, before.targetId);
    } else {
      // Handle sides only matter to the floating layout's arrows: leave the source
      // on the side facing the target.
      const sourceIsLeft = before.sourceId === leftId;
      lm.createLink(
        before.sourceId,
        sourceIsLeft ? "right" : "left",
        before.targetId,
        sourceIsLeft ? "left" : "right",
      );
    }
    this.saveState();
    return {
      state: before.state === "linked" ? "available" : "linked",
      sourceId: before.sourceId,
      targetId: before.targetId,
    };
  }

  /** Reorder the tabs (tabbed strategy only). Exposed for the test bridge — the
   *  long-press drag is too flaky to synthesize. */
  public reorderTabs(order: string[]): void {
    if (this.currentStrategy !== this.tabbedLayout) return;
    this.tabbedLayout.setOrder(order);
    this.saveState();
  }

  public setSettingsCallback(fn: () => void): void {
    this._openSettings = fn;
  }

  /** How the tabbed layout's menu (and its first-visit hint) start the tour. */
  public setTourCallback(fn: () => void): void {
    this._startTour = fn;
  }

  public registerSink(instanceId: string, sink: SignalSink): void {
    this.sinks.set(instanceId, sink);
    this.linkManager?.refreshForInstance(instanceId);
  }

  public getSink(instanceId: string): SignalSink | undefined {
    return this.sinks.get(instanceId);
  }

  public getWrapperElement(instanceId: string): HTMLElement | null {
    return this.instances.get(instanceId)?.chrome.wrapperEl ?? null;
  }

  public getContentElement(instanceId: string): HTMLElement | null {
    return this.instances.get(instanceId)?.contentEl ?? null;
  }

  public getViewId(instanceId: string): ViewId | null {
    return this.instances.get(instanceId)?.viewId ?? null;
  }

  /** Ids of all currently-open panel instances (snapshot — safe to mutate during iteration). */
  public getOpenInstanceIds(): string[] {
    return [...this.instances.keys()];
  }

  public getFeatureTypeName(instanceId: string): string | null {
    const record = this.instances.get(instanceId);
    if (!record) return null;
    if (record.viewId === CORE_VIEW_IDS.ConfigurableFeature) {
      return (record.viewState as any)?.featureTypeName ?? null;
    }
    const descriptor = getFloatingViewDescriptor(record.viewId);
    return (
      (record.viewState as any)?.featureTypeName ??
      descriptor?.featureTypeName ??
      getFeatureTypeNameByViewId(record.viewId)
    );
  }

  public spawnView(
    viewId: ViewId | string,
    options?: {
      viewState?: unknown;
      position?: { x: number; y: number };
      size?: { width: number; height: number };
      title?: string;
    },
  ): string | null {
    const descriptor = getFloatingViewDescriptor(viewId);
    if (!descriptor) {
      console.error(`PanelHost: Descriptor not found for "${viewId}"`);
      return null;
    }

    if (descriptor.singleton) {
      for (const [id, record] of this.instances) {
        if (record.viewId === (viewId as ViewId)) {
          this.currentStrategy.focus(id);
          return id;
        }
      }
    }

    const instanceId = `fv-${this.nextInstanceId++}`;
    return this._createPanel(instanceId, viewId as ViewId, options?.viewState, {
      position: options?.position,
      size: options?.size,
      title: options?.title,
    });
  }

  private _createPanel(
    instanceId: string,
    viewId: ViewId,
    viewState: unknown,
    options?: {
      position?: { x: number; y: number };
      size?: { width: number; height: number };
      title?: string;
      zIndex?: number;
      collapsed?: boolean;
      orientationOverride?: Orientation;
      tabbedOrientation?: Orientation;
      zoomActive?: boolean;
    },
  ): string | null {
    const descriptor = getFloatingViewDescriptor(viewId);
    if (!descriptor) return null;

    try {
      const zoomActive = options?.zoomActive ?? false;
      const orientation = this._effectiveOrientation({ ...options, viewId, viewState });
      const settings = this._buildOverriddenSettings(
        orientation,
        this._zoomMultiplierFor(orientation, zoomActive),
      );

      const viewInstance = descriptor.createView(viewState, settings);
      const contentEl = document.createElement("div");
      viewInstance.render(contentEl);

      const identity = {
        instanceId,
        viewId,
        viewState,
        title: options?.title ?? descriptor.displayName,
        contentEl,
        collapsed: options?.collapsed,
        zoomActive,
        orientationOverride: options?.orientationOverride,
        tabbedOrientation: options?.tabbedOrientation,
      };
      const chrome = this.currentStrategy.createChrome(
        this._chromeInfoFor(identity, options),
      );

      const unlistens: Array<() => void> = [];

      // Track viewState mutations for persistence
      unlistens.push(
        onEvent(contentEl, "feature-state-changed", (detail) => {
          record.viewState = {
            ...(record.viewState as Record<string, unknown>),
            ...detail,
          };
          this.saveState();
          // A setting can change how the panel should lie (Nearby Triads' display).
          // Not from inside the view's own event: it is the view that gets replaced.
          if (record.renderedOrientation !== this._effectiveOrientation(record)) {
            queueMicrotask(() => {
              if (this.instances.get(instanceId) === record) this._syncRenderedOrientations();
            });
          }
        }),
      );

      // Keep chrome title in sync. Goes through record.chrome, not the chrome made
      // above: a strategy switch replaces the chrome and this listener outlives it.
      unlistens.push(
        onEvent(contentEl, "feature-title-changed", (detail) => {
          if (!detail.title) return;
          record.title = detail.title;
          record.chrome.setTitle(detail.title);
        }),
      );

      const record: PanelRecord = {
        ...identity,
        renderedOrientation: orientation,
        viewInstance,
        chrome,
        _unlistens: unlistens,
      };
      this.instances.set(instanceId, record);

      if (typeof (viewInstance as any).receiveSignals === "function") {
        this.sinks.set(instanceId, viewInstance as unknown as SignalSink);
      }

      this.linkManager?.registerInstanceEl(instanceId, contentEl);
      if (chrome.wrapperEl) {
        this.linkManager?.onWindowSpawned(instanceId, chrome.wrapperEl);
      } else {
        this.linkManager?.refreshForInstance(instanceId);
      }

      if (this.currentStrategy === this.tabbedLayout) {
        this.tabbedLayout.refreshLinks();
      }

      this.saveState();
      return instanceId;
    } catch (e) {
      console.error(`PanelHost: Error creating view ${viewId}:`, e);
      return null;
    }
  }

  public destroyView(instanceId: string): void {
    const record = this.instances.get(instanceId);
    if (!record) return;

    this.linkManager?.onWindowDestroyed(instanceId);
    record._unlistens.forEach((u) => u());
    record.chrome.destroy();
    // Also purge the floating layout's per-instance bookkeeping, so a destroyed panel can't linger as a "ghost" rect.
    this.floatingLayout.forgetInstance(instanceId);

    try {
      record.viewInstance.destroy();
    } catch (e) {
      console.error(`PanelHost: Error destroying view ${instanceId}:`, e);
    }

    this.instances.delete(instanceId);
    this.sinks.delete(instanceId);
    this.saveState();
  }

  public closeAllViews(): void {
    [...this.instances.keys()].forEach((id) => this.destroyView(id));
  }

  /** Rebuild all panels from persisted state. `recomputeCell` is passed only by the
   *  initial page load — it refreshes the viewport-derived grid cell once the sidebar
   *  has rendered. Named-layout / import loads leave the grid size untouched. */
  public restoreViewsFromState(opts?: { recomputeCell?: boolean }): void {
    const area = document.getElementById(FLOATING_VIEW_AREA_ID);
    if (!area) return;

    const tabbed = this.currentStrategy === this.tabbedLayout;
    let saved = this._loadState();
    // First visit on a phone: open a small starter set instead of a blank screen.
    const firstRun = saved === null && tabbed;
    if (firstRun) saved = MOBILE_STARTER_LAYOUT;

    this._dormantLayout = saved?.layout ?? {};
    this._dormantInstances.clear();
    this._dormantLinks = [];

    if (!saved?.instances) {
      this.linkManager?.initialize([]);
      return;
    }

    this._restoring = true;
    try {
      this._restorePanels(area, saved, opts);
    } finally {
      this._restoring = false;
    }
    // One save, now that every panel exists and the links are registered.
    this.saveState();
    if (firstRun) {
      this.tabbedLayout.showHint("Tap + to add more tools · tap here for a tour", () =>
        this._startTour(),
      );
    }
  }

  private _restorePanels(
    area: HTMLElement,
    saved: CurrentPayload,
    opts?: { recomputeCell?: boolean },
  ): void {
    const floatingData = saved.layout?.floating;
    if (floatingData?.nextZIndex) {
      this.floatingLayout.currentMaxZIndex = Math.max(
        this.floatingLayout.currentMaxZIndex,
        floatingData.nextZIndex,
      );
    }

    const vpW = area.clientWidth || window.innerWidth;
    const vpH = area.clientHeight || window.innerHeight;
    const sidebarEl = document.querySelector(".side-bar-container");
    const sidebarWidth = sidebarEl
      ? sidebarEl.getBoundingClientRect().width
      : 0;
    // The grid cell is a fixed function of the viewport (the GRID_COLS × DESIGN_ROWS
    // design space scaled to fit) — identical for every layout, so loading a layout
    // never changes the grid size. Matches FloatingLayout's cached geometry.
    const g = fitGridGeometry(vpW, sidebarWidth, vpH, DESIGN_ROWS);

    // Resolve the canonical cell layout: reconcile the authored positions (preserve
    // each panel's column, push overlaps straight down), or shelf-pack instances that
    // lack saved geometry. The result is machine-independent (in grid cells).
    const savedPerInstance = floatingData?.perInstance ?? {};
    const instanceEntries = Object.values(saved.instances);
    const canonical = this._resolveCanonicalRects(
      instanceEntries,
      savedPerInstance,
    );

    // Sort by zIndex so floating z-stacking matches what was saved
    const sortedEntries = instanceEntries.sort((a, b) => {
      const aZ = canonical[a.instanceId]?.zIndex ?? 100;
      const bZ = canonical[b.instanceId]?.zIndex ?? 100;
      return aZ - bZ;
    });

    const tabbed = this.currentStrategy === this.tabbedLayout;
    const broadcastViewId = getBroadcastSourceViewId();

    for (const entry of sortedEntries) {
      // Reserve the id first: a skipped or dormant entry must still never collide
      // with an instance spawned later.
      const numericId = parseInt(entry.instanceId.replace("fv-", ""), 10);
      if (!isNaN(numericId))
        this.nextInstanceId = Math.max(this.nextInstanceId, numericId + 1);

      if (!getFloatingViewDescriptor(entry.viewId)) {
        console.warn(
          `PanelHost: Cannot restore view "${entry.viewId}" — descriptor not found`,
        );
        continue;
      }

      // Global Key (broadcast source) has no tab on mobile. It is held dormant, not
      // dropped: it stays in the saved state and returns when the layout is floating.
      if (tabbed && broadcastViewId && entry.viewId === broadcastViewId) {
        this._dormantInstances.set(entry.instanceId, entry);
        continue;
      }

      try {
        const rect = canonical[entry.instanceId];
        this._createPanel(
          entry.instanceId,
          entry.viewId as ViewId,
          entry.viewState,
          {
            ...(rect ? this._placementFor(rect, g) : {}),
            collapsed: entry.collapsed,
            orientationOverride: entry.orientationOverride,
            tabbedOrientation: entry.tabbedOrientation,
            zoomActive: entry.zoomActive,
          },
        );
      } catch (e) {
        console.error(`PanelHost: Error restoring ${entry.instanceId}:`, e);
      }
    }

    const savedLinks = saved.links ?? [];
    const touchesDormant = (l: LinkRecord) =>
      this._dormantInstances.has(l.sourceInstanceId) ||
      this._dormantInstances.has(l.targetInstanceId);
    this._dormantLinks = savedLinks.filter(touchesDormant);

    // Finalize: set the canonical rects authoritatively and re-render at the fit cell
    // (floating only — tabbed ignores geometry).
    if (this.currentStrategy === this.floatingLayout) {
      const rectsOnly: Record<
        string,
        { col: number; row: number; colSpan: number; rowSpan: number }
      > = {};
      for (const [id, r] of Object.entries(canonical)) {
        if (this.instances.has(id))
          rectsOnly[id] = {
            col: r.col,
            row: r.row,
            colSpan: r.colSpan,
            rowSpan: r.rowSpan,
          };
      }
      // Only the initial page load refreshes the cell (once the sidebar has rendered);
      // named-layout / import loads keep the current viewport-derived grid size.
      this.floatingLayout.applyRects(rectsOnly, {
        recomputeCell: opts?.recomputeCell,
      });
    }

    this.currentStrategy.applyLayoutData(saved.layout);
    this.linkManager?.initialize(savedLinks.filter((l) => !touchesDormant(l)));
    if (tabbed) this.tabbedLayout.refreshLinks();
  }

  /** Resolve saved per-instance geometry into canonical cell rects (with zIndex).
   *  Instances with saved geometry keep their authored position; instances without
   *  (e.g. opened while the layout was tabbed) are shelf-packed below them. The
   *  whole set is then reconciled (preserve-X push-down) so nothing overlaps.
   *  Spans come straight from the descriptor's grid footprint (already in cells) for
   *  instances that lack a saved span. */
  private _resolveCanonicalRects(
    entries: Array<{
      instanceId: string;
      viewId: string;
      orientationOverride?: Orientation;
    }>,
    saved: Record<
      string,
      {
        col: number;
        row: number;
        colSpan?: number;
        rowSpan?: number;
        zIndex: number;
      }
    >,
  ): Record<string, PlacedRect & { zIndex: number }> {
    const spanFor = (entry: (typeof entries)[number]) => {
      const geom = saved[entry.instanceId];
      // Floating footprint, whichever strategy is live: these rects are floating geometry.
      const sz = resolveSizing(
        getFloatingViewDescriptor(entry.viewId),
        entry.orientationOverride ?? this._globalOrientation(),
      );
      return {
        colSpan: geom?.colSpan ?? sz?.default.cols ?? 20,
        rowSpan: geom?.rowSpan ?? sz?.default.rows ?? 12,
      };
    };

    const placed: ReconcileItem[] = [];
    const unplaced: Array<{ id: string; colSpan: number; rowSpan: number }> = [];
    for (const e of entries) {
      const geom = saved[e.instanceId];
      if (geom) placed.push({ id: e.instanceId, col: geom.col, row: geom.row, ...spanFor(e) });
      else unplaced.push({ id: e.instanceId, ...spanFor(e) });
    }

    if (unplaced.length) {
      const packed = packShelves(unplaced, GRID_COLS);
      const below = placed.length ? layoutBottomRow(placed) + 1 : 0;
      for (const it of unplaced) {
        const pos = packed[it.id] ?? { col: 0, row: 0 };
        placed.push({ ...it, col: pos.col, row: pos.row + below });
      }
    }

    // A fully shelf-packed set is already overlap-free; reconciling it would only
    // re-apply the border offset the authored layouts already carry.
    const resolved: Record<string, PlacedRect> =
      unplaced.length === entries.length
        ? Object.fromEntries(placed.map((p) => [p.id, p]))
        : reconcileLayout(placed);

    const out: Record<string, PlacedRect & { zIndex: number }> = {};
    for (const e of entries) {
      const r = resolved[e.instanceId];
      if (r) {
        out[e.instanceId] = {
          col: r.col,
          row: r.row,
          colSpan: r.colSpan,
          rowSpan: r.rowSpan,
          zIndex: saved[e.instanceId]?.zIndex ?? 100,
        };
      }
    }
    return out;
  }

  // --- Rotate / Zoom ---

  private _handleRotateRequest(instanceId: string): void {
    const record = this.instances.get(instanceId);
    const descriptor = getFloatingViewDescriptor(record?.viewId ?? "");
    if (!record || !descriptor) return;

    const rotated: Orientation =
      this._effectiveOrientation(record) === "vertical" ? "horizontal" : "vertical";
    // Each strategy keeps its own per-instance orientation.
    if (this.currentStrategy === this.tabbedLayout) record.tabbedOrientation = rotated;
    else record.orientationOverride = rotated;

    // Re-apply size constraints for the new orientation (CSS min/max) before the view
    // re-renders and auto-sizes into them.
    record.chrome.setSizeConstraints?.(resolveSizing(descriptor, rotated));

    this._rebuildView(record, descriptor, true);
    this.saveState();
  }

  /** Re-create a panel's view at its current effective orientation and zoom. */
  private _rebuildView(
    record: PanelRecord,
    descriptor: FloatingViewDescriptor,
    forceAutoSize: boolean,
  ): void {
    const orientation = this._effectiveOrientation(record);
    const zm = this._zoomMultiplierFor(orientation, record.zoomActive ?? false);
    record.renderedOrientation = orientation;
    this._recreateViewInPlace(
      record,
      descriptor,
      this._buildOverriddenSettings(orientation, zm),
      forceAutoSize,
    );
  }

  /** Rebuild any orientation-sensitive view whose effective orientation no longer
   *  matches what it was built with — after a strategy switch, or when a phone is
   *  turned (the tabbed layout follows the viewport's long axis). */
  private _syncRenderedOrientations(): void {
    for (const record of this.instances.values()) {
      if (NEVER_RECREATE_VIEW_IDS.has(record.viewId)) continue;
      const descriptor = getFloatingViewDescriptor(record.viewId);
      if (!descriptor?.refreshOnInstrumentChange) continue;
      if (record.renderedOrientation === this._effectiveOrientation(record)) continue;
      // Re-render only. The panel's floating footprint is NOT re-fitted: within the
      // floating layout its orientation never changed (only the tabbed layout follows
      // the viewport), so its authored size and position must survive the round trip.
      this._rebuildView(record, descriptor, false);
    }
  }

  private _handleZoomRequest(instanceId: string): void {
    const record = this.instances.get(instanceId);
    const descriptor = getFloatingViewDescriptor(record?.viewId ?? "");
    if (!record || !descriptor) return;

    record.zoomActive = !record.zoomActive;
    this._rebuildView(record, descriptor, true);
    record.chrome.setZoomActive(record.zoomActive);
    this.saveState();
  }

  private _recreateViewInPlace(
    record: PanelRecord,
    descriptor: FloatingViewDescriptor,
    settings: AppSettings,
    forceAutoSize: boolean,
  ): void {
    try {
      record.viewInstance.destroy();
      const newView = descriptor.createView(record.viewState, settings);
      record.contentEl.innerHTML = "";
      newView.render(record.contentEl);
      record.viewInstance = newView;

      if (typeof (newView as any).receiveSignals === "function") {
        this.sinks.set(record.instanceId, newView as unknown as SignalSink);
      } else {
        this.sinks.delete(record.instanceId);
      }

      record.chrome.notifyContentReplaced(forceAutoSize);
      this.linkManager?.refreshForInstance(record.instanceId);
    } catch (e) {
      console.error(
        `PanelHost: Error recreating view ${record.instanceId}:`,
        e,
      );
    }
  }

  // --- Settings ---

  public applySettingsChange(newSettings: AppSettings): void {
    const oldOrientation: "vertical" | "horizontal" =
      (this.appSettings.instrumentSettings as any)?.orientation ?? "vertical";
    const oldInstrument = (this.appSettings.instrumentSettings as any)?.instrument;
    const guitarSettingsChanged =
      JSON.stringify(this.appSettings.instrumentSettings) !==
      JSON.stringify(newSettings.instrumentSettings);
    const themeChanged = this.appSettings.theme !== newSettings.theme;
    this.appSettings = newSettings;

    if (!guitarSettingsChanged && !themeChanged) return;

    const newOrientation: "vertical" | "horizontal" =
      (newSettings.instrumentSettings as any)?.orientation ?? "vertical";
    const orientationChanged = oldOrientation !== newOrientation;
    // Only an instrument swap (different string count → different fretboard dimensions)
    // changes a panel's intrinsic content footprint. Handedness, tuning, colour scheme
    // and label display are pure repaints at the same size — re-render in place without
    // re-fitting, so they don't snap panels off their authored layout spans.
    const instrumentChanged =
      oldInstrument !== (newSettings.instrumentSettings as any)?.instrument;

    for (const record of this.instances.values()) {
      if (NEVER_RECREATE_VIEW_IDS.has(record.viewId)) continue;
      const descriptor = getFloatingViewDescriptor(record.viewId);
      if (!descriptor?.refreshOnInstrumentChange) continue;

      const effectiveOrientation = this._effectiveOrientation(record);
      // A global orientation flip changes the effective footprint of fretboard panels
      // that follow the global setting (no per-instance override) — adopt the new
      // orientation's size so the panel isn't left at the previous orientation's
      // dimensions. (The rotate button drives this directly via setSizeConstraints.)
      // The tabbed layout ignores the global setting, so nothing flips there.
      const orientationFlipped =
        orientationChanged && effectiveOrientation !== record.renderedOrientation;
      if (orientationFlipped && isFretboardDescriptor(descriptor)) {
        record.chrome.setSizeConstraints?.(
          resolveSizing(descriptor, effectiveOrientation),
        );
      }

      // Re-fit to content only when the panel's intrinsic footprint actually changed
      // (instrument swap or an effective-orientation flip). Otherwise keep the panel at
      // its current authored size — a pure repaint, e.g. a handedness mirror.
      this._rebuildView(record, descriptor, instrumentChanged || orientationFlipped);
    }

    this.saveState();
  }

  // --- Import / Export / Named Layouts ---

  public exportStateJson(): string {
    const payload: CurrentPayload = this._buildPayload();
    if (this.appSettings.customTunings)
      payload.customTunings = this.appSettings.customTunings;
    return this.screenConfigManager.exportJson(payload);
  }

  public importStateJson(
    json: string,
    onCustomTuningsImported?: (ct: AppSettings["customTunings"]) => void,
  ): void {
    const migrated = this.screenConfigManager.importJson(json);
    if (!migrated) {
      console.error("PanelHost: importStateJson failed");
      return;
    }

    [...this.instances.keys()].forEach((id) => this.destroyView(id));
    this.nextInstanceId = 1;

    if (migrated.customTunings && onCustomTuningsImported) {
      onCustomTuningsImported(
        migrated.customTunings as AppSettings["customTunings"],
      );
    }

    this.screenConfigManager.saveAutoSave(migrated);
    this.restoreViewsFromState();
  }

  public loadNamedLayout(name: string): void {
    const payload = this.screenConfigManager.loadNamed(name);
    if (!payload) {
      console.error(`PanelHost: no layout found for "${name}"`);
      return;
    }

    [...this.instances.keys()].forEach((id) => this.destroyView(id));
    this.nextInstanceId = 1;

    this.screenConfigManager.saveAutoSave(payload);
    // restoreViewsFromState reconciles (preserve-X push-down) + fits to the viewport.
    this.restoreViewsFromState();
  }

  /** Tidy the open floating panels: remove overlaps, leave a border + gaps, and pull
   *  the arrangement to the top-left — preserving the current layout (never resizes or
   *  scatters). Overlaps are cleared by sliding panels DOWN or RIGHT, whichever is the
   *  smaller move and fits, so horizontal space is used instead of stacking everything
   *  vertically. No-op in tabbed mode. Reads each panel's ACTUAL rendered footprint so
   *  it reflects what's on screen. */
  public cleanupLayout(opts?: { animate?: boolean }): void {
    if (this.currentStrategy !== this.floatingLayout) return;

    // Seed from the live DOM footprints, not stale spans.
    this.floatingLayout.syncRectsFromDom();
    const rects = this.floatingLayout.getPanelRects();

    const items: ReconcileItem[] = [];
    for (const [id, rect] of rects) {
      items.push({
        id,
        col: rect.col,
        row: rect.row,
        colSpan: rect.colSpan,
        rowSpan: rect.rowSpan,
      });
    }

    const tidied = tidyLayout(items);
    this.floatingLayout.applyRects(tidied, {
      animate: opts?.animate ?? true,
      linkManager: this.linkManager,
    });
    this.saveState();
  }

  // --- Persistence helpers ---

  private _buildPayload(): CurrentPayload {
    const instances: CurrentPayload["instances"] = {};
    for (const [id, record] of this.instances) {
      instances[id] = {
        instanceId: id,
        viewId: record.viewId,
        viewState: record.viewState,
        collapsed: record.collapsed,
        orientationOverride: record.orientationOverride,
        tabbedOrientation: record.tabbedOrientation,
        zoomActive: record.zoomActive,
      };
    }
    for (const [id, entry] of this._dormantInstances) instances[id] = entry;
    return {
      instances,
      links: [...(this.linkManager?.getLinks() ?? []), ...this._dormantLinks],
      // Both strategies' layout data, so neither is lost while the other is live.
      layout: mergeLayoutData(
        this._dormantLayout,
        this.currentStrategy.serializeLayout(),
        new Set(Object.keys(instances)),
      ),
    };
  }

  /** Ids of every instance in the persisted state: open panels plus dormant ones. */
  private _persistedInstanceIds(): Set<string> {
    return new Set([...this.instances.keys(), ...this._dormantInstances.keys()]);
  }

  private saveState(): void {
    if (this._restoring) return;
    this.screenConfigManager.saveAutoSave(this._buildPayload());
  }

  private _loadState(): CurrentPayload | null {
    return this.screenConfigManager.loadAutoSave();
  }

  // --- Shared math ---

  private _globalOrientation(): Orientation {
    return (this.appSettings.instrumentSettings as any)?.orientation ?? "vertical";
  }

  /** The orientation a panel renders at. Floating: its per-instance override, else
   *  the global setting. Tabbed: its per-instance choice, else what suits the screen
   *  it fills (tabbedDefaultOrientation) — a portrait phone gets a vertical fretboard
   *  whatever the (desktop-oriented) global setting says. */
  private _effectiveOrientation(panel: {
    viewId: string;
    viewState?: unknown;
    orientationOverride?: Orientation;
    tabbedOrientation?: Orientation;
  }): Orientation {
    if (this.currentStrategy === this.tabbedLayout) {
      if (panel.tabbedOrientation) return panel.tabbedOrientation;
      const desc = getFloatingViewDescriptor(panel.viewId);
      const flag = !!desc && isFretboardDescriptor(desc) ? desc.multiBoard : false;
      const multiBoard = typeof flag === 'function' ? flag(panel.viewState) : !!flag;
      // Against the pane it fills — half the screen where a tablet shows two.
      const pane = tabbedPaneSize(window.innerWidth, window.innerHeight);
      return tabbedDefaultOrientation(pane.width, pane.height, multiBoard);
    }
    return panel.orientationOverride ?? this._globalOrientation();
  }

  private _zoomMultiplierFor(
    orientation: "vertical" | "horizontal",
    zoomActive: boolean,
  ): number {
    if (!zoomActive) return 1.0;
    return orientation === "horizontal" ? 2.0 : 1.25;
  }

  /** App settings as one panel sees them: its effective orientation and zoom. */
  private _buildOverriddenSettings(
    orientation: Orientation,
    zoomMultiplier: number,
  ): AppSettings {
    return {
      ...this.appSettings,
      instrumentSettings: {
        ...this.appSettings.instrumentSettings,
        orientation,
        zoomMultiplier,
      },
    };
  }
}
