import {
  GroupRowData,
  IntervalRowData,
  GroupDataJSON,
  IntervalDataJSON,
  ScheduleRowJSONData,
  IntervalSettings,
} from "./interval/types";
import { buildGroupSidebarRow, GROUP_COLOR_PALETTE, refreshGroupStats, propagateGroupColors } from "./interval/group_row_ui";
import { buildSidebarIntervalRow } from "./interval/interval_row_ui";
import { SelectionManager } from "./selection_manager";
import { instrumentCategory } from "../../fretboard/fretboard_category";

// Cycles through GROUP_COLOR_PALETTE for auto-assignment
let _groupColorIndex = 0;

export class RowManager {
  private configEntriesContainerEl: HTMLElement;
  private selectionManager: SelectionManager;
  private getInstrument: () => string;
  private getTuning: () => string | undefined;

  constructor(
    configEntriesContainerEl: HTMLElement,
    selectionManager: SelectionManager,
    getInstrument?: () => string,
    getTuning?: () => string | undefined
  ) {
    this.configEntriesContainerEl = configEntriesContainerEl;
    this.selectionManager = selectionManager;
    this.getInstrument = getInstrument ?? (() => 'Guitar');
    this.getTuning = getTuning ?? (() => undefined);
    this._attachGroupAddHandler();
  }

  /** Creates the data structure for a new empty interval row. */
  public createEmptyIntervalUIData(categoryName: string): IntervalRowData | null {
    const factory = instrumentCategory.getIntervalSettingsFactory();
    if (!factory) {
      console.error(`Cannot create empty row: No IntervalSettings factory for "${categoryName}".`);
      return null;
    }
    return {
      rowType: 'interval',
      duration: '3:00',
      task: '',
      categoryName,
      featureTypeName: '',
      featureArgsList: [],
      intervalSettings: factory(),
    };
  }

  /** Adds an empty interval row after the last interval in the last group, or at end. */
  public addEmptyIntervalRow(
    categoryName: string,
    insertAfterElement?: HTMLElement | null
  ): HTMLElement | null {
    const data = this.createEmptyIntervalUIData(categoryName);
    if (!data) return null;

    const rowEl = buildSidebarIntervalRow(data);
    this.insertRowElement(rowEl, insertAfterElement);
    this.refreshAllGroupStats();
    return rowEl;
  }

  /** Adds a group row. Color is auto-assigned if not provided. */
  public addGroupRow(
    name: string = '',
    color?: string,
    insertAfterElement?: HTMLElement | null
  ): HTMLElement {
    const assignedColor = color ?? GROUP_COLOR_PALETTE[_groupColorIndex % GROUP_COLOR_PALETTE.length];
    _groupColorIndex++;

    const data: GroupRowData = {
      rowType: 'group',
      name: name || 'New Group',
      color: assignedColor,
    };
    const rowEl = buildGroupSidebarRow(data);
    this.insertRowElement(rowEl, insertAfterElement);
    return rowEl;
  }

  /** Inserts a row element into the container at the right position. */
  public insertRowElement(
    newRowElement: HTMLElement,
    insertAfterElement?: HTMLElement | null
  ): void {
    let effectiveAfter = insertAfterElement;
    if (!effectiveAfter) {
      effectiveAfter = this.selectionManager.getLastSelectedElementInDomOrder();
    }
    if (effectiveAfter && effectiveAfter.parentNode === this.configEntriesContainerEl) {
      this.configEntriesContainerEl.insertBefore(newRowElement, effectiveAfter.nextSibling);
    } else {
      this.configEntriesContainerEl.appendChild(newRowElement);
    }
  }

  /** Deletes all currently selected rows. */
  public deleteSelectedRows(): void {
    const selected = this.selectionManager.getSelectedElementsInDomOrder();
    if (selected.length === 0) return;
    selected.forEach(row => row.remove());
    this.selectionManager.clearSelection();
    this.refreshAllGroupStats();
  }

  /** Finds the last interval row in a group (walks DOM siblings from groupEl). */
  public findLastIntervalInGroup(groupEl: HTMLElement): HTMLElement | null {
    let last: HTMLElement | null = null;
    let el = groupEl.nextElementSibling as HTMLElement | null;
    while (el && el.dataset.rowType !== 'group') {
      if (el.classList.contains('schedule-row')) last = el;
      el = el.nextElementSibling as HTMLElement | null;
    }
    return last;
  }

  /** Recalculates stats badges and propagates group colors to interval rows. */
  public refreshAllGroupStats(): void {
    const groups = this.configEntriesContainerEl.querySelectorAll<HTMLElement>(
      '.sidebar-group-row'
    );
    groups.forEach(g => refreshGroupStats(g));
    propagateGroupColors(this.configEntriesContainerEl);
  }

  /**
   * Extracts data from a single row element into a JSON-compatible structure.
   * Reads from data-* attributes (not embedded form elements).
   */
  public getRowData(rowElement: HTMLElement): ScheduleRowJSONData | null {
    const rowType = rowElement.dataset.rowType;
    try {
      if (rowType === 'group') {
        const nameSpan = rowElement.querySelector<HTMLElement>('.group-name');
        const name = (nameSpan?.textContent ?? '').trim() || 'New Group';
        const color = rowElement.dataset.color;
        const groupData: GroupDataJSON = { rowType: 'group', name };
        if (color) groupData.color = color;
        return groupData;
      } else if (rowType === 'interval') {
        const duration = rowElement.dataset.duration ?? '3:00';
        const task = rowElement.dataset.task ?? '';
        const categoryName = rowElement.dataset.categoryName;
        if (!categoryName) {
          console.error('Interval row missing data-category-name:', rowElement);
          return null;
        }
        const featureTypeName = rowElement.dataset.featureType ?? '';
        const featureArgsList: string[] = JSON.parse(rowElement.dataset.featureArgsJson ?? '[]');
        const settingsJsonStr = rowElement.dataset.intervalSettingsJson ?? '';

        const intervalData: IntervalDataJSON = {
          rowType: 'interval',
          duration,
          task,
          categoryName,
          featureTypeName,
          featureArgsList,
        };

        if (settingsJsonStr) {
          try {
            intervalData.intervalSettings = JSON.parse(settingsJsonStr);
          } catch {
            // omit if invalid
          }
        }

        return intervalData;
      }
    } catch (e) {
      console.error('Error getting row data:', rowElement, e);
    }
    return null;
  }

  // Listens for the group-add-interval custom event from group rows
  private _attachGroupAddHandler(): void {
    this.configEntriesContainerEl.addEventListener('group-add-interval', (e: Event) => {
      const detail = (e as CustomEvent).detail as { groupEl: HTMLElement };
      const groupEl = detail?.groupEl;
      if (!groupEl) return;

      const categoryName = this._getDefaultCategoryName();
      if (!categoryName) return;

      const insertAfter = this.findLastIntervalInGroup(groupEl) ?? groupEl;
      this.addEmptyIntervalRow(categoryName, insertAfter);
    });
  }

  private _getDefaultCategoryName(): string {
    return instrumentCategory.getName?.() ?? 'Guitar';
  }
}
