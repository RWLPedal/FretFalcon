import { AudioController } from "../../audio_controller";
import { IDisplayController } from "../../display_controller";
import { Schedule } from "../schedule";
import { AppSettings, LAST_RUN_SCHEDULE_JSON_KEY } from "../../settings";
import {
  parseScheduleJSON,
  generateScheduleJSON,
  ScheduleDocument,
} from "./schedule_serializer";
import {
  ScheduleRowData,
  GroupRowData,
  IntervalRowData,
  ScheduleRowJSONData,
} from "./interval/types";
import { buildSidebarIntervalRow } from "./interval/interval_row_ui";
import { buildGroupSidebarRow } from "./interval/group_row_ui";
import { EditorUIManager } from "./editor_ui_manager";
import { ErrorDisplay } from "./error_display";
import { SelectionManager } from "./selection_manager";
import { RowManager } from "./row_manager";
import { ClipboardManager } from "./clipboard_manager";
import { DragDropManager } from "./drag_drop_manager";
import { KeyboardShortcutManager } from "./keyboard_shortcut_manager";
import { ScheduleBuilder } from "./schedule_builder";
import { InspectorPanel } from "./inspector_panel";
import { instrumentCategory } from "../../fretboard/fretboard_category";
import { refreshGroupStats } from "./interval/group_row_ui";

enum EditorMode {
  JSON = "json",
  Config = "config",
}

const DEFAULT_SCHEDULE_NAME = "Untitled Schedule";

export class ScheduleEditor {
  public containerEl: HTMLElement;
  private updateAction: () => void;
  private audioController: AudioController;
  private appSettings: AppSettings | null = null;
  private uiManager: EditorUIManager;
  public errorDisplay: ErrorDisplay;
  private selectionManager: SelectionManager;
  private rowManager: RowManager;
  private clipboardManager: ClipboardManager;
  private dndManager: DragDropManager;
  private keyboardManager: KeyboardShortcutManager;
  private scheduleBuilder: ScheduleBuilder;
  private inspectorPanel: InspectorPanel;
  private scheduleNameDisplayEl!: HTMLElement | null;
  private currentMode: EditorMode = EditorMode.Config;
  private scheduleName: string = DEFAULT_SCHEDULE_NAME;
  private defaultCategoryName: string | null = null;

  constructor(
    containerEl: HTMLElement,
    updateAction: () => void,
    audioController: AudioController,
    appSettings?: AppSettings
  ) {
    if (!containerEl) throw new Error("ScheduleEditor: Container element is required.");
    this.containerEl = containerEl;
    this.updateAction = updateAction;
    this.audioController = audioController;
    this.appSettings = appSettings ?? null;

    this.defaultCategoryName = instrumentCategory.getName();

    this.uiManager = new EditorUIManager(this.containerEl);
    this._findNameEditElements();

    this.errorDisplay = new ErrorDisplay(
      this.containerEl,
      this.uiManager.editorControlsContainerEl
    );

    this.selectionManager = new SelectionManager(
      this.uiManager.configEntriesContainerEl,
      this._onSelectionChange.bind(this)
    );

    this.rowManager = new RowManager(
      this.uiManager.configEntriesContainerEl,
      this.selectionManager,
      () => this.appSettings?.instrumentSettings?.instrument ?? 'Guitar',
      () => this.appSettings?.instrumentSettings?.tuning
    );

    this.inspectorPanel = new InspectorPanel(
      this.uiManager.inspectorEl,
      () => this.appSettings?.instrumentSettings?.instrument ?? 'Guitar',
      () => this.appSettings?.instrumentSettings?.tuning,
      () => this.defaultCategoryName ?? '',
      () => {
        if (this.defaultCategoryName) {
          const newRow = this.rowManager.addEmptyIntervalRow(this.defaultCategoryName);
          if (newRow) this.selectionManager.selectSingleRow(newRow);
        }
      }
    );

    this.clipboardManager = new ClipboardManager(
      this.selectionManager,
      this.rowManager,
      this._onClipboardChange.bind(this)
    );

    this.dndManager = new DragDropManager(
      this.uiManager.configEntriesContainerEl,
      this.selectionManager,
      this.rowManager
    );

    this.keyboardManager = new KeyboardShortcutManager(
      this.uiManager.configEntriesContainerEl,
      this.clipboardManager,
      this.rowManager,
      () => this.currentMode === EditorMode.Config
    );

    this.scheduleBuilder = new ScheduleBuilder(
      this.rowManager,
      this.errorDisplay,
      this.uiManager.configEntriesContainerEl
    );
    this.scheduleBuilder.setScheduleName(this.scheduleName);

    this._attachButtonHandlers();
    this._attachNameEditHandlers();
    this._attachStructureObserver();
    this.setEditorMode(this.currentMode, true);
    this._loadInitialState();
    this._updateScheduleNameDisplay();

    if (this.currentMode === EditorMode.Config) {
      if (this.uiManager.textEl.value.trim().length > 0) {
        this.syncJSONViewToConfig();
      }
      if (
        this.uiManager.configEntriesContainerEl.childElementCount === 0 &&
        this.defaultCategoryName
      ) {
        this.rowManager.addEmptyIntervalRow(this.defaultCategoryName);
      }
    }
  }

  // ─── Schedule name ────────────────────────────────────────────────────────

  private _findNameEditElements(): void {
    this.scheduleNameDisplayEl =
      this.containerEl.querySelector<HTMLElement>('#schedule-name-display');
  }

  private _updateScheduleNameDisplay(): void {
    if (this.scheduleNameDisplayEl) {
      this.scheduleNameDisplayEl.textContent = this.scheduleName;
    }
  }

  private _attachNameEditHandlers(): void {
    if (!this.scheduleNameDisplayEl) return;
    this.scheduleNameDisplayEl.addEventListener('blur', () => {
      const newName = this.scheduleNameDisplayEl!.textContent?.trim() ?? '';
      if (newName && newName !== this.scheduleName) {
        this.scheduleName = newName;
      }
      this._updateScheduleNameDisplay();
    });
  }

  // ─── Mode switching ───────────────────────────────────────────────────────

  private toggleMode(): void {
    const nextMode = this.currentMode === EditorMode.Config ? EditorMode.JSON : EditorMode.Config;
    this.setEditorMode(nextMode);
  }

  private setEditorMode(mode: EditorMode, skipSync: boolean = false): void {
    this.currentMode = mode;
    this.uiManager.setModeUI(mode === EditorMode.JSON);
    if (!skipSync) {
      if (mode === EditorMode.JSON) this.syncConfigToJSONView();
      else this.syncJSONViewToConfig();
    }
  }

  private syncConfigToJSONView(): void {
    try {
      const jsonString = this._generateJSONFromConfigView();
      this.uiManager.textEl.value = jsonString;
      this.errorDisplay.removeMessage();
    } catch (error: any) {
      this.errorDisplay.showMessage(`Error generating JSON: ${error.message}`);
    }
  }

  private syncJSONViewToConfig(): void {
    try {
      const parsedDoc = parseScheduleJSON(this.uiManager.textEl.value);
      this.scheduleName = parsedDoc.name || DEFAULT_SCHEDULE_NAME;
      this._updateScheduleNameDisplay();
      this.uiManager.populateConfigUI(
        this._buildRowElement.bind(this),
        parsedDoc.items
      );
      this.rowManager.refreshAllGroupStats();
      this.uiManager.updateScheduleStats();
      this.selectionManager.clearSelection();
      this.errorDisplay.removeMessage();
    } catch (error: any) {
      this.errorDisplay.showMessage(`Error parsing JSON: ${error.message}`);
    }
  }

  // ─── Load/Save/Build ──────────────────────────────────────────────────────

  private _loadInitialState(): void {
    const lastRunJSON = localStorage.getItem(LAST_RUN_SCHEDULE_JSON_KEY);
    let initialJSON: string | null = null;
    let initialItems: ScheduleRowData[] | null = null;
    let initialName: string | undefined = undefined;

    if (lastRunJSON) {
      try {
        const parsedDoc = parseScheduleJSON(lastRunJSON);
        initialName = parsedDoc.name;
        initialItems = parsedDoc.items;
        initialJSON = lastRunJSON;
      } catch (e) {
        console.warn('Could not parse last run schedule JSON, removing.', e);
        localStorage.removeItem(LAST_RUN_SCHEDULE_JSON_KEY);
      }
    }

    if (!initialItems) {
      if (typeof instrumentCategory.getDefaultIntervals === 'function') {
        initialItems = instrumentCategory.getDefaultIntervals();
      }
      initialName = `${instrumentCategory.getDisplayName()} Default`;

      if (!initialItems || initialItems.length === 0) {
        initialItems = [];
        if (this.defaultCategoryName) {
          const emptyRowData = this.rowManager.createEmptyIntervalUIData(this.defaultCategoryName);
          if (emptyRowData) initialItems.push(emptyRowData);
        }
        initialName = DEFAULT_SCHEDULE_NAME;
      }

      try {
        const tempContainer = document.createElement('div');
        initialItems.forEach((itemData) => {
          const el = this._buildRowElement(itemData);
          if (el) tempContainer.appendChild(el);
        });
        const rowElements = Array.from(tempContainer.querySelectorAll<HTMLElement>('.schedule-row'));
        const jsonItems = rowElements.map(row => this.rowManager.getRowData(row)!).filter(d => d !== null);
        initialJSON = generateScheduleJSON(initialName, jsonItems);
      } catch (e) {
        initialJSON = JSON.stringify({ name: initialName, items: [] }, null, 2);
      }
    }

    if (initialJSON !== null) {
      this.setScheduleJSON(initialJSON, true);
    } else {
      this.scheduleName = DEFAULT_SCHEDULE_NAME;
      this._updateScheduleNameDisplay();
      this._clearConfigEntries();
      if (this.defaultCategoryName) {
        this.rowManager.addEmptyIntervalRow(this.defaultCategoryName);
      }
    }
  }

  private _buildRowElement(rowData: ScheduleRowData): HTMLElement | null {
    if (rowData.rowType === 'group') {
      return buildGroupSidebarRow(rowData as GroupRowData);
    } else if (rowData.rowType === 'interval') {
      const intervalData = rowData as IntervalRowData;
      if (!intervalData.categoryName) {
        const errorDiv = document.createElement('div');
        errorDiv.textContent = '[Error: Missing Category]';
        errorDiv.classList.add('schedule-row');
        return errorDiv;
      }
      return buildSidebarIntervalRow(intervalData);
    }
    return null;
  }

  public getScheduleName(): string {
    return this.scheduleName;
  }

  public setApplyButtonLabel(label: string): void {
    this.uiManager.setApplyButtonLabel(label);
  }

  private _attachButtonHandlers(): void {
    this.uiManager.modeToggleEl.onclick = () => this.toggleMode();
    this.uiManager.saveScheduleBtnEl.onclick = () => this._saveScheduleToFile();
    this.uiManager.loadScheduleBtnEl.onclick = () => this._loadScheduleFromFile();
    this.uiManager.switchToVisualBtn.onclick = () => this.setEditorMode(EditorMode.Config);
    this.uiManager.applyChangesBtn.onclick = () => {
      this.syncJSONViewToConfig();
      if (!this.errorDisplay.hasMessage()) {
        this.setEditorMode(EditorMode.Config);
      }
    };
    this.uiManager.addGroupBtnEl.onclick = () => this.rowManager.addGroupRow();
    this.uiManager.addIntervalBtnEl.onclick = () => {
      if (this.defaultCategoryName) {
        // Add after last interval in last group, or at end
        const lastGroup = this._getLastGroupEl();
        const insertAfter = lastGroup
          ? (this.rowManager.findLastIntervalInGroup(lastGroup) ?? lastGroup)
          : this.rowManager['selectionManager'].getLastSelectedElementInDomOrder();
        const newRow = this.rowManager.addEmptyIntervalRow(this.defaultCategoryName, insertAfter);
        if (newRow) this.selectionManager.selectSingleRow(newRow);
      } else {
        alert('Error: Cannot add interval. No default category found.');
      }
    };
    this.uiManager.setScheduleButtonEl.onclick = () => {
      this.errorDisplay.removeMessage();
      this.updateAction();
    };
  }

  private _getLastGroupEl(): HTMLElement | null {
    const groups = this.uiManager.configEntriesContainerEl.querySelectorAll<HTMLElement>(
      '.sidebar-group-row'
    );
    return groups.length > 0 ? groups[groups.length - 1] : null;
  }

  private _attachStructureObserver(): void {
    const observer = new MutationObserver(() => {
      this.uiManager.updateScheduleStats();
    });
    observer.observe(this.uiManager.configEntriesContainerEl, { childList: true, subtree: false });
  }

  private _refreshStats(): void {
    this.rowManager.refreshAllGroupStats();
    this.uiManager.updateScheduleStats();
  }

  private _onSelectionChange(): void {
    const selected = this.selectionManager.getSelectedElements();

    if (selected.size === 0) {
      this.inspectorPanel.showEmpty();
    } else if (selected.size === 1) {
      const [rowEl] = selected;
      if (rowEl.dataset.rowType === 'group') {
        this.inspectorPanel.showGroup(rowEl);
      } else {
        this.inspectorPanel.show(rowEl);
      }
    } else {
      // Multiple rows selected — show empty/generic inspector
      this.inspectorPanel.showEmpty();
    }
  }

  private _onClipboardChange(canPaste: boolean): void {
    // Copy/paste state — nothing to update in new UI (keyboard shortcuts only)
  }

  public newSchedule(): void {
    if (!confirm('Clear the current schedule and start a new one?')) return;
    this._clearConfigEntries();
    this.uiManager.textEl.value = '';
    this.scheduleName = DEFAULT_SCHEDULE_NAME;
    this._updateScheduleNameDisplay();
    this.selectionManager.clearSelection(true);
    this.clipboardManager.clearClipboard();

    if (this.defaultCategoryName) {
      this.rowManager.addEmptyIntervalRow(this.defaultCategoryName);
    }
    this.errorDisplay.removeMessage();
    if (this.currentMode !== EditorMode.Config) {
      this.setEditorMode(EditorMode.Config, true);
    }
  }

  private _clearConfigEntries(): void {
    while (this.uiManager.configEntriesContainerEl.firstChild) {
      this.uiManager.configEntriesContainerEl.removeChild(
        this.uiManager.configEntriesContainerEl.firstChild
      );
    }
  }

  public getScheduleJSON(): string {
    if (this.currentMode === EditorMode.JSON) {
      try {
        parseScheduleJSON(this.uiManager.textEl.value);
        return this.uiManager.textEl.value;
      } catch (e) {
        this.errorDisplay.showMessage(`JSON Error: ${e instanceof Error ? e.message : String(e)}.`);
        return this._generateJSONFromConfigView();
      }
    } else {
      return this._generateJSONFromConfigView();
    }
  }

  private _generateJSONFromConfigView(): string {
    const rows = this.uiManager.configEntriesContainerEl.querySelectorAll<HTMLElement>('.schedule-row');
    const rowDataArray = Array.from(rows)
      .map(row => this.rowManager.getRowData(row))
      .filter((d): d is ScheduleRowJSONData => d !== null);
    return generateScheduleJSON(this.scheduleName, rowDataArray);
  }

  public setScheduleJSON(jsonString: string, skipSync: boolean = false): void {
    try {
      const parsedDoc = parseScheduleJSON(jsonString);
      this.scheduleName = parsedDoc.name || DEFAULT_SCHEDULE_NAME;
      let prettyJson = jsonString;
      try { prettyJson = JSON.stringify(JSON.parse(jsonString), null, 2); } catch {}
      this.uiManager.textEl.value = prettyJson;
      this._updateScheduleNameDisplay();
      this.errorDisplay.removeMessage();

      if (!skipSync && this.currentMode === EditorMode.Config) {
        this.syncJSONViewToConfig();
      } else if (skipSync && this.currentMode === EditorMode.Config) {
        this.uiManager.populateConfigUI(this._buildRowElement.bind(this), parsedDoc.items);
        this.rowManager.refreshAllGroupStats();
        this.selectionManager.clearSelection();
      }
    } catch (error: any) {
      this.errorDisplay.showMessage(`Failed to load schedule: ${error.message}`);
    }
  }

  private _saveScheduleToFile(): void {
    const json = this.getScheduleJSON();
    const safeName = this.scheduleName.replace(/[^a-z0-9_\-\s]/gi, '').trim() || 'schedule';
    const filename = `${safeName}.json`;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  private _loadScheduleFromFile(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          this.setScheduleJSON(text);
        } catch (err) {
          this.errorDisplay.showMessage(`Failed to load schedule: ${err instanceof Error ? err.message : String(err)}`);
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  public getSchedule(
    displayController: IDisplayController,
    settings: AppSettings,
    maxCanvasHeight: number
  ): Schedule | null {
    if (this.currentMode === EditorMode.JSON) {
      this.syncJSONViewToConfig();
      if (this.errorDisplay.hasMessage()) return null;
    }
    this.scheduleBuilder.setScheduleName(this.scheduleName);
    return this.scheduleBuilder.buildSchedule(
      displayController,
      this.audioController,
      settings,
      maxCanvasHeight
    );
  }
}
