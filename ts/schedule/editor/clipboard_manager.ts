import { RowManager } from "./row_manager";
import {
  ScheduleRowJSONData,
  IntervalDataJSON,
  GroupDataJSON,
  IntervalRowData,
  GroupRowData,
  IntervalSettings,
} from "./interval/types";
import { SelectionManager } from "./selection_manager";
import { InstrumentIntervalSettings } from "../fretboard_interval_settings";
import { buildSidebarIntervalRow } from "./interval/interval_row_ui";

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

  public clearClipboard(): void {
    this.clipboardData = [];
    this.onClipboardChangeCallback(this.hasCopiedData());
  }

  public copySelectedRows(): void {
    const selectedRows = this.selectionManager.getSelectedElementsInDomOrder();
    if (selectedRows.length === 0) return;
    this.clipboardData = selectedRows
      .map(row => this.rowManager.getRowData(row))
      .filter((data): data is ScheduleRowJSONData => data !== null);
    this.onClipboardChangeCallback(this.hasCopiedData());
  }

  public pasteRows(): void {
    if (!this.hasCopiedData()) return;

    const insertAfterElement = this.selectionManager.getLastSelectedElementInDomOrder();
    let lastPasted: HTMLElement | null = insertAfterElement;

    this.clipboardData.forEach((rowDataJSON) => {
      let newRowEl: HTMLElement | null = null;
      try {
        if (rowDataJSON.rowType === 'group') {
          const gd = rowDataJSON as GroupDataJSON;
          newRowEl = this.rowManager.addGroupRow(gd.name, gd.color, lastPasted);
        } else if (rowDataJSON.rowType === 'interval') {
          const id = rowDataJSON as IntervalDataJSON;
          const categoryName = id.categoryName;

          if (categoryName !== 'Instrument') {
            console.warn(`Cannot paste interval: category "${categoryName}" not registered. Skipping.`);
            return;
          }

          let settingsInstance: IntervalSettings;
          try {
            settingsInstance = InstrumentIntervalSettings.fromJSON(id.intervalSettings as any);
          } catch {
            settingsInstance = new InstrumentIntervalSettings();
          }

          const uiData: IntervalRowData = {
            rowType: 'interval',
            duration: id.duration,
            task: id.task,
            categoryName,
            featureTypeName: id.featureTypeName,
            featureArgsList: id.featureArgsList,
            intervalSettings: settingsInstance,
          };

          newRowEl = buildSidebarIntervalRow(uiData);
          this.rowManager.insertRowElement(newRowEl, lastPasted);
        }

        if (newRowEl) lastPasted = newRowEl;
      } catch (e) {
        console.error('Error pasting row:', rowDataJSON, e);
      }
    });

    this.selectionManager.clearSelection();
    this.rowManager.refreshAllGroupStats();
  }

  public hasCopiedData(): boolean {
    return this.clipboardData.length > 0;
  }
}
