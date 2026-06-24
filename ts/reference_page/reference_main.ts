import { SidebarView } from "./sidebar_view";
import { FloatingViewManager } from '../panels/panel_host';
import { AppSettings, InstrumentSettings, loadSettings, SETTINGS_STORAGE_KEY } from "../settings";
import { ThemeManager, Theme } from "../theme_manager";
import { instrumentCategory } from "../fretboard/fretboard_category";
import { SettingsManager } from "../settings_manager";
import { LinkManager } from '../panels/link_manager';
import { registerCategory } from '../feature_registry';
import { registerFloatingView } from '../panels/panel_registry';
import { registerDriveSource, registerDriveTarget, registerBroadcastSource } from '../panels/drive_registry';
import { VIEW_MODULES } from '../modules/manifest';
import { ViewModule } from '../modules/module_types';
import { registerNavEntry, getNavEntries } from './nav_registry';
import { FloatingViewDescriptor, FretboardFloatingViewDescriptor } from '../panels/panel_types';
import { setFloatingViewGridSize, setFloatingViewContentOriginX, GRID_UNIT } from '../panels/panel_wrapper';
import { initOnboarding } from '../onboarding/onboarding_tour';
import { ScreenConfigManager } from '../screen_config/screen_config_manager';
import { consumeLayoutParam, consumeLeftyParam } from './url_params';


function moduleToDescriptor(mod: ViewModule): FloatingViewDescriptor {
  const isFretboard = !!(mod.panel.capabilities?.rotate || mod.panel.capabilities?.zoom);
  const base: FloatingViewDescriptor = {
    viewId: mod.id,
    displayName: mod.panel.displayName,
    icon: mod.panel.icon,
    // Grid footprints pass straight through — px is derived later against the live cell.
    size: mod.panel.size,
    sizeHorizontal: mod.panel.sizeHorizontal,
    showInMenu: mod.panel.showInMenu ?? true,
    singleton: mod.panel.singleton,
    refreshOnInstrumentChange: mod.panel.refreshOnInstrumentChange,
    featureTypeName: mod.panel.featureTypeName,
    supportsConfigToggle: mod.panel.capabilities?.configToggle,
    createView: (state, appSettings) => mod.createView({ appSettings: appSettings! }, state),
  };
  if (!isFretboard) return base;
  return {
    ...base,
    isFretboardView: true as const,
    supportsRotate: !!mod.panel.capabilities?.rotate,
    supportsZoom: !!mod.panel.capabilities?.zoom,
  } as FretboardFloatingViewDescriptor;
}

class ReferencePage {
    private floatingViewManager: FloatingViewManager;
    private settings: AppSettings;
    private settingsManager: SettingsManager;
    private sidebarView: SidebarView | null = null;
    private themeManager: ThemeManager;

    constructor() {
        registerCategory(instrumentCategory);
        for (const mod of VIEW_MODULES) {
            registerFloatingView(moduleToDescriptor(mod));
            if (mod.drive?.sources) {
                for (const src of mod.drive.sources) registerDriveSource(src);
            }
            if (mod.drive?.targets) {
                for (const tgt of mod.drive.targets) registerDriveTarget(tgt);
            }
            if (mod.drive?.broadcast) {
                registerBroadcastSource(mod.id);
            }
            if (mod.nav) {
                registerNavEntry({
                    viewId: mod.id,
                    label: mod.nav.label,
                    section: mod.nav.section,
                    visibility: mod.nav.visibility,
                    requiredInstruments: mod.nav.requiredInstruments,
                });
            }
        }

        this.settings = loadSettings();

        // A ?lefty URL param flips the handedness preference (left-handed fretboards);
        // ?lefty=false forces right-handed. Apply-once: persist the flip so it sticks
        // across reloads (the param is stripped from the URL by consumeLeftyParam), then
        // everything below — views, settings modal, sidebar — reads the updated value.
        const handedness = consumeLeftyParam();
        if (handedness && handedness !== this.settings.instrumentSettings.handedness) {
            this.settings = {
                ...this.settings,
                instrumentSettings: { ...this.settings.instrumentSettings, handedness },
            };
            try {
                localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
            } catch (e) {
                console.error("Failed to persist handedness from URL param:", e);
            }
        }

        this.themeManager = new ThemeManager(this.settings.theme);

        const screenConfigManager = new ScreenConfigManager('floatingViewStates_reference', 'reference');
        this.floatingViewManager = new FloatingViewManager(this.settings, screenConfigManager);
        // Re-paint the grid background + drag-snap whenever the geometry callback fires
        // (page load / resize). The cell itself is viewport-derived and layout-independent.
        this.floatingViewManager.setGeometryChangedCallback(() => this._applyGrid());

        // Wire up the link/drive system
        const viewAreaEl = document.getElementById('floating-view-area');
        if (viewAreaEl) {
            const linkManager = new LinkManager(
                viewAreaEl,
                (id) => this.floatingViewManager.getWrapperElement(id),
                (id) => this.floatingViewManager.getViewId(id),
                (id) => this.floatingViewManager.getContentElement(id),
                (id) => this.floatingViewManager.getFeatureTypeName(id),
                (id) => this.floatingViewManager.getSink(id),
            );
            this.floatingViewManager.setLinkManager(linkManager);
        }

        this.settingsManager = new SettingsManager(this.settings, (newSettings) => {
            this.saveSettings(newSettings);
            this.applySettings();
        });

        const sidebarContainer = document.getElementById('side-bar');
        if (sidebarContainer) {
            this.sidebarView = new SidebarView(
                sidebarContainer,
                (viewId, featureTypeName) => this.handleFeatureClick(viewId, featureTypeName),
                this.floatingViewManager,
                this.settings,
                (theme) => this.handleThemeChange(theme),
                (ct) => this.saveSettings({ ...this.settings, customTunings: ct }),
                () => (window as any).Onb?.replay()
            );
        }

        // Settings button is re-rendered inside sidebar on each refresh, so wire it up after render.
        this._wireSettingsButton();

        // Give TabbedLayout (mobile) access to the settings modal.
        this.floatingViewManager.setSettingsCallback(() => this.settingsManager.open());

        // A ?layout=<preset> URL param (e.g. /?layout=reference) opens the page on a
        // built-in starter layout. It overwrites the auto-save for this load only — the
        // param is stripped from the URL (apply-once) so a later reload keeps the user's
        // edits instead of resetting to the preset. Unknown keys fall through to the
        // normal auto-save restore below.
        const urlLayout = consumeLayoutParam(screenConfigManager);
        if (urlLayout) screenConfigManager.saveAutoSave(urlLayout);

        this.applySettings();
        // Initial page load: refresh the viewport-derived grid cell now that the sidebar
        // has rendered (its width feeds the cell + content origin).
        this.floatingViewManager.restoreViewsFromState({ recomputeCell: true });

        // Recompute grid cell size when the window resizes (keeps snap aligned with grid)
        let _gridResizeTimer: ReturnType<typeof setTimeout> | null = null;
        window.addEventListener('resize', () => {
            if (_gridResizeTimer !== null) clearTimeout(_gridResizeTimer);
            _gridResizeTimer = setTimeout(() => { _gridResizeTimer = null; this._applyGrid(); }, 150);
        });

        initOnboarding(this.floatingViewManager);
    }

    private _wireSettingsButton(): void {
        const settingsButton = document.getElementById('settings-button');
        if (settingsButton) {
            settingsButton.onclick = () => this.settingsManager.open();
        }
    }

    private handleFeatureClick(viewId: string, featureTypeName?: string): void {
        const featureDescriptor = featureTypeName ? instrumentCategory.getFeatureTypes().get(featureTypeName) : undefined;
        const title = featureTypeName
            ? (featureDescriptor?.displayName ?? featureTypeName)
            : undefined;

        const viewState = { featureTypeName };

        this.floatingViewManager.spawnView(viewId, { viewState, title });
    }

    private saveSettings(newSettings: AppSettings): void {
        try {
            const prevInstrumentSettings = this.settings.instrumentSettings;
            localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(newSettings));
            this.settings = newSettings;
            this.themeManager.apply(newSettings.theme);
            this.settingsManager?.updateSettings(newSettings);
            if (this.floatingViewManager) {
                // Close panels the new instrument/tuning no longer supports before
                // re-rendering the rest, so doomed panels aren't repainted first.
                this._closeIncompatiblePanels(prevInstrumentSettings, newSettings.instrumentSettings);
                this.floatingViewManager.applySettingsChange(newSettings);
            }
            // Refresh sidebar so instrument-dependent buttons update.
            if (this.sidebarView) {
                this.sidebarView.refresh(newSettings);
                this._wireSettingsButton();
            }
        } catch (e) {
            console.error("Failed to save settings to localStorage:", e);
            alert("Error saving settings.");
        }
    }

    /**
     * When the instrument or tuning changes, close any open panels that are no
     * longer compatible — reusing the same `requiredInstruments` / tuning gates
     * that hide tools from the sidebar. Prevents e.g. a CAGED or chord panel from
     * lingering and rendering nonsensical shapes after switching to bass.
     */
    private _closeIncompatiblePanels(prev: InstrumentSettings, next: InstrumentSettings): void {
        const instrumentChanged = prev.instrument !== next.instrument;
        const tuningChanged = prev.tuning !== next.tuning;
        if (!instrumentChanged && !tuningChanged) return;

        const nextInstrument = next.instrument as string;
        const nextTuning = next.tuning;
        const navRequired = new Map<string, readonly string[] | undefined>(
            getNavEntries().map((e) => [e.viewId, e.requiredInstruments]),
        );
        const featureTypes = instrumentCategory.getFeatureTypes();

        for (const id of this.floatingViewManager.getOpenInstanceIds()) {
            const viewId = this.floatingViewManager.getViewId(id);
            if (!viewId) continue;

            let incompatible = false;
            const required = navRequired.get(viewId);
            if (required && !required.includes(nextInstrument)) incompatible = true;

            if (!incompatible) {
                const ftName = this.floatingViewManager.getFeatureTypeName(id);
                const ft = ftName ? featureTypes.get(ftName) : undefined;
                if (ft?.requiredInstruments && !ft.requiredInstruments.includes(nextInstrument)) {
                    incompatible = true;
                } else if (ft?.isCompatibleWithTuning && !ft.isCompatibleWithTuning(nextInstrument, nextTuning)) {
                    incompatible = true;
                }
            }

            if (incompatible) this.floatingViewManager.destroyView(id);
        }
    }

    private handleThemeChange(theme: Theme): void {
        const newSettings = { ...this.settings, theme };
        this.saveSettings(newSettings);
        this.applySettings();
    }

    private applySettings(): void {
        this.themeManager.apply(this.settings.theme);
        this._applyGrid();
    }

    private _applyGrid(): void {
        const viewAreaEl = document.getElementById('floating-view-area');
        if (!viewAreaEl) return;
        // Use the live (viewport-derived) geometry so the grid background + drag-snap
        // match the cell the panels are rendered at.
        const g = this.floatingViewManager.getGridGeometry();
        // Keep panels out from behind the sidebar regardless of the grid overlay.
        setFloatingViewContentOriginX(g.originX);

        const enabled = !!this.settings.showGrid;
        viewAreaEl.classList.toggle('grid-active', enabled);
        if (enabled) {
            // Square snap + square graph-paper, aligned to the content origin.
            setFloatingViewGridSize({ w: g.cell, h: g.cell });
            viewAreaEl.style.setProperty('--grid-cell-w', `${g.cell}px`);
            viewAreaEl.style.setProperty('--grid-cell-h', `${g.cell}px`);
            viewAreaEl.style.setProperty('--grid-origin-x', `${g.originX}px`);
        } else {
            setFloatingViewGridSize(null);
            viewAreaEl.style.removeProperty('--grid-cell-w');
            viewAreaEl.style.removeProperty('--grid-cell-h');
            viewAreaEl.style.removeProperty('--grid-origin-x');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ReferencePage();
});
