import { NOTE_NAMES_FROM_A } from "../fretboard/fretboard_utils";
import { Chord, chord_library } from "./chords";
import { ChordQuality, DiatonicMode } from "./music_types";
import { scales } from "./scales";
export { ChordQuality, DiatonicMode };

// Map ChordQuality to the guitar chord library key suffix used by the fingering library.
// Note: this format differs from chord_tones_library — guitar library keys use _MAJOR/_MINOR etc.
function qualityToGuitarSuffix(quality: ChordQuality): string {
  switch (quality) {
    case ChordQuality.Major:       return "_MAJOR";
    case ChordQuality.Minor:       return "_MINOR";
    case ChordQuality.Diminished:  return "_DIM";
    case ChordQuality.Augmented:   return "_AUG";
    case ChordQuality.Dominant7th: return "7";
    case ChordQuality.Major7th:    return "MAJ7";
    case ChordQuality.Minor7th:    return "m7";
    default: return "";
  }
}

export function getChordInKey(
  rootNoteIndex: number,
  romanNumeral: string,
  mode: DiatonicMode = DiatonicMode.Ionian,
  chordLibrary: Record<string, Chord> = chord_library
): { chordName: string; chordKey: string | null; quality: ChordQuality } {
  const entries = scales[mode].generateRomanEntries(true);
  const entry = entries.find(e => e.roman === romanNumeral);
  if (!entry) {
    console.warn(`Roman numeral "${romanNumeral}" not found in mode ${mode}.`);
    return { chordName: `${romanNumeral}?`, chordKey: null, quality: ChordQuality.Unknown };
  }

  const chordRootIndex = (rootNoteIndex + entry.degree) % 12;
  const chordRootName = NOTE_NAMES_FROM_A[chordRootIndex] ?? "?";

  let fullChordName: string;
  switch (entry.quality) {
    case ChordQuality.Major:       fullChordName = `${chordRootName}`;         break;
    case ChordQuality.Minor:       fullChordName = `${chordRootName}m`;        break;
    case ChordQuality.Diminished:  fullChordName = `${chordRootName}dim`;      break;
    case ChordQuality.Augmented:   fullChordName = `${chordRootName}aug`;      break;
    case ChordQuality.Dominant7th: fullChordName = `${chordRootName}7`;        break;
    case ChordQuality.Major7th:    fullChordName = `${chordRootName}maj7`;     break;
    case ChordQuality.Minor7th:    fullChordName = `${chordRootName}m7`;       break;
    default:                       fullChordName = `${chordRootName} (${entry.quality})`; break;
  }

  // Try to find the chord in the physical fingering library.
  const directKey = Object.keys(chordLibrary).find(key => chordLibrary[key].name === fullChordName);
  if (directKey) return { chordName: fullChordName, chordKey: directKey, quality: entry.quality };

  const suffix = qualityToGuitarSuffix(entry.quality);
  const base = chordRootName.replace("#", "sharp");
  const variations = [
    `${base}${suffix}`,
    `${base.toUpperCase()}${suffix}`,
    `${base}${suffix.toUpperCase()}`,
    entry.quality === ChordQuality.Dominant7th ? `${base}7` : null,
    entry.quality === ChordQuality.Major7th    ? `${base.toUpperCase()}MAJ7` : null,
    entry.quality === ChordQuality.Minor7th    ? `${base}m7` : null,
  ].filter((v): v is string => v !== null);

  for (const testKey of variations) {
    if (chordLibrary[testKey]) return { chordName: fullChordName, chordKey: testKey, quality: entry.quality };
  }

  console.warn(`Could not find key in chord library for: ${fullChordName} (tried: ${variations.join(', ')})`);
  return { chordName: fullChordName, chordKey: null, quality: entry.quality };
}

