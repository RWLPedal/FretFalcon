import { ChordQuality, RomanEntry } from './music_types';

const ROMAN_UPPER = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

export class Scale {
  name: string;
  // Degrees is also the semitones above root.
  degrees: Array<number>;

  constructor(name: string, degrees: Array<number>) {
    this.name = name;
    this.degrees = degrees;
  }

  // ─── Algorithmic modal harmony ────────────────────────────────────────────────
  // Only valid for 7-note scales. Throws on others.

  private require7(): void {
    if (this.degrees.length !== 7)
      throw new Error(`Scale '${this.name}' must have 7 degrees for modal harmony`);
  }

  getChordQualityAt(i: number): ChordQuality {
    this.require7();
    const n = this.degrees.length;
    const root  = this.degrees[i];
    const third = this.degrees[(i + 2) % n];
    const fifth = this.degrees[(i + 4) % n];
    const t = (third - root + 12) % 12;
    const f = (fifth - root + 12) % 12;
    if (t === 4 && f === 7) return ChordQuality.Major;
    if (t === 3 && f === 7) return ChordQuality.Minor;
    if (t === 3 && f === 6) return ChordQuality.Diminished;
    if (t === 4 && f === 8) return ChordQuality.Augmented;
    return ChordQuality.Unknown;
  }

  get7thQualityAt(i: number): ChordQuality {
    this.require7();
    const n = this.degrees.length;
    const root    = this.degrees[i];
    const third   = this.degrees[(i + 2) % n];
    const seventh = this.degrees[(i + 6) % n];
    const t = (third - root + 12) % 12;
    const s = (seventh - root + 12) % 12;
    if (s === 11 && t === 4) return ChordQuality.Major7th;
    if (s === 11 && t === 3) return ChordQuality.Major7th; // minor-major 7th; approximate
    if (s === 10 && t === 4) return ChordQuality.Dominant7th;
    if (s === 10 && t === 3) return ChordQuality.Minor7th;
    return ChordQuality.Unknown;
  }

  getRomanNumeralAt(i: number): string {
    const q = this.getChordQualityAt(i);
    const base = ROMAN_UPPER[i];
    switch (q) {
      case ChordQuality.Major:      return base;
      case ChordQuality.Minor:      return base.toLowerCase();
      case ChordQuality.Diminished: return base.toLowerCase() + '°';
      case ChordQuality.Augmented:  return base + '+';
      default: return base;
    }
  }

  get7thRomanNumeralAt(i: number): string {
    const base = this.getRomanNumeralAt(i);
    const q7 = this.get7thQualityAt(i);
    switch (q7) {
      case ChordQuality.Major7th:    return base + 'maj7';
      case ChordQuality.Dominant7th: return base + '7';
      case ChordQuality.Minor7th:    return base + '7';
      default: return base + '7';
    }
  }

  private static qualityToSuffix(q: ChordQuality): string {
    switch (q) {
      case ChordQuality.Major:       return 'MAJ';
      case ChordQuality.Minor:       return 'MIN';
      case ChordQuality.Diminished:  return 'DIM';
      case ChordQuality.Augmented:   return 'AUG';
      case ChordQuality.Major7th:    return 'MAJ7';
      case ChordQuality.Minor7th:    return 'MIN7';
      case ChordQuality.Dominant7th: return 'DOM7';
      default: return 'MAJ';
    }
  }

  getChordSuffixAt(i: number): string {
    return Scale.qualityToSuffix(this.getChordQualityAt(i));
  }

  /** Returns RomanEntry[] for all 7 scale degrees.
   *  If include7ths is true (default), also appends 7th-chord entries. */
  generateRomanEntries(include7ths = true): RomanEntry[] {
    this.require7();
    const entries: RomanEntry[] = [];
    for (let i = 0; i < 7; i++) {
      const quality = this.getChordQualityAt(i);
      entries.push({
        roman:       this.getRomanNumeralAt(i),
        degree:      this.degrees[i],
        suffix:      this.getChordSuffixAt(i),
        quality,
        degreeIndex: i,
      });
    }
    if (include7ths) {
      for (let i = 0; i < 7; i++) {
        const quality = this.get7thQualityAt(i);
        if (quality === ChordQuality.Unknown) continue;
        entries.push({
          roman:       this.get7thRomanNumeralAt(i),
          degree:      this.degrees[i],
          suffix:      Scale.qualityToSuffix(quality),
          quality,
          degreeIndex: i,
        });
      }
    }
    return entries;
  }
}


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
  DOUBLE_HARMONIC_MAJOR: new Scale("Double Harmonic Major", [0, 1, 4, 5, 7, 8, 11]),
};

// Derived from scales — display name → internal key. Stays in sync automatically.
export const scale_names: Record<string, string> = Object.keys(scales).reduce(
  (acc, key) => { acc[scales[key as keyof typeof scales].name] = key; return acc; },
  {} as Record<string, string>
);