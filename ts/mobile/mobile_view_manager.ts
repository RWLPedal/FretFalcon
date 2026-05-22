import { View } from '../view';
import { AppSettings } from '../settings';
import { getFloatingViewDescriptor } from '../panels/panel_registry';
import { NavButton } from '../reference_page/nav_sections';
import { MobileLinkManager } from './mobile_link_manager';

const MOBILE_STATE_KEY = 'mobileViewState';

// featureTypeNames whose fretboard should fill the available slot space.
// Chord/Triad show grids of fixed-size cards and don't need this treatment.
const AUTO_RESIZE_FEATURE_TYPES = new Set(['Scale', 'CAGED', 'MultiLayerFretboard', 'Notes']);

export interface MobileOpenView {
    instanceId: string;
    viewId: string;
    featureTypeName?: string;
    /** Shown in the bottom bar chip — stays as the static view name (e.g. "Scales"). */
    displayName: string;
    /** Shown in the mobile header — updated by feature-title-changed (e.g. "A Major"). */
    headerTitle: string;
    icon: string;
    viewInstance: View;
    slotEl: HTMLDivElement;
    contentEl: HTMLDivElement;
    resizeObserver?: ResizeObserver;
    titleHandler?: EventListener;
}

interface PersistedMobileView {
    instanceId: string;
    viewId: string;
    featureTypeName?: string;
    displayName: string;
    icon: string;
    viewState?: any;
}

interface MobileStatePayload {
    openViews: PersistedMobileView[];
    activeInstanceId: string | null;
    linkedPairs?: boolean[];
}

export class MobileViewManager {
    private openViews: MobileOpenView[] = [];
    private activeInstanceId: string | null = null;
    private nextId = 1;
    private viewAreaEl: HTMLElement;
    private appSettings: AppSettings;
    private linkManager: MobileLinkManager;

    onChanged: (() => void) | null = null;

    constructor(viewAreaEl: HTMLElement, appSettings: AppSettings) {
        this.viewAreaEl = viewAreaEl;
        this.appSettings = appSettings;
        this.linkManager = new MobileLinkManager(viewAreaEl, () => this.openViews);
    }

    public updateSettings(newSettings: AppSettings): void {
        this.appSettings = newSettings;
    }

    public isViewOpen(viewId: string, featureTypeName?: string): string | null {
        const found = this.openViews.find(v =>
            v.viewId === viewId && v.featureTypeName === featureTypeName
        );
        return found?.instanceId ?? null;
    }

    public getActiveView(): MobileOpenView | null {
        return this.openViews.find(v => v.instanceId === this.activeInstanceId) ?? null;
    }

    public getAllViews(): MobileOpenView[] {
        return this.openViews;
    }

    public openView(btn: NavButton): string {
        const existing = this.isViewOpen(btn.viewId, btn.featureTypeName);
        if (existing) {
            this.activateView(existing);
            return existing;
        }

        const descriptor = getFloatingViewDescriptor(btn.viewId);
        if (!descriptor) {
            console.error(`MobileViewManager: no descriptor for viewId "${btn.viewId}"`);
            return '';
        }

        const instanceId = `mv-${this.nextId++}`;
        const settingsForView = this._buildSettings(btn.viewId);
        const viewState = btn.featureTypeName ? { featureTypeName: btn.featureTypeName } : undefined;

        let viewInstance: View;
        try {
            viewInstance = descriptor.createView(viewState, settingsForView);
        } catch (e) {
            console.error(`MobileViewManager: error creating view "${btn.viewId}":`, e);
            return '';
        }

        const slotEl = document.createElement('div');
        slotEl.className = 'mobile-view-slot';
        slotEl.dataset.instanceId = instanceId;

        const contentEl = document.createElement('div');
        contentEl.className = 'mobile-view-content';
        slotEl.appendChild(contentEl);
        this.viewAreaEl.appendChild(slotEl);

        // Wire observers BEFORE render() so title events fired during render are captured.
        const entry: MobileOpenView = {
            instanceId,
            viewId: btn.viewId,
            featureTypeName: btn.featureTypeName,
            displayName: btn.label,
            headerTitle: btn.label,
            icon: btn.icon,
            viewInstance,
            slotEl,
            contentEl,
        };
        this._setupViewObservers(entry);

        try {
            viewInstance.render(contentEl);
        } catch (e) {
            console.error(`MobileViewManager: error rendering view "${btn.viewId}":`, e);
        }

        this.openViews.push(entry);
        this.linkManager.onViewAdded();

        this.activateView(instanceId);
        this.saveState();
        return instanceId;
    }

    public closeView(instanceId: string): void {
        const idx = this.openViews.findIndex(v => v.instanceId === instanceId);
        if (idx === -1) return;

        const entry = this.openViews[idx];
        entry.resizeObserver?.disconnect();
        if (entry.titleHandler) {
            entry.contentEl.removeEventListener('feature-title-changed', entry.titleHandler);
        }
        try { entry.viewInstance.stop(); } catch (_) {}
        try { entry.viewInstance.destroy(); } catch (_) {}
        entry.slotEl.remove();
        this.linkManager.onViewRemoved(idx);

        this.openViews.splice(idx, 1);

        if (this.activeInstanceId === instanceId) {
            const nextEntry = this.openViews[Math.max(0, idx - 1)];
            this.activeInstanceId = nextEntry?.instanceId ?? null;
            if (nextEntry) {
                nextEntry.slotEl.classList.add('is-active');
            }
        }

        this.saveState();
        this.onChanged?.();
    }

    public activateView(instanceId: string): void {
        if (this.activeInstanceId === instanceId) return;

        const current = this.getActiveView();
        if (current) {
            current.slotEl.classList.remove('is-active');
        }

        this.activeInstanceId = instanceId;

        const next = this.openViews.find(v => v.instanceId === instanceId);
        if (next) {
            next.slotEl.classList.add('is-active');
        }

        this.saveState();
        this.onChanged?.();
    }

    public recreateFretboardViews(): void {
        const orientation = this._fretboardOrientation();
        for (const entry of this.openViews) {
            const descriptor = getFloatingViewDescriptor(entry.viewId);
            if (!descriptor || !('isFretboardView' in descriptor && (descriptor as any).isFretboardView)) continue;

            const viewState = entry.featureTypeName ? { featureTypeName: entry.featureTypeName } : undefined;
            const settings: AppSettings = {
                ...this.appSettings,
                instrumentSettings: { ...this.appSettings.instrumentSettings, orientation },
            };

            try {
                const wasActive = entry.instanceId === this.activeInstanceId;
                try { entry.viewInstance.stop(); } catch (_) {}
                try { entry.viewInstance.destroy(); } catch (_) {}
                entry.contentEl.innerHTML = '';
                const newInstance = descriptor.createView(viewState, settings);
                newInstance.render(entry.contentEl);
                entry.viewInstance = newInstance;
                if (wasActive) try { newInstance.start(); } catch (_) {}
                this.linkManager.refreshForInstance(entry.instanceId);
            } catch (e) {
                console.error(`recreateFretboardViews: error for "${entry.viewId}":`, e);
            }

            // Re-apply size constraint after the new view instance renders.
            if (entry.featureTypeName && AUTO_RESIZE_FEATURE_TYPES.has(entry.featureTypeName)) {
                setTimeout(() => this._dispatchResize(entry), 50);
            }
        }
    }

    public toggleLink(pairIndex: number): void {
        this.linkManager.toggleLink(pairIndex);
        this.saveState();
        this.onChanged?.();
    }

    public isLinked(pairIndex: number): boolean {
        return this.linkManager.isLinked(pairIndex);
    }

    public saveState(): void {
        const payload: MobileStatePayload = {
            openViews: this.openViews.map(v => ({
                instanceId: v.instanceId,
                viewId: v.viewId,
                featureTypeName: v.featureTypeName,
                displayName: v.displayName,
                icon: v.icon,
            })),
            activeInstanceId: this.activeInstanceId,
            linkedPairs: this.linkManager.getLinkedPairs(),
        };
        try {
            localStorage.setItem(MOBILE_STATE_KEY, JSON.stringify(payload));
        } catch (_) {}
    }

    public restoreState(navButtons: NavButton[]): void {
        let payload: MobileStatePayload | null = null;
        try {
            const raw = localStorage.getItem(MOBILE_STATE_KEY);
            if (raw) payload = JSON.parse(raw);
        } catch (_) {}

        if (!payload || !Array.isArray(payload.openViews) || payload.openViews.length === 0) return;

        const buttonByKey = new Map<string, NavButton>();
        for (const btn of navButtons) {
            buttonByKey.set(`${btn.viewId}:${btn.featureTypeName ?? ''}`, btn);
        }

        let firstInstanceId: string | null = null;
        for (const saved of payload.openViews) {
            const key = `${saved.viewId}:${saved.featureTypeName ?? ''}`;
            const btn = buttonByKey.get(key) ?? {
                id: saved.instanceId,
                icon: saved.icon,
                label: saved.displayName,
                viewId: saved.viewId,
                featureTypeName: saved.featureTypeName,
            };

            const descriptor = getFloatingViewDescriptor(saved.viewId);
            if (!descriptor) continue;

            const settingsForView = this._buildSettings(saved.viewId);
            const viewState = saved.featureTypeName ? { featureTypeName: saved.featureTypeName } : undefined;

            let viewInstance: View;
            try {
                viewInstance = descriptor.createView(viewState, settingsForView);
            } catch (e) {
                console.error(`MobileViewManager restore: error creating "${saved.viewId}":`, e);
                continue;
            }

            const slotEl = document.createElement('div');
            slotEl.className = 'mobile-view-slot';
            slotEl.dataset.instanceId = saved.instanceId;

            const contentEl = document.createElement('div');
            contentEl.className = 'mobile-view-content';
            slotEl.appendChild(contentEl);
            this.viewAreaEl.appendChild(slotEl);

            const numericId = parseInt(saved.instanceId.replace('mv-', ''), 10);
            if (!isNaN(numericId)) this.nextId = Math.max(this.nextId, numericId + 1);

            // Wire observers BEFORE render() so title events fired during render are captured.
            const entry: MobileOpenView = {
                instanceId: saved.instanceId,
                viewId: saved.viewId,
                featureTypeName: saved.featureTypeName,
                displayName: saved.displayName,
                headerTitle: saved.displayName,
                icon: saved.icon,
                viewInstance,
                slotEl,
                contentEl,
            };
            this._setupViewObservers(entry);

            try { viewInstance.render(contentEl); } catch (e) {
                console.error(`MobileViewManager restore: error rendering "${saved.viewId}":`, e);
            }

            this.openViews.push(entry);
            if (!firstInstanceId) firstInstanceId = saved.instanceId;
        }

        const targetId = payload.activeInstanceId &&
            this.openViews.find(v => v.instanceId === payload!.activeInstanceId)
            ? payload.activeInstanceId
            : firstInstanceId;

        if (targetId) {
            this.activeInstanceId = targetId;
            const entry = this.openViews.find(v => v.instanceId === targetId);
            if (entry) {
                entry.slotEl.classList.add('is-active');
            }
        }

        this.linkManager.setLinkedPairs(payload.linkedPairs ?? [], this.openViews.length);

        this.onChanged?.();
    }

    public destroyAll(): void {
        for (const v of this.openViews) {
            v.resizeObserver?.disconnect();
            if (v.titleHandler) v.contentEl.removeEventListener('feature-title-changed', v.titleHandler);
            try { v.viewInstance.stop(); } catch (_) {}
            try { v.viewInstance.destroy(); } catch (_) {}
            v.slotEl.remove();
        }
        this.openViews = [];
        this.activeInstanceId = null;
    }

    private _setupViewObservers(entry: MobileOpenView): void {
        // Track title changes and bubble them to the mobile header.
        const titleHandler = (e: Event) => {
            const detail = (e as CustomEvent<{ title: string }>).detail;
            if (!detail?.title) return;
            entry.headerTitle = detail.title;
            if (entry.instanceId === this.activeInstanceId) {
                this.onChanged?.();
            }
        };
        entry.titleHandler = titleHandler as EventListener;
        entry.contentEl.addEventListener('feature-title-changed', titleHandler as EventListener);

        // Auto-resize: treat contentEl as the panel space and fill it.
        if (entry.featureTypeName && AUTO_RESIZE_FEATURE_TYPES.has(entry.featureTypeName)) {
            const observer = new ResizeObserver(() => this._dispatchResize(entry));
            observer.observe(entry.contentEl);
            entry.resizeObserver = observer;
        }
    }

    private _dispatchResize(entry: MobileOpenView): void {
        const width = entry.contentEl.clientWidth;
        const height = entry.contentEl.clientHeight;
        if (width > 0 && height > 0) {
            entry.contentEl.dispatchEvent(new CustomEvent('wrapper-user-resized', {
                bubbles: false,
                detail: { width, height },
            }));
        }
    }

    private _buildSettings(viewId: string): AppSettings {
        const descriptor = getFloatingViewDescriptor(viewId);
        const isFretboard = descriptor && 'isFretboardView' in descriptor && (descriptor as any).isFretboardView;
        if (!isFretboard) return this.appSettings;
        return {
            ...this.appSettings,
            instrumentSettings: {
                ...this.appSettings.instrumentSettings,
                orientation: this._fretboardOrientation(),
            },
        };
    }

    private _fretboardOrientation(): 'vertical' | 'horizontal' {
        return window.innerWidth <= window.innerHeight ? 'vertical' : 'horizontal';
    }
}
