// ts/schedule/editor/schedule_serializer.ts
import { instrumentCategory } from "../../fretboard/fretboard_category";
import {
  IntervalSettings,
  IntervalRowData,
  GroupRowData,
  ScheduleRowData,
  GroupDataJSON,
  IntervalDataJSON,
  ScheduleRowJSONData,
} from "./interval/types";
// --- REMOVED direct import of InstrumentIntervalSettings ---

/** Defines the top-level structure of a saved schedule JSON document. */
export interface ScheduleDocument {
  name?: string;
  items: ScheduleRowJSONData[];
}

// --- Type Guards for Validation (Remain the same) ---
function isGroupDataJSON(item: any): item is GroupDataJSON {
  return typeof item === "object" && item !== null && item.rowType === "group";
}
function isIntervalDataJSON(item: any): item is IntervalDataJSON {
  // Also check for mandatory categoryName
  return (
    typeof item === "object" &&
    item !== null &&
    item.rowType === "interval" &&
    typeof item.categoryName === "string" &&
    !!item.categoryName
  );
}

// --- Parsing Function ---
/**
 * Parses a JSON string representing a schedule document into structured row data objects
 * and extracts the schedule name. Uses the feature registry for generic handling.
 */
export function parseScheduleJSON(jsonString: string): {
  name?: string;
  items: ScheduleRowData[];
} {
  let parsedData: any;
  try {
    parsedData = JSON.parse(jsonString);
  } catch (error: any) {
    throw new Error(`Invalid JSON format: ${error.message}`);
  }

  if (
    typeof parsedData !== "object" ||
    parsedData === null ||
    !Array.isArray(parsedData.items)
  ) {
    throw new Error(
      "Invalid schedule format: Must be an object with an 'items' array."
    );
  }

  const name =
    typeof parsedData.name === "string" ? parsedData.name.trim() : undefined;
  const items = parsedData.items;
  const rowDataArray: ScheduleRowData[] = [];

  items.forEach((item: any, index: number) => {
    if (isGroupDataJSON(item)) {
      const level =
        typeof item.level === "number" && item.level >= 1 ? item.level : 1;
      const groupName =
        typeof item.name === "string"
          ? item.name.trim()
          : `Group Level ${level}`;
      rowDataArray.push({ rowType: "group", level: level, name: groupName });
    } else if (isIntervalDataJSON(item)) {
      // isIntervalDataJSON now checks for categoryName
      const duration =
        typeof item.duration === "string" ? item.duration.trim() : "0:00";
      const task = typeof item.task === "string" ? item.task.trim() : "";
      const categoryName = item.categoryName; // Already validated by type guard

      const featureTypeName =
        typeof item.featureTypeName === "string"
          ? item.featureTypeName.trim()
          : "";
      const featureArgsList = Array.isArray(item.featureArgsList)
        ? item.featureArgsList.map((arg) => String(arg ?? ""))
        : [];

      // ---- Create IntervalSettings Instance ----
      let intervalSettings: IntervalSettings;
      const settingsData = item.intervalSettings;
      try {
        intervalSettings = instrumentCategory.createIntervalSettingsFromJSON(settingsData);
      } catch (parseError: any) {
        console.error(
          `Error parsing interval settings for category "${categoryName}" at index ${index}:`,
          parseError,
          settingsData
        );
        intervalSettings = instrumentCategory.getIntervalSettingsFactory()();
      }
      // ---- End IntervalSettings Instance Creation ----

      const intervalData: IntervalRowData = {
        rowType: "interval",
        duration,
        task,
        categoryName: categoryName, // Assign category name string
        featureTypeName,
        featureArgsList,
        intervalSettings, // Assign instance
      };
      rowDataArray.push(intervalData);
    } else {
      console.warn(`Skipping invalid schedule item at index ${index}:`, item);
    }
  });

  return { name: name, items: rowDataArray };
}

/**
 * Generates a pretty-printed JSON string from schedule name and row data objects.
 * Expects rowDataArray elements to conform to ScheduleRowJSONData structure.
 */
export function generateScheduleJSON(
  scheduleName: string | undefined | null,
  rowDataArray: ScheduleRowJSONData[]
): string {
  const scheduleDocument: ScheduleDocument = { items: rowDataArray };
  if (scheduleName && scheduleName.trim()) {
    scheduleDocument.name = scheduleName.trim();
  }
  try {
    // The rowDataArray should already be in the correct JSON format
    return JSON.stringify(scheduleDocument, null, 2);
  } catch (error: any) {
    console.error("Error stringifying schedule data:", error);
    return JSON.stringify(
      { name: scheduleName || undefined, items: [] },
      null,
      2
    );
  }
}
