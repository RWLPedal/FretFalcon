import {
  FeatureTypeDescriptor,
  ConfigurationSchemaArg,
  ArgType,
  UiComponentType,
} from "../../../feature";
import {
  getAvailableFeatureTypes,
  getAvailableFeatureTypesForInstrument,
  getFeatureTypeDescriptor,
} from "../../../feature_registry";
import { instrumentCategory } from "../../../fretboard/fretboard_category";
import { IntervalSettings, IntervalRowData } from "./types";
import {
  createCell,
  createTextInput,
  createNumberInput,
  createDropdownInput,
  createToggleButtonInput,
  rebuildToggleButtons,
  createEllipsisDropdown,
  populateEllipsisDropdownContent,
  createVariadicInputElement,
} from "./common_ui_elements";
import { createLayerListInput, extractLayerListValues } from "../../../fretboard/features/layer_list_ui";
import { getViewIconByFeatureType } from "../../../panels/panel_registry";

// ─── Sidebar row builder ──────────────────────────────────────────────────────

/**
 * Builds the lightweight sidebar row for an interval.
 * All data is stored in data-* attributes; no form elements are embedded.
 */
export function buildSidebarIntervalRow(data: IntervalRowData): HTMLElement {
  const rowDiv = document.createElement('div');
  rowDiv.classList.add('sidebar-interval-row', 'schedule-row');
  rowDiv.dataset.rowType = 'interval';
  rowDiv.dataset.task = data.task;
  rowDiv.dataset.duration = data.duration;
  rowDiv.dataset.categoryName = data.categoryName;
  rowDiv.dataset.featureType = data.featureTypeName;
  rowDiv.dataset.featureArgsJson = JSON.stringify(data.featureArgsList ?? []);

  const settingsJson = data.intervalSettings?.toJSON?.();
  rowDiv.dataset.intervalSettingsJson = settingsJson ? JSON.stringify(settingsJson) : '';
  // Keep live settings instance on element for inspector to read/write
  (rowDiv as any)._intervalSettings = data.intervalSettings;

  // Drag handle
  const handle = document.createElement('span');
  handle.classList.add('drag-handle');
  handle.draggable = true;
  handle.textContent = '⠿';
  handle.title = 'Drag to reorder';
  rowDiv.appendChild(handle);

  // Duration badge
  const durationBadge = document.createElement('span');
  durationBadge.classList.add('interval-duration-badge');
  durationBadge.textContent = data.duration || '0:00';
  rowDiv.appendChild(durationBadge);

  // Feature icon (Material Icons)
  const icon = document.createElement('span');
  icon.classList.add('interval-feature-icon', 'material-icons');
  icon.textContent = getViewIconByFeatureType(data.featureTypeName) ?? 'radio_button_unchecked';
  rowDiv.appendChild(icon);

  // Text column: task name + subtext
  const textCol = document.createElement('span');
  textCol.classList.add('interval-text-col');

  const taskName = document.createElement('span');
  taskName.classList.add('interval-task-name');
  taskName.textContent = data.task || '';
  taskName.title = data.task;
  textCol.appendChild(taskName);

  const subtext = document.createElement('span');
  subtext.classList.add('interval-subtext');
  subtext.textContent = getIntervalSubtext(data.featureTypeName, data.featureArgsList);
  textCol.appendChild(subtext);

  rowDiv.appendChild(textCol);

  // Delete button
  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.classList.add('row-delete-btn');
  deleteBtn.textContent = '×';
  deleteBtn.title = 'Remove interval';
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    rowDiv.remove();
  });
  rowDiv.appendChild(deleteBtn);

  return rowDiv;
}

/** Updates the visible sidebar text and data-* attrs after inspector edit. */
export function syncSidebarRow(
  rowEl: HTMLElement,
  task: string,
  duration: string,
  featureTypeName: string,
  featureArgsList: string[],
  settingsJson: string
): void {
  rowEl.dataset.task = task;
  rowEl.dataset.duration = duration;
  rowEl.dataset.featureType = featureTypeName;
  rowEl.dataset.featureArgsJson = JSON.stringify(featureArgsList);
  rowEl.dataset.intervalSettingsJson = settingsJson;

  const taskEl = rowEl.querySelector<HTMLElement>('.interval-task-name');
  if (taskEl) { taskEl.textContent = task || ''; taskEl.title = task; }

  const subtextEl = rowEl.querySelector<HTMLElement>('.interval-subtext');
  if (subtextEl) subtextEl.textContent = getIntervalSubtext(featureTypeName, featureArgsList);

  const durEl = rowEl.querySelector<HTMLElement>('.interval-duration-badge');
  if (durEl) durEl.textContent = duration || '0:00';

  const iconEl = rowEl.querySelector<HTMLElement>('.interval-feature-icon');
  if (iconEl) iconEl.textContent = getViewIconByFeatureType(featureTypeName) ?? 'radio_button_unchecked';
}

// ─── Subtext helper ───────────────────────────────────────────────────────────

// Reverse map from featureTypeName → sidebar label (for fallback subtext)
const _FEATURE_TYPE_LABEL: Record<string, string> = {
  'Notes': 'Fretboard Notes', 'Scale': 'Scales', 'Chord': 'Chords',
  'Triad Shapes': 'Triads', 'Arpeggio': 'Arpeggio', 'Nearby Triads': 'Nearby Triads',
  'Chord Progression': 'Progression', 'CAGED': 'CAGED',
  'MultiLayerFretboard': 'MultiFret', 'Metronome': 'Metronome',
};

/**
 * Returns a compact subtext string for the interval sidebar row.
 * Joins non-empty, non-"None" args with " · ".
 * Falls back to the feature type label if all args are empty/None.
 */
export function getIntervalSubtext(featureTypeName: string, featureArgsList: string[] | string): string {
  const args: string[] = typeof featureArgsList === 'string'
    ? JSON.parse(featureArgsList || '[]')
    : featureArgsList ?? [];

  const significant = args.filter(a => a && a !== 'None');
  const typeLabel = featureTypeName ? (_FEATURE_TYPE_LABEL[featureTypeName] ?? featureTypeName) : '';

  const parts = typeLabel ? [...significant, typeLabel] : significant;
  return parts.join(' · ');
}

// ─── Feature type dropdown (used by inspector) ────────────────────────────────

export function createFeatureTypeDropdown(
  selectedTypeName: string,
  categoryName: string,
  instrument?: string,
  tuningName?: string
): HTMLSelectElement {
  const select = document.createElement('select');
  select.classList.add('config-feature-type');

  select.appendChild(new Option('None', ''));

  const availableTypes: FeatureTypeDescriptor[] = instrument
    ? getAvailableFeatureTypesForInstrument(categoryName, instrument, tuningName)
    : getAvailableFeatureTypes(categoryName);

  if (availableTypes.length === 0) {
    select.disabled = true;
    select.appendChild(new Option(`No features available`, ''));
  } else {
    availableTypes.forEach((ft) => {
      const option = new Option(ft.displayName, ft.typeName);
      if (ft.typeName === selectedTypeName) option.selected = true;
      select.appendChild(option);
    });
  }

  return select;
}

// ─── Args section (used by inspector) ────────────────────────────────────────

export function updateArgsSection(
  featureTypeSelect: HTMLSelectElement,
  argsContainer: HTMLElement,
  currentSettingsInstance: IntervalSettings,
  categoryName: string,
  initialArgs?: string[]
): void {
  const selectedTypeName = featureTypeSelect.value;
  argsContainer.innerHTML = '';

  if (selectedTypeName) {
    const descriptor = getFeatureTypeDescriptor(categoryName, selectedTypeName);
    if (descriptor) {
      const schema = descriptor.getConfigurationSchema();

      if (typeof schema === 'object' && 'args' in schema && Array.isArray(schema.args)) {
        populateArgsFromSchema(argsContainer, schema.args, initialArgs || [], currentSettingsInstance);
      } else if (typeof schema === 'string') {
        const info = document.createElement('span');
        info.classList.add('args-info');
        info.textContent = schema;
        argsContainer.appendChild(info);
      } else {
        const info = document.createElement('span');
        info.classList.add('args-info');
        info.textContent = 'No configurable arguments';
        argsContainer.appendChild(info);
      }
    } else {
      const err = document.createElement('span');
      err.classList.add('args-error');
      err.textContent = `Error: feature "${selectedTypeName}" not found.`;
      argsContainer.appendChild(err);
    }
  } else {
    argsContainer.innerHTML = '<span class="args-empty">No feature selected</span>';
  }
}

export function populateArgsFromSchema(
  container: HTMLElement,
  schemaArgs: ConfigurationSchemaArg[],
  currentValues: string[],
  currentSettingsInstance: IntervalSettings
): void {
  let valueIndex = 0;
  container.innerHTML = '';
  const argsInnerContainer = document.createElement('div');
  argsInnerContainer.classList.add('feature-args-inner-container');

  const controllerValues = new Map<string, string>();

  schemaArgs.forEach((arg) => {
    const argWrapper = document.createElement('div');
    argWrapper.classList.add('feature-arg-wrapper');
    argWrapper.dataset.argName = arg.name;

    const label = document.createElement('label');
    label.classList.add('label', 'is-small');
    const labelText = arg.name
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
    label.title = (arg.description || '') + (arg.required ? ' (Required)' : '');
    argWrapper.appendChild(label);

    const inputsContainer = document.createElement('div');
    inputsContainer.classList.add('feature-arg-inputs-container');
    inputsContainer.dataset.argType = arg.type;
    if (arg.uiComponentType) inputsContainer.dataset.uiComponentType = arg.uiComponentType;
    argWrapper.appendChild(inputsContainer);

    const uiType = arg.uiComponentType;
    const isVariadic = arg.isVariadic;

    if (uiType === UiComponentType.Checkbox) {
      label.textContent = labelText;
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.name = arg.name;
      cb.classList.add('config-feature-checkbox');
      if (arg.controlsArgName) cb.dataset.controlsArgName = arg.controlsArgName;
      const toggleLabel = document.createElement('label');
      toggleLabel.classList.add('toggle-switch', 'toggle-switch--sm');
      const slider = document.createElement('span');
      slider.classList.add('toggle-switch__slider');
      toggleLabel.append(cb, slider);
      inputsContainer.appendChild(toggleLabel);
    } else if (uiType === UiComponentType.LayerList) {
      label.textContent = labelText;
      const variadicValues = currentValues.slice(valueIndex);
      createLayerListInput(inputsContainer, arg, variadicValues);
      valueIndex = currentValues.length;
    } else if (uiType === UiComponentType.ToggleButtonSelector || (isVariadic && uiType !== UiComponentType.Ellipsis)) {
      label.textContent = labelText;
      const variadicValues = currentValues.slice(valueIndex);
      if (uiType === UiComponentType.ToggleButtonSelector) {
        const keyControllerName = schemaArgs.find(
          a => a.controlsArgName === arg.name && a.type === ArgType.Enum
        )?.name;
        const initKeyType = keyControllerName
          ? (controllerValues.get(keyControllerName) ?? 'Major')
          : 'Major';
        createToggleButtonInput(inputsContainer, arg, variadicValues, initKeyType, false);
      } else {
        createVariadicInputElement(arg, inputsContainer, variadicValues);
      }
      valueIndex = currentValues.length;
    } else if (uiType === UiComponentType.Ellipsis) {
      label.textContent = labelText;
      if (arg.nestedSchema) {
        inputsContainer.appendChild(createEllipsisDropdown(arg, currentSettingsInstance));
      } else {
        const err = document.createElement('span');
        err.textContent = '[Config Error]';
        err.classList.add('args-error');
        inputsContainer.appendChild(err);
      }
    } else {
      label.textContent = labelText;
      const currentValue = valueIndex < currentValues.length ? currentValues[valueIndex] : '';
      switch (arg.type) {
        case ArgType.Enum:
          inputsContainer.appendChild(createDropdownInput(arg.name, arg.enum || [], currentValue));
          if (arg.controlsArgName) {
            controllerValues.set(arg.name, currentValue || arg.enum?.[0] || '');
          }
          break;
        case ArgType.Number:
          inputsContainer.appendChild(createNumberInput(arg.name, currentValue));
          break;
        case ArgType.Boolean:
          inputsContainer.appendChild(createDropdownInput(arg.name, ['true', 'false'], currentValue || 'false'));
          break;
        default:
          inputsContainer.appendChild(createTextInput(arg.name, currentValue, arg.example));
          break;
      }
      valueIndex++;
    }

    argsInnerContainer.appendChild(argWrapper);
  });

  container.appendChild(argsInnerContainer);
  wireControllerArgs(argsInnerContainer, schemaArgs);
}

export function wireControllerArgs(
  argsInnerContainer: HTMLElement,
  schemaArgs: ConfigurationSchemaArg[]
): void {
  const getInputsContainer = (argName: string) =>
    argsInnerContainer.querySelector<HTMLElement>(
      `[data-arg-name="${argName}"] .feature-arg-inputs-container`
    );

  schemaArgs.forEach(arg => {
    if (!arg.controlsArgName) return;

    const controllerInputs = getInputsContainer(arg.name);
    const controlledInputs = getInputsContainer(arg.controlsArgName);
    const controlledArg = schemaArgs.find(a => a.name === arg.controlsArgName);
    if (!controllerInputs || !controlledInputs || !controlledArg) return;

    if (arg.uiComponentType === UiComponentType.Checkbox) {
      const cb = controllerInputs.querySelector<HTMLInputElement>("input[type='checkbox']");
      if (!cb) return;
      cb.addEventListener('change', () => {
        const advBtns = controlledInputs.querySelectorAll<HTMLElement>('.is-advanced-btn');
        advBtns.forEach(btn => {
          btn.style.display = cb.checked ? '' : 'none';
          if (!cb.checked) btn.classList.remove('is-active', 'is-info');
        });
      });
    } else if (arg.type === ArgType.Enum) {
      const select = controllerInputs.querySelector<HTMLSelectElement>('select');
      if (!select) return;
      select.addEventListener('change', () => {
        const currentSelection = Array.from(
          controlledInputs.querySelectorAll<HTMLButtonElement>('.numeral-toggle-btn.is-active')
        ).map(btn => btn.dataset.value ?? '').filter(v => v);

        const advCb = argsInnerContainer.querySelector<HTMLInputElement>(
          `input.config-feature-checkbox[data-controls-arg-name="${arg.controlsArgName}"]`
        );
        const showAdvanced = advCb?.checked ?? false;
        rebuildToggleButtons(controlledInputs, controlledArg, currentSelection, select.value, showAdvanced);
      });
    }
  });
}

/** Extracts the current feature args list from the args container DOM. */
export function extractArgsFromContainer(
  argsContainer: HTMLElement,
  featureTypeName: string,
  categoryName: string
): string[] {
  const featureArgsList: string[] = [];
  if (!featureTypeName) return featureArgsList;

  const descriptor = getFeatureTypeDescriptor(categoryName, featureTypeName);
  const schema = descriptor?.getConfigurationSchema();

  if (typeof schema !== 'object' || !('args' in schema) || !Array.isArray(schema.args)) {
    return featureArgsList;
  }

  const schemaArgs = schema.args;
  let schemaArgIndex = 0;

  const argsInnerContainer = argsContainer.querySelector<HTMLElement>('.feature-args-inner-container');
  if (!argsInnerContainer) return featureArgsList;

  const argWrappers = argsInnerContainer.querySelectorAll<HTMLElement>(':scope > .feature-arg-wrapper');

  argWrappers.forEach((wrapper) => {
    const currentSchemaArg = schemaArgs[schemaArgIndex];
    if (!currentSchemaArg) return;

    const inputsContainer = wrapper.querySelector<HTMLElement>('.feature-arg-inputs-container');
    if (!inputsContainer) return;

    const uiType = inputsContainer.dataset.uiComponentType;
    const isVariadic = currentSchemaArg.isVariadic;

    if (uiType === UiComponentType.LayerList) {
      featureArgsList.push(...extractLayerListValues(inputsContainer));
      schemaArgIndex = schemaArgs.length;
    } else if (uiType === UiComponentType.ToggleButtonSelector) {
      const activeButtons = inputsContainer.querySelectorAll<HTMLButtonElement>('.numeral-toggle-btn.is-active');
      featureArgsList.push(...Array.from(activeButtons).map(btn => btn.dataset.value || '').filter(v => v));
      if (isVariadic) schemaArgIndex = schemaArgs.length;
    } else if (uiType === UiComponentType.Checkbox) {
      schemaArgIndex++;
    } else if (uiType === UiComponentType.Ellipsis) {
      schemaArgIndex++;
    } else if (isVariadic) {
      const varInputs = inputsContainer.querySelectorAll<HTMLInputElement | HTMLSelectElement>('.config-feature-arg, .select > select');
      varInputs.forEach(input => { const v = input.value?.trim(); if (v) featureArgsList.push(v); });
      schemaArgIndex = schemaArgs.length;
    } else {
      const inputEl = inputsContainer.querySelector<HTMLInputElement | HTMLSelectElement>('.config-feature-arg, .select > select');
      featureArgsList.push(inputEl?.value?.trim() ?? '');
      schemaArgIndex++;
    }
  });

  return featureArgsList;
}
