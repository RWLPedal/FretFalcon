// ts/panels/layout/tabbed_layout.ts
// Implements LayoutStrategy for the mobile/narrow-viewport tabbed experience.
// One panel visible at a time, tab bar at the bottom, add-panel sheet.
// Supports link connectors between adjacent tabs and long-press drag-to-reorder.

import type { LayoutStrategy, LayoutKind, LayoutData, PanelChrome, PanelSpawnInfo } from './layout_strategy';
import { getNavSectionGroups, Visibility } from '../../reference_page/nav_registry';
import { getFloatingViewDescriptor } from '../panel_registry';
import { getBroadcastSourceViewId } from '../drive_registry';
import { emitEvent } from '../../core/events';
import type { ViewId } from '../../core/ids';

// ─── DragState ────────────────────────────────────────────────────────────────

interface DragState {
  instanceId: string;
  startX: number;
  startY: number;
  longPressTimer: ReturnType<typeof setTimeout> | null;
  active: boolean;
  ghostEl: HTMLElement | null;
  dropIndicatorEl: HTMLElement | null;
  /** Insertion position in the non-dragged suffix of this.order */
  dropIndex: number;
  tabEl: HTMLElement;
  pointerId: number;
}

// ─── TabbedChrome ─────────────────────────────────────────────────────────────

class TabbedChrome implements PanelChrome {
  readonly wrapperEl: undefined = undefined;
  private _contentEl: HTMLElement;
  private _panelEl: HTMLElement;
  private _tabEl: HTMLElement;
  private _tabTitleEl: HTMLElement;
  private _onSetTitle?: (title: string) => void;

  constructor(
    contentEl: HTMLElement,
    panelEl: HTMLElement,
    tabEl: HTMLElement,
    tabTitleEl: HTMLElement,
    onSetTitle?: (title: string) => void,
  ) {
    this._contentEl = contentEl;
    this._panelEl = panelEl;
    this._tabEl = tabEl;
    this._tabTitleEl = tabTitleEl;
    this._onSetTitle = onSetTitle;
  }

  setTitle(title: string): void {
    this._tabTitleEl.textContent = title;
    this._onSetTitle?.(title);
  }

  setZoomActive(_active: boolean): void { /* no-op in tabbed mode */ }

  notifyContentReplaced(_forceAutoSize: boolean): void { /* no-op in tabbed mode */ }

  destroy(): HTMLElement {
    if (this._contentEl.parentNode === this._panelEl) {
      this._panelEl.removeChild(this._contentEl);
    }
    this._panelEl.remove();
    this._tabEl.remove();
    return this._contentEl;
  }
}

// ─── TabbedLayout ─────────────────────────────────────────────────────────────

export class TabbedLayout implements LayoutStrategy {
  readonly kind: LayoutKind = 'tabbed';

  private area: HTMLElement | null = null;
  private layoutEl: HTMLElement | null = null;
  private contentAreaEl: HTMLElement | null = null;
  private tabBarEl: HTMLElement | null = null;
  private addSheetEl: HTMLElement | null = null;
  private addSheetBackdropEl: HTMLElement | null = null;
  private _topBarTitleEl: HTMLElement | null = null;
  private _panelTitles = new Map<string, string>();

  private chromes = new Map<string, TabbedChrome>();
  /** Explicit tab order — single source of truth for adjacency and serialization. */
  private order: string[] = [];
  private activeId: string | null = null;

  private _onSpawnRequest: (viewId: ViewId) => void;
  private _onOpenSettings: (() => void) | undefined;
  private _onToggleLink: ((i: number) => void) | undefined;
  private _getPairState: ((i: number) => 'linked' | 'available' | 'incompatible') | undefined;
  private _onReorder: ((newOrder: string[]) => void) | undefined;

  // Drag state
  private _dragState: DragState | null = null;
  private _swallowNextClick = false;
  private _pointerMoveHandler: ((e: PointerEvent) => void) | null = null;
  private _pointerUpCancelHandler: ((e: PointerEvent) => void) | null = null;

  constructor(
    onSpawnRequest: (viewId: ViewId) => void,
    onToggleLink?: (i: number) => void,
    getPairState?: (i: number) => 'linked' | 'available' | 'incompatible',
    onReorder?: (newOrder: string[]) => void,
  ) {
    this._onSpawnRequest = onSpawnRequest;
    this._onToggleLink = onToggleLink;
    this._getPairState = getPairState;
    this._onReorder = onReorder;
  }

  public setSettingsCallback(fn: () => void): void {
    this._onOpenSettings = fn;
  }

  mount(area: HTMLElement): void {
    this.area = area;
    area.innerHTML = '';
    area.classList.add('tabbed-layout-active');

    this.layoutEl = document.createElement('div');
    this.layoutEl.className = 'tabbed-layout';

    const topBarEl = document.createElement('div');
    topBarEl.className = 'tabbed-top-bar';

    const hamburgerBtn = document.createElement('button');
    hamburgerBtn.className = 'tabbed-top-bar-btn';
    hamburgerBtn.title = 'Open panel';
    hamburgerBtn.innerHTML = '<span class="material-icons">menu</span>';
    hamburgerBtn.addEventListener('click', () => this._openAddSheet());

    const titleEl = document.createElement('span');
    titleEl.className = 'tabbed-top-bar-title';
    titleEl.textContent = 'PracTempo';
    this._topBarTitleEl = titleEl;

    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'tabbed-top-bar-btn';
    settingsBtn.title = 'Settings';
    settingsBtn.innerHTML = '<span class="material-icons">settings</span>';
    settingsBtn.addEventListener('click', () => this._onOpenSettings?.());

    topBarEl.appendChild(hamburgerBtn);
    topBarEl.appendChild(titleEl);
    topBarEl.appendChild(settingsBtn);

    this.contentAreaEl = document.createElement('div');
    this.contentAreaEl.className = 'tabbed-content-area';

    this.tabBarEl = document.createElement('div');
    this.tabBarEl.className = 'tabbed-tab-bar';

    const addBtn = document.createElement('button');
    addBtn.className = 'tabbed-add-btn';
    addBtn.innerHTML = '<span class="material-icons">add</span>';
    addBtn.title = 'Add panel';
    addBtn.addEventListener('click', () => this._openAddSheet());
    this.tabBarEl.appendChild(addBtn);

    this.layoutEl.appendChild(topBarEl);
    this.layoutEl.appendChild(this.contentAreaEl);
    this.layoutEl.appendChild(this.tabBarEl);
    area.appendChild(this.layoutEl);

    this._buildAddSheet();
  }

  private _setTopBarTitle(title: string): void {
    if (this._topBarTitleEl) this._topBarTitleEl.textContent = title;
  }

  unmount(): void {
    this._cancelDrag();
    this.layoutEl?.remove();
    this.addSheetEl?.remove();
    this.addSheetBackdropEl?.remove();
    this.area?.classList.remove('tabbed-layout-active');
    this.layoutEl = null;
    this.contentAreaEl = null;
    this.tabBarEl = null;
    this.addSheetEl = null;
    this.addSheetBackdropEl = null;
    this._topBarTitleEl = null;
    this._panelTitles.clear();
    this.area = null;
  }

  createChrome(info: PanelSpawnInfo): PanelChrome {
    if (!this.contentAreaEl || !this.tabBarEl) {
      throw new Error('TabbedLayout.createChrome called before mount');
    }

    const panelEl = document.createElement('div');
    panelEl.className = 'tabbed-panel';
    panelEl.dataset.instanceId = info.instanceId;
    panelEl.style.display = 'none';

    info.contentEl.classList.add('tabbed-panel-content');
    panelEl.appendChild(info.contentEl);
    this.contentAreaEl.appendChild(panelEl);

    const tabEl = document.createElement('div');
    tabEl.className = 'tabbed-tab';
    tabEl.dataset.instanceId = info.instanceId;

    const icon = this._getIcon(info.instanceId, info);
    const iconEl = document.createElement('span');
    iconEl.className = 'material-icons tabbed-tab-icon';
    iconEl.textContent = icon;

    const titleEl = document.createElement('span');
    titleEl.className = 'tabbed-tab-title';
    titleEl.textContent = info.title;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tabbed-tab-close';
    closeBtn.innerHTML = '<span class="material-icons">close</span>';
    closeBtn.title = 'Close';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      info.onClose?.(info.instanceId);
    });

    tabEl.appendChild(iconEl);
    tabEl.appendChild(titleEl);
    tabEl.appendChild(closeBtn);

    tabEl.addEventListener('click', () => {
      if (this._swallowNextClick) return;
      this.focus(info.instanceId);
    });

    tabEl.addEventListener('pointerdown', (e) =>
      this._onTabPointerDown(info.instanceId, tabEl, e)
    );

    const addBtn = this.tabBarEl.querySelector('.tabbed-add-btn');
    this.tabBarEl.insertBefore(tabEl, addBtn ?? null);

    this._panelTitles.set(info.instanceId, info.title);
    const chrome = new TabbedChrome(info.contentEl, panelEl, tabEl, titleEl, (t) => {
      this._panelTitles.set(info.instanceId, t);
      if (this.activeId === info.instanceId) this._setTopBarTitle(t);
    });
    this.chromes.set(info.instanceId, chrome);
    this.order.push(info.instanceId);

    this.focus(info.instanceId);

    // Fire a resize event so canvas-based features can size themselves on first
    // render. Use contentAreaEl (always visible) not contentEl, because a later
    // createChrome() call may have stolen focus (hiding this panel) before the
    // RAF fires, making contentEl.clientHeight === 0.
    const contentEl = info.contentEl;
    const area = this.contentAreaEl;
    requestAnimationFrame(() => {
      if (!area) return;
      const w = area.clientWidth;
      const h = area.clientHeight;
      if (w > 0 && h > 0) {
        emitEvent(contentEl, 'wrapper-user-resized', { width: w, height: h }, { bubbles: false });
      }
    });

    return chrome;
  }

  /** Notify the layout that a panel was closed externally (via PanelHost.destroyView). */
  public onPanelClosed(instanceId: string): void {
    this.chromes.delete(instanceId);
    this._panelTitles.delete(instanceId);
    this.order = this.order.filter(id => id !== instanceId);
    if (this.activeId === instanceId) {
      this.activeId = this.order[this.order.length - 1] ?? null;
      if (this.activeId) this.focus(this.activeId);
      else this._setTopBarTitle('PracTempo');
    }
    this._rebuildConnectors();
  }

  focus(instanceId: string): void {
    if (!this.contentAreaEl || !this.tabBarEl) return;

    this.contentAreaEl.querySelectorAll<HTMLElement>('.tabbed-panel').forEach(p => {
      p.style.display = 'none';
    });
    this.tabBarEl.querySelectorAll('.tabbed-tab').forEach(t => t.classList.remove('is-active'));

    const panelEl = this.contentAreaEl.querySelector<HTMLElement>(`[data-instance-id="${instanceId}"]`);
    const tabEl = this.tabBarEl.querySelector<HTMLElement>(`.tabbed-tab[data-instance-id="${instanceId}"]`);
    if (panelEl) panelEl.style.display = '';
    if (tabEl) tabEl.classList.add('is-active');
    this.activeId = instanceId;
    this._setTopBarTitle(this._panelTitles.get(instanceId) ?? 'PracTempo');
  }

  /** Returns instanceIds in current tab order. */
  public getOrder(): string[] {
    return [...this.order];
  }

  serializeLayout(): LayoutData {
    return {
      tabbed: {
        order: [...this.order],
        activeId: this.activeId ?? undefined,
      },
    };
  }

  applyLayoutData(data: LayoutData | undefined): void {
    if (!data?.tabbed) return;
    const { order, activeId } = data.tabbed;

    if (order && this.tabBarEl) {
      const addBtn = this.tabBarEl.querySelector('.tabbed-add-btn');
      for (const id of order) {
        const tabEl = this.tabBarEl.querySelector<HTMLElement>(`.tabbed-tab[data-instance-id="${id}"]`);
        if (tabEl) this.tabBarEl.insertBefore(tabEl, addBtn ?? null);
      }
      this.order = order.filter(id => this.chromes.has(id));
    }

    const focusId = activeId ?? this.activeId ?? order?.[0];
    if (focusId && this.chromes.has(focusId)) this.focus(focusId);

    this._rebuildConnectors();
  }

  /** Public entry point for PanelHost to trigger a connector refresh (e.g. after link init). */
  public rebuildConnectors(): void {
    this._rebuildConnectors();
  }

  // ─── Connector UI ──────────────────────────────────────────────────────────

  private _rebuildConnectors(): void {
    if (!this.tabBarEl) return;

    this.tabBarEl.querySelectorAll('.tabbed-link-connector').forEach(el => el.remove());

    for (let i = 0; i < this.order.length - 1; i++) {
      const tabEl = this.tabBarEl.querySelector<HTMLElement>(
        `.tabbed-tab[data-instance-id="${this.order[i]}"]`
      );
      if (!tabEl) continue;
      const connector = this._buildConnector(i);
      tabEl.insertAdjacentElement('afterend', connector);
    }
  }

  private _buildConnector(i: number): HTMLElement {
    const state = this._getPairState?.(i) ?? 'available';

    const el = document.createElement('div');
    el.className = 'tabbed-link-connector';
    if (state === 'linked') el.classList.add('is-linked');
    if (state === 'incompatible') el.classList.add('is-incompatible');
    el.dataset.pairIndex = String(i);

    const lineL = document.createElement('div');
    lineL.className = 'tabbed-link-line';

    const lineR = document.createElement('div');
    lineR.className = 'tabbed-link-line';

    el.appendChild(lineL);

    if (state === 'incompatible') {
      const dot = document.createElement('div');
      dot.className = 'tabbed-link-dot';
      el.appendChild(dot);
    } else {
      const btn = document.createElement('button');
      btn.className = 'tabbed-link-btn';
      btn.type = 'button';
      const icon = document.createElement('span');
      icon.className = 'material-icons';
      icon.textContent = state === 'linked' ? 'link' : 'link_off';
      btn.appendChild(icon);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._onToggleLink?.(i);
        this._rebuildConnectors();
      });
      el.appendChild(btn);
    }

    el.appendChild(lineR);
    return el;
  }

  // ─── Drag-to-reorder ───────────────────────────────────────────────────────

  private _onTabPointerDown(instanceId: string, tabEl: HTMLElement, e: PointerEvent): void {
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    this._cancelDrag();

    const state: DragState = {
      instanceId,
      startX: e.clientX,
      startY: e.clientY,
      longPressTimer: setTimeout(() => this._activateDrag(), 300),
      active: false,
      ghostEl: null,
      dropIndicatorEl: null,
      dropIndex: this.order.indexOf(instanceId),
      tabEl,
      pointerId: e.pointerId,
    };
    this._dragState = state;

    this._pointerMoveHandler = (ev: PointerEvent) => this._onPointerMove(ev);
    this._pointerUpCancelHandler = (ev: PointerEvent) => this._onPointerUp(ev);
    document.addEventListener('pointermove', this._pointerMoveHandler, { passive: false });
    document.addEventListener('pointerup', this._pointerUpCancelHandler);
    document.addEventListener('pointercancel', this._pointerUpCancelHandler);
  }

  private _activateDrag(): void {
    const state = this._dragState;
    if (!state || !this.tabBarEl) return;
    state.longPressTimer = null;
    state.active = true;

    state.tabEl.classList.add('is-dragging');

    const rect = state.tabEl.getBoundingClientRect();
    const ghost = state.tabEl.cloneNode(true) as HTMLElement;
    ghost.className = 'tabbed-tab tabbed-tab-ghost';
    ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;` +
      `width:${rect.width}px;height:${rect.height}px;pointer-events:none;z-index:9999;`;
    document.body.appendChild(ghost);
    state.ghostEl = ghost;

    const dropInd = document.createElement('div');
    dropInd.className = 'tabbed-drop-indicator';
    this.tabBarEl.appendChild(dropInd);
    state.dropIndicatorEl = dropInd;

    this._updateDropIndicator();
  }

  private _onPointerMove(e: PointerEvent): void {
    const state = this._dragState;
    if (!state || e.pointerId !== state.pointerId) return;

    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;

    if (!state.active) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) this._cancelDrag();
      return;
    }

    e.preventDefault();

    if (state.ghostEl) {
      state.ghostEl.style.transform = `translateX(${dx}px)`;
    }

    state.dropIndex = this._findDropIndex(e.clientX);
    this._updateDropIndicator();
  }

  private _findDropIndex(clientX: number): number {
    if (!this.tabBarEl || !this._dragState) return 0;

    const draggingId = this._dragState.instanceId;
    const nonDragged = this.order.filter(id => id !== draggingId);
    const tabs = nonDragged
      .map(id => this.tabBarEl!.querySelector<HTMLElement>(`.tabbed-tab[data-instance-id="${id}"]`))
      .filter((el): el is HTMLElement => el !== null);

    for (let i = 0; i < tabs.length; i++) {
      const rect = tabs[i].getBoundingClientRect();
      if (clientX < rect.left + rect.width / 2) return i;
    }
    return nonDragged.length;
  }

  private _updateDropIndicator(): void {
    const state = this._dragState;
    if (!state?.dropIndicatorEl || !this.tabBarEl) return;

    const nonDragged = this.order.filter(id => id !== state.instanceId);
    const dropIdx = state.dropIndex;

    if (dropIdx < nonDragged.length) {
      const refTab = this.tabBarEl.querySelector<HTMLElement>(
        `.tabbed-tab[data-instance-id="${nonDragged[dropIdx]}"]`
      );
      if (refTab) this.tabBarEl.insertBefore(state.dropIndicatorEl, refTab);
    } else {
      const addBtn = this.tabBarEl.querySelector('.tabbed-add-btn');
      this.tabBarEl.insertBefore(state.dropIndicatorEl, addBtn ?? null);
    }
  }

  private _onPointerUp(e: PointerEvent): void {
    const state = this._dragState;
    if (!state || e.pointerId !== state.pointerId) return;

    if (state.active) {
      const draggingId = state.instanceId;
      const nonDragged = this.order.filter(id => id !== draggingId);
      const newOrder = [
        ...nonDragged.slice(0, state.dropIndex),
        draggingId,
        ...nonDragged.slice(state.dropIndex),
      ];
      this.order = newOrder;

      if (this.tabBarEl) {
        const addBtn = this.tabBarEl.querySelector('.tabbed-add-btn');
        for (const id of this.order) {
          const tabEl = this.tabBarEl.querySelector(`.tabbed-tab[data-instance-id="${id}"]`);
          if (tabEl) this.tabBarEl.insertBefore(tabEl, addBtn ?? null);
        }
      }

      this._onReorder?.(newOrder);
      this._rebuildConnectors();

      this._swallowNextClick = true;
      requestAnimationFrame(() => { this._swallowNextClick = false; });
    }

    this._cancelDrag();
  }

  private _cancelDrag(): void {
    const state = this._dragState;
    if (!state) return;

    if (state.longPressTimer !== null) clearTimeout(state.longPressTimer);

    if (state.active) {
      state.tabEl.classList.remove('is-dragging');
      state.ghostEl?.remove();
      state.dropIndicatorEl?.remove();
    }

    if (this._pointerMoveHandler) {
      document.removeEventListener('pointermove', this._pointerMoveHandler);
      this._pointerMoveHandler = null;
    }
    if (this._pointerUpCancelHandler) {
      document.removeEventListener('pointerup', this._pointerUpCancelHandler);
      document.removeEventListener('pointercancel', this._pointerUpCancelHandler);
      this._pointerUpCancelHandler = null;
    }

    this._dragState = null;
  }

  // ─── Add sheet ─────────────────────────────────────────────────────────────

  private _buildAddSheet(): void {
    this.addSheetBackdropEl = document.createElement('div');
    this.addSheetBackdropEl.className = 'tabbed-add-backdrop';
    this.addSheetBackdropEl.style.display = 'none';
    this.addSheetBackdropEl.addEventListener('click', () => this._closeAddSheet());
    document.body.appendChild(this.addSheetBackdropEl);

    this.addSheetEl = document.createElement('div');
    this.addSheetEl.className = 'tabbed-add-sheet';
    this.addSheetEl.style.display = 'none';

    const header = document.createElement('div');
    header.className = 'tabbed-add-header';
    const headerTitle = document.createElement('span');
    headerTitle.textContent = 'Add Panel';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'tabbed-add-close';
    closeBtn.innerHTML = '<span class="material-icons">close</span>';
    closeBtn.addEventListener('click', () => this._closeAddSheet());
    header.appendChild(headerTitle);
    header.appendChild(closeBtn);
    this.addSheetEl.appendChild(header);

    const groups = getNavSectionGroups();
    for (const group of groups) {
      const broadcastViewId = getBroadcastSourceViewId();
      const visibleEntries = group.entries.filter(e =>
        e.visibility !== Visibility.Desktop && e.viewId !== broadcastViewId
      );
      if (!visibleEntries.length) continue;

      const sectionEl = document.createElement('div');
      sectionEl.className = 'tabbed-add-section';

      const sectionTitle = document.createElement('h3');
      sectionTitle.className = 'tabbed-add-section-title';
      sectionTitle.textContent = group.label;
      sectionEl.appendChild(sectionTitle);

      for (const entry of visibleEntries) {
        const desc = getFloatingViewDescriptor(entry.viewId);
        const btn = document.createElement('button');
        btn.className = 'tabbed-add-item';

        const iconEl = document.createElement('span');
        iconEl.className = 'material-icons tabbed-add-item-icon';
        iconEl.textContent = desc?.icon ?? 'widgets';

        const labelEl = document.createElement('span');
        labelEl.textContent = entry.label;

        btn.appendChild(iconEl);
        btn.appendChild(labelEl);
        btn.addEventListener('click', () => {
          this._closeAddSheet();
          this._onSpawnRequest(entry.viewId);
        });
        sectionEl.appendChild(btn);
      }

      this.addSheetEl.appendChild(sectionEl);
    }

    document.body.appendChild(this.addSheetEl);
  }

  private _openAddSheet(): void {
    if (!this.addSheetEl || !this.addSheetBackdropEl) return;
    this.addSheetEl.style.display = '';
    this.addSheetBackdropEl.style.display = '';
  }

  private _closeAddSheet(): void {
    if (!this.addSheetEl || !this.addSheetBackdropEl) return;
    this.addSheetEl.style.display = 'none';
    this.addSheetBackdropEl.style.display = 'none';
  }

  private _getIcon(instanceId: string, info: PanelSpawnInfo): string {
    if (info.icon) return info.icon;
    const desc = getFloatingViewDescriptor(instanceId as ViewId);
    return desc?.icon ?? 'widgets';
  }
}
