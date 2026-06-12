import { AppSettings } from '../settings';
import { MobileViewManager } from './mobile_view_manager';
import { MobileLayout } from './mobile_layout';
import { MobileHamburger } from './mobile_hamburger';
import { MobileAddPanel } from './mobile_add_panel';
import { MobileSettingsDrawer } from './mobile_settings';

const MOBILE_BREAKPOINT = '(max-width: 768px)';

export class MobileController {
    private mql: MediaQueryList;
    private appSettings: AppSettings;
    private initialized = false;
    private _orientationTimer: ReturnType<typeof setTimeout> | null = null;

    private viewManager: MobileViewManager | null = null;
    private layout: MobileLayout | null = null;
    private hamburger: MobileHamburger | null = null;
    private addPanel: MobileAddPanel | null = null;
    private settingsDrawer: MobileSettingsDrawer | null = null;

    constructor(
        private rootEl: HTMLElement,
        appSettings: AppSettings,
        private _onSettingChanged: (s: AppSettings) => void,
    ) {
        this.appSettings = appSettings;
        this.mql = window.matchMedia(MOBILE_BREAKPOINT);

        this.mql.addEventListener('change', (e) => {
            if (e.matches) this.init();
        });

        window.addEventListener('resize', () => {
            if (!this.mql.matches) return;
            if (this._orientationTimer !== null) clearTimeout(this._orientationTimer);
            this._orientationTimer = setTimeout(() => {
                this._orientationTimer = null;
                this.viewManager?.recreateFretboardViews();
            }, 150);
        });

        if (this.mql.matches) this.init();
    }

    public applySettings(newSettings: AppSettings): void {
        const instrumentChanged =
            JSON.stringify(this.appSettings.instrumentSettings) !==
            JSON.stringify(newSettings.instrumentSettings);
        const themeChanged = this.appSettings.theme !== newSettings.theme;
        this.appSettings = newSettings;
        this.viewManager?.updateSettings(newSettings);
        if (instrumentChanged || themeChanged) {
            this.viewManager?.recreateFretboardViews();
        }
    }

    private init(): void {
        if (this.initialized) return;
        this.initialized = true;

        // Step 1: build DOM shell and expose the view area element.
        this.layout = new MobileLayout(
            this.rootEl,
            () => this.hamburger?.open(),
            () => this.addPanel?.open(),
            () => this.settingsDrawer?.open(),
        );

        // Step 2: create MobileViewManager with the real view area element.
        this.viewManager = new MobileViewManager(
            this.layout.getViewArea(),
            this.appSettings,
        );

        // Step 3: wire layout ↔ viewManager.
        this.layout.setViewManager(this.viewManager);

        // Step 4: create overlays/panels (appended to rootEl, z-indexed above).
        this.hamburger = new MobileHamburger(
            this.rootEl,
            this.viewManager,
            () => this.appSettings,
            () => {},
        );

        this.addPanel = new MobileAddPanel(
            this.rootEl,
            this.viewManager,
            () => this.appSettings,
            () => {},
        );

        this.settingsDrawer = new MobileSettingsDrawer(
            this.rootEl,
            () => this.appSettings,
            (s) => this._onSettingChanged(s),
        );

        // Step 5: restore previously open mobile views.
        this.viewManager.restoreState();
    }
}
