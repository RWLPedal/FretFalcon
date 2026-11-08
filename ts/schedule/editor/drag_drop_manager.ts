import { SelectionManager } from "./selection_manager";
import { RowManager } from "./row_manager";

/** A finger has to travel this far on a drag handle before the row is picked up. */
const TOUCH_DRAG_SLOP_PX = 6;
/** Within this distance of the list's top or bottom edge a touch drag scrolls it. */
const AUTO_SCROLL_EDGE_PX = 40;
const AUTO_SCROLL_PX_PER_FRAME = 8;

/** A reorder in progress under a finger or pen (see _onPointerDown). */
interface TouchDrag {
  pointerId: number;
  handleEl: HTMLElement;
  rowEl: HTMLElement;
  startY: number;
  lastY: number;
  /** False until the pointer has moved past the slop: a tap is not a drag. */
  active: boolean;
  scrollFrame: number | null;
}

/**
 * Reorders schedule rows by their drag handle. A mouse uses native HTML5
 * drag-and-drop (which also carries a multi-row selection); a finger or pen cannot
 * rely on that — browsers start it only after a long press, if at all — so those
 * drag the handle with pointer events instead. Both end in the same move.
 */
export class DragDropManager {
  private containerEl: HTMLElement;
  private selectionManager: SelectionManager;
  private rowManager: RowManager;

  private draggedElements: HTMLElement[] = [];
  private isMultiDrag: boolean = false;
  private _touchDrag: TouchDrag | null = null;

  constructor(
    containerEl: HTMLElement,
    selectionManager: SelectionManager,
    rowManager: RowManager
  ) {
    this.containerEl = containerEl;
    this.selectionManager = selectionManager;
    this.rowManager = rowManager;
    this._initialize();
  }

  private _initialize(): void {
    this.containerEl.addEventListener(
      "dragstart",
      this._handleDragStart.bind(this)
    );
    this.containerEl.addEventListener(
      "dragend",
      this._handleDragEnd.bind(this)
    );
    this.containerEl.addEventListener(
      "dragover",
      this._handleDragOver.bind(this)
    );
    this.containerEl.addEventListener("drop", this._handleDrop.bind(this));
    this.containerEl.addEventListener(
      "dragleave",
      this._handleDragLeave.bind(this)
    );
    this.containerEl.addEventListener("pointerdown", this._onPointerDown);
  }

  // ─── Touch / pen: drag the handle with pointer events ───────────────────────

  private _onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === "mouse") return; // the mouse drags natively
    const handleEl = (e.target as HTMLElement).closest<HTMLElement>(".drag-handle");
    const rowEl = handleEl?.closest<HTMLElement>(".schedule-row");
    if (!handleEl || !rowEl || this._touchDrag) return;

    this._touchDrag = {
      pointerId: e.pointerId,
      handleEl,
      rowEl,
      startY: e.clientY,
      lastY: e.clientY,
      active: false,
      scrollFrame: null,
    };
    // Captured, so the drag keeps arriving once the finger leaves the handle. (The
    // handle has touch-action: none — editor.css — or the list would scroll instead.)
    handleEl.setPointerCapture?.(e.pointerId);
    handleEl.addEventListener("pointermove", this._onPointerMove);
    handleEl.addEventListener("pointerup", this._onPointerUp);
    handleEl.addEventListener("pointercancel", this._onPointerCancel);
  };

  private _onPointerMove = (e: PointerEvent): void => {
    const drag = this._touchDrag;
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.lastY = e.clientY;

    if (!drag.active) {
      if (Math.abs(e.clientY - drag.startY) < TOUCH_DRAG_SLOP_PX) return;
      drag.active = true;
      this.draggedElements = [drag.rowEl];
      drag.rowEl.classList.add("dragging");
    }
    e.preventDefault();
    this._showDropTarget(e.clientY);
    this._autoScroll(drag);
  };

  private _onPointerUp = (e: PointerEvent): void => {
    const drag = this._touchDrag;
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dropped = drag.active;
    if (dropped) this._moveDraggedTo(e.clientY);
    this._endTouchDrag();
    // The release must not also count as a tap on the row (which selects it — and
    // on a phone opens its inspector).
    if (dropped) this._swallowNextClick();
  };

  private _onPointerCancel = (e: PointerEvent): void => {
    if (this._touchDrag && e.pointerId === this._touchDrag.pointerId) this._endTouchDrag();
  };

  private _endTouchDrag(): void {
    const drag = this._touchDrag;
    if (!drag) return;
    this._touchDrag = null;
    if (drag.scrollFrame !== null) cancelAnimationFrame(drag.scrollFrame);
    drag.handleEl.removeEventListener("pointermove", this._onPointerMove);
    drag.handleEl.removeEventListener("pointerup", this._onPointerUp);
    drag.handleEl.removeEventListener("pointercancel", this._onPointerCancel);
    drag.rowEl.classList.remove("dragging");
    this._clearDragOverStyles();
    this.draggedElements = [];
  }

  /** While the finger rests near the top or bottom of the list, scroll it. */
  private _autoScroll(drag: TouchDrag): void {
    if (drag.scrollFrame !== null) return;
    const step = (): void => {
      drag.scrollFrame = null;
      if (this._touchDrag !== drag || !drag.active) return;
      const box = this.containerEl.getBoundingClientRect();
      const direction =
        drag.lastY < box.top + AUTO_SCROLL_EDGE_PX ? -1
        : drag.lastY > box.bottom - AUTO_SCROLL_EDGE_PX ? 1
        : 0;
      if (direction === 0) return;
      const before = this.containerEl.scrollTop;
      this.containerEl.scrollTop += direction * AUTO_SCROLL_PX_PER_FRAME;
      if (this.containerEl.scrollTop === before) return; // already at the end
      this._showDropTarget(drag.lastY);
      drag.scrollFrame = requestAnimationFrame(step);
    };
    drag.scrollFrame = requestAnimationFrame(step);
  }

  private _swallowNextClick(): void {
    const swallow = (e: Event): void => {
      e.stopPropagation();
      e.preventDefault();
    };
    this.containerEl.addEventListener("click", swallow, { capture: true, once: true });
    // No click follows a touch that moved; don't leave the trap set for the next tap.
    setTimeout(() => this.containerEl.removeEventListener("click", swallow, true), 0);
  }

  // ─── Mouse: native drag-and-drop ────────────────────────────────────────────

  private _handleDragStart(e: DragEvent): void {
    // A long press can start a native drag under a finger that is already dragging.
    if (this._touchDrag) {
      e.preventDefault();
      return;
    }
    const originalTarget = e.target as HTMLElement;
    const dragHandle = originalTarget.closest('.drag-handle');

    // Check if the drag started on the handle
    if (!dragHandle) {
        // If the drag originated inside a nested draggable container (e.g. layer list rows),
        // let the event proceed without interference — don't preventDefault.
        if (originalTarget.closest('.layer-list-container')) {
            return;
        }
        e.preventDefault();
        return;
    }

    // --- If drag started on handle, proceed ---
    const rowToDrag = dragHandle.closest<HTMLElement>(".schedule-row");

    if (!rowToDrag || !e.dataTransfer) {
      e.preventDefault();
      return;
    }

    // Check selection state
    this.isMultiDrag = this.selectionManager.getSelectedElements().has(rowToDrag);

    if (this.isMultiDrag) {
      this.draggedElements = this.selectionManager.getSelectedElementsInDomOrder();
      if (!this.draggedElements.includes(rowToDrag)) {
          this.draggedElements.push(rowToDrag);
      }
      this.draggedElements.forEach((el) => el.classList.add("dragging-selected"));
      e.dataTransfer.setData("application/x-schedule-multidrag", "true");
    } else {
      this.selectionManager.selectSingleRow(rowToDrag);
      this.draggedElements = [rowToDrag];
      rowToDrag.classList.add("dragging");
    }

    e.dataTransfer.effectAllowed = "move";
    setTimeout(() => {
      this.draggedElements.forEach((el) => (el.style.opacity = "0.5"));
    }, 0);
  }

  private _handleDragEnd(e: DragEvent): void {
    this.draggedElements.forEach((el) => {
      el.classList.remove("dragging", "dragging-selected");
      el.style.opacity = "";
    });
    this._clearDragOverStyles();
    this.draggedElements = [];
    this.isMultiDrag = false;
  }

  private _handleDragOver(e: DragEvent): void {
    e.preventDefault();
    if (this.draggedElements.length === 0) return;
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    this._showDropTarget(e.clientY);
  }

  private _handleDrop(e: DragEvent): void {
    e.preventDefault();
    this._moveDraggedTo(e.clientY);
  }

  // ─── Shared by both ─────────────────────────────────────────────────────────

  /** Mark where the dragged rows would land if released at this height. */
  private _showDropTarget(clientY: number): void {
    const afterElement = this._getDragAfterElement(clientY);
    this._clearDragOverStyles();
    this._applyDragOverStyle(afterElement);
  }

  /** Move the dragged rows to where a release at this height puts them. */
  private _moveDraggedTo(clientY: number): void {
    this._clearDragOverStyles();
    if (this.draggedElements.length === 0) return;
    const afterElement = this._getDragAfterElement(clientY);
    this.draggedElements.forEach((el) => {
      let currentTarget = afterElement;
      while (currentTarget && this.draggedElements.includes(currentTarget)) {
        currentTarget = currentTarget.nextElementSibling as HTMLElement | null;
      }
      if (currentTarget === null) {
        this.containerEl.appendChild(el);
      } else {
        this.containerEl.insertBefore(el, currentTarget);
      }
    });
    this.rowManager.refreshAllGroupStats();
  }

  private _handleDragLeave(e: DragEvent): void {
    if (!this.containerEl.contains(e.relatedTarget as Node)) {
      this._clearDragOverStyles();
    }
  }

  private _getDragAfterElement(y: number): HTMLElement | null {
    const draggableElements = Array.from(
      this.containerEl.querySelectorAll<HTMLElement>(
        ".schedule-row:not(.dragging):not(.dragging-selected)"
      )
    );
    return draggableElements.reduce(
      (closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
          return { offset: offset, element: child };
        } else {
          return closest;
        }
      },
      { offset: Number.NEGATIVE_INFINITY, element: null as HTMLElement | null }
    ).element;
  }

  private _clearDragOverStyles(): void {
    this.containerEl
      .querySelectorAll<HTMLElement>(".schedule-row")
      .forEach((el) => {
        el.style.borderTop = "";
        el.style.borderBottom = "";
      });
    this.containerEl.style.borderBottom = "";
    this.containerEl.style.borderTop = "";
  }

  private _applyDragOverStyle(afterElement: HTMLElement | null): void {
    const borderStyle = "3px dashed var(--clr-link)";
    if (afterElement) {
      afterElement.style.borderTop = borderStyle;
    } else {
      this.containerEl.style.borderBottom = borderStyle;
    }
  }
}