import { Schedule, Interval, GroupInfo } from "../schedule";
import { IDisplayController } from "../display_controller";
import { AudioController } from "../../audio_controller";
import { AppSettings } from "../../settings";
import { Feature } from "../../feature";
import { getFeatureTypeDescriptor } from "../../feature_registry";
import { parseDurationString } from "../../time_utils";
import { ErrorDisplay } from "./error_display";
import {
  GroupDataJSON,
  IntervalDataJSON,
  ScheduleRowJSONData,
} from "./interval/types";
import { RowManager } from "./row_manager";
import { createScheduleFeature } from "../feature_adapter";
import { InstrumentIntervalSettings } from "../fretboard_interval_settings";

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
    this.errorDisplay.removeMessage(); // Clear previous errors
    const schedule = new Schedule(displayController, audioController);
    schedule.name = this.scheduleName;
    const rows =
      this.configEntriesContainerEl.querySelectorAll<HTMLElement>(
        ".schedule-row"
      );
    let hasErrors = false;
    let totalDurationSeconds = 0;
    const MAX_TOTAL_DURATION_SECONDS = 3 * 60 * 60;

    // Pre-build group info from row order
    const groups: GroupInfo[] = [];
    let currentGroup: GroupInfo | null = null;
    let intervalIndex = 0;
    // for...of instead of forEach so TypeScript CFA tracks currentGroup across the loop boundary
    for (const rowElement of Array.from(rows)) {
      const rowData = this.rowManager.getRowData(rowElement);
      if (!rowData) continue;
      if (rowData.rowType === 'group') {
        if (currentGroup) {
          currentGroup.endIndex = intervalIndex - 1;
          if (currentGroup.startIndex <= currentGroup.endIndex) groups.push(currentGroup);
        }
        currentGroup = { name: rowData.name, color: rowData.color ?? '', startIndex: intervalIndex, endIndex: intervalIndex };
      } else if (rowData.rowType === 'interval') {
        intervalIndex++;
      }
    }
    if (currentGroup) {
      currentGroup.endIndex = intervalIndex - 1;
      if (currentGroup.startIndex <= currentGroup.endIndex) groups.push(currentGroup);
    }

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
        return;
      }

      if (rowData.rowType === "interval") {
        // Type assertion is safe here because rowType is checked
        const intervalData = rowData as IntervalDataJSON;
        const categoryName = intervalData.categoryName; // Get category name string

        let durationSeconds = 0;
        let feature: Feature | null = null;

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

          // 2. Parse interval settings (schedule-internal: metronomeBpm etc.)
          const intervalSettings = InstrumentIntervalSettings.fromJSON(
            intervalData.intervalSettings as any
          );

          // 3. Create Feature if specified
          if (intervalData.featureTypeName) {
            const descriptor = getFeatureTypeDescriptor(
              categoryName,
              intervalData.featureTypeName
            );
            if (!descriptor) {
              throw new Error(
                `Unknown feature type: "${intervalData.featureTypeName}" in category "${categoryName}"`
              );
            }
            feature = createScheduleFeature(
              descriptor,
              intervalData.featureArgsList,
              audioController,
              settings,
              intervalSettings,
              maxCanvasHeight,
              categoryName
            );
          }

          // 4. Create Interval and add to Schedule
          const interval = new Interval(
            durationSeconds,
            0,
            intervalData.task ||
              intervalData.featureTypeName ||
              `Interval ${index + 1}`, // Task name fallback
            feature,
            categoryName
          );
          schedule.addInterval(interval);
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
      }
    });

    if (hasErrors) {
      console.error("[ScheduleBuilder] Schedule building failed due to errors.");
      return null;
    }

    schedule.setGroups(groups);

    if (schedule.intervals.length === 0) {
      console.warn(
        "[ScheduleBuilder] Schedule built successfully, but contains no intervals."
      );
      this.errorDisplay.showMessage(
        "Schedule is empty. Add some intervals.",
        "warning"
      );
      // Return the empty schedule or null? Returning schedule for now.
    }
    return schedule;
  }
}
