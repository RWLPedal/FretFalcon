// ts/music/chord_key_resolver.ts
// Pure utility â€” shared by BackingTrackView and drive_slots.ts

import { ChordQuality, DiatonicMode, RomanEntry } from './music_types';
import { scales } from './scales';

export { RomanEntry } from './music_types';

export const CHORD_ROOTS = ['A', 'Bb', 'B', 'C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab'];

/** Returns all RomanEntry objects for a given diatonic mode, computed from the scale. */
export function getRomansForMode(mode: DiatonicMode): RomanEntry[] {
  return scales[mode].generateRomanEntries(true);
}

// Computed constants for the two most common modes â€” kept for callers that
// still reference MAJOR_ROMANS / MINOR_ROMANS by name.
export const MAJOR_ROMANS: RomanEntry[] = getRomansForMode(DiatonicMode.Ionian);
export const MINOR_ROMANS: RomanEntry[] = getRomansForMode(DiatonicMode.Aeolian);

/**
 * Resolves a Roman numeral + mode context to an absolute chord_tones_library key.
 * e.g. resolveAbsoluteChordKey('IV', 'C', DiatonicMode.Ionian) â†’ 'F_MAJ'
 * Returns null if the roman numeral is not found or root note is unrecognised.
 */
export function resolveAbsoluteChordKey(
  roman: string,
  progRootNote: string,
  mode: DiatonicMode
): string | null {
  const entry = getRomansForMode(mode).find(r => r.roman === roman);
  if (!entry) return null;
  const rootIdx = CHORD_ROOTS.indexOf(progRootNote);
  if (rootIdx === -1) return null;
  const chordRootIdx = (rootIdx + entry.degree) % 12;
  return `${CHORD_ROOTS[chordRootIdx]}_${entry.suffix}`;
}

/**
 * Returns the absolute root note name for a Roman numeral in the given mode.
 * e.g. resolveChordRootNote('IV', 'C', DiatonicMode.Ionian) â†’ 'F'
 */
export function resolveChordRootNote(
  roman: string,
  progRootNote: string,
  mode: DiatonicMode
): string | null {
  const entry = getRomansForMode(mode).find(r => r.roman === roman);
  if (!entry) return null;
  const rootIdx = CHORD_ROOTS.indexOf(progRootNote);
  if (rootIdx === -1) return null;
  return CHORD_ROOTS[(rootIdx + entry.degree) % 12];
}

/** Returns whether a chord quality represents a major-type chord (for bass scale selection). */
export function isMajorChordQuality(quality: ChordQuality): boolean {
  return (
    quality === ChordQuality.Major ||
    quality === ChordQuality.Major7th ||
    quality === ChordQuality.Dominant7th
  );
}

