// ts/schedule/editor/interval/common_ui_elements.ts
import { ConfigurationSchemaArg, ArgType } from "../../../feature";
import { IntervalSettings } from "./types";

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
