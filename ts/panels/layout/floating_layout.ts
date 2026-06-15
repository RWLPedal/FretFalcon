// ts/panels/layout/floating_layout.ts
// Implements LayoutStrategy for the desktop floating-window experience.
//
// Geometry model (see grid_constants.ts):
//   The workspace is GRID_COLS square cells wide, anchored to the CONTENT region
//   (col 0 == sidebar right edge). Each panel has a canonical integer grid rect
//   {col,row,colSpan,rowSpan}; pixel positions/sizes are always derived from it via
//   the live GridGeometry. On window/sidebar resize we re-derive px straight from
//   the canonical rect (no px→cell→px round-tripping, so positions never drift).

import { FloatingViewWrapper } from '../panel_wrapper';
import { FloatingViewInstanceState } from '../panel_types';
import { emitEvent } from '../../core/events';
import {
  GRID_COLS, ROW_PX, DESIGN_ROWS,
  GridGeometry, gridGeometry, fitGridGeometry, colToPx, pxToCol, rowToPx, pxToRow,
} from '../grid_constants';
import { reconcileLayout, ReconcileItem } from './grid_packer';
import type { LayoutStrategy, LayoutKind, LayoutData, PanelChrome, PanelSpawnInfo } from './layout_strategy';

/** Canonical integer grid rectangle for a panel. */
export interface GridRect { col: number; row: number; colSpan: number; rowSpan: number; }

// ─── FloatingChrome ───────────────────────────────────────────────────────────

class FloatingChrome implements PanelChrome {
  constructor(private wrapper: FloatingViewWrapper) {}

  get wrapperEl(): HTMLElement { return this.wrapper.element; }

  setTitle(title: string): void { this.wrapper.setTitle(title); }
  setZoomActive(active: boolean): void { this.wrapper.updateZoomButtonState(active); }
  notifyContentReplaced(forceAutoSize: boolean): void { this.wrapper.notifyContentReplaced(forceAutoSize); }
  setSizeConstraints(c: { minWidth?: number; minHeight?: number; maxWidth?: number; maxHeight?: number }): void {
    this.wrapper.setSizeConstraints(c);
  }
  destroy(): HTMLElement { return this.wrapper.destroy(); }
}

// ─── FloatingLayout ───────────────────────────────────────────────────────────

export class FloatingLayout implements LayoutStrategy {
  readonly kind: LayoutKind = 'floating';

  private area: HTMLElement | null = null;
  private chromes = new Map<string, FloatingChrome>();
  /** Canonical integer grid rect per instance — the source of truth for geometry. */
  private gridRects = new Map<string, GridRect>();
  /** Cached live cell geometry. Updated ONLY by _recomputeGeometry (mount / resize /
   *  load), so tidy/drag/spawn never change the grid size. */
  private _geom: GridGeometry = gridGeometry(window.innerWidth, 0);
  private _onNeedsSave: () => void;
  /** Invoked whenever the live cell size may have changed (load / resize / tidy), so
   *  the grid background + drag-snap can be re-synced to the fit-aware cell. */
  private _onGeometryChanged: () => void;
  private _resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _sidebarObserver: ResizeObserver | null = null;

  /** Tracks the current maximum z-index across all floating windows. Persisted
   *  in the layout data so z-order survives reload. */
  currentMaxZIndex = 100;

  constructor(onNeedsSave: () => void, onGeometryChanged: () => void = () => {}) {
    this._onNeedsSave = onNeedsSave;
    this._onGeometryChanged = onGeometryChanged;
  }

  mount(area: HTMLElement): void {
    this.area = area;
    // Defensive: clear any stale scale transform (the old overflow safety net set
    // one here). The area is now always full-scale; the grid scales the fixed design
    // space to fit the viewport instead.
    area.style.transform = '';
    area.style.transformOrigin = '';
    this._recomputeGeometry();
    window.addEventListener('resize', this._handleWindowResize);
    // Collapsing/expanding the sidebar changes the content origin and cell size
    // without firing a window 'resize', so watch the sidebar width directly.
    const sidebarEl = document.querySelector('.side-bar-container');
    if (sidebarEl && typeof ResizeObserver !== 'undefined') {
      this._sidebarObserver = new ResizeObserver(() => this._handleWindowResize());
      this._sidebarObserver.observe(sidebarEl);
    }
  }

  unmount(): void {
    window.removeEventListener('resize', this._handleWindowResize);
    if (this._sidebarObserver) { this._sidebarObserver.disconnect(); this._sidebarObserver = null; }
    if (this._resizeDebounceTimer !== null) {
      clearTimeout(this._resizeDebounceTimer);
      this._resizeDebounceTimer = null;
    }
    this.area = null;
  }

  // ─── Geometry helpers ──────────────────────────────────────────────────────

  private _sidebarWidth(): number {
    const el = document.querySelector('.side-bar-container');
    return el ? el.getBoundingClientRect().width : 0;
  }

  private _geometry(): GridGeometry {
    const areaWidth = this.area?.clientWidth ?? window.innerWidth;
    const areaHeight = this.area?.clientHeight ?? window.innerHeight;
    // The cell scales a fixed GRID_COLS × DESIGN_ROWS design space to fit the viewport.
    // It depends only on the viewport (never the open layout), so every layout renders
    // at the same grid size and switching layouts can't change it.
    return fitGridGeometry(areaWidth, this._sidebarWidth(), areaHeight, DESIGN_ROWS);
  }

  /** The live, cached grid geometry. Deliberately does NOT recompute: tidy / drag /
   *  spawn / auto-size all read this, so they see a stable cell. The cell only changes
   *  when the viewport does (mount / resize), or once at page load — see
   *  {@link _recomputeGeometry}. */
  currentGeometry(): GridGeometry {
    return this._geom;
  }

  /** Recompute and cache the cell from the current viewport (the fixed design space
   *  scaled to fit). Called ONLY on a viewport change (mount / resize) and once at page
   *  load. It is intentionally never called from tidy / named-layout load / drag / spawn
   *  / auto-size: the grid size must not change just because the layout did. (Because the
   *  cell is viewport-only this is idempotent w.r.t. the layout anyway — confining the
   *  call simply makes that guarantee explicit and avoids redundant reflows.) */
  private _recomputeGeometry(): GridGeometry {
    this._geom = this._geometry();
    return this._geom;
  }

  private _handleWindowResize = (): void => {
    if (this._resizeDebounceTimer !== null) clearTimeout(this._resizeDebounceTimer);
    this._resizeDebounceTimer = setTimeout(() => {
      this._resizeDebounceTimer = null;
      this._relayoutFromGrid();
    }, 100);
  };

  /** Re-derive every panel's px position/size from its canonical grid rect using
   *  the current (fit-aware) geometry. Stable: no cumulative rounding drift. The
   *  fit-aware cell already scales a tall layout down to fit the viewport; if panels
   *  still overlap — typically a smaller cell colliding with CSS min-width/height
   *  floors — reconcile (preserve-X push-down) to clear it. */
  private _relayoutFromGrid(): void {
    if (!this.area) return;
    this._recomputeGeometry();
    for (const [id, chrome] of this.chromes) {
      const rect = this.gridRects.get(id);
      if (rect) this._applyRectPx(chrome.wrapperEl, rect, this._geom);
    }
    if (this._hasOverlapOrOverflow()) {
      this._reconcileToFit();
    } else {
      this._onNeedsSave();
      this._onGeometryChanged();
    }
  }

  /** True when any two panels overlap or any panel spills past the area edge — using
   *  actual rendered boxes (which include CSS min/max clamps), not just grid math. */
  private _hasOverlapOrOverflow(): boolean {
    if (!this.area) return false;
    const vpW = this.area.clientWidth;
    const vpH = this.area.clientHeight;
    const boxes: { x: number; y: number; w: number; h: number }[] = [];
    for (const [, chrome] of this.chromes) {
      const el = chrome.wrapperEl;
      const x = parseFloat(el.style.left || '0');
      const y = parseFloat(el.style.top || '0');
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (x + w > vpW + 1 || y + h > vpH + 1) return true;
      boxes.push({ x, y, w, h });
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) return true;
      }
    }
    return false;
  }

  /** Resolve residual overlaps without resizing, seeded from each panel's current
   *  position and ACTUAL rendered footprint (so CSS min sizes are respected). Keeps
   *  columns aligned (preserve-X) and pushes overlapping panels straight down. */
  private _reconcileToFit(): void {
    if (!this.area) return;
    const items: ReconcileItem[] = [];
    for (const id of this.chromes.keys()) {
      const rect = this.gridRects.get(id);
      if (!rect) continue;
      items.push({ id, col: rect.col, row: rect.row, colSpan: rect.colSpan, rowSpan: rect.rowSpan });
    }
    const reconciled = reconcileLayout(items);
    this.applyRects(reconciled);
  }

  /** Write a canonical rect to an element as px (position always; size unless the
   *  panel is collapsed, which auto-sizes its height). */
  private _applyRectPx(el: HTMLElement, rect: GridRect, g: GridGeometry): void {
    el.style.left = `${colToPx(rect.col, g)}px`;
    el.style.top = `${rowToPx(rect.row, g)}px`;
    if (!el.classList.contains('is-panel-collapsed')) {
      el.style.width = `${rect.colSpan * g.cell}px`;
      el.style.height = `${rect.rowSpan * g.cell}px`;
    }
  }

  /** Recompute and store the canonical grid rect from an element's current px.
   *  Called whenever the user drags/resizes a panel. Sizes are read from the inline
   *  STYLE (what we actually set), not offsetWidth/Height — the latter includes the
   *  CSS min-size floor, which would inflate the span and destabilise the fit cell. */
  private _recordRectFromEl(instanceId: string): void {
    const chrome = this.chromes.get(instanceId);
    if (!chrome) return;
    const el = chrome.wrapperEl;
    const g = this._geom;
    const prev = this.gridRects.get(instanceId);
    const col = Math.max(0, Math.round(pxToCol(parseFloat(el.style.left || '0'), g)));
    const row = Math.max(0, Math.round(pxToRow(parseFloat(el.style.top || '0'), g)));
    const collapsed = el.classList.contains('is-panel-collapsed');
    const styleW = parseFloat(el.style.width);
    const styleH = parseFloat(el.style.height);
    const colSpan = styleW > 0 ? Math.max(1, Math.round(styleW / g.cell)) : (prev?.colSpan ?? 1);
    // While collapsed the height is just the title bar — keep the prior rowSpan.
    const rowSpan = collapsed
      ? (prev?.rowSpan ?? 1)
      : (styleH > 0 ? Math.max(1, Math.round(styleH / g.cell)) : (prev?.rowSpan ?? 1));
    this.gridRects.set(instanceId, { col, row, colSpan, rowSpan });
  }

  /** Find a non-overlapping spawn position for a new panel, inside the content
   *  region. Returns null if none found. */
  findSpawnPosition(estimatedWidth: number, estimatedHeight: number): { x: number; y: number } | null {
    if (!this.area) return null;

    const MARGIN = 16;
    const areaWidth = this.area.clientWidth;
    const areaHeight = this.area.clientHeight;
    const g = this._geom;
    const cell = g.cell;
    const startX = g.originX + MARGIN;

    if (startX + estimatedWidth + MARGIN > areaWidth) return null;
    const maxY = areaHeight - estimatedHeight - MARGIN;
    if (maxY < MARGIN) return null;

    type Rect = { x: number; y: number; w: number; h: number };
    const blocked: Rect[] = [{ x: 0, y: 0, w: g.originX, h: areaHeight }];
    for (const [, chrome] of this.chromes) {
      const wEl = chrome.wrapperEl;
      blocked.push({
        x: parseFloat(wEl.style.left || '0'),
        y: parseFloat(wEl.style.top || '0'),
        w: wEl.offsetWidth || estimatedWidth,
        h: wEl.offsetHeight || estimatedHeight,
      });
    }

    for (let rowIdx = 0; rowIdx * cell <= maxY; rowIdx++) {
      const y = rowIdx * cell + MARGIN;
      if (y > maxY) break;
      for (let x = startX; x + estimatedWidth <= areaWidth - MARGIN; x += cell) {
        const overlaps = blocked.some(
          (r) => x < r.x + r.w && x + estimatedWidth > r.x && y < r.y + r.h && y + estimatedHeight > r.y,
        );
        if (!overlaps) return { x, y };
      }
    }
    // Cascade fallback inside the content region.
    const cascade = this.chromes.size;
    return { x: startX + (cascade * cell) % Math.max(cell, (areaWidth - startX) / 2), y: MARGIN + (cascade * cell) % (areaHeight / 2) };
  }

  private _clampAllViews(): void {
    const vpW = this.area?.clientWidth ?? window.innerWidth;
    const vpH = this.area?.clientHeight ?? window.innerHeight;
    const minX = this._geom.originX;
    for (const [id, chrome] of this.chromes) {
      const el = chrome.wrapperEl;
      const x = parseFloat(el.style.left || '0');
      const y = parseFloat(el.style.top || '0');
      const size = { width: el.offsetWidth, height: el.offsetHeight };
      const clampedX = Math.max(minX, Math.min(x, vpW - size.width));
      const clampedY = Math.max(0, Math.min(y, vpH - size.height));
      if (clampedX !== x || clampedY !== y) {
        el.style.left = `${clampedX}px`;
        el.style.top = `${clampedY}px`;
        this._recordRectFromEl(id);
      }
    }
    this._onNeedsSave();
  }

  // ─── LayoutStrategy implementation ────────────────────────────────────────

  createChrome(info: PanelSpawnInfo): PanelChrome {
    if (!this.area) throw new Error('FloatingLayout.createChrome called before mount');

    this.currentMaxZIndex = Math.max(this.currentMaxZIndex, info.zIndex ?? 0);
    const zIndex = info.zIndex ?? ++this.currentMaxZIndex;

    // Use the stable cached cell — spawning a panel must not change the grid size. The
    // initial page-load restore refreshes the cell separately via applyRects.
    const g = this._geom;

    const defaultPosition = (() => {
      const fallback = {
        x: g.originX + 48 + ((this.chromes.size * 20) % 300),
        y: 48 + ((this.chromes.size * 20) % 400),
      };
      const estW = info.defaultWidth ?? 300;
      const estH = info.defaultHeight ?? 200;
      return this.findSpawnPosition(estW, estH) ?? fallback;
    })();

    const pos = info.position ?? defaultPosition;

    const state: FloatingViewInstanceState = {
      instanceId: info.instanceId,
      viewId: info.instanceId as any, // not used by wrapper
      position: pos,
      size: info.size,
      gridPosition: { col: Math.round(pxToCol(pos.x, g)), row: Math.round(pxToRow(pos.y, g)) },
      gridSize: info.size
        ? { cols: Math.round(info.size.width / g.cell), rows: Math.round(info.size.height / g.cell) }
        : undefined,
      zIndex,
      viewState: undefined,
      collapsed: info.collapsed,
      zoomActive: info.zoomActive,
    };

    // Seed the canonical grid rect (corrected on the first user change / auto-size).
    const seedW = info.size?.width ?? info.defaultWidth ?? g.cell;
    const seedH = info.size?.height ?? info.defaultHeight ?? g.cell;
    this.gridRects.set(info.instanceId, {
      col: Math.max(0, Math.round(pxToCol(pos.x, g))),
      row: Math.max(0, Math.round(pxToRow(pos.y, g))),
      colSpan: Math.max(1, Math.round(seedW / g.cell)),
      rowSpan: Math.max(1, Math.round(seedH / g.cell)),
    });

    const recordAndSave = () => { this._recordRectFromEl(info.instanceId); this._onNeedsSave(); };

    const onStateChange = (newState: FloatingViewInstanceState) => {
      if (newState.zIndex < this.currentMaxZIndex) {
        this.currentMaxZIndex++;
        newState.zIndex = this.currentMaxZIndex;
        wrapper.bringToFront(newState.zIndex);
      }
      this._recordRectFromEl(info.instanceId);
      this._onNeedsSave();
    };

    const wrapper = new FloatingViewWrapper(
      state,
      info.title,
      info.contentEl,
      info.onClose ?? (() => {}),
      onStateChange,
      recordAndSave,
      info.defaultWidth,
      info.defaultHeight,
      info.minWidth,
      info.minHeight,
      info.maxWidth,
      info.maxHeight,
      info.onRotate,
      info.onZoom,
      info.supportsConfigToggle ? () => {
        emitEvent(info.contentEl, 'config-visibility-toggle', {}, { bubbles: false });
      } : undefined,
    );

    this.area.appendChild(wrapper.element);
    wrapper.notifyDefaultDimensions();

    const chrome = new FloatingChrome(wrapper);
    this.chromes.set(info.instanceId, chrome);
    return chrome;
  }

  focus(instanceId: string): void {
    const chrome = this.chromes.get(instanceId);
    if (!chrome) return;
    this.currentMaxZIndex++;
    chrome.wrapperEl.style.zIndex = String(this.currentMaxZIndex);
    chrome.wrapperEl.scrollIntoView({ block: 'nearest' });
  }

  handleResize(): void {
    this._clampAllViews();
  }

  serializeLayout(): LayoutData {
    const perInstance: Record<string, { col: number; row: number; colSpan?: number; rowSpan?: number; zIndex: number }> = {};

    for (const [instanceId, chrome] of this.chromes) {
      const rect = this.gridRects.get(instanceId);
      if (!rect) continue;
      const el = chrome.wrapperEl;
      perInstance[instanceId] = {
        col: rect.col,
        row: rect.row,
        colSpan: rect.colSpan,
        rowSpan: rect.rowSpan,
        zIndex: parseInt(el.style.zIndex || '100'),
      };
    }

    return {
      floating: {
        gridCols: GRID_COLS,
        rowPx: ROW_PX,
        nextZIndex: this.currentMaxZIndex,
        perInstance,
      },
    };
  }

  applyLayoutData(data: LayoutData | undefined): void {
    if (data?.floating?.nextZIndex) {
      this.currentMaxZIndex = Math.max(this.currentMaxZIndex, data.floating.nextZIndex);
    }
    this._clampAllViews();
  }

  // ─── Extra public methods (FloatingLayout-specific) ────────────────────────

  /** Called from PanelHost after it re-renders a view into contentEl (rotate/zoom). */
  notifyContentReplaced(instanceId: string, forceAutoSize: boolean): void {
    this.chromes.get(instanceId)?.notifyContentReplaced(forceAutoSize);
  }

  /** Re-derive every panel's canonical grid rect from its live DOM box. Used before
   *  Tidy so compaction works from the panels' ACTUAL rendered footprints (which may
   *  differ from the authored/restored spans), not stale seeds. Records against the
   *  current cached cell — it must NOT recompute the cell, or Tidy could shrink the grid. */
  syncRectsFromDom(): void {
    for (const id of this.chromes.keys()) this._recordRectFromEl(id);
  }

  /** Snapshot of every open panel's canonical grid rect (for the tidy orchestrator). */
  getPanelRects(): Map<string, GridRect> {
    const out = new Map<string, GridRect>();
    for (const [id, rect] of this.gridRects) {
      if (this.chromes.has(id)) out.set(id, { ...rect });
    }
    return out;
  }

  /** Apply externally-computed grid rects (e.g. from the tidy compaction),
   *  optionally animating the transition and pausing link redraws.
   *
   *  Renders at the current cached cell so the grid size is unchanged — Tidy and
   *  named-layout loads must never resize the grid. `recomputeCell` is used only by the
   *  initial page-load restore, to re-read the viewport once the sidebar has rendered
   *  (its width affects the content origin and cell). */
  applyRects(
    rects: Record<string, GridRect>,
    opts?: { animate?: boolean; recomputeCell?: boolean; linkManager?: { beginReflowRedraw(ms: number): void } | null },
  ): void {
    if (!this.area) return;

    for (const [id, rect] of Object.entries(rects)) {
      if (this.chromes.has(id)) this.gridRects.set(id, { ...rect });
    }

    const g = opts?.recomputeCell ? this._recomputeGeometry() : this._geom;
    const animate = opts?.animate ?? false;
    const DURATION_MS = 250;
    if (animate) opts?.linkManager?.beginReflowRedraw(DURATION_MS);

    for (const [id, rect] of Object.entries(rects)) {
      const chrome = this.chromes.get(id);
      if (!chrome) continue;
      const el = chrome.wrapperEl;
      if (animate) {
        el.classList.add('is-reflowing');
        const onDone = () => { el.removeEventListener('transitionend', onDone); el.classList.remove('is-reflowing'); };
        el.addEventListener('transitionend', onDone);
      }
      this._applyRectPx(el, rect, g);
    }
    this._onNeedsSave();
    this._onGeometryChanged();
  }

  /** Drop an instance from the layout's bookkeeping (its chrome entry + canonical
   *  grid rect) after PanelHost has destroyed the chrome. Without this a destroyed
   *  panel lingers as a "ghost": getPanelRects()/serializeLayout() gate on
   *  `chromes.has(id)`, so a stale entry would still feed Tidy — de-overlapping the
   *  visible panels around an invisible rect — and bloat the persisted layout.
   *  Idempotent: a no-op for an unknown id. */
  forgetInstance(instanceId: string): void {
    this.chromes.delete(instanceId);
    this.gridRects.delete(instanceId);
  }
}
