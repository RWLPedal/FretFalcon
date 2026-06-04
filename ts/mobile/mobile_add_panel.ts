import { MobileViewManager } from './mobile_view_manager';
import { NAV_SECTIONS, Visibility, NavButton } from '../reference_page/nav_sections';
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
        const instrument = this.getSettings().instrumentSettings?.instrument ?? 'Guitar';
        const allButtons: NavButton[] = [];

        for (const section of NAV_SECTIONS) {
            for (const btn of section.buttons) {
                if (btn.visibility !== Visibility.DESKTOP &&
                    (!btn.requiredInstruments || btn.requiredInstruments.includes(instrument))) {
                    allButtons.push(btn);
                }
            }
        }

        const openCount = this.viewManager.getAllViews().length;
        this.countEl.textContent = `${openCount} of ${allButtons.length} OPEN`;

        this.listEl.innerHTML = '';
        for (const btn of allButtons) {
            this.listEl.appendChild(this.buildCard(btn));
        }
    }

    private buildCard(btn: NavButton): HTMLElement {
        const existingId = this.viewManager.isViewOpen(btn.viewId, btn.featureTypeName);
        const isOpen = !!existingId;

        const card = document.createElement('div');
        card.className = 'mobile-add-card';

        const iconBox = document.createElement('div');
        iconBox.className = 'mobile-add-card-icon';
        iconBox.innerHTML = `<span class="material-icons">${getViewIcon(btn.viewId)}</span>`;

        const info = document.createElement('div');
        info.className = 'mobile-add-card-info';
        info.innerHTML = `
            <div class="mobile-add-card-name">${btn.label}</div>
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
                this.viewManager.openView(btn);
            }
            this.close();
            this.onClose();
        });

        return card;
    }
}
