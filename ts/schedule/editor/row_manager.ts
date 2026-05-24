import {
  GroupRowData,
  IntervalRowData, // Import IntervalRowData
  GroupDataJSON,
  IntervalDataJSON,
  ScheduleRowJSONData,
  IntervalSettings,
} from "./interval/types";
import { buildGroupRowElement } from "./interval/group_row_ui";
import { buildIntervalRowElement } from "./interval/interval_row_ui";
import { SelectionManager } from "./selection_manager";
import { applyIndentation, extractLayerListValues } from "./interval/common_ui_elements";
import { UiComponentType } from "../../feature";
import { getFeatureTypeDescriptor } from "../../feature_registry";
import { instrumentCategory } from "../../fretboard/fretboard_category";

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
    this.getInstrument = getInstrument ?? (() => "Guitar");
    this.getTuning = getTuning ?? (() => undefined);
    this._addRowCopyHandler();
  }

  /**
   * Creates the data structure for a new, empty interval row.
   * @param categoryName The name of the category for the new row.
   * @returns An IntervalRowData object or null if the category is invalid.
   */
  public createEmptyIntervalUIData(
    categoryName: string
  ): IntervalRowData | null {
    const settingsFactory = instrumentCategory.getIntervalSettingsFactory();
    if (!settingsFactory) {
      console.error(
        `Cannot create empty row data: No IntervalSettings factory found for category "${categoryName}".`
      );
      return null;
    }
    const defaultSettings: IntervalSettings = settingsFactory();

    // Create Row Data using the created default settings instance
    const newRowUIData: IntervalRowData = {
      rowType: "interval",
      duration: "3:00", // Default duration
      task: "",
      categoryName: categoryName, // Assign the category name string
      featureTypeName: "",
      featureArgsList: [],
      intervalSettings: defaultSettings, // Assign instance from factory
    };
    return newRowUIData;
  }

  /** Adds an empty interval row to the UI for a specific category */
  public addEmptyIntervalRow(
    categoryName: string,
    insertAfterElement?: HTMLElement | null
  ): HTMLElement | null {
    // Return null on failure
    // Create the data structure using the new helper method
    const newRowUIData = this.createEmptyIntervalUIData(categoryName);
    if (!newRowUIData) {
      return null; // Failed to create data (e.g., invalid category)
    }

    // Pass the category name string and data to the builder function
    const newRowElement = buildIntervalRowElement(newRowUIData, categoryName, this.getInstrument(), this.getTuning());
    this.insertRowElement(newRowElement, insertAfterElement); // Insert into DOM
    return newRowElement;
  }

  /** Adds a group row to the UI */
  public addGroupRow(
    level: number = 1,
    name: string = "",
    insertAfterElement?: HTMLElement | null
  ): HTMLElement {
    const newRowUIData: GroupRowData = {
      rowType: "group",
      level: Math.max(1, level),
      name: name || `New Group Level ${level}`,
    };
    const newRowElement = buildGroupRowElement(newRowUIData);
    this.insertRowElement(newRowElement, insertAfterElement);
    return newRowElement;
  }

  /** Inserts a row element into the container */
  public insertRowElement(
    newRowElement: HTMLElement,
    insertAfterElement?: HTMLElement | null
  ): void {
    let effectiveInsertAfter = insertAfterElement;
    if (!effectiveInsertAfter) {
      effectiveInsertAfter =
        this.selectionManager.getLastSelectedElementInDomOrder();
    }
    if (
      effectiveInsertAfter &&
      effectiveInsertAfter.parentNode === this.configEntriesContainerEl
    ) {
      this.configEntriesContainerEl.insertBefore(
        newRowElement,
        effectiveInsertAfter.nextSibling
      );
    } else {
      this.configEntriesContainerEl.appendChild(newRowElement);
    }
    this.updateAllRowIndentation();
  }

  /** Deletes all currently selected rows */
  public deleteSelectedRows(): void {
    const selectedRows = this.selectionManager.getSelectedElementsInDomOrder();
    if (selectedRows.length === 0) return;
    selectedRows.forEach((row) => row.remove());
    this.selectionManager.clearSelection();
    this.updateAllRowIndentation();
  }

  /** Recalculates and applies indentation to all rows */
  public updateAllRowIndentation(): void {
    const rows = Array.from(
      this.configEntriesContainerEl.querySelectorAll<HTMLElement>(
        ".schedule-row"
      )
    );
    const levelStack: number[] = [0];
    rows.forEach((row) => {
      const rowType = row.dataset.rowType;
      let currentIndentLevel = levelStack[levelStack.length - 1];
      if (rowType === "group") {
        const groupLevel = parseInt(row.dataset.level || "1", 10);
        while (
          levelStack.length > 1 &&
          levelStack[levelStack.length - 1] >= groupLevel
        ) {
          levelStack.pop();
        }
        currentIndentLevel = levelStack[levelStack.length - 1];
        applyIndentation(row, currentIndentLevel);
        levelStack.push(groupLevel);
      } else {
        applyIndentation(row, currentIndentLevel);
      }
    });
  }

  /**
   * Extracts data from a single row element into a JSON-compatible structure.
   * Includes the categoryName string for interval rows.
   * Correctly extracts variadic arguments like toggle button selections.
   * @param rowElement - The HTML element for the schedule row (.schedule-row).
   * @returns {ScheduleRowJSONData | null} Plain data object or null if extraction fails.
   */
  public getRowData(rowElement: HTMLElement): ScheduleRowJSONData | null {
    const rowType = rowElement.dataset.rowType;
    try {
      if (rowType === "group") {
        // --- Group Row Data Extraction (Unchanged) ---
        const level = parseInt(rowElement.dataset.level || "1", 10);
        const nameInput = rowElement.querySelector(
          ".group-name-input"
        ) as HTMLInputElement | null;
        const name = nameInput?.value.trim() || "";
        return { rowType: "group", level, name };
      } else if (rowType === "interval") {
        // --- Interval Row Data Extraction ---
        const durationInput = rowElement.querySelector(
          ".config-duration"
        ) as HTMLInputElement | null;
        const taskInput = rowElement.querySelector(
          ".config-task"
        ) as HTMLInputElement | null;
        const featureTypeSelect = rowElement.querySelector(
          ".config-feature-type"
        ) as HTMLSelectElement | null;

        const categoryName = rowElement.dataset.categoryName;
        if (!categoryName) {
          console.error(
            "Failed to get row data: Interval row missing 'data-category-name'.",
            rowElement
          );
          return null;
        }

        const duration = durationInput?.value.trim() || "0:00";
        const task = taskInput?.value.trim() || "";
        const featureTypeName = featureTypeSelect?.value.trim() || "";

        // Get Settings Instance & Serialize
        const intervalSettingsInstance =
          ((rowElement as any)._intervalSettings as IntervalSettings) ?? null;
        const intervalSettingsJSON = intervalSettingsInstance?.toJSON();

        // --- Extract Feature Arguments ---
        const featureArgsList: string[] = [];
        const argsContainer = rowElement.querySelector(
          ".config-feature-args-container .feature-args-inner-container"
        );

        if (argsContainer && featureTypeName) {
          // Only extract args if a feature is selected
          const descriptor = getFeatureTypeDescriptor(
            categoryName,
            featureTypeName
          );
          const schema = descriptor?.getConfigurationSchema();

          if (
            typeof schema === "object" &&
            "args" in schema &&
            Array.isArray(schema.args)
          ) {
            const schemaArgs = schema.args;
            let schemaArgIndex = 0; // Track position in schema

            const argWrappers = argsContainer.querySelectorAll<HTMLElement>(
              ":scope > .feature-arg-wrapper"
            );

            argWrappers.forEach((wrapper) => {
              const currentSchemaArg = schemaArgs[schemaArgIndex];
              if (!currentSchemaArg) {
                console.warn(
                  "More arg wrappers found in UI than in schema for",
                  featureTypeName
                );
                return;
              }

              const inputsContainer = wrapper.querySelector<HTMLElement>(
                ".feature-arg-inputs-container"
              );
              if (!inputsContainer) return;

              const uiType = inputsContainer.dataset.uiComponentType;
              const isVariadic = currentSchemaArg.isVariadic; // Check schema, not just dataset

              if (uiType === UiComponentType.LayerList) {
                // **** Layer List Logic ****
                const layerValues = extractLayerListValues(inputsContainer);
                featureArgsList.push(...layerValues);
                schemaArgIndex = schemaArgs.length; // consumes all remaining schema args
              } else if (uiType === UiComponentType.ToggleButtonSelector) {
                // **** START: Toggle Button Logic ****
                const activeButtons =
                  inputsContainer.querySelectorAll<HTMLButtonElement>(
                    ".numeral-toggle-btn.is-active"
                  );
                const selectedValues = Array.from(activeButtons)
                  .map((btn) => btn.dataset.value || "")
                  .filter((v) => v);
                featureArgsList.push(...selectedValues);
                // Toggle button consumes all remaining args if variadic
                if (isVariadic) schemaArgIndex = schemaArgs.length;
                // **** END: Toggle Button Logic ****
              } else if (uiType === UiComponentType.Checkbox) {
                // UI-only control — never serialized into featureArgsList
                schemaArgIndex++;
              } else if (uiType === UiComponentType.Ellipsis) {
                // Settings handled by intervalSettingsJSON, consume schema arg
                schemaArgIndex++;
              } else if (isVariadic) {
                // **** START: General Variadic Logic ****
                const variadicInputs = inputsContainer.querySelectorAll<
                  HTMLInputElement | HTMLSelectElement
                >(".config-feature-arg, .select > select");
                variadicInputs.forEach((input) => {
                  // Add value only if it's not empty/whitespace
                  const value = input.value?.trim();
                  if (value) {
                    featureArgsList.push(value);
                  }
                });
                // Variadic argument consumes the rest of the schema (usually only one variadic arg)
                schemaArgIndex = schemaArgs.length;
                // **** END: General Variadic Logic ****
              } else {
                // **** START: Standard Single Argument Logic ****
                const inputElement = inputsContainer.querySelector<
                  HTMLInputElement | HTMLSelectElement
                >(".config-feature-arg, .select > select");
                featureArgsList.push(inputElement?.value?.trim() ?? "");
                schemaArgIndex++;
                // **** END: Standard Single Argument Logic ****
              }
            });
          } else {
            // Handle cases where schema is just a string or feature has no args
            console.log(
              `Feature '${featureTypeName}' has no structured args or schema is a string.`
            );
          }
        } else if (!featureTypeName) {
          // No feature selected, args list should be empty
        } else {
          console.warn(
            `Args container not found for interval row:`,
            rowElement
          );
        }

        const intervalData: IntervalDataJSON = {
          rowType: "interval",
          duration,
          task,
          categoryName,
          featureTypeName,
          featureArgsList, // Use the extracted list
        };
        // Add settings only if they are not default (toJSON returns undefined if default)
        if (intervalSettingsJSON) {
          intervalData.intervalSettings = intervalSettingsJSON;
        }
        return intervalData;
      } else {
        console.warn(
          "Unknown row type found during getRowData:",
          rowType,
          rowElement
        );
        return null;
      }
    } catch (error) {
      console.error("Error getting data for row:", rowElement, error);
      return null;
    }
  }

  /** Attaches event listener for row copy buttons */
  private _addRowCopyHandler(): void {
    this.configEntriesContainerEl.addEventListener("click", (e) => {
      const targetElement = e.target as HTMLElement;
      const copyButton = targetElement.closest(".copy-row-btn");
      if (copyButton) {
        e.stopPropagation();
        const rowToCopy = targetElement.closest<HTMLElement>(".schedule-row");
        if (rowToCopy) {
          // Select the row visually for feedback
          this.selectionManager.selectSingleRow(rowToCopy);
          // Flash effect
          rowToCopy.style.transition = "background-color 0.1s ease-out";
          rowToCopy.style.backgroundColor = "rgba(72, 199, 116, 0.3)";
          setTimeout(() => {
            rowToCopy.style.backgroundColor = "";
            rowToCopy.style.transition = "";
          }, 250);
          // ClipboardManager will handle the actual data copy via SelectionManager
        }
      }
    });
  }

}
