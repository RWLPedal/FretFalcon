import { View } from "../view";
import { FloatingViewInstanceState } from "./panel_types";

// --- Grid Snap ---
/** The canonical grid cell size in pixels. Used for both visual snap-to-grid
 *  and coordinate serialization in save files. Import this from the manager
 *  to keep a single source of truth. */
export const GRID_UNIT = 12;

export const FLOATING_VIEW_WRAPPER_CLASS = 'floating-view-wrapper';
export const FLOATING_VIEW_TITLEBAR_CLASS = 'floating-view-titlebar';
export const FLOATING_VIEW_RESIZE_HANDLE_CLASS = 'floating-view-resize-handle';

let moduleGridSize: number | null = null;

export function setFloatingViewGridSize(size: number | null): void {
  moduleGridSize = size;
}

function snapToGrid(v: number): number {
  if (!moduleGridSize) return v;
  return Math.round(v / moduleGridSize) * moduleGridSize;
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

  const clampedX = Math.max(0, Math.min(newX, parentRect.width - elemRect.width));
  const clampedY = Math.max(0, Math.min(newY, parentRect.height - elemRect.height));
  newX = snapToGrid(clampedX);
  newY = snapToGrid(clampedY);

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
    onDone,
  };
  document.body.style.userSelect = 'none';
  document.addEventListener('mousemove', _doCornerResize);
  document.addEventListener('mouseup', _stopCornerResize);
}

function _doCornerResize(e: MouseEvent): void {
  if (!_resizeState) return;
  const { element, corner, startMouseX, startMouseY, startWidth, startHeight,
          startLeft, startTop, minWidth, minHeight } = _resizeState;
  const dx = e.clientX - startMouseX;
  const dy = e.clientY - startMouseY;

  let newWidth = startWidth;
  let newHeight = startHeight;
  let newLeft = startLeft;
  let newTop = startTop;

  if (corner === 'br') {
    newWidth = Math.max(minWidth, startWidth + dx);
    newHeight = Math.max(minHeight, startHeight + dy);
  } else if (corner === 'bl') {
    newWidth = Math.max(minWidth, startWidth - dx);
    newHeight = Math.max(minHeight, startHeight + dy);
    newLeft = startLeft + (startWidth - newWidth);
  } else if (corner === 'tr') {
    newWidth = Math.max(minWidth, startWidth + dx);
    newHeight = Math.max(minHeight, startHeight - dy);
    newTop = startTop + (startHeight - newHeight);
  } else {
    newWidth = Math.max(minWidth, startWidth - dx);
    newHeight = Math.max(minHeight, startHeight - dy);
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
  if (moduleGridSize) {
    element.style.width  = `${snapToGrid(parseFloat(element.style.width))}px`;
    element.style.height = `${snapToGrid(parseFloat(element.style.height))}px`;
    element.style.left   = `${snapToGrid(parseFloat(element.style.left))}px`;
    element.style.top    = `${snapToGrid(parseFloat(element.style.top))}px`;
  }
  onDone(parseFloat(element.style.left), parseFloat(element.style.top));
  _resizeState = null;
}
// --- End Corner Resize Logic ---

export class FloatingViewWrapper {
  public element: HTMLElement;
  private contentElement: HTMLElement;

  public get contentEl(): HTMLElement { return this.contentElement; }
  private viewInstance: View;
  private state: FloatingViewInstanceState;
  private onDestroyCallback: (instanceId: string) => void;
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
  /** True while _autoSizeToContent or _adjustHeightToContent is setting element styles,
   *  so the ResizeObserver skips grid snapping for programmatic resizes. */
  private _isProgrammaticResize = false;
  private _firstResizeObserverFire = true;
  /** Minimum wrapper width (px) — the descriptor's defaultWidth. Used as a floor
   *  when resizing after rotation so the config UI is never clipped. */
  private readonly defaultWidth: number;
  /** Default wrapper height (px) from the descriptor, or 0 if unset. */
  private readonly _defaultHeight: number;

  constructor(
    state: FloatingViewInstanceState,
    title: string,
    viewInstance: View,
    onDestroy: (instanceId: string) => void,
    onStateChange: (state: FloatingViewInstanceState) => void,
    onSave: () => void,
    defaultWidth?: number,
    defaultHeight?: number,
    minWidth?: number,
    minHeight?: number,
    onRotate?: () => void,
    onZoom?: () => void,
    onConfigToggle?: () => void
  ) {
    this.state = state;
    this.viewInstance = viewInstance;
    this.onDestroyCallback = onDestroy;
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
    if (state.size) {
      this.element.style.width = `${state.size.width}px`;
      this.element.style.height = `${state.size.height}px`;
    } else if (defaultWidth || defaultHeight) {
      if (defaultWidth) this.element.style.width = `${defaultWidth}px`;
      if (defaultHeight) this.element.style.height = `${defaultHeight}px`;
    }

    // Make wrapper focusable and handle z-index bring-to-front
    this.element.setAttribute("tabindex", "-1");
    this.element.addEventListener(
      "mousedown",
      () => {
        this.onStateChangeCallback(this.state);
      },
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
    titleBar.addEventListener("mousedown", (e) => {
      startDrag(e, this.element);
    });

    this.titleTextEl = document.createElement("span");
    this.titleTextEl.classList.add("floating-view-title-text");
    this.titleTextEl.textContent = title;
    titleBar.appendChild(this.titleTextEl);

    // --- Right-aligned button group (rotate + close) ---
    const buttonGroup = document.createElement("div");
    buttonGroup.classList.add("floating-view-button-group");

    if (this.onRotateCallback) {
      const rotateButton = document.createElement("button");
      rotateButton.classList.add("floating-view-rotate");
      rotateButton.innerHTML = '<span class="material-icons">autorenew</span>';
      rotateButton.title = "Rotate fretboard";
      rotateButton.onclick = (e) => {
        e.stopPropagation();
        this.onRotateCallback!();
      };
      buttonGroup.appendChild(rotateButton);
    }

    if (this.onConfigToggleCallback) {
      const configToggleButton = document.createElement("button");
      configToggleButton.classList.add("floating-view-config-toggle");
      configToggleButton.innerHTML = '<span class="material-icons">tune</span>';
      configToggleButton.title = "Toggle configuration";
      configToggleButton.onclick = (e) => {
        e.stopPropagation();
        this.onConfigToggleCallback!();
      };
      buttonGroup.appendChild(configToggleButton);
      this.configToggleButtonEl = configToggleButton;
    }

    if (this.onZoomCallback) {
      const zoomButton = document.createElement("button");
      zoomButton.classList.add("floating-view-zoom");
      zoomButton.innerHTML = '<span class="material-icons">zoom_in</span>';
      zoomButton.title = "Toggle zoom";
      if (state.zoomActive) {
        zoomButton.classList.add("is-active");
      }
      zoomButton.onclick = (e) => {
        e.stopPropagation();
        this.onZoomCallback!();
      };
      buttonGroup.appendChild(zoomButton);
      this.zoomButtonEl = zoomButton;
    }

    const collapseButton = document.createElement("button");
    collapseButton.classList.add("floating-view-collapse");
    collapseButton.innerHTML = '<span class="material-icons">expand_less</span>';
    collapseButton.title = "Collapse";
    collapseButton.onclick = (e) => {
      e.stopPropagation();
      this._toggleCollapse();
    };
    buttonGroup.appendChild(collapseButton);
    this.collapseButtonEl = collapseButton;

    const closeButton = document.createElement("button");
    closeButton.classList.add("floating-view-close");
    closeButton.innerHTML = '<span class="material-icons">close</span>';
    closeButton.title = "Close";
    closeButton.onclick = (e) => {
      e.stopPropagation();
      this.destroy();
    };
    buttonGroup.appendChild(closeButton);
    titleBar.appendChild(buttonGroup);
    this.element.appendChild(titleBar);

    // --- Content Area ---
    this.contentElement = document.createElement("div");
    this.contentElement.classList.add("floating-view-content");
    this.element.appendChild(this.contentElement);

    // --- Resize Handles (all 4 corners; visual affordance only on bottom-right) ---
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

    // Listen for dynamic title updates - must be registered before render so
    // events fired synchronously during render (e.g. on saved-state restore) are caught.
    this.contentElement.addEventListener('feature-title-changed', (e: Event) => {
      const detail = (e as CustomEvent<{ title: string }>).detail;
      if (detail?.title) {
        this.titleTextEl.textContent = detail.title;
      }
    });

    // Persist view state whenever any child view signals a change.
    this.contentElement.addEventListener('feature-state-changed', (e: Event) => {
      const detail = (e as CustomEvent<Record<string, unknown>>).detail;
      if (detail) {
        this.state.viewState = { ...this.state.viewState, ...detail };
        this.onSaveCallback();
      }
    });

    // Auto-size when a feature renders for the first time (tile was empty/unconfigured before).
    this.contentElement.addEventListener('feature-auto-size', () => {
      requestAnimationFrame(() => this._autoSizeToContent(true));
    });

    // React to config collapse/expand: sync button state; resize wrapper after transition.
    this.contentElement.addEventListener('config-collapse-changed', (e: Event) => {
      const { collapsed, isInitial, delta } = (e as CustomEvent<{ collapsed: boolean; isInitial: boolean; delta?: number }>).detail;
      this.configToggleButtonEl?.classList.toggle('is-active', collapsed);
      if (!isInitial && delta !== undefined) {
        requestAnimationFrame(() => this._adjustHeightToContent(delta));
      }
    });

    // --- Render the actual View ---
    try {
      this.viewInstance.render(this.contentElement);
    } catch (e) {
      console.error(`Error rendering view ${state.viewId}:`, e);
      this.contentElement.textContent = "Error rendering view.";
    }

    // Auto-size to canvas content after the element is in the DOM
    if (!state.size) {
      requestAnimationFrame(() => this._autoSizeToContent(false));
    } else {
      // Saved size restored — tell content its available space so features rescale to fit.
      // Without this, ConfigurableFeatureView's _availableWidth/Height stay 0 and the
      // fretboard renders at its default size instead of fitting the saved wrapper size.
      // Use element.clientHeight minus title-bar height rather than contentElement.clientHeight:
      // after the initial unconstrained render, contentElement reflects the natural content
      // height (e.g. 523px), not the wrapper's saved constraint (e.g. 384px).
      requestAnimationFrame(() => {
        const titleBarEl = this.element.querySelector<HTMLElement>('.floating-view-titlebar');
        const titleBarH = titleBarEl?.offsetHeight ?? 30;
        const w = this.contentElement.clientWidth;
        const h = this.element.clientHeight - titleBarH;
        if (w > 0 && h > 0) {
          this.contentElement.dispatchEvent(new CustomEvent('wrapper-user-resized', {
            bubbles: false,
            detail: { width: w, height: h },
          }));
        }
      });
    }

    // Capture size after every resize (auto-size and manual CSS resize handle).
    // Uses a separate save callback to avoid triggering z-index bring-to-front logic.
    this.resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      // Use borderBoxSize so saved dimensions match what style.width/height restores to.
      // contentRect excludes the border, causing a -2px drift per reload with border-box sizing.
      const bo = entry.borderBoxSize?.[0];
      const w = bo ? Math.round(bo.inlineSize) : Math.round(entry.contentRect.width);
      const h = bo ? Math.round(bo.blockSize) : Math.round(entry.contentRect.height);
      if (w <= 0 || h <= 0) return;

      // Don't overwrite the saved pre-collapse size while the panel is collapsed.
      if (this.state.collapsed) return;

      const isFirst = this._firstResizeObserverFire;
      this._firstResizeObserverFire = false;
      const wasProgrammatic = this._isProgrammaticResize;
      this._isProgrammaticResize = false;
      this.state.size = { width: w, height: h };

      // Debounce to avoid flooding localStorage during manual CSS resize drags.
      // Snap is applied here (not in the observer) so we never resize the element
      // from inside the observer callback, which causes glitchy feedback loops.
      if (this._resizeSaveTimer !== null) clearTimeout(this._resizeSaveTimer);
      this._resizeSaveTimer = setTimeout(() => {
        this._resizeSaveTimer = null;
        if (!wasProgrammatic && moduleGridSize && this.state.size) {
          const sw = snapToGrid(this.state.size.width);
          const sh = snapToGrid(this.state.size.height);
          if (sw !== this.state.size.width || sh !== this.state.size.height) {
            this._isProgrammaticResize = true;
            this.element.style.width = `${sw}px`;
            this.element.style.height = `${sh}px`;
            this.state.size = { width: sw, height: sh };
          }
        }
        this.onSaveCallback();
        // Notify content so features can rescale to the new available space.
        // Skipped on initial layout fire and on programmatic resizes (zoom, rotation, auto-size).
        // Use element.clientHeight minus title-bar height: contentElement.clientHeight reflects
        // the previous render's content (which may overflow the new wrapper size).
        if (!wasProgrammatic && !isFirst) {
          const titleBarEl = this.element.querySelector<HTMLElement>('.floating-view-titlebar');
          const titleBarH = titleBarEl?.offsetHeight ?? 30;
          const evtW = this.contentElement.clientWidth;
          const evtH = this.element.clientHeight - titleBarH;
          this.contentElement.dispatchEvent(new CustomEvent('wrapper-user-resized', {
            bubbles: false,
            detail: { width: evtW, height: evtH },
          }));
        }
      }, 150);
    });
    this.resizeObserver.observe(this.element);

    // Apply saved collapsed state immediately (element isn't in DOM yet so no ResizeObserver fire).
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

  public get instanceId(): string {
    return this.state.instanceId;
  }

  public bringToFront(zIndex: number): void {
    this.state.zIndex = zIndex;
    this.element.style.zIndex = `${zIndex}`;
  }

  /** Moves the view to the given pixel position without triggering a z-index change. */
  public setPosition(x: number, y: number): void {
    this.state.position = { x, y };
    this.element.style.left = `${x}px`;
    this.element.style.top = `${y}px`;
  }

  /**
   * Fire wrapper-user-resized with the default dimensions. Must be called after the
   * element is appended to the DOM. This lets features with height-dependent layouts
   * (e.g. NearbyTriads reference mode) re-render at the correct size before the
   * auto-size RAF reads their canvas dimensions.
   */
  public notifyDefaultDimensions(): void {
    if (this.state.size || !this._defaultHeight) return;
    const titleBarEl = this.element.querySelector<HTMLElement>('.floating-view-titlebar');
    const titleBarH = titleBarEl?.offsetHeight ?? 30;
    const w = this.contentElement.clientWidth;
    const h = this._defaultHeight - titleBarH;
    if (w > 0 && h > 0) {
      this.contentElement.dispatchEvent(new CustomEvent('wrapper-user-resized', {
        bubbles: false,
        detail: { width: w, height: h },
      }));
    }
  }

  /** Returns the current pixel size of the wrapper element. */
  public getSize(): { width: number; height: number } {
    return {
      width: this.element.offsetWidth,
      height: this.element.offsetHeight,
    };
  }

  /**
   * Destroys the current view instance, renders a new one in its place.
   *
   * @param forceAutoSize - When true (rotation, zoom, instrument settings changes),
   *   auto-size the wrapper to fit the new canvas. When false (theme-only changes),
   *   keep the current wrapper size and let the canvas fill it via wrapper-user-resized.
   *   Passing false avoids the 12px-per-change growth that occurs when _autoSizeToContent
   *   adds its padding overhead on top of a canvas already constrained by clientWidth.
   */
  public replaceViewContent(newViewInstance: View, forceAutoSize = true): void {
    try {
      this.viewInstance.destroy();
    } catch (e) {
      console.error(`Error destroying old view ${this.state.viewId}:`, e);
    }

    this.contentElement.innerHTML = "";
    this.viewInstance = newViewInstance;

    try {
      this.viewInstance.render(this.contentElement);
    } catch (e) {
      console.error(`Error rendering rotated view ${this.state.viewId}:`, e);
      this.contentElement.textContent = "Error rendering view.";
    }

    requestAnimationFrame(() => {
      if (this.state.size) {
        // Tell the new view its available space so features scale to the saved wrapper
        // size, not their unconstrained natural size. Mirrors the saved-size path in the
        // constructor. The event handler runs synchronously, so canvases exist by the
        // time _autoSizeToContent runs below.
        const titleBarEl = this.element.querySelector<HTMLElement>('.floating-view-titlebar');
        const titleBarH = titleBarEl?.offsetHeight ?? 30;
        const w = this.contentElement.clientWidth;
        const h = this.element.clientHeight - titleBarH;
        if (w > 0 && h > 0) {
          this.contentElement.dispatchEvent(new CustomEvent('wrapper-user-resized', {
            bubbles: false,
            detail: { width: w, height: h },
          }));
        }
      }
      // forceAutoSize=false (theme-only change): the canvas is already sized to fill
      // the current wrapper via wrapper-user-resized above. Calling _autoSizeToContent
      // here would add contentPaddingH on top of a canvas already constrained by
      // clientWidth, growing the wrapper by 12px on every theme change.
      if (forceAutoSize) {
        this._autoSizeToContent(true);
      }
    });
  }

  /**
   * Sizes the wrapper to fit all content in the content area.
   *
   * Width is driven by the canvas pixel width (so the fretboard never gets
   * clipped), falling back to scrollWidth when there is no canvas.
   *
   * Height uses contentElement.scrollHeight so that any configuration
   * sections rendered above or below the canvas are included automatically.
   *
   * @param force - When true, resize even if state.size is already set
   *                (used after a rotation where the canvas dimensions change).
   */
  private _autoSizeToContent(force: boolean): void {
    if (!force && this.state.size) return;

    const canvas = this.contentElement.querySelector<HTMLCanvasElement>("canvas");
    if (!canvas || canvas.width === 0) return;

    const titleBarEl = this.element.querySelector<HTMLElement>(".floating-view-titlebar");
    const titleBarH = titleBarEl?.offsetHeight ?? 30;

    // .floating-view-content has 5px padding each side (10px total horizontal).
    // Inner content (e.g. chord-diagram-view) may add another 5px each side.
    // The wrapper border adds 2px and we include a 2px safety buffer = 24px total.
    // This matches the chord diagram layout exactly; fretboard views without an inner
    // wrapper see ~10px extra space, which is harmless.
    const contentPaddingH = 24;
    const canvasBasedWidth = canvas.width + contentPaddingH;

    // Always floor at defaultWidth so the config UI is never clipped and panels
    // with multiple side-by-side canvases (e.g. NearbyTriads reference mode)
    // don't shrink to just the first canvas's width on initial open.
    const newWidth = Math.max(canvasBasedWidth, this.defaultWidth);

    // Set the new width FIRST so that line-wrapping in the config section (flex-wrap)
    // is resolved at the correct width before we read scrollHeight for the height.
    // If we read scrollHeight before changing the width, it reflects the old layout
    // (e.g. the wider zoomed state) and produces an incorrect — too-short — height.
    this._isProgrammaticResize = true;
    this.element.style.width = `${newWidth}px`;

    // Clear any explicit height so scrollHeight reflects the natural content height
    // at the new width, not the old explicitly-set value.
    this.element.style.height = "";

    // scrollHeight includes the content element's padding, so it covers everything:
    // config section + feature header + canvas.  Add 4px for wrapper border (2px) +
    // safety buffer (2px) so a rounding pixel never triggers a scrollbar.
    const newHeight = this.contentElement.scrollHeight + titleBarH + 4;

    this.element.style.height = `${newHeight}px`;

    // Persist so the size survives save/restore
    this.state.size = { width: newWidth, height: newHeight };
    this.onStateChangeCallback(this.state);

    // Notify content of the new available space so ConfigurableFeatureView updates
    // _availableWidth/Height and rebuilds the feature to correctly fill the auto-sized
    // panel. Mirrors the "saved size restored" path in the constructor (lines 305-316).
    this.contentElement.dispatchEvent(new CustomEvent('wrapper-user-resized', {
      bubbles: false,
      detail: { width: newWidth, height: newHeight - titleBarH },
    }));
  }

  /** Reflects the current zoom state on the zoom button (active = zoomed). */
  public updateZoomButtonState(active: boolean): void {
    if (!this.zoomButtonEl) return;
    this.zoomButtonEl.classList.toggle("is-active", active);
  }

  /**
   * Adjusts the wrapper height by a pixel delta (positive = grow, negative = shrink).
   * Used after a config collapse/expand transition to keep the canvas visible without
   * re-measuring scrollHeight (which is unreliable for overflow:hidden children).
   */
  private _adjustHeightToContent(delta: number): void {
    const currentH = this.state.size?.height ?? parseFloat(this.element.style.height || "0");
    const newHeight = Math.max(currentH + delta, 50);
    this._isProgrammaticResize = true;
    this.element.style.height = `${newHeight}px`;
    const currentWidth = this.state.size?.width ?? parseFloat(this.element.style.width || "0");
    this.state.size = { width: currentWidth, height: newHeight };
    this.onSaveCallback();
  }

  public destroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this._resizeSaveTimer !== null) {
      clearTimeout(this._resizeSaveTimer);
      this._resizeSaveTimer = null;
    }
    try {
      this.viewInstance.destroy();
    } catch (e) {
      console.error(`Error destroying view ${this.state.viewId}:`, e);
    }
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.onDestroyCallback(this.state.instanceId);
  }
}
