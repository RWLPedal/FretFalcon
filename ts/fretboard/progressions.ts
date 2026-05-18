import { NOTE_NAMES_FROM_A } from "./instrument_utils";
import { Chord, chord_library } from "./chords";
import { KeyType, ChordQuality } from "./music_types";
export { KeyType, ChordQuality };

/**
 * Represents the mapping from a Roman numeral in a major key context
 * to its scale degree (0-11) and default chord quality.
 */
const MAJOR_KEY_ROMAN_MAP: { [numeral: string]: { degree: number; quality: ChordQuality } } = {
    // Diatonic Triads
    "I":    { degree: 0,  quality: ChordQuality.Major      },
    "ii":   { degree: 2,  quality: ChordQuality.Minor      },
    "iii":  { degree: 4,  quality: ChordQuality.Minor      },
    "IV":   { degree: 5,  quality: ChordQuality.Major      },
    "V":    { degree: 7,  quality: ChordQuality.Major      },
    "vi":   { degree: 9,  quality: ChordQuality.Minor      },
    "vii°": { degree: 11, quality: ChordQuality.Diminished },

    // Common Diatonic 7ths
    "Imaj7":  { degree: 0,  quality: ChordQuality.Major7th    },
    "ii7":    { degree: 2,  quality: ChordQuality.Minor7th    },
    "iii7":   { degree: 4,  quality: ChordQuality.Minor7th    },
    "IVmaj7": { degree: 5,  quality: ChordQuality.Major7th    },
    "V7":     { degree: 7,  quality: ChordQuality.Dominant7th },
    "vi7":    { degree: 9,  quality: ChordQuality.Minor7th    },
    "viiø7":  { degree: 11, quality: ChordQuality.Minor7th    },
};

/**
 * Roman numeral map for natural minor key context.
 * Scale degrees relative to the minor root: 0,2,3,5,7,8,10.
 */
const MINOR_KEY_ROMAN_MAP: { [numeral: string]: { degree: number; quality: ChordQuality } } = {
    // Diatonic Triads (Natural Minor)
    "i":    { degree: 0,  quality: ChordQuality.Minor      },
    "ii°":  { degree: 2,  quality: ChordQuality.Diminished },
    "III":  { degree: 3,  quality: ChordQuality.Major      },
    "iv":   { degree: 5,  quality: ChordQuality.Minor      },
    "v":    { degree: 7,  quality: ChordQuality.Minor      },
    "VI":   { degree: 8,  quality: ChordQuality.Major      },
    "VII":  { degree: 10, quality: ChordQuality.Major      },

    // Common Diatonic 7ths (Natural Minor)
    "im7":     { degree: 0,  quality: ChordQuality.Minor7th    },
    "iiø7":    { degree: 2,  quality: ChordQuality.Minor7th    },
    "IIImaj7": { degree: 3,  quality: ChordQuality.Major7th    },
    "iv7":     { degree: 5,  quality: ChordQuality.Minor7th    },
    "v7":      { degree: 7,  quality: ChordQuality.Minor7th    },
    "VImaj7":  { degree: 8,  quality: ChordQuality.Major7th    },
    "VII7":    { degree: 10, quality: ChordQuality.Dominant7th },
};

function qualityToChordKeySuffix(quality: ChordQuality): string {
    switch (quality) {
        case ChordQuality.Major:      return "_MAJOR";
        case ChordQuality.Minor:      return "_MINOR";
        case ChordQuality.Diminished: return "_DIM";
        case ChordQuality.Augmented:  return "_AUG";
        case ChordQuality.Dominant7th: return "7";
        case ChordQuality.Major7th:   return "MAJ7";
        case ChordQuality.Minor7th:   return "m7";
        default: return "";
    }
}

export function getChordInKey(
    rootNoteIndex: number,
    romanNumeral: string,
    keyType: KeyType = KeyType.Major,
    chordLibrary: Record<string, Chord> = chord_library
): { chordName: string; chordKey: string | null; quality: ChordQuality } {
    const map = keyType === KeyType.Minor ? MINOR_KEY_ROMAN_MAP : MAJOR_KEY_ROMAN_MAP;
    const mapEntry = map[romanNumeral];
    if (!mapEntry) {
        console.warn(`Roman numeral "${romanNumeral}" not found in map.`);
        return { chordName: `${romanNumeral}?`, chordKey: null, quality: ChordQuality.Unknown };
    }

    const chordRootIndex = (rootNoteIndex + mapEntry.degree) % 12;
    const chordRootName = NOTE_NAMES_FROM_A[chordRootIndex] ?? "?";

    let fullChordName: string;
    switch (mapEntry.quality) {
        case ChordQuality.Major:       fullChordName = `${chordRootName}`;         break;
        case ChordQuality.Minor:       fullChordName = `${chordRootName}m`;        break;
        case ChordQuality.Diminished:  fullChordName = `${chordRootName}dim`;      break;
        case ChordQuality.Augmented:   fullChordName = `${chordRootName}aug`;      break;
        case ChordQuality.Dominant7th: fullChordName = `${chordRootName}7`;        break;
        case ChordQuality.Major7th:    fullChordName = `${chordRootName}maj7`;     break;
        case ChordQuality.Minor7th:    fullChordName = `${chordRootName}m7`;       break;
        default:                       fullChordName = `${chordRootName} (${mapEntry.quality})`; break;
    }

    let potentialKey: string | null = null;

    const directKey = Object.keys(chordLibrary).find(key => chordLibrary[key].name === fullChordName);
    if (directKey) {
        potentialKey = directKey;
    } else {
        const suffix = qualityToChordKeySuffix(mapEntry.quality);
        let constructedKeyBase = chordRootName.replace("#", "sharp");

        const variationsToTest = [
            `${constructedKeyBase}${suffix}`,
            `${constructedKeyBase.toUpperCase()}${suffix}`,
            `${constructedKeyBase}${suffix.toUpperCase()}`,
            mapEntry.quality === ChordQuality.Dominant7th ? `${constructedKeyBase}7` : null,
            mapEntry.quality === ChordQuality.Major7th    ? `${constructedKeyBase.toUpperCase()}MAJ7` : null,
            mapEntry.quality === ChordQuality.Minor7th    ? `${constructedKeyBase}m7` : null,
        ].filter(v => v !== null);

        for (const testKey of variationsToTest) {
            if (testKey && chordLibrary[testKey]) {
                potentialKey = testKey;
                break;
            }
        }

        if (!potentialKey) {
            console.warn(`Could not find key in chord library for: ${fullChordName} (tried variations like ${variationsToTest.join(', ')})`);
        }
    }

    return {
        chordName: fullChordName,
        chordKey: potentialKey,
        quality: mapEntry.quality,
    };
}
