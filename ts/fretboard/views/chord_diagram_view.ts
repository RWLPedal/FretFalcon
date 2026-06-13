import { BaseView } from "../../core/base_view";
import { Chord, ChordType } from "../../music/chords";
// Import Fretboard class and necessary types/enum from fretboard.ts
import { FretboardConfig } from "../fretboard_config";
import {
  Fretboard,
  NoteRenderData,
  LineData,
  NoteIcon,
  BarreData,
} from "../renderer";
import {
  START_PX,
  OPEN_NOTE_RADIUS_FACTOR,
  NOTE_NAMES_FROM_A,
  ALL_NOTE_NAMES,
  getKeyIndex,
  getIntervalLabel,
  addHeader, // Use for external title
  addCanvas,
} from "../fretboard_utils";
import { NoteName } from "../../music/music_types";
import { ChordLabelDisplay } from "../fretboard_settings";

/**
 * Helper to get the notes in a chord.
 * @param chord - The Chord object.
 * @param config - FretboardConfig for tuning info.
 * @returns Sorted array of note names in the chord.
 */
function getChordNotes(chord: Chord, config: FretboardConfig): string[] {
  const notes = new Set<NoteName>();
  const tuning = config.tuning.notes;
  for (let i = 0; i < chord.strings.length; i++) {
    const fret = chord.strings[i];
    if (fret >= 0 && i < tuning.length) {
      const noteIndex = (tuning[i] + fret) % 12;
      notes.add(NOTE_NAMES_FROM_A[noteIndex]!);
    }
  }
  return Array.from(notes).sort(
    (a, b) => NOTE_NAMES_FROM_A.indexOf(a) - NOTE_NAMES_FROM_A.indexOf(b)
  );
}

/**
 * A View responsible for rendering a single chord diagram by configuring
 * and delegating to an internal Fretboard instance.
 */
export class ChordDiagramView extends BaseView {
  private chord: Chord;
  private title: string;
  private fretboardConfig: FretboardConfig;
  private fretboard: Fretboard; // Internal Fretboard logic/drawing instance
  private wrapperDiv: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  /** When set, draws a small red dot at this string+fret position (e.g. the barre root). */
  private rootPosition: { stringIndex: number; fret: number } | null;
  private isFallback: boolean;
  private chordLabelDisplay: ChordLabelDisplay;

  // Store calculated dimensions
  private requiredWidth: number = 0;
  private requiredHeight: number = 0;
  private readonly fretCount: number = 5; // Standard for chord diagrams

  constructor(
    chord: Chord,
    title: string,
    fretboardConfig: FretboardConfig,
    rootPosition?: { stringIndex: number; fret: number },
    isFallback?: boolean,
    chordLabelDisplay: ChordLabelDisplay = "fingering"
  ) {
    super();
    this.chord = chord;
    this.title = title;
    this.fretboardConfig = fretboardConfig;
    this.rootPosition = rootPosition ?? null;
    this.isFallback = isFallback ?? false;
    this.chordLabelDisplay = chordLabelDisplay;

    // Calculate dimensions needed for canvas
    this.calculateDimensions();

    // Instantiate the Fretboard logic class
    // The Fretboard class uses START_PX internally for drawing padding
    const scaledStartPx = START_PX * this.fretboardConfig.scaleFactor;
    this.fretboard = new Fretboard(
      this.fretboardConfig,
      scaledStartPx, // Pass scaled start X for drawing origin within canvas
      scaledStartPx, // Pass scaled start Y for drawing origin within canvas
      this.fretCount
    );

    // Prepare note data immediately and pass it to the Fretboard instance
    this.prepareAndSetChordData();
  }

  /** Calculates the required canvas dimensions from the fretboard config. */
  private calculateDimensions(): void {
    this.requiredWidth  = this.fretboardConfig.getRequiredWidth(this.fretCount);
    this.requiredHeight = this.fretboardConfig.getRequiredHeight(this.fretCount);
  }

  /** Calculates NoteRenderData for the chord and passes it to the Fretboard instance. */
  private prepareAndSetChordData(): void {
    const notesData: NoteRenderData[] = [];
    const config = this.fretboardConfig;

    // Determine starting fret for the diagram display range
    let minFret = this.fretCount + 1;
    let maxFret = 0;
    this.chord.strings.forEach((fret) => {
      if (fret > 0) {
        minFret = Math.min(minFret, fret);
        maxFret = Math.max(maxFret, fret);
      }
    });
    let startFret = 0; // Fret number the diagram starts AT (0 means show nut)
    if (this.chord.barre && this.chord.barre.length > 0) {
      // For barre chords past the 2nd fret, pin the barre at the first diagram
      // position so there is room for the remaining fingering notes above it.
      const barreMinFret = Math.min(...this.chord.barre.map((b) => b.fret));
      if (barreMinFret > 2) {
        startFret = barreMinFret - 1;
      }
    } else if (maxFret > this.fretCount || maxFret - minFret >= this.fretCount) {
      // Non-barre chord: slide the window when notes exceed the visible range.
      startFret = minFret - 1;
    }
    this.fretboard.setStartFret(startFret);

    const chordRootName = this.getChordRootNote();
    const chordRootIndex = chordRootName ? getKeyIndex(chordRootName) : -1;

    for (
      let stringIndex = 0;
      stringIndex < this.chord.strings.length;
      stringIndex++
    ) {
      if (stringIndex >= config.tuning.notes.length) continue;

      const fret = this.chord.strings[stringIndex]; // Actual fret (-1, 0, or >0)
      const finger = this.chord.fingers[stringIndex];
      const displayFretForNote = fret - startFret; // Fret relative to diagram start

      // Include note if it's muted, open, or within the displayed fret range
      if (
        fret === -1 ||
        (displayFretForNote >= 0 && displayFretForNote <= this.fretCount)
      ) {
        const isMuted = fret === -1;
        const isOpen = fret === 0;
        let noteName = "?";
        let intervalLabel = "?";
        let displayLabel = "";

        if (!isMuted) {
          const noteOffsetFromA =
            (config.tuning.notes[stringIndex] + fret) % 12;
          noteName = NOTE_NAMES_FROM_A[noteOffsetFromA] ?? "?";
          if (chordRootIndex !== -1) {
            const noteRelativeToKey =
              (noteOffsetFromA - chordRootIndex + 12) % 12;
            intervalLabel = getIntervalLabel(noteRelativeToKey);
            // The 9th (14 semitones) folds to 2 via % 12. Re-label it for extension chords.
            if (
              intervalLabel === "2" &&
              (this.chord.chordType === ChordType.ADD9 ||
                this.chord.chordType === ChordType.MINOR_ADD9)
            ) {
              intervalLabel = "9";
            }
          }
          switch (this.chordLabelDisplay) {
            case "fingering":
              displayLabel = finger > 0 && !isOpen ? String(finger) : "";
              break;
            case "interval":
              displayLabel = intervalLabel;
              break;
            case "notes":
              displayLabel = noteName;
              break;
          }
        }

        notesData.push({
          fret: fret, // Pass the ACTUAL fret to Fretboard drawing logic
          stringIndex: stringIndex,
          noteName: noteName,
          intervalLabel: intervalLabel,
          displayLabel: displayLabel,
          colorSchemeOverride: config.colorScheme, // Use diagram's configured scheme
          radiusOverride: isOpen
            ? config.noteRadiusPx * OPEN_NOTE_RADIUS_FACTOR
            : undefined,
        });
      }
    }

    // Build barre data and filter out notes covered by a barre
    const barreData: BarreData[] = [];
    let finalNotes: NoteRenderData[];
    if (this.chord.barre) {
      for (const spec of this.chord.barre) {
        // Detect barre finger number and flag inconsistencies
        const barreFingerNums = new Set<number>();
        for (let si = spec.stringStart; si <= spec.stringEnd; si++) {
          if (this.chord.strings[si] === spec.fret && this.chord.fingers[si] > 0)
            barreFingerNums.add(this.chord.fingers[si]);
        }
        if (barreFingerNums.size > 1) {
          console.warn(`[ChordDiagram] Barre at fret ${spec.fret} has inconsistent finger numbers: ${[...barreFingerNums]} in chord "${this.chord.name}"`);
        }
        const barreFinger = barreFingerNums.size > 0 ? Math.min(...barreFingerNums) : 1;

        // Build per-string labels for ringing barre strings
        const centerSi = Math.floor((spec.stringStart + spec.stringEnd) / 2);
        const labels: (string | null)[] = [];
        for (let si = spec.stringStart; si <= spec.stringEnd; si++) {
          const isRinging = this.chord.strings[si] === spec.fret;
          if (!isRinging) { labels.push(null); continue; }
          const noteData = notesData.find(n => n.stringIndex === si && n.fret === spec.fret);
          let label: string | null = null;
          if (noteData) {
            switch (this.chordLabelDisplay) {
              case "fingering": label = si === centerSi ? String(barreFinger) : null; break;
              case "interval":  label = noteData.intervalLabel !== "?" ? noteData.intervalLabel : null; break;
              case "notes":     label = noteData.noteName !== "?" ? noteData.noteName : null; break;
            }
          }
          labels.push(label);
        }

        barreData.push({ fret: spec.fret, stringStart: spec.stringStart, stringEnd: spec.stringEnd, labels });
      }
      // Remove individual note circles that lie on a barre (the bar itself shows them).
      // Muted strings are always kept; open (fret 0) notes can be covered by a nut barre.
      finalNotes = notesData.filter((note) => {
        if (note.fret === -1) return true;
        return !this.chord.barre!.some(
          (spec) =>
            note.fret === spec.fret &&
            note.stringIndex >= spec.stringStart &&
            note.stringIndex <= spec.stringEnd
        );
      });
    } else {
      finalNotes = notesData;
    }

    // Overlay a root-position marker on moveable shapes (drawn on top of the barre bar).
    if (this.rootPosition) {
      const { stringIndex: rStr, fret: rFret } = this.rootPosition;
      const rootLabel = this.chordLabelDisplay === "fingering"
        ? ""
        : this.chordLabelDisplay === "notes"
        ? (String(this.chord.rootKey) || "R")
        : "R";
      const rootDot: NoteRenderData = {
        fret: rFret,
        stringIndex: rStr,
        noteName: String(this.chord.rootKey) || "R",
        intervalLabel: "R",
        displayLabel: rootLabel,
        fillColor: getComputedStyle(document.documentElement).getPropertyValue('--danger').trim() || '#a83232',
        strokeColor: "transparent",
        strokeWidth: 0,
        radiusOverride: this.fretboardConfig.noteRadiusPx * 0.72,
      };
      // Replace existing note at that position if present, otherwise append.
      const existingIdx = finalNotes.findIndex(
        (n) => n.stringIndex === rStr && n.fret === rFret
      );
      if (existingIdx >= 0) {
        finalNotes[existingIdx] = rootDot;
      } else {
        finalNotes = [...finalNotes, rootDot];
      }
    }

    this.fretboard.setNotes(finalNotes);
    this.fretboard.setBarres(barreData);
    this.fretboard.setLines([]); // Explicitly clear lines
  }

  /** Creates the wrapper div, title, canvas and triggers the render via the Fretboard instance. */
  render(container: HTMLElement): void {
    if (!this.wrapperDiv) {
      this.createElements(container);
    } else {
      if (!this.wrapperDiv.parentNode) {
        container.appendChild(this.wrapperDiv); // Re-attach if detached
      }
    }

    if (this.ctx) {
      // Delegate all drawing to the Fretboard instance
      this.fretboard.render(this.ctx);
    } else {
      console.error(
        "Canvas context not available for ChordDiagramView render:",
        this.title
      );
    }
  }

  /** Creates the wrapper, title, and canvas elements. */
  private createElements(container: HTMLElement): void {
    // --- Create Wrapper Div ---
    this.wrapperDiv = document.createElement("div");
    this.wrapperDiv.classList.add("chord-diagram-view");
    this.wrapperDiv.style.display = "inline-block";
    this.wrapperDiv.style.verticalAlign = "top";
    this.wrapperDiv.style.padding = "5px";
    this.wrapperDiv.style.minWidth = `${this.requiredWidth}px`; // Use calculated width

    // --- Add Chord Title ---
    if (this.title) {
      const titleEl = document.createElement("div");
      titleEl.classList.add("chord-diagram-title");
      titleEl.textContent = this.title;
      if (this.isFallback) {
        const warn = document.createElement("span");
        warn.textContent = " ⚠";
        warn.title = "Approximate shape — no exact fingering found in library";
        warn.style.color = "var(--clr-warning, #e6a817)";
        warn.style.fontSize = "0.9em";
        titleEl.appendChild(warn);
      }
      this.wrapperDiv.appendChild(titleEl);
    }

    // --- Add Notes List ---
    const notesList = getChordNotes(this.chord, this.fretboardConfig);
    const notesEl = document.createElement("div");
    notesEl.classList.add("chord-notes-list");
    notesEl.textContent = notesList.join(", ");
    notesEl.style.fontSize = "0.75rem";
    notesEl.style.textAlign = "center";
    notesEl.style.color = "var(--clr-text-subtle)";
    notesEl.style.marginBottom = "3px";
    this.wrapperDiv.appendChild(notesEl);

    // --- Create Canvas ---
    const canvasIdSuffix = `chord-${this.title.replace(/[^a-zA-Z0-9-]/g, "_")}`;
    this.canvas = addCanvas(this.wrapperDiv, canvasIdSuffix); // Add canvas to wrapper
    this.canvas.width = this.requiredWidth;
    this.canvas.height = this.requiredHeight;

    this.ctx = this.canvas.getContext("2d");
    if (!this.ctx) {
      console.error("Failed to get 2D context for chord diagram:", this.title);
      this.canvas = null;
      return;
    }
    this.fretboard.attachClickHandler(this.canvas);

    // Append the wrapper to the main container
    container.appendChild(this.wrapperDiv);
  }

  /** Helper to get chord root note - needed for interval calculation */
  private getChordRootNote(): string | null {
    if (!this.chord || !this.chord.name) return null;
    const chordName = this.chord.name;
    // Match common root note patterns (A, A#, Ab, G# etc.)
    const match = chordName.match(/^([A-G])([#b]?)/);
    if (match) {
      const rootName = `${match[1]}${match[2] || ""}`;
      // Validate against known notes
      if ((ALL_NOTE_NAMES as string[]).includes(rootName)) return rootName;
    }
    // Fallback might be needed if chord_library keys differ significantly from names
    console.warn(`Could not determine root note for chord name: ${chordName}`);
    return null;
  }

  setActive(active: boolean): void {
    if (!this.wrapperDiv) return;
    this.wrapperDiv.style.boxShadow = active ? '0 0 0 2px var(--clr-accent, #5a9)' : '';
    this.wrapperDiv.style.borderRadius = active ? '4px' : '';
  }

  destroy(): void {
    this.fretboard?.detachClickHandler();
    if (this.wrapperDiv && this.wrapperDiv.parentNode) {
      this.wrapperDiv.parentNode.removeChild(this.wrapperDiv);
    }
    this.wrapperDiv = null;
    this.canvas = null;
    this.ctx = null;
    this.fretboard?.clearMarkings();
    super.destroy();
  }
}
