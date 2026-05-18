import { Chord, ChordType, BarreSpec } from "./chords";
import { InstrumentName, Tuning } from "./fretboard";
import { getKeyIndex } from "./instrument_utils";
import type { NoteName } from "./music_types";

export interface MoveableChordTemplate {
  shapeName: string;
  chordType: ChordType;
  /** String index that holds the root note (0 = low E for guitar standard). */
  rootStringIndex: number;
  /** Per-string fret offset relative to root fret. -1 = muted. */
  stringOffsets: number[];
  fingers: number[];
  barres: Array<{ relativeFret: number; stringStart: number; stringEnd: number }>;
}

/**
 * Moveable barre chord templates for 6-string guitar, defined at fret 0.
 * Transpose all non-muted offsets by the root fret to get actual fret numbers.
 * E-Shape: root on string 0 (low E). A-Shape: root on string 1 (A string).
 */
export const guitar_moveable_chord_library: MoveableChordTemplate[] = [
  // --- E-Shape ---
  {
    shapeName: "E-Shape",
    chordType: ChordType.MAJOR,
    rootStringIndex: 0,
    stringOffsets: [0, 2, 2, 1, 0, 0],
    fingers:       [1, 3, 4, 2, 1, 1],
    barres: [{ relativeFret: 0, stringStart: 0, stringEnd: 5 }],
  },
  {
    shapeName: "E-Shape",
    chordType: ChordType.MINOR,
    rootStringIndex: 0,
    stringOffsets: [0, 2, 2, 0, 0, 0],
    fingers:       [1, 3, 4, 1, 1, 1],
    barres: [{ relativeFret: 0, stringStart: 0, stringEnd: 5 }],
  },
  {
    shapeName: "E-Shape",
    chordType: ChordType.DOM7,
    rootStringIndex: 0,
    stringOffsets: [0, 2, 0, 1, 0, 0],
    fingers:       [1, 3, 1, 2, 1, 1],
    barres: [{ relativeFret: 0, stringStart: 0, stringEnd: 5 }],
  },
  {
    shapeName: "E-Shape",
    chordType: ChordType.MIN7,
    rootStringIndex: 0,
    stringOffsets: [0, 2, 0, 0, 0, 0],
    fingers:       [1, 3, 1, 1, 1, 1],
    barres: [{ relativeFret: 0, stringStart: 0, stringEnd: 5 }],
  },
  {
    shapeName: "E-Shape",
    chordType: ChordType.MAJ7,
    rootStringIndex: 0,
    // Emaj7 shape: A at +2, D at +1, G at +1, B and e at root (barre)
    stringOffsets: [0, 2, 1, 1, 0, 0],
    fingers:       [1, 4, 2, 3, 1, 1],
    barres: [{ relativeFret: 0, stringStart: 0, stringEnd: 5 }],
  },

  // --- A-Shape ---
  {
    shapeName: "A-Shape",
    chordType: ChordType.MAJOR,
    rootStringIndex: 1,
    stringOffsets: [-1, 0, 2, 2, 2, 0],
    fingers:       [-1, 1, 3, 3, 3, 1],
    barres: [{ relativeFret: 0, stringStart: 1, stringEnd: 5 }],
  },
  {
    shapeName: "A-Shape",
    chordType: ChordType.MINOR,
    rootStringIndex: 1,
    stringOffsets: [-1, 0, 2, 2, 1, 0],
    fingers:       [-1, 1, 3, 4, 2, 1],
    barres: [{ relativeFret: 0, stringStart: 1, stringEnd: 5 }],
  },
  {
    shapeName: "A-Shape",
    chordType: ChordType.DOM7,
    rootStringIndex: 1,
    // A7 shape: D at +2, G at root (barre), B at +2, e at root (barre)
    stringOffsets: [-1, 0, 2, 0, 2, 0],
    fingers:       [-1, 1, 2, 1, 3, 1],
    barres: [{ relativeFret: 0, stringStart: 1, stringEnd: 5 }],
  },
  {
    shapeName: "A-Shape",
    chordType: ChordType.MIN7,
    rootStringIndex: 1,
    // Am7 shape: D at +2, G at root, B at +1, e at root (barre)
    stringOffsets: [-1, 0, 2, 0, 1, 0],
    fingers:       [-1, 1, 3, 1, 2, 1],
    barres: [{ relativeFret: 0, stringStart: 1, stringEnd: 5 }],
  },
  {
    shapeName: "A-Shape",
    chordType: ChordType.MAJ7,
    rootStringIndex: 1,
    // Amaj7 shape: D at +2, G at +1, B at +2, e at root (barre)
    stringOffsets: [-1, 0, 2, 1, 2, 0],
    fingers:       [-1, 1, 3, 2, 4, 1],
    barres: [{ relativeFret: 0, stringStart: 1, stringEnd: 5 }],
  },
];

export const mandolin_moveable_chord_library: MoveableChordTemplate[] = [
 {
    shapeName: "A-Style",
    chordType: ChordType.MAJOR,
    rootStringIndex: 0,
    stringOffsets: [0, 0, 2, 3],
    fingers:       [1, 1, 3, 4],
    barres: [{ relativeFret: 0, stringStart: 0, stringEnd: 3}],
  },
 {
    shapeName: "A-Style",
    chordType: ChordType.MINOR,
    rootStringIndex: 0,
    stringOffsets: [0, 0, 1, 3],
    fingers:       [1, 1, 2, 4],
    barres: [{ relativeFret: 0, stringStart: 0, stringEnd: 3}],
  },
 {
    shapeName: "A-Style",
    chordType: ChordType.DOM7,
    rootStringIndex: 0,
    stringOffsets: [0, 0, 2, 1],
    fingers:       [1, 1, 3, 2],
    barres: [{ relativeFret: 0, stringStart: 0, stringEnd: 3}],
  },
 {
    shapeName: "A-Style",
    chordType: ChordType.MIN7,
    rootStringIndex: 0,
    stringOffsets: [0, 0, 1, 1],
    fingers:       [1, 1, 2, 3],
    barres: [{ relativeFret: 0, stringStart: 0, stringEnd: 3}],
  },
 {
    shapeName: "A-Style",
    chordType: ChordType.MAJ7,
    rootStringIndex: 0,
    stringOffsets: [0, 0, 2, 2],
    fingers:       [1, 1, 3, 4],
    barres: [{ relativeFret: 0, stringStart: 0, stringEnd: 3}],
  },

{
    shapeName: "E-Style",
    chordType: ChordType.MAJOR,
    rootStringIndex: 1,
    stringOffsets: [2, 0, 0, 2],
    fingers:       [3, 1, 1, 4],
    barres: [{ relativeFret: 0, stringStart: 1, stringEnd: 3}],
  },
 {
    shapeName: "E-Style",
    chordType: ChordType.MINOR,
    rootStringIndex: 1,
    stringOffsets: [2, 0, 0, 1],
    fingers:       [3, 1, 1, 2],
    barres: [{ relativeFret: 0, stringStart: 1, stringEnd: 3}],
  },
 {
    shapeName: "E-Style",
    chordType: ChordType.DOM7,
    rootStringIndex: 1,
    stringOffsets: [2, 0, 3, 2],
    fingers:       [2, 1, 4, 3],
    barres: [{ relativeFret: 0, stringStart: 1, stringEnd: 1}],
  },
 {
    shapeName: "E-Style",
    chordType: ChordType.MIN7,
    rootStringIndex: 1,
    stringOffsets: [2, 0, 3, 1],
    fingers:       [3, 1, 4, 2],
    barres: [{ relativeFret: 0, stringStart: 1, stringEnd: 1}],
  },
 {
    shapeName: "E-Style",
    chordType: ChordType.MAJ7,
    rootStringIndex: 1,
    stringOffsets: [2, 0, 4, 2],
    fingers:       [4, 1, 4, 2],
    barres: [{ relativeFret: 0, stringStart: 1, stringEnd: 1}],
  },

  
 {
    shapeName: "Jethro",
    chordType: ChordType.MAJOR,
    rootStringIndex: 0,
    stringOffsets: [0, 0, 2, -1],
    fingers:       [1, 1, 3, -1],
    barres: [{ relativeFret: 0, stringStart: 0, stringEnd: 2}],
  },
 {
    shapeName: "Jethro",
    chordType: ChordType.MINOR,
    rootStringIndex: 0,
    stringOffsets: [0, 0, 1, -1],
    fingers:       [1, 1, 2, -1],
    barres: [{ relativeFret: 0, stringStart: 0, stringEnd: 2}],
  },

];
export const mandola_moveable_chord_library: MoveableChordTemplate[] = mandolin_moveable_chord_library;

export const MOVEABLE_CHORD_LIBRARIES: Partial<Record<InstrumentName, MoveableChordTemplate[]>> = {
  "Guitar":   guitar_moveable_chord_library,
  "Mandolin": mandolin_moveable_chord_library,
  "Mandola":  mandola_moveable_chord_library,
};

/** Infers ChordType from a chord name string. */
function detectChordType(chordName: string): ChordType {
  const afterRoot = chordName.replace(/^[A-G][#b]?\s*/, "");
  if (/^(m(?!aj)|min).*7/i.test(afterRoot)) return ChordType.MIN7;
  if (/maj.*7/i.test(afterRoot)) return ChordType.MAJ7;
  if (/^(7|dom)/i.test(afterRoot)) return ChordType.DOM7;
  if (/^(m(?!aj)|min)/i.test(afterRoot)) return ChordType.MINOR;
  return ChordType.MAJOR;
}

export interface MoveableChordResult {
  chord: Chord;
  shapeName: string;
  title: string;
  rootFret: number;
  rootStringIndex: number;
}

/**
 * Returns all moveable chord shapes for the given instrument, root note, and chord type.
 * Shapes are sorted by root fret ascending.
 * @param chordType - If provided, used directly; otherwise inferred from chordName.
 */
export function getMoveableShapes(
  instrumentName: InstrumentName,
  chordName: string,
  tuning: Tuning,
  chordType?: ChordType
): MoveableChordResult[] {
  const library = MOVEABLE_CHORD_LIBRARIES[instrumentName] ?? [];
  const rootMatch = chordName.match(/^([A-G][#b]?)/);
  if (!rootMatch) return [];

  const rootNoteName = rootMatch[1];
  const rootNoteIndex = getKeyIndex(rootNoteName);
  if (rootNoteIndex === -1) return [];

  const effectiveType = chordType ?? detectChordType(chordName);
  const results: MoveableChordResult[] = [];

  for (const template of library) {
    if (template.chordType !== effectiveType) continue;

    const openNote = tuning.tuning[template.rootStringIndex];
    const rootFret = ((rootNoteIndex - openNote) + 12) % 12;

    const strings = template.stringOffsets.map((offset) =>
      offset === -1 ? -1 : rootFret + offset
    );
    const barreSpecs: BarreSpec[] = template.barres.map((b) => ({
      fret: rootFret + b.relativeFret,
      stringStart: b.stringStart,
      stringEnd: b.stringEnd,
    }));

    const title = `${rootNoteName} ${effectiveType as string} (${template.shapeName})`;

    results.push({
      chord: new Chord(title, strings, [...template.fingers], barreSpecs, effectiveType, rootNoteName as NoteName),
      shapeName: template.shapeName,
      title,
      rootFret,
      rootStringIndex: template.rootStringIndex,
    });
  }

  results.sort((a, b) => a.rootFret - b.rootFret);
  return results;
}

/** Returns the easiest (lowest root fret) moveable shape, or null if none found. */
export function getEasiestMoveableShape(
  instrumentName: InstrumentName,
  chordName: string,
  tuning: Tuning,
  chordType?: ChordType
): MoveableChordResult | null {
  return getMoveableShapes(instrumentName, chordName, tuning, chordType)[0] ?? null;
}

/** @deprecated Use getMoveableShapes("Guitar", ...) */
export function getMoveableGuitarShapes(
  chordName: string,
  tuning: Tuning,
  chordType?: ChordType
): MoveableChordResult[] {
  return getMoveableShapes("Guitar", chordName, tuning, chordType);
}

/** @deprecated Use getEasiestMoveableShape("Guitar", ...) */
export function getEasiestMoveableGuitarShape(
  chordName: string,
  tuning: Tuning,
  chordType?: ChordType
): MoveableChordResult | null {
  return getEasiestMoveableShape("Guitar", chordName, tuning, chordType);
}
