export class SelectionManager {
  private configEntriesContainerEl: HTMLElement;
  private selectedRowElements: Set<HTMLElement> = new Set();
  private lastClickedRow: HTMLElement | null = null;
  private onSelectionChange: () => void;

  constructor(
    configEntriesContainerEl: HTMLElement,
    onSelectionChange: () => void
  ) {
    this.configEntriesContainerEl = configEntriesContainerEl;
    this.onSelectionChange = onSelectionChange;
    this._addSelectionHandler();
  }

  public getSelectedElements(): ReadonlySet<HTMLElement> {
    return this.selectedRowElements;
  }

  public getSelectedElementsInDomOrder(): HTMLElement[] {
    const allRows = Array.from(
      this.configEntriesContainerEl.querySelectorAll<HTMLElement>(
        ".schedule-row"
      )
    );
    return allRows.filter((row) => this.selectedRowElements.has(row));
  }

  public getLastClickedRow(): HTMLElement | null {
    return this.lastClickedRow;
  }

  public getLastSelectedElementInDomOrder(): HTMLElement | null {
    const selectedInOrder = this.getSelectedElementsInDomOrder();
    return selectedInOrder.length > 0
      ? selectedInOrder[selectedInOrder.length - 1]
      : null;
  }

  public clearSelection(resetLastClicked: boolean = true): void {
    this.selectedRowElements.forEach((el) =>
      el.classList.remove("is-selected")
    );
    this.selectedRowElements.clear();
    if (resetLastClicked) {
      this.lastClickedRow = null;
    }
    this.onSelectionChange(); // Notify about the change
  }

  public selectSingleRow(rowElement: HTMLElement): void {
    this.clearSelection(false);
    rowElement.classList.add("is-selected");
    this.selectedRowElements.add(rowElement);
    this.lastClickedRow = rowElement;
    this.onSelectionChange();
  }

  private _addSelectionHandler(): void {
    this.configEntriesContainerEl.addEventListener("click", (e) => {
      const targetElement = e.target as HTMLElement;

      // Ignore clicks on interactive elements that shouldn't trigger selection
      if (targetElement.closest(
        "button, input, select, a, .dropdown, .add-variadic-btn, .group-color-popover"
      )) {
        return;
      }
      if (targetElement.closest(".config-ellipsis-button")) {
        return;
      }

      const clickedRow = targetElement.closest<HTMLElement>(".schedule-row");
      if (!clickedRow) {
        this.clearSelection();
        return;
      }

      e.preventDefault(); // Prevent text selection on rows

      const isCtrlPressed = e.ctrlKey || e.metaKey;
      const isShiftPressed = e.shiftKey;

      if (
        isShiftPressed &&
        this.lastClickedRow &&
        this.lastClickedRow !== clickedRow
      ) {
        // --- Shift Selection ---
        this.clearSelection(false); // Keep last clicked row reference
        const rows = Array.from(
          this.configEntriesContainerEl.querySelectorAll<HTMLElement>(
            ".schedule-row"
          )
        );
        const lastClickedIndex = rows.indexOf(this.lastClickedRow);
        const clickedIndex = rows.indexOf(clickedRow);
        const startIndex = Math.min(lastClickedIndex, clickedIndex);
        const endIndex = Math.max(lastClickedIndex, clickedIndex);

        if (startIndex !== -1 && endIndex !== -1) {
          for (let i = startIndex; i <= endIndex; i++) {
            rows[i].classList.add("is-selected");
            this.selectedRowElements.add(rows[i]);
          }
        } else {
          // Fallback if indices are weird, just select the clicked one
          clickedRow.classList.add("is-selected");
          this.selectedRowElements.add(clickedRow);
          this.lastClickedRow = clickedRow; // Update last clicked if range failed
        }
      } else if (isCtrlPressed) {
        // --- Ctrl/Cmd Selection (Toggle) ---
        if (this.selectedRowElements.has(clickedRow)) {
          clickedRow.classList.remove("is-selected");
          this.selectedRowElements.delete(clickedRow);
          // Update last clicked if the toggled-off row was the last one
          if (this.lastClickedRow === clickedRow) {
            this.lastClickedRow = this.getLastSelectedElementInDomOrder();
          }
        } else {
          clickedRow.classList.add("is-selected");
          this.selectedRowElements.add(clickedRow);
          this.lastClickedRow = clickedRow; // Set as last clicked
        }
      } else {
        // --- Single Selection ---
        // Check if the clicked row is already the *only* selected row
        if (
          !(
            this.selectedRowElements.size === 1 &&
            this.selectedRowElements.has(clickedRow)
          )
        ) {
          this.clearSelection(false); // Keep last clicked reference before setting new one
          clickedRow.classList.add("is-selected");
          this.selectedRowElements.add(clickedRow);
          this.lastClickedRow = clickedRow; // Set as last clicked
        }
        // If it *is* the only selected row, do nothing (keep it selected)
      }

      this.onSelectionChange();
    });
  }
}
