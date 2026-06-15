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
import { resolveSizing, PanelSizing, Orientation } from "./panel_sizing";
import { onEvent, emitEvent } from "../core/events";
import { ScreenConfigManager } from "../screen_config/screen_config_manager";
import {
  CurrentPayload,
  V4Payload,
} from "../screen_config/screen_config_types";
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
  ReconcileItem,
  PlacedRect,
} from "./layout/grid_packer";
import { FloatingLayout } from "./layout/floating_layout";
import { TabbedLayout } from "./layout/tabbed_layout";
import type { LayoutStrategy, PanelChrome } from "./layout/layout_strategy";

const FLOATING_VIEW_AREA_ID = "floating-view-area";
const MOBILE_BREAKPOINT = "(max-width: 768px)";

// Retain FloatingViewManager as an alias so existing imports keep working.
export { PanelHost as FloatingViewManager };

interface PanelRecord {
  instanceId: string;
  viewId: ViewId;
  viewState?: unknown;
  collapsed?: boolean;
  orientationOverride?: "vertical" | "horizontal";
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

  constructor(
    appSettings: AppSettings,
    screenConfigManager: ScreenConfigManager,
  ) {
    this.appSettings = appSettings;
    this.screenConfigManager = screenConfigManager;

    this.floatingLayout = new FloatingLayout(
      () => this.saveState(),
      () => this._onGeometryChanged(),
    );
    this.tabbedLayout = new TabbedLayout(
      (viewId) => this.spawnView(viewId),
      (i) => this.toggleTabbedLink(i),
      (i) => this.tabbedPairState(i),
      (newOrder) => {
        if (this.linkManager) {
          for (const link of [...this.linkManager.getLinks()]) {
            const si = newOrder.indexOf(link.sourceInstanceId);
            const ti = newOrder.indexOf(link.targetInstanceId);
            if (si === -1 || ti === -1 || ti !== si + 1) {
              this.linkManager.removeLinkBetween(
                link.sourceInstanceId,
                link.targetInstanceId,
              );
            }
          }
        }
        this.saveState();
      },
    );

    const area = document.getElementById(FLOATING_VIEW_AREA_ID);
    if (!area) {
      console.error(`PanelHost: #${FLOATING_VIEW_AREA_ID} not found`);
    }

    this._mql = window.matchMedia(MOBILE_BREAKPOINT);
    const isMobile = this._mql.matches;
    this.currentStrategy = isMobile ? this.tabbedLayout : this.floatingLayout;
    if (area) this.currentStrategy.mount(area);

    this._mql.addEventListener("change", this._onBreakpointChange);

    window.addEventListener("resize", () => {
      if (this._resizeDebounceTimer !== null)
        clearTimeout(this._resizeDebounceTimer);
      this._resizeDebounceTimer = setTimeout(() => {
        this._resizeDebounceTimer = null;
        this.currentStrategy.handleResize?.();
      }, 100);
    });
  }

  private _onBreakpointChange = (e: MediaQueryListEvent): void => {
    const area = document.getElementById(FLOATING_VIEW_AREA_ID);
    if (!area) return;
    const newStrategy = e.matches ? this.tabbedLayout : this.floatingLayout;
    if (newStrategy === this.currentStrategy) return;
    this._switchStrategy(area, newStrategy);
  };

  private _switchStrategy(
    area: HTMLElement,
    newStrategy: LayoutStrategy,
  ): void {
    // Capture layout state before dismantling chromes
    const savedLayout = this.currentStrategy.serializeLayout();

    // Release all chromes and collect freed contentEls
    for (const record of this.instances.values()) {
      record.contentEl = record.chrome.destroy();
    }

    this.currentStrategy.unmount();
    this.currentStrategy = newStrategy;
    newStrategy.mount(area);

    // Sort by saved zIndex so floating z-order is preserved
    const sorted = [...this.instances.values()].sort((a, b) => {
      const aZ = savedLayout.floating?.perInstance[a.instanceId]?.zIndex ?? 100;
      const bZ = savedLayout.floating?.perInstance[b.instanceId]?.zIndex ?? 100;
      return aZ - bZ;
    });

    for (const record of sorted) {
      const desc = getFloatingViewDescriptor(record.viewId);
      let switchIcon = desc?.icon ?? getViewIcon(record.viewId);
      if (record.viewId === CORE_VIEW_IDS.ConfigurableFeature) {
        const featureTypeName = (record.viewState as any)?.featureTypeName;
        if (featureTypeName)
          switchIcon = getViewIconByFeatureType(featureTypeName) ?? switchIcon;
      }
      const switchSizing = resolveSizing(
        desc,
        this._effectiveOrientation(record.orientationOverride),
      );
      record.chrome = newStrategy.createChrome({
        instanceId: record.instanceId,
        title: desc?.displayName ?? record.viewId,
        icon: switchIcon,
        contentEl: record.contentEl,
        collapsed: record.collapsed,
        zoomActive: record.zoomActive,
        sizing: switchSizing,
        supportsRotate:
          !!desc && isFretboardDescriptor(desc) && desc.supportsRotate,
        supportsZoom:
          !!desc && isFretboardDescriptor(desc) && desc.supportsZoom,
        supportsConfigToggle: desc?.supportsConfigToggle,
        onRotate:
          !!desc && isFretboardDescriptor(desc) && desc.supportsRotate
            ? () => this._handleRotateRequest(record.instanceId)
            : undefined,
        onZoom:
          !!desc && isFretboardDescriptor(desc) && desc.supportsZoom
            ? () => this._handleZoomRequest(record.instanceId)
            : undefined,
        onClose: (id) => this.destroyView(id),
      });
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

    newStrategy.applyLayoutData(savedLayout);

    // Fire resize on each contentEl so canvases redraw at new dimensions
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

    this.saveState();
  }

  // --- Public API ---

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

  /** Toggle a link between tab[i] and tab[i+1]. */
  public toggleTabbedLink(i: number): void {
    if (!this.linkManager) return;
    const order = this.tabbedLayout.getOrder();
    if (i < 0 || i >= order.length - 1) return;
    const src = order[i];
    const tgt = order[i + 1];
    if (this.linkManager.hasLink(src, tgt)) {
      this.linkManager.removeLinkBetween(src, tgt);
    } else {
      this.linkManager.createLink(src, "right", tgt, "left");
    }
    this.saveState();
  }

  /** Returns the link state between tab[i] and tab[i+1]. */
  public tabbedPairState(i: number): "linked" | "available" | "incompatible" {
    if (!this.linkManager) return "incompatible";
    const order = this.tabbedLayout.getOrder();
    if (i < 0 || i >= order.length - 1) return "incompatible";
    const src = order[i];
    const tgt = order[i + 1];
    if (this.linkManager.hasLink(src, tgt)) return "linked";
    if (!this.linkManager.canLink(src, tgt)) return "incompatible";
    return "available";
  }

  public setSettingsCallback(fn: () => void): void {
    this.tabbedLayout.setSettingsCallback(fn);
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
      orientationOverride?: "vertical" | "horizontal";
      zoomActive?: boolean;
    },
  ): string | null {
    const descriptor = getFloatingViewDescriptor(viewId);
    if (!descriptor) return null;

    try {
      const orientationOverride = options?.orientationOverride;
      const zoomActive = options?.zoomActive ?? false;
      const globalOrientation =
        (this.appSettings.instrumentSettings as any)?.orientation ?? "vertical";
      const effectiveOrientation: "vertical" | "horizontal" =
        orientationOverride ?? globalOrientation;
      const zoomMultiplier = this._zoomMultiplierFor(
        effectiveOrientation,
        zoomActive,
      );
      const settings = this._buildOverriddenSettings(
        orientationOverride,
        zoomMultiplier,
      );

      const viewInstance = descriptor.createView(viewState, settings);
      const contentEl = document.createElement("div");
      viewInstance.render(contentEl);

      // For legacy configurable_instrument_feature entries, resolve the icon
      // from the feature-specific viewId descriptor so the tab shows the right icon.
      let resolvedIcon = descriptor.icon;
      if (viewId === CORE_VIEW_IDS.ConfigurableFeature) {
        const featureTypeName = (viewState as any)?.featureTypeName;
        if (featureTypeName)
          resolvedIcon =
            getViewIconByFeatureType(featureTypeName) ?? resolvedIcon;
      }

      const sizing = resolveSizing(descriptor, effectiveOrientation);

      const chrome = this.currentStrategy.createChrome({
        instanceId,
        title: options?.title ?? descriptor.displayName,
        icon: resolvedIcon,
        contentEl,
        collapsed: options?.collapsed,
        zoomActive,
        sizing,
        supportsRotate:
          isFretboardDescriptor(descriptor) && descriptor.supportsRotate,
        supportsZoom:
          isFretboardDescriptor(descriptor) && descriptor.supportsZoom,
        supportsConfigToggle: descriptor.supportsConfigToggle,
        position: options?.position,
        size: options?.size,
        zIndex: options?.zIndex,
        onRotate:
          isFretboardDescriptor(descriptor) && descriptor.supportsRotate
            ? () => this._handleRotateRequest(instanceId)
            : undefined,
        onZoom:
          isFretboardDescriptor(descriptor) && descriptor.supportsZoom
            ? () => this._handleZoomRequest(instanceId)
            : undefined,
        onClose: (id) => this.destroyView(id),
      });

      const unlistens: Array<() => void> = [];

      // Track viewState mutations for persistence
      unlistens.push(
        onEvent(contentEl, "feature-state-changed", (detail) => {
          record.viewState = {
            ...(record.viewState as Record<string, unknown>),
            ...detail,
          };
          this.saveState();
        }),
      );

      // Keep chrome title in sync
      unlistens.push(
        onEvent(contentEl, "feature-title-changed", (detail) => {
          if (detail.title) chrome.setTitle(detail.title);
        }),
      );

      const record: PanelRecord = {
        instanceId,
        viewId,
        viewState,
        collapsed: options?.collapsed,
        orientationOverride,
        zoomActive,
        viewInstance,
        contentEl,
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
        this.tabbedLayout.rebuildConnectors();
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
    if (this.currentStrategy === this.tabbedLayout) {
      this.tabbedLayout.onPanelClosed(instanceId);
    }
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

    const saved = this._loadState();
    if (!saved?.instances) {
      this.linkManager?.initialize([]);
      return;
    }

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
    const allHaveGeom = instanceEntries.every(
      (e) => savedPerInstance[e.instanceId],
    );
    const canonical = this._resolveCanonicalRects(
      instanceEntries,
      savedPerInstance,
      allHaveGeom,
    );

    // Sort by zIndex so floating z-stacking matches what was saved
    const sortedEntries = instanceEntries.sort((a, b) => {
      const aZ = canonical[a.instanceId]?.zIndex ?? 100;
      const bZ = canonical[b.instanceId]?.zIndex ?? 100;
      return aZ - bZ;
    });

    for (const entry of sortedEntries) {
      if (!getFloatingViewDescriptor(entry.viewId)) {
        console.warn(
          `PanelHost: Cannot restore view "${entry.viewId}" — descriptor not found`,
        );
        continue;
      }

      // Global Key (broadcast source) is hidden from mobile — skip in tabbed mode.
      if (this.currentStrategy === this.tabbedLayout) {
        const broadcastViewId = getBroadcastSourceViewId();
        if (broadcastViewId && entry.viewId === broadcastViewId) continue;
      }

      try {
        const numericId = parseInt(entry.instanceId.replace("fv-", ""), 10);
        if (!isNaN(numericId))
          this.nextInstanceId = Math.max(this.nextInstanceId, numericId + 1);

        const rect = canonical[entry.instanceId];
        // Position only lower-bounded (no upper clamp — the fit cell keeps it on-screen,
        // and clamping a tall panel upward is what used to cause overlaps). Size derives
        // from the canonical span; CSS min/max on the wrapper handles the rest.
        const position = rect
          ? {
              x: Math.max(g.originX, colToPx(rect.col, g)),
              y: Math.max(0, rowToPx(rect.row, g)),
            }
          : undefined;
        const size = rect
          ? { width: rect.colSpan * g.cell, height: rect.rowSpan * g.cell }
          : undefined;

        this._createPanel(
          entry.instanceId,
          entry.viewId as ViewId,
          entry.viewState,
          {
            position,
            size,
            zIndex: rect?.zIndex,
            collapsed: entry.collapsed,
            orientationOverride: entry.orientationOverride,
            zoomActive: entry.zoomActive,
          },
        );
      } catch (e) {
        console.error(`PanelHost: Error restoring ${entry.instanceId}:`, e);
      }
    }

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
    this.linkManager?.initialize(saved.links ?? []);
    if (this.currentStrategy === this.tabbedLayout) {
      this.tabbedLayout.rebuildConnectors();
    }
  }

  /** Resolve saved per-instance geometry into canonical cell rects (with zIndex):
   *  reconcile authored positions when every instance has geometry, else shelf-pack.
   *  Spans come straight from the descriptor's grid footprint (already in cells) for
   *  instances that lack a saved span. */
  private _resolveCanonicalRects(
    entries: Array<{
      instanceId: string;
      viewId: string;
      orientationOverride?: "vertical" | "horizontal";
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
    allHaveGeom: boolean,
  ): Record<string, PlacedRect & { zIndex: number }> {
    const spanFor = (entry: {
      instanceId: string;
      viewId: string;
      orientationOverride?: "vertical" | "horizontal";
    }) => {
      const geom = saved[entry.instanceId];
      const sz = this._sizingFor(
        entry.viewId as ViewId,
        entry.orientationOverride,
      );
      return {
        colSpan: geom?.colSpan ?? sz?.default.cols ?? 20,
        rowSpan: geom?.rowSpan ?? sz?.default.rows ?? 12,
      };
    };
    const zFor = (id: string) => saved[id]?.zIndex ?? 100;
    const out: Record<string, PlacedRect & { zIndex: number }> = {};

    if (allHaveGeom) {
      const items: ReconcileItem[] = entries.map((e) => {
        const { colSpan, rowSpan } = spanFor(e);
        const geom = saved[e.instanceId]!;
        return {
          id: e.instanceId,
          col: geom.col,
          row: geom.row,
          colSpan,
          rowSpan,
        };
      });
      const reconciled = reconcileLayout(items);
      for (const e of entries) {
        const r = reconciled[e.instanceId];
        if (r) out[e.instanceId] = { ...r, zIndex: zFor(e.instanceId) };
      }
    } else {
      const items = entries.map((e) => ({ id: e.instanceId, ...spanFor(e) }));
      const packed = packShelves(items, GRID_COLS);
      for (const it of items) {
        const pos = packed[it.id] ?? { col: 0, row: 0 };
        out[it.id] = {
          col: pos.col,
          row: pos.row,
          colSpan: it.colSpan,
          rowSpan: it.rowSpan,
          zIndex: zFor(it.id),
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

    const globalOrientation =
      (this.appSettings.instrumentSettings as any)?.orientation ?? "vertical";
    const current: "vertical" | "horizontal" =
      record.orientationOverride ?? globalOrientation;
    record.orientationOverride =
      current === "vertical" ? "horizontal" : "vertical";

    // Re-apply size constraints for the new orientation (CSS min/max) before the view
    // re-renders and auto-sizes into them.
    const sizing = resolveSizing(descriptor, record.orientationOverride);
    record.chrome.setSizeConstraints?.(sizing);

    const zm = this._zoomMultiplierFor(
      record.orientationOverride,
      record.zoomActive ?? false,
    );
    this._recreateViewInPlace(
      record,
      descriptor,
      this._buildOverriddenSettings(record.orientationOverride, zm),
      true,
    );
    this.saveState();
  }

  private _handleZoomRequest(instanceId: string): void {
    const record = this.instances.get(instanceId);
    const descriptor = getFloatingViewDescriptor(record?.viewId ?? "");
    if (!record || !descriptor) return;

    record.zoomActive = !record.zoomActive;
    const globalOrientation =
      (this.appSettings.instrumentSettings as any)?.orientation ?? "vertical";
    const effectiveOrientation: "vertical" | "horizontal" =
      record.orientationOverride ?? globalOrientation;
    const zm = this._zoomMultiplierFor(effectiveOrientation, record.zoomActive);

    this._recreateViewInPlace(
      record,
      descriptor,
      this._buildOverriddenSettings(record.orientationOverride, zm),
      true,
    );
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
    const guitarSettingsChanged =
      JSON.stringify(this.appSettings.instrumentSettings) !==
      JSON.stringify(newSettings.instrumentSettings);
    const themeChanged = this.appSettings.theme !== newSettings.theme;
    this.appSettings = newSettings;

    if (!guitarSettingsChanged && !themeChanged) return;

    const newOrientation: "vertical" | "horizontal" =
      (newSettings.instrumentSettings as any)?.orientation ?? "vertical";
    const orientationChanged = oldOrientation !== newOrientation;

    const SKIP_VIEW_IDS = new Set<ViewId>([
      "instrument_floating_metronome" as ViewId,
      "floating_timer" as ViewId,
    ]);

    for (const record of this.instances.values()) {
      if (SKIP_VIEW_IDS.has(record.viewId)) continue;
      const descriptor = getFloatingViewDescriptor(record.viewId);
      if (!descriptor?.refreshOnInstrumentChange) continue;

      const effectiveOrientation: "vertical" | "horizontal" =
        record.orientationOverride ??
        (newSettings.instrumentSettings as any)?.orientation ??
        "vertical";
      // A global orientation flip changes the effective footprint of fretboard panels
      // that follow the global setting (no per-instance override) — adopt the new
      // orientation's size so the panel isn't left at the previous orientation's
      // dimensions. (The rotate button drives this directly via setSizeConstraints.)
      if (
        orientationChanged &&
        record.orientationOverride === undefined &&
        isFretboardDescriptor(descriptor)
      ) {
        record.chrome.setSizeConstraints?.(
          resolveSizing(descriptor, effectiveOrientation),
        );
      }

      const zm = this._zoomMultiplierFor(
        effectiveOrientation,
        record.zoomActive ?? false,
      );
      this._recreateViewInPlace(
        record,
        descriptor,
        this._buildOverriddenSettings(record.orientationOverride, zm),
        guitarSettingsChanged,
      );
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
    const layoutData = this.currentStrategy.serializeLayout();
    const instances: CurrentPayload["instances"] = {};
    for (const [id, record] of this.instances) {
      instances[id] = {
        instanceId: id,
        viewId: record.viewId,
        viewState: record.viewState,
        collapsed: record.collapsed,
        orientationOverride: record.orientationOverride,
        zoomActive: record.zoomActive,
      };
    }
    return {
      instances,
      links: this.linkManager?.getLinks() ?? [],
      layout: layoutData,
    };
  }

  private saveState(): void {
    this.screenConfigManager.saveAutoSave(this._buildPayload());
  }

  private _loadState(): CurrentPayload | null {
    return this.screenConfigManager.loadAutoSave();
  }

  // --- Shared math ---

  /** The orientation a panel renders at: its per-instance override, else the global. */
  private _effectiveOrientation(
    orientationOverride?: "vertical" | "horizontal",
  ): Orientation {
    const global =
      (this.appSettings.instrumentSettings as any)?.orientation ?? "vertical";
    return orientationOverride ?? global;
  }

  /** Resolve a view's effective grid footprint (default/min/max in cells) for the given
   *  orientation. */
  private _sizingFor(
    viewId: ViewId,
    orientationOverride?: "vertical" | "horizontal",
  ): PanelSizing | undefined {
    const desc = getFloatingViewDescriptor(viewId);
    return resolveSizing(desc, this._effectiveOrientation(orientationOverride));
  }

  private _zoomMultiplierFor(
    orientation: "vertical" | "horizontal",
    zoomActive: boolean,
  ): number {
    if (!zoomActive) return 1.0;
    return orientation === "horizontal" ? 2.0 : 1.25;
  }

  private _buildOverriddenSettings(
    orientationOverride: "vertical" | "horizontal" | undefined,
    zoomMultiplier: number,
  ): AppSettings {
    return {
      ...this.appSettings,
      instrumentSettings: {
        ...this.appSettings.instrumentSettings,
        ...(orientationOverride !== undefined
          ? { orientation: orientationOverride }
          : {}),
        zoomMultiplier,
      },
    };
  }
}
