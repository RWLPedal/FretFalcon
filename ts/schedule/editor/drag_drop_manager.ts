import { SelectionManager } from "./selection_manager";
import { RowManager } from "./row_manager";

export class DragDropManager {
  private containerEl: HTMLElement;
  private selectionManager: SelectionManager;
  private rowManager: RowManager;

  private draggedElements: HTMLElement[] = [];
  private isMultiDrag: boolean = false;

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
  }

  private _handleDragStart(e: DragEvent): void {
    const originalTarget = e.target as HTMLElement;
    const dragHandle = originalTarget.closest('.drag-handle-cell');

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
    const afterElement = this._getDragAfterElement(e.clientY);
    this._clearDragOverStyles();
    this._applyDragOverStyle(afterElement);
  }

  private _handleDrop(e: DragEvent): void {
    e.preventDefault();
    this._clearDragOverStyles();
    if (this.draggedElements.length === 0) return;
    const afterElement = this._getDragAfterElement(e.clientY);
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
    this.rowManager.updateAllRowIndentation();
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