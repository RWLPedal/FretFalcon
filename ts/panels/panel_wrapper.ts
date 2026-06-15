import { FloatingViewInstanceState } from "./panel_types";
import { emitEvent, onEvent } from '../core/events';

// --- Grid Snap ---
/** Legacy constant kept for onboarding imports. Decoupled from storage/snap logic. */
export const GRID_UNIT = 12;

export const FLOATING_VIEW_WRAPPER_CLASS = 'floating-view-wrapper';
export const FLOATING_VIEW_TITLEBAR_CLASS = 'floating-view-titlebar';
export const FLOATING_VIEW_RESIZE_HANDLE_CLASS = 'floating-view-resize-handle';

interface GridCell { w: number; h: number }
let moduleGridCell: GridCell | null = null;

/** Left edge of the content region (sidebar right edge), in px. Panels can't be
 *  dragged left of this, so they never disappear behind the sidebar. */
let moduleContentOriginX = 0;

/** Enable or disable snap-to-grid. Pass a cell { w, h } to snap; null to disable. */
export function setFloatingViewGridSize(cell: GridCell | null): void {
  moduleGridCell = cell;
}

/** Set the content-region left edge (px) used to clamp dragging. */
export function setFloatingViewContentOriginX(px: number): void {
  moduleContentOriginX = Math.max(0, px);
}

// The grid cell is square (w === h; see _applyGrid), so the two axes share one snap
// unit. Two cases only: an origin-free snap for sizes and for the y position (the grid's
// y origin is 0), and an origin-aware snap for the x position (below).
function snapCell(v: number): number {
  return moduleGridCell ? Math.round(v / moduleGridCell.w) * moduleGridCell.w : v;
}
/** Snap an x POSITION (a panel's left edge) to the content grid. The grid background is
 *  drawn from the content origin (the sidebar's right edge, --grid-origin-x in
 *  _applyGrid), not x=0 — so snapping to a bare multiple of the cell (snapCell) would
 *  leave the panel offset from the visible grid by `originX mod cell` px. There's no
 *  snapTop counterpart because the grid's y origin IS 0, so snapCell already aligns. */
function snapLeft(v: number): number {
  if (!moduleGridCell) return v;
  const o = moduleContentOriginX;
  return o + Math.round((v - o) / moduleGridCell.w) * moduleGridCell.w;
}
// --- End Grid Snap ---

// Basic Dragging Logic (can be enhanced or use a library)
let dragOffsetX = 0;
let dragOffsetY = 0;
let draggedElement: HTMLElement | null = null;

function startDrag(e: MouseEvent, element: HTMLElement) {
  draggedElement = element;
  const rect = element.getBoundingClientRect();
  dragOffsetX = e.clientX - rect.left;
  dragOffsetY = e.clientY - rect.top;
  document.addEventListener("mousemove", doDrag);
  document.addEventListener("mouseup", stopDrag);
  element.style.cursor = "grabbing";
  element.classList.add("is-dragging");
}

function doDrag(e: MouseEvent) {
  if (!draggedElement) return;
  let newX = e.clientX - dragOffsetX;
  let newY = e.clientY - dragOffsetY;

  const parent = (draggedElement.offsetParent as HTMLElement) || document.body;
  const parentRect = parent.getBoundingClientRect();
  const elemRect = draggedElement.getBoundingClientRect();

  const maxX = Math.max(moduleContentOriginX, parentRect.width - elemRect.width);
  const clampedX = Math.max(moduleContentOriginX, Math.min(newX, maxX));
  const clampedY = Math.max(0, Math.min(newY, parentRect.height - elemRect.height));
  newX = snapLeft(clampedX);
  newY = snapCell(clampedY);

  draggedElement.style.left = `${newX}px`;
  draggedElement.style.top = `${newY}px`;
}

function stopDrag() {
  if (draggedElement) {
    draggedElement.style.cursor = "grab";
    draggedElement.classList.remove("is-dragging");
    const managerCallback = (draggedElement as any)._notifyPositionChange;
    if (managerCallback) {
      managerCallback(
        parseFloat(draggedElement.style.left || "0"),
        parseFloat(draggedElement.style.top || "0")
      );
    }
  }
  draggedElement = null;
  document.removeEventListener("mousemove", doDrag);
  document.removeEventListener("mouseup", stopDrag);
}
// --- End Dragging Logic ---

// --- Corner Resize Logic ---
interface _ResizeState {
  element: HTMLElement;
  corner: 'tl' | 'tr' | 'bl' | 'br';
  startMouseX: number;
  startMouseY: number;
  startWidth: number;
  startHeight: number;
  startLeft: number;
  startTop: number;
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
  onDone: (left: number, top: number) => void;
}

let _resizeState: _ResizeState | null = null;

function startCornerResize(
  e: MouseEvent,
  element: HTMLElement,
  corner: 'tl' | 'tr' | 'bl' | 'br',
  onDone: (left: number, top: number) => void
): void {
  e.preventDefault();
  e.stopPropagation();
  if (element.classList.contains('is-panel-collapsed')) return;
  const style = getComputedStyle(element);
  _resizeState = {
    element, corner,
    startMouseX: e.clientX,
    startMouseY: e.clientY,
    startWidth: element.offsetWidth,
    startHeight: element.offsetHeight,
    startLeft: parseFloat(element.style.left || '0'),
    startTop: parseFloat(element.style.top || '0'),
    minWidth: parseFloat(style.minWidth) || 150,
    minHeight: parseFloat(style.minHeight) || 50,
    maxWidth: parseFloat(style.maxWidth) || Infinity,
    maxHeight: parseFloat(style.maxHeight) || Infinity,
    onDone,
  };
  document.body.style.userSelect = 'none';
  document.addEventListener('mousemove', _doCornerResize);
  document.addEventListener('mouseup', _stopCornerResize);
}

function _doCornerResize(e: MouseEvent): void {
  if (!_resizeState) return;
  const { element, corner, startMouseX, startMouseY, startWidth, startHeight,
          startLeft, startTop, minWidth, minHeight, maxWidth, maxHeight } = _resizeState;
  const dx = e.clientX - startMouseX;
  const dy = e.clientY - startMouseY;

  const clampW = (w: number) => Math.min(maxWidth, Math.max(minWidth, w));
  const clampH = (h: number) => Math.min(maxHeight, Math.max(minHeight, h));

  let newWidth = startWidth;
  let newHeight = startHeight;
  let newLeft = startLeft;
  let newTop = startTop;

  if (corner === 'br') {
    newWidth = clampW(startWidth + dx);
    newHeight = clampH(startHeight + dy);
  } else if (corner === 'bl') {
    newWidth = clampW(startWidth - dx);
    newHeight = clampH(startHeight + dy);
    newLeft = startLeft + (startWidth - newWidth);
  } else if (corner === 'tr') {
    newWidth = clampW(startWidth + dx);
    newHeight = clampH(startHeight - dy);
    newTop = startTop + (startHeight - newHeight);
  } else {
    newWidth = clampW(startWidth - dx);
    newHeight = clampH(startHeight - dy);
    newLeft = startLeft + (startWidth - newWidth);
    newTop = startTop + (startHeight - newHeight);
  }

  element.style.width = `${newWidth}px`;
  element.style.height = `${newHeight}px`;
  element.style.left = `${newLeft}px`;
  element.style.top = `${newTop}px`;
}

function _stopCornerResize(): void {
  document.removeEventListener('mousemove', _doCornerResize);
  document.removeEventListener('mouseup', _stopCornerResize);
  document.body.style.userSelect = '';
  if (!_resizeState) return;
  const { element, onDone } = _resizeState;
  if (moduleGridCell) {
    element.style.width  = `${snapCell(parseFloat(element.style.width))}px`;
    element.style.height = `${snapCell(parseFloat(element.style.height))}px`;
    element.style.left   = `${snapLeft(parseFloat(element.style.left))}px`;
    element.style.top    = `${snapCell(parseFloat(element.style.top))}px`;
  }
  onDone(parseFloat(element.style.left), parseFloat(element.style.top));
  _resizeState = null;
}
// --- End Corner Resize Logic ---

export class FloatingViewWrapper {
  public element: HTMLElement;
  private contentElement: HTMLElement;

  public get contentEl(): HTMLElement { return this.contentElement; }
  private state: FloatingViewInstanceState;
  private onCloseCallback: (instanceId: string) => void;
  private onStateChangeCallback: (state: FloatingViewInstanceState) => void;
  private onSaveCallback: () => void;
  private onRotateCallback: (() => void) | null;
  private onZoomCallback: (() => void) | null;
  private onConfigToggleCallback: (() => void) | null;
  private titleTextEl: HTMLElement;
  private zoomButtonEl: HTMLButtonElement | null = null;
  private configToggleButtonEl: HTMLButtonElement | null = null;
  private collapseButtonEl: HTMLButtonElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private _resizeSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private _isProgrammaticResize = false;
  private _progResizeClearTimer: ReturnType<typeof setTimeout> | null = null;
  private _firstResizeObserverFire = true;
  private defaultWidth: number;
  private _defaultHeight: number;
  // Unlisten functions for events bound to contentElement
  private _unlistens: Array<() => void> = [];

  /**
   * @param contentEl  Pre-rendered content element (the view has already been
   *                   rendered into it). The wrapper appends it and manages the
   *                   chrome around it. On destroy() the element is detached and
   *                   returned so PanelHost can reuse it during strategy switches.
   * @param onClose    Called when the user clicks the close button. PanelHost
   *                   is responsible for full teardown (view destruction etc.).
   */
  constructor(
    state: FloatingViewInstanceState,
    title: string,
    contentEl: HTMLElement,
    onClose: (instanceId: string) => void,
    onStateChange: (state: FloatingViewInstanceState) => void,
    onSave: () => void,
    defaultWidth?: number,
    defaultHeight?: number,
    minWidth?: number,
    minHeight?: number,
    maxWidth?: number,
    maxHeight?: number,
    onRotate?: () => void,
    onZoom?: () => void,
    onConfigToggle?: () => void
  ) {
    this.state = state;
    this.contentElement = contentEl;
    this.onCloseCallback = onClose;
    this.onStateChangeCallback = onStateChange;
    this.onSaveCallback = onSave;
    this.onRotateCallback = onRotate ?? null;
    this.onZoomCallback = onZoom ?? null;
    this.onConfigToggleCallback = onConfigToggle ?? null;
    this.defaultWidth = defaultWidth ?? 0;
    this._defaultHeight = defaultHeight ?? 0;

    this.element = document.createElement("div");
    this.element.classList.add("floating-view-wrapper");
    this.element.dataset.instanceId = state.instanceId;
    this.element.style.position = "absolute";
    this.element.style.left = `${state.position.x}px`;
    this.element.style.top = `${state.position.y}px`;
    this.element.style.zIndex = `${state.zIndex}`;
    if (minWidth)  this.element.style.minWidth  = `${minWidth}px`;
    if (minHeight) this.element.style.minHeight = `${minHeight}px`;
    if (maxWidth)  this.element.style.maxWidth  = `${maxWidth}px`;
    if (maxHeight) this.element.style.maxHeight = `${maxHeight}px`;
    if (state.size) {
      this.element.style.width = `${state.size.width}px`;
      this.element.style.height = `${state.size.height}px`;
    } else if (defaultWidth || defaultHeight) {
      if (defaultWidth) this.element.style.width = `${defaultWidth}px`;
      if (defaultHeight) this.element.style.height = `${defaultHeight}px`;
    }

    this.element.setAttribute("tabindex", "-1");
    this.element.addEventListener(
      "mousedown",
      () => { this.onStateChangeCallback(this.state); },
      true
    );

    (this.element as any)._notifyPositionChange = (x: number, y: number) => {
      this.state.position = { x, y };
      this.onStateChangeCallback(this.state);
    };

    // --- Title Bar ---
    const titleBar = document.createElement("div");
    titleBar.classList.add("floating-view-titlebar");
    titleBar.style.cursor = "grab";
    titleBar.addEventListener("mousedown", (e) => { startDrag(e, this.element); });

    this.titleTextEl = document.createElement("span");
    this.titleTextEl.classList.add("floating-view-title-text");
    this.titleTextEl.textContent = title;
    titleBar.appendChild(this.titleTextEl);

    // --- Right-aligned button group ---
    const buttonGroup = document.createElement("div");
    buttonGroup.classList.add("floating-view-button-group");

    if (this.onRotateCallback) {
      const rotateButton = document.createElement("button");
      rotateButton.classList.add("floating-view-rotate");
      rotateButton.innerHTML = '<span class="material-icons">autorenew</span>';
      rotateButton.title = "Rotate fretboard";
      rotateButton.onclick = (e) => { e.stopPropagation(); this.onRotateCallback!(); };
      buttonGroup.appendChild(rotateButton);
    }

    if (this.onConfigToggleCallback) {
      const configToggleButton = document.createElement("button");
      configToggleButton.classList.add("floating-view-config-toggle");
      configToggleButton.innerHTML = '<span class="material-icons">tune</span>';
      configToggleButton.title = "Toggle configuration";
      configToggleButton.onclick = (e) => { e.stopPropagation(); this.onConfigToggleCallback!(); };
      buttonGroup.appendChild(configToggleButton);
      this.configToggleButtonEl = configToggleButton;
    }

    if (this.onZoomCallback) {
      const zoomButton = document.createElement("button");
      zoomButton.classList.add("floating-view-zoom");
      zoomButton.innerHTML = '<span class="material-icons">zoom_in</span>';
      zoomButton.title = "Toggle zoom";
      if (state.zoomActive) zoomButton.classList.add("is-active");
      zoomButton.onclick = (e) => { e.stopPropagation(); this.onZoomCallback!(); };
      buttonGroup.appendChild(zoomButton);
      this.zoomButtonEl = zoomButton;
    }

    const collapseButton = document.createElement("button");
    collapseButton.classList.add("floating-view-collapse");
    collapseButton.innerHTML = '<span class="material-icons">expand_less</span>';
    collapseButton.title = "Collapse";
    collapseButton.onclick = (e) => { e.stopPropagation(); this._toggleCollapse(); };
    buttonGroup.appendChild(collapseButton);
    this.collapseButtonEl = collapseButton;

    const closeButton = document.createElement("button");
    closeButton.classList.add("floating-view-close");
    closeButton.innerHTML = '<span class="material-icons">close</span>';
    closeButton.title = "Close";
    closeButton.onclick = (e) => {
      e.stopPropagation();
      this.onCloseCallback(this.state.instanceId);
    };
    buttonGroup.appendChild(closeButton);
    titleBar.appendChild(buttonGroup);
    this.element.appendChild(titleBar);

    // --- Content Area ---
    this.contentElement.classList.add("floating-view-content");
    this.element.appendChild(this.contentElement);

    // --- Resize Handles ---
    const _cornerDefs: Array<{ cls: string; corner: 'tl' | 'tr' | 'bl' | 'br' }> = [
      { cls: 'floating-view-resize-tl', corner: 'tl' },
      { cls: 'floating-view-resize-tr', corner: 'tr' },
      { cls: 'floating-view-resize-bl', corner: 'bl' },
      { cls: FLOATING_VIEW_RESIZE_HANDLE_CLASS, corner: 'br' },
    ];
    for (const { cls, corner } of _cornerDefs) {
      const handle = document.createElement('div');
      handle.classList.add(cls);
      handle.addEventListener('mousedown', (e) => {
        startCornerResize(e, this.element, corner, (left, top) => {
          this.state.position = { x: left, y: top };
          this.onStateChangeCallback(this.state);
        });
      });
      this.element.appendChild(handle);
    }

    // Listen for dynamic title updates
    this._unlistens.push(onEvent(this.contentElement, 'feature-title-changed', (detail) => {
      if (detail.title) this.titleTextEl.textContent = detail.title;
    }));

    // Persist view state whenever any child view signals a change.
    this._unlistens.push(onEvent(this.contentElement, 'feature-state-changed', (detail) => {
      this.state.viewState = { ...this.state.viewState, ...detail };
      this.onSaveCallback();
    }));

    // Auto-size when a feature renders for the first time.
    this._unlistens.push(onEvent(this.contentElement, 'feature-auto-size', () => {
      requestAnimationFrame(() => this._autoSizeToContent(true));
    }));

    // React to config collapse/expand.
    this._unlistens.push(onEvent(this.contentElement, 'config-collapse-changed', ({ collapsed, isInitial, delta }) => {
      this.configToggleButtonEl?.classList.toggle('is-active', collapsed);
      if (!isInitial && delta !== undefined) {
        requestAnimationFrame(() => this._adjustHeightToContent(delta));
      }
    }));

    // Notify content of its available space when the wrapper has a saved size.
    if (state.size) {
      requestAnimationFrame(() => {
        const titleBarEl = this.element.querySelector<HTMLElement>('.floating-view-titlebar');
        const titleBarH = titleBarEl?.offsetHeight ?? 30;
        const w = this.contentElement.clientWidth;
        const h = this.element.clientHeight - titleBarH;
        if (w > 0 && h > 0) {
          emitEvent(this.contentElement, 'wrapper-user-resized', { width: w, height: h }, { bubbles: false });
        }
      });
    } else if (!this._defaultHeight) {
      // Auto-size to canvas content after the element is in the DOM.
      // Skipped when _defaultHeight is set — notifyDefaultDimensions() already
      // fires wrapper-user-resized synchronously with the correct height.
      requestAnimationFrame(() => this._autoSizeToContent(false));
    }

    // Capture size after every resize.
    this.resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      const bo = entry.borderBoxSize?.[0];
      const w = bo ? Math.round(bo.inlineSize) : Math.round(entry.contentRect.width);
      const h = bo ? Math.round(bo.blockSize) : Math.round(entry.contentRect.height);
      if (w <= 0 || h <= 0) return;

      if (this.state.collapsed) return;

      const isFirst = this._firstResizeObserverFire;
      this._firstResizeObserverFire = false;
      const wasProgrammatic = this._isProgrammaticResize;
      this._isProgrammaticResize = false;
      this.state.size = { width: w, height: h };

      if (this._resizeSaveTimer !== null) clearTimeout(this._resizeSaveTimer);
      this._resizeSaveTimer = setTimeout(() => {
        this._resizeSaveTimer = null;
        if (!wasProgrammatic && moduleGridCell) {
          // Snap the INTENDED size (the inline style we set), NOT the observed border-box.
          // The border-box is inflated by the content's CSS min-width/height; snapping that
          // back into style would bake a too-large span into the canonical rect on re-record
          // (the "min-floor gotcha"), drifting panels until they overlap and get reflowed.
          const styleW = parseFloat(this.element.style.width);
          const styleH = parseFloat(this.element.style.height);
          if (styleW > 0 && styleH > 0) {
            const sw = snapCell(styleW);
            const sh = snapCell(styleH);
            if (sw !== styleW || sh !== styleH) {
              this._markProgrammaticResize();
              this.element.style.width = `${sw}px`;
              this.element.style.height = `${sh}px`;
              this.state.size = { width: sw, height: sh };
            }
          }
        }
        this.onSaveCallback();
        if (!wasProgrammatic && !isFirst) {
          const titleBarEl = this.element.querySelector<HTMLElement>('.floating-view-titlebar');
          const titleBarH = titleBarEl?.offsetHeight ?? 30;
          const evtW = this.contentElement.clientWidth;
          const evtH = this.element.clientHeight - titleBarH;
          emitEvent(this.contentElement, 'wrapper-user-resized', { width: evtW, height: evtH }, { bubbles: false });
        }
      }, 150);
    });
    this.resizeObserver.observe(this.element);

    if (state.collapsed) {
      this.element.classList.add('is-panel-collapsed');
      this.element.style.height = '';
      this._updateCollapseButton(true);
    }
  }

  private _updateCollapseButton(collapsed: boolean): void {
    if (!this.collapseButtonEl) return;
    this.collapseButtonEl.innerHTML = collapsed
      ? '<span class="material-icons">expand_more</span>'
      : '<span class="material-icons">expand_less</span>';
    this.collapseButtonEl.title = collapsed ? 'Expand' : 'Collapse';
  }

  private _toggleCollapse(): void {
    const collapsed = !this.state.collapsed;
    this.state.collapsed = collapsed;
    if (collapsed) {
      this.element.classList.add('is-panel-collapsed');
      this.element.style.height = '';
    } else {
      this.element.classList.remove('is-panel-collapsed');
      if (this.state.size) this.element.style.height = `${this.state.size.height}px`;
    }
    this._updateCollapseButton(collapsed);
    this.onSaveCallback();
  }

  public get instanceId(): string { return this.state.instanceId; }

  public bringToFront(zIndex: number): void {
    this.state.zIndex = zIndex;
    this.element.style.zIndex = `${zIndex}`;
  }

  public setPosition(x: number, y: number): void {
    this.state.position = { x, y };
    this.element.style.left = `${x}px`;
    this.element.style.top = `${y}px`;
  }

  public notifyDefaultDimensions(): void {
    if (this.state.size || !this._defaultHeight) return;
    const titleBarEl = this.element.querySelector<HTMLElement>('.floating-view-titlebar');
    const titleBarH = titleBarEl?.offsetHeight ?? 30;
    const w = this.contentElement.clientWidth;
    const h = this._defaultHeight - titleBarH;
    if (w > 0 && h > 0) {
      emitEvent(this.contentElement, 'wrapper-user-resized', { width: w, height: h }, { bubbles: false });
    }
  }

  public getSize(): { width: number; height: number } {
    return { width: this.element.offsetWidth, height: this.element.offsetHeight };
  }

  public setTitle(title: string): void {
    this.titleTextEl.textContent = title;
  }

  /** Update the stored default footprint (px) used as the auto-size width floor and the
   *  seed height. Called when the panel's effective orientation changes so a subsequent
   *  auto-size floors to the NEW orientation's width, not the one captured at construction. */
  public setDefaultDimensions(width?: number, height?: number): void {
    this.defaultWidth = width ?? 0;
    this._defaultHeight = height ?? 0;
  }

  /** Update the CSS min/max size constraints (e.g. after the panel's effective
   *  orientation changes). Omitted dimensions clear the corresponding constraint. */
  public setSizeConstraints(c: {
    minWidth?: number; minHeight?: number; maxWidth?: number; maxHeight?: number;
  }): void {
    const apply = (prop: 'minWidth' | 'minHeight' | 'maxWidth' | 'maxHeight', v?: number) => {
      this.element.style[prop] = v ? `${v}px` : '';
    };
    apply('minWidth', c.minWidth);
    apply('minHeight', c.minHeight);
    apply('maxWidth', c.maxWidth);
    apply('maxHeight', c.maxHeight);
  }

  public updateZoomButtonState(active: boolean): void {
    if (!this.zoomButtonEl) return;
    this.zoomButtonEl.classList.toggle("is-active", active);
  }

  /**
   * Called after PanelHost has re-rendered a new view into contentEl (e.g. after
   * rotate or zoom). Triggers the same RAF-based resize notification and optional
   * auto-size that the old replaceViewContent() did.
   */
  public notifyContentReplaced(forceAutoSize: boolean): void {
    requestAnimationFrame(() => {
      if (this.state.size) {
        const titleBarEl = this.element.querySelector<HTMLElement>('.floating-view-titlebar');
        const titleBarH = titleBarEl?.offsetHeight ?? 30;
        const w = this.contentElement.clientWidth;
        const h = this.element.clientHeight - titleBarH;
        if (w > 0 && h > 0) {
          emitEvent(this.contentElement, 'wrapper-user-resized', { width: w, height: h }, { bubbles: false });
        }
      }
      if (forceAutoSize) this._autoSizeToContent(true);
    });
  }

  /** Mark the resize the caller is ABOUT to cause as programmatic, so the ResizeObserver
   *  doesn't treat it as a user drag (no snap, no redundant wrapper-user-resized — the
   *  programmatic paths emit/redraw themselves). The flag is normally consumed by the
   *  observer fire that the size change produces; but if the change is a no-op (the size
   *  didn't actually move) no fire arrives, which historically left the flag stuck TRUE and
   *  caused the NEXT genuine window resize to be misclassified — swallowing its
   *  wrapper-user-resized so the view never redrew and its canvas overflowed/clipped. The
   *  fallback timer clears it so it can never outlive the operation it was set for. */
  private _markProgrammaticResize(): void {
    this._isProgrammaticResize = true;
    if (this._progResizeClearTimer !== null) clearTimeout(this._progResizeClearTimer);
    this._progResizeClearTimer = setTimeout(() => {
      this._progResizeClearTimer = null;
      this._isProgrammaticResize = false;
    }, 250);
  }

  private _autoSizeToContent(force: boolean): void {
    if (!force && this.state.size) return;

    const canvas = this.contentElement.querySelector<HTMLCanvasElement>("canvas");
    if (!canvas || canvas.width === 0) return;

    const titleBarEl = this.element.querySelector<HTMLElement>(".floating-view-titlebar");
    const titleBarH = titleBarEl?.offsetHeight ?? 30;

    const contentPaddingH = 24;
    const canvasBasedWidth = canvas.width + contentPaddingH;
    const newWidth = Math.max(canvasBasedWidth, this.defaultWidth);

    this._markProgrammaticResize();
    this.element.style.width = `${newWidth}px`;
    this.element.style.height = "";

    const newHeight = this.contentElement.scrollHeight + titleBarH + 4;
    this.element.style.height = `${newHeight}px`;

    this.state.size = { width: newWidth, height: newHeight };
    this.onStateChangeCallback(this.state);

    emitEvent(this.contentElement, 'wrapper-user-resized', { width: newWidth, height: newHeight - titleBarH }, { bubbles: false });
  }

  private _adjustHeightToContent(delta: number): void {
    const currentH = this.state.size?.height ?? parseFloat(this.element.style.height || "0");
    const newHeight = Math.max(currentH + delta, 50);
    this._markProgrammaticResize();
    this.element.style.height = `${newHeight}px`;
    const currentWidth = this.state.size?.width ?? parseFloat(this.element.style.width || "0");
    this.state.size = { width: currentWidth, height: newHeight };
    this.onSaveCallback();
  }

  /**
   * Removes the chrome from the DOM and cleans up its listeners.
   * The content element is detached from the wrapper and returned so PanelHost
   * can reuse it (e.g. during a strategy switch to TabbedLayout).
   * Does NOT destroy the View instance — PanelHost is responsible for that.
   */
  public destroy(): HTMLElement {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this._resizeSaveTimer !== null) {
      clearTimeout(this._resizeSaveTimer);
      this._resizeSaveTimer = null;
    }
    if (this._progResizeClearTimer !== null) {
      clearTimeout(this._progResizeClearTimer);
      this._progResizeClearTimer = null;
    }
    // Remove all event listeners from contentElement
    this._unlistens.forEach(u => u());
    this._unlistens = [];

    // Detach contentElement from wrapper so PanelHost can reuse it
    if (this.contentElement.parentNode === this.element) {
      this.element.removeChild(this.contentElement);
    }
    // Remove wrapper from DOM
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    return this.contentElement;
  }
}
