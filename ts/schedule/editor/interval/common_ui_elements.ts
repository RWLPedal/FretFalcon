// ts/schedule/editor/interval/common_ui_elements.ts
import { ConfigurationSchemaArg, ArgType } from "../../../feature";
import { IntervalSettings } from "./types";
import { LayerType } from "../../../fretboard/features/layer_types";

// --- Generic UI Element Creation Functions ---

export function createCell(...classes: string[]): HTMLDivElement {
  const div = document.createElement("div");
  div.classList.add("config-cell", ...classes);
  return div;
}

export function createCellWithInput(
  type: string,
  value: string,
  placeholder: string,
  inputClasses: string[]
): HTMLDivElement {
  const cellDiv = createCell(
    ...inputClasses.map((c) => c.replace("config-", "") + "-cell")
  );
  const input = document.createElement("input");
  input.type = type;
  input.placeholder = placeholder;
  input.value = value;
  input.classList.add("input", "is-small", ...inputClasses);
  cellDiv.appendChild(input);
  return cellDiv;
}

export function createTextInput(
  name: string,
  value?: string,
  placeholder?: string
): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.classList.add("input", "is-small", "config-feature-arg");
  input.placeholder = placeholder || name;
  input.value = value ?? "";
  input.name = name; // Set name attribute for potential form use or identification
  return input;
}

export function createNumberInput(
  name: string,
  value?: string,
  placeholder?: string
): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "number";
  input.classList.add("input", "is-small", "config-feature-arg");
  input.placeholder = placeholder || name;
  input.value = value ?? "";
  input.name = name; // Set name attribute
  return input;
}

export function createDropdownInput(
  name: string,
  options: string[],
  selectedValue?: string
): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.classList.add("select", "is-small", "is-fullwidth");
  const select = document.createElement("select");
  select.classList.add("config-feature-arg"); // Keep class for potential selection
  select.name = name; // Set name attribute
  options.forEach((optionValue) => {
    const option = new Option(optionValue, optionValue);
    if (optionValue === selectedValue) option.selected = true;
    select.appendChild(option);
  });
  wrapper.appendChild(select);
  return wrapper;
}

/** Creates the toggle button UI for selecting multiple discrete options.
 *  Supports key-aware button sets (major/minor) and advanced (7th chord) buttons
 *  that are hidden by default and revealed by an "Advanced" checkbox. */
export function createToggleButtonInput(
  container: HTMLElement,
  arg: ConfigurationSchemaArg,
  initialSelection: string[], // Array of initially selected values
  keyType: string = "Major",
  showAdvanced: boolean = false
): void {
    container.style.display = "flex";
    container.style.flexWrap = "wrap";
    container.style.gap = "3px";
    container.style.width = "100%";
    const selectionSet = new Set(initialSelection);

    const data = arg.uiComponentData ?? {};
    const basicLabels: string[] =
        keyType === "Minor" && data.minorButtonLabels
            ? data.minorButtonLabels
            : (data.buttonLabels ?? []);
    const advancedLabels: string[] =
        keyType === "Minor" && data.minorAdvancedButtonLabels
            ? data.minorAdvancedButtonLabels
            : (data.advancedButtonLabels ?? []);

    if (basicLabels.length === 0 && advancedLabels.length === 0) {
        console.warn(`ToggleButtonInput: No buttonLabels provided for arg "${arg.name}".`);
        container.textContent = "[No options configured]";
        return;
    }

    const makeButton = (label: string, isAdvanced: boolean): void => {
        const button = document.createElement("button");
        button.type = "button";
        button.classList.add("button", "is-small", "is-outlined", "numeral-toggle-btn");
        button.textContent = label;
        button.dataset.value = label;
        button.title = `Toggle ${label}`;

        if (isAdvanced) {
            button.classList.add("is-advanced-btn");
            if (!showAdvanced) button.style.display = "none";
        }
        if (selectionSet.has(label)) {
            button.classList.add("is-active", "is-info");
        }
        button.onclick = () => {
            button.classList.toggle("is-active");
            button.classList.toggle("is-info");
        };
        container.appendChild(button);
    };

    basicLabels.forEach(label => makeButton(label, false));
    advancedLabels.forEach(label => makeButton(label, true));
}

/** Clears and rebuilds toggle buttons inside `container` with the given key type and advanced state. */
export function rebuildToggleButtons(
  container: HTMLElement,
  arg: ConfigurationSchemaArg,
  selectedValues: string[],
  keyType: string,
  showAdvanced: boolean
): void {
    container.innerHTML = "";
    createToggleButtonInput(container, arg, selectedValues, keyType, showAdvanced);
}

/** Creates the ellipsis dropdown UI for nested settings */
export function createEllipsisDropdown(
  arg: ConfigurationSchemaArg,
  // Expect the generic IntervalSettings instance
  currentSettingsInstance: IntervalSettings
): HTMLElement {
    if (!arg.nestedSchema) {
        console.warn(`EllipsisDropdown: No nestedSchema provided for arg "${arg.name}".`);
        const p = document.createElement("span");
        p.textContent = "[No nested settings]";
        p.classList.add("has-text-grey-light", "is-italic", "is-size-7");
        return p;
    }

    const dropdownDiv = document.createElement("div");
    dropdownDiv.classList.add("dropdown", "config-ellipsis-dropdown");

    const triggerDiv = document.createElement("div");
    triggerDiv.classList.add("dropdown-trigger");
    const button = document.createElement("button");
    button.type = "button";
    button.classList.add("button", "is-small", "is-outlined", "config-ellipsis-button");
    button.setAttribute("aria-haspopup", "true");
    const uniqueId = `dropdown-menu-${arg.name.replace(/\s+/g, "-")}-${Math.random().toString(36).substring(2, 7)}`;
    button.setAttribute("aria-controls", uniqueId);
    button.innerHTML = "<span>...</span>";
    button.title = arg.description || "Advanced Settings";
    triggerDiv.appendChild(button);
    dropdownDiv.appendChild(triggerDiv);

    const menuDiv = document.createElement("div");
    menuDiv.classList.add("dropdown-menu");
    menuDiv.id = uniqueId;
    menuDiv.setAttribute("role", "menu");
    dropdownDiv.appendChild(menuDiv);

    const contentDiv = document.createElement("div");
    contentDiv.classList.add("dropdown-content");
    contentDiv.style.padding = "10px";
    contentDiv.style.minWidth = "200px";
    menuDiv.appendChild(contentDiv);

    // --- Dropdown Toggle Logic ---
    const toggleDropdown = (event?: MouseEvent) => {
        event?.stopPropagation();
        const isActive = dropdownDiv.classList.toggle("is-active");
        if (isActive) {
            // Populate content only when opening, pass the generic settings instance
            populateEllipsisDropdownContent(contentDiv, arg.nestedSchema!, currentSettingsInstance); // Pass generic instance
            document.addEventListener("click", handleClickOutside, true);
        } else {
            document.removeEventListener("click", handleClickOutside, true);
        }
    };
    const handleClickOutside = (event: MouseEvent) => {
        if (!dropdownDiv.contains(event.target as Node)) {
            dropdownDiv.classList.remove("is-active");
            document.removeEventListener("click", handleClickOutside, true);
        }
    };
    button.addEventListener("click", toggleDropdown);
    // --- End Dropdown Logic ---

    return dropdownDiv;
}


/** Populates the content of an ellipsis dropdown based on nested schema */
export function populateEllipsisDropdownContent(
  contentContainer: HTMLElement,
  nestedSchema: ConfigurationSchemaArg[],
  // Expect the generic IntervalSettings instance
  settingsInstance: IntervalSettings
): void {
    contentContainer.innerHTML = ""; // Clear previous content

    nestedSchema.forEach((nestedArg) => {
        const fieldDiv = document.createElement("div"); fieldDiv.classList.add("field");
        const label = document.createElement("label"); label.classList.add("label", "is-small");
        label.textContent = nestedArg.name.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
        label.title = nestedArg.description || "";
        fieldDiv.appendChild(label);
        const controlDiv = document.createElement("div"); controlDiv.classList.add("control");

        // Access properties using index signature on the generic type.
        const currentValue = (settingsInstance as any)[nestedArg.name];
        const currentValueStr = (currentValue !== undefined && currentValue !== null) ? String(currentValue) : "";

        let inputElement: HTMLElement | null = null;

        // Create appropriate input based on nested schema type
        // This logic is already generic
        if (nestedArg.enum) {
             inputElement = createDropdownInput(nestedArg.name, nestedArg.enum, currentValueStr);
        } else if (nestedArg.type === ArgType.Number) {
             inputElement = createNumberInput(nestedArg.name, currentValueStr, nestedArg.description);
        } else if (nestedArg.type === ArgType.Boolean) {
             inputElement = createDropdownInput(nestedArg.name, ["true", "false"], currentValueStr || "false");
        } else { // Default to string/text input
             inputElement = createTextInput(nestedArg.name, currentValueStr, nestedArg.description);
        }

        if (inputElement) {
            const inputField = (inputElement.tagName === "DIV") ? inputElement.querySelector("select, input") : inputElement;
            if (inputField) {
                // Add event listener to update the settings INSTANCE directly on change
                inputField.addEventListener("change", (e) => {
                    const target = e.target as HTMLInputElement | HTMLSelectElement;
                    let newValue: string | number | boolean = target.value;
                    // Convert value type based on schema
                    if (nestedArg.type === ArgType.Number) { newValue = parseInt(target.value, 10); if (isNaN(newValue)) newValue = 0; }
                    else if (nestedArg.type === ArgType.Boolean) { newValue = target.value === "true"; }
                    // Update the INSTANCE directly using the nestedArg name as key
                    (settingsInstance as any)[nestedArg.name] = newValue;
                    console.log(`Updated setting '${nestedArg.name}' to:`, newValue, settingsInstance); // Log generic instance
                });
            }
            controlDiv.appendChild(inputElement);
        }
        fieldDiv.appendChild(controlDiv);
        contentContainer.appendChild(fieldDiv);
    });
}

/** Creates a variadic input element wrapper allowing adding/removing inputs. */
export function createVariadicInputElement(
  arg: ConfigurationSchemaArg,
  container: HTMLElement,
  currentValues?: string[]
): void {
    // Container for the vertical group of inputs
    const variadicGroupContainer = document.createElement("div");
    variadicGroupContainer.classList.add("variadic-group-container");
    variadicGroupContainer.style.display = "flex";
    variadicGroupContainer.style.flexDirection = "column";
    variadicGroupContainer.style.gap = "3px"; // Space between input rows
    variadicGroupContainer.style.width = "100%"; // Take available width

    /** --- Inner function to add a single input row --- */
    const addInputRow = (value?: string) => {
        const inputWrapper = document.createElement("div");
        inputWrapper.classList.add("variadic-input-wrapper"); // Used for styling/grouping
        inputWrapper.style.display = "flex";
        inputWrapper.style.alignItems = "center";
        inputWrapper.style.gap = "5px";

        let inputElement: HTMLElement | null = null;
        // Create appropriate input based on schema (handles enum within variadic now)
        if (arg.enum) {
             inputElement = createDropdownInput(arg.name, arg.enum, value);
        } else if (arg.type === ArgType.Number) {
            inputElement = createNumberInput(arg.name, value);
        } else { // Default to text
            inputElement = createTextInput(arg.name, value, arg.example);
        }

        if (inputElement) {
            inputElement.style.flexGrow = "1"; // Allow input/select to take space
            // Adjust width for select wrapper to accommodate button
            if (inputElement.tagName === 'DIV' && inputElement.classList.contains('select')) {
                inputElement.style.width = 'calc(100% - 35px)'; // Heuristic width adjustment
            }
            inputWrapper.appendChild(inputElement);

            // --- Add "[-]" Remove Button ---
            const removeButton = document.createElement("button");
            removeButton.type = "button";
            removeButton.classList.add("button", "is-small", "is-danger", "is-outlined", "remove-variadic-arg-btn");
            removeButton.innerHTML = "&minus;"; // Use minus symbol (or icon font)
            removeButton.title = `Remove ${arg.name}`;
            removeButton.style.flexShrink = "0"; // Prevent button from shrinking
            removeButton.onclick = () => {
                inputWrapper.remove();
                // Optional: Disable remove button if only one input remains?
            };
            inputWrapper.appendChild(removeButton);

            variadicGroupContainer.appendChild(inputWrapper); // Add the row to the container
        }
    };
    /** --- End inner function --- */

    // Add initial input rows based on currentValues
    if (currentValues && currentValues.length > 0) {
        currentValues.forEach(val => addInputRow(val));
    } else {
        addInputRow(); // Add at least one empty input row initially
    }

    container.appendChild(variadicGroupContainer); // Add the group of inputs

    // --- Add "[+]" Add More Button ---
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.classList.add("button", "is-small", "is-outlined", "is-info", "add-variadic-btn"); // Use distinct class

    let buttonTextName = arg.name;
    // Simple heuristic to singularize for button text
    if (buttonTextName.endsWith('es')) {
        buttonTextName = buttonTextName.slice(0, -2);
    } else if (buttonTextName.endsWith('s') && buttonTextName.length > 1) { // Avoid making 's' an empty string
        buttonTextName = buttonTextName.slice(0, -1);
    }
    addButton.textContent = `+ ${buttonTextName}`; // Use potentially singularized name

    addButton.title = `Add another ${arg.name}`;
    addButton.style.marginTop = "5px";
    addButton.style.alignSelf = 'flex-start'; // Align button left
    addButton.onclick = () => {
        addInputRow(); // Add a new empty input row to the group
    };
    container.appendChild(addButton); // Add below the group of inputs
}


export function createDragHandleCell(): HTMLDivElement {
  const cellDiv = createCell("drag-handle-cell");
  cellDiv.draggable = true; // Make the handle draggable
  cellDiv.style.cursor = "grab";
  cellDiv.style.padding = "0 5px"; // Adjust padding as needed
  cellDiv.innerHTML = "&#x2630;"; // Hamburger icon
  cellDiv.title = "Drag to reorder";
  // Style to vertically center the icon
  cellDiv.style.display = "flex";
  cellDiv.style.alignItems = "center";
  cellDiv.style.justifyContent = "center";
  cellDiv.style.color = "var(--clr-text-subtle)"; // Use subtle color
  return cellDiv;
}

export function createCopyButtonCell(): HTMLButtonElement {
  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.classList.add(
    "button",
    "is-small",
    "is-info", // Or another suitable color
    "is-outlined",
    "copy-row-btn" // Specific class for targeting
  );
  // Use a copy icon (e.g., Unicode or an icon font)
  copyButton.innerHTML = "&#x2398;"; // Example: Document icon (can change)
  copyButton.title = "Copy Row";
  return copyButton;
}

export function createRemoveButtonElement(rowElement: HTMLElement): HTMLButtonElement {
  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.classList.add(
    "button",
    "is-small",
    "is-danger",
    "is-outlined",
    "remove-row-btn" // Specific class
  );
  removeButton.innerHTML = "&#10005;"; // Cross symbol (or icon font)
  removeButton.title = "Remove Row";
  removeButton.onclick = (e) => {
    e.stopPropagation(); // Prevent row selection when clicking button
    rowElement.remove();
    // Optionally, dispatch a custom event to notify RowManager or Editor about the deletion
    // rowElement.dispatchEvent(new CustomEvent('row-removed', { bubbles: true }));
  };
  return removeButton;
}

/** Applies indentation style based on level */
export function applyIndentation(element: HTMLElement, level: number): void {
  const indentSize = 15; // Pixels per level
  // Group levels start at 1, but visual indent starts from level 0 (no indent)
  // Indent level 1 group like a level 0 item, level 2 like level 1 item, etc.
  // Interval rows under a level N group get indent level N.
  const effectiveLevel = Math.max(0, level); // Ensure non-negative level
  element.style.marginLeft = `${effectiveLevel * indentSize}px`;
  // Maybe add padding instead of margin if it interacts better with borders/backgrounds
  // element.style.paddingLeft = `${effectiveLevel * indentSize}px`;
}

/** Clears all child elements from a given HTML element */
export function clearAllChildren(element: HTMLElement): void {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

// --- Layer List UI (for MultiLayerFretboard feature) ---

interface ChordEntry { key: string; label: string; }

/** Data passed via arg.uiComponentData for the layer_list component */
interface LayerListComponentData {
  scaleNames?: string[];
  rootNoteOptions?: string[];
  chordEntries?: ChordEntry[];
  noteNames?: string[];
}

type UiLayerType = Exclude<LayerType, LayerType.Caged>;

const LAYER_TYPE_LABELS: Record<UiLayerType, string> = {
  [LayerType.Scale]: "Scale",
  [LayerType.Chord]: "Chord Tones",
  [LayerType.Notes]: "Notes",
};

const LAYER_DEFAULT_COLOR_VARS: Record<UiLayerType, string> = {
  [LayerType.Scale]: 'var(--dm-palette-3)',
  [LayerType.Chord]: 'var(--dm-palette-2)',
  [LayerType.Notes]: 'var(--dm-palette-1)',
};

const PALETTE_VARS = [
  'var(--dm-palette-1)',
  'var(--dm-palette-2)',
  'var(--dm-palette-3)',
  'var(--dm-palette-4)',
  'var(--dm-palette-5)',
  'var(--dm-palette-6)',
  'var(--dm-palette-7)',
];

function getDefaultLayerColor(type: UiLayerType): string {
  return LAYER_DEFAULT_COLOR_VARS[type];
}

function createPaletteColorPicker(initialColor: string, role: 'fill' | 'stroke', onChange?: () => void): HTMLElement {
  // Apply a role-aware visual style: fill = solid background, stroke = inset ring.
  function applyColorStyle(el: HTMLElement, colorVar: string): void {
    if (colorVar === 'none') {
      el.style.background = '';
      el.style.boxShadow = '';
      el.classList.add("swatch-none");
    } else if (role === 'stroke') {
      el.style.background = 'transparent';
      el.style.boxShadow = `inset 0 0 0 2.5px ${colorVar}`;
      el.classList.remove("swatch-none");
    } else {
      el.style.background = colorVar;
      el.style.boxShadow = '';
      el.classList.remove("swatch-none");
    }
  }

  const wrap = document.createElement("div");
  wrap.classList.add("layer-palette-picker-wrap");

  const btn = document.createElement("button");
  btn.type = "button";
  btn.classList.add("layer-palette-btn");
  btn.title = role === 'fill' ? "Fill color" : "Stroke color";
  btn.dataset.colorVar = initialColor;
  btn.dataset.pickerRole = role;

  const preview = document.createElement("span");
  preview.classList.add("layer-palette-swatch-preview");
  applyColorStyle(preview, initialColor);
  btn.appendChild(preview);
  wrap.appendChild(btn);

  // Popover is portalled into body so it can't be clipped by parent overflow or
  // buried under canvas stacking contexts.
  const popover = document.createElement("div");
  popover.classList.add("layer-palette-popover");
  popover.hidden = true;
  document.body.appendChild(popover);

  function addSwatch(varStr: string, isNone: boolean): void {
    const paletteBtn = document.createElement("button");
    paletteBtn.type = "button";
    paletteBtn.classList.add("palette-swatch");
    paletteBtn.dataset.var = varStr;
    if (isNone) {
      paletteBtn.classList.add("palette-swatch-none");
      paletteBtn.title = "None (transparent)";
    } else {
      applyColorStyle(paletteBtn, varStr);
      paletteBtn.title = varStr;
    }
    if (varStr === initialColor) paletteBtn.classList.add("is-active");
    paletteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      btn.dataset.colorVar = varStr;
      applyColorStyle(preview, varStr);
      popover.querySelectorAll<HTMLElement>(".palette-swatch").forEach(s =>
        s.classList.toggle("is-active", s.dataset.var === varStr)
      );
      popover.hidden = true;
      onChange?.();
    });
    popover.appendChild(paletteBtn);
  }

  addSwatch('none', true);
  PALETTE_VARS.forEach((varStr) => addSwatch(varStr, false));

  function openPopover(): void {
    // Close any other open palette popovers
    document.querySelectorAll<HTMLElement>(".layer-palette-popover:not([hidden])").forEach(p => {
      if (p !== popover) p.hidden = true;
    });
    // Position below the button using fixed coords
    const rect = btn.getBoundingClientRect();
    popover.style.position = "fixed";
    popover.style.top = `${rect.bottom + 4}px`;
    popover.style.left = `${rect.left + rect.width / 2}px`;
    popover.style.transform = "translateX(-50%)";
    popover.hidden = false;
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!popover.hidden) {
      popover.hidden = true;
    } else {
      openPopover();
    }
  });

  document.addEventListener("click", () => { popover.hidden = true; });

  // Clean up body-appended popover when the wrap is removed from the DOM
  new MutationObserver(() => {
    if (!wrap.isConnected) {
      popover.remove();
    }
  }).observe(document.body, { childList: true, subtree: true });

  // Expose a setter so the layer type change handler can reset the color
  (wrap as any)._setColor = (color: string) => {
    btn.dataset.colorVar = color;
    applyColorStyle(preview, color);
    popover.querySelectorAll<HTMLElement>(".palette-swatch").forEach(s =>
      s.classList.toggle("is-active", s.dataset.var === color)
    );
  };

  return wrap;
}

/** Parses a layer encoded string back into its parts for pre-populating the UI */
function parseLayerStringForUI(
  layerStr: string
): { type: LayerType; fields: string[]; fillColor: string; strokeColor: string } | null {
  const parts = layerStr.split("|");
  if (parts.length < 2) return null;
  const type = parts[0] as LayerType;
  if (parts.length < 3) return null;
  if (type === "scale" && parts.length >= 4) {
    // scale|scaleName|rootNote|fillColor[|strokeColor]
    return { type, fields: [parts[1], parts[2]], fillColor: parts[3], strokeColor: parts[4] ?? 'none' };
  } else if (type === "chord" && parts.length >= 3) {
    // chord|chordKey|fillColor[|strokeColor]
    return { type, fields: [parts[1]], fillColor: parts[2], strokeColor: parts[3] ?? 'none' };
  } else if (type === "notes" && parts.length >= 3) {
    // notes|noteNames|fillColor[|strokeColor]
    return { type, fields: [parts[1]], fillColor: parts[2], strokeColor: parts[3] ?? 'none' };
  }
  return null;
}

/** Builds the dynamic-fields section for a layer row based on layer type */
function buildLayerFields(
  fieldsContainer: HTMLElement,
  layerType: LayerType,
  data: LayerListComponentData,
  initialFields: string[],
  onChange?: () => void
): void {
  fieldsContainer.innerHTML = "";

  if (layerType === "scale") {
    // Scale name dropdown — value may be "driven" when restored from a linked save
    const scaleNames = data.scaleNames ?? [];
    const scaleWrapper = document.createElement("div");
    scaleWrapper.classList.add("select", "is-small", "is-fullwidth");
    scaleWrapper.style.flex = "1";
    scaleWrapper.style.minWidth = "0";
    scaleWrapper.style.maxWidth = "200px";
    const scaleSelect = document.createElement("select");
    scaleSelect.dataset.field = "scaleName";
    const isDrivenScaleName = initialFields[0] === "driven" || initialFields[0] === "driven_next";
    if (isDrivenScaleName) {
      const drivenOpt = document.createElement("option");
      drivenOpt.value = initialFields[0];
      drivenOpt.text = initialFields[0] === "driven_next" ? "⟳ Driven (Next)" : "⟳ Driven";
      drivenOpt.style.fontStyle = "italic";
      scaleSelect.appendChild(drivenOpt);
    }
    scaleNames.forEach((name) => {
      const opt = new Option(name, name);
      if (name === (initialFields[0] ?? "") && !isDrivenScaleName) opt.selected = true;
      scaleSelect.appendChild(opt);
    });
    if (isDrivenScaleName) scaleSelect.value = initialFields[0];
    scaleSelect.addEventListener("change", () => onChange?.());
    scaleWrapper.appendChild(scaleSelect);
    fieldsContainer.appendChild(scaleWrapper);

    // Root note dropdown — value may be "driven" / "driven_next" when restored from a linked save
    const rootNotes = data.rootNoteOptions ?? [];
    const rootWrapper = document.createElement("div");
    rootWrapper.classList.add("select", "is-small");
    rootWrapper.style.flexShrink = "0";
    rootWrapper.style.width = "80px";
    const rootSelect = document.createElement("select");
    rootSelect.dataset.field = "rootNote";
    const isDrivenRootNote = initialFields[1] === "driven" || initialFields[1] === "driven_next";
    if (isDrivenRootNote) {
      const drivenOpt = document.createElement("option");
      drivenOpt.value = initialFields[1];
      drivenOpt.text = initialFields[1] === "driven_next" ? "⟳ Driven (Next)" : "⟳ Driven";
      drivenOpt.style.fontStyle = "italic";
      rootSelect.appendChild(drivenOpt);
    }
    rootNotes.forEach((note) => {
      const opt = new Option(note, note);
      if (note === (initialFields[1] ?? "") && !isDrivenRootNote) opt.selected = true;
      rootSelect.appendChild(opt);
    });
    if (isDrivenRootNote) rootSelect.value = initialFields[1];
    rootSelect.addEventListener("change", () => onChange?.());
    rootWrapper.appendChild(rootSelect);
    fieldsContainer.appendChild(rootWrapper);

  } else if (layerType === "chord") {
    // Chord key dropdown — value may be "driven" / "driven_next" when restored from a linked save
    const entries = data.chordEntries ?? [];
    const chordWrapper = document.createElement("div");
    chordWrapper.classList.add("select", "is-small", "is-fullwidth");
    chordWrapper.style.flex = "1";
    chordWrapper.style.minWidth = "0";
    chordWrapper.style.maxWidth = "200px";
    const chordSelect = document.createElement("select");
    chordSelect.dataset.field = "chordKey";
    const isDrivenChordKey = initialFields[0] === "driven" || initialFields[0] === "driven_next";
    if (isDrivenChordKey) {
      const drivenOpt = document.createElement("option");
      drivenOpt.value = initialFields[0];
      drivenOpt.text = initialFields[0] === "driven_next" ? "⟳ Driven (Next)" : "⟳ Driven";
      drivenOpt.style.fontStyle = "italic";
      chordSelect.appendChild(drivenOpt);
    }
    entries.forEach(({ key, label }) => {
      const opt = new Option(label, key);
      if (key === (initialFields[0] ?? "") && !isDrivenChordKey) opt.selected = true;
      chordSelect.appendChild(opt);
    });
    if (isDrivenChordKey) chordSelect.value = initialFields[0];
    chordSelect.addEventListener("change", () => onChange?.());
    chordWrapper.appendChild(chordSelect);
    fieldsContainer.appendChild(chordWrapper);

  } else if (layerType === "notes") {
    // Toggle buttons for individual note selection
    const noteNames = data.noteNames ?? [];
    const activeNotes = new Set(
      (initialFields[0] ?? "").split(",").map((n) => n.trim()).filter((n) => n)
    );
    const toggleContainer = document.createElement("div");
    toggleContainer.dataset.field = "noteNames";
    toggleContainer.style.display = "flex";
    toggleContainer.style.flexWrap = "wrap";
    toggleContainer.style.gap = "3px";
    toggleContainer.style.flex = "1";
    noteNames.forEach((note) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.classList.add("button", "is-small", "is-outlined", "note-layer-toggle-btn");
      btn.textContent = note;
      btn.dataset.value = note;
      btn.title = note;
      if (activeNotes.has(note)) btn.classList.add("is-active", "is-info");
      btn.onclick = () => {
        btn.classList.toggle("is-active");
        btn.classList.toggle("is-info");
        onChange?.();
      };
      toggleContainer.appendChild(btn);
    });
    fieldsContainer.appendChild(toggleContainer);
  }
}

/**
 * Creates a draggable layer list input component for the MultiLayerFretboard feature.
 * Each row encodes one layer as a pipe-delimited string.
 * @param onChange - Optional callback invoked whenever the layer list is modified.
 */
export function createLayerListInput(
  container: HTMLElement,
  arg: ConfigurationSchemaArg,
  currentValues: string[],
  onChange?: () => void
): void {
  const data: LayerListComponentData = (arg.uiComponentData as LayerListComponentData) ?? {};

  // Outer container
  const listContainer = document.createElement("div");
  listContainer.classList.add("layer-list-container");
  listContainer.style.display = "flex";
  listContainer.style.flexDirection = "row";
  listContainer.style.alignItems = "flex-start";
  listContainer.style.gap = "6px";
  listContainer.style.width = "100%";

  // Rows container (the ordered list of layer rows)
  const rowsContainer = document.createElement("div");
  rowsContainer.classList.add("layer-list-rows");
  rowsContainer.style.display = "flex";
  rowsContainer.style.flexDirection = "column";
  rowsContainer.style.gap = "4px";
  rowsContainer.style.flex = "1 1 0";
  rowsContainer.style.minWidth = "0";

  // Tracks whether an incoming link is active so new rows and type-changes get the Driven option.
  let isLinked = false;
  let isLinkedHasNextSignals = false;

  /** Adds the "⟳ Driven" (and optionally "⟳ Driven (Next)") option to all driven-eligible selects in a row, and auto-selects "⟳ Driven". */
  function applyLinkedToRow(row: HTMLElement, hasNextSignals: boolean): void {
    row.querySelectorAll<HTMLSelectElement>(
      "[data-field='rootNote'], [data-field='chordKey'], [data-field='scaleName']"
    ).forEach(select => {
      if (!select.querySelector<HTMLOptionElement>('option[value="driven"]')) {
        const opt = document.createElement("option");
        opt.value = "driven";
        opt.text = "⟳ Driven";
        opt.style.fontStyle = "italic";
        select.insertBefore(opt, select.firstChild);
      }
      if (hasNextSignals && !select.querySelector<HTMLOptionElement>('option[value="driven_next"]')) {
        const opt = document.createElement("option");
        opt.value = "driven_next";
        opt.text = "⟳ Driven (Next)";
        opt.style.fontStyle = "italic";
        const drivenOpt = select.querySelector<HTMLOptionElement>('option[value="driven"]');
        if (drivenOpt?.nextSibling) {
          select.insertBefore(opt, drivenOpt.nextSibling);
        } else {
          select.appendChild(opt);
        }
      }
      select.value = "driven";
    });
  }

  // --- Drag-and-drop state ---
  let dragSrcEl: HTMLElement | null = null;

  function attachDragHandlers(row: HTMLElement): void {
    const handle = row.querySelector<HTMLElement>(".layer-drag-handle");
    if (!handle) return;

    row.addEventListener("dragstart", (e: DragEvent) => {
      dragSrcEl = row;
      row.style.opacity = "0.4";
      e.dataTransfer?.setData("text/plain", "");
    });
    row.addEventListener("dragend", () => {
      row.style.opacity = "";
      rowsContainer
        .querySelectorAll<HTMLElement>(".layer-list-row")
        .forEach((r) => r.classList.remove("drag-over"));
    });
    row.addEventListener("dragover", (e: DragEvent) => {
      e.preventDefault();
      if (dragSrcEl && dragSrcEl !== row) {
        row.classList.add("drag-over");
      }
    });
    row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
    row.addEventListener("drop", (e: DragEvent) => {
      e.preventDefault();
      row.classList.remove("drag-over");
      if (dragSrcEl && dragSrcEl !== row) {
        const allRows = Array.from(
          rowsContainer.querySelectorAll<HTMLElement>(".layer-list-row")
        );
        const srcIdx = allRows.indexOf(dragSrcEl);
        const dstIdx = allRows.indexOf(row);
        if (srcIdx !== -1 && dstIdx !== -1) {
          if (srcIdx < dstIdx) {
            rowsContainer.insertBefore(dragSrcEl, row.nextSibling);
          } else {
            rowsContainer.insertBefore(dragSrcEl, row);
          }
          onChange?.();
        }
      }
    });
  }

  /** Builds one layer row and appends it to rowsContainer */
  function addLayerRow(layerType: LayerType, initialFields: string[], fillColor: string, strokeColor: string): void {
    const row = document.createElement("div");
    row.classList.add("layer-list-row");
    row.draggable = true;
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "5px";
    row.style.padding = "2px 4px";
    row.style.border = "1px solid var(--border)";
    row.style.borderRadius = "4px";
    row.style.background = "var(--input-bg)";

    // Drag handle
    const dragHandle = document.createElement("span");
    dragHandle.classList.add("layer-drag-handle");
    dragHandle.innerHTML = "&#x2630;";
    dragHandle.style.cursor = "grab";
    dragHandle.style.color = "var(--clr-text-subtle, #aaa)";
    dragHandle.style.flexShrink = "0";
    dragHandle.style.fontSize = "0.72rem";
    row.appendChild(dragHandle);

    // Layer type dropdown
    const typeWrapper = document.createElement("div");
    typeWrapper.classList.add("select", "is-small");
    typeWrapper.style.flexShrink = "0";
    typeWrapper.style.minWidth = "105px";
    const typeSelect = document.createElement("select");
    typeSelect.classList.add("layer-type-select");
    (Object.keys(LAYER_TYPE_LABELS) as UiLayerType[]).forEach((t) => {
      const opt = new Option(LAYER_TYPE_LABELS[t], t);
      if (t === layerType) opt.selected = true;
      typeSelect.appendChild(opt);
    });
    typeWrapper.appendChild(typeSelect);
    row.appendChild(typeWrapper);

    // Dynamic fields container
    const fieldsContainer = document.createElement("div");
    fieldsContainer.classList.add("layer-fields-container");
    fieldsContainer.style.display = "flex";
    fieldsContainer.style.gap = "4px";
    fieldsContainer.style.flexWrap = "wrap";
    fieldsContainer.style.flexGrow = "1";
    buildLayerFields(fieldsContainer, layerType, data, initialFields, onChange);
    row.appendChild(fieldsContainer);

    // Fill and stroke color pickers — visually distinguished by button style (solid vs dashed border)
    const fillColorPicker = createPaletteColorPicker(fillColor, 'fill', onChange);
    row.appendChild(fillColorPicker);

    const strokeColorPicker = createPaletteColorPicker(strokeColor, 'stroke', onChange);
    row.appendChild(strokeColorPicker);

    // Remove button
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.classList.add("layer-remove-btn");
    removeBtn.innerHTML = `<svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="1" y1="1" x2="8" y2="8"/><line x1="8" y1="1" x2="1" y2="8"/></svg>`;
    removeBtn.title = "Remove layer";
    removeBtn.onclick = () => { row.remove(); onChange?.(); };
    row.appendChild(removeBtn);

    // Re-build fields when layer type changes
    typeSelect.addEventListener("change", () => {
      const newType = typeSelect.value as UiLayerType;
      (fillColorPicker as any)._setColor?.(getDefaultLayerColor(newType));
      (strokeColorPicker as any)._setColor?.('none');
      buildLayerFields(fieldsContainer, newType, data, [], onChange);
      if (isLinked) applyLinkedToRow(row, isLinkedHasNextSignals);
      onChange?.();
    });

    attachDragHandlers(row);
    rowsContainer.appendChild(row);
  }

  // Populate from existing values
  for (const val of currentValues) {
    if (!val) continue;
    const parsed = parseLayerStringForUI(val);
    if (parsed) {
      addLayerRow(parsed.type, parsed.fields, parsed.fillColor, parsed.strokeColor);
    }
  }

  listContainer.appendChild(rowsContainer);

  // "Add Layer" button
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.classList.add("add-layer-btn");
  addBtn.innerHTML = '<span class="material-icons">add</span>';
  addBtn.onclick = () => {
    addLayerRow(LayerType.Scale, [], getDefaultLayerColor(LayerType.Scale), 'none');
    if (isLinked) {
      const lastRow = rowsContainer.lastElementChild as HTMLElement | null;
      if (lastRow) applyLinkedToRow(lastRow, isLinkedHasNextSignals);
    }
    onChange?.();
  };
  listContainer.appendChild(addBtn);

  // Expose a hook so ConfigView can add/remove the "⟳ Driven" / "⟳ Driven (Next)" options.
  // linked=true  → add options to rootNote, chordKey, scaleName selects; autoSelect=true selects "driven".
  // linked=false → remove driven options (reset to first real option if currently selected).
  (container as any)._setLinked = (linked: boolean, autoSelect: boolean, hasNextSignals = false) => {
    isLinked = linked;
    isLinkedHasNextSignals = hasNextSignals;
    let needsNotify = false;
    rowsContainer.querySelectorAll<HTMLSelectElement>("[data-field='rootNote'], [data-field='chordKey'], [data-field='scaleName']").forEach(select => {
      const existingDriven = select.querySelector<HTMLOptionElement>('option[value="driven"]');
      const existingDrivenNext = select.querySelector<HTMLOptionElement>('option[value="driven_next"]');
      if (linked) {
        if (!existingDriven) {
          const opt = document.createElement("option");
          opt.value = "driven";
          opt.text = "⟳ Driven";
          opt.style.fontStyle = "italic";
          select.insertBefore(opt, select.firstChild);
        }
        if (hasNextSignals && !existingDrivenNext) {
          const opt = document.createElement("option");
          opt.value = "driven_next";
          opt.text = "⟳ Driven (Next)";
          opt.style.fontStyle = "italic";
          const drivenOpt = select.querySelector<HTMLOptionElement>('option[value="driven"]');
          if (drivenOpt?.nextSibling) {
            select.insertBefore(opt, drivenOpt.nextSibling);
          } else {
            select.appendChild(opt);
          }
        } else if (!hasNextSignals && existingDrivenNext) {
          if (select.value === "driven_next") {
            select.value = "driven";
          }
          existingDrivenNext.remove();
        }
        if (autoSelect && select.value !== "driven" && select.value !== "driven_next") {
          select.value = "driven";
          needsNotify = true;
        }
      } else {
        if (existingDrivenNext) {
          if (select.value === "driven_next") {
            const first = select.querySelector<HTMLOptionElement>('option:not([value="driven"]):not([value="driven_next"])');
            if (first) { select.value = first.value; needsNotify = true; }
          }
          existingDrivenNext.remove();
        }
        if (existingDriven) {
          if (select.value === "driven") {
            const first = select.querySelector<HTMLOptionElement>('option:not([value="driven"]):not([value="driven_next"])');
            if (first) { select.value = first.value; needsNotify = true; }
          }
          existingDriven.remove();
        }
      }
    });
    if (needsNotify) onChange?.();
  };

  container.appendChild(listContainer);
}

/** Reads all layer rows from a layer-list container and returns encoded layer strings */
export function extractLayerListValues(container: HTMLElement): string[] {
  const results: string[] = [];
  const rows = container.querySelectorAll<HTMLElement>(".layer-list-row");
  rows.forEach((row) => {
    const type = row.querySelector<HTMLSelectElement>(".layer-type-select")?.value as LayerType | undefined;
    const fillColor = row.querySelector<HTMLElement>(".layer-palette-btn[data-picker-role='fill']")?.dataset.colorVar
      ?? row.querySelector<HTMLElement>(".layer-palette-btn")?.dataset.colorVar
      ?? 'var(--dm-palette-1)';
    const strokeColor = row.querySelector<HTMLElement>(".layer-palette-btn[data-picker-role='stroke']")?.dataset.colorVar ?? 'none';
    if (!type) return;

    let encoded = "";
    if (type === "scale") {
      const scaleName =
        row.querySelector<HTMLSelectElement>("[data-field='scaleName']")?.value ?? "";
      const rootNote =
        row.querySelector<HTMLSelectElement>("[data-field='rootNote']")?.value ?? "";
      if (scaleName && rootNote) encoded = `scale|${scaleName}|${rootNote}|${fillColor}|${strokeColor}`;
    } else if (type === "chord") {
      const chordKey =
        row.querySelector<HTMLSelectElement>("[data-field='chordKey']")?.value ?? "";
      if (chordKey) encoded = `chord|${chordKey}|${fillColor}|${strokeColor}`;
    } else if (type === "notes") {
      const activeNotes = Array.from(
        row.querySelectorAll<HTMLButtonElement>(".note-layer-toggle-btn.is-active")
      )
        .map((btn) => btn.dataset.value ?? "")
        .filter((v) => v);
      // Always emit the row (even if no notes selected) to preserve position
      encoded = `notes|${activeNotes.join(",")}|${fillColor}|${strokeColor}`;
    }
    if (encoded) results.push(encoded);
  });
  return results;
}