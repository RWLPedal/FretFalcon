// ts/settings.ts
import { Theme } from "./theme_manager";
import {
  InstrumentSettings,
  DEFAULT_INSTRUMENT_SETTINGS,
} from "./fretboard/fretboard_settings";

export type { InstrumentSettings };

export interface CustomTuning {
  name: string;
  notes: number[]; // pitch-class semitones, A=0; length must match instrument stringCount
}

/** Defines the structure for all application-level settings. */
export interface AppSettings {
  theme: Theme;
  instrumentSettings: InstrumentSettings;
  showGrid: boolean;
  customTunings?: Partial<Record<string, CustomTuning[]>>; // keyed by InstrumentName string value
}

export const SETTINGS_STORAGE_KEY = "categoryTimerAppSettings";
export const LAST_RUN_SCHEDULE_JSON_KEY = "lastRunScheduleJSON";
export const RECENT_SCHEDULES_JSON_KEY = "recentSchedulesJSON";
export const MAX_RECENT_SCHEDULES = 5;

/** Loads settings from localStorage, merging over defaults. */
export function loadSettings(): AppSettings {
  const defaults: AppSettings = {
    theme: Theme.WARM,
    instrumentSettings: { ...DEFAULT_INSTRUMENT_SETTINGS },
    showGrid: true,
  };

  try {
    const storedJson = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (storedJson) {
      const stored = JSON.parse(storedJson);
      return {
        ...defaults,
        ...(stored.theme ? { theme: stored.theme } : {}),
        instrumentSettings: {
          ...defaults.instrumentSettings,
          ...(stored.instrumentSettings ?? {}),
        },
        ...(stored.showGrid !== undefined ? { showGrid: stored.showGrid } : {}),
        ...(stored.customTunings
          ? { customTunings: stored.customTunings }
          : {}),
      };
    }
  } catch (e) {
    console.error("Failed to load settings from localStorage:", e);
  }

  return defaults;
}
