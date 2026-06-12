import { InstrumentIntervalSettings } from "../fretboard_interval_settings";
import { parseDurationString, formatDuration } from "../../time_utils";
import {
  updateArgsSection,
  extractArgsFromContainer,
  syncSidebarRow,
} from "./interval/interval_row_ui";
import { GROUP_COLOR_PALETTE, refreshGroupStats } from "./interval/group_row_ui";
import { IntervalSettings } from "./interval/types";
import { getNavEntries } from "../../reference_page/nav_registry";
import { InstrumentName } from "../../fretboard/fretboard";
import { getViewIcon, getViewIconByFeatureType } from "../../panels/panel_registry";

// ─── View dropdown (sources from nav_sections) ────────────────────────────────

const EXCLUDED_VIEW_IDS = new Set([
  'schedule_floating_view',
  'any_floating_view',
  'instrument_color_legend',
  'global_key',
  'capo_view',
  'circle_of_fifths',
  'floating_timer',
  'drum_machine',
  'strum_view',
  'drone_view',
]);

// Mapping from nav viewId → schedule featureTypeName
const VIEW_ID_TO_FEATURE_TYPE: Record<string, string> = {
  'instrument_notes':              'Notes',
  'instrument_scale':              'Scale',
  'instrument_chord':              'Chord',
  'instrument_triad':              'Triad Shapes',
  'instrument_arpeggio':           'Arpeggio',
  'instrument_nearby_triads':      'Nearby Triads',
  'instrument_chord_progression':  'Chord Progression',
  'instrument_caged':              'CAGED',
  'instrument_multifret':          'MultiLayerFretboard',
  'instrument_floating_metronome': 'Metronome',
};

interface ViewOption {
  featureTypeName: string;
  label: string;
  icon: string;
  availableForInstrument: boolean;
}

/** Builds an ordered list of view options from nav registry, filtered for the current instrument. */
function buildViewOptions(instrument: InstrumentName): ViewOption[] {
  const options: ViewOption[] = [];
  for (const entry of getNavEntries()) {
    if (EXCLUDED_VIEW_IDS.has(entry.viewId)) continue;
    const featureTypeName = VIEW_ID_TO_FEATURE_TYPE[entry.viewId];
    if (!featureTypeName) continue;
    const availableForInstrument = !entry.requiredInstruments ||
      entry.requiredInstruments.includes(instrument as string);
    options.push({
      featureTypeName,
      label: entry.label,
      icon: getViewIcon(entry.viewId),
      availableForInstrument,
    });
  }
  return options;
}

function createViewDropdown(
  selectedTypeName: string,
  instrument: InstrumentName,
): HTMLSelectElement {
  const select = document.createElement('select');
  select.classList.add('config-feature-type');

  select.appendChild(new Option('None', ''));

  const options = buildViewOptions(instrument);
  let selectedIsAvailable = !selectedTypeName; // "None" is always valid

  for (const opt of options) {
    if (opt.availableForInstrument) {
      const o = new Option(opt.label, opt.featureTypeName);
      if (opt.featureTypeName === selectedTypeName) {
        o.selected = true;
        selectedIsAvailable = true;
      }
      select.appendChild(o);
    }
  }

  // If the selected type isn't available for this instrument, add a disabled placeholder
  if (selectedTypeName && !selectedIsAvailable) {
    const unavailableLabel = options.find(o => o.featureTypeName === selectedTypeName)?.label
      ?? selectedTypeName;
    const o = new Option(`${unavailableLabel} (unavailable for this instrument)`, selectedTypeName);
    o.disabled = true;
    o.selected = true;
    select.insertBefore(o, select.options[1]); // Insert after "None"
  }

  return select;
}

/**
 * Inspector panel shown on the right side of the editor.
 * Displays and edits the selected row's properties.
 */
export class InspectorPanel {
  private containerEl: HTMLElement;
  private contentEl: HTMLElement;
  private _selectedRowEl: HTMLElement | null = null;
  private _getInstrument: () => InstrumentName;
  private _getTuning: () => string | undefined;
  private _getDefaultCategory: () => string;
  private _onAddInterval: () => void;

  constructor(
    containerEl: HTMLElement,
    getInstrument: () => InstrumentName,
    getTuning: () => string | undefined,
    getDefaultCategory: () => string,
    onAddInterval: () => void
  ) {
    this.containerEl = containerEl;
    this._getInstrument = getInstrument;
    this._getTuning = getTuning;
    this._getDefaultCategory = getDefaultCategory;
    this._onAddInterval = onAddInterval;

    this.contentEl = document.createElement('div');
    this.contentEl.classList.add('inspector-content');
    this.containerEl.appendChild(this.contentEl);

    this.showEmpty();
  }

  /** Commits any pending inspector edits back to the selected row before switching. */
  flush(): void {
    if (this._selectedRowEl && this._selectedRowEl.dataset.rowType === 'interval') {
      this._flushIntervalRow(this._selectedRowEl);
    }
  }

  /** Show the interval inspector for the given row element. */
  show(rowEl: HTMLElement): void {
    this.flush();
    this._selectedRowEl = rowEl;
    this._renderIntervalInspector(rowEl);
  }

  /** Show the group inspector for the given group row element. */
  showGroup(rowEl: HTMLElement): void {
    this.flush();
    this._selectedRowEl = rowEl;
    this._renderGroupInspector(rowEl);
  }

  /** Show the empty state (no selection). */
  showEmpty(): void {
    this._selectedRowEl = null;
    this.contentEl.innerHTML = '';

    const empty = document.createElement('div');
    empty.classList.add('inspector-empty');
    const msg = document.createElement('p');
    msg.textContent = 'Select an interval to edit';
    empty.appendChild(msg);
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.classList.add('editor-btn', 'btn-outline', 'inspector-add-btn');
    addBtn.textContent = '+ Add Interval';
    addBtn.addEventListener('click', () => this._onAddInterval());
    empty.appendChild(addBtn);
    this.contentEl.appendChild(empty);
  }

  // ─── Interval inspector ────────────────────────────────────────────────────

  private _renderIntervalInspector(rowEl: HTMLElement): void {
    this.contentEl.innerHTML = '';

    const task = rowEl.dataset.task ?? '';
    const duration = rowEl.dataset.duration ?? '3:00';
    const categoryName = rowEl.dataset.categoryName ?? this._getDefaultCategory();
    const featureTypeName = rowEl.dataset.featureType ?? '';
    const featureArgsList: string[] = JSON.parse(rowEl.dataset.featureArgsJson ?? '[]');
    const settingsJsonStr = rowEl.dataset.intervalSettingsJson ?? '';

    let settingsInstance: IntervalSettings = (rowEl as any)._intervalSettings;
    if (!settingsInstance || typeof settingsInstance.toJSON !== 'function') {
      settingsInstance = _deserializeSettings(settingsJsonStr);
      (rowEl as any)._intervalSettings = settingsInstance;
    }

    // Header
    const header = document.createElement('div');
    header.classList.add('inspector-header');
    const headerLabel = document.createElement('span');
    headerLabel.classList.add('inspector-header-label');
    headerLabel.textContent = 'INTERVAL';
    header.appendChild(headerLabel);
    this.contentEl.appendChild(header);

    // Task textarea
    const taskSection = document.createElement('div');
    taskSection.classList.add('inspector-section');
    const taskArea = document.createElement('textarea');
    taskArea.classList.add('inspector-task-input');
    taskArea.value = task;
    taskArea.rows = 2;
    taskArea.placeholder = 'Interval name / task description';
    taskArea.addEventListener('input', () => this._syncRow());
    taskSection.appendChild(taskArea);
    this.contentEl.appendChild(taskSection);

    // Duration section
    const durSection = document.createElement('div');
    durSection.classList.add('inspector-section');
    const durLabel = document.createElement('label');
    durLabel.classList.add('inspector-field-label');
    durLabel.textContent = 'DURATION';
    durSection.appendChild(durLabel);

    const durControl = document.createElement('div');
    durControl.classList.add('duration-control');
    const minusBtn = document.createElement('button');
    minusBtn.type = 'button';
    minusBtn.classList.add('dur-btn');
    minusBtn.textContent = '−';
    const durInput = document.createElement('input');
    durInput.type = 'text';
    durInput.classList.add('dur-input');
    durInput.value = duration;
    const plusBtn = document.createElement('button');
    plusBtn.type = 'button';
    plusBtn.classList.add('dur-btn');
    plusBtn.textContent = '+';

    const stepSecs = 30;
    minusBtn.addEventListener('click', () => {
      const secs = Math.max(0, parseDurationString(durInput.value) - stepSecs);
      durInput.value = formatDuration(secs);
      this._syncRow();
    });
    plusBtn.addEventListener('click', () => {
      const secs = parseDurationString(durInput.value) + stepSecs;
      durInput.value = formatDuration(secs);
      this._syncRow();
    });
    durInput.addEventListener('change', () => this._syncRow());

    durControl.appendChild(minusBtn);
    durControl.appendChild(durInput);
    durControl.appendChild(plusBtn);
    durSection.appendChild(durControl);
    this.contentEl.appendChild(durSection);

    // View type section
    const featureSection = document.createElement('div');
    featureSection.classList.add('inspector-section');
    const featureLabel = document.createElement('label');
    featureLabel.classList.add('inspector-field-label');
    featureLabel.textContent = 'VIEW';
    featureSection.appendChild(featureLabel);

    const featureRow = document.createElement('div');
    featureRow.classList.add('inspector-feature-row');

    const featureIconSpan = document.createElement('span');
    featureIconSpan.classList.add('inspector-feature-icon', 'material-icons');
    featureIconSpan.textContent = getViewIconByFeatureType(featureTypeName) ?? 'radio_button_unchecked';
    featureRow.appendChild(featureIconSpan);

    const featureSelect = createViewDropdown(featureTypeName, this._getInstrument());
    featureSelect.classList.add('inspector-feature-select');
    featureRow.appendChild(featureSelect);
    featureSection.appendChild(featureRow);
    this.contentEl.appendChild(featureSection);

    // Args section
    const argsSection = document.createElement('div');
    argsSection.classList.add('inspector-section', 'inspector-args-section');
    this.contentEl.appendChild(argsSection);

    // Wire feature type change
    featureSelect.addEventListener('change', () => {
      featureIconSpan.textContent = getViewIconByFeatureType(featureSelect.value) ?? 'radio_button_unchecked';
      updateArgsSection(featureSelect, argsSection, settingsInstance, categoryName, []);
      this._syncRow();
    });

    // Populate initial args
    updateArgsSection(featureSelect, argsSection, settingsInstance, categoryName, featureArgsList);

    // Wire args change events (delegate on argsSection)
    argsSection.addEventListener('change', () => this._syncRow());
    argsSection.addEventListener('click', () => {
      // Toggle buttons and checkboxes update on click
      requestAnimationFrame(() => this._syncRow());
    });
  }

  private _syncRow(): void {
    const rowEl = this._selectedRowEl;
    if (!rowEl || rowEl.dataset.rowType !== 'interval') return;

    const taskArea = this.contentEl.querySelector<HTMLTextAreaElement>('.inspector-task-input');
    const durInput = this.contentEl.querySelector<HTMLInputElement>('.dur-input');
    const featureSelect = this.contentEl.querySelector<HTMLSelectElement>('.inspector-feature-select');
    const argsSection = this.contentEl.querySelector<HTMLElement>('.inspector-args-section');

    if (!taskArea || !durInput || !featureSelect || !argsSection) return;

    const task = taskArea.value;
    const duration = durInput.value;
    const featureTypeName = featureSelect.value;
    const categoryName = rowEl.dataset.categoryName ?? this._getDefaultCategory();

    const featureArgsList = extractArgsFromContainer(argsSection, featureTypeName, categoryName);
    const settingsInstance: IntervalSettings = (rowEl as any)._intervalSettings;
    const settingsJson = settingsInstance?.toJSON?.();
    const settingsJsonStr = settingsJson ? JSON.stringify(settingsJson) : '';

    syncSidebarRow(rowEl, task, duration, featureTypeName, featureArgsList, settingsJsonStr);

    // Update group stats after duration change
    _refreshAncestorGroupStats(rowEl);
  }

  private _flushIntervalRow(rowEl: HTMLElement): void {
    // _syncRow already keeps data-* in sync on every change event.
    // Call once more to ensure last state is flushed (e.g., on blur without change).
    this._syncRow();
  }

  // ─── Group inspector ───────────────────────────────────────────────────────

  private _renderGroupInspector(rowEl: HTMLElement): void {
    this.contentEl.innerHTML = '';

    const header = document.createElement('div');
    header.classList.add('inspector-header');
    const headerLabel = document.createElement('span');
    headerLabel.classList.add('inspector-header-label');
    headerLabel.textContent = 'GROUP';
    header.appendChild(headerLabel);
    this.contentEl.appendChild(header);

    // Name field
    const nameSection = document.createElement('div');
    nameSection.classList.add('inspector-section');
    const nameLabel = document.createElement('label');
    nameLabel.classList.add('inspector-field-label');
    nameLabel.textContent = 'NAME';
    nameSection.appendChild(nameLabel);
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.classList.add('inspector-group-name-input');
    const nameSpan = rowEl.querySelector<HTMLElement>('.group-name');
    nameInput.value = nameSpan?.textContent ?? '';
    nameInput.addEventListener('input', () => {
      if (nameSpan) nameSpan.textContent = nameInput.value || 'New Group';
    });
    nameSection.appendChild(nameInput);
    this.contentEl.appendChild(nameSection);

    // Color picker
    const colorSection = document.createElement('div');
    colorSection.classList.add('inspector-section');
    const colorLabel = document.createElement('label');
    colorLabel.classList.add('inspector-field-label');
    colorLabel.textContent = 'COLOR';
    colorSection.appendChild(colorLabel);

    const swatchRow = document.createElement('div');
    swatchRow.classList.add('inspector-swatch-row');
    GROUP_COLOR_PALETTE.forEach((cssVar) => {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.classList.add('color-swatch-item');
      if (rowEl.dataset.color === cssVar) swatch.classList.add('is-selected');
      swatch.style.backgroundColor = `var(${cssVar})`;
      swatch.title = cssVar.replace('--note-', '');
      swatch.addEventListener('click', () => {
        swatchRow.querySelectorAll('.color-swatch-item').forEach(s => s.classList.remove('is-selected'));
        swatch.classList.add('is-selected');
        rowEl.dataset.color = cssVar;
        rowEl.style.setProperty('--group-color', `var(${cssVar})`);
        // Update the inline swatch btn in the group row
        const swatchBtn = rowEl.querySelector<HTMLButtonElement>('.group-color-swatch-btn');
        if (swatchBtn) swatchBtn.style.backgroundColor = `var(${cssVar})`;
      });
      swatchRow.appendChild(swatch);
    });
    colorSection.appendChild(swatchRow);
    this.contentEl.appendChild(colorSection);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _deserializeSettings(jsonStr: string): IntervalSettings {
  if (jsonStr) {
    try {
      const data = JSON.parse(jsonStr);
      return InstrumentIntervalSettings.fromJSON(data);
    } catch {
      // fall through to default
    }
  }
  return new InstrumentIntervalSettings();
}

function _refreshAncestorGroupStats(rowEl: HTMLElement): void {
  let el = rowEl.previousElementSibling as HTMLElement | null;
  while (el) {
    if (el.dataset.rowType === 'group') {
      refreshGroupStats(el);
      return;
    }
    el = el.previousElementSibling as HTMLElement | null;
  }
}
