import { MobileViewManager } from './mobile_view_manager';
import { getNavSectionGroups, NavEntry, Visibility } from '../reference_page/nav_registry';
import { InstrumentName } from '../fretboard/fretboard';
import { AppSettings } from '../settings';
import { getViewIcon } from '../panels/panel_registry';

export class MobileAddPanel {
    private panelEl!: HTMLElement;
    private countEl!: HTMLElement;
    private listEl!: HTMLElement;
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
        this.panelEl.classList.add('is-open');
    }

    public close(): void {
        if (!this.built) return;
        this.panelEl.classList.remove('is-open');
    }

    private build(): void {
        this.built = true;

        this.panelEl = document.createElement('div');
        this.panelEl.className = 'mobile-add-panel';

        const header = document.createElement('div');
        header.className = 'mobile-add-panel-header';

        const title = document.createElement('span');
        title.className = 'mobile-add-panel-title';
        title.textContent = 'Add another view';

        this.countEl = document.createElement('span');
        this.countEl.className = 'mobile-add-panel-count';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'mobile-add-panel-close';
        closeBtn.innerHTML = '<span class="material-icons">close</span>';
        closeBtn.addEventListener('click', () => this.close());

        header.append(title, this.countEl, closeBtn);

        this.listEl = document.createElement('div');
        this.listEl.className = 'mobile-add-panel-list';

        this.panelEl.append(header, this.listEl);
        this.container.appendChild(this.panelEl);
    }

    private refresh(): void {
        const instrument = this.getSettings().instrumentSettings?.instrument ?? InstrumentName.Guitar;
        const allEntries: NavEntry[] = [];

        for (const group of getNavSectionGroups()) {
            for (const entry of group.entries) {
                if (entry.visibility !== Visibility.Desktop &&
                    (!entry.requiredInstruments || entry.requiredInstruments.includes(instrument as string))) {
                    allEntries.push(entry);
                }
            }
        }

        const openCount = this.viewManager.getAllViews().length;
        this.countEl.textContent = `${openCount} of ${allEntries.length} OPEN`;

        this.listEl.innerHTML = '';
        for (const entry of allEntries) {
            this.listEl.appendChild(this.buildCard(entry));
        }
    }

    private buildCard(entry: NavEntry): HTMLElement {
        const existingId = this.viewManager.isViewOpen(entry.viewId);
        const isOpen = !!existingId;

        const card = document.createElement('div');
        card.className = 'mobile-add-card';

        const iconBox = document.createElement('div');
        iconBox.className = 'mobile-add-card-icon';
        iconBox.innerHTML = `<span class="material-icons">${getViewIcon(entry.viewId)}</span>`;

        const info = document.createElement('div');
        info.className = 'mobile-add-card-info';
        info.innerHTML = `
            <div class="mobile-add-card-name">${entry.label}</div>
        `;

        card.append(iconBox, info);

        if (isOpen) {
            const badge = document.createElement('span');
            badge.className = 'mobile-add-card-badge is-open';
            badge.textContent = 'ON SCREEN';
            card.appendChild(badge);
        }

        const arrow = document.createElement('div');
        arrow.className = 'mobile-add-card-arrow';
        arrow.innerHTML = '<span class="material-icons">chevron_right</span>';
        card.appendChild(arrow);

        card.addEventListener('click', () => {
            if (existingId) {
                this.viewManager.activateView(existingId);
            } else {
                this.viewManager.openView({ viewId: entry.viewId });
            }
            this.close();
            this.onClose();
        });

        return card;
    }
}
