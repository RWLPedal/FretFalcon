// ts/fretboard/capo.ts
// Shared helpers for applying a capo (driven by a linked Capo source) to fretboard views.
//
//   Transpose group (Chord, ChordProgression): capoVoicing() — keep the sounding chord,
//     re-voice it to a shape you finger above the capo (open shape of chord−capo on the
//     capo, or a moveable barre shape above the capo).
//   Clip group (Scale, Arpeggio, Triad, MultiLayerFretboard): capoIsActive + capoBarre,
//     plus a `fret < capoFret` guard in each feature's note-generation loop.

import { Chord, ChordType, findChordByRootAndType } from "../music/chords";
import type { BarreSpec } from "../music/chords";
import type { NoteName } from "../music/music_types";
import { CHORD_TONE_NAMES_FROM_A } from "../music/music_types";
import { getMoveableShapes } from "../music/moveable_shapes";
import type { InstrumentName, Tuning } from "./instruments";
import type { BarreData } from "./renderer";
import type { FretboardConfig } from "./fretboard_config";
import { getKeyIndex, NOTE_NAMES_FROM_A } from "./fretboard_utils";

/** True when a meaningful capo (fret > 0) is in effect. */
export function capoIsActive(capo?: number): boolean {
  return typeof capo === "number" && capo > 0;
}

/** Extract the root note (e.g. "A", "C#", "Bb") from a chord name like "Am" or "F#m". */
function parseRoot(name: string): string {
  const m = name.match(/^([A-G][#b]?)/);
  return m ? m[1]! : name;
}

/** Transpose a note name up by `semitones`, returning a sharp-spelled name. */
function transposeNoteName(noteStr: string, semitones: number): string {
  const idx = getKeyIndex(noteStr);
  if (idx < 0) return noteStr;
  return NOTE_NAMES_FROM_A[((((idx + semitones) % 12) + 12) % 12)]!;
}

/**
 * Transpose a chord-root name up by `semitones`, returning a conventionally-spelled
 * name (flats where customary: Bb, Eb, Ab) so it matches chord-library root keys.
 */
function transposeChordRoot(rootName: string, semitones: number): string {
  const idx = getKeyIndex(rootName);
  if (idx < 0) return rootName;
  return CHORD_TONE_NAMES_FROM_A[((((idx + semitones) % 12) + 12) % 12)]!;
}

/** Lowest fretted (non-muted, non-open) position, or 0 if the chord is all open/muted. */
function minPlayedFret(c: Chord): number {
  const fretted = c.strings.filter((f) => f > 0);
  return fretted.length ? Math.min(...fretted) : 0;
}

/** A copy of `chord` with every fretted/open position and barre shifted up by `delta` frets. */
function shiftChordFrets(chord: Chord, delta: number): Chord {
  const strings = chord.strings.map((f) => (f === -1 ? -1 : f + delta));
  const barre = (chord.barre ?? []).map((b) => ({ ...b, fret: b.fret + delta }));
  const out = new Chord(chord.name, strings, [...chord.fingers], barre.length ? barre : undefined, chord.chordType, chord.rootKey);
  out.shapeName = chord.shapeName;
  return out;
}

/** A copy of `chord` (so library references are never mutated), optionally renamed. */
function cloneChord(chord: Chord, name?: string): Chord {
  const out = new Chord(
    name ?? chord.name,
    [...chord.strings],
    [...chord.fingers],
    chord.barre ? chord.barre.map((b) => ({ ...b })) : undefined,
    chord.chordType,
    chord.rootKey,
  );
  out.shapeName = chord.shapeName;
  return out;
}

/**
 * Returns a copy of `chord` as it looks/sounds under a capo at `capoFret`: every fretted
 * or open position shifts up by capoFret, existing barres shift up, a full capo barre is
 * added at capoFret across the played (non-muted) strings, and the name/rootKey are
 * transposed up. Returns the chord unchanged when capoFret <= 0.
 */
export function applyCapoToChord(chord: Chord, capoFret: number): Chord {
  if (capoFret <= 0) return chord;

  const strings = chord.strings.map((f) => (f === -1 ? -1 : f + capoFret));
  const fingers = [...chord.fingers];

  const barre: BarreSpec[] = (chord.barre ?? []).map((b) => ({
    fret: b.fret + capoFret,
    stringStart: b.stringStart,
    stringEnd: b.stringEnd,
  }));

  // The capo itself: a barre at capoFret spanning the played (non-muted) string range.
  const playedIndices = strings
    .map((f, i) => (f === -1 ? -1 : i))
    .filter((i) => i >= 0);
  if (playedIndices.length > 0) {
    barre.unshift({
      fret: capoFret,
      stringStart: Math.min(...playedIndices),
      stringEnd: Math.max(...playedIndices),
    });
  }

  const root = parseRoot(chord.name);
  const suffix = chord.name.slice(root.length);
  const name = transposeNoteName(root, capoFret) + suffix;
  const newRootKey = transposeNoteName(String(chord.rootKey), capoFret) as NoteName;

  const capoed = new Chord(
    name,
    strings,
    fingers,
    barre.length > 0 ? barre : undefined,
    chord.chordType,
    newRootKey,
  );
  capoed.shapeName = chord.shapeName;
  return capoed;
}

/** Returns true if the chord has no barre (i.e. a "clean" open shape). */
function isOpenShape(chord: Chord): boolean {
  return !chord.barre || chord.barre.length === 0;
}

/** Lowest moveable barre shape of a chord positioned at/above `capoFret`, or null. */
function moveableAboveCapo(
  instrument: InstrumentName,
  chordName: string,
  tuning: Tuning,
  chordType: ChordType,
  capoFret: number,
): Chord | null {
  const shapes = getMoveableShapes(instrument, chordName, tuning, chordType);
  if (shapes.length === 0) return null;
  // Push any shape sitting below the capo up an octave so it clears the capo.
  const candidates = shapes.map((s) => (minPlayedFret(s) < capoFret ? shiftChordFrets(s, 12) : s));
  candidates.sort((a, b) => minPlayedFret(a) - minPlayedFret(b));
  return candidates.find((c) => minPlayedFret(c) >= capoFret) ?? candidates[0]!;
}

export interface CapoVoicingCtx {
  library: Record<string, Chord>;
  instrument: InstrumentName;
  tuning: Tuning;
}

/**
 * Re-voices a chord so it can be played with a capo at `capoFret`, keeping the *sounding*
 * chord (returned chord is labelled `displayName`):
 *   1. the open shape of (chord − capoFret) placed on the capo — clean, single capo bar; else
 *   2. a moveable barre shape of the chord positioned above the capo; else
 *   3. the chord's normal library shape (last resort).
 * Caller should only invoke this when capoFret > 0.
 */
export function capoVoicing(
  rootName: string,
  chordType: ChordType,
  displayName: string,
  capoFret: number,
  ctx: CapoVoicingCtx,
): { chord: Chord; shapeLabel: string } {
  // 1. Open shape of (chord − capo), placed on the capo.
  const shapeRoot = transposeChordRoot(rootName, -capoFret);
  const openY = findChordByRootAndType(ctx.library, shapeRoot as NoteName, chordType);
  if (openY && isOpenShape(openY)) {
    const chord = applyCapoToChord(openY, capoFret);
    chord.name = displayName;
    return { chord, shapeLabel: `${parseRoot(openY.name)} shape` };
  }

  // 2. Moveable barre shape positioned above the capo.
  const moveable = moveableAboveCapo(ctx.instrument, displayName, ctx.tuning, chordType, capoFret);
  if (moveable) {
    moveable.name = displayName;
    return { chord: moveable, shapeLabel: moveable.shapeName ?? "barre" };
  }

  // 3. Last resort: the chord's normal library shape (capo ignored for this chord).
  const openX = findChordByRootAndType(ctx.library, rootName as NoteName, chordType);
  if (openX) return { chord: cloneChord(openX, displayName), shapeLabel: "open" };

  // Nothing in the library: fall back to capo-ing whatever (barre) shape we can find.
  if (openY) {
    const chord = applyCapoToChord(openY, capoFret);
    chord.name = displayName;
    return { chord, shapeLabel: `${parseRoot(openY.name)} shape` };
  }
  return { chord: cloneChord(new Chord(displayName, [], [], undefined, chordType, rootName as NoteName)), shapeLabel: "open" };
}

/** Title for a capo'd chord diagram, e.g. "C Major (capo 5 · G shape)". */
export function capoChordTitle(chord: Chord, capoFret: number, shapeLabel: string): string {
  const root = parseRoot(chord.name);
  const typeLabel = chord.chordType !== ChordType.OTHER ? ` ${chord.chordType}` : "";
  return `${root}${typeLabel} (capo ${capoFret} · ${shapeLabel})`;
}

/** Full-width capo barre at `capoFret`, for clip-group fretboard features. */
export function capoBarre(capoFret: number, config: FretboardConfig): BarreData {
  return {
    fret: capoFret,
    stringStart: 0,
    stringEnd: config.stringCount - 1,
  };
}
