export const SIDEBAR_CONTAINER_CLASS = 'side-bar-container';
export const SIDEBAR_LAYOUT_PICKER_CLASS = 'sidebar-layout-picker';
export const SIDEBAR_TOOLS_BAR_CLASS = 'sidebar-tools-bar';

import { FloatingViewManager } from '../panels/panel_host';
import { VolumeControl } from '../core/widgets/volume_control';
import { AppSettings } from '../settings';
import { InstrumentSettings } from '../fretboard/fretboard_settings';
import { Theme } from '../theme_manager';
import { ThemeSwatchPicker } from '../core/widgets/theme_swatch_picker';
import { getNavSectionGroups } from './nav_registry';
import { InstrumentName } from '../fretboard/instruments';
import { DEFAULT_CONFIG_OPTIONS } from '../screen_config/default_configs';
import { getViewIcon } from '../panels/panel_registry';
import { brandLockupHtml } from '../branding';

export class SidebarView {
    private container: HTMLElement;
    private isCollapsed = false;
    private isZenMode = false;

    constructor(
        container: HTMLElement,
        private onFeatureClick: (viewId: string, featureTypeName?: string) => void,
        private floatingViewManager?: FloatingViewManager,
        private appSettings?: AppSettings,
        private onThemeChange?: (theme: Theme) => void,
        private onImportCustomTunings?: (ct: AppSettings['customTunings']) => void,
        private onHelpClick?: () => void
    ) {
        this.container = container;
        this.render();
        this.addBottomBarListeners();
    }

    public refresh(newSettings: AppSettings): void {
        this.appSettings = newSettings;
        this.render();
        this.addBottomBarListeners();
    }

    private getActiveInstrument(): InstrumentName {
        if (!this.appSettings) return InstrumentName.Guitar;
        return this.appSettings?.instrumentSettings?.instrument ?? InstrumentName.Guitar;
    }

    private getCurrentTheme(): Theme {
        return (this.appSettings?.theme as Theme) ?? Theme.WARM;
    }

    private render(): void {
        const instrument = this.getActiveInstrument();
        const currentTheme = this.getCurrentTheme();

        let html = `
            <div class="sidebar-header">
                ${brandLockupHtml('sm')}
                <button id="help-tour-btn" class="sidebar-help-btn" title="Take the tour">
                    <span class="material-icons">help_outline</span>
                </button>
            </div>
            <nav class="sidebar-nav">
        `;

        for (const group of getNavSectionGroups()) {
            const visibleEntries = group.entries.filter(
                (e) => !e.requiredInstruments || e.requiredInstruments.includes(instrument as string)
            );
            if (visibleEntries.length === 0) continue;

            html += `<div class="sidebar-section-label">${group.label}</div>`;
            for (const entry of visibleEntries) {
                const btnId = `nav-btn-${entry.viewId}`;
                html += `
                    <button id="${btnId}" class="sidebar-nav-btn"
                        data-view-id="${entry.viewId}">
                        <span class="material-icons">${getViewIcon(entry.viewId)}</span>
                        <span>${entry.label}</span>
                    </button>
                `;
            }
        }

        html += `</nav>`;

        const collapseIcon = this.isCollapsed ? 'chevron_right' : 'chevron_left';
        const collapseTitle = this.isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
        html += `
            <div class="sidebar-footer">
                <div class="sidebar-layout-picker">
                    <div class="select is-fullwidth">
                        <select id="sidebar-layout-select">
                            <option value="">— Layout —</option>
                            ${DEFAULT_CONFIG_OPTIONS.map(o => `<option value="default:${o.key}">${o.label}</option>`).join('')}
                        </select>
                    </div>
                    <button id="cleanup-layout-button" class="topbar-icon-button" title="Tidy up panels">
                        <span class="material-icons">auto_awesome_mosaic</span>
                    </button>
                </div>
                <div class="sidebar-theme-picker">
                    <span class="sidebar-theme-label">Theme</span>
                    <div id="sidebar-theme-picker-mount"></div>
                </div>
                <div class="sidebar-tools-bar">
                    <button id="save-layout-button" class="topbar-icon-button" title="Save window layout">
                        <span class="material-icons">save</span>
                    </button>
                    <button id="load-layout-button" class="topbar-icon-button" title="Load window layout">
                        <span class="material-icons">folder_open</span>
                    </button>
                    <div id="sidebar-volume-ctrl"></div>
                    <button id="settings-button" class="topbar-icon-button" title="Settings">
                        <span class="material-icons">settings</span>
                    </button>
                    <button id="zen-mode-btn" class="topbar-icon-button${this.isZenMode ? ' is-active' : ''}" title="${this.isZenMode ? 'Exit Zen Mode' : 'Enter Zen Mode'}">
                        <span class="material-icons">self_improvement</span>
                    </button>
                    <button id="sidebar-collapse-btn" class="topbar-icon-button sidebar-collapse-btn--far-right" title="${collapseTitle}">
                        <span class="material-icons">${collapseIcon}</span>
                    </button>
                </div>
            </div>
        `;

        this.container.innerHTML = html;
        this.applyCollapsedState();
        this.applyZenMode();

        const themeMount = this.container.querySelector<HTMLElement>('#sidebar-theme-picker-mount');
        if (themeMount) {
            const picker = new ThemeSwatchPicker(currentTheme, 'compact', (theme) => this.onThemeChange?.(theme));
            themeMount.appendChild(picker.el);
        }

        // Wire collapse toggle
        const collapseBtn = document.getElementById('sidebar-collapse-btn');
        if (collapseBtn) {
            collapseBtn.addEventListener('click', () => {
                this.isCollapsed = !this.isCollapsed;
                this.applyCollapsedState();
                const icon = collapseBtn.querySelector<HTMLElement>('.material-icons');
                if (icon) icon.textContent = this.isCollapsed ? 'chevron_right' : 'chevron_left';
                collapseBtn.title = this.isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
            });
        }

        // Wire zen mode toggle
        const zenBtn = document.getElementById('zen-mode-btn');
        if (zenBtn) {
            zenBtn.addEventListener('click', () => {
                this.isZenMode = !this.isZenMode;
                this.applyZenMode();
                zenBtn.classList.toggle('is-active', this.isZenMode);
                zenBtn.title = this.isZenMode ? 'Exit Zen Mode' : 'Enter Zen Mode';
            });
        }

        // Wire nav buttons
        for (const group of getNavSectionGroups()) {
            for (const entry of group.entries) {
                const el = document.getElementById(`nav-btn-${entry.viewId}`);
                if (el) {
                    el.addEventListener('click', (e) => {
                        const viewId = (e.currentTarget as HTMLElement).dataset.viewId;
                        if (viewId) this.onFeatureClick(viewId);
                    });
                }
            }
        }

        // Wire layout selector
        const layoutSelect = document.getElementById('sidebar-layout-select') as HTMLSelectElement | null;
        if (layoutSelect && this.floatingViewManager) {
            const manager = this.floatingViewManager;
            layoutSelect.addEventListener('change', () => {
                const name = layoutSelect.value;
                if (name) {
                    manager.loadNamedLayout(name);
                }
            });
        }

    }

    private applyCollapsedState(): void {
        this.container.classList.toggle('is-collapsed', this.isCollapsed);
    }

    private applyZenMode(): void {
        document.body.classList.toggle('is-zen-mode', this.isZenMode);
    }

    private addBottomBarListeners(): void {
        const volSlot = document.getElementById('sidebar-volume-ctrl');
        if (volSlot) {
            volSlot.appendChild(new VolumeControl().el);
        }

        const helpBtn = document.getElementById('help-tour-btn');
        if (helpBtn && this.onHelpClick) {
            helpBtn.addEventListener('click', this.onHelpClick);
        }

        if (this.floatingViewManager) {
            const manager = this.floatingViewManager;

            const cleanupBtn = document.getElementById('cleanup-layout-button');
            if (cleanupBtn) {
                cleanupBtn.addEventListener('click', () => {
                    manager.cleanupLayout();
                });
            }

            const saveBtn = document.getElementById('save-layout-button');
            if (saveBtn) {
                saveBtn.addEventListener('click', () => {
                    const json = manager.exportStateJson();
                    const blob = new Blob([json], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'reference-layout.json';
                    a.click();
                    URL.revokeObjectURL(url);
                });
            }

            const loadBtn = document.getElementById('load-layout-button');
            if (loadBtn) {
                loadBtn.addEventListener('click', () => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.json,application/json';
                    input.addEventListener('change', () => {
                        const file = input.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            try {
                                const json = e.target?.result as string;
                                manager.importStateJson(json, this.onImportCustomTunings);
                            } catch (err) {
                                console.error('Failed to load layout file:', err);
                                alert('Could not load layout: the file may be invalid.');
                            }
                        };
                        reader.readAsText(file);
                    });
                    input.click();
                });
            }
        }
    }
}
