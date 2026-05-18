// ts/settings.ts
import { PracticeSettings, DEFAULT_PRACTICE_SETTINGS } from "./practice_settings";
import { ReferenceSettings, DEFAULT_REFERENCE_SETTINGS } from "./reference_settings";
import { Theme } from "./theme_manager";
import { InstrumentSettings, DEFAULT_INSTRUMENT_SETTINGS } from "./fretboard/fretboard_settings";

export type { InstrumentSettings };

/** Defines the structure for all application-level settings. */
export interface AppSettings {
  theme: Theme;
  practice: PracticeSettings;
  reference: ReferenceSettings;
  instrumentSettings: InstrumentSettings;
  showGrid: boolean;
}

export const SETTINGS_STORAGE_KEY = "categoryTimerAppSettings";
export const LAST_RUN_SCHEDULE_JSON_KEY = "lastRunScheduleJSON";
export const RECENT_SCHEDULES_JSON_KEY = "recentSchedulesJSON";
export const MAX_RECENT_SCHEDULES = 5;

/** Loads settings from localStorage, merging over defaults. */
export function loadSettings(): AppSettings {
  const defaults: AppSettings = {
    theme: Theme.WARM,
    practice: { ...DEFAULT_PRACTICE_SETTINGS },
    reference: { ...DEFAULT_REFERENCE_SETTINGS },
    instrumentSettings: { ...DEFAULT_INSTRUMENT_SETTINGS },
    showGrid: false,
  };

  try {
    const storedJson = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (storedJson) {
      const stored = JSON.parse(storedJson);
      console.log("Successfully loaded settings from localStorage.");
      return {
        ...defaults,
        ...(stored.theme     ? { theme: stored.theme }                                              : {}),
        ...(stored.practice  ? { practice:  { ...defaults.practice,  ...stored.practice  } }        : {}),
        ...(stored.reference ? { reference: { ...defaults.reference, ...stored.reference } }        : {}),
        instrumentSettings:    { ...defaults.instrumentSettings, ...(stored.instrumentSettings ?? {}) },
        ...(stored.showGrid !== undefined ? { showGrid: stored.showGrid } : {}),
      };
    }
  } catch (e) {
    console.error("Failed to load settings from localStorage:", e);
  }

  console.log("Using default settings.");
  return defaults;
}
