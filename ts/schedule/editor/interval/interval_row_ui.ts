// ts/schedule/editor/interval/interval_row_ui.ts
import {
  FeatureTypeDescriptor,
  ConfigurationSchemaArg,
  ArgType,
  UiComponentType,
  // FeatureCategoryName removed
} from "../../../feature";
import {
  getAvailableFeatureTypes,
  getAvailableFeatureTypesForInstrument,
  getFeatureTypeDescriptor,
} from "../../../feature_registry";
import { instrumentCategory } from "../../../fretboard/fretboard_category";
// Import generic settings types
import { IntervalSettings, IntervalRowData } from "./types";

// Import UI helpers
import {
  createCell,
  createCellWithInput,
  createTextInput,
  createNumberInput,
  createDropdownInput,
  createToggleButtonInput,
  rebuildToggleButtons,
  createEllipsisDropdown,
  populateEllipsisDropdownContent,
  createVariadicInputElement,
  createLayerListInput,
  createDragHandleCell,
  createCopyButtonCell,
  createRemoveButtonElement,
  applyIndentation,
} from "./common_ui_elements";

/**
 * Builds and returns the HTMLElement for a single interval configuration row.
 * Expects initialData.intervalSettings to be an instance implementing IntervalSettings.
 * Requires the categoryName (string) to determine available features and settings.
 */
export function buildIntervalRowElement(
  initialData: IntervalRowData,
  categoryName: string,
  instrument?: string,
  tuningName?: string
): HTMLElement {
  const entryDiv = document.createElement("div");
  entryDiv.classList.add("config-entry-row", "schedule-row");
  entryDiv.dataset.rowType = "interval";
  entryDiv.dataset.categoryName = categoryName; // **** Store category name ****
  entryDiv.draggable = false; // Dragging starts from handle

  // --- Get or Create IntervalSettings Instance ---
  let settingsInstance: IntervalSettings;
  if (
    initialData.intervalSettings &&
    typeof initialData.intervalSettings.toJSON === "function"
  ) {
    settingsInstance = initialData.intervalSettings;
  } else {
    const settingsFactory = instrumentCategory.getIntervalSettingsFactory();
    if (settingsFactory) {
      console.log(
        `Creating default interval settings using factory for category: ${categoryName}`
      );
      settingsInstance = settingsFactory();
    } else {
      console.error(
        `No IntervalSettings factory registered for category: ${categoryName}. Using plain object fallback.`
      );
      // Provide a minimal fallback that adheres to the interface
      settingsInstance = { toJSON: () => ({}) };
    }
  }
  // Store the resolved instance on the element
  (entryDiv as any)._intervalSettings = settingsInstance;

  // --- Create Row Structure and Cells ---
  entryDiv.style.display = "flex";
  entryDiv.style.alignItems = "center";
  entryDiv.style.gap = "5px";
  entryDiv.style.padding = "2px 0";
  entryDiv.style.position = "relative";

  const handleDiv = createDragHandleCell();
  entryDiv.appendChild(handleDiv);

  const contentWrapper = document.createElement("div");
  contentWrapper.style.display = "grid";
  contentWrapper.style.flexGrow = "1";
  contentWrapper.style.gridTemplateColumns = "50px 80px 155px minmax(60px, 1fr)";
  contentWrapper.style.gap = "4px";
  contentWrapper.style.alignItems = "center";

  const durationDiv = createCellWithInput(
    "text",
    initialData.duration,
    "Time",
    ["config-duration"]
  );
  const taskDiv = createCellWithInput("text", initialData.task, "Task Name", [
    "config-task",
  ]);
  // Pass category name string to dropdown builder
  const featureTypeDiv = createFeatureTypeDropdownCell(
    initialData.featureTypeName,
    categoryName,
    instrument,
    tuningName
  );
  const featureArgsDiv = createCell(
    "feature-args-cell",
    "config-feature-args-container"
  );
  featureArgsDiv.style.alignSelf = "start"; // Align args container top

  contentWrapper.appendChild(durationDiv);
  contentWrapper.appendChild(taskDiv);
  contentWrapper.appendChild(featureTypeDiv);
  contentWrapper.appendChild(featureArgsDiv);
  entryDiv.appendChild(contentWrapper);

  // Actions Cell
  const actionsDiv = document.createElement("div");
  actionsDiv.classList.add("config-cell", "action-cell");
  actionsDiv.style.alignItems = "center";
  actionsDiv.style.gap = "3px";
  actionsDiv.appendChild(createCopyButtonCell());
  actionsDiv.appendChild(createRemoveButtonElement(entryDiv));
  entryDiv.appendChild(actionsDiv);

  // --- Event Listener & Initial Population ---
  const featureTypeSelect = featureTypeDiv.querySelector(
    "select"
  ) as HTMLSelectElement;
  featureTypeSelect.addEventListener("change", () => {
    // Pass category name string and settings instance
    updateArgsSection(
      featureTypeSelect,
      featureArgsDiv,
      settingsInstance,
      categoryName, // Pass name string
      [] // Clear initial args on type change
    );
  });

  // Initial Population: Pass category name string, settings instance, and initial args
  updateArgsSection(
    featureTypeSelect,
    featureArgsDiv,
    settingsInstance,
    categoryName, // Pass name string
    initialData.featureArgsList // Use the list from the loaded data
  );

  applyIndentation(entryDiv, 0); // Apply initial indentation
  return entryDiv;
}

/** Creates the specific feature type dropdown cell for a given category name */
function createFeatureTypeDropdownCell(
  selectedTypeName: string,
  categoryName: string,
  instrument?: string,
  tuningName?: string
): HTMLDivElement {
  const cellDiv = createCell("feature-type-cell");
  const selectWrapper = document.createElement("div");
  selectWrapper.classList.add("select", "is-small", "is-fullwidth");
  const select = document.createElement("select");
  select.classList.add("config-feature-type");

  select.appendChild(new Option("None", ""));

  const availableTypes: FeatureTypeDescriptor[] = instrument
    ? getAvailableFeatureTypesForInstrument(categoryName, instrument, tuningName)
    : getAvailableFeatureTypes(categoryName);
  const category = instrumentCategory;

  if (availableTypes.length === 0) {
    console.warn(
      `No feature types found registered for category: ${categoryName}`
    );
    select.disabled = true;
    select.appendChild(
      new Option(
        `No ${category?.getDisplayName() ?? categoryName} features`,
        ""
      )
    );
  } else {
    availableTypes.forEach((featureType) => {
      const option = new Option(featureType.displayName, featureType.typeName);
      if (featureType.typeName === selectedTypeName) {
        option.selected = true;
      }
      select.appendChild(option);
    });
  }

  selectWrapper.appendChild(select);
  cellDiv.appendChild(selectWrapper);
  return cellDiv;
}

/** Updates the content of the feature arguments container based on selected feature */
function updateArgsSection(
  featureTypeSelect: HTMLSelectElement,
  argsContainer: HTMLElement,
  currentSettingsInstance: IntervalSettings, // Expect generic instance
  categoryName: string, // **** CHANGED: Expect string name ****
  initialArgs?: string[] // **** Expect the loaded featureArgsList here ****
): void {
  const selectedTypeName = featureTypeSelect.value;
  argsContainer.innerHTML = ""; // Clear previous content

  if (selectedTypeName) {
    // Use the category name string to get the descriptor
    const descriptor = getFeatureTypeDescriptor(categoryName, selectedTypeName); // Use name string
    if (descriptor) {
      const schema = descriptor.getConfigurationSchema();

      if (
        typeof schema === "object" &&
        "args" in schema &&
        Array.isArray(schema.args)
      ) {
        // Pass the loaded initialArgs to populateArgsFromSchema
        populateArgsFromSchema(
          argsContainer,
          schema.args,
          initialArgs || [], // Pass the loaded arguments here
          currentSettingsInstance
        );
      } else if (typeof schema === "string") {
        // Handle schema as a simple description string
        const infoSpan = document.createElement("span");
        infoSpan.classList.add("has-text-grey-light", "is-italic", "is-size-7");
        infoSpan.textContent = schema;
        argsContainer.appendChild(infoSpan);
      } else {
        // Handle case with no configurable arguments (or unexpected schema type)
        const infoSpan = document.createElement("span");
        infoSpan.classList.add("has-text-grey-light", "is-italic", "is-size-7");
        infoSpan.textContent = "No configurable arguments";
        argsContainer.appendChild(infoSpan);
      }
    } else {
      console.error(
        `Error: Feature descriptor for "${selectedTypeName}" in category "${categoryName}" not found.`
      );
      const errorSpan = document.createElement("span");
      errorSpan.classList.add("has-text-danger", "is-size-7");
      errorSpan.textContent = `Error: Feature descriptor not found.`;
      argsContainer.appendChild(errorSpan);
    }
  } else {
    // No feature selected
    argsContainer.innerHTML =
      '<span class="has-text-grey-light is-italic is-size-7">No feature selected</span>';
  }
}

/** Populates the arguments container based on a schema object. */
function populateArgsFromSchema(
  container: HTMLElement,
  schemaArgs: ConfigurationSchemaArg[],
  currentValues: string[], // These are the initial values from featureArgsList
  currentSettingsInstance: IntervalSettings // Expect generic instance
): void {
  let valueIndex = 0; // Tracks the current position in the currentValues array
  container.innerHTML = ""; // Clear container
  const argsInnerContainer = document.createElement("div");
  argsInnerContainer.classList.add("feature-args-inner-container");
  argsInnerContainer.style.display = "flex";
  argsInnerContainer.style.flexWrap = "wrap";
  argsInnerContainer.style.gap = "4px 8px"; // Gap between arg groups

  // Track enum-controller values so key-aware toggle buttons know the initial key type.
  const controllerValues = new Map<string, string>();

  schemaArgs.forEach((arg) => {
    const argWrapper = document.createElement("div");
    argWrapper.classList.add("feature-arg-wrapper");
    argWrapper.dataset.argName = arg.name;

    // --- Create Label ---
    const label = document.createElement("label");
    label.classList.add("label", "is-small");
    const labelText = arg.name
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
    label.title = (arg.description || "") + (arg.required ? " (Required)" : "");
    argWrapper.appendChild(label);

    // --- Create Inputs Container ---
    const inputsContainer = document.createElement("div");
    inputsContainer.classList.add("feature-arg-inputs-container");
    inputsContainer.dataset.argType = arg.type;
    if (arg.uiComponentType)
      inputsContainer.dataset.uiComponentType = arg.uiComponentType;
    argWrapper.appendChild(inputsContainer);

    const uiType = arg.uiComponentType;
    const isVariadic = arg.isVariadic; // Check schema flag directly

    // --- Determine which type of input to create and consume values ---
    if (uiType === UiComponentType.Checkbox) {
      // --- Checkbox: UI-only, does NOT consume a value from currentValues ---
      label.textContent = labelText;
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.name = arg.name;
      cb.classList.add("config-feature-checkbox");
      if (arg.controlsArgName) cb.dataset.controlsArgName = arg.controlsArgName;
      const toggleLabel = document.createElement("label");
      toggleLabel.classList.add("toggle-switch", "toggle-switch--sm");
      const slider = document.createElement("span");
      slider.classList.add("toggle-switch__slider");
      toggleLabel.append(cb, slider);
      inputsContainer.appendChild(toggleLabel);
      // valueIndex intentionally NOT incremented
    } else if (uiType === UiComponentType.LayerList) {
      // --- Layer List (MultiLayerFretboard) ---
      label.textContent = labelText;
      const variadicValues = currentValues.slice(valueIndex);
      createLayerListInput(inputsContainer, arg, variadicValues);
      valueIndex = currentValues.length; // consumes all remaining values
    } else if (
      uiType === UiComponentType.ToggleButtonSelector ||
      (isVariadic && uiType !== UiComponentType.Ellipsis)
    ) {
      // --- Handle Variadic Types (Toggle Buttons or Generic Variadic) ---
      label.textContent = labelText;
      const variadicValues = currentValues.slice(valueIndex); // Consume remaining values
      if (uiType === UiComponentType.ToggleButtonSelector) {
        // Determine initial key type from any enum controller for this arg
        const keyControllerName = schemaArgs.find(
          a => a.controlsArgName === arg.name && a.type === ArgType.Enum
        )?.name;
        const initKeyType = keyControllerName
          ? (controllerValues.get(keyControllerName) ?? "Major")
          : "Major";
        createToggleButtonInput(inputsContainer, arg, variadicValues, initKeyType, false);
      } else {
        createVariadicInputElement(arg, inputsContainer, variadicValues);
      }
      valueIndex = currentValues.length; // Mark all remaining values as consumed
    } else if (uiType === UiComponentType.Ellipsis) {
      // --- Handle Ellipsis (Nested Settings) ---
      label.textContent = labelText;
      if (arg.nestedSchema) {
        inputsContainer.appendChild(
          createEllipsisDropdown(arg, currentSettingsInstance)
        );
      } else {
        console.warn(
          `Ellipsis UI specified for arg "${arg.name}" but no nestedSchema provided.`
        );
        const errorSpan = document.createElement("span");
        errorSpan.textContent = "[Config Error]";
        errorSpan.classList.add("has-text-danger", "is-size-7");
        inputsContainer.appendChild(errorSpan);
      }
      // Ellipsis does NOT consume values from currentValues array
    } else {
      // --- Handle Standard Single-Value Input ---
      label.textContent = labelText;
      const currentValue =
        valueIndex < currentValues.length ? currentValues[valueIndex] : "";
      switch (arg.type) {
        case ArgType.Enum:
          inputsContainer.appendChild(
            createDropdownInput(arg.name, arg.enum || [], currentValue)
          );
          // Record for key-aware wiring
          if (arg.controlsArgName) {
            controllerValues.set(arg.name, currentValue || arg.enum?.[0] || "");
          }
          break;
        case ArgType.Number:
          inputsContainer.appendChild(
            createNumberInput(arg.name, currentValue)
          );
          break;
        case ArgType.Boolean:
          inputsContainer.appendChild(
            createDropdownInput(
              arg.name,
              ["true", "false"],
              currentValue || "false"
            )
          );
          break;
        default: // ArgType.String or unspecified defaults to text
          inputsContainer.appendChild(
            createTextInput(arg.name, currentValue, arg.example)
          );
          break;
      }
      // Increment valueIndex ONLY after consuming a value for a standard argument
      valueIndex++;
    }

    argsInnerContainer.appendChild(argWrapper);
  });
  container.appendChild(argsInnerContainer);

  // --- Post-build: wire controlsArgName relationships ---
  wireControllerArgs(argsInnerContainer, schemaArgs);
}

/**
 * Wires dynamic UI interactions declared via `controlsArgName` in the schema.
 * - Checkbox → toggles `.is-advanced-btn` visibility in the controlled arg.
 * - Enum dropdown → rebuilds the controlled toggle-button selector with the right key type.
 */
function wireControllerArgs(
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
      // Checkbox shows/hides advanced buttons and deactivates hidden ones on hide
      const cb = controllerInputs.querySelector<HTMLInputElement>("input[type='checkbox']");
      if (!cb) return;
      cb.addEventListener("change", () => {
        const advBtns = controlledInputs.querySelectorAll<HTMLElement>(".is-advanced-btn");
        advBtns.forEach(btn => {
          btn.style.display = cb.checked ? "" : "none";
          if (!cb.checked) btn.classList.remove("is-active", "is-info");
        });
      });
    } else if (arg.type === ArgType.Enum) {
      // Key dropdown rebuilds the toggle buttons preserving selection, respecting advanced state
      const select = controllerInputs.querySelector<HTMLSelectElement>("select");
      if (!select) return;
      select.addEventListener("change", () => {
        const currentSelection = Array.from(
          controlledInputs.querySelectorAll<HTMLButtonElement>(".numeral-toggle-btn.is-active")
        ).map(btn => btn.dataset.value ?? "").filter(v => v);

        // Find the advanced checkbox that also controls the same arg
        const advCb = argsInnerContainer.querySelector<HTMLInputElement>(
          `input.config-feature-checkbox[data-controls-arg-name="${arg.controlsArgName}"]`
        );
        const showAdvanced = advCb?.checked ?? false;

        rebuildToggleButtons(controlledInputs, controlledArg, currentSelection, select.value, showAdvanced);
      });
    }
  });
}
