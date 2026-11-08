// ts/panels/layout/tab_bar.ts
// The tabbed (mobile) layout's bottom bar: a horizontally scrolling strip of tabs
// with link connectors between adjacent tabs, long-press drag-to-reorder, and an
// add button pinned outside the scrolling strip. Owns the tab order.

import type { PairLink } from './layout_mode';

export interface TabBarHost {
  select(instanceId: string): void;
  add(): void;
  reordered(order: string[]): void;
  /** Link state between two adjacent tabs (either direction). */
  pairLink(leftId: string, rightId: string): PairLink;
  togglePairLink(leftId: string, rightId: string): void;
  /** Ids of the panels that drive the given panel. */
  incomingLinks(instanceId: string): string[];
  titleOf(instanceId: string): string;
}

const LONG_PRESS_MS = 350;
/** Movement before the long-press fires means the user is scrolling the strip. */
const DRAG_SLOP_PX = 8;

interface DragState {
  instanceId: string;
  tabEl: HTMLElement;
  pointerId: number;
  startX: number;
  startY: number;
  longPressTimer: ReturnType<typeof setTimeout> | null;
  active: boolean;
  ghostEl: HTMLElement | null;
  dropIndicatorEl: HTMLElement | null;
  /** Insertion position among the tabs other than the dragged one. */
  dropIndex: number;
}

interface TabEls {
  el: HTMLButtonElement;
  titleEl: HTMLElement;
}

export class TabBar {
  readonly el: HTMLElement;
  private stripEl: HTMLElement;
  private tabs = new Map<string, TabEls>();
  /** Tab order — the single source of truth for adjacency and serialization. */
  private order: string[] = [];
  private activeId: string | null = null;

  private _drag: DragState | null = null;
  private _swallowNextClick = false;
  /** Re-centres the active tab when the strip or any tab changes size for a reason
   *  no code path here sees — a web font arriving, the viewport resizing. */
  private _sizeObserver: ResizeObserver | null =
    typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this._revealActive());

  constructor(private host: TabBarHost) {
    this.el = document.createElement('div');
    this.el.className = 'tabbed-tab-bar';

    this.stripEl = document.createElement('div');
    this.stripEl.className = 'tabbed-tab-strip';
    this.stripEl.setAttribute('role', 'tablist');
    // Once a long-press drag is live, stop the strip's own horizontal pan. This has
    // to be a non-passive touchmove: pointer events cannot cancel a native scroll.
    this.stripEl.addEventListener(
      'touchmove',
      (e) => { if (this._drag?.active) e.preventDefault(); },
      { passive: false },
    );
    // A long press must start a drag, not the browser's context menu.
    this.stripEl.addEventListener('contextmenu', (e) => {
      if ((e.target as HTMLElement).closest('.tabbed-tab')) e.preventDefault();
    });

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'tabbed-add-btn';
    addBtn.setAttribute('aria-label', 'Add a tool');
    addBtn.innerHTML = '<span class="material-icons" aria-hidden="true">add</span>';
    addBtn.addEventListener('click', () => this.host.add());

    this.el.appendChild(this.stripEl);
    this.el.appendChild(addBtn);
    this._sizeObserver?.observe(this.stripEl);
  }

  // ─── Tabs ──────────────────────────────────────────────────────────────────

  addTab(instanceId: string, title: string, icon: string): void {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'tabbed-tab';
    el.dataset.instanceId = instanceId;
    el.setAttribute('role', 'tab');
    el.setAttribute('aria-selected', 'false');

    const iconEl = document.createElement('span');
    iconEl.className = 'material-icons tabbed-tab-icon';
    iconEl.setAttribute('aria-hidden', 'true');
    iconEl.textContent = icon;

    const titleEl = document.createElement('span');
    titleEl.className = 'tabbed-tab-title';
    titleEl.textContent = title;

    const badgeEl = document.createElement('span');
    badgeEl.className = 'material-icons tabbed-tab-link-badge';
    badgeEl.setAttribute('aria-hidden', 'true');
    badgeEl.textContent = 'link';

    el.appendChild(iconEl);
    el.appendChild(titleEl);
    el.appendChild(badgeEl);

    el.addEventListener('click', () => {
      if (this._swallowNextClick) return;
      this.host.select(instanceId);
    });
    el.addEventListener('pointerdown', (e) => this._onTabPointerDown(instanceId, el, e));

    this.stripEl.appendChild(el);
    this.tabs.set(instanceId, { el, titleEl });
    this.order.push(instanceId);
    this._sizeObserver?.observe(el);
  }

  removeTab(instanceId: string): void {
    if (this._drag?.instanceId === instanceId) this.cancelDrag();
    const el = this.tabs.get(instanceId)?.el;
    if (el) this._sizeObserver?.unobserve(el);
    el?.remove();
    this.tabs.delete(instanceId);
    this.order = this.order.filter((id) => id !== instanceId);
    if (this.activeId === instanceId) this.activeId = null;
  }

  setTitle(instanceId: string, title: string): void {
    const tab = this.tabs.get(instanceId);
    if (!tab) return;
    tab.titleEl.textContent = title;
    this._revealActive();
  }

  setActive(instanceId: string | null): void {
    this.activeId = instanceId;
    for (const [id, { el }] of this.tabs) {
      const active = id === instanceId;
      el.classList.toggle('is-active', active);
      el.setAttribute('aria-selected', String(active));
    }
    this._revealActive();
  }

  /** Mark the tabs whose panels are on screen. Where a tablet shows two, the one
   *  that is not the active tab is marked so the pair reads as a pair. */
  setVisible(instanceIds: readonly string[]): void {
    for (const [id, { el }] of this.tabs) {
      el.classList.toggle('is-visible', instanceIds.includes(id) && id !== this.activeId);
    }
  }

  getOrder(): string[] {
    return [...this.order];
  }

  /** Apply a tab order. Ids without a tab are ignored; tabs the order omits keep
   *  their relative position at the end. */
  setOrder(order: string[]): void {
    const known = order.filter((id) => this.tabs.has(id));
    const rest = this.order.filter((id) => !known.includes(id));
    this.order = [...known, ...rest];
    for (const id of this.order) this.stripEl.appendChild(this.tabs.get(id)!.el);
    this.refreshLinks();
  }

  /** Scroll the strip so the active tab sits in the middle of it (the browser clamps
   *  at either end). Deliberately a pure function of the current layout, re-run
   *  whenever a tab's width or position can have changed (title, order, connectors):
   *  an "only if off-screen" nudge would leave the strip wherever the ORDER of those
   *  updates happened to put it. */
  private _revealActive(): void {
    const el = this.activeId ? this.tabs.get(this.activeId)?.el : undefined;
    if (!el) return;
    const strip = this.stripEl;
    strip.scrollLeft = el.offsetLeft + el.offsetWidth / 2 - strip.clientWidth / 2;
  }

  // ─── Links ─────────────────────────────────────────────────────────────────

  /** Rebuild the connectors between adjacent tabs and the per-tab link badges. */
  refreshLinks(): void {
    this.stripEl.querySelectorAll('.tabbed-link-connector').forEach((el) => el.remove());

    for (let i = 0; i < this.order.length - 1; i++) {
      const leftId = this.order[i];
      const rightId = this.order[i + 1];
      const pair = this.host.pairLink(leftId, rightId);
      // Incompatible neighbours get no control at all — just the gap between tabs.
      if (pair.state === 'incompatible' || !pair.sourceId || !pair.targetId) continue;

      const linked = pair.state === 'linked';
      const source = this.host.titleOf(pair.sourceId);
      const target = this.host.titleOf(pair.targetId);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tabbed-link-connector';
      btn.classList.toggle('is-linked', linked);
      btn.setAttribute('aria-pressed', String(linked));
      btn.setAttribute(
        'aria-label',
        linked ? `${target} follows ${source}. Tap to unlink.` : `Make ${target} follow ${source}`,
      );
      btn.innerHTML =
        `<span class="material-icons" aria-hidden="true">${linked ? 'link' : 'link_off'}</span>`;
      btn.addEventListener('click', () => this.host.togglePairLink(leftId, rightId));
      this.tabs.get(leftId)?.el.insertAdjacentElement('afterend', btn);
    }

    // A badge marks a tab driven by a panel that is NOT its neighbour — a link the
    // connectors cannot show (authored on desktop, or left behind by a reorder).
    this.order.forEach((id, i) => {
      const neighbours = [this.order[i - 1], this.order[i + 1]];
      const hidden = this.host.incomingLinks(id).some((src) => !neighbours.includes(src));
      this.tabs.get(id)?.el.classList.toggle('has-distant-link', hidden);
    });

    this._revealActive();
  }

  // ─── Drag-to-reorder ───────────────────────────────────────────────────────

  private _onTabPointerDown(instanceId: string, tabEl: HTMLElement, e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    this.cancelDrag();
    this._drag = {
      instanceId,
      tabEl,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      longPressTimer: setTimeout(() => this._activateDrag(), LONG_PRESS_MS),
      active: false,
      ghostEl: null,
      dropIndicatorEl: null,
      dropIndex: this.order.indexOf(instanceId),
    };

    document.addEventListener('pointermove', this._onPointerMove);
    document.addEventListener('pointerup', this._onPointerUp);
    document.addEventListener('pointercancel', this._onPointerCancel);
  }

  private _activateDrag(): void {
    const drag = this._drag;
    if (!drag) return;
    drag.longPressTimer = null;
    drag.active = true;
    drag.tabEl.classList.add('is-dragging');

    const rect = drag.tabEl.getBoundingClientRect();
    const ghost = drag.tabEl.cloneNode(true) as HTMLElement;
    ghost.className = 'tabbed-tab tabbed-tab-ghost';
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    document.body.appendChild(ghost);
    drag.ghostEl = ghost;

    const indicator = document.createElement('div');
    indicator.className = 'tabbed-drop-indicator';
    drag.dropIndicatorEl = indicator;
    this._placeDropIndicator();
  }

  private _onPointerMove = (e: PointerEvent): void => {
    const drag = this._drag;
    if (!drag || e.pointerId !== drag.pointerId) return;

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    if (!drag.active) {
      if (Math.abs(dx) > DRAG_SLOP_PX || Math.abs(dy) > DRAG_SLOP_PX) this.cancelDrag();
      return;
    }

    if (drag.ghostEl) drag.ghostEl.style.transform = `translateX(${dx}px)`;
    drag.dropIndex = this._dropIndexAt(e.clientX);
    this._placeDropIndicator();
  };

  private _onPointerUp = (e: PointerEvent): void => {
    const drag = this._drag;
    if (!drag || e.pointerId !== drag.pointerId) return;

    if (drag.active) {
      const others = this.order.filter((id) => id !== drag.instanceId);
      const newOrder = [
        ...others.slice(0, drag.dropIndex),
        drag.instanceId,
        ...others.slice(drag.dropIndex),
      ];
      const changed = newOrder.some((id, i) => id !== this.order[i]);

      // The pointerup that ends a drag is followed by a click on the tab; swallow it
      // so finishing a reorder doesn't also switch tabs.
      this._swallowNextClick = true;
      requestAnimationFrame(() => { this._swallowNextClick = false; });

      this.cancelDrag();
      if (changed) {
        this.setOrder(newOrder);
        this.host.reordered(newOrder);
      }
      return;
    }

    this.cancelDrag();
  };

  /** The browser took the gesture over (e.g. it started scrolling): abandon the
   *  drag without committing a reorder. */
  private _onPointerCancel = (e: PointerEvent): void => {
    if (this._drag && e.pointerId === this._drag.pointerId) this.cancelDrag();
  };

  private _dropIndexAt(clientX: number): number {
    const others = this.order.filter((id) => id !== this._drag?.instanceId);
    for (let i = 0; i < others.length; i++) {
      const rect = this.tabs.get(others[i])!.el.getBoundingClientRect();
      if (clientX < rect.left + rect.width / 2) return i;
    }
    return others.length;
  }

  private _placeDropIndicator(): void {
    const drag = this._drag;
    if (!drag?.dropIndicatorEl) return;
    const others = this.order.filter((id) => id !== drag.instanceId);
    const before = others[drag.dropIndex];
    this.stripEl.insertBefore(drag.dropIndicatorEl, before ? this.tabs.get(before)!.el : null);
  }

  cancelDrag(): void {
    const drag = this._drag;
    if (!drag) return;

    if (drag.longPressTimer !== null) clearTimeout(drag.longPressTimer);
    drag.tabEl.classList.remove('is-dragging');
    drag.ghostEl?.remove();
    drag.dropIndicatorEl?.remove();

    document.removeEventListener('pointermove', this._onPointerMove);
    document.removeEventListener('pointerup', this._onPointerUp);
    document.removeEventListener('pointercancel', this._onPointerCancel);
    this._drag = null;
  }

  destroy(): void {
    this.cancelDrag();
    this._sizeObserver?.disconnect();
    this.el.remove();
  }
}
