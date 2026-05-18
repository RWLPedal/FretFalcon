/** Specifies a barre across a contiguous range of strings at a given fret. */
export interface BarreSpec {
  fret: number;
  /** Lower string index (inclusive). */
  stringStart: number;
  /** Higher string index (inclusive). */
  stringEnd: number;
}

export enum ChordType {
  MAJOR = "Major",
  MINOR = "Minor",
  DOM7  = "Dom 7",
  MAJ7  = "Major 7",
  MIN7  = "Minor 7",
  SUS2  = "Sus2",
  SUS4  = "Sus4",
  ADD9  = "Add9",
  OTHER = "Other",
}

/** Display order for chord types in the UI. */
export const CHORD_TYPE_SORT_ORDER: ChordType[] = [
  ChordType.MAJOR,
  ChordType.MINOR,
  ChordType.DOM7,
  ChordType.MAJ7,
  ChordType.MIN7,
  ChordType.SUS2,
  ChordType.SUS4,
  ChordType.ADD9,
];

import { NoteName, CHORD_TONE_NAMES_FROM_A, ROOT_NOTE_SPECS } from "./music_types";

export class Chord {
  name: string;
  strings: Array<number>; // Fret number per string: -1 muted, 0 open, >0 fretted
  fingers: Array<number>; // Finger number: 0 open/muted, 1 index, 2 middle, 3 ring, 4 pinky
  barre?: BarreSpec[];
  readonly chordType: ChordType;
  /** Root note name, e.g. NoteName.A, NoteName.Bb, NoteName.FSharp. */
  readonly rootKey: NoteName;

  constructor(
    name: string,
    strings: Array<number>,
    fingers: Array<number>,
    barre: BarreSpec[] | undefined,
    chordType: ChordType = ChordType.OTHER,
    rootKey: NoteName
  ) {
    if (strings.length !== fingers.length) {
      throw new Error(
        `Chord ${name}: strings (${strings.length}) and fingers (${fingers.length}) arrays must have the same length.`
      );
    }
    this.name = name;
    this.strings = strings;
    this.fingers = fingers;
    this.barre = barre;
    this.chordType = chordType;
    this.rootKey = rootKey;
  }
}

/**
 * Returns the chord in `library` whose rootKey and chordType match, or undefined
 * if no match exists.
 */
export function findChordByRootAndType(
  library: Record<string, Chord>,
  rootKey: NoteName,
  chordType: ChordType
): Chord | undefined {
  return Object.values(library).find(
    (c) => c.rootKey === rootKey && c.chordType === chordType
  );
}

// Short alias used only within this file for chord definitions.
const CT = ChordType;

const N = NoteName;

export const chord_library = {
  // --- Major ---
  A_MAJOR: new Chord("A", [-1, 0, 2, 2, 2, 0], [-1, 0, 2, 1, 3, 0], undefined, CT.MAJOR, N.A),
  C_MAJOR: new Chord("C", [-1, 3, 2, 0, 1, 0], [-1, 3, 2, 0, 1, 0], undefined, CT.MAJOR, N.C),
  D_MAJOR: new Chord("D", [-1, -1, 0, 2, 3, 2], [-1, -1, 0, 1, 3, 2], undefined, CT.MAJOR, N.D),
  E_MAJOR: new Chord("E", [0, 2, 2, 1, 0, 0], [0, 2, 3, 1, 0, 0], undefined, CT.MAJOR, N.E),
  G_MAJOR: new Chord("G", [3, 2, 0, 0, 0, 3], [2, 1, 0, 0, 0, 3], undefined, CT.MAJOR, N.G),

  // --- Minor ---
  A_MINOR: new Chord("Am", [-1, 0, 2, 2, 1, 0], [-1, 0, 2, 3, 1, 0], undefined, CT.MINOR, N.A),
  D_MINOR: new Chord("Dm", [-1, -1, 0, 2, 3, 1], [-1, -1, 0, 2, 3, 1], undefined, CT.MINOR, N.D),
  E_MINOR: new Chord("Em", [0, 2, 2, 0, 0, 0], [0, 2, 3, 0, 0, 0], undefined, CT.MINOR, N.E),

  // --- Dominant 7th ---
  A7: new Chord("A7", [-1, 0, 2, 0, 2, 0], [-1, 0, 2, 0, 3, 0], undefined, CT.DOM7, N.A),
  B7: new Chord("B7", [-1, 2, 1, 2, 0, 2], [-1, 2, 1, 3, 0, 4], undefined, CT.DOM7, N.B),
  C7: new Chord("C7", [-1, 3, 2, 3, 1, 0], [-1, 3, 2, 4, 1, 0], undefined, CT.DOM7, N.C),
  D7: new Chord("D7", [-1, -1, 0, 2, 1, 2], [-1, -1, 0, 2, 1, 3], undefined, CT.DOM7, N.D),
  E7: new Chord("E7", [0, 2, 0, 1, 0, 0], [0, 2, 0, 1, 0, 0], undefined, CT.DOM7, N.E),
  F7: new Chord("F7", [1, 3, 1, 2, 1, 1], [1, 3, 1, 2, 1, 1], undefined, CT.DOM7, N.F),
  G7: new Chord("G7", [3, 2, 0, 0, 0, 1], [3, 2, 0, 0, 0, 1], undefined, CT.DOM7, N.G),

  // --- Major 7th ---
  AMAJ7: new Chord("A Major 7", [-1, 0, 2, 1, 2, 0], [-1, 0, 2, 1, 3, 0], undefined, CT.MAJ7, N.A),
  CMAJ7: new Chord("C Major 7", [-1, 3, 2, 0, 0, 0], [-1, 3, 2, 0, 0, 0], undefined, CT.MAJ7, N.C),
  DMAJ7: new Chord("D Major 7", [-1, -1, 0, 2, 2, 2], [-1, -1, 0, 1, 2, 3], undefined, CT.MAJ7, N.D),
  FMAJ7: new Chord("F Major 7", [-1, -1, 3, 2, 1, 0], [-1, -1, 3, 2, 1, 0], undefined, CT.MAJ7, N.F),
  GMAJ7: new Chord("G Major 7", [3, 2, 0, 0, 0, 2], [2, 1, 0, 0, 0, 3], undefined, CT.MAJ7, N.G),

  // --- Minor 7th ---
  AM7: new Chord("A Minor 7", [-1, 0, 2, 0, 1, 0], [-1, 0, 2, 0, 1, 0], undefined, CT.MIN7, N.A),
  DM7: new Chord("D Minor 7", [-1, -1, 0, 2, 1, 1], [-1, -1, 0, 2, 1, 1], undefined, CT.MIN7, N.D),
  EM7: new Chord("E Minor 7", [0, 2, 0, 0, 0, 0], [0, 2, 0, 0, 0, 0], undefined, CT.MIN7, N.E),

  // --- Suspended ---
  ASUS2: new Chord("Asus2",  [-1, 0, 2, 2, 0, 0], [-1, 0, 2, 3, 0, 0], undefined, CT.SUS2, N.A),
  DSUS2: new Chord("Dsus2",  [-1, -1, 0, 2, 3, 0], [-1, -1, 0, 1, 3, 0], undefined, CT.SUS2, N.D),
  ASUS4: new Chord("Asus4",  [-1, 0, 2, 2, 3, 0], [-1, 0, 1, 2, 4, 0], undefined, CT.SUS4, N.A),
  DSUS4: new Chord("Dsus4",  [-1, -1, 0, 2, 3, 3], [-1, -1, 0, 1, 2, 3], undefined, CT.SUS4, N.D),
  ESUS4: new Chord("Esus4",  [0, 2, 2, 2, 0, 0], [0, 1, 2, 3, 0, 0], undefined, CT.SUS4, N.E),
};

// ---------------------------------------------------------------------------
// Ukulele chord library (standard GCEA tuning, 4 strings: G=0, C=1, E=2, A=3)
// ---------------------------------------------------------------------------
export const ukulele_chord_library: Record<string, Chord> = {
  // --- Major ---
  A_MAJOR: new Chord("A", [2, 1, 0, 0], [2, 1, 0, 0], undefined, CT.MAJOR, N.A),
  B_MAJOR: new Chord("B", [4, 3, 2, 2], [3, 2, 1, 1],
    [{ fret: 2, stringStart: 2, stringEnd: 3 }], CT.MAJOR, N.B),
  C_MAJOR: new Chord("C", [0, 0, 0, 3], [0, 0, 0, 3], undefined, CT.MAJOR, N.C),
  D_MAJOR: new Chord("D", [2, 2, 2, 0], [1, 2, 3, 0], undefined, CT.MAJOR, N.D),
  E_MAJOR: new Chord("E", [4, 4, 4, 2], [4, 3, 2, 1], undefined, CT.MAJOR, N.E),
  F_MAJOR: new Chord("F", [2, 0, 1, 0], [2, 0, 1, 0], undefined, CT.MAJOR, N.F),
  G_MAJOR: new Chord("G", [0, 2, 3, 2], [0, 1, 3, 2], undefined, CT.MAJOR, N.G),

  // --- Minor ---
  A_MINOR: new Chord("Am", [2, 0, 0, 0], [2, 0, 0, 0], undefined, CT.MINOR, N.A),
  B_MINOR: new Chord("Bm", [4, 2, 2, 2], [3, 1, 1, 1],
    [{ fret: 2, stringStart: 1, stringEnd: 3 }], CT.MINOR, N.B),
  C_MINOR: new Chord("Cm", [0, 3, 3, 3], [0, 1, 1, 1],
    [{ fret: 3, stringStart: 1, stringEnd: 3 }], CT.MINOR, N.C),
  D_MINOR: new Chord("Dm", [2, 2, 1, 0], [2, 3, 1, 0], undefined, CT.MINOR, N.D),
  E_MINOR: new Chord("Em", [0, 4, 3, 2], [0, 3, 2, 1], undefined, CT.MINOR, N.E),
  F_MINOR: new Chord("Fm", [1, 0, 1, 3], [1, 0, 2, 4], undefined, CT.MINOR, N.F),
  G_MINOR: new Chord("Gm", [0, 2, 3, 1], [0, 2, 3, 1], undefined, CT.MINOR, N.G),

  // --- Dominant 7th ---
  A7: new Chord("A7", [0, 1, 0, 0], [0, 1, 0, 0], undefined, CT.DOM7, N.A),
  B7: new Chord("B7", [2, 3, 2, 2], [1, 2, 1, 1],
    [{ fret: 2, stringStart: 0, stringEnd: 3 }], CT.DOM7, N.B),
  C7: new Chord("C7", [0, 0, 0, 1], [0, 0, 0, 1], undefined, CT.DOM7, N.C),
  D7: new Chord("D7", [2, 2, 2, 3], [1, 1, 1, 2],
    [{ fret: 2, stringStart: 0, stringEnd: 2 }], CT.DOM7, N.D),
  E7: new Chord("E7", [1, 2, 0, 2], [1, 2, 0, 3], undefined, CT.DOM7, N.E),
  F7: new Chord("F7", [2, 3, 1, 3], [2, 4, 1, 3], undefined, CT.DOM7, N.F),
  G7: new Chord("G7", [0, 2, 1, 2], [0, 2, 1, 3], undefined, CT.DOM7, N.G),
};

// ---------------------------------------------------------------------------
// Mandolin chord library (standard GDAE tuning, 4 strings: G=0, D=1, A=2, E=3)
// ---------------------------------------------------------------------------
export const mandolin_chord_library: Record<string, Chord> = {
  // --- Major ---
  A_MAJOR: new Chord("A", [2, 2, 4, 0], [1, 1, 3, 0], undefined, CT.MAJOR, N.A),
  C_MAJOR: new Chord("C", [0, 2, 3, 3], [0, 1, 2, 3], undefined, CT.MAJOR, N.C),
  D_MAJOR: new Chord("D", [0, 0, 0, 2], [0, 0, 0, 1], undefined, CT.MAJOR, N.D),
  E_MAJOR: new Chord("E", [1, 2, 2, 0], [1, 3, 2, 0], undefined, CT.MAJOR, N.E),
  G_MAJOR: new Chord("G", [0, 0, 2, 3], [0, 0, 1, 3], undefined, CT.MAJOR, N.G),

  // --- Minor ---
  A_MINOR: new Chord("A", [2, 2, 3, 0], [1, 2, 3, 0], undefined, CT.MINOR, N.A),
  D_MINOR: new Chord("D", [-1, 0, 0, 1], [-1, 0, 0, 1], undefined, CT.MINOR, N.D),
  E_MINOR: new Chord("E", [0, 2, 2, 0], [0, 1, 2, 0], undefined, CT.MINOR, N.E),
  G_MINOR: new Chord("G", [0, 0, 1, 3], [0, 0, 1, 3], undefined, CT.MINOR, N.G),

  // --- Dominant 7th ---
  A7: new Chord("A7", [2, 2, 4, 3], [1, 1, 3, 2], undefined, CT.DOM7, N.A),
  D7: new Chord("D7", [2, 0, 3, 2], [2, 0, 3, 1], undefined, CT.DOM7, N.D),
  E7: new Chord("E7", [1, 0, 2, 0], [1, 0, 2, 0], undefined, CT.DOM7, N.E),
  G7: new Chord("G7", [0, 0, 2, 1], [0, 0, 2, 1], undefined, CT.DOM7, N.G),
};

// ---------------------------------------------------------------------------
// Mandola chord library (standard CGDA tuning, 4 strings: C=0, G=1, D=2, A=3)
// Shapes are identical to mandolin — both are tuned in 5ths — but each chord
// sounds 7 semitones lower, so all names are transposed accordingly.
// ---------------------------------------------------------------------------
export const mandola_chord_library: Record<string, Chord> = {
  // --- Major ---
  A_MAJOR: new Chord("A", [1, 2, 2, 0], [1, 3, 2, 0], undefined, CT.MAJOR, N.A),
  C_MAJOR: new Chord("C", [0, 0, 2, 3], [0, 0, 1, 3], undefined, CT.MAJOR, N.C),
  D_MAJOR: new Chord("D", [2, 2, 4, 0], [1, 1, 3, 0], undefined, CT.MAJOR, N.D),
  F_MAJOR: new Chord("F", [0, 2, 3, 3], [0, 1, 2, 3], undefined, CT.MAJOR, N.F),
  G_MAJOR: new Chord("G", [0, 0, 0, 2], [0, 0, 0, 1], undefined, CT.MAJOR, N.G),

  // --- Minor ---
  A_MINOR: new Chord("Am", [0, 2, 2, 0], [0, 1, 2, 0], undefined, CT.MINOR, N.A),
  C_MINOR: new Chord("Cm", [0, 0, 1, 3], [0, 0, 1, 3], undefined, CT.MINOR, N.C),
  D_MINOR: new Chord("Dm", [2, 2, 3, 0], [1, 2, 3, 0], undefined, CT.MINOR, N.D),
  G_MINOR: new Chord("Gm", [-1, 0, 0, 1], [-1, 0, 0, 1], undefined, CT.MINOR, N.G),

  // --- Dominant 7th ---
  A7: new Chord("A7", [1, 0, 2, 0], [1, 0, 2, 0], undefined, CT.DOM7, N.A),
  C7: new Chord("C7", [0, 0, 2, 1], [0, 0, 2, 1], undefined, CT.DOM7, N.C),
  D7: new Chord("D7", [2, 2, 4, 3], [1, 1, 3, 2], undefined, CT.DOM7, N.D),
  G7: new Chord("G7", [2, 0, 3, 2], [2, 0, 3, 1], undefined, CT.DOM7, N.G),
};

import type { InstrumentName } from "./fretboard";

export const CHORD_LIBRARIES: Partial<Record<InstrumentName, Record<string, Chord>>> = {
  "Guitar":   chord_library,
  "Ukulele":  ukulele_chord_library,
  "Mandolin": mandolin_chord_library,
  "Mandola":  mandola_chord_library,
};

/** Returns the chord library appropriate for the given instrument. */
export function getChordLibraryForInstrument(instrument: InstrumentName): Record<string, Chord> {
  return CHORD_LIBRARIES[instrument] ?? chord_library;
}

// ---------------------------------------------------------------------------
// Comprehensive chord tones library (dynamically generated)
// ---------------------------------------------------------------------------

interface _ChordTypeSpec {
  key: string;
  name: string;
  intervals: number[]; // semitone offsets from root (may exceed 11 for extensions)
}

const _CHORD_TYPES: _ChordTypeSpec[] = [
  { key: 'MAJ',     name: 'Major',         intervals: [0, 4, 7] },
  { key: 'MIN',     name: 'Minor',         intervals: [0, 3, 7] },
  //{ key: 'DOM7',    name: 'Dom 7',         intervals: [0, 4, 7, 10] },
  { key: 'MAJ7',    name: 'Major 7',       intervals: [0, 4, 7, 11] },
  { key: 'MIN7',    name: 'Minor 7',       intervals: [0, 3, 7, 10] },
  { key: 'SUS2',    name: 'Sus2',          intervals: [0, 2, 7] },
  { key: 'SUS4',    name: 'Sus4',          intervals: [0, 5, 7] },
  //{ key: 'DIM',     name: 'Diminished',    intervals: [0, 3, 6] },
  //{ key: 'AUG',     name: 'Augmented',     intervals: [0, 4, 8] },
  //{ key: 'DIM7',    name: 'Dim 7',         intervals: [0, 3, 6, 9] },
  //{ key: 'HDIM7',   name: 'Half-Dim 7',    intervals: [0, 3, 6, 10] },
  //{ key: 'MINMAJ7', name: 'Minor-Maj 7',   intervals: [0, 3, 7, 11] },
  //{ key: 'DOM9',    name: 'Dom 9',         intervals: [0, 4, 7, 10, 14] },
  //{ key: 'MAJ9',    name: 'Major 9',       intervals: [0, 4, 7, 11, 14] },
  //{ key: 'MIN9',    name: 'Minor 9',       intervals: [0, 3, 7, 10, 14] },
  { key: 'ADD9',    name: 'Add 9',         intervals: [0, 4, 7, 14] },
  //{ key: 'MADD9',   name: 'Minor Add 9',   intervals: [0, 3, 7, 14] },
  //{ key: 'MAJ6',    name: 'Major 6',       intervals: [0, 4, 7, 9] },
  //{ key: 'MIN6',    name: 'Minor 6',       intervals: [0, 3, 7, 9] },
];

export interface ChordToneEntry {
  name: string;
  tones: string[]; // note names (enharmonics matched via NOTE_FLAT_ALIAS_FROM_A in instrument_utils)
}

/** Comprehensive chord tones library for all 12 roots × 7 chord types.
 *  Keys have the form "{Root}_{TYPE}", e.g. "C#_MAJ", "Eb_MIN7". */
export const chord_tones_library: Record<string, ChordToneEntry> = (() => {
  const lib: Record<string, ChordToneEntry> = {};
  for (const root of ROOT_NOTE_SPECS) {
    for (const type of _CHORD_TYPES) {
      const key = `${root.key}_${type.key}`;
      const tones = type.intervals.map(
        interval => CHORD_TONE_NAMES_FROM_A[(root.noteIndex + interval) % 12]
      );
      lib[key] = { name: `${root.name} ${type.name}`, tones };
    }
  }
  return lib;
})();