// ts/fretboard/instruments.ts
// Instrument catalog: tuning definitions, InstrumentName enum, and helpers.

// ─── Tuning ───────────────────────────────────────────────────────────────────

export interface Tuning {
  readonly name: string;
  readonly notes: ReadonlyArray<number>; // pitch-class semitones, A=0
  readonly openStringMidi?: ReadonlyArray<number>;
}

// Shared 4-string tunings
export const CGDA_TUNING: Tuning        = { name: "CGDA",         notes: [3, 10, 5, 0],              openStringMidi: [48, 55, 62, 69] };
export const GDAE_TUNING: Tuning        = { name: "GDAE",         notes: [10, 5, 0, 7],              openStringMidi: [55, 62, 69, 76] };

// Guitar tunings (6-string)
export const STANDARD_TUNING: Tuning            = { name: "Standard",            notes: [7, 0, 5, 10, 2, 7],        openStringMidi: [40, 45, 50, 55, 59, 64] };
export const DROP_D_TUNING: Tuning               = { name: "Drop D",              notes: [5, 0, 5, 10, 2, 7],        openStringMidi: [38, 45, 50, 55, 59, 64] };
export const DADGAD_TUNING: Tuning               = { name: "DADGAD",              notes: [5, 0, 5, 10, 0, 5],        openStringMidi: [38, 45, 50, 55, 57, 62] };
export const OPEN_G_TUNING: Tuning               = { name: "Open G",              notes: [5, 10, 5, 10, 2, 5],       openStringMidi: [38, 43, 50, 55, 59, 62] };
export const BARITONE_B_STANDARD_TUNING: Tuning  = { name: "Baritone B Standard", notes: [2, 7, 0, 5, 9, 2],         openStringMidi: [35, 40, 45, 50, 54, 59] };
export const BARITONE_A_STANDARD_TUNING: Tuning  = { name: "Baritone A Standard", notes: [0, 5, 10, 3, 7, 0],        openStringMidi: [33, 38, 43, 48, 52, 57] };
export const GUITALELE_ADGCEA_TUNING: Tuning     = { name: "Guitalele",           notes: [0, 5, 10, 3, 7, 0],        openStringMidi: [45, 50, 55, 60, 64, 69] };

// Bass tunings (4-string)
export const BASS_EADG_TUNING: Tuning   = { name: "EADG",         notes: [7, 0, 5, 10],             openStringMidi: [28, 33, 38, 43] };
export const BASS_BEAD_TUNING: Tuning   = { name: "BEAD (Drop)",  notes: [2, 7, 0, 5],              openStringMidi: [23, 28, 33, 38] };

// Ukulele tunings (4-string)
export const UKULELE_GCEA_TUNING: Tuning = { name: "GCEA",        notes: [10, 3, 7, 0],             openStringMidi: [67, 60, 64, 69] };

// Charango tunings (5-string)
export const CHARANGO_GCEAE_TUNING: Tuning = { name: "GCEAE",     notes: [10, 3, 7, 0, 7],          openStringMidi: [67, 72, 64, 69, 76] };

// Bouzouki tunings (4-course)
export const BOUZOUKI_GDAD_TUNING: Tuning = { name: "GDAD",       notes: [10, 5, 0, 5],             openStringMidi: [43, 50, 57, 62] };
export const BOUZOUKI_GDGD_TUNING: Tuning = { name: "GDGD",       notes: [10, 5, 10, 5],            openStringMidi: [43, 50, 55, 62] };

// Extended-range guitar tunings
export const GUITAR_7_STANDARD_TUNING: Tuning = { name: "Standard (BEADGBE)",   notes: [2, 7, 0, 5, 10, 2, 7],    openStringMidi: [35, 40, 45, 50, 55, 59, 64] };
export const GUITAR_8_STANDARD_TUNING: Tuning = { name: "Standard (F#BEADGBE)", notes: [9, 2, 7, 0, 5, 10, 2, 7], openStringMidi: [30, 35, 40, 45, 50, 55, 59, 64] };

// ─── Instrument catalog ───────────────────────────────────────────────────────

export enum InstrumentName {
  Guitar         = "Guitar",
  Bass           = "Bass",
  Ukulele        = "Ukulele",
  Mandolin       = "Mandolin",
  Mandola        = "Mandola",
  TenorGuitar    = "Tenor Guitar",
  TenorBanjo     = "Tenor Banjo",
  IrishBouzouki  = "Irish Bouzouki",
  Charango       = "Charango",
  SevenStrGuitar = "7-String Guitar",
  EightStrGuitar = "8-String Guitar",
}

export interface Instrument {
  readonly name: InstrumentName;
  readonly displayText: string;
  readonly stringCount: number;
  readonly defaultTuning: Tuning;
  readonly availableTunings: ReadonlyArray<Tuning>;
}

export const INSTRUMENTS: Record<InstrumentName, Instrument> = {
  [InstrumentName.Guitar]: {
    name: InstrumentName.Guitar,
    displayText: "Guitar (6-string)",
    stringCount: 6,
    defaultTuning: STANDARD_TUNING,
    availableTunings: [STANDARD_TUNING, DROP_D_TUNING, DADGAD_TUNING, OPEN_G_TUNING, BARITONE_B_STANDARD_TUNING, BARITONE_A_STANDARD_TUNING, GUITALELE_ADGCEA_TUNING],
  },
  [InstrumentName.Bass]: {
    name: InstrumentName.Bass,
    displayText: "Bass (4-string)",
    stringCount: 4,
    defaultTuning: BASS_EADG_TUNING,
    availableTunings: [BASS_EADG_TUNING, BASS_BEAD_TUNING],
  },
  [InstrumentName.Ukulele]: {
    name: InstrumentName.Ukulele,
    displayText: "Ukulele (4-string)",
    stringCount: 4,
    defaultTuning: UKULELE_GCEA_TUNING,
    availableTunings: [UKULELE_GCEA_TUNING],
  },
  [InstrumentName.Mandolin]: {
    name: InstrumentName.Mandolin,
    displayText: "Mandolin (4-course)",
    stringCount: 4,
    defaultTuning: GDAE_TUNING,
    availableTunings: [GDAE_TUNING],
  },
  [InstrumentName.Mandola]: {
    name: InstrumentName.Mandola,
    displayText: "Mandola (4-course)",
    stringCount: 4,
    defaultTuning: CGDA_TUNING,
    availableTunings: [CGDA_TUNING],
  },
  [InstrumentName.TenorGuitar]: {
    name: InstrumentName.TenorGuitar,
    displayText: "Tenor Guitar (4-string)",
    stringCount: 4,
    defaultTuning: CGDA_TUNING,
    availableTunings: [CGDA_TUNING, GDAE_TUNING],
  },
  [InstrumentName.TenorBanjo]: {
    name: InstrumentName.TenorBanjo,
    displayText: "Tenor Banjo (4-string)",
    stringCount: 4,
    defaultTuning: CGDA_TUNING,
    availableTunings: [CGDA_TUNING, GDAE_TUNING],
  },
  [InstrumentName.IrishBouzouki]: {
    name: InstrumentName.IrishBouzouki,
    displayText: "Irish Bouzouki (4-course)",
    stringCount: 4,
    defaultTuning: BOUZOUKI_GDAD_TUNING,
    availableTunings: [BOUZOUKI_GDAD_TUNING, BOUZOUKI_GDGD_TUNING],
  },
  [InstrumentName.Charango]: {
    name: InstrumentName.Charango,
    displayText: "Charango (5-string)",
    stringCount: 5,
    defaultTuning: CHARANGO_GCEAE_TUNING,
    availableTunings: [CHARANGO_GCEAE_TUNING],
  },
  [InstrumentName.SevenStrGuitar]: {
    name: InstrumentName.SevenStrGuitar,
    displayText: "7-String Guitar",
    stringCount: 7,
    defaultTuning: GUITAR_7_STANDARD_TUNING,
    availableTunings: [GUITAR_7_STANDARD_TUNING],
  },
  [InstrumentName.EightStrGuitar]: {
    name: InstrumentName.EightStrGuitar,
    displayText: "8-String Guitar",
    stringCount: 8,
    defaultTuning: GUITAR_8_STANDARD_TUNING,
    availableTunings: [GUITAR_8_STANDARD_TUNING],
  },
};

/** Returns all available tunings for an instrument, including any user-defined custom tunings. */
export function getAvailableTunings(
  instrument: InstrumentName,
  customTunings?: Partial<Record<string, { name: string; notes: number[] }[]>>
): Tuning[] {
  const builtIn = [...(INSTRUMENTS[instrument]?.availableTunings ?? [])];
  const custom = (customTunings?.[instrument] ?? []).map(ct => ({ name: ct.name, notes: ct.notes }));
  return [...builtIn, ...custom];
}

/** Looks up a Tuning by name for a given instrument, falling back to the instrument's default. */
export function resolveTuning(
  instrument: InstrumentName,
  tuningName: string,
  customTunings?: Partial<Record<string, { name: string; notes: number[] }[]>>
): Tuning {
  const all = getAvailableTunings(instrument, customTunings);
  return all.find(t => t.name === tuningName) ?? INSTRUMENTS[instrument]?.defaultTuning ?? STANDARD_TUNING;
}
