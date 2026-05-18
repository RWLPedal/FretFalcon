// ts/instrument/music_types.ts
// Shared music-theory enum types used across instrument features and view signals.

export enum KeyType {
  Major = 'Major',
  Minor = 'Minor',
}

export enum ChordQuality {
  Major      = 'Major',
  Minor      = 'Minor',
  Diminished = 'Diminished',
  Augmented  = 'Augmented',
  Dominant7th = 'Dominant7th',
  Major7th   = 'Major7th',
  Minor7th   = 'Minor7th',
  Unknown    = 'Unknown',
}

export enum NoteName {
  C      = 'C',
  CSharp = 'C#',
  Db     = 'Db',
  D      = 'D',
  DSharp = 'D#',
  Eb     = 'Eb',
  E      = 'E',
  F      = 'F',
  FSharp = 'F#',
  Gb     = 'Gb',
  G      = 'G',
  GSharp = 'G#',
  Ab     = 'Ab',
  A      = 'A',
  ASharp = 'A#',
  Bb     = 'Bb',
  B      = 'B',
}

// 12 chromatic semitones, C-indexed (0=C), sharps only — matches MIDI convention.
export const NOTE_NAMES: NoteName[] = [
  NoteName.C, NoteName.CSharp, NoteName.D, NoteName.DSharp,
  NoteName.E, NoteName.F, NoteName.FSharp, NoteName.G,
  NoteName.GSharp, NoteName.A, NoteName.ASharp, NoteName.B,
];

// 12 chromatic semitones, A-indexed (0=A), with conventional mixed sharp/flat spellings.
// Used by chord_tones_library to generate chord tone names.
// Flats at Bb, Eb, Ab; sharps at C#, F#, G#.
export const CHORD_TONE_NAMES_FROM_A: NoteName[] = [
  NoteName.A, NoteName.Bb, NoteName.B, NoteName.C,
  NoteName.CSharp, NoteName.D, NoteName.Eb, NoteName.E,
  NoteName.F, NoteName.FSharp, NoteName.G, NoteName.Ab,
];

/** Spec for each root note used in chord_tones_library generation. */
export const ROOT_NOTE_SPECS: ReadonlyArray<{ readonly key: string; readonly name: string; readonly noteIndex: number }> =
  CHORD_TONE_NAMES_FROM_A.map((noteName, noteIndex) => ({
    key: noteName,
    name: noteName,
    noteIndex,
  }));
