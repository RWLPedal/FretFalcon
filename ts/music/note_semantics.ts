// ts/music/note_semantics.ts

import { getKeyIndex } from "../fretboard/fretboard_utils";

export type ChordFunction = 'CT' | 'T' | 'AV';
export type PivotRole = 'PIVOT' | 'CURRENT_ONLY' | 'NEXT_ONLY';

export interface NoteSemantic {
  chordFunction?: ChordFunction; // present when scaleSemitones + currentChordSemitones provided
  pivotRole?: PivotRole;         // present when currentChordSemitones + nextChordSemitones provided
}

/** Map of A-indexed absolute semitone (0–11) → semantic classification. */
export type SemanticMap = Map<number, NoteSemantic>;

export interface SemanticInput {
  /** A-indexed absolute semitones (0–11) of all notes in the active scale. */
  scaleSemitones?: Set<number>;
  /** A-indexed absolute semitones (0–11) of the current chord's tones. */
  currentChordSemitones?: Set<number>;
  /** A-indexed absolute semitones (0–11) of the next chord's tones. */
  nextChordSemitones?: Set<number>;
}

/**
 * Purely visual rendering instructions — no semantic meaning in the field names.
 * Describes what to draw on top of a note, not why.
 */
export interface NoteRenderAnnotation {
  xOverlay?: true;  // draw a thick X centered on the note circle (avoid notes)
  outerRing?: true; // draw a ring just outside the note circle (pivot notes)
}

/**
 * Classifies each semitone present in the input sets according to:
 *   - CT / T / AV chord-tone function (when scaleSemitones + currentChordSemitones provided)
 *   - PIVOT / CURRENT_ONLY / NEXT_ONLY pivot role (when both chord sets provided)
 */
export function computeNoteSemantics(input: SemanticInput): SemanticMap {
  const map = new Map<number, NoteSemantic>();

  if (input.scaleSemitones && input.currentChordSemitones) {
    const chord = input.currentChordSemitones;
    for (const s of input.scaleSemitones) {
      let fn: ChordFunction;
      if (chord.has(s)) {
        fn = 'CT';
      } else if (chord.has((s - 1 + 12) % 12)) {
        fn = 'AV';
      } else {
        fn = 'T';
      }
      const prev = map.get(s) ?? {};
      map.set(s, { ...prev, chordFunction: fn });
    }
  }

  if (input.currentChordSemitones && input.nextChordSemitones) {
    const curr = input.currentChordSemitones;
    const next = input.nextChordSemitones;
    for (const s of curr) {
      const role: PivotRole = next.has(s) ? 'PIVOT' : 'CURRENT_ONLY';
      const prev = map.get(s) ?? {};
      map.set(s, { ...prev, pivotRole: role });
    }
    for (const s of next) {
      if (!curr.has(s)) {
        const prev = map.get(s) ?? {};
        map.set(s, { ...prev, pivotRole: 'NEXT_ONLY' });
      }
    }
  }

  return map;
}

/**
 * Converts a NoteSemantic into purely visual rendering instructions.
 * The mapping from semantic reason to visual treatment is encapsulated here,
 * keeping NoteRenderData and the canvas renderer free of music-theory concepts.
 */
export function toRenderAnnotation(sem: NoteSemantic): NoteRenderAnnotation {
  const ann: NoteRenderAnnotation = {};
  if (sem.chordFunction === 'AV') ann.xOverlay = true;
  if (sem.pivotRole === 'PIVOT') ann.outerRing = true;
  return ann;
}

/**
 * Converts an array of chord-tone note names (from chord_tones_library)
 * into a set of A-indexed absolute semitones (0–11).
 */
export function chordToneNamesToSemitones(toneNames: string[]): Set<number> {
  const result = new Set<number>();
  for (const tone of toneNames) {
    const idx = getKeyIndex(tone);
    if (idx !== -1) result.add(idx);
  }
  return result;
}

/**
 * Converts a scale's degree offsets (relative to its root) and the root's
 * A-indexed semitone into a set of absolute A-indexed semitones (0–11).
 */
export function scaleSemitonesFromDegrees(rootSemitone: number, degrees: number[]): Set<number> {
  return new Set(degrees.map(d => (rootSemitone + d) % 12));
}

