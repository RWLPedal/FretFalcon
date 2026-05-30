// ts/schedule/editor/clipboard_manager.ts
import { RowManager } from "./row_manager";
import {
  ScheduleRowJSONData,
  IntervalDataJSON,
  GroupDataJSON,
  IntervalRowData,
  GroupRowData,
  IntervalSettings, // Use generic base type
  IntervalSettingsJSON, // Needed for parsing/creating settings
} from "./interval/types";
import { SelectionManager } from "./selection_manager";
import { instrumentCategory } from "../../fretboard/fretboard_category";
// Import the builder for interval rows
import { buildIntervalRowElement } from "./interval/interval_row_ui";
// --- Removed direct import of InstrumentIntervalSettings ---
// --- Removed FeatureCategoryName import ---

export class ClipboardManager {
  private selectionManager: SelectionManager;
  private rowManager: RowManager;
  private clipboardData: ScheduleRowJSONData[] = [];
  private onClipboardChangeCallback: (canPaste: boolean) => void;

  constructor(
    selectionManager: SelectionManager,
    rowManager: RowManager,
    onClipboardChangeCallback: (canPaste: boolean) => void
  ) {
    this.selectionManager = selectionManager;
    this.rowManager = rowManager;
    this.onClipboardChangeCallback = onClipboardChangeCallback;
  }

  /** Clears the internal clipboard data. */
  public clearClipboard(): void {
    this.clipboardData = [];
    this.onClipboardChangeCallback(this.hasCopiedData());
  }

  /** Copies the currently selected rows' data to the internal clipboard. */
  public copySelectedRows(): void {
    const selectedRows = this.selectionManager.getSelectedElementsInDomOrder();
    if (selectedRows.length === 0) {
      return;
    }
    // Use RowManager.getRowData which now includes categoryName string
    this.clipboardData = selectedRows
      .map((row) => this.rowManager.getRowData(row))
      .filter((data): data is ScheduleRowJSONData => data !== null);

    this.onClipboardChangeCallback(this.hasCopiedData());
  }

  /** Pastes rows from the internal clipboard after the last selected element. */
  public pasteRows(): void {
    if (!this.hasCopiedData()) {
      return;
    }
    const insertAfterElement =
      this.selectionManager.getLastSelectedElementInDomOrder();
    let lastPastedElement: HTMLElement | null = insertAfterElement;

    this.clipboardData.forEach((rowDataJSON) => {
      let newRowElement: HTMLElement | null = null;
      try {
        if (rowDataJSON.rowType === "group") {
          // Pasting group data (no category needed)
          const groupUIData: GroupRowData = { ...rowDataJSON };
          newRowElement = this.rowManager.addGroupRow(
            groupUIData.level,
            groupUIData.name,
            lastPastedElement
          );
        } else if (rowDataJSON.rowType === "interval") {
          // Pasting interval data
          const intervalJsonData = rowDataJSON as IntervalDataJSON;
          const categoryName = intervalJsonData.categoryName; // Get category name string

          // Validate category name matches the registered instrument category
          if (categoryName !== instrumentCategory.getName()) {
            console.warn(
              `Cannot paste interval row: Category "${categoryName}" not registered. Skipping row.`
            );
            return;
          }

          // --- Create Settings Instance using Parser ---
          const pasteCategory = instrumentCategory;
          let settingsInstance: IntervalSettings;
          const settingsJsonData = intervalJsonData.intervalSettings;

          if (pasteCategory) {
            try {
              settingsInstance = pasteCategory.createIntervalSettingsFromJSON(settingsJsonData);
            } catch (parseError) {
              console.error(
                `Error parsing pasted interval settings for ${categoryName}. Using default.`,
                parseError
              );
              settingsInstance = pasteCategory.getIntervalSettingsFactory()();
            }
          } else {
            console.error(
              `Cannot paste settings: No category found for ${categoryName}. Using basic object.`
            );
            settingsInstance = { toJSON: () => settingsJsonData || {} };
            if (settingsJsonData) {
              Object.assign(settingsInstance, settingsJsonData);
            }
          }
          // --- End Settings Instance Creation ---

          // Create the UI data structure expected by buildIntervalRowElement
          const intervalUIData: IntervalRowData = {
            rowType: "interval",
            duration: intervalJsonData.duration,
            task: intervalJsonData.task,
            categoryName: categoryName, // Use category name string
            featureTypeName: intervalJsonData.featureTypeName,
            featureArgsList: intervalJsonData.featureArgsList,
            intervalSettings: settingsInstance, // Use created instance
          };

          // Build the element, passing the category name string
          newRowElement = buildIntervalRowElement(intervalUIData, categoryName);
          this.rowManager.insertRowElement(newRowElement, lastPastedElement); // Insert it
        }

        if (newRowElement) {
          lastPastedElement = newRowElement; // Update insertion point
        }
      } catch (error) {
        console.error("Error pasting row:", rowDataJSON, error);
      }
    });

    this.selectionManager.clearSelection();
    this.rowManager.updateAllRowIndentation();
  }

  /** Checks if there is data in the internal clipboard. */
  public hasCopiedData(): boolean {
    return this.clipboardData.length > 0;
  }
}
