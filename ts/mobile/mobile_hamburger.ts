import { MobileViewManager } from './mobile_view_manager';
import { getNavSectionGroups, NavEntry, Visibility } from '../reference_page/nav_registry';
import { InstrumentName } from '../fretboard/fretboard';
import { AppSettings } from '../settings';
import { getViewIcon } from '../panels/panel_registry';

export class MobileHamburger {
    private overlayEl!: HTMLElement;
    private drawerEl!: HTMLElement;
    private built = false;

    constructor(
        private container: HTMLElement,
        private viewManager: MobileViewManager,
        private getSettings: () => AppSettings,
        private onClose: () => void,
    ) {}

    public open(): void {
        if (!this.built) this.build();
        this.refresh();
        this.overlayEl.classList.add('is-open');
        this.drawerEl.classList.add('is-open');
    }

    public close(): void {
        if (!this.built) return;
        this.overlayEl.classList.remove('is-open');
        this.drawerEl.classList.remove('is-open');
    }

    private build(): void {
        this.built = true;

        this.overlayEl = document.createElement('div');
        this.overlayEl.className = 'mobile-menu-overlay';
        this.overlayEl.addEventListener('click', () => this.close());

        this.drawerEl = document.createElement('aside');
        this.drawerEl.className = 'mobile-menu-drawer';

        const header = document.createElement('div');
        header.className = 'mobile-menu-header';
        header.innerHTML = `
            <span class="material-icons mobile-menu-app-icon">music_note</span>
            <span class="mobile-menu-app-name">PracTempo</span>
        `;
        const closeBtn = document.createElement('button');
        closeBtn.className = 'mobile-menu-close';
        closeBtn.innerHTML = '<span class="material-icons">close</span>';
        closeBtn.addEventListener('click', () => this.close());
        header.appendChild(closeBtn);

        const nav = document.createElement('nav');
        nav.className = 'mobile-menu-nav';
        nav.dataset.navContainer = '1';

        this.drawerEl.append(header, nav);
        this.container.append(this.overlayEl, this.drawerEl);
    }

    private refresh(): void {
        const nav = this.drawerEl.querySelector<HTMLElement>('[data-nav-container]');
        if (!nav) return;
        nav.innerHTML = '';

        const instrument = this.getSettings().instrumentSettings?.instrument ?? InstrumentName.Guitar;

        for (const group of getNavSectionGroups()) {
            const visible = group.entries.filter(
                e => e.visibility !== Visibility.Desktop &&
                     (!e.requiredInstruments || e.requiredInstruments.includes(instrument as string))
            );
            if (visible.length === 0) continue;

            const label = document.createElement('div');
            label.className = 'mobile-menu-section-label';
            label.textContent = group.label;
            nav.appendChild(label);

            for (const entry of visible) {
                nav.appendChild(this.buildItem(entry));
            }
        }
    }

    private buildItem(entry: NavEntry): HTMLButtonElement {
        const existingId = this.viewManager.isViewOpen(entry.viewId);
        const isOpen = !!existingId;

        const item = document.createElement('button');
        item.className = 'mobile-menu-item' + (isOpen ? ' is-active' : '');
        item.innerHTML = `
            <span class="material-icons">${getViewIcon(entry.viewId)}</span>
            <span>${entry.label}</span>
            ${isOpen ? '<span class="mobile-menu-badge">OPEN</span>' : ''}
        `;
        item.addEventListener('click', () => {
            if (existingId) {
                this.viewManager.activateView(existingId);
            } else {
                this.viewManager.openView({ viewId: entry.viewId });
            }
            this.close();
            this.onClose();
        });
        return item;
    }
}
