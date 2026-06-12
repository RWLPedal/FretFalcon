import { Chord, ChordType, BarreSpec } from "./chords";
import { InstrumentName, Tuning } from "./fretboard";
import { getKeyIndex } from "./fretboard_utils";
import type { NoteName } from "./music_types";
import { NoteName as N } from "./music_types";

/**
 * Moveable barre chord templates for 6-string guitar, defined at fret 0.
 * Transpose all non-muted offsets by the root fret to get actual fret numbers.
 * E-Shape: root on string 0 (low E). A-Shape: root on string 1 (A string).
 */
export const guitar_moveable_chord_library: Chord[] = [
  // --- E-Shape ---
  Chord.template(
    "E-Shape",
    [0, 2, 2, 1, 0, 0],
    [1, 3, 4, 2, 1, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 5 }],
    ChordType.MAJOR,
    0,
    N.E,
  ),
  Chord.template(
    "E-Shape",
    [0, 2, 2, 0, 0, 0],
    [1, 3, 4, 1, 1, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 5 }],
    ChordType.MINOR,
    0,
    N.E,
  ),
  Chord.template(
    "E-Shape",
    [0, 2, 0, 1, 0, 0],
    [1, 3, 1, 2, 1, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 5 }],
    ChordType.DOM7,
    0,
    N.E,
  ),
  Chord.template(
    "E-Shape",
    [0, 2, 0, 0, 0, 0],
    [1, 3, 1, 1, 1, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 5 }],
    ChordType.MIN7,
    0,
    N.E,
  ),
  // Emaj7 shape: A at +2, D at +1, G at +1, B and e at root (barre)
  Chord.template(
    "E-Shape",
    [0, 2, 1, 1, 0, 0],
    [1, 4, 2, 3, 1, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 5 }],
    ChordType.MAJ7,
    0,
    N.E,
  ),
  // Finger 1 covers E and G strings at root fret; 2 and 3 step up on A and D.
  Chord.template(
    "E-Shape",
    [0, 1, 2, 0, -1, -1],
    [1, 2, 3, 1, -1, -1],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.DIM,
    0,
    N.E,
  ),

  // --- A-Shape ---
  Chord.template(
    "A-Shape",
    [-1, 0, 2, 2, 2, 0],
    [-1, 1, 3, 3, 3, 1],
    [{ fret: 0, stringStart: 1, stringEnd: 5 }],
    ChordType.MAJOR,
    1,
    N.A,
  ),
  Chord.template(
    "A-Shape",
    [-1, 0, 2, 2, 1, 0],
    [-1, 1, 3, 4, 2, 1],
    [{ fret: 0, stringStart: 1, stringEnd: 5 }],
    ChordType.MINOR,
    1,
    N.A,
  ),
  // A7 shape: D at +2, G at root (barre), B at +2, e at root (barre)
  Chord.template(
    "A-Shape",
    [-1, 0, 2, 0, 2, 0],
    [-1, 1, 2, 1, 3, 1],
    [{ fret: 0, stringStart: 1, stringEnd: 5 }],
    ChordType.DOM7,
    1,
    N.A,
  ),
  // Am7 shape: D at +2, G at root, B at +1, e at root (barre)
  Chord.template(
    "A-Shape",
    [-1, 0, 2, 0, 1, 0],
    [-1, 1, 3, 1, 2, 1],
    [{ fret: 0, stringStart: 1, stringEnd: 5 }],
    ChordType.MIN7,
    1,
    N.A,
  ),
  // Amaj7 shape: D at +2, G at +1, B at +2, e at root (barre)
  Chord.template(
    "A-Shape",
    [-1, 0, 2, 1, 2, 0],
    [-1, 1, 3, 2, 4, 1],
    [{ fret: 0, stringStart: 1, stringEnd: 5 }],
    ChordType.MAJ7,
    1,
    N.A,
  ),
  // No barre: D at +1, G at +2, B at +1 (D and B share fret but aren't adjacent).
  Chord.template(
    "A-Shape",
    [-1, 0, 1, 2, 1, -1],
    [-1, 1, 2, 4, 3, -1],
    [],
    ChordType.DIM,
    1,
    N.A,
  ),

  // --- Sus2 ---
  Chord.template(
    "A-Shape",
    [-1, 0, 2, 2, 0, 0],
    [-1, 1, 3, 4, 1, 1],
    [{ fret: 0, stringStart: 1, stringEnd: 5 }],
    ChordType.SUS2,
    1,
    N.A,
  ),
  Chord.template(
    "D-Shape",
    [-1, -1, 0, 2, 3, 0],
    [-1, -1, 1, 3, 4, 1],
    [{ fret: 0, stringStart: 2, stringEnd: 5 }],
    ChordType.SUS2,
    2,
    N.D,
  ),

  // --- Sus4 ---
  Chord.template(
    "E-Shape",
    [0, 2, 2, 2, 0, 0],
    [1, 3, 3, 3, 1, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 5 }],
    ChordType.SUS4,
    0,
    N.E,
  ),
  Chord.template(
    "A-Shape",
    [-1, 0, 2, 2, 3, 0],
    [-1, 1, 2, 3, 4, 1],
    [{ fret: 0, stringStart: 1, stringEnd: 5 }],
    ChordType.SUS4,
    1,
    N.A,
  ),
  Chord.template(
    "D-Shape",
    [-1, -1, 0, 2, 3, 3],
    [-1, -1, 1, 2, 3, 4],
    [{ fret: 0, stringStart: 2, stringEnd: 5 }],
    ChordType.SUS4,
    2,
    N.D,
  ),

  // --- Add9 ---
  Chord.template(
    "D-Shape",
    [-1, -1, 2, 1, 0, 2],
    [-1, -1, 3, 2, 1, 4],
    [],
    ChordType.ADD9,
    2,
    N.E,
    2,
  ),
  Chord.template(
    "A-Shape",
    [-1, 0, 2, 4, 2, 0],
    [-1, 1, 2, 4, 3, 1],
    [{ fret: 0, stringStart: 1, stringEnd: 5 }],
    ChordType.ADD9,
    1,
    N.A,
  ),
  Chord.template(
    "Am-Shape",
    [-1, 0, 2, 4, 1, 0],
    [-1, 1, 2, 4, 3, 1],
    [{ fret: 0, stringStart: 1, stringEnd: 5 }],
    ChordType.MINOR_ADD9,
    1,
    N.A,
  ),
];

export const mandolin_moveable_chord_library: Chord[] = [
  Chord.template(
    "A-Style",
    [0, 0, 2, 3],
    [1, 1, 3, 4],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MAJOR,
    0,
    N.G,
  ),
  Chord.template(
    "A-Style",
    [0, 0, 1, 3],
    [1, 1, 2, 4],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MINOR,
    0,
    N.G,
  ),
  Chord.template(
    "A-Style",
    [0, 0, 2, 1],
    [1, 1, 3, 2],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.DOM7,
    0,
    N.G,
  ),
  Chord.template(
    "A-Style",
    [0, 0, 1, 1],
    [1, 1, 2, 3],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MIN7,
    0,
    N.G,
  ),
  Chord.template(
    "A-Style",
    [0, 0, 2, 2],
    [1, 1, 3, 4],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MAJ7,
    0,
    N.G,
  ),

  Chord.template(
    "E-Style",
    [2, 0, 0, 2],
    [3, 1, 1, 4],
    [{ fret: 0, stringStart: 1, stringEnd: 3 }],
    ChordType.MAJOR,
    1,
    N.D,
  ),
  Chord.template(
    "E-Style",
    [2, 0, 0, 1],
    [3, 1, 1, 2],
    [{ fret: 0, stringStart: 1, stringEnd: 3 }],
    ChordType.MINOR,
    1,
    N.D,
  ),
  Chord.template(
    "E-Style",
    [2, 0, 3, 2],
    [2, 1, 4, 3],
    [{ fret: 0, stringStart: 1, stringEnd: 1 }],
    ChordType.DOM7,
    1,
    N.D,
  ),
  Chord.template(
    "E-Style",
    [2, 0, 3, 1],
    [3, 1, 4, 2],
    [{ fret: 0, stringStart: 1, stringEnd: 1 }],
    ChordType.MIN7,
    1,
    N.D,
  ),
  Chord.template(
    "E-Style",
    [2, 0, 4, 2],
    [4, 1, 4, 2],
    [{ fret: 0, stringStart: 1, stringEnd: 1 }],
    ChordType.MAJ7,
    1,
    N.D,
  ),

  Chord.template(
    "Jethro",
    [0, 0, 2, -1],
    [1, 1, 3, -1],
    [{ fret: 0, stringStart: 0, stringEnd: 2 }],
    ChordType.MAJOR,
    0,
    N.G,
  ),
  Chord.template(
    "Jethro",
    [0, 0, 1, -1],
    [1, 1, 2, -1],
    [{ fret: 0, stringStart: 0, stringEnd: 2 }],
    ChordType.MINOR,
    0,
    N.G,
  ),
];

export const mandola_moveable_chord_library: Chord[] =
  mandolin_moveable_chord_library;

export const ukulele_moveable_chord_library: Chord[] = [
  Chord.template(
    "C-Shape",
    [0, 0, 0, 3],
    [1, 1, 1, 4],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MAJOR,
    1,
    N.C,
  ),
  // Root is on string 2 (E string), 1 fret above the barre.
  // strings[rootStringIndex=2] == rootFretOffset == 1.
  Chord.template(
    "A-Shape",
    [2, 1, 0, 0],
    [3, 2, 1, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MAJOR,
    3,
    N.A,
  ),
  Chord.template(
    "F-Shape",
    [2, 0, 1, 0],
    [3, 1, 2, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MAJOR,
    2,
    N.F,
    1,
  ),
  Chord.template(
    "C-Shape",
    [0, 0, 0, 3],
    [1, 1, 1, 4],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MAJOR,
    2,
    N.C,
    1,
  ),
  Chord.template(
    "A Minor Shape",
    [2, 0, 0, 0],
    [3, 1, 1, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MINOR,
    3,
    N.A,
  ),
  Chord.template(
    "D Minor Shape",
    [2, 2, 1, 0],
    [4, 3, 2, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MINOR,
    3,
    N.D,
  ),
  Chord.template(
    "C7 Shape",
    [0, 0, 0, 1],
    [1, 1, 1, 2],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.DOM7,
    1,
    N.C,
  ),
  Chord.template(
    "A7 Shape",
    [0, 1, 0, 0],
    [1, 2, 1, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.DOM7,
    3,
    N.A,
  ),
  Chord.template(
    "Am7 Shape",
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MIN7,
    3,
    N.A,
  ),
  Chord.template(
    "Cmaj7 Shape",
    [0, 0, 0, 2],
    [1, 1, 1, 4],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MAJ7,
    1,
    N.C,
  ),
  Chord.template(
    "Amaj7 Shape",
    [1, 1, 0, 0],
    [3, 2, 1, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MAJ7,
    3,
    N.A,
  ),
];

// Charango GCEAE (re-entrant): strings 0-4 = G(10), C(3), E(7), A(0), E(7).
// Root on string 3 (A). At baseFret=0 the open A string is the root, so templateNote = N.A.
export const charango_moveable_chord_library: Chord[] = [
  // Major: G→root, C→3rd, E/A/E→5th-root-5th (barre strings 2-4)
  Chord.template(
    "Barre",
    [2, 1, 0, 0, 0],
    [3, 2, 1, 1, 1],
    [{ fret: 0, stringStart: 2, stringEnd: 4 }],
    ChordType.MAJOR,
    3,
    N.A,
  ),
  Chord.template(
    "Barre",
    [0, 0, 0, 3, 3],
    [1, 1, 1, 3, 4],
    [{ fret: 0, stringStart: 0, stringEnd: 2 }],
    ChordType.MAJOR,
    1,
    N.A,
  ),
  // Minor: G→root, C/E/A/E→b3-5th-root-5th (barre strings 1-4)
  Chord.template(
    "Barre",
    [2, 0, 0, 0, 0],
    [3, 1, 1, 1, 1],
    [{ fret: 0, stringStart: 1, stringEnd: 4 }],
    ChordType.MINOR,
    3,
    N.A,
  ),
  // Dom7: G→b7, C→3rd (+1), E/A/E→5th-root-5th (full barre)
  Chord.template(
    "Barre",
    [0, 1, 0, 0, 0],
    [1, 2, 1, 1, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 4 }],
    ChordType.DOM7,
    3,
    N.A,
  ),
  // Min7: all strings at barre — G→b7, C→b3, E→5th, A→root, E→5th
  Chord.template(
    "Barre",
    [0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 4 }],
    ChordType.MIN7,
    3,
    N.A,
  ),
  // Min7: all strings at barre — G→b7, C→b3, E→5th, A→root, E→5th
  Chord.template(
    "Barre",
    [0, 0, 0, 0, 3],
    [1, 1, 1, 1, 3],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MIN7,
    3,
    N.A,
  ),
  Chord.template(
    "Barre",
    [0, 0, 0, 2, 0],
    [1, 1, 1, 2, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 4 }],
    ChordType.MAJ7,
    1,
    N.A,
  ),
  Chord.template(
    "Barre",
    [-1, 0, 0, 2, 3],
    [-1, 1, 1, 2, 3],
    [{ fret: 0, stringStart: 1, stringEnd: 4 }],
    ChordType.MAJ7,
    1,
    N.A,
  ),
];

export const MOVEABLE_CHORD_LIBRARIES: Partial<
  Record<InstrumentName, Chord[]>
> = {
  [InstrumentName.Guitar]: guitar_moveable_chord_library,
  [InstrumentName.Mandolin]: mandolin_moveable_chord_library,
  [InstrumentName.Mandola]: mandola_moveable_chord_library,
  [InstrumentName.TenorGuitar]: mandola_moveable_chord_library, // CGDA — same shapes as Mandola
  [InstrumentName.TenorBanjo]: mandola_moveable_chord_library, // CGDA — same shapes as Mandola
  [InstrumentName.Ukulele]: ukulele_moveable_chord_library,
  [InstrumentName.Charango]: charango_moveable_chord_library,
};

/** Infers ChordType from a chord name string. */
function detectChordType(chordName: string): ChordType {
  const afterRoot = chordName.replace(/^[A-G][#b]?\s*/, "");
  if (/^(m(?!aj)|min).*7/i.test(afterRoot)) return ChordType.MIN7;
  if (/maj.*7/i.test(afterRoot)) return ChordType.MAJ7;
  if (/^(7|dom)/i.test(afterRoot)) return ChordType.DOM7;
  if (/^(m(?!aj)|min)/i.test(afterRoot)) return ChordType.MINOR;
  if (/^(dim|°)/i.test(afterRoot)) return ChordType.DIM;
  return ChordType.MAJOR;
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
  chordType?: ChordType,
): Chord[] {
  const library = MOVEABLE_CHORD_LIBRARIES[instrumentName] ?? [];
  const rootMatch = chordName.match(/^([A-G][#b]?)/);
  if (!rootMatch) return [];

  const rootNoteName = rootMatch[1];
  const rootNoteIndex = getKeyIndex(rootNoteName);
  if (rootNoteIndex === -1) return [];

  const effectiveType = chordType ?? detectChordType(chordName);
  const results: Chord[] = [];

  for (const template of library) {
    if (template.chordType !== effectiveType) continue;

    const rootStringIndex = template.rootStringIndex!;
    const openNote = tuning.notes[rootStringIndex];
    const rootFretOffset = template.rootFretOffset ?? 0;
    // baseFret is the barre/anchor fret; rootFretOffset frets above it is the root note.
    const baseFret = (rootNoteIndex - openNote - rootFretOffset + 24) % 12;

    const strings = template.strings.map((offset) =>
      offset === -1 ? -1 : baseFret + offset,
    );
    const barreSpecs: BarreSpec[] = (template.barre ?? []).map((b) => ({
      fret: baseFret + b.fret,
      stringStart: b.stringStart,
      stringEnd: b.stringEnd,
    }));

    const title = `${rootNoteName} ${effectiveType as string} (${template.shapeName})`;

    const chord = new Chord(
      title,
      strings,
      [...template.fingers],
      barreSpecs,
      effectiveType,
      rootNoteName as NoteName,
    );
    chord.shapeName = template.shapeName;
    chord.rootStringIndex = rootStringIndex;
    results.push(chord);
  }

  results.sort(
    (a, b) => a.strings[a.rootStringIndex!] - b.strings[b.rootStringIndex!],
  );
  return results;
}

/** Returns the easiest (lowest root fret) moveable shape, or null if none found. */
export function getEasiestMoveableShape(
  instrumentName: InstrumentName,
  chordName: string,
  tuning: Tuning,
  chordType?: ChordType,
): Chord | null {
  return (
    getMoveableShapes(instrumentName, chordName, tuning, chordType)[0] ?? null
  );
}
