// ts/panels/layout/tabbed_layout.ts
// Implements LayoutStrategy for the mobile/narrow-viewport tabbed experience.
// One panel fills the screen at a time — or, where a tablet has the room, the active
// tab and its neighbour share it. The top bar carries the app menu and the active
// panel's actions; the bottom TabBar switches, links and reorders panels (a sideways
// swipe across the content switches too); one BottomSheet serves the menu, the
// add-a-tool picker and the link list.

import type { LayoutStrategy, LayoutKind, LayoutData, PanelChrome, PanelSpawnInfo } from './layout_strategy';
import type { PairLink, SwipeDirection } from './layout_mode';
import {
  tabbedPanes,
  visibleTabs,
  classifySwipe,
  swipeTabs,
  clampPaneSplit,
  SHORT_PANE_PX,
  PANE_SPLIT_DEFAULT,
  PANE_SPLIT_MIN,
  PANE_SPLIT_MAX,
} from './layout_mode';
import { TabBar } from './tab_bar';
import { BottomSheet, SheetSection } from './bottom_sheet';
import { getVisibleNavGroups } from '../../reference_page/nav_registry';
import { getFloatingViewDescriptor } from '../panel_registry';
import { getBroadcastSourceViewId } from '../drive_registry';
import { emitEvent, onEvent } from '../../core/events';
import type { ViewId } from '../../core/ids';

const APP_TITLE = 'FretFalcon';
const TOAST_MS = 2600;
const HINT_MS = 10000;
/** Quiet time after the options row stops changing height before content re-fits. */
const OPTIONS_REFIT_MS = 150;
/** A swipe that starts this close to a screen edge is the browser's own back/forward
 *  gesture, not ours. */
const SWIPE_EDGE_PX = 24;
/** A touch that starts on one of these is using it, not swiping past it. */
const SWIPE_BLOCKERS =
  'input, textarea, select, [contenteditable="true"], [draggable="true"], .value-slider, .tabbed-pane-divider';
/** How far an arrow key moves the divider between two panes. */
const SPLIT_KEY_STEP = 0.05;
/** While the divider is dragged, panes re-fit their content once it has rested this long. */
const SPLIT_REFIT_MS = 120;

/** What the tabbed layout needs from its owner (PanelHost). */
export interface TabbedLayoutHost {
  spawn(viewId: ViewId): void;
  openSettings(): void;
  /** Start the welcome + tour (the onboarding module's replay). */
  startTour(): void;
  closeAll(): void;
  starterLayouts(): ReadonlyArray<{ key: string; label: string }>;
  loadStarterLayout(key: string): void;
  /** Current instrument name, for filtering the add-a-tool list. */
  instrument(): string;
  /** Link state between two adjacent tabs (either direction). */
  pairLink(leftId: string, rightId: string): PairLink;
  /** Link or unlink two adjacent tabs; returns the resulting state. */
  togglePairLink(leftId: string, rightId: string): PairLink;
  /** Ids of the panels that drive the given panel. */
  incomingLinks(instanceId: string): string[];
  unlink(sourceId: string, targetId: string): void;
  orderChanged(): void;
}

interface TabbedPanel {
  info: PanelSpawnInfo;
  panelEl: HTMLElement;
  title: string;
  /** The area size last sent to the view, so re-focusing a tab only re-fits its
   *  content when the screen has actually changed since. */
  sentSize: { w: number; h: number } | null;
  /** Watches the height of the panel's options row (see _watchOptions). */
  optionsObserver: ResizeObserver | null;
  optionsHeight: number;
  refitTimer: ReturnType<typeof setTimeout> | null;
  unlisten: Array<() => void>;
}

// ─── TabbedChrome ─────────────────────────────────────────────────────────────

class TabbedChrome implements PanelChrome {
  readonly wrapperEl: undefined = undefined;

  constructor(
    private layout: TabbedLayout,
    private instanceId: string,
    private contentEl: HTMLElement,
  ) {}

  setTitle(title: string): void { this.layout.setPanelTitle(this.instanceId, title); }
  setZoomActive(_active: boolean): void { /* content is always fit to the screen */ }
  notifyContentReplaced(_forceAutoSize: boolean): void { this.layout.panelContentReplaced(this.instanceId); }
  destroy(): HTMLElement {
    this.layout.releasePanel(this.instanceId);
    return this.contentEl;
  }
}

// ─── TabbedLayout ─────────────────────────────────────────────────────────────

export class TabbedLayout implements LayoutStrategy {
  readonly kind: LayoutKind = 'tabbed';

  private area: HTMLElement | null = null;
  private layoutEl: HTMLElement | null = null;
  private contentAreaEl: HTMLElement | null = null;
  private emptyStateEl: HTMLElement | null = null;
  private titleEl: HTMLElement | null = null;
  private actionsEl: HTMLElement | null = null;
  private toastEl: HTMLElement | null = null;
  private tabBar: TabBar | null = null;
  private sheet: BottomSheet | null = null;

  private panels = new Map<string, TabbedPanel>();
  private activeId: string | null = null;
  /** The panels on screen, in tab order: the active one, plus its neighbour where
   *  the screen has room for two (see visibleTabs). */
  private visibleIds: string[] = [];
  /** The first pane's share of the screen while two are shown (see clampPaneSplit). */
  private splitRatio = PANE_SPLIT_DEFAULT;
  private dividerEl: HTMLElement | null = null;
  private _splitRefitTimer: ReturnType<typeof setTimeout> | null = null;
  private _swipeStart: { x: number; y: number; time: number } | null = null;
  private _toastTimer: ReturnType<typeof setTimeout> | null = null;
  /** What tapping the toast on screen does, beyond dismissing it. */
  private _toastAction: (() => void) | null = null;

  constructor(private host: TabbedLayoutHost) {}

  // ─── Mount / unmount ───────────────────────────────────────────────────────

  mount(area: HTMLElement): void {
    this.area = area;
    area.innerHTML = '';
    area.classList.add('tabbed-layout-active');

    this.layoutEl = document.createElement('div');
    this.layoutEl.className = 'tabbed-layout';

    const topBarEl = document.createElement('div');
    topBarEl.className = 'tabbed-top-bar';

    const menuBtn = this._iconButton('menu', 'Menu', () => this._openMenuSheet());
    menuBtn.classList.add('tabbed-menu-btn');

    this.titleEl = document.createElement('span');
    this.titleEl.className = 'tabbed-top-bar-title';
    this.titleEl.textContent = APP_TITLE;

    this.actionsEl = document.createElement('div');
    this.actionsEl.className = 'tabbed-top-bar-actions';

    topBarEl.appendChild(menuBtn);
    topBarEl.appendChild(this.titleEl);
    topBarEl.appendChild(this.actionsEl);

    this.contentAreaEl = document.createElement('div');
    this.contentAreaEl.className = 'tabbed-content-area';
    // Passive: a swipe is judged when the finger lifts, so scrolling is never held up.
    this.contentAreaEl.addEventListener('touchstart', this._onTouchStart, { passive: true });
    this.contentAreaEl.addEventListener('touchend', this._onTouchEnd, { passive: true });
    this.contentAreaEl.addEventListener('touchcancel', () => { this._swipeStart = null; }, { passive: true });

    this.emptyStateEl = document.createElement('div');
    this.emptyStateEl.className = 'tabbed-empty-state';
    this.emptyStateEl.innerHTML =
      '<span class="material-icons" aria-hidden="true">library_music</span>' +
      '<p>No tools open</p>';
    const emptyAddBtn = document.createElement('button');
    emptyAddBtn.type = 'button';
    emptyAddBtn.className = 'tabbed-empty-add';
    emptyAddBtn.textContent = 'Add a tool';
    emptyAddBtn.addEventListener('click', () => this._openAddSheet());
    this.emptyStateEl.appendChild(emptyAddBtn);
    this.contentAreaEl.appendChild(this.emptyStateEl);

    this.dividerEl = this._buildDivider();
    this.contentAreaEl.appendChild(this.dividerEl);

    this.toastEl = document.createElement('div');
    this.toastEl.className = 'tabbed-toast';
    this.toastEl.setAttribute('role', 'status');
    this.toastEl.hidden = true;
    this.toastEl.addEventListener('click', () => {
      const action = this._toastAction;
      this._hideToast();
      action?.();
    });

    this.tabBar = new TabBar({
      select: (id) => this.focus(id),
      add: () => this._openAddSheet(),
      reordered: () => {
        this._refreshVisible();
        this.host.orderChanged();
      },
      pairLink: (l, r) => this.host.pairLink(l, r),
      togglePairLink: (l, r) => this._togglePairLink(l, r),
      incomingLinks: (id) => this.host.incomingLinks(id),
      titleOf: (id) => this._titleOf(id),
    });

    this.layoutEl.appendChild(topBarEl);
    this.layoutEl.appendChild(this.contentAreaEl);
    this.layoutEl.appendChild(this.toastEl);
    this.layoutEl.appendChild(this.tabBar.el);
    area.appendChild(this.layoutEl);

    this.sheet = new BottomSheet();
  }

  unmount(): void {
    this._hideToast();
    this.sheet?.destroy();
    this.tabBar?.destroy();
    this.layoutEl?.remove();
    this.area?.classList.remove('tabbed-layout-active');
    // Panel bookkeeping resets with the mount: PanelHost destroys every chrome before
    // switching strategies and re-creates them on the next mount.
    for (const panel of this.panels.values()) panel.unlisten.forEach((u) => u());
    this.panels.clear();
    this.activeId = null;
    this.visibleIds = [];
    this._swipeStart = null;
    if (this._splitRefitTimer !== null) clearTimeout(this._splitRefitTimer);
    this._splitRefitTimer = null;
    this.dividerEl = null;
    this.layoutEl = null;
    this.contentAreaEl = null;
    this.emptyStateEl = null;
    this.titleEl = null;
    this.actionsEl = null;
    this.toastEl = null;
    this.tabBar = null;
    this.sheet = null;
    this.area = null;
  }

  // ─── Panels ────────────────────────────────────────────────────────────────

  createChrome(info: PanelSpawnInfo): PanelChrome {
    if (!this.contentAreaEl || !this.tabBar) {
      throw new Error('TabbedLayout.createChrome called before mount');
    }
    const id = info.instanceId;

    const panelEl = document.createElement('div');
    panelEl.className = 'tabbed-panel';
    panelEl.dataset.instanceId = id;
    panelEl.style.display = 'none';

    info.contentEl.classList.add('tabbed-panel-content');
    panelEl.appendChild(info.contentEl);
    // With two panes on screen, touching one makes it the active tab (the top bar's
    // actions follow). Capture phase: whatever is touched inside still gets the event.
    panelEl.addEventListener('pointerdown', () => this._activatePane(id), true);
    this.contentAreaEl.appendChild(panelEl);

    const panel: TabbedPanel = {
      info,
      panelEl,
      title: info.title,
      sentSize: null,
      optionsObserver: null,
      optionsHeight: 0,
      refitTimer: null,
      unlisten: [
        // The options toggle in the top bar mirrors the panel's collapsed state.
        onEvent(info.contentEl, 'config-collapse-changed', () => {
          if (this.activeId === id) this._renderActions();
        }),
        () => {
          panel.optionsObserver?.disconnect();
          if (panel.refitTimer !== null) clearTimeout(panel.refitTimer);
        },
      ],
    };
    this.panels.set(id, panel);
    this._watchOptions(id);
    this.tabBar.addTab(id, info.title, info.icon ?? 'widgets');

    // Size the new view on the next frame, not now: PanelHost attaches its listeners
    // after this returns, and the view's response to a size (title, state) must reach
    // them. A later createChrome() may have taken its place on screen before the
    // frame fires; _emitSize then sizes it provisionally.
    this._show(id, id);
    requestAnimationFrame(() => this._emitSize(id));

    return new TabbedChrome(this, id, info.contentEl);
  }

  /** Remove a panel's chrome (its tab and container), leaving the content element
   *  untouched so PanelHost can destroy it or re-home it in another strategy. */
  releasePanel(instanceId: string): void {
    const panel = this.panels.get(instanceId);
    if (!panel) return;

    const order = this.tabBar?.getOrder() ?? [];
    const index = order.indexOf(instanceId);

    panel.unlisten.forEach((u) => u());
    panel.info.contentEl.classList.remove('tabbed-panel-content');
    panel.info.contentEl.remove();
    panel.panelEl.remove();
    this.panels.delete(instanceId);
    this.tabBar?.removeTab(instanceId);

    if (this.activeId === instanceId) {
      this.activeId = null;
      // Closing a tab reveals its neighbour: the one that slid into its place, else
      // the one before it.
      const next = order[index + 1] ?? order[index - 1];
      if (next && this.panels.has(next)) this._show(next);
      else this._applyVisible([]);
    } else {
      // The other pane may have been the one closed: its neighbour gets the room.
      this._refreshVisible();
    }
    this.refreshLinks();
  }

  setPanelTitle(instanceId: string, title: string): void {
    const panel = this.panels.get(instanceId);
    if (!panel) return;
    panel.title = title;
    this.tabBar?.setTitle(instanceId, title);
    if (this.activeId === instanceId && this.titleEl) this.titleEl.textContent = title;
  }

  /** PanelHost re-rendered a view into the existing content element (rotate,
   *  settings change): the new view has never been told how much room it has. */
  panelContentReplaced(instanceId: string): void {
    this._watchOptions(instanceId);
    this._emitSize(instanceId, true);
    if (this.activeId === instanceId) this._renderActions();
  }

  focus(instanceId: string): void {
    if (!this.panels.has(instanceId)) return;
    this._show(instanceId);
  }

  /** Make one panel the active tab, bringing it on screen if it is not there. */
  private _show(instanceId: string, deferSizeFor?: string): void {
    this.activeId = instanceId;
    this._applyVisible(
      visibleTabs(this.getOrder(), instanceId, this._capacity(), this.visibleIds),
      deferSizeFor,
    );
  }

  /** Re-derive what is on screen after the tab order (or the tab set) changed. */
  private _refreshVisible(): void {
    if (this.activeId && this.panels.has(this.activeId)) this._show(this.activeId);
  }

  /** How many panels this screen has room for. */
  private _capacity(): number {
    return tabbedPanes(window.innerWidth, window.innerHeight).count;
  }

  /** Put exactly these panels on screen, then tell each how much room it has: a
   *  pane's size changes when its neighbour comes or goes. No-ops for a panel whose
   *  size has not changed since it was last told. */
  private _applyVisible(visible: string[], deferSizeFor?: string): void {
    this.visibleIds = visible;
    if (this.contentAreaEl) {
      this.contentAreaEl.dataset.panes = String(Math.max(1, visible.length));
      this.contentAreaEl.dataset.split = tabbedPanes(window.innerWidth, window.innerHeight).split;
    }
    for (const [id, panel] of this.panels) {
      const slot = visible.indexOf(id);
      panel.panelEl.style.display = slot === -1 ? 'none' : '';
      // Even orders, so the divider (order 1 in mobile.css) sits between two panes.
      panel.panelEl.style.order = slot === -1 ? '' : String(slot * 2);
      panel.panelEl.classList.toggle('is-active', id === this.activeId);
    }
    this._applySplit();
    this.tabBar?.setActive(this.activeId);
    this.tabBar?.setVisible(visible);
    this._syncShell();
    for (const id of visible) {
      if (id === deferSizeFor) this._stampPane(id);
      else this._emitSize(id);
    }
  }

  /** Touching a pane that is on screen but not active makes it the active tab. */
  private _activatePane(instanceId: string): void {
    if (this.activeId === instanceId || !this.visibleIds.includes(instanceId)) return;
    this._show(instanceId);
  }

  handleResize(): void {
    // Turning a tablet, or resizing a window, can change how many panes fit.
    this._refreshVisible();
  }

  /** The box a panel is sized against: its own pane while it is on screen. A hidden
   *  tab has no box, so it borrows one that is (its size is only provisional). */
  private _paneBox(instanceId: string): HTMLElement | null {
    if (this.visibleIds.includes(instanceId)) return this.panels.get(instanceId)?.panelEl ?? null;
    const shown = this.visibleIds[0] ? this.panels.get(this.visibleIds[0]) : undefined;
    return shown?.panelEl ?? this.contentAreaEl;
  }

  /** Publish a pane's size to the stylesheet: --pane-w / --pane-h for content that
   *  scales with its pane (not with the viewport — a tablet shows two), and
   *  data-pane="short" where height is the scarce axis. Returns the size. */
  private _stampPane(instanceId: string): { w: number; h: number } | null {
    const panel = this.panels.get(instanceId);
    const box = this._paneBox(instanceId);
    if (!panel || !box) return null;
    const w = box.clientWidth;
    const h = box.clientHeight;
    if (w <= 0 || h <= 0) return null;
    panel.panelEl.style.setProperty('--pane-w', `${w}px`);
    panel.panelEl.style.setProperty('--pane-h', `${h}px`);
    panel.panelEl.dataset.pane = h < SHORT_PANE_PX ? 'short' : 'tall';
    return { w, h };
  }

  /** Tell a panel's view how much room it has. Hidden tabs are skipped by
   *  handleResize and caught up here when they are next shown. */
  private _emitSize(instanceId: string, force = false): void {
    const panel = this.panels.get(instanceId);
    if (!panel) return;
    const size = this._stampPane(instanceId);
    if (!size) return;
    const { w, h } = size;
    if (!force && panel.sentSize && panel.sentSize.w === w && panel.sentSize.h === h) return;
    // A view sized while its tab is hidden cannot measure its own layout (its options
    // row reports zero height), so the fit it computes is only provisional. Leaving
    // sentSize unset makes the next _show() size it again, properly.
    panel.sentSize = this.visibleIds.includes(instanceId) ? { w, h } : null;
    emitEvent(panel.info.contentEl, 'wrapper-user-resized', { width: w, height: h }, { bubbles: false });
  }

  // ─── The divider between two panes ─────────────────────────────────────────

  private _buildDivider(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'tabbed-pane-divider';
    el.setAttribute('role', 'separator');
    el.setAttribute('aria-label', 'Resize the two panes');
    el.setAttribute('aria-valuemin', String(Math.round(PANE_SPLIT_MIN * 100)));
    el.setAttribute('aria-valuemax', String(Math.round(PANE_SPLIT_MAX * 100)));
    el.tabIndex = 0;

    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      el.classList.add('is-dragging');
      const move = (ev: PointerEvent): void => {
        const area = this.contentAreaEl?.getBoundingClientRect();
        if (!area || ev.pointerId !== e.pointerId) return;
        const rows = this.contentAreaEl!.dataset.split !== 'columns';
        const share = rows
          ? (ev.clientY - area.top) / area.height
          : (ev.clientX - area.left) / area.width;
        this._setSplit(share, 'dragging');
      };
      const end = (ev: PointerEvent): void => {
        if (ev.pointerId !== e.pointerId) return;
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', end);
        el.removeEventListener('pointercancel', end);
        el.classList.remove('is-dragging');
        this._setSplit(this.splitRatio, 'settled');
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
    });
    el.addEventListener('dblclick', () => this._setSplit(PANE_SPLIT_DEFAULT, 'settled'));
    el.addEventListener('keydown', (e) => {
      const step =
        e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -SPLIT_KEY_STEP
        : e.key === 'ArrowDown' || e.key === 'ArrowRight' ? SPLIT_KEY_STEP
        : 0;
      if (!step) return;
      e.preventDefault();
      this._setSplit(this.splitRatio + step, 'settled');
    });
    return el;
  }

  /** Move the divider. The panes follow at once (CSS); their content is re-fitted
   *  when the divider settles — or rests a moment mid-drag — since a re-fit redraws
   *  every fretboard in both panes. A settled split is saved. */
  private _setSplit(share: number, phase: 'dragging' | 'settled'): void {
    const changed = clampPaneSplit(share) !== this.splitRatio;
    this.splitRatio = clampPaneSplit(share);
    this._applySplit();
    if (this._splitRefitTimer !== null) clearTimeout(this._splitRefitTimer);
    this._splitRefitTimer = null;
    const refit = (): void => {
      this._splitRefitTimer = null;
      for (const id of this.visibleIds) this._emitSize(id);
    };
    if (phase === 'dragging') {
      if (changed) this._splitRefitTimer = setTimeout(refit, SPLIT_REFIT_MS);
      return;
    }
    refit();
    this.host.orderChanged(); // persists the layout, the split with it
  }

  /** Publish the split to the stylesheet (the pane tracks' sizes) and to assistive tech. */
  private _applySplit(): void {
    const area = this.contentAreaEl;
    if (!area) return;
    area.style.setProperty('--pane-a', `${this.splitRatio}fr`);
    area.style.setProperty('--pane-b', `${1 - this.splitRatio}fr`);
    if (this.dividerEl) {
      this.dividerEl.setAttribute('aria-valuenow', String(Math.round(this.splitRatio * 100)));
      this.dividerEl.setAttribute(
        'aria-orientation',
        area.dataset.split === 'columns' ? 'vertical' : 'horizontal',
      );
    }
  }

  // ─── Swipe between tabs ────────────────────────────────────────────────────

  private _onTouchStart = (e: TouchEvent): void => {
    this._swipeStart = null;
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    if (touch.clientX < SWIPE_EDGE_PX || touch.clientX > window.innerWidth - SWIPE_EDGE_PX) return;
    if (!this._canSwipeFrom(e.target as Element | null)) return;
    this._swipeStart = { x: touch.clientX, y: touch.clientY, time: performance.now() };
  };

  private _onTouchEnd = (e: TouchEvent): void => {
    const start = this._swipeStart;
    this._swipeStart = null;
    if (!start || e.touches.length || e.changedTouches.length !== 1) return;
    const touch = e.changedTouches[0];
    const direction = classifySwipe(
      touch.clientX - start.x,
      touch.clientY - start.y,
      performance.now() - start.time,
    );
    if (direction) this._swipeTo(direction);
  };

  /** A sideways drag belongs to whatever is under the finger when that is a control
   *  that uses it (a slider, a text field, a drag handle) or something that scrolls
   *  sideways (a row of option buttons); only elsewhere is it a swipe between tabs. */
  private _canSwipeFrom(target: Element | null): boolean {
    for (let el = target; el && el !== this.contentAreaEl; el = el.parentElement) {
      if (el.matches(SWIPE_BLOCKERS)) return false;
      if (el.scrollWidth > el.clientWidth + 1) {
        const overflowX = getComputedStyle(el).overflowX;
        if (overflowX === 'auto' || overflowX === 'scroll') return false;
      }
    }
    return true;
  }

  private _swipeTo(direction: SwipeDirection): void {
    const next = swipeTabs(this.getOrder(), this.visibleIds, this.activeId, direction);
    if (!next) return;
    this.activeId = next.activeId;
    this._applyVisible(next.visible);
    for (const id of next.visible) {
      const el = this.panels.get(id)?.panelEl;
      if (!el) continue;
      // Restart the cue if one is still playing from the swipe before.
      el.classList.remove('tabbed-panel--enter-next', 'tabbed-panel--enter-previous');
      void el.offsetWidth;
      el.classList.add(`tabbed-panel--enter-${direction}`);
    }
  }

  /** Re-fit a panel's content whenever its options row changes height: collapsed or
   *  expanded, wrapped onto another line by a longer value, or reflowed when the web
   *  font arrives. The view budgets its content against that row's height when it is
   *  sized, so a later change would otherwise leave the content clipped or short.
   *  Re-armed whenever PanelHost re-renders the view (the row is a new element). */
  private _watchOptions(instanceId: string): void {
    const panel = this.panels.get(instanceId);
    if (!panel) return;
    panel.optionsObserver?.disconnect();
    panel.optionsObserver = null;

    const options = panel.info.contentEl.querySelector<HTMLElement>(':scope > .config-compact');
    if (!options || typeof ResizeObserver === 'undefined') return;

    panel.optionsHeight = options.offsetHeight;
    panel.optionsObserver = new ResizeObserver(() => {
      const height = options.offsetHeight;
      // A hidden tab measures 0: not a real change, and showing it re-fits it anyway.
      if (!this.visibleIds.includes(instanceId) || height === panel.optionsHeight) return;
      panel.optionsHeight = height;
      // Debounced: the collapse animation changes the height on every frame.
      if (panel.refitTimer !== null) clearTimeout(panel.refitTimer);
      panel.refitTimer = setTimeout(() => {
        panel.refitTimer = null;
        this._emitSize(instanceId, true);
      }, OPTIONS_REFIT_MS);
    });
    panel.optionsObserver.observe(options);
  }

  // ─── Shell (title, actions, empty state) ───────────────────────────────────

  private _titleOf(instanceId: string): string {
    return this.panels.get(instanceId)?.title ?? APP_TITLE;
  }

  private _syncShell(): void {
    if (this.titleEl) {
      this.titleEl.textContent = this.activeId ? this._titleOf(this.activeId) : APP_TITLE;
    }
    if (this.emptyStateEl) this.emptyStateEl.hidden = this.panels.size > 0;
    this._renderActions();
  }

  /** The top bar's right-hand buttons act on the active panel. */
  private _renderActions(): void {
    if (!this.actionsEl) return;
    this.actionsEl.innerHTML = '';
    const id = this.activeId;
    const panel = id ? this.panels.get(id) : undefined;
    if (!id || !panel) return;
    const { info } = panel;

    if (this.host.incomingLinks(id).length) {
      const btn = this._iconButton('link', 'Links', () => this._openLinksSheet(id));
      btn.classList.add('is-on');
      this.actionsEl.appendChild(btn);
    }

    if (info.supportsConfigToggle) {
      const collapsed = !!info.contentEl.querySelector(':scope > .config-compact.is-collapsed');
      const btn = this._iconButton('tune', collapsed ? 'Show options' : 'Hide options', () => {
        emitEvent(info.contentEl, 'config-visibility-toggle', {}, { bubbles: false });
      });
      btn.classList.toggle('is-on', !collapsed);
      btn.setAttribute('aria-pressed', String(!collapsed));
      this.actionsEl.appendChild(btn);
    }

    if (info.onRotate) {
      this.actionsEl.appendChild(
        this._iconButton('screen_rotation', 'Rotate fretboard', () => info.onRotate?.()),
      );
    }

    if (info.onClose) {
      const btn = this._iconButton('close', `Close ${panel.title}`, () => info.onClose?.(id));
      btn.classList.add('tabbed-close-btn');
      this.actionsEl.appendChild(btn);
    }
  }

  private _iconButton(icon: string, label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tabbed-top-bar-btn';
    btn.setAttribute('aria-label', label);
    btn.innerHTML = `<span class="material-icons" aria-hidden="true">${icon}</span>`;
    btn.addEventListener('click', onClick);
    return btn;
  }

  // ─── Toast ─────────────────────────────────────────────────────────────────

  /** A longer-lived tip, e.g. on a first visit. Tapping it dismisses it — and runs
   *  `onTap`, when the tip offers something (the first-visit tip offers the tour). */
  showHint(text: string, onTap?: () => void): void {
    this._toast(text, HINT_MS, onTap);
  }

  private _toast(text: string, ms = TOAST_MS, onTap?: () => void): void {
    if (!this.toastEl) return;
    this.toastEl.textContent = text;
    this.toastEl.hidden = false;
    this.toastEl.classList.toggle('is-action', !!onTap);
    this._toastAction = onTap ?? null;
    if (this._toastTimer !== null) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this._hideToast(), ms);
  }

  private _hideToast(): void {
    if (this._toastTimer !== null) clearTimeout(this._toastTimer);
    this._toastTimer = null;
    this._toastAction = null;
    if (this.toastEl) this.toastEl.hidden = true;
  }

  // ─── Links ─────────────────────────────────────────────────────────────────

  /** Rebuild link connectors, badges and the link action after links change. */
  refreshLinks(): void {
    this.tabBar?.refreshLinks();
    this._renderActions();
  }

  private _togglePairLink(leftId: string, rightId: string): void {
    const result = this.host.togglePairLink(leftId, rightId);
    this.refreshLinks();
    if (!result.sourceId || !result.targetId) return;
    const source = this._titleOf(result.sourceId);
    const target = this._titleOf(result.targetId);
    this._toast(
      result.state === 'linked'
        ? `${target} now follows ${source}`
        : `${target} no longer follows ${source}`,
    );
  }

  private _openLinksSheet(instanceId: string): void {
    const title = this._titleOf(instanceId);
    this.sheet?.open('Links', [
      {
        title: `${title} follows`,
        items: this.host.incomingLinks(instanceId).map((sourceId) => ({
          icon: 'link_off',
          label: `Stop following ${this._titleOf(sourceId)}`,
          onSelect: () => {
            this.host.unlink(sourceId, instanceId);
            this.refreshLinks();
            this._toast(`${title} no longer follows ${this._titleOf(sourceId)}`);
          },
        })),
      },
    ]);
  }

  // ─── Sheets ────────────────────────────────────────────────────────────────

  private _openAddSheet(): void {
    const broadcastViewId = getBroadcastSourceViewId();
    const sections: SheetSection[] = getVisibleNavGroups({
      formFactor: 'mobile',
      instrument: this.host.instrument(),
    }).map((group) => ({
      title: group.label,
      items: group.entries
        // The broadcast source (Global Key) has no tab in this layout.
        .filter((entry) => entry.viewId !== broadcastViewId)
        .map((entry) => ({
          icon: getFloatingViewDescriptor(entry.viewId)?.icon,
          label: entry.label,
          onSelect: () => this.host.spawn(entry.viewId),
        })),
    }));
    this.sheet?.open('Add a tool', sections);
  }

  private _openMenuSheet(): void {
    this.sheet?.open('Menu', [
      {
        title: 'Starter layouts',
        items: this.host.starterLayouts().map(({ key, label }) => ({
          icon: 'dashboard',
          label,
          onSelect: () => this.host.loadStarterLayout(key),
        })),
      },
      {
        title: 'App',
        items: [
          { icon: 'settings', label: 'Settings', onSelect: () => this.host.openSettings() },
          { icon: 'explore', label: 'Take the tour', onSelect: () => this.host.startTour() },
          ...(this.panels.size
            ? [{ icon: 'clear_all', label: 'Close all tabs', onSelect: () => this.host.closeAll() }]
            : []),
        ],
      },
    ]);
  }

  // ─── Order / persistence ───────────────────────────────────────────────────

  /** Returns instanceIds in current tab order. */
  public getOrder(): string[] {
    return this.tabBar?.getOrder() ?? [];
  }

  public setOrder(order: string[]): void {
    this.tabBar?.setOrder(order);
    this._refreshVisible();
  }

  /** The instanceIds of the panels on screen, in tab order. */
  public getVisibleIds(): string[] {
    return [...this.visibleIds];
  }

  /** The instanceId of the currently visible tab panel, if any. */
  public getActiveId(): string | null {
    return this.activeId;
  }

  serializeLayout(): LayoutData {
    return {
      tabbed: {
        order: this.getOrder(),
        activeId: this.activeId ?? undefined,
        ...(this.splitRatio !== PANE_SPLIT_DEFAULT ? { split: this.splitRatio } : {}),
      },
    };
  }

  applyLayoutData(data: LayoutData | undefined): void {
    const saved = data?.tabbed;
    this.splitRatio = clampPaneSplit(saved?.split);
    // Tabs the saved order doesn't know (opened while floating) stay at the end.
    if (saved?.order) this.tabBar?.setOrder(saved.order);

    const focusId = [saved?.activeId, this.activeId, this.getOrder()[0]].find(
      (id): id is string => !!id && this.panels.has(id),
    );
    if (focusId) this.focus(focusId);
    else this._syncShell();

    this.refreshLinks();
  }
}
