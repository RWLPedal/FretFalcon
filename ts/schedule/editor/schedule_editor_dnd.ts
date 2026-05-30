let draggedElement: HTMLElement | null = null;
let draggedElements: HTMLElement[] = [];
let isMultiDrag: boolean = false;
let isSelectedCallback: (el: HTMLElement) => boolean = () => false;
let getSelectedElementsCallback: () => HTMLElement[] = () => [];
let onDropCallback: () => void = () => {};

export function initializeDragAndDrop(
  containerEl: HTMLElement,
  isSelectedCb: (el: HTMLElement) => boolean,
  getSelectedElementsCb: () => HTMLElement[],
  onDropCb: () => void
): void {
  isSelectedCallback = isSelectedCb;
  getSelectedElementsCallback = getSelectedElementsCb;
  onDropCallback = onDropCb;
  containerEl.addEventListener("dragover", handleDragOver);
  containerEl.addEventListener("drop", handleDrop);
  containerEl.addEventListener("dragleave", handleDragLeave);
  containerEl.addEventListener("dragstart", handleDragStart);
  containerEl.addEventListener("dragend", handleDragEnd);
}

function handleDragStart(e: DragEvent): void {
  const target = (e.target as HTMLElement).closest<HTMLElement>(
    ".schedule-row"
  );
  if (!target || !e.dataTransfer) {
    e.preventDefault();
    return;
  }

  draggedElement = target;
  isMultiDrag = isSelectedCallback(target);

  if (isMultiDrag) {
    draggedElements = getSelectedElementsCallback();
    draggedElements.forEach((el) => el.classList.add("dragging-selected"));
    e.dataTransfer.setData("application/x-schedule-multidrag", "true");
  } else {
    draggedElements = [target];
    target.classList.add("dragging");
  }

  e.dataTransfer.effectAllowed = "move";
  setTimeout(() => {
    draggedElements.forEach((el) => (el.style.opacity = "0.5"));
  }, 0);
}

function handleDragEnd(e: DragEvent): void {
  draggedElements.forEach((el) => {
    el.classList.remove("dragging", "dragging-selected");
    el.style.opacity = "";
  });
  const container = (e.currentTarget as HTMLElement).closest(
    "#config-entries-container"
  );
  if (container instanceof HTMLElement) {
    clearDragOverStyles(container);
  }
  draggedElement = null;
  draggedElements = [];
  isMultiDrag = false;
}

function handleDragOver(e: DragEvent): void {
  e.preventDefault();
  if (draggedElements.length === 0) return;
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  const container = e.currentTarget as HTMLElement;
  const afterElement = getDragAfterElement(container, e.clientY);
  clearDragOverStyles(container);
  applyDragOverStyle(container, afterElement);
}

function handleDrop(e: DragEvent): void {
  e.preventDefault();
  const container = e.currentTarget as HTMLElement;
  clearDragOverStyles(container);
  if (draggedElements.length === 0) return;
  const afterElement = getDragAfterElement(container, e.clientY);
  draggedElements.forEach((el) => {
    el.classList.remove("dragging", "dragging-selected");
    el.style.opacity = "";
    // Check if dropping onto itself (or within the dragged set) - avoid complex insertion
    let currentTarget = afterElement;
    while (currentTarget && draggedElements.includes(currentTarget)) {
      currentTarget = currentTarget.nextElementSibling as HTMLElement | null;
    }

    if (currentTarget === null) {
      container.appendChild(el);
    } else {
      container.insertBefore(el, currentTarget);
    }
  });
  // State reset deferred to dragend
  onDropCallback(); // Trigger indentation update
}

function handleDragLeave(e: DragEvent): void {
  if (
    e.currentTarget instanceof HTMLElement &&
    !e.currentTarget.contains(e.relatedTarget as Node)
  ) {
    clearDragOverStyles(e.currentTarget);
  }
}

function getDragAfterElement(
  container: HTMLElement,
  y: number
): HTMLElement | null {
  const draggableElements = Array.from(
    container.querySelectorAll<HTMLElement>(
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

function clearDragOverStyles(containerEl: HTMLElement): void {
  containerEl.querySelectorAll<HTMLElement>(".schedule-row").forEach((el) => {
    el.style.borderTop = "";
    el.style.borderBottom = "";
  });
  containerEl.style.borderBottom = "";
  containerEl.style.borderTop = "";
}

function applyDragOverStyle(
  containerEl: HTMLElement,
  afterElement: HTMLElement | null
): void {
  const borderStyle = "3px dashed #485fc7";
  if (afterElement) {
    afterElement.style.borderTop = borderStyle;
  } else {
    containerEl.style.borderBottom = borderStyle;
  }
}
