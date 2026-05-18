// ts/floating_views/floating_view_manager.ts
import { FloatingViewWrapper, GRID_UNIT } from "./floating_view_wrapper";
import {
  FloatingViewDescriptor,
  FloatingViewInstanceState,
  FloatingViewManagerSaveState,
  isFretboardDescriptor,
} from "./floating_view_types";
import { getFloatingViewDescriptor } from "./floating_view_registry";
import { AppSettings } from "../settings"; // Needed for createView
import { LinkManager } from "./link_manager";
import { getFeatureTypeNameByViewId } from "./drive_registry";
import { ScreenConfigManager } from "../screen_config/screen_config_manager";
import { CurrentPayload } from "../screen_config/screen_config_types";

const FLOATING_VIEW_AREA_ID = "floating-view-area";

// --- Grid coordinate helpers ---

function pixelToGridCol(px: number): number {
  return Math.round(px / GRID_UNIT);
}

function pixelToGridRow(py: number): number {
  return Math.round(py / GRID_UNIT);
}

function gridColToPixel(col: number, scale: number): number {
  return col * scale * GRID_UNIT;
}

function gridRowToPixel(row: number, scale: number): number {
  return row * scale * GRID_UNIT;
}

function viewportGridSize(el: HTMLElement | null): { cols: number; rows: number } {
  const w = el?.clientWidth ?? window.innerWidth;
  const h = el?.clientHeight ?? window.innerHeight;
  return {
    cols: Math.max(1, Math.round(w / GRID_UNIT)),
    rows: Math.max(1, Math.round(h / GRID_UNIT)),
  };
}

export class FloatingViewManager {
  private activeViews = new Map<string, FloatingViewWrapper>();
  private viewAreaElement: HTMLElement | null;
  private nextInstanceId = 1;
  private currentMaxZIndex = 100;
  public appSettings: AppSettings;
  private screenConfigManager: ScreenConfigManager;
  private linkManager: LinkManager | null = null;

  private _resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(appSettings: AppSettings, screenConfigManager: ScreenConfigManager) {
    this.appSettings = appSettings;
    this.screenConfigManager = screenConfigManager;
    this.viewAreaElement = document.getElementById(FLOATING_VIEW_AREA_ID);
    if (!this.viewAreaElement) {
      console.error(
        `Floating View container #${FLOATING_VIEW_AREA_ID} not found! Views will not be displayed.`
      );
    }
    window.addEventListener("resize", () => {
      if (this._resizeDebounceTimer !== null) clearTimeout(this._resizeDebounceTimer);
      this._resizeDebounceTimer = setTimeout(() => {
        this._resizeDebounceTimer = null;
        this._clampAllViews();
      }, 100);
    });
  }

  private _clampAllViews(): void {
    const vpW = this.viewAreaElement?.clientWidth ?? window.innerWidth;
    const vpH = this.viewAreaElement?.clientHeight ?? window.innerHeight;
    this.activeViews.forEach((wrapper) => {
      const state = wrapper["state"] as FloatingViewInstanceState;
      const size = wrapper.getSize();
      const clampedX = Math.max(0, Math.min(state.position.x, vpW - size.width));
      const clampedY = Math.max(0, Math.min(state.position.y, vpH - size.height));
      if (clampedX !== state.position.x || clampedY !== state.position.y) {
        wrapper.setPosition(clampedX, clampedY);
      }
    });
    // Save so clamped positions persist if the user saves after resizing.
    this.saveState();
  }

  // --- Public API ---

  public setLinkManager(lm: LinkManager): void {
    this.linkManager = lm;
  }

  public getWrapperElement(instanceId: string): HTMLElement | null {
    return this.activeViews.get(instanceId)?.element ?? null;
  }

  public getContentElement(instanceId: string): HTMLElement | null {
    return this.activeViews.get(instanceId)?.contentEl ?? null;
  }

  public getViewId(instanceId: string): string | null {
    return (this.activeViews.get(instanceId)?.['state'] as FloatingViewInstanceState | undefined)?.viewId ?? null;
  }

  /**
   * Returns the drive-registry featureTypeName for a given instance.
   * For configurable feature views, reads featureTypeName from viewState.
   * For standalone view targets (Drone, BackingTrack, Metronome), looks it up
   * from the drive registry by viewId.
   */
  public getFeatureTypeName(instanceId: string): string | null {
    const state = (this.activeViews.get(instanceId) as any)?.['state'] as FloatingViewInstanceState | undefined;
    if (!state) return null;
    if (state.viewId === 'configurable_instrument_feature') {
      return (state.viewState as any)?.featureTypeName ?? null;
    }
    return getFeatureTypeNameByViewId(state.viewId);
  }

  public spawnView(
    viewId: string,
    options?: {
      viewState?: any;
      position?: { x: number; y: number };
      size?: { width: number; height: number };
      title?: string;
    }
  ): void {
    if (!this.viewAreaElement) return;

    const descriptor = getFloatingViewDescriptor(viewId);
    if (!descriptor) {
      console.error(
        `Cannot spawn view: Descriptor not found for viewId "${viewId}"`
      );
      return;
    }

    const instanceId = `fv-${this.nextInstanceId++}`;
    this.currentMaxZIndex++;

    // Compute default spawn position, offset by sidebar width if present
    const defaultPosition = (() => {
      const sidebarEl = document.querySelector('.side-bar-container');
      const sidebarWidth = sidebarEl ? sidebarEl.getBoundingClientRect().width : 0;
      return {
        x: sidebarWidth + 48 + ((this.activeViews.size * 20) % 300),
        y: 48 + ((this.activeViews.size * 20) % 400),
      };
    })();

    const spawnPosition = options?.position ?? defaultPosition;
    const state: FloatingViewInstanceState = {
      instanceId: instanceId,
      viewId: viewId,
      position: spawnPosition,
      size: options?.size,
      gridPosition: {
        col: pixelToGridCol(spawnPosition.x),
        row: pixelToGridRow(spawnPosition.y),
      },
      gridSize: options?.size
        ? { cols: pixelToGridCol(options.size.width), rows: pixelToGridRow(options.size.height) }
        : undefined,
      zIndex: this.currentMaxZIndex,
      viewState: options?.viewState,
    };

    try {
      const spawnSettings = this._buildOverriddenSettings(undefined, 1.0);
      const viewInstance = descriptor.createView(state.viewState, spawnSettings);
      const title = options?.title ?? descriptor.displayName;

      const wrapper = new FloatingViewWrapper(
        state,
        title,
        viewInstance,
        (id) => this.destroyView(id),
        (newState) => this.handleViewStateChange(newState),
        () => this.saveState(),
        descriptor.defaultWidth,
        descriptor.defaultHeight,
        isFretboardDescriptor(descriptor) && descriptor.supportsRotate ? () => this.handleRotateRequest(instanceId) : undefined,
        isFretboardDescriptor(descriptor) && descriptor.supportsZoom ? () => this.handleZoomRequest(instanceId) : undefined,
        descriptor.supportsConfigToggle ? () => this.handleConfigToggleRequest(instanceId) : undefined
      );

      this.activeViews.set(instanceId, wrapper);
      this.viewAreaElement.appendChild(wrapper.element);
      this.linkManager?.onWindowSpawned(instanceId, wrapper.element);
      this.saveState();
      console.log(`Spawned floating view instance: ${instanceId} (type: ${viewId})`);
    } catch (e) {
      console.error(`Error creating view instance for ${viewId}:`, e);
    }
  }

  public destroyView(instanceId: string): void {
    const wrapper = this.activeViews.get(instanceId);
    if (wrapper) {
      const viewId = wrapper["state"].viewId;
      this.linkManager?.onWindowDestroyed(instanceId);
      this.activeViews.delete(instanceId);
      this.saveState();
      console.log(`Destroyed floating view instance: ${instanceId} (type: ${viewId})`);
    }
  }

  public updateAllViews(state: any): void {
    this.activeViews.forEach(wrapper => {
      const viewInstance = wrapper['viewInstance'];
      if (viewInstance && typeof (viewInstance as any).update === 'function') {
        try {
          (viewInstance as any).update(state);
        } catch (e) {
          console.error("Error calling update for view:", wrapper['state']?.viewId, e);
        }
      }
    });
  }

  public restoreViewsFromState(): void {
    const viewArea = this.viewAreaElement;
    if (!viewArea) return;
    console.log("Restoring floating views from state...");
    const savedState = this.loadState();
    if (savedState && savedState.openViews) {
      this.currentMaxZIndex = savedState.nextZIndex || 100;

      // Compute scale factor: fit the saved layout into the current viewport
      // using the same logic as object-fit:contain (min of both axes).
      const currentGrid = viewportGridSize(this.viewAreaElement);
      const refGrid = savedState.referenceGrid ?? currentGrid;
      const scale = Math.min(
        currentGrid.cols / refGrid.cols,
        currentGrid.rows / refGrid.rows
      );

      const sortedStates = Object.values(savedState.openViews).sort(
        (a, b) => a.zIndex - b.zIndex
      );

      sortedStates.forEach((savedEntry) => {
        const descriptor = getFloatingViewDescriptor(savedEntry.viewId);
        if (!descriptor) {
          console.warn(`Cannot restore view: Descriptor not found for viewId "${savedEntry.viewId}"`);
          return;
        }
        try {
          const numericId = parseInt(savedEntry.instanceId.replace("fv-", ""), 10);
          if (!isNaN(numericId)) {
            this.nextInstanceId = Math.max(this.nextInstanceId, numericId + 1);
          }

          // Derive pixel position and size from grid units + scale.
          const gp = savedEntry.gridPosition;
          const pixelX = gridColToPixel(gp.col, scale);
          const pixelY = gridRowToPixel(gp.row, scale);
          const pixelSize = savedEntry.gridSize
            ? {
                width:  Math.round(savedEntry.gridSize.cols * scale * GRID_UNIT),
                height: Math.round(savedEntry.gridSize.rows * scale * GRID_UNIT),
              }
            : undefined;

          // Clamp position so the view stays within the current viewport.
          const vpW = this.viewAreaElement?.clientWidth ?? window.innerWidth;
          const vpH = this.viewAreaElement?.clientHeight ?? window.innerHeight;
          const clampedX = pixelSize
            ? Math.max(0, Math.min(pixelX, vpW - pixelSize.width))
            : Math.max(0, Math.min(pixelX, vpW - (descriptor.defaultWidth ?? 150)));
          const clampedY = pixelSize
            ? Math.max(0, Math.min(pixelY, vpH - pixelSize.height))
            : Math.max(0, Math.min(pixelY, vpH - 50));

          // Build the runtime state with pixel fields populated.
          const state: FloatingViewInstanceState = {
            ...savedEntry,
            position: { x: clampedX, y: clampedY },
            size: pixelSize,
          };

          // Apply any saved orientation/zoom overrides when recreating the view.
          const globalOrientation =
            (this.appSettings.instrumentSettings as any)?.orientation ?? "vertical";
          const effectiveOrientation: "vertical" | "horizontal" =
            state.orientationOverride ?? globalOrientation;
          const zoomMultiplier = this._zoomMultiplierFor(
            effectiveOrientation,
            state.zoomActive ?? false
          );
          const settingsToUse = this._buildOverriddenSettings(state.orientationOverride, zoomMultiplier);

          const viewInstance = descriptor.createView(state.viewState, settingsToUse);
          const wrapper = new FloatingViewWrapper(
            state,
            descriptor.displayName,
            viewInstance,
            (id) => this.destroyView(id),
            (newState) => this.handleViewStateChange(newState),
            () => this.saveState(),
            state.size?.width ?? descriptor.defaultWidth,
            state.size?.height ?? descriptor.defaultHeight,
            isFretboardDescriptor(descriptor) && descriptor.supportsRotate ? () => this.handleRotateRequest(state.instanceId) : undefined,
            isFretboardDescriptor(descriptor) && descriptor.supportsZoom ? () => this.handleZoomRequest(state.instanceId) : undefined,
            descriptor.supportsConfigToggle ? () => this.handleConfigToggleRequest(state.instanceId) : undefined
          );
          this.activeViews.set(state.instanceId, wrapper);
          viewArea.appendChild(wrapper.element);
          this.linkManager?.onWindowSpawned(state.instanceId, wrapper.element);
        } catch (e) {
          console.error(`Error recreating view instance ${savedEntry.instanceId} (${savedEntry.viewId}):`, e);
        }
      });
      console.log(`Restored ${this.activeViews.size} floating views.`);
      this.linkManager?.initialize(savedState.links ?? []);
    } else {
      console.log("No saved floating view state found.");
      this.linkManager?.initialize([]);
    }
  }

  // --- Internal State Management ---

  private handleViewStateChange(newState: FloatingViewInstanceState): void {
    const wrapper = this.activeViews.get(newState.instanceId);
    if (!wrapper) return;

    if (newState.zIndex < this.currentMaxZIndex) {
      this.currentMaxZIndex++;
      newState.zIndex = this.currentMaxZIndex;
      wrapper.bringToFront(newState.zIndex);
      this.saveState();
    } else {
      this.saveState();
    }
  }

  /**
   * Relays a config toggle request to the view rendered inside the wrapper.
   * The view (ConfigurableFeatureView) owns the collapse state; we just notify it.
   */
  private handleConfigToggleRequest(instanceId: string): void {
    const wrapper = this.activeViews.get(instanceId);
    if (!wrapper) return;
    wrapper.contentEl.dispatchEvent(new CustomEvent('config-visibility-toggle', { bubbles: false }));
  }

  /**
   * Handles a rotate request from a floating view wrapper. Determines the new
   * orientation (toggling from whatever is currently effective), rebuilds the
   * view with overridden AppSettings, and replaces the wrapper's content.
   */
  private handleRotateRequest(instanceId: string): void {
    const wrapper = this.activeViews.get(instanceId);
    if (!wrapper) return;

    const state = wrapper["state"] as FloatingViewInstanceState;
    const descriptor = getFloatingViewDescriptor(state.viewId);
    if (!descriptor) return;

    // Toggle orientation: if currently vertical (or no override) → horizontal, and vice versa.
    const globalOrientation =
      (this.appSettings.instrumentSettings as any)?.orientation ?? "vertical";
    const currentEffective: "vertical" | "horizontal" =
      state.orientationOverride ?? globalOrientation;
    const newOverride: "vertical" | "horizontal" =
      currentEffective === "vertical" ? "horizontal" : "vertical";

    state.orientationOverride = newOverride;

    // Recompute zoom multiplier for the new orientation (zoom ratio stays the same,
    // but the per-orientation scale factor changes).
    const zoomMultiplier = this._zoomMultiplierFor(newOverride, state.zoomActive ?? false);

    try {
      const overriddenSettings = this._buildOverriddenSettings(newOverride, zoomMultiplier);
      const newViewInstance = descriptor.createView(state.viewState, overriddenSettings);
      wrapper.replaceViewContent(newViewInstance);
      this.linkManager?.refreshForInstance(instanceId);
    } catch (e) {
      console.error(`Error recreating view with orientation override for ${instanceId}:`, e);
    }

    this.saveState();
  }

  /**
   * Handles a zoom toggle request. Flips state.zoomActive, rebuilds the view
   * with the appropriate zoomMultiplier, and updates the zoom button appearance.
   */
  private handleZoomRequest(instanceId: string): void {
    const wrapper = this.activeViews.get(instanceId);
    if (!wrapper) return;

    const state = wrapper["state"] as FloatingViewInstanceState;
    const descriptor = getFloatingViewDescriptor(state.viewId);
    if (!descriptor) return;

    state.zoomActive = !state.zoomActive;

    const globalOrientation =
      (this.appSettings.instrumentSettings as any)?.orientation ?? "vertical";
    const effectiveOrientation: "vertical" | "horizontal" =
      state.orientationOverride ?? globalOrientation;
    const zoomMultiplier = this._zoomMultiplierFor(effectiveOrientation, state.zoomActive);

    try {
      const overriddenSettings = this._buildOverriddenSettings(
        state.orientationOverride,
        zoomMultiplier
      );
      const newViewInstance = descriptor.createView(state.viewState, overriddenSettings);
      wrapper.replaceViewContent(newViewInstance);
      wrapper.updateZoomButtonState(state.zoomActive);
      this.linkManager?.refreshForInstance(instanceId);
    } catch (e) {
      console.error(`Error recreating view with zoom override for ${instanceId}:`, e);
    }

    this.saveState();
  }

  /**
   * Returns the zoom scale multiplier for a given orientation and zoom state.
   * Horizontal zoomed → 2× size; vertical zoomed → 1.25× size; unzoomed → 1.0.
   */
  private _zoomMultiplierFor(
    orientation: "vertical" | "horizontal",
    zoomActive: boolean
  ): number {
    if (!zoomActive) return 1.0;
    return orientation === "horizontal" ? 2.0 : 1.25;
  }

  /**
   * Returns a shallow copy of appSettings with Instrument orientation and/or zoom
   * multiplier overridden. Pass undefined to leave a value unchanged.
   */
  private _buildOverriddenSettings(
    orientationOverride: "vertical" | "horizontal" | undefined,
    zoomMultiplier: number
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

  /**
   * Applies a settings change to all active floating views.
   *
   * - Updates appSettings to newSettings.
   * - Re-creates guitar fretboard views (not metronome/timer) so they
   *   immediately reflect setting changes (orientation, color scheme, etc.).
   * - Views with a per-instance orientationOverride keep their override but
   *   pick up all other setting changes (color scheme, tuning, handedness).
   * - Views without an override follow the new global orientation.
   * - Per-instance zoom state is preserved across settings changes.
   */
  public applySettingsChange(newSettings: AppSettings): void {
    const oldInstrumentSettings = this.appSettings.instrumentSettings;
    const newInstrumentSettings = newSettings.instrumentSettings;
    const guitarSettingsChanged =
      JSON.stringify(oldInstrumentSettings) !== JSON.stringify(newInstrumentSettings);
    const themeChanged = this.appSettings.theme !== newSettings.theme;

    this.appSettings = newSettings;

    if (!guitarSettingsChanged && !themeChanged) return;

    // Views that manage their own runtime state should not be re-created.
    const SKIP_VIEW_IDS = new Set(["instrument_floating_metronome", "floating_timer"]);

    this.activeViews.forEach((wrapper, instanceId) => {
      const state = wrapper["state"] as FloatingViewInstanceState;
      if (SKIP_VIEW_IDS.has(state.viewId)) return;

      const descriptor = getFloatingViewDescriptor(state.viewId);
      if (!descriptor || descriptor.categoryName !== "Instrument") return;

      // Determine effective orientation and preserved zoom.
      const globalOrientation =
        (newSettings.instrumentSettings as any)?.orientation ?? "vertical";
      const effectiveOrientation: "vertical" | "horizontal" =
        state.orientationOverride ?? globalOrientation;
      const zoomMultiplier = this._zoomMultiplierFor(
        effectiveOrientation,
        state.zoomActive ?? false
      );

      const settingsToUse = this._buildOverriddenSettings(
        state.orientationOverride,
        zoomMultiplier
      );

      try {
        const newViewInstance = descriptor.createView(state.viewState, settingsToUse);
        // Only auto-size the wrapper when instrument settings actually changed (canvas
        // dimensions may differ). For a pure theme change, keep the current wrapper size
        // so it doesn't grow 12px per theme switch.
        wrapper.replaceViewContent(newViewInstance, guitarSettingsChanged);
        this.linkManager?.refreshForInstance(instanceId);
      } catch (e) {
        console.error(`Error updating view ${instanceId} after settings change:`, e);
      }
    });

    this.saveState();
  }

  public exportStateJson(): string {
    return this.screenConfigManager.exportJson(this._buildStrippedPayload());
  }

  public importStateJson(json: string): void {
    const migrated = this.screenConfigManager.importJson(json);
    if (!migrated) {
      console.error("importStateJson: could not parse or migrate the provided JSON.");
      return;
    }

    const instanceIds = Array.from(this.activeViews.keys());
    instanceIds.forEach(id => {
      const wrapper = this.activeViews.get(id);
      if (wrapper) wrapper.destroy();
    });
    this.activeViews.clear();
    this.nextInstanceId = 1;

    this.screenConfigManager.saveAutoSave(migrated);
    this.restoreViewsFromState();
  }

  public loadNamedLayout(name: string): void {
    const payload = this.screenConfigManager.loadNamed(name);
    if (!payload) {
      console.error(`loadNamedLayout: no layout found for "${name}".`);
      return;
    }

    const instanceIds = Array.from(this.activeViews.keys());
    instanceIds.forEach(id => {
      const wrapper = this.activeViews.get(id);
      if (wrapper) wrapper.destroy();
    });
    this.activeViews.clear();
    this.nextInstanceId = 1;

    this.screenConfigManager.saveAutoSave(payload);
    this.restoreViewsFromState();
  }

  private _buildSaveState(): FloatingViewManagerSaveState {
    const refGrid = viewportGridSize(this.viewAreaElement);
    const stateToSave: FloatingViewManagerSaveState = {
      referenceGrid: refGrid,
      openViews: {},
      nextZIndex: this.currentMaxZIndex,
      links: this.linkManager?.getLinks() ?? [],
    };
    this.activeViews.forEach((wrapper, instanceId) => {
      const s = wrapper["state"] as FloatingViewInstanceState;
      // Compute grid-unit coordinates from current pixel position/size.
      const gridPosition = {
        col: pixelToGridCol(s.position.x),
        row: pixelToGridRow(s.position.y),
      };
      const gridSize = s.size
        ? { cols: pixelToGridCol(s.size.width), rows: pixelToGridRow(s.size.height) }
        : undefined;
      // Build the entry without pixel-only fields.
      const entry: FloatingViewInstanceState = {
        instanceId: s.instanceId,
        viewId: s.viewId,
        position: s.position, // runtime field; excluded from JSON by _stripRuntime
        size: s.size,          // runtime field; excluded below
        gridPosition,
        gridSize,
        zIndex: s.zIndex,
        viewState: s.viewState,
        orientationOverride: s.orientationOverride,
        zoomActive: s.zoomActive,
      };
      stateToSave.openViews[instanceId] = entry;
    });
    return stateToSave;
  }

  /** Builds the stripped (runtime-fields-excluded) payload for persistence. */
  private _buildStrippedPayload(): CurrentPayload {
    const saveState = this._buildSaveState();
    return {
      ...saveState,
      links: saveState.links ?? [],
      openViews: Object.fromEntries(
        Object.entries(saveState.openViews).map(([id, s]) => {
          const { position: _p, size: _sz, ...persisted } = s;
          return [id, persisted];
        })
      ),
    } as CurrentPayload;
  }

  private saveState(): void {
    this.screenConfigManager.saveAutoSave(this._buildStrippedPayload());
  }

  private loadState(): FloatingViewManagerSaveState | null {
    return this.screenConfigManager.loadAutoSave() as FloatingViewManagerSaveState | null;
  }
}
