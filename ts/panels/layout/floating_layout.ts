// ts/panels/layout/floating_layout.ts
// Implements LayoutStrategy for the desktop floating-window experience.
// Extracted verbatim-first from panel_manager.ts; geometry and chrome creation
// live here; instance lifecycle and persistence remain in PanelHost.

import { FloatingViewWrapper, GRID_UNIT } from '../panel_wrapper';
import { FloatingViewInstanceState } from '../panel_types';
import { emitEvent } from '../../core/events';
import type { LayoutStrategy, LayoutKind, LayoutData, PanelChrome, PanelSpawnInfo } from './layout_strategy';

// ─── Grid coordinate helpers (verbatim from panel_manager) ────────────────────

function pixelToGridCol(px: number): number {
  return Math.round(px / GRID_UNIT);
}

function pixelToGridRow(py: number): number {
  return Math.round(py / GRID_UNIT);
}

function gridColToPixel(col: number, scale: number): number {
  return col * scale * GRID_UNIT;
}

function gridRowToPixel(row: number, scale: number): number {
  return row * scale * GRID_UNIT;
}

function viewportGridSize(el: HTMLElement | null): { cols: number; rows: number } {
  const w = el?.clientWidth ?? window.innerWidth;
  const h = el?.clientHeight ?? window.innerHeight;
  return {
    cols: Math.max(1, Math.round(w / GRID_UNIT)),
    rows: Math.max(1, Math.round(h / GRID_UNIT)),
  };
}

// ─── FloatingChrome ───────────────────────────────────────────────────────────

class FloatingChrome implements PanelChrome {
  constructor(private wrapper: FloatingViewWrapper) {}

  get wrapperEl(): HTMLElement { return this.wrapper.element; }

  setTitle(title: string): void { this.wrapper.setTitle(title); }
  setZoomActive(active: boolean): void { this.wrapper.updateZoomButtonState(active); }
  notifyContentReplaced(forceAutoSize: boolean): void { this.wrapper.notifyContentReplaced(forceAutoSize); }
  destroy(): HTMLElement { return this.wrapper.destroy(); }
}

// ─── FloatingLayout ───────────────────────────────────────────────────────────

export class FloatingLayout implements LayoutStrategy {
  readonly kind: LayoutKind = 'floating';

  private area: HTMLElement | null = null;
  private chromes = new Map<string, FloatingChrome>();
  private _onNeedsSave: () => void;
  private _resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  /** Tracks the current maximum z-index across all floating windows. Persisted
   *  in the layout data so z-order survives reload. */
  currentMaxZIndex = 100;

  constructor(onNeedsSave: () => void) {
    this._onNeedsSave = onNeedsSave;
  }

  mount(area: HTMLElement): void {
    this.area = area;
    window.addEventListener('resize', this._handleWindowResize);
  }

  unmount(): void {
    window.removeEventListener('resize', this._handleWindowResize);
    if (this._resizeDebounceTimer !== null) {
      clearTimeout(this._resizeDebounceTimer);
      this._resizeDebounceTimer = null;
    }
    this.area = null;
  }

  private _handleWindowResize = (): void => {
    if (this._resizeDebounceTimer !== null) clearTimeout(this._resizeDebounceTimer);
    this._resizeDebounceTimer = setTimeout(() => {
      this._resizeDebounceTimer = null;
      this._clampAllViews();
    }, 100);
  };

  /** Find a non-overlapping spawn position for a new panel. Returns null if none found. */
  findSpawnPosition(estimatedWidth: number, estimatedHeight: number): { x: number; y: number } | null {
    if (!this.area) return null;

    const MARGIN = 16;
    const STEP = GRID_UNIT * 2;

    const areaWidth = this.area.clientWidth;
    const areaHeight = this.area.clientHeight;

    const sidebarEl = document.querySelector('.side-bar-container');
    const sidebarWidth = sidebarEl ? sidebarEl.getBoundingClientRect().width : 0;

    const targetX = sidebarWidth + MARGIN;
    if (targetX + estimatedWidth + MARGIN > areaWidth) return null;

    const maxY = areaHeight - estimatedHeight - MARGIN;
    if (maxY < MARGIN) return null;

    type Rect = { x: number; y: number; w: number; h: number };
    const blocked: Rect[] = [{ x: 0, y: 0, w: sidebarWidth, h: areaHeight }];
    for (const [, chrome] of this.chromes) {
      const wEl = chrome.wrapperEl;
      blocked.push({
        x: parseFloat(wEl.style.left || '0'),
        y: parseFloat(wEl.style.top || '0'),
        w: wEl.offsetWidth || estimatedWidth,
        h: wEl.offsetHeight || estimatedHeight,
      });
    }

    for (let y = MARGIN; y <= maxY; y += STEP) {
      const overlaps = blocked.some(
        (r) => targetX < r.x + r.w && targetX + estimatedWidth > r.x && y < r.y + r.h && y + estimatedHeight > r.y,
      );
      if (!overlaps) return { x: targetX, y };
    }
    return null;
  }

  private _clampAllViews(): void {
    const vpW = this.area?.clientWidth ?? window.innerWidth;
    const vpH = this.area?.clientHeight ?? window.innerHeight;
    for (const [, chrome] of this.chromes) {
      const el = chrome.wrapperEl;
      const x = parseFloat(el.style.left || '0');
      const y = parseFloat(el.style.top || '0');
      const size = { width: el.offsetWidth, height: el.offsetHeight };
      const clampedX = Math.max(0, Math.min(x, vpW - size.width));
      const clampedY = Math.max(0, Math.min(y, vpH - size.height));
      if (clampedX !== x || clampedY !== y) {
        el.style.left = `${clampedX}px`;
        el.style.top = `${clampedY}px`;
      }
    }
    this._onNeedsSave();
  }

  // ─── LayoutStrategy implementation ────────────────────────────────────────

  createChrome(info: PanelSpawnInfo): PanelChrome {
    if (!this.area) throw new Error('FloatingLayout.createChrome called before mount');

    this.currentMaxZIndex = Math.max(this.currentMaxZIndex, info.zIndex ?? 0);
    const zIndex = info.zIndex ?? ++this.currentMaxZIndex;

    const defaultPosition = (() => {
      const sidebarEl = document.querySelector('.side-bar-container');
      const sidebarWidth = sidebarEl ? sidebarEl.getBoundingClientRect().width : 0;
      const fallback = {
        x: sidebarWidth + 48 + ((this.chromes.size * 20) % 300),
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
      gridPosition: { col: pixelToGridCol(pos.x), row: pixelToGridRow(pos.y) },
      gridSize: info.size
        ? { cols: pixelToGridCol(info.size.width), rows: pixelToGridRow(info.size.height) }
        : undefined,
      zIndex,
      viewState: undefined,
      collapsed: info.collapsed,
      zoomActive: info.zoomActive,
    };

    const onStateChange = (newState: FloatingViewInstanceState) => {
      if (newState.zIndex < this.currentMaxZIndex) {
        this.currentMaxZIndex++;
        newState.zIndex = this.currentMaxZIndex;
        wrapper.bringToFront(newState.zIndex);
      }
      this._onNeedsSave();
    };

    const wrapper = new FloatingViewWrapper(
      state,
      info.title,
      info.contentEl,
      info.onClose ?? (() => {}),
      onStateChange,
      this._onNeedsSave,
      info.defaultWidth,
      info.defaultHeight,
      info.minWidth,
      info.minHeight,
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
    const refGrid = viewportGridSize(this.area);
    const perInstance: Record<string, { gridPosition: { col: number; row: number }; gridSize?: { cols: number; rows: number }; zIndex: number }> = {};

    for (const [instanceId, chrome] of this.chromes) {
      const el = chrome.wrapperEl;
      const x = parseFloat(el.style.left || '0');
      const y = parseFloat(el.style.top || '0');
      perInstance[instanceId] = {
        gridPosition: { col: pixelToGridCol(x), row: pixelToGridRow(y) },
        gridSize: el.offsetWidth > 0
          ? { cols: pixelToGridCol(el.offsetWidth), rows: pixelToGridRow(el.offsetHeight) }
          : undefined,
        zIndex: parseInt(el.style.zIndex || '100'),
      };
    }

    return {
      floating: {
        referenceGrid: refGrid,
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

  /** Compute the scale factor for restore (fit saved layout into current viewport). */
  computeRestoreScale(savedRefGrid: { cols: number; rows: number }): number {
    const currentGrid = viewportGridSize(this.area);
    return Math.min(currentGrid.cols / savedRefGrid.cols, currentGrid.rows / savedRefGrid.rows);
  }

  /** Remove the chrome for an instance. Returns the contentEl for strategy switches. */
  removeChrome(instanceId: string): HTMLElement | null {
    const chrome = this.chromes.get(instanceId);
    if (!chrome) return null;
    this.chromes.delete(instanceId);
    return chrome.destroy();
  }
}
