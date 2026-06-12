import { SidebarView } from "./sidebar_view";
import { FloatingViewManager } from '../panels/panel_manager';
import { AppSettings, loadSettings, SETTINGS_STORAGE_KEY } from "../settings";
import { ThemeManager, Theme } from "../theme_manager";
import { instrumentCategory } from "../fretboard/fretboard_category";
import { TriadFeature } from "../fretboard/features/triad_feature";
import { SettingsManager } from "../settings_manager";
import { LinkManager } from '../panels/link_manager';
import { registerCategory } from '../feature_registry';
import { registerFloatingView } from '../panels/panel_registry';
import { registerDriveSource, registerDriveTarget, registerBroadcastSource } from '../panels/drive_registry';
import { VIEW_MODULES } from '../modules/manifest';
import { ViewModule } from '../modules/module_types';
import { registerNavEntry } from './nav_registry';
import { FloatingViewDescriptor, FretboardFloatingViewDescriptor } from '../panels/panel_types';
import { setFloatingViewGridSize, GRID_UNIT } from '../panels/panel_wrapper';
import { initOnboarding } from '../onboarding/onboarding_tour';
import { ScreenConfigManager } from '../screen_config/screen_config_manager';


function moduleToDescriptor(mod: ViewModule): FloatingViewDescriptor {
  const isFretboard = !!(mod.panel.capabilities?.rotate || mod.panel.capabilities?.zoom);
  const base: FloatingViewDescriptor = {
    viewId: mod.id,
    displayName: mod.panel.displayName,
    icon: mod.panel.icon,
    defaultWidth: mod.panel.defaultSize?.width,
    defaultHeight: mod.panel.defaultSize?.height,
    minWidth: mod.panel.minSize?.width,
    minHeight: mod.panel.minSize?.height,
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
        this.themeManager = new ThemeManager(this.settings.theme);

        const screenConfigManager = new ScreenConfigManager('floatingViewStates_reference', 'reference');
        this.floatingViewManager = new FloatingViewManager(this.settings, screenConfigManager);

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

        this.applySettings();
        this.floatingViewManager.restoreViewsFromState();

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

        // Feature-specific default window size (used only on first spawn; saved state takes precedence).
        const size = featureTypeName === TriadFeature.typeName
            ? { width: TriadFeature.defaultWidth, height: TriadFeature.defaultHeight }
            : undefined;

        this.floatingViewManager.spawnView(viewId, { viewState, title, size });
    }

    private saveSettings(newSettings: AppSettings): void {
        try {
            localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(newSettings));
            this.settings = newSettings;
            this.themeManager.apply(newSettings.theme);
            this.settingsManager?.updateSettings(newSettings);
            if (this.floatingViewManager) {
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
        const enabled = !!this.settings.showGrid;
        viewAreaEl.classList.toggle('grid-active', enabled);
        setFloatingViewGridSize(enabled ? GRID_UNIT : null);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ReferencePage();
});
