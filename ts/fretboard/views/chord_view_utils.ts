// ts/fretboard/views/chord_view_utils.ts
// Small shared helpers for the chord tool + family views (kept separate to avoid
// an import cycle between chord_tool_view and chord_family_view).

import { AppSettings } from "../../settings";
import { FretboardConfig } from "../fretboard_config";
import { InstrumentName, resolveTuning } from "../instruments";
import { DEFAULT_INSTRUMENT_SETTINGS, InstrumentSettings } from "../fretboard_settings";
import { ChordType } from "../../music/chords";

/** Short, conventional chord label, e.g. "G", "Gm", "G7", "Gmaj7". */
export function shortChordLabel(root: string, type: ChordType): string {
  switch (type) {
    case ChordType.MAJOR: return root;
    case ChordType.MINOR: return `${root}m`;
    case ChordType.DIM: return `${root}dim`;
    case ChordType.DOM7: return `${root}7`;
    case ChordType.MAJ7: return `${root}maj7`;
    case ChordType.MIN7: return `${root}m7`;
    case ChordType.MAJ9: return `${root}maj9`;
    case ChordType.MIN9: return `${root}m9`;
    case ChordType.SUS2: return `${root}sus2`;
    case ChordType.SUS4: return `${root}sus4`;
    case ChordType.ADD9: return `${root}add9`;
    case ChordType.MINOR_ADD9: return `${root}m(add9)`;
    default: return root;
  }
}

/** Builds a FretboardConfig for chord diagrams from the current instrument settings. */
export function buildChordFretboardConfig(settings: AppSettings): FretboardConfig {
  const gs = (settings.instrumentSettings as InstrumentSettings | undefined) ?? DEFAULT_INSTRUMENT_SETTINGS;
  const instrument = (gs.instrument as InstrumentName) ?? InstrumentName.Guitar;
  const tuning = resolveTuning(instrument, gs.tuning, settings.customTunings);
  const stringWidths = instrument === InstrumentName.Guitar ? [3, 3, 2, 2, 1, 1] : undefined;
  return new FretboardConfig(
    tuning,
    gs.handedness,
    // Follow the board the user configured so chord cards match its
    // orientation (and the mini renderer mirrors for left-handed).
    gs.orientation ?? "vertical",
    gs.colorScheme,
    gs.labelDisplay ?? "interval",
    undefined,
    undefined,
    stringWidths,
  );
}
