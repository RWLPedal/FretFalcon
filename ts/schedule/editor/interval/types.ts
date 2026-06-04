/** Data structure representing the state of a single interval row (Input/Output for UI build) */
export interface IntervalRowData {
  rowType: "interval";
  duration: string;
  task: string;
  categoryName: string;
  featureTypeName: string;
  featureArgsList: string[];
  intervalSettings: IntervalSettings;
}

/** Data structure representing a group header row (Input/Output for UI build) */
export interface GroupRowData {
  rowType: "group";
  name: string;
  color?: string; // CSS var name e.g. "--note-fifth"; auto-assigned if omitted
}

/** Union type for UI row data */
export type ScheduleRowData = IntervalRowData | GroupRowData;

// --- JSON Data Structures ---

/** JSON structure for group row data */
export interface GroupDataJSON {
  rowType: "group";
  name: string;
  color?: string;
}

/** JSON structure for interval row data */
export interface IntervalDataJSON {
  rowType: "interval";
  duration: string;
  task: string;
  categoryName: string;
  featureTypeName: string;
  featureArgsList: string[];
  intervalSettings?: IntervalSettingsJSON;
}

/** Union type for JSON row data */
export type ScheduleRowJSONData = GroupDataJSON | IntervalDataJSON;

// Define a base interface for all interval-specific settings
export interface IntervalSettings {
  toJSON(): IntervalSettingsJSON | undefined;
}

// Define a base interface for the JSON representation of settings
export interface IntervalSettingsJSON {
  [key: string]: any;
}
