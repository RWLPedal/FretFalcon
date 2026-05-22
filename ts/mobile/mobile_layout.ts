import { MobileViewManager } from './mobile_view_manager';

export class MobileLayout {
    private headerTitleEl!: HTMLElement;
    private bottomTrackEl!: HTMLElement;
    private viewAreaEl!: HTMLElement;
    private viewManager: MobileViewManager | null = null;

    constructor(
        private container: HTMLElement,
        private onOpenMenu: () => void,
        private onOpenAddPanel: () => void,
        private onOpenSettings: () => void,
    ) {
        this.buildShell();
    }

    /** Call after MobileViewManager is constructed to wire up reactive updates. */
    public setViewManager(vm: MobileViewManager): void {
        this.viewManager = vm;
        vm.onChanged = () => {
            this.updateHeader();
            this.updateBottomBar();
        };
        this.updateHeader();
        this.updateBottomBar();
    }

    public getViewArea(): HTMLElement {
        return this.viewAreaEl;
    }

    private buildShell(): void {
        this.container.innerHTML = '';

        // Header
        const header = document.createElement('header');
        header.className = 'mobile-header';

        const iconEl = document.createElement('span');
        iconEl.className = 'material-icons mobile-header-icon';
        iconEl.textContent = 'music_note';

        this.headerTitleEl = document.createElement('span');
        this.headerTitleEl.className = 'mobile-header-title';
        this.headerTitleEl.textContent = 'PracTempo';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'mobile-header-btn mobile-header-close-btn';
        closeBtn.title = 'Close view';
        closeBtn.innerHTML = '<span class="material-icons">close</span>';
        closeBtn.addEventListener('click', () => {
            const active = this.viewManager?.getActiveView();
            if (active) this.viewManager?.closeView(active.instanceId);
        });

        const menuBtn = document.createElement('button');
        menuBtn.className = 'mobile-header-btn mobile-header-menu-btn';
        menuBtn.title = 'Menu';
        menuBtn.innerHTML = '<span class="material-icons">menu</span>';
        menuBtn.addEventListener('click', () => this.onOpenMenu());

        const settingsBtn = document.createElement('button');
        settingsBtn.className = 'mobile-header-btn mobile-header-settings-btn';
        settingsBtn.title = 'Settings';
        settingsBtn.innerHTML = '<span class="material-icons">settings</span>';
        settingsBtn.addEventListener('click', () => this.onOpenSettings());

        header.append(menuBtn, iconEl, this.headerTitleEl, closeBtn, settingsBtn);

        // View area
        this.viewAreaEl = document.createElement('div');
        this.viewAreaEl.className = 'mobile-view-area';

        // Bottom bar
        const bottomBar = document.createElement('nav');
        bottomBar.className = 'mobile-bottom-bar';

        this.bottomTrackEl = document.createElement('div');
        this.bottomTrackEl.className = 'mobile-bottom-bar-track';
        bottomBar.appendChild(this.bottomTrackEl);

        this.container.append(header, this.viewAreaEl, bottomBar);

        // Render empty state bottom bar
        this.updateBottomBar();
    }

    public updateHeader(): void {
        const active = this.viewManager?.getActiveView();
        this.headerTitleEl.textContent = active?.headerTitle ?? active?.displayName ?? 'PracTempo';
    }

    public updateBottomBar(): void {
        const views = this.viewManager?.getAllViews() ?? [];
        const active = this.viewManager?.getActiveView();

        this.bottomTrackEl.innerHTML = '';

        for (let i = 0; i < views.length; i++) {
            const v = views[i];
            const isActive = v.instanceId === active?.instanceId;

            const chip = document.createElement('button');
            chip.className = 'mobile-view-chip' + (isActive ? ' is-active' : '');
            chip.dataset.instanceId = v.instanceId;
            chip.innerHTML = `<span class="material-icons">${v.icon}</span><span>${v.displayName}</span>`;
            chip.addEventListener('click', () => this.viewManager?.activateView(v.instanceId));

            if (isActive) {
                const closeBtn = document.createElement('button');
                closeBtn.className = 'mobile-chip-close';
                closeBtn.title = 'Close';
                closeBtn.innerHTML = '<span class="material-icons">close</span>';
                closeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.viewManager?.closeView(v.instanceId);
                });
                chip.appendChild(closeBtn);
            }

            this.bottomTrackEl.appendChild(chip);

            if (i < views.length - 1) {
                this.bottomTrackEl.appendChild(this.buildLinkConnector(i));
            }
        }

        const addBtn = document.createElement('button');
        addBtn.className = 'mobile-add-btn';
        addBtn.title = 'Add view';
        addBtn.innerHTML = '<span class="material-icons">add</span><span>Add</span>';
        addBtn.addEventListener('click', () => this.onOpenAddPanel());
        this.bottomTrackEl.appendChild(addBtn);
    }

    private buildLinkConnector(pairIndex: number): HTMLElement {
        const linked = this.viewManager?.isLinked(pairIndex) ?? false;

        const wrap = document.createElement('div');
        wrap.className = 'mobile-link-connector' + (linked ? ' is-linked' : '');

        const lineL = document.createElement('div');
        lineL.className = 'mobile-link-line';

        const btn = document.createElement('button');
        btn.className = 'mobile-link-btn' + (linked ? ' is-linked' : '');
        btn.title = linked ? 'Unlink views' : 'Link views';
        btn.innerHTML = `<span class="material-icons">${linked ? 'link' : 'link_off'}</span>`;
        btn.addEventListener('click', () => this.viewManager?.toggleLink(pairIndex));

        const lineR = document.createElement('div');
        lineR.className = 'mobile-link-line';

        wrap.append(lineL, btn, lineR);
        return wrap;
    }
}
