import { BaseView } from "../../core/base_view";
import { Chord } from "../../music/chords";
import { FretboardConfig } from "../fretboard_config";
import { NoteRenderData, BarreData } from "../renderer";
import {
  OPEN_NOTE_RADIUS_FACTOR,
  NOTE_NAMES_FROM_A,
  ALL_NOTE_NAMES,
  getKeyIndex,
  chordToneIntervalLabel,
} from "../fretboard_utils";
import { NoteName } from "../../music/music_types";
import { ChordLabelDisplay } from "../fretboard_settings";
import {
  FretboardDiagram,
  ChordDiagramStyle,
  createChordDiagram,
} from "../diagram/chord_diagram";
import { computeChordStartFret } from "../diagram/chord_framing";

/**
 * Helper to get the notes in a chord.
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

/** Optional card-chrome / behaviour overrides for a chord diagram. */
export interface ChordDiagramViewOptions {
  /** Renderer to use. Defaults to the lightweight SVG "mini" diagram. */
  style?: ChordDiagramStyle;
  /** Small line under the title (e.g. shape name "E-Shape" or a Roman numeral). */
  subtitle?: string;
  /** Roman-numeral degree shown inline after the title in its own font/colour. */
  degree?: string;
  /** Footer hint text (family alteration, e.g. "Lower the 3rd one fret → ♭3"). */
  hint?: string;
  /** Show the comma-separated note list under the title. */
  showNotes?: boolean;
  /** Makes the whole card a button that invokes this on click. */
  onClick?: () => void;
  /** Marks this card as the family anchor (special styling). */
  anchor?: boolean;
}

/**
 * A View that renders a single chord diagram in a boxed "card", delegating the
 * fretboard drawing to a swappable {@link FretboardDiagram} (SVG mini by default).
 */
export class ChordDiagramView extends BaseView {
  private chord: Chord;
  private title: string;
  private fretboardConfig: FretboardConfig;
  private diagram: FretboardDiagram;
  private wrapperDiv: HTMLElement | null = null;
  private diagramHost: HTMLElement | null = null;
  /** When set, draws a small root dot at this string+fret position (e.g. barre root). */
  private rootPosition: { stringIndex: number; fret: number } | null;
  private isFallback: boolean;
  private chordLabelDisplay: ChordLabelDisplay;
  private readonly opts: ChordDiagramViewOptions;
  private readonly fretCount: number = 5;

  constructor(
    chord: Chord,
    title: string,
    fretboardConfig: FretboardConfig,
    rootPosition?: { stringIndex: number; fret: number },
    isFallback?: boolean,
    chordLabelDisplay: ChordLabelDisplay = "fingering",
    opts: ChordDiagramViewOptions = {}
  ) {
    super();
    this.chord = chord;
    this.title = title;
    this.fretboardConfig = fretboardConfig;
    this.rootPosition = rootPosition ?? null;
    this.isFallback = isFallback ?? false;
    this.chordLabelDisplay = chordLabelDisplay;
    this.opts = opts;

    this.diagram = createChordDiagram(opts.style ?? "mini", fretboardConfig, {
      fretCount: this.fretCount,
    });
    this.prepareAndSetChordData();
  }

  /** Calculates NoteRenderData for the chord and passes it to the diagram. */
  private prepareAndSetChordData(): void {
    const notesData: NoteRenderData[] = [];
    const config = this.fretboardConfig;

    // Determine the fret the diagram window starts at (0 = show the nut).
    const startFret = computeChordStartFret(
      this.chord.strings,
      this.chord.barre,
      this.fretCount,
    );
    this.diagram.setStartFret(startFret);

    const chordRootName = this.getChordRootNote();
    const chordRootIndex = chordRootName ? getKeyIndex(chordRootName) : -1;

    for (
      let stringIndex = 0;
      stringIndex < this.chord.strings.length;
      stringIndex++
    ) {
      if (stringIndex >= config.tuning.notes.length) continue;

      const fret = this.chord.strings[stringIndex];
      const finger = this.chord.fingers[stringIndex];
      const displayFretForNote = fret - startFret;

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
          const noteOffsetFromA = (config.tuning.notes[stringIndex] + fret) % 12;
          noteName = NOTE_NAMES_FROM_A[noteOffsetFromA] ?? "?";
          if (chordRootIndex !== -1) {
            const noteRelativeToKey = (noteOffsetFromA - chordRootIndex + 12) % 12;
            // Chord-aware so extensions read correctly (a 9th, not a 2nd, etc.).
            intervalLabel = chordToneIntervalLabel(noteRelativeToKey, this.chord.chordType);
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
          fret,
          stringIndex,
          noteName,
          intervalLabel,
          displayLabel,
          colorSchemeOverride: config.colorScheme,
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
        const barreFingerNums = new Set<number>();
        for (let si = spec.stringStart; si <= spec.stringEnd; si++) {
          if (this.chord.strings[si] === spec.fret && this.chord.fingers[si] > 0)
            barreFingerNums.add(this.chord.fingers[si]);
        }
        if (barreFingerNums.size > 1) {
          console.warn(`[ChordDiagram] Barre at fret ${spec.fret} has inconsistent finger numbers: ${[...barreFingerNums]} in chord "${this.chord.name}"`);
        }
        const barreFinger = barreFingerNums.size > 0 ? Math.min(...barreFingerNums) : 1;

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
      const docStyle = getComputedStyle(document.documentElement);
      const rootFill = docStyle.getPropertyValue('--chord-root').trim()
        || docStyle.getPropertyValue('--danger').trim()
        || '#a83232';
      const rootDot: NoteRenderData = {
        fret: rFret,
        stringIndex: rStr,
        noteName: String(this.chord.rootKey) || "R",
        intervalLabel: "R",
        displayLabel: rootLabel,
        fillColor: rootFill,
        strokeColor: "transparent",
        strokeWidth: 0,
      };
      const existingIdx = finalNotes.findIndex(
        (n) => n.stringIndex === rStr && n.fret === rFret
      );
      if (existingIdx >= 0) {
        finalNotes[existingIdx] = rootDot;
      } else {
        finalNotes = [...finalNotes, rootDot];
      }
    }

    this.diagram.setNotes(finalNotes);
    this.diagram.setBarres(barreData);
    this.diagram.setLines([]);
  }

  /** Creates the card wrapper and mounts the diagram. */
  render(container: HTMLElement): void {
    if (!this.wrapperDiv) {
      this.createElements(container);
    } else {
      if (!this.wrapperDiv.parentNode) container.appendChild(this.wrapperDiv);
      this.diagram.render();
    }
  }

  private createElements(container: HTMLElement): void {
    const wrapper = document.createElement(this.opts.onClick ? "button" : "div");
    wrapper.classList.add("chord-card");
    if (this.opts.anchor) wrapper.classList.add("is-anchor");
    if (this.opts.onClick) {
      wrapper.classList.add("is-clickable");
      (wrapper as HTMLButtonElement).type = "button";
      wrapper.addEventListener("click", () => this.opts.onClick!());
    }
    this.wrapperDiv = wrapper;

    if (this.title) {
      const titleEl = document.createElement("div");
      titleEl.classList.add("chord-card-title");
      const nameEl = document.createElement("span");
      nameEl.textContent = this.title;
      titleEl.appendChild(nameEl);
      if (this.opts.degree) {
        const deg = document.createElement("span");
        deg.classList.add("chord-card-degree");
        deg.textContent = this.opts.degree;
        titleEl.appendChild(deg);
      }
      if (this.opts.subtitle) {
        const sub = document.createElement("span");
        sub.classList.add("chord-card-shape");
        sub.textContent = this.opts.subtitle;
        titleEl.appendChild(sub);
      }
      if (this.isFallback) {
        const warn = document.createElement("span");
        warn.textContent = " ⚠";
        warn.title = "Approximate shape — no exact fingering found in library";
        warn.classList.add("chord-card-warn");
        titleEl.appendChild(warn);
      }
      wrapper.appendChild(titleEl);
    }

    if (this.opts.showNotes) {
      const notesEl = document.createElement("div");
      notesEl.classList.add("chord-notes-list");
      notesEl.textContent = getChordNotes(this.chord, this.fretboardConfig).join(", ");
      wrapper.appendChild(notesEl);
    }

    this.diagramHost = document.createElement("div");
    this.diagramHost.classList.add("chord-card-diagram");
    wrapper.appendChild(this.diagramHost);
    this.diagram.mount(this.diagramHost);

    if (this.opts.hint) {
      const hintEl = document.createElement("div");
      hintEl.classList.add("chord-card-hint");
      hintEl.textContent = this.opts.hint;
      wrapper.appendChild(hintEl);
    }

    container.appendChild(wrapper);
  }

  /** Helper to get chord root note - needed for interval calculation */
  private getChordRootNote(): string | null {
    if (!this.chord || !this.chord.name) return null;
    const match = this.chord.name.match(/^([A-G])([#b]?)/);
    if (match) {
      const rootName = `${match[1]}${match[2] || ""}`;
      if ((ALL_NOTE_NAMES as string[]).includes(rootName)) return rootName;
    }
    console.warn(`Could not determine root note for chord name: ${this.chord.name}`);
    return null;
  }

  setActive(active: boolean): void {
    if (!this.wrapperDiv) return;
    this.wrapperDiv.classList.toggle("is-active", active);
    this.diagram.setActive(active);
  }

  destroy(): void {
    this.diagram.destroy();
    if (this.wrapperDiv && this.wrapperDiv.parentNode) {
      this.wrapperDiv.parentNode.removeChild(this.wrapperDiv);
    }
    this.wrapperDiv = null;
    this.diagramHost = null;
    super.destroy();
  }
}
