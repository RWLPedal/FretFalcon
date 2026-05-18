import { Schedule, Interval } from "../schedule";
import { IDisplayController } from "../../display_controller";
import { AudioController } from "../../audio_controller";
import { AppSettings } from "../../settings";
import { Feature } from "../../feature";
// Import registry functions for generic handling
import { getFeatureTypeDescriptor } from "../../feature_registry";
import { instrumentCategory } from "../../fretboard/fretboard_category";
import { parseDurationString } from "../../time_utils";
import { ErrorDisplay } from "./error_display";
import {
  GroupDataJSON,
  IntervalDataJSON,
  IntervalSettings, // Use generic base type
  ScheduleRowJSONData, // Type returned by rowManager
} from "./interval/types";
import { RowManager } from "./row_manager";

export class ScheduleBuilder {
  private rowManager: RowManager;
  private errorDisplay: ErrorDisplay;
  private configEntriesContainerEl: HTMLElement;
  private scheduleName: string = '';

  constructor(
    rowManager: RowManager,
    errorDisplay: ErrorDisplay,
    configEntriesContainerEl: HTMLElement
  ) {
    this.rowManager = rowManager;
    this.errorDisplay = errorDisplay;
    this.configEntriesContainerEl = configEntriesContainerEl;
  }

  /** Sets the schedule name to be assigned to the built Schedule object. */
  public setScheduleName(name: string): void {
    this.scheduleName = name;
  }

  /**
   * Builds the Schedule object from the current state of the config editor UI rows.
   * Uses the feature registry for generic feature/settings instantiation.
   * @returns A new Schedule instance or null if errors occur.
   */
  public buildSchedule(
    displayController: IDisplayController,
    audioController: AudioController,
    settings: AppSettings,
    maxCanvasHeight: number
  ): Schedule | null {
    console.log("[ScheduleBuilder] Starting buildSchedule...");
    this.errorDisplay.removeMessage(); // Clear previous errors
    const schedule = new Schedule(displayController, audioController);
    schedule.name = this.scheduleName;
    const rows =
      this.configEntriesContainerEl.querySelectorAll<HTMLElement>(
        ".schedule-row"
      );
    let hasErrors = false;
    let totalDurationSeconds = 0;
    const MAX_TOTAL_DURATION_SECONDS = 3 * 60 * 60; // 3 hours

    rows.forEach((rowElement, index) => {
      if (hasErrors) return; // Stop processing if an error occurred

      // Get row data using RowManager (which now includes categoryName)
      const rowData = this.rowManager.getRowData(rowElement);
      if (!rowData) {
        console.warn(
          `[ScheduleBuilder] Skipping row ${
            index + 1
          } due to data extraction error.`
        );
        // Optionally report this as an error? For now, just skip.
        // this.errorDisplay.showMessage(`Error reading data for row ${index + 1}.`);
        // hasErrors = true;
        return;
      }

      if (rowData.rowType === "interval") {
        // Type assertion is safe here because rowType is checked
        const intervalData = rowData as IntervalDataJSON;
        const categoryName = intervalData.categoryName; // Get category name string

        console.log(
          `[ScheduleBuilder] Processing interval ${
            index + 1
          }: Cat='${categoryName}', Type='${
            intervalData.featureTypeName || "None"
          }', Task='${intervalData.task}', Duration='${intervalData.duration}'`
        );
        let durationSeconds = 0;
        let feature: Feature | null = null;
        let intervalSettings: IntervalSettings | null = null;

        try {
          // 1. Parse Duration
          durationSeconds = parseDurationString(intervalData.duration);
          if (durationSeconds < 0)
            throw new Error("Duration cannot be negative.");
          totalDurationSeconds += durationSeconds;
          if (totalDurationSeconds > MAX_TOTAL_DURATION_SECONDS) {
            throw new Error(
              `Total schedule duration exceeds maximum limit (${
                MAX_TOTAL_DURATION_SECONDS / 3600
              } hours).`
            );
          }

          // 2. Instantiate Interval Settings
          intervalSettings = instrumentCategory.createIntervalSettingsFromJSON(intervalData.intervalSettings);

          // 3. Create Feature if specified (Generically)
          if (intervalData.featureTypeName) {
            // Use categoryName string for lookup
            const descriptor = getFeatureTypeDescriptor(
              categoryName,
              intervalData.featureTypeName
            );
            if (!descriptor) {
              throw new Error(
                `Unknown feature type: "${intervalData.featureTypeName}" in category "${categoryName}"`
              );
            }
            console.log(
              `[ScheduleBuilder] Found descriptor for '${descriptor.typeName}'. Attempting createFeature...`
            );

            // --- Call createFeature with parsed intervalSettings and categoryName ---
            if (intervalSettings) {
              feature = descriptor.createFeature(
                intervalData.featureArgsList,
                audioController,
                settings,
                intervalSettings, // Pass the parsed settings object
                maxCanvasHeight,
                categoryName // Pass category name string
              );
              console.log(
                `[ScheduleBuilder] Successfully created feature instance for '${descriptor.typeName}'.`
              );
            } else {
              // This case should be less likely now due to fallback in step 2
              throw new Error(
                `Could not create feature "${descriptor.typeName}" due to missing interval settings.`
              );
            }
          } else {
            console.log(
              `[ScheduleBuilder] No feature specified for interval ${
                index + 1
              }.`
            );
          }

          // 4. Create Interval and add to Schedule
          const interval = new Interval(
            durationSeconds,
            settings.practice.warmupPeriod, // Use global warmup setting
            intervalData.task ||
              intervalData.featureTypeName ||
              `Interval ${index + 1}`, // Task name fallback
            feature,
            categoryName
          );
          schedule.addInterval(interval);
          console.log(
            `[ScheduleBuilder] Added interval ${index + 1} to schedule.`
          );
        } catch (error: any) {
          const errorMessage = `[ScheduleBuilder] Error processing interval ${
            index + 1
          } (${
            intervalData.task ||
            intervalData.featureTypeName ||
            intervalData.duration
          }): ${error.message}`;
          console.error(errorMessage, error);
          this.errorDisplay.showMessage(errorMessage);
          hasErrors = true; // Set flag to stop processing
        }
      } else if (rowData.rowType === "group") {
        // Groups are currently ignored during schedule building
        console.log(
          `[ScheduleBuilder] Skipping group row ${index + 1}: '${
            (rowData as GroupDataJSON).name
          }'`
        );
      }
    });

    if (hasErrors) {
      console.error(
        "[ScheduleBuilder] Schedule building failed due to errors."
      );
      return null; // Return null if any errors occurred
    }

    if (schedule.intervals.length === 0) {
      console.warn(
        "[ScheduleBuilder] Schedule built successfully, but contains no intervals."
      );
      this.errorDisplay.showMessage(
        "Schedule is empty. Add some intervals.",
        "warning"
      );
      // Return the empty schedule or null? Returning schedule for now.
    } else {
      console.log(
        `[ScheduleBuilder] Schedule built successfully with ${schedule.intervals.length} intervals.`
      );
    }
    return schedule;
  }
}
