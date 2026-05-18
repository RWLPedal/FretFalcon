// ts/instrument/chord_key_resolver.ts
// Pure utility — shared by BackingTrackView and drive_slots.ts

import { KeyType } from './music_types';

export const CHORD_ROOTS = ['A', 'Bb', 'B', 'C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab'];

export interface RomanEntry { roman: string; degree: number; suffix: string; }

export const MAJOR_ROMANS: RomanEntry[] = [
  { roman: 'I',      degree: 0,  suffix: 'MAJ'  },
  { roman: 'ii',     degree: 2,  suffix: 'MIN'  },
  { roman: 'iii',    degree: 4,  suffix: 'MIN'  },
  { roman: 'IV',     degree: 5,  suffix: 'MAJ'  },
  { roman: 'V',      degree: 7,  suffix: 'MAJ'  },
  { roman: 'vi',     degree: 9,  suffix: 'MIN'  },
  { roman: 'Imaj7',  degree: 0,  suffix: 'MAJ7' },
  { roman: 'IVmaj7', degree: 5,  suffix: 'MAJ7' },
  { roman: 'ii7',    degree: 2,  suffix: 'MIN7' },
  { roman: 'vi7',    degree: 9,  suffix: 'MIN7' },
];

export const MINOR_ROMANS: RomanEntry[] = [
  { roman: 'i',      degree: 0,  suffix: 'MIN'  },
  { roman: 'III',    degree: 3,  suffix: 'MAJ'  },
  { roman: 'iv',     degree: 5,  suffix: 'MIN'  },
  { roman: 'v',      degree: 7,  suffix: 'MIN'  },
  { roman: 'VI',     degree: 8,  suffix: 'MAJ'  },
  { roman: 'VII',    degree: 10, suffix: 'MAJ'  },
  { roman: 'im7',    degree: 0,  suffix: 'MIN7' },
  { roman: 'iv7',    degree: 5,  suffix: 'MIN7' },
  { roman: 'VImaj7', degree: 8,  suffix: 'MAJ7' },
];

/**
 * Resolves a Roman numeral + key context to an absolute chord_tones_library key
 * e.g. resolveAbsoluteChordKey('IV', 'C', 'Major') → 'F_MAJ'
 * Returns null if the roman numeral is not found or root note is unrecognised.
 */
export function resolveAbsoluteChordKey(
  roman: string,
  progRootNote: string,
  progKeyType: KeyType
): string | null {
  const romans = progKeyType === KeyType.Major ? MAJOR_ROMANS : MINOR_ROMANS;
  const entry = romans.find(r => r.roman === roman);
  if (!entry) return null;
  const rootIdx = CHORD_ROOTS.indexOf(progRootNote);
  if (rootIdx === -1) return null;
  const chordRootIdx = (rootIdx + entry.degree) % 12;
  return `${CHORD_ROOTS[chordRootIdx]}_${entry.suffix}`;
}

/**
 * Returns the absolute root note name for a Roman numeral in the given key.
 * e.g. resolveChordRootNote('IV', 'C', 'Major') → 'F'
 */
export function resolveChordRootNote(
  roman: string,
  progRootNote: string,
  progKeyType: KeyType
): string | null {
  const romans = progKeyType === KeyType.Major ? MAJOR_ROMANS : MINOR_ROMANS;
  const entry = romans.find(r => r.roman === roman);
  if (!entry) return null;
  const rootIdx = CHORD_ROOTS.indexOf(progRootNote);
  if (rootIdx === -1) return null;
  return CHORD_ROOTS[(rootIdx + entry.degree) % 12];
}

/**
 * Returns whether a Roman entry's suffix represents a major-quality chord.
 * Used by bass playback to decide which scale (major/minor) to walk.
 */
export function isMajorChordSuffix(suffix: string): boolean {
  return suffix === 'MAJ' || suffix === 'MAJ7';
}
