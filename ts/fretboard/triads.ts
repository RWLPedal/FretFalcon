import { FretboardConfig, Fretboard } from "./fretboard";
import { NOTE_NAMES_FROM_A, getKeyIndex, getIntervalLabel, START_PX } from "./instrument_utils";
import { NoteRenderData, LineData } from "./fretboard";

export type TriadQuality = "Major" | "Minor" | "Diminished" | "Augmented";
export type TriadInversion = "Root" | "1st" | "2nd";

/** Map of triad qualities to their intervals (in semitones relative to root). */
export const TRIAD_INTERVALS: { [key in TriadQuality]: number[] } = {
  Major: [0, 4, 7], // R, M3, P5
  Minor: [0, 3, 7], // R, m3, P5
  Diminished: [0, 3, 6], // R, m3, m5
  Augmented: [0, 3, 8], // R, m3, m6
};

/** Defines a relative triad shape for a specific 3-string group. */
interface RelativeTriadShape {
  quality: TriadQuality;
  inversion: TriadInversion;
  stringGroup: [number, number, number]; // Absolute indices [low, mid, high]
  /** Fret offsets [low, mid, high] relative to the root note's fret. */
  relativeFrets: [number, number, number];
  /** Index within stringGroup (0, 1, or 2) where the root note lies. */
  rootStringIndexInGroup: 0 | 1 | 2;
}

// --- Revised Catalog of Relative Triad Shapes ---
const TRIAD_SHAPE_CATALOG: RelativeTriadShape[] = [
  // === MAJOR === (R=0, M3=4, P5=7)
  // --- EAD [0,1,2] ---
  { quality: "Major", inversion: "Root", stringGroup: [0, 1, 2], relativeFrets: [3, 2, 0], rootStringIndexInGroup: 0 },
  { quality: "Major", inversion: "2nd", stringGroup: [0, 1, 2], relativeFrets: [0, 0, -1], rootStringIndexInGroup: 1 },
  { quality: "Major", inversion: "1st", stringGroup: [0, 1, 2], relativeFrets: [2, 0, 0], rootStringIndexInGroup: 2 },

  // --- ADG [1,2,3] ---
  { quality: "Major", inversion: "Root", stringGroup: [1, 2, 3], relativeFrets: [3, 2, 0], rootStringIndexInGroup: 0 },
  { quality: "Major", inversion: "2nd", stringGroup: [1, 2, 3], relativeFrets: [0, 0, -1], rootStringIndexInGroup: 1 }, 
  { quality: "Major", inversion: "1st", stringGroup: [1, 2, 3], relativeFrets: [2, 0, 0], rootStringIndexInGroup: 2 },
 
  // --- DGB [2,3,4] ---
  { quality: "Major", inversion: "Root", stringGroup: [2, 3, 4], relativeFrets: [2, 1, 0], rootStringIndexInGroup: 0 }, 
  { quality: "Major", inversion: "2nd", stringGroup: [2, 3, 4], relativeFrets: [0, 0, 0], rootStringIndexInGroup: 1 },
  { quality: "Major", inversion: "1st", stringGroup: [2, 3, 4], relativeFrets: [1, -1, 0], rootStringIndexInGroup: 2 },

  // --- GBE [3,4,5] ---
  { quality: "Major", inversion: "Root", stringGroup: [3, 4, 5], relativeFrets: [2, 2, 0], rootStringIndexInGroup: 0 },
  { quality: "Major", inversion: "2nd", stringGroup: [3, 4, 5], relativeFrets: [-1, 0, -1], rootStringIndexInGroup: 1 },
  { quality: "Major", inversion: "1st", stringGroup: [3, 4, 5], relativeFrets: [1, 0, 0], rootStringIndexInGroup: 2 },
  

  // === MINOR === (R=0, m3=3, P5=7)
  // EAD [0,1,2]
  { quality: "Minor", inversion: "Root", stringGroup: [0, 1, 2], relativeFrets: [3, 1, 0], rootStringIndexInGroup: 0 },
  { quality: "Minor", inversion: "2nd",  stringGroup: [0, 1, 2], relativeFrets: [0, 0, -2], rootStringIndexInGroup: 1 },
  { quality: "Minor", inversion: "1st",  stringGroup: [0, 1, 2], relativeFrets: [1, 0, 0], rootStringIndexInGroup: 2 },

  // ADG [1,2,3]
  { quality: "Minor", inversion: "Root", stringGroup: [1, 2, 3], relativeFrets: [3, 1, 0], rootStringIndexInGroup: 0 },
  { quality: "Minor", inversion: "2nd",  stringGroup: [1, 2, 3], relativeFrets: [0, 0, -2], rootStringIndexInGroup: 1 },
  { quality: "Minor", inversion: "1st",  stringGroup: [1, 2, 3], relativeFrets: [1, 0, 0], rootStringIndexInGroup: 2 },

  // DGB [2,3,4] (B string adjusted)
  { quality: "Minor", inversion: "Root", stringGroup: [2, 3, 4], relativeFrets: [2, 0, 0], rootStringIndexInGroup: 0 },
  { quality: "Minor", inversion: "2nd",  stringGroup: [2, 3, 4], relativeFrets: [0, 0, -1], rootStringIndexInGroup: 1 },
  { quality: "Minor", inversion: "1st",  stringGroup: [2, 3, 4], relativeFrets: [0, -1, 0], rootStringIndexInGroup: 2 },

  // GBE [3,4,5] (B string adjusted)
  { quality: "Minor", inversion: "Root", stringGroup: [3, 4, 5], relativeFrets: [2, 1, 0], rootStringIndexInGroup: 0 }, 
  { quality: "Minor", inversion: "2nd",  stringGroup: [3, 4, 5], relativeFrets: [-1, 0, -2], rootStringIndexInGroup: 1 },
  { quality: "Minor", inversion: "1st",  stringGroup: [3, 4, 5], relativeFrets: [0, 0, 0], rootStringIndexInGroup: 2 }, 

    // === DIMINISHED === (R=0, m3=3, m5=6)
  // EAD [0,1,2]
  { quality: "Diminished", inversion: "Root", stringGroup: [0, 1, 2], relativeFrets: [4, 2, 0], rootStringIndexInGroup: 0 },
  { quality: "Diminished", inversion: "2nd",  stringGroup: [0, 1, 2], relativeFrets: [-1, 0, -2], rootStringIndexInGroup: 1 },
  { quality: "Diminished", inversion: "1st",  stringGroup: [0, 1, 2], relativeFrets: [1, -1, 0], rootStringIndexInGroup: 2 },

  // ADG [1,2,3]
  { quality: "Diminished", inversion: "Root", stringGroup: [1, 2, 3], relativeFrets: [4, 2, 0], rootStringIndexInGroup: 0 },
  { quality: "Diminished", inversion: "2nd",  stringGroup: [1, 2, 3], relativeFrets: [-1, 0, -2], rootStringIndexInGroup: 1 },
  { quality: "Diminished", inversion: "1st",  stringGroup: [1, 2, 3], relativeFrets: [1, -1, 0], rootStringIndexInGroup: 2 },

  // DGB [2,3,4] (B string adjusted)
  { quality: "Diminished", inversion: "Root", stringGroup: [2, 3, 4], relativeFrets: [2, 0, -1], rootStringIndexInGroup: 0 },
  { quality: "Diminished", inversion: "2nd",  stringGroup: [2, 3, 4], relativeFrets: [-1, 0, -1], rootStringIndexInGroup: 1 },
  { quality: "Diminished", inversion: "1st",  stringGroup: [2, 3, 4], relativeFrets: [0, -2, 0], rootStringIndexInGroup: 2 },

  // GBE [3,4,5] (B string adjusted)
  { quality: "Diminished", inversion: "Root", stringGroup: [3, 4, 5], relativeFrets: [2, 1, -1], rootStringIndexInGroup: 0 }, 
  { quality: "Diminished", inversion: "2nd",  stringGroup: [3, 4, 5], relativeFrets: [-2, 0, -2], rootStringIndexInGroup: 1 },
  { quality: "Diminished", inversion: "1st",  stringGroup: [3, 4, 5], relativeFrets: [0, -1, 0], rootStringIndexInGroup: 2 }, 

  // === Augmented === (R=0, m3=3, m6=8)
// EAD [0,1,2]
{ quality: "Augmented", inversion: "Root", stringGroup: [0, 1, 2], relativeFrets: [2, 1, 0], rootStringIndexInGroup: 0 },
{ quality: "Augmented", inversion: "2nd",  stringGroup: [0, 1, 2], relativeFrets: [2, 1, 0], rootStringIndexInGroup: 1 },
{ quality: "Augmented", inversion: "1st",  stringGroup: [0, 1, 2], relativeFrets: [2, 1, 0], rootStringIndexInGroup: 2 },

// ADG [1,2,3]
{ quality: "Augmented", inversion: "Root", stringGroup: [1, 2, 3], relativeFrets: [2, 1, 0], rootStringIndexInGroup: 0 },
{ quality: "Augmented", inversion: "2nd",  stringGroup: [1, 2, 3], relativeFrets: [2, 1, 0], rootStringIndexInGroup: 1 },
{ quality: "Augmented", inversion: "1st",  stringGroup: [1, 2, 3], relativeFrets: [2, 1, 0], rootStringIndexInGroup: 2 },

// DGB [2,3,4] (B string adjusted)
{ quality: "Augmented", inversion: "Root", stringGroup: [2, 3, 4], relativeFrets: [1, 0, 0], rootStringIndexInGroup: 0 },
{ quality: "Augmented", inversion: "2nd",  stringGroup: [2, 3, 4], relativeFrets: [1, 0, 0], rootStringIndexInGroup: 1 },
{ quality: "Augmented", inversion: "1st",  stringGroup: [2, 3, 4], relativeFrets: [1, 0, 0], rootStringIndexInGroup: 2 },

// GBE [3,4,5] (B string adjusted)
{ quality: "Augmented", inversion: "Root", stringGroup: [3, 4, 5], relativeFrets: [2, 2, 1], rootStringIndexInGroup: 0 }, 
{ quality: "Augmented", inversion: "2nd",  stringGroup: [3, 4, 5], relativeFrets: [2, 2, 1], rootStringIndexInGroup: 1 },
{ quality: "Augmented", inversion: "1st",  stringGroup: [3, 4, 5], relativeFrets: [2, 2, 1], rootStringIndexInGroup: 2 }, 
];


const INVERSION_LINE_COLORS: Record<TriadInversion, string> = {
    "Root": "#3273dc", "1st": "#48c774", "2nd": "#ff3860",
};

/**
 * Finds all occurrences of triads for a given key and quality on a specific 3-string group.
 * Uses the TRIAD_SHAPE_CATALOG for relative shapes.
 * Returns data optimized for FretboardView rendering.
 *
 * @returns An object containing arrays of notes (NoteRenderData without x/y) and lines (LineData with calculated coords).
 */
export function getTriadNotesAndLinesForGroup(
  rootNoteName: string,
  quality: TriadQuality,
  stringGroup: [number, number, number],
  fretCount: number,
  fretboardConfig: FretboardConfig // Pass the config for coordinate calculations
): { notes: NoteRenderData[], lines: LineData[] } {

  const rootNoteIndex = getKeyIndex(rootNoteName);
  if (rootNoteIndex === -1) return { notes: [], lines: [] };

  const triadIntervals = TRIAD_INTERVALS[quality];
  if (!triadIntervals) return { notes: [], lines: [] };

  const allNotesForGroup: NoteRenderData[] = [];
  const allLinesForGroup: LineData[] = [];
  const tuning = fretboardConfig.tuning.tuning;
  const scaledStartPx = START_PX * fretboardConfig.scaleFactor;

  // Instantiate a temporary Fretboard object ONLY for coordinate calculations
  const coordCalculator = new Fretboard(fretboardConfig, scaledStartPx, scaledStartPx, fretCount);

  const relevantShapes = TRIAD_SHAPE_CATALOG.filter(
      s => s.quality === quality &&
           s.stringGroup.every((val, index) => val === stringGroup[index])
  );

  // No longer needed: const targetIntervalMap = new Map<number, number>();
  // triadIntervals.forEach(interval => targetIntervalMap.set(((12+rootNoteIndex) + interval) % 12, interval));

  const addedInstances = new Set<string>(); // To prevent adding exact same shape at same location

  for (const shape of relevantShapes) {
      const anchorStringAbsoluteIndex = shape.stringGroup[shape.rootStringIndexInGroup];
      const anchorStringTuning = tuning[anchorStringAbsoluteIndex];
      const requiredNoteIndexForAnchor = (12+rootNoteIndex) % 12; // Root note index (0-11)

      for (let anchorFret = 0; anchorFret <= fretCount; anchorFret++) {
          const noteAtAnchorFret = (anchorStringTuning + anchorFret) % 12;

          if (noteAtAnchorFret === requiredNoteIndexForAnchor) {
              // Found a potential root note at anchorFret on the anchor string
              const instanceNotesData: NoteRenderData[] = [];
              const instanceCoords: { x: number; y: number }[] = []; // Store coords temporarily for lines
              let isValidInstance = true;
              // const absoluteFrets: number[] = [-1, -1, -1]; // Not needed to store

              for (let i = 0; i < 3; i++) { // Iterate through the 3 strings in the shape's group
                  const currentStringAbsoluteIndex = shape.stringGroup[i];
                  const currentStringTuning = tuning[currentStringAbsoluteIndex];
                  // Calculate the absolute fret for the current string based on the anchor fret and the relative shape
                  const absFret = anchorFret + shape.relativeFrets[i] - shape.relativeFrets[shape.rootStringIndexInGroup];
                  // absoluteFrets[i] = absFret; // Not needed

                  if (absFret < 0 || absFret > fretCount) {
                      isValidInstance = false; // Note is outside the fretboard range
                      break;
                  }
                  const resultingNoteIndex = (currentStringTuning + absFret) % 12; // Calculate the note index (0-11)

                  // Check if this note belongs to the target triad (redundant if shape catalog is correct, but good validation)
                  // const intervalOffset = (resultingNoteIndex - rootNoteIndex + 12) % 12;
                  // if (!triadIntervals.includes(intervalOffset)) {
                  //     isValidInstance = false; // Note doesn't belong to the triad
                  //     console.warn(`Shape validation failed: Shape ${shape.inversion}/${shape.quality} on ${shape.stringGroup} produced note ${MUSIC_NOTES[resultingNoteIndex][0]} (offset ${intervalOffset}) at string ${currentStringAbsoluteIndex}, fret ${absFret}, which is not in triad intervals [${triadIntervals.join(',')}] for root ${rootNoteName}`);
                  //     break;
                  // }


                  const noteName = NOTE_NAMES_FROM_A[resultingNoteIndex] ?? "?";
                   // Corrected interval calculation:
                  const intervalSemitones = (resultingNoteIndex - rootNoteIndex + 12) % 12;
                  const intervalLabel = getIntervalLabel(intervalSemitones);

                  // Get coordinates for this note *before* adding NoteRenderData
                  const coords = coordCalculator.getNoteCoordinates(currentStringAbsoluteIndex, absFret);
                  instanceCoords.push(coords); // Store for line drawing

                  // Push NoteRenderData *without* x/y
                  instanceNotesData.push({
                      fret: absFret, stringIndex: currentStringAbsoluteIndex,
                      noteName: noteName, intervalLabel: intervalLabel,
                      displayLabel: intervalLabel, // Display interval label for triads
                      colorSchemeOverride: "interval", // Use interval colors
                  });
              }

              if (isValidInstance && instanceNotesData.length === 3) {
                  // Create a unique key for this instance based on frets and strings
                  const instanceKey = instanceNotesData.map(n => `${n.stringIndex}:${n.fret}`).sort().join(',');
                  if (!addedInstances.has(instanceKey)) {
                      allNotesForGroup.push(...instanceNotesData);
                      addedInstances.add(instanceKey); // Mark as added

                      // Add connecting lines using the calculated coords
                      const lineColor = INVERSION_LINE_COLORS[shape.inversion] || 'grey';
                      // Sort COORDS based on corresponding note string index for consistent line drawing
                      const sortedCoords = instanceCoords.sort((a, b) => {
                          // Find the corresponding notes to get their string indices for sorting
                          const noteA = instanceNotesData.find(n => n.fret === instanceNotesData[instanceCoords.indexOf(a)].fret && n.stringIndex === instanceNotesData[instanceCoords.indexOf(a)].stringIndex);
                          const noteB = instanceNotesData.find(n => n.fret === instanceNotesData[instanceCoords.indexOf(b)].fret && n.stringIndex === instanceNotesData[instanceCoords.indexOf(b)].stringIndex);
                           // Basic sort if notes aren't found (shouldn't happen)
                          if (!noteA || !noteB) return 0;
                           return noteA.stringIndex - noteB.stringIndex;
                      });

                      for (let i = 0; i < 2; i++) {
                           // Use sortedCoords for line data
                          allLinesForGroup.push({
                              startX: sortedCoords[i].x, startY: sortedCoords[i].y,
                              endX: sortedCoords[i+1].x, endY: sortedCoords[i+1].y,
                              color: lineColor, dashed: true, strokeWidth: 1.5 // Use unscaled width
                          });
                      }
                  }
              }
          }
      }
  }

  return { notes: allNotesForGroup, lines: allLinesForGroup };
}