import { Chord, ChordType, BarreSpec } from "./chords";
import { InstrumentName, Tuning } from "../fretboard/instruments";
import { getKeyIndex } from "../fretboard/fretboard_utils";
import type { NoteName } from "./music_types";
import { NoteName as N } from "./music_types";

/**
 * Moveable barre chord templates for 6-string guitar, defined at fret 0.
 * Transpose all non-muted offsets by the root fret to get actual fret numbers.
 * E-Shape: root on string 0 (low E). A-Shape: root on string 1 (A string).
 */
export const guitar_moveable_chord_library: Chord[] = [
  // --- E-Shape (CAGED "E") ---
  Chord.template(
    "E-Shape",
    [0, 2, 2, 1, 0, 0],
    [1, 3, 4, 2, 1, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 5 }],
    ChordType.MAJOR,
    0,
    N.E,
    undefined,
    "E",
  ),
  Chord.template(
    "E-Shape",
    [0, 2, 2, 0, 0, 0],
    [1, 3, 4, 1, 1, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 5 }],
    ChordType.MINOR,
    0,
    N.E,
    undefined,
    "E",
  ),
  Chord.template(
    "E-Shape",
    [0, 2, 0, 1, 0, 0],
    [1, 3, 1, 2, 1, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 5 }],
    ChordType.DOM7,
    0,
    N.E,
    undefined,
    "E",
  ),
  Chord.template(
    "E-Shape",
    [0, 2, 0, 0, 0, 0],
    [1, 3, 1, 1, 1, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 5 }],
    ChordType.MIN7,
    0,
    N.E,
    undefined,
    "E",
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
    undefined,
    "E",
  ),
  Chord.template(
    "F-Shape",
    [-1, -1, 3, 2, 1, 0],
    [-1, -1, 3, 2, 1, 0],
    [],
    ChordType.MAJ7,
    2,
    N.F,
    3,
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
    undefined,
    "E",
  ),

  // --- A-Shape (CAGED "A") ---
  Chord.template(
    "A-Shape",
    [-1, 0, 2, 2, 2, 0],
    [-1, 1, 3, 3, 3, 1],
    [{ fret: 0, stringStart: 1, stringEnd: 5 }],
    ChordType.MAJOR,
    1,
    N.A,
    undefined,
    "A",
  ),
  Chord.template(
    "A-Shape",
    [-1, 0, 2, 2, 1, 0],
    [-1, 1, 3, 4, 2, 1],
    [{ fret: 0, stringStart: 1, stringEnd: 5 }],
    ChordType.MINOR,
    1,
    N.A,
    undefined,
    "A",
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
    undefined,
    "A",
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
    undefined,
    "A",
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
    undefined,
    "A",
  ),

  Chord.template(
    "Shape",
    [0, 2, 0, 0, 0, 2],
    [1, 3, 1, 1, 1, 4],
    [{ fret: 0, stringStart: 0, stringEnd: 5 }],
    ChordType.MIN9,
    0,
    N.E,
  ),

  Chord.template(
    "Shape",
    [-1, 2, 0, 2, 2, -1],
    [-1, 1, 0, 2, 3, -1],
    [],
    ChordType.MIN9,
    1,
    N.B,
    2,
  ),
  Chord.template(
    "A-Shape",
    [1, 0, 2, 0, -1, -1],
    [2, 1, 3, 1, -1, -1],
    [{ fret: 0, stringStart: 1, stringEnd: 3 }],
    ChordType.MAJ9,
    0,
    N.F,
    1,
  ),

  Chord.template(
    "Shape",
    [-1, 1, 0, 2, 1, -1],
    [-1, 2, 1, 4, 3, -1],
    [],
    ChordType.MAJ9,
    1,
    N.Bb,
    1,
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
    undefined,
    "A",
  ),

  // --- C-Shape (CAGED "C"): outer two strings muted, R-3-5-R on the middle four.
  // Root C on the A string, 3 frets above the base. Major only — the C-shape
  // sevenths/minor are stretchy as moveable forms.
  Chord.template(
    "C-Shape",
    [-1, 3, 2, 0, 1, -1],
    [-1, 4, 3, 1, 2, -1],
    [],
    ChordType.MAJOR,
    1,
    N.C,
    3,
    "C",
  ),

  // --- D-Shape (CAGED "D"): top four strings (mute low E + A) ---
  Chord.template(
    "D-Shape",
    [-1, -1, 0, 2, 3, 2],
    [-1, -1, 1, 2, 4, 3],
    [],
    ChordType.MAJOR,
    2,
    N.D,
    undefined,
    "D",
  ),
  Chord.template(
    "D-Shape",
    [-1, -1, 0, 2, 3, 1],
    [-1, -1, 1, 3, 4, 2],
    [],
    ChordType.MINOR,
    2,
    N.D,
    undefined,
    "D",
  ),
  Chord.template(
    "D-Shape",
    [-1, -1, 0, 2, 1, 2],
    [-1, -1, 1, 3, 2, 4],
    [],
    ChordType.DOM7,
    2,
    N.D,
    undefined,
    "D",
  ),
  Chord.template(
    "D-Shape",
    [-1, -1, 0, 2, 2, 2],
    [-1, -1, 1, 2, 3, 4],
    [],
    ChordType.MAJ7,
    2,
    N.D,
    undefined,
    "D",
  ),
  Chord.template(
    "D-Shape",
    [-1, -1, 0, 2, 1, 1],
    [-1, -1, 1, 3, 2, 2],
    [],
    ChordType.MIN7,
    2,
    N.D,
    undefined,
    "D",
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
    undefined,
    "A",
  ),
  Chord.template(
    "D-Shape",
    [-1, -1, 0, 2, 3, 0],
    [-1, -1, 1, 3, 4, 1],
    [{ fret: 0, stringStart: 2, stringEnd: 5 }],
    ChordType.SUS2,
    2,
    N.D,
    undefined,
    "D",
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
    undefined,
    "E",
  ),
  Chord.template(
    "A-Shape",
    [-1, 0, 2, 2, 3, 0],
    [-1, 1, 2, 3, 4, 1],
    [{ fret: 0, stringStart: 1, stringEnd: 5 }],
    ChordType.SUS4,
    1,
    N.A,
    undefined,
    "A",
  ),
  Chord.template(
    "D-Shape",
    [-1, -1, 0, 2, 3, 3],
    [-1, -1, 1, 2, 3, 4],
    [{ fret: 0, stringStart: 2, stringEnd: 5 }],
    ChordType.SUS4,
    2,
    N.D,
    undefined,
    "D",
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
    "D",
  ),
  Chord.template(
    "A-Shape",
    [-1, 0, 2, 4, 2, 0],
    [-1, 1, 2, 4, 3, 1],
    [{ fret: 0, stringStart: 1, stringEnd: 5 }],
    ChordType.ADD9,
    1,
    N.A,
    undefined,
    "A",
  ),
  Chord.template(
    "Am-Shape",
    [-1, 0, 2, 4, 1, 0],
    [-1, 1, 2, 4, 3, 1],
    [{ fret: 0, stringStart: 1, stringEnd: 5 }],
    ChordType.MINOR_ADD9,
    1,
    N.A,
    undefined,
    "A",
  ),
];

/**
 * Moveable shapes for the fifths-tuned family — mandolin (GDAE), mandola/tenor
 * guitar/tenor banjo (CGDA), etc. Because every adjacent course is a perfect
 * fifth, the inter-string interval pattern is identical for all of them, so one
 * shape library transposes correctly across the whole family (see
 * MOVEABLE_CHORD_LIBRARIES below). This is the fifths-tuning analogue of guitar's
 * CAGED / ukulele's CAGFD: instead of five lettered shapes, the symmetric tuning
 * yields a small set of closed voicings distinguished by triad inversion.
 *
 * Three 4-course closed voicings carry a `voicing` tag so buildChordVoicings() can
 * present a per-voicing family (selector + lever-rail), exactly like guitar/uke —
 * but labelled by inversion ("Root position" / "1st inversion" / "2nd inversion")
 * rather than a CAGED letter, to keep them visually distinct from the guitar/
 * ukulele systems:
 *   - "root" — root in the bass (R-5-3-R for the major), the lowest/default shape.
 *   - "inv1" — third in the bass (3-R-5-R for the major), mid-neck.
 *   - "inv2" — fifth in the bass (5-R-5-3 for the major), higher up the neck.
 * The compact 3-course "Jethro" triad stays untagged: it still appears in the
 * Positions tab but isn't offered as a separate family voicing.
 */
export const mandolin_moveable_chord_library: Chord[] = [
  Chord.template(
    "Root position",
    [0, 0, 2, 3],
    [1, 1, 3, 4],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MAJOR,
    0,
    N.G,
    undefined,
    "root",
  ),
  Chord.template(
    "Root position",
    [0, 0, 1, 3],
    [1, 1, 2, 4],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MINOR,
    0,
    N.G,
    undefined,
    "root",
  ),
  Chord.template(
    "Root position",
    [0, 0, 2, 1],
    [1, 1, 3, 2],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.DOM7,
    0,
    N.G,
    undefined,
    "root",
  ),
  Chord.template(
    "Root position",
    [0, 0, 1, 1],
    [1, 1, 2, 3],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MIN7,
    0,
    N.G,
    undefined,
    "root",
  ),
  Chord.template(
    "Root position",
    [0, 0, 2, 2],
    [1, 1, 3, 4],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MAJ7,
    0,
    N.G,
    undefined,
    "root",
  ),

  // 1st inversion: 3rd in the bass. Closed grip near the root-position shape;
  // the 5th (A course) and root (E course) stay put, only the G/D courses move
  // for the other qualities. Span ~3 frets. rootStringIndex 3 (root on E course).
  Chord.template(
    "1st inversion",
    [1, 2, 2, 0],
    [2, 3, 4, 1],
    [{ fret: 0, stringStart: 3, stringEnd: 3 }],
    ChordType.MAJOR,
    3,
    N.E,
    undefined,
    "inv1",
  ),
  Chord.template(
    "1st inversion",
    [0, 2, 2, 0],
    [1, 3, 4, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MINOR,
    3,
    N.E,
    undefined,
    "inv1",
  ),
  Chord.template(
    "1st inversion",
    [1, 0, 2, 0],
    [2, 1, 3, 1],
    [{ fret: 0, stringStart: 1, stringEnd: 3 }],
    ChordType.DOM7,
    3,
    N.E,
    undefined,
    "inv1",
  ),
  Chord.template(
    "1st inversion",
    [1, 1, 2, 0],
    [2, 3, 4, 1],
    [{ fret: 0, stringStart: 3, stringEnd: 3 }],
    ChordType.MAJ7,
    3,
    N.E,
    undefined,
    "inv1",
  ),
  Chord.template(
    "1st inversion",
    [0, 0, 2, 0],
    [1, 1, 3, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MIN7,
    3,
    N.E,
    undefined,
    "inv1",
  ),

  Chord.template(
    "2nd inversion",
    [2, 0, 0, 2],
    [3, 1, 1, 4],
    [{ fret: 0, stringStart: 1, stringEnd: 3 }],
    ChordType.MAJOR,
    1,
    N.D,
    undefined,
    "inv2",
  ),
  Chord.template(
    "2nd inversion",
    [2, 0, 0, 1],
    [3, 1, 1, 2],
    [{ fret: 0, stringStart: 1, stringEnd: 3 }],
    ChordType.MINOR,
    1,
    N.D,
    undefined,
    "inv2",
  ),
  Chord.template(
    "2nd inversion",
    [2, 0, 3, 2],
    [2, 1, 4, 3],
    [{ fret: 0, stringStart: 1, stringEnd: 1 }],
    ChordType.DOM7,
    1,
    N.D,
    undefined,
    "inv2",
  ),
  Chord.template(
    "2nd inversion",
    [2, 0, 3, 1],
    [3, 1, 4, 2],
    [{ fret: 0, stringStart: 1, stringEnd: 1 }],
    ChordType.MIN7,
    1,
    N.D,
    undefined,
    "inv2",
  ),
  Chord.template(
    "2nd inversion",
    [2, 0, 4, 2],
    [3, 1, 4, 2],
    [{ fret: 0, stringStart: 1, stringEnd: 1 }],
    ChordType.MAJ7,
    1,
    N.D,
    undefined,
    "inv2",
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

/**
 * Moveable shapes for ukulele (GCEA), organised as the "CAGFD" voicing families —
 * the ukulele analogue of guitar's CAGED. Each shape carries a `voicing` letter so
 * buildChordVoicings() can present a per-voicing family (selector + lever-rail),
 * exactly like guitar. Within a voicing every quality shares the same
 * rootStringIndex + rootFretOffset, so they all transpose to the same base fret and
 * the alteration hints stay minimal. Strings are [g, C, E, A]; templates are defined
 * at the open (base-fret 0) position.
 *
 * The C and F shapes are major-anchored (major + 7ths only): their open root sits on
 * an unfretted string, so a clean minor needs a different anchor — the same reason
 * guitar's C-shape is major-only. The A, G and D shapes carry full families.
 */
export const ukulele_moveable_chord_library: Chord[] = [
  // --- C-Shape (CAGFD "C"): root on the C string (open). Major + 7ths. ---
  Chord.template(
    "C-Shape",
    [0, 0, 0, 3],
    [1, 1, 1, 4],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MAJOR,
    1,
    N.C,
    0,
    "C",
  ),
  Chord.template(
    "C-Shape",
    [0, 0, 0, 1],
    [1, 1, 1, 2],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.DOM7,
    1,
    N.C,
    0,
    "C",
  ),
  Chord.template(
    "C-Shape",
    [0, 0, 0, 2],
    [1, 1, 1, 3],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MAJ7,
    1,
    N.C,
    0,
    "C",
  ),

  // --- A-Shape (CAGFD "A"): root on the A string (open). Full family. ---
  Chord.template(
    "A-Shape",
    [2, 1, 0, 0],
    [3, 2, 1, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MAJOR,
    3,
    N.A,
    0,
    "A",
  ),
  Chord.template(
    "A-Shape",
    [2, 0, 0, 0],
    [3, 1, 1, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MINOR,
    3,
    N.A,
    0,
    "A",
  ),
  Chord.template(
    "A-Shape",
    [0, 1, 0, 0],
    [1, 2, 1, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.DOM7,
    3,
    N.A,
    0,
    "A",
  ),
  Chord.template(
    "A-Shape",
    [1, 1, 0, 0],
    [3, 2, 1, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MAJ7,
    3,
    N.A,
    0,
    "A",
  ),
  Chord.template(
    "A-Shape",
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MIN7,
    3,
    N.A,
    0,
    "A",
  ),

  // --- G-Shape (CAGFD "G"): root on the g string (open). Full family. ---
  Chord.template(
    "G-Shape",
    [0, 2, 3, 2],
    [1, 3, 4, 2],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MAJOR,
    0,
    N.G,
    0,
    "G",
  ),
  Chord.template(
    "G-Shape",
    [0, 2, 3, 1],
    [1, 3, 4, 2],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MINOR,
    0,
    N.G,
    0,
    "G",
  ),
  Chord.template(
    "G-Shape",
    [0, 2, 1, 2],
    [1, 3, 2, 4],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.DOM7,
    0,
    N.G,
    0,
    "G",
  ),
  Chord.template(
    "G-Shape",
    [0, 2, 2, 2],
    [1, 2, 3, 4],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MAJ7,
    0,
    N.G,
    0,
    "G",
  ),
  Chord.template(
    "G-Shape",
    [0, 2, 1, 1],
    [1, 3, 2, 2],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MIN7,
    0,
    N.G,
    0,
    "G",
  ),

  // --- F-Shape (CAGFD "F"): root on the E string, 1 fret up. Major + 7ths. ---
  Chord.template(
    "F-Shape",
    [2, 0, 1, 0],
    [3, 1, 2, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MAJOR,
    2,
    N.F,
    1,
    "F",
  ),
  Chord.template(
    "F-Shape",
    [2, 3, 1, 0],
    [3, 4, 2, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.DOM7,
    2,
    N.F,
    1,
    "F",
  ),
  Chord.template(
    "F-Shape",
    [2, 4, 1, 0],
    [3, 4, 2, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MAJ7,
    2,
    N.F,
    1,
    "F",
  ),

  // --- D-Shape (CAGFD "D"): root on the C string, 2 frets up. Full family. ---
  Chord.template(
    "D-Shape",
    [2, 2, 2, 0],
    [2, 3, 4, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MAJOR,
    1,
    N.D,
    2,
    "D",
  ),
  Chord.template(
    "D-Shape",
    [2, 2, 1, 0],
    [3, 4, 2, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MINOR,
    1,
    N.D,
    2,
    "D",
  ),
  Chord.template(
    "D-Shape",
    [2, 2, 2, 3],
    [1, 2, 3, 4],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.DOM7,
    1,
    N.D,
    2,
    "D",
  ),
  Chord.template(
    "D-Shape",
    [2, 2, 2, 4],
    [1, 2, 3, 4],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MAJ7,
    1,
    N.D,
    2,
    "D",
  ),
  Chord.template(
    "D-Shape",
    [2, 2, 1, 3],
    [2, 3, 1, 4],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MIN7,
    1,
    N.D,
    2,
    "D",
  ),
];

/**
 * Moveable shapes for the charango (GCEAE, re-entrant): strings 0-4 = G(10), C(3),
 * E(7), A(0), E(7). The first four courses are *identical in pitch class* to the
 * ukulele's GCEA tuning, so the charango shares the ukulele's CAGFD movable-shape
 * geometry on strings 0-3 (octaves differ, but fret geometry is pitch-class based).
 * The only addition is the re-entrant 1st course (high E, string 4).
 *
 * Following traditional charango practice — "since the 3rd course is also tuned to E,
 * play the 1st course at the same fret as the 3rd course" — the 1st course doubles the
 * 3rd: on the low Do/La shapes the 3rd course sits on the base barre, so we extend the
 * barre to cover the 1st course (a guaranteed chord tone); on the higher Sol/Fa/Re
 * shapes the 3rd course is fretted above the base, where doubling it onto the 1st
 * course is an awkward stretch, so the 1st course is muted — the triad is already
 * complete on the lower four courses.
 *
 * Shapes are tagged with the traditional Hispanic "Forma de <nota>" names (the Spanish
 * convention for a transposed open-chord shape, e.g. "Forma de La" = the A-shape) so
 * buildChordVoicings() presents a per-voicing family selector, exactly like the guitar
 * (CAGED) and ukulele (CAGFD). Forma de Do / Forma de Fa are major-anchored (their root
 * sits on an open course); Forma de La / Sol / Re carry full families. Strings are
 * [G, C, E, A, E]; templates are defined at the open (base-fret 0) position.
 */
export const charango_moveable_chord_library: Chord[] = [
  // --- Forma de Do (C-shape): root on the C course (open). Major + 7ths. ---
  Chord.template(
    "Forma de Do",
    [0, 0, 0, 3, 0],
    [1, 1, 1, 4, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 4 }],
    ChordType.MAJOR,
    1,
    N.C,
    0,
    "do",
  ),
  Chord.template(
    "Forma de Do",
    [0, 0, 0, 1, 0],
    [1, 1, 1, 2, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 4 }],
    ChordType.DOM7,
    1,
    N.C,
    0,
    "do",
  ),
  Chord.template(
    "Forma de Do",
    [0, 0, 0, 2, 0],
    [1, 1, 1, 3, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 4 }],
    ChordType.MAJ7,
    1,
    N.C,
    0,
    "do",
  ),

  // --- Forma de La (A-shape): root on the A course (open). Full family. ---
  Chord.template(
    "Forma de La",
    [2, 1, 0, 0, 0],
    [3, 2, 1, 1, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 4 }],
    ChordType.MAJOR,
    3,
    N.A,
    0,
    "la",
  ),
  Chord.template(
    "Forma de La",
    [2, 0, 0, 0, 0],
    [3, 1, 1, 1, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 4 }],
    ChordType.MINOR,
    3,
    N.A,
    0,
    "la",
  ),
  Chord.template(
    "Forma de La",
    [0, 1, 0, 0, 0],
    [1, 2, 1, 1, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 4 }],
    ChordType.DOM7,
    3,
    N.A,
    0,
    "la",
  ),
  Chord.template(
    "Forma de La",
    [1, 1, 0, 0, 0],
    [3, 2, 1, 1, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 4 }],
    ChordType.MAJ7,
    3,
    N.A,
    0,
    "la",
  ),
  Chord.template(
    "Forma de La",
    [0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1],
    [{ fret: 0, stringStart: 0, stringEnd: 4 }],
    ChordType.MIN7,
    3,
    N.A,
    0,
    "la",
  ),

  // --- Forma de Sol (G-shape): root on the G course. 1st course muted. Full family. ---
  Chord.template(
    "Forma de Sol",
    [0, 2, 3, 2, -1],
    [1, 3, 4, 2, -1],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MAJOR,
    0,
    N.G,
    0,
    "sol",
  ),
  Chord.template(
    "Forma de Sol",
    [0, 2, 3, 1, -1],
    [1, 3, 4, 2, -1],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MINOR,
    0,
    N.G,
    0,
    "sol",
  ),
  Chord.template(
    "Forma de Sol",
    [0, 2, 1, 2, -1],
    [1, 3, 2, 4, -1],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.DOM7,
    0,
    N.G,
    0,
    "sol",
  ),
  Chord.template(
    "Forma de Sol",
    [0, 2, 2, 2, -1],
    [1, 2, 3, 4, -1],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MAJ7,
    0,
    N.G,
    0,
    "sol",
  ),
  Chord.template(
    "Forma de Sol",
    [0, 2, 1, 1, -1],
    [1, 3, 2, 2, -1],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MIN7,
    0,
    N.G,
    0,
    "sol",
  ),

  // --- Forma de Fa (F-shape): root on the E course, +1 fret. 1st course muted. Major + 7ths. ---
  Chord.template(
    "Forma de Fa",
    [2, 0, 1, 0, -1],
    [3, 1, 2, 1, -1],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MAJOR,
    2,
    N.F,
    1,
    "fa",
  ),
  Chord.template(
    "Forma de Fa",
    [2, 3, 1, 0, -1],
    [3, 4, 2, 1, -1],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.DOM7,
    2,
    N.F,
    1,
    "fa",
  ),
  Chord.template(
    "Forma de Fa",
    [2, 4, 1, 0, -1],
    [3, 4, 2, 1, -1],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MAJ7,
    2,
    N.F,
    1,
    "fa",
  ),

  // --- Forma de Re (D-shape): root on the C course, +2 frets. 1st course muted. Full family. ---
  Chord.template(
    "Forma de Re",
    [2, 2, 2, 0, -1],
    [2, 3, 4, 1, -1],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MAJOR,
    1,
    N.D,
    2,
    "re",
  ),
  Chord.template(
    "Forma de Re",
    [2, 2, 1, 0, -1],
    [3, 4, 2, 1, -1],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MINOR,
    1,
    N.D,
    2,
    "re",
  ),
  Chord.template(
    "Forma de Re",
    [2, 2, 2, 3, -1],
    [1, 2, 3, 4, -1],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.DOM7,
    1,
    N.D,
    2,
    "re",
  ),
  Chord.template(
    "Forma de Re",
    [2, 2, 2, 4, -1],
    [1, 2, 3, 4, -1],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MAJ7,
    1,
    N.D,
    2,
    "re",
  ),
  Chord.template(
    "Forma de Re",
    [2, 2, 1, 3, -1],
    [2, 3, 1, 4, -1],
    [{ fret: 0, stringStart: 0, stringEnd: 3 }],
    ChordType.MIN7,
    1,
    N.D,
    2,
    "re",
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
    chord.voicing = template.voicing;
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
