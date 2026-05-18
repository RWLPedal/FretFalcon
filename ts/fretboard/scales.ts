export class Scale {
  name: string;
  // Degrees is also the semitones above root.
  degrees: Array<number>;

  constructor(name: string, degrees: Array<number>) {
    this.name = name;
    this.degrees = degrees;
  }
}

// Display names map to internal scale keys
export const scale_names: Record<string, string> = {
  // Diatonic modes
  "Major": "MAJOR",
  "Dorian": "DORIAN",
  "Phrygian": "PHRYGIAN",
  "Lydian": "LYDIAN",
  "Mixolydian": "MIXOLYDIAN",
  "Minor": "NATURAL_MINOR",
  "Locrian": "LOCRIAN",

  // Pentatonic
  "Major Pentatonic": "MAJOR_PENTATONIC",
  "Minor Pentatonic": "MINOR_PENTATONIC",

  // Blues
  "Minor Blues": "MINOR_BLUES",
  "Major Blues": "MAJOR_BLUES",

  // Other scales
  "Harmonic Minor": "HARMONIC_MINOR",
  "Melodic Minor": "MELODIC_MINOR",
  "Phrygian Dominant": "PHRYGIAN_DOMINANT",
  "Whole Tone": "WHOLE_TONE",
  "Diminished (W-H)": "DIMINISHED_WH",
  "Diminished (H-W)": "DIMINISHED_HW",
  "Lydian Dominant": "LYDIAN_DOMINANT",
  "Altered": "ALTERED",
  "Bebop Dominant": "BEBOP_DOMINANT",
  "Hungarian Minor": "HUNGARIAN_MINOR",
};

/**
 * As a reference, the interval qualities by semitone.
 * 0	Perfect Unison	P1
 * 1	Minor 2nd	m2
 * 2	Major 2nd	M2
 * 3	Minor 3rd	m3
 * 4	Major 3rd	M3
 * 5	Perfect 4th	P4
 * 6	Augmented 4th/Diminished 5th	A4/d5 (Tritone)
 * 7	Perfect 5th	P5
 * 8	Minor 6th	m6
 * 9	Major 6th	M6
 * 10	Minor 7th	m7
 * 11	Major 7th	M7
 * 12	Octave	P8
 */
// Internal scale definitions using clearer names
export const scales = {
  MAJOR: new Scale("Major", [0, 2, 4, 5, 7, 9, 11]), // Ionian
  NATURAL_MINOR: new Scale("Minor", [0, 2, 3, 5, 7, 8, 10]),
  DORIAN: new Scale("Dorian", [0, 2, 3, 5, 7, 9, 10]),
  PHRYGIAN: new Scale("Phrygian", [0, 1, 3, 5, 7, 8, 10]),
  LYDIAN: new Scale("Lydian", [0, 2, 4, 6, 7, 9, 11]),
  MIXOLYDIAN: new Scale("Mixolydian", [0, 2, 4, 5, 7, 9, 10]),
  LOCRIAN: new Scale("Locrian", [0, 1, 3, 5, 6, 8, 10]),
  MAJOR_PENTATONIC: new Scale("Major Pentatonic", [0, 2, 4, 7, 9]),
  MINOR_PENTATONIC: new Scale("Minor Pentatonic", [0, 3, 5, 7, 10]),
  MINOR_BLUES: new Scale("Minor Blues", [0, 3, 5, 6, 7, 10]),
  MAJOR_BLUES: new Scale("Major Blues", [0, 2, 3, 4, 7, 9]),
  HARMONIC_MINOR: new Scale("Harmonic Minor", [0, 2, 3, 5, 7, 8, 11]),
  MELODIC_MINOR: new Scale("Melodic Minor", [0, 2, 3, 5, 7, 9, 11]),
  PHRYGIAN_DOMINANT: new Scale("Phrygian Dominant", [0, 1, 4, 5, 7, 8, 10]),
  WHOLE_TONE: new Scale("Whole Tone", [0, 2, 4, 6, 8, 10]),
  DIMINISHED_WH: new Scale("Diminished (W-H)", [0, 2, 3, 5, 6, 8, 9, 11]),
  DIMINISHED_HW: new Scale("Diminished (H-W)", [0, 1, 3, 4, 6, 7, 9, 10]),
  LYDIAN_DOMINANT: new Scale("Lydian Dominant", [0, 2, 4, 6, 7, 9, 10]),
  ALTERED: new Scale("Altered", [0, 1, 3, 4, 6, 8, 10]),
  BEBOP_DOMINANT: new Scale("Bebop Dominant", [0, 2, 4, 5, 7, 9, 10, 11]),
  HUNGARIAN_MINOR: new Scale("Hungarian Minor", [0, 2, 3, 6, 7, 8, 11]),
};