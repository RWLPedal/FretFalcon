// ts/panels/panel_host.ts
// Manages panel instances, coordinates layout strategies (FloatingLayout /
// TabbedLayout), and owns the view lifecycle. Replaces panel_manager.ts.

import { View } from '../view';
import { ViewId, CORE_VIEW_IDS } from '../core/ids';
import { AppSettings } from '../settings';
import { LinkManager } from './link_manager';
import { SignalSink } from './link_types';
import { getFloatingViewDescriptor, getViewIcon, getViewIconByFeatureType } from './panel_registry';
import { getFeatureTypeNameByViewId } from './drive_registry';
import { isFretboardDescriptor, FloatingViewDescriptor } from './panel_types';
import { onEvent, emitEvent } from '../core/events';
import { ScreenConfigManager } from '../screen_config/screen_config_manager';
import { CurrentPayload, V3Payload } from '../screen_config/screen_config_types';
import { GRID_UNIT } from './panel_wrapper';
import { FloatingLayout } from './layout/floating_layout';
import { TabbedLayout } from './layout/tabbed_layout';
import type { LayoutStrategy, PanelChrome } from './layout/layout_strategy';

const FLOATING_VIEW_AREA_ID = 'floating-view-area';
const MOBILE_BREAKPOINT = '(max-width: 768px)';

// Retain FloatingViewManager as an alias so existing imports keep working.
export { PanelHost as FloatingViewManager };

interface PanelRecord {
  instanceId: string;
  viewId: ViewId;
  viewState?: unknown;
  collapsed?: boolean;
  orientationOverride?: 'vertical' | 'horizontal';
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

  constructor(appSettings: AppSettings, screenConfigManager: ScreenConfigManager) {
    this.appSettings = appSettings;
    this.screenConfigManager = screenConfigManager;

    this.floatingLayout = new FloatingLayout(() => this.saveState());
    this.tabbedLayout = new TabbedLayout((viewId) => {
      this.spawnView(viewId);
    });

    const area = document.getElementById(FLOATING_VIEW_AREA_ID);
    if (!area) {
      console.error(`PanelHost: #${FLOATING_VIEW_AREA_ID} not found`);
    }

    this._mql = window.matchMedia(MOBILE_BREAKPOINT);
    const isMobile = this._mql.matches;
    this.currentStrategy = isMobile ? this.tabbedLayout : this.floatingLayout;
    if (area) this.currentStrategy.mount(area);

    this._mql.addEventListener('change', this._onBreakpointChange);

    window.addEventListener('resize', () => {
      if (this._resizeDebounceTimer !== null) clearTimeout(this._resizeDebounceTimer);
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

  private _switchStrategy(area: HTMLElement, newStrategy: LayoutStrategy): void {
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
        if (featureTypeName) switchIcon = getViewIconByFeatureType(featureTypeName) ?? switchIcon;
      }
      record.chrome = newStrategy.createChrome({
        instanceId: record.instanceId,
        title: desc?.displayName ?? record.viewId,
        icon: switchIcon,
        contentEl: record.contentEl,
        collapsed: record.collapsed,
        zoomActive: record.zoomActive,
        defaultWidth: desc?.defaultWidth,
        defaultHeight: desc?.defaultHeight,
        minWidth: desc?.minWidth,
        minHeight: desc?.minHeight,
        supportsRotate: !!desc && isFretboardDescriptor(desc) && desc.supportsRotate,
        supportsZoom: !!desc && isFretboardDescriptor(desc) && desc.supportsZoom,
        supportsConfigToggle: desc?.supportsConfigToggle,
        onRotate: !!desc && isFretboardDescriptor(desc) && desc.supportsRotate
          ? () => this._handleRotateRequest(record.instanceId) : undefined,
        onZoom: !!desc && isFretboardDescriptor(desc) && desc.supportsZoom
          ? () => this._handleZoomRequest(record.instanceId) : undefined,
        onClose: (id) => this.destroyView(id),
      });
      if (record.chrome.wrapperEl) {
        this.linkManager?.onWindowSpawned(record.instanceId, record.chrome.wrapperEl);
      }
    }

    newStrategy.applyLayoutData(savedLayout);

    // Fire resize on each contentEl so canvases redraw at new dimensions
    for (const record of this.instances.values()) {
      requestAnimationFrame(() => {
        emitEvent(record.contentEl, 'wrapper-user-resized',
          { width: record.contentEl.clientWidth, height: record.contentEl.clientHeight },
          { bubbles: false });
      });
    }

    this.saveState();
  }

  // --- Public API ---

  public setLinkManager(lm: LinkManager): void { this.linkManager = lm; }
  public getLinkManager(): LinkManager | null { return this.linkManager; }

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
      orientationOverride?: 'vertical' | 'horizontal';
      zoomActive?: boolean;
    },
  ): string | null {
    const descriptor = getFloatingViewDescriptor(viewId);
    if (!descriptor) return null;

    try {
      const orientationOverride = options?.orientationOverride;
      const zoomActive = options?.zoomActive ?? false;
      const globalOrientation = (this.appSettings.instrumentSettings as any)?.orientation ?? 'vertical';
      const effectiveOrientation: 'vertical' | 'horizontal' = orientationOverride ?? globalOrientation;
      const zoomMultiplier = this._zoomMultiplierFor(effectiveOrientation, zoomActive);
      const settings = this._buildOverriddenSettings(orientationOverride, zoomMultiplier);

      const viewInstance = descriptor.createView(viewState, settings);
      const contentEl = document.createElement('div');
      viewInstance.render(contentEl);

      // For legacy configurable_instrument_feature entries, resolve the icon
      // from the feature-specific viewId descriptor so the tab shows the right icon.
      let resolvedIcon = descriptor.icon;
      if (viewId === CORE_VIEW_IDS.ConfigurableFeature) {
        const featureTypeName = (viewState as any)?.featureTypeName;
        if (featureTypeName) resolvedIcon = getViewIconByFeatureType(featureTypeName) ?? resolvedIcon;
      }

      const chrome = this.currentStrategy.createChrome({
        instanceId,
        title: options?.title ?? descriptor.displayName,
        icon: resolvedIcon,
        contentEl,
        collapsed: options?.collapsed,
        zoomActive,
        defaultWidth: descriptor.defaultWidth,
        defaultHeight: descriptor.defaultHeight,
        minWidth: descriptor.minWidth,
        minHeight: descriptor.minHeight,
        supportsRotate: isFretboardDescriptor(descriptor) && descriptor.supportsRotate,
        supportsZoom: isFretboardDescriptor(descriptor) && descriptor.supportsZoom,
        supportsConfigToggle: descriptor.supportsConfigToggle,
        position: options?.position,
        size: options?.size,
        zIndex: options?.zIndex,
        onRotate: isFretboardDescriptor(descriptor) && descriptor.supportsRotate
          ? () => this._handleRotateRequest(instanceId) : undefined,
        onZoom: isFretboardDescriptor(descriptor) && descriptor.supportsZoom
          ? () => this._handleZoomRequest(instanceId) : undefined,
        onClose: (id) => this.destroyView(id),
      });

      const unlistens: Array<() => void> = [];

      // Track viewState mutations for persistence
      unlistens.push(onEvent(contentEl, 'feature-state-changed', (detail) => {
        record.viewState = { ...(record.viewState as Record<string, unknown>), ...detail };
        this.saveState();
      }));

      // Keep chrome title in sync
      unlistens.push(onEvent(contentEl, 'feature-title-changed', (detail) => {
        if (detail.title) chrome.setTitle(detail.title);
      }));

      const record: PanelRecord = {
        instanceId, viewId, viewState,
        collapsed: options?.collapsed,
        orientationOverride,
        zoomActive,
        viewInstance, contentEl, chrome,
        _unlistens: unlistens,
      };
      this.instances.set(instanceId, record);

      if (typeof (viewInstance as any).receiveSignals === 'function') {
        this.sinks.set(instanceId, viewInstance as unknown as SignalSink);
      }

      if (chrome.wrapperEl) {
        this.linkManager?.onWindowSpawned(instanceId, chrome.wrapperEl);
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
    record._unlistens.forEach(u => u());
    record.chrome.destroy();

    try { record.viewInstance.destroy(); } catch (e) {
      console.error(`PanelHost: Error destroying view ${instanceId}:`, e);
    }

    this.instances.delete(instanceId);
    this.sinks.delete(instanceId);
    this.saveState();
  }

  public closeAllViews(): void {
    [...this.instances.keys()].forEach(id => this.destroyView(id));
  }

  public restoreViewsFromState(): void {
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

    const scale = floatingData
      ? this._computeRestoreScale(floatingData.referenceGrid)
      : 1.0;

    // Restore in zIndex order so floating z-stacking matches what was saved
    const sortedEntries = Object.values(saved.instances).sort((a, b) => {
      const aZ = floatingData?.perInstance[a.instanceId]?.zIndex ?? 100;
      const bZ = floatingData?.perInstance[b.instanceId]?.zIndex ?? 100;
      return aZ - bZ;
    });

    const vpW = area.clientWidth || window.innerWidth;
    const vpH = area.clientHeight || window.innerHeight;

    for (const entry of sortedEntries) {
      if (!getFloatingViewDescriptor(entry.viewId)) {
        console.warn(`PanelHost: Cannot restore view "${entry.viewId}" — descriptor not found`);
        continue;
      }

      try {
        const numericId = parseInt(entry.instanceId.replace('fv-', ''), 10);
        if (!isNaN(numericId)) this.nextInstanceId = Math.max(this.nextInstanceId, numericId + 1);

        let position: { x: number; y: number } | undefined;
        let size: { width: number; height: number } | undefined;
        let zIndex: number | undefined;

        const geom = floatingData?.perInstance[entry.instanceId];
        if (geom) {
          const rawX = geom.gridPosition.col * scale * GRID_UNIT;
          const rawY = geom.gridPosition.row * scale * GRID_UNIT;
          if (geom.gridSize) {
            const rawW = Math.round(geom.gridSize.cols * scale * GRID_UNIT);
            const rawH = Math.round(geom.gridSize.rows * scale * GRID_UNIT);
            size = { width: rawW, height: rawH };
            position = { x: Math.max(0, Math.min(rawX, vpW - rawW)), y: Math.max(0, Math.min(rawY, vpH - rawH)) };
          } else {
            position = { x: Math.max(0, Math.min(rawX, vpW - 150)), y: Math.max(0, Math.min(rawY, vpH - 50)) };
          }
          zIndex = geom.zIndex;
        }

        this._createPanel(entry.instanceId, entry.viewId as ViewId, entry.viewState, {
          position, size, zIndex,
          collapsed: entry.collapsed,
          orientationOverride: entry.orientationOverride,
          zoomActive: entry.zoomActive,
        });
      } catch (e) {
        console.error(`PanelHost: Error restoring ${entry.instanceId}:`, e);
      }
    }

    this.currentStrategy.applyLayoutData(saved.layout);
    this.linkManager?.initialize(saved.links ?? []);
  }

  private _computeRestoreScale(refGrid: { cols: number; rows: number }): number {
    const area = document.getElementById(FLOATING_VIEW_AREA_ID);
    const vpW = area?.clientWidth ?? window.innerWidth;
    const vpH = area?.clientHeight ?? window.innerHeight;
    const currCols = Math.max(1, Math.round(vpW / GRID_UNIT));
    const currRows = Math.max(1, Math.round(vpH / GRID_UNIT));
    return Math.min(currCols / refGrid.cols, currRows / refGrid.rows);
  }

  // --- Rotate / Zoom ---

  private _handleRotateRequest(instanceId: string): void {
    const record = this.instances.get(instanceId);
    const descriptor = getFloatingViewDescriptor(record?.viewId ?? '');
    if (!record || !descriptor) return;

    const globalOrientation = (this.appSettings.instrumentSettings as any)?.orientation ?? 'vertical';
    const current: 'vertical' | 'horizontal' = record.orientationOverride ?? globalOrientation;
    record.orientationOverride = current === 'vertical' ? 'horizontal' : 'vertical';

    const zm = this._zoomMultiplierFor(record.orientationOverride, record.zoomActive ?? false);
    this._recreateViewInPlace(record, descriptor, this._buildOverriddenSettings(record.orientationOverride, zm), true);
    this.saveState();
  }

  private _handleZoomRequest(instanceId: string): void {
    const record = this.instances.get(instanceId);
    const descriptor = getFloatingViewDescriptor(record?.viewId ?? '');
    if (!record || !descriptor) return;

    record.zoomActive = !record.zoomActive;
    const globalOrientation = (this.appSettings.instrumentSettings as any)?.orientation ?? 'vertical';
    const effectiveOrientation: 'vertical' | 'horizontal' = record.orientationOverride ?? globalOrientation;
    const zm = this._zoomMultiplierFor(effectiveOrientation, record.zoomActive);

    this._recreateViewInPlace(record, descriptor, this._buildOverriddenSettings(record.orientationOverride, zm), true);
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
      record.contentEl.innerHTML = '';
      newView.render(record.contentEl);
      record.viewInstance = newView;

      if (typeof (newView as any).receiveSignals === 'function') {
        this.sinks.set(record.instanceId, newView as unknown as SignalSink);
      } else {
        this.sinks.delete(record.instanceId);
      }

      record.chrome.notifyContentReplaced(forceAutoSize);
      this.linkManager?.refreshForInstance(record.instanceId);
    } catch (e) {
      console.error(`PanelHost: Error recreating view ${record.instanceId}:`, e);
    }
  }

  // --- Settings ---

  public applySettingsChange(newSettings: AppSettings): void {
    const guitarSettingsChanged = JSON.stringify(this.appSettings.instrumentSettings) !==
      JSON.stringify(newSettings.instrumentSettings);
    const themeChanged = this.appSettings.theme !== newSettings.theme;
    this.appSettings = newSettings;

    if (!guitarSettingsChanged && !themeChanged) return;

    const SKIP_VIEW_IDS = new Set<ViewId>([
      'instrument_floating_metronome' as ViewId,
      'floating_timer' as ViewId,
    ]);

    for (const record of this.instances.values()) {
      if (SKIP_VIEW_IDS.has(record.viewId)) continue;
      const descriptor = getFloatingViewDescriptor(record.viewId);
      if (!descriptor?.refreshOnInstrumentChange) continue;

      const effectiveOrientation: 'vertical' | 'horizontal' =
        record.orientationOverride ?? (newSettings.instrumentSettings as any)?.orientation ?? 'vertical';
      const zm = this._zoomMultiplierFor(effectiveOrientation, record.zoomActive ?? false);
      this._recreateViewInPlace(record, descriptor, this._buildOverriddenSettings(record.orientationOverride, zm), guitarSettingsChanged);
    }

    this.saveState();
  }

  // --- Import / Export / Named Layouts ---

  public exportStateJson(): string {
    const payload: V3Payload = this._buildPayload();
    if (this.appSettings.customTunings) payload.customTunings = this.appSettings.customTunings;
    return this.screenConfigManager.exportJson(payload);
  }

  public importStateJson(json: string, onCustomTuningsImported?: (ct: AppSettings["customTunings"]) => void): void {
    const migrated = this.screenConfigManager.importJson(json);
    if (!migrated) { console.error('PanelHost: importStateJson failed'); return; }

    [...this.instances.keys()].forEach(id => this.destroyView(id));
    this.nextInstanceId = 1;

    if ((migrated as V3Payload).customTunings && onCustomTuningsImported) {
      onCustomTuningsImported((migrated as V3Payload).customTunings as AppSettings["customTunings"]);
    }

    this.screenConfigManager.saveAutoSave(migrated);
    this.restoreViewsFromState();
  }

  public loadNamedLayout(name: string): void {
    const area = document.getElementById(FLOATING_VIEW_AREA_ID);
    const cols = area ? Math.max(1, Math.round(area.clientWidth / GRID_UNIT)) : 80;
    const payload = this.screenConfigManager.loadNamed(name, cols);
    if (!payload) { console.error(`PanelHost: no layout found for "${name}"`); return; }

    [...this.instances.keys()].forEach(id => this.destroyView(id));
    this.nextInstanceId = 1;

    this.screenConfigManager.saveAutoSave(payload);
    this.restoreViewsFromState();
  }

  // --- Persistence helpers ---

  private _buildPayload(): V3Payload {
    const layoutData = this.currentStrategy.serializeLayout();
    const instances: V3Payload['instances'] = {};
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
    return { instances, links: this.linkManager?.getLinks() ?? [], layout: layoutData };
  }

  private saveState(): void {
    this.screenConfigManager.saveAutoSave(this._buildPayload());
  }

  private _loadState(): V3Payload | null {
    return this.screenConfigManager.loadAutoSave() as V3Payload | null;
  }

  // --- Shared math ---

  private _zoomMultiplierFor(orientation: 'vertical' | 'horizontal', zoomActive: boolean): number {
    if (!zoomActive) return 1.0;
    return orientation === 'horizontal' ? 2.0 : 1.25;
  }

  private _buildOverriddenSettings(
    orientationOverride: 'vertical' | 'horizontal' | undefined,
    zoomMultiplier: number,
  ): AppSettings {
    return {
      ...this.appSettings,
      instrumentSettings: {
        ...this.appSettings.instrumentSettings,
        ...(orientationOverride !== undefined ? { orientation: orientationOverride } : {}),
        zoomMultiplier,
      },
    };
  }
}
