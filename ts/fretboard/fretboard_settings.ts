import { InstrumentName } from "./fretboard";
import { FretboardColorScheme } from './colors';

/** Defines the settings for the Instrument category. */
export interface InstrumentSettings {
  /** The selected instrument type. Determines available tunings and features. */
  instrument: InstrumentName;
  handedness: "right" | "left";
  orientation: "vertical" | "horizontal";
  /** Tuning name — valid values depend on the selected instrument. */
  tuning: string;
  colorScheme: FretboardColorScheme;
  /** Per-instance zoom scale multiplier (1.0 = default, >1.0 = zoomed). */
  zoomMultiplier?: number;
}

/** Default values for Instrument settings. */
export const DEFAULT_INSTRUMENT_SETTINGS: InstrumentSettings = {
  instrument: "Guitar",
  handedness: "right",
  orientation: "vertical",
  tuning: "Standard",
  colorScheme: "interval",
};
