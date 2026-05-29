import {
  Feature,
  ConfigurationSchema,
  ConfigurationSchemaArg,
  ArgType,
  UiComponentType,
} from "../../feature";
import { InstrumentFeature } from "../fretboard_base";
import { AudioController } from "../../audio_controller";
import { AppSettings } from "../../settings";
import { IntervalSettings } from "../../schedule/editor/interval/types";
import { InstrumentIntervalSettings } from "../fretboard_interval_settings";
import { NoteRenderData, FretboardConfig } from "../fretboard";
import {
  getKeyIndex,
  NOTE_NAMES_FROM_A,
  getIntervalLabel,
  OPEN_NOTE_RADIUS_FACTOR,
  addHeader,
  clearAllChildren,
} from "../fretboard_utils";
import { FretboardView } from "../views/fretboard_view";
import { peekPendingCanvasWidth } from "../fretboard_base";
import { planSingleFretboard } from "../fretboard_layout";
import { InstrumentSettings, DEFAULT_INSTRUMENT_SETTINGS } from "../fretboard_settings";

const DEFAULT_STROKE = "rgba(50, 50, 50, 0.7)";
const ROOT_STROKE = "#333333";

interface ArpeggioTypeSpec {
  name: string;
  intervals: number[];
}

const ARPEGGIO_TYPES: Record<string, ArpeggioTypeSpec> = {
  MAJ:   { name: "Major",  intervals: [0, 4, 7] },
  MIN:   { name: "Minor",  intervals: [0, 3, 7] },
  DOM7:  { name: "Dom 7",  intervals: [0, 4, 7, 10] },
  MAJ7:  { name: "Maj 7",  intervals: [0, 4, 7, 11] },
  MIN7:  { name: "Min 7",  intervals: [0, 3, 7, 10] },
  DIM:   { name: "Dim",    intervals: [0, 3, 6] },
  DIM7:  { name: "Dim 7",  intervals: [0, 3, 6, 9] },
  HDIM7: { name: "m7♭5",   intervals: [0, 3, 6, 10] },
  AUG:   { name: "Aug",    intervals: [0, 4, 8] },
  SUS2:  { name: "Sus 2",  intervals: [0, 2, 7] },
  SUS4:  { name: "Sus 4",  intervals: [0, 5, 7] },
};

const ARPEGGIO_TYPE_KEYS = Object.keys(ARPEGGIO_TYPES);
const ARPEGGIO_TYPE_NAMES = ARPEGGIO_TYPE_KEYS.map(k => ARPEGGIO_TYPES[k]!.name);

// Interval labels that can be shown/hidden via the toggle arg.
// Order here determines toggle-button order in the UI.
const INTERVAL_TOGGLE_LABELS = ["R", "2", "b3", "3", "4", "b5", "5", "b6", "b7", "7"];

/** Displays all chord tones of an arpeggio across the full fretboard. */
export class ArpeggioFeature extends InstrumentFeature {
  static readonly typeName = "Arpeggio";
  static readonly displayName = "Arpeggio Map";
  static readonly description =
    "Shows all chord tones (root, 3rd, 5th, 7th) across the full neck, colored by interval role. Useful for targeting chord tones when soloing or improvising.";

  readonly typeName = ArpeggioFeature.typeName;
  private readonly keyIndex: number;
  private readonly rootNoteName: string;
  private readonly chordIntervals: Set<number>;
  private readonly visibleIntervals: Set<string> | null; // null = show all
  private readonly headerText: string;
  private fretboardViewInstance: FretboardView;
  private fretCount: number;

  constructor(
    config: ReadonlyArray<string>,
    keyIndex: number,
    rootNoteName: string,
    chordIntervals: Set<number>,
    visibleIntervals: Set<string> | null,
    headerText: string,
    settings: AppSettings,
    intervalSettings: InstrumentIntervalSettings,
    audioController?: AudioController,
    maxCanvasHeight?: number
  ) {
    const availW = peekPendingCanvasWidth();
    super(config, settings, intervalSettings, audioController, maxCanvasHeight);
    this.keyIndex = keyIndex;
    this.rootNoteName = rootNoteName;
    this.chordIntervals = chordIntervals;
    this.visibleIntervals = visibleIntervals;
    this.headerText = headerText;
    this.fretCount = 18;

    const guitarSettings = (settings.instrumentSettings as InstrumentSettings | undefined)
      ?? DEFAULT_INSTRUMENT_SETTINGS;
    this.fretboardConfig = planSingleFretboard(
      this.fretboardConfig, availW, maxCanvasHeight,
      guitarSettings.zoomMultiplier ?? 1.2, this.fretCount
    );

    this.fretboardViewInstance = new FretboardView(this.fretboardConfig, this.fretCount);
    this._views.unshift(this.fretboardViewInstance);

    this.calculateAndSetArpeggioNotes();
  }

  static getConfigurationSchema(): ConfigurationSchema {
    const availableKeys = NOTE_NAMES_FROM_A as string[];
    const specificArgs: ConfigurationSchemaArg[] = [
      {
        name: "Root Note",
        type: ArgType.Enum,
        required: true,
        enum: availableKeys,
        description: "Root note of the arpeggio.",
      },
      {
        name: "Quality",
        type: ArgType.Enum,
        required: true,
        enum: ARPEGGIO_TYPE_NAMES,
        defaultValue: "Major",
        description: "Chord quality determining which tones appear.",
      },
    ];
    specificArgs.push({
      name: "Show Intervals",
      type: ArgType.Enum,
      required: false,
      isVariadic: true,
      enum: INTERVAL_TOGGLE_LABELS,
      uiComponentType: UiComponentType.ToggleButtonSelector,
      uiComponentData: { buttonLabels: INTERVAL_TOGGLE_LABELS },
      description: "Which interval tones to display. Leave empty to show all.",
    });
    return {
      description: `Config: ${this.typeName},RootNote,Quality[,IntervalLabel...][,InstrumentSettings]`,
      args: [...specificArgs, InstrumentFeature.BASE_INSTRUMENT_SETTINGS_CONFIG_ARG],
    };
  }

  static createFeature(
    config: ReadonlyArray<string>,
    audioController: AudioController,
    settings: AppSettings,
    intervalSettings: IntervalSettings,
    maxCanvasHeight: number | undefined,
    categoryName: string
  ): Feature {
    if (config.length < 2) {
      throw new Error(
        `[${this.typeName}] Invalid config. Expected [RootNote, Quality]. Received: [${config.join(", ")}]`
      );
    }

    const rootNoteName = config[0]!;
    const qualityName = config[1]!;

    const keyIndex = getKeyIndex(rootNoteName);
    if (keyIndex === -1)
      throw new Error(`[${this.typeName}] Unknown root note: "${rootNoteName}"`);

    const typeKey = ARPEGGIO_TYPE_KEYS.find(
      k => ARPEGGIO_TYPES[k]!.name === qualityName || k === qualityName
    );
    if (!typeKey)
      throw new Error(`[${this.typeName}] Unknown quality: "${qualityName}"`);

    const spec = ARPEGGIO_TYPES[typeKey]!;
    const intervals = new Set(spec.intervals);

    // config[2..] may be variadic interval toggle labels (e.g. "R", "5") until the
    // InstrumentSettings JSON blob, which starts with "{".
    const toggleLabels = config.slice(2).filter(v => !v.startsWith('{') && INTERVAL_TOGGLE_LABELS.includes(v));
    const visibleIntervals: Set<string> | null =
      toggleLabels.length > 0 ? new Set(toggleLabels) : null;

    const validRootName = NOTE_NAMES_FROM_A[keyIndex] ?? rootNoteName;
    const headerText = `${validRootName} ${spec.name} Arpeggio`;

    return new ArpeggioFeature(
      config,
      keyIndex,
      validRootName,
      intervals,
      visibleIntervals,
      headerText,
      settings,
      intervalSettings as InstrumentIntervalSettings,
      audioController,
      maxCanvasHeight
    );
  }

  private calculateAndSetArpeggioNotes(): void {
    const notesData: NoteRenderData[] = [];
    const config = this.fretboardConfig;
    const tuning = config.tuning.notes;
    const fretCount = this.fretCount;

    for (let stringIndex = 0; stringIndex < tuning.length; stringIndex++) {
      const stringTuning = tuning[stringIndex]!;

      for (let fretIndex = 0; fretIndex <= fretCount; fretIndex++) {
        const noteOffsetFromA = (stringTuning + fretIndex) % 12;
        const noteRelativeToKey = (noteOffsetFromA - this.keyIndex + 12) % 12;

        if (!this.chordIntervals.has(noteRelativeToKey)) continue;

        const noteName = NOTE_NAMES_FROM_A[noteOffsetFromA] ?? "?";
        const intervalLabel = getIntervalLabel(noteRelativeToKey);
        if (this.visibleIntervals && !this.visibleIntervals.has(intervalLabel)) continue;
        const isRoot = noteRelativeToKey === 0;
        const labelDisplay = config.labelDisplay;

        notesData.push({
          fret: fretIndex,
          stringIndex,
          noteName,
          intervalLabel,
          displayLabel:
            labelDisplay === "note" ? noteName
            : labelDisplay === "none" ? ""
            : intervalLabel,
          strokeColor: isRoot ? ROOT_STROKE : DEFAULT_STROKE,
          strokeWidth: isRoot ? 2.0 : 1,
          radiusOverride:
            fretIndex === 0 ? config.noteRadiusPx * OPEN_NOTE_RADIUS_FACTOR : undefined,
        });
      }
    }

    requestAnimationFrame(() => {
      if (this.fretboardViewInstance) {
        this.fretboardViewInstance.setNotes(notesData);
        this.fretboardViewInstance.setLines([]);
      }
    });
  }

  render(container: HTMLElement): void {
    clearAllChildren(container);

    const titleRow = document.createElement("div");
    titleRow.classList.add("feature-title-row");
    const header = addHeader(titleRow, this.headerText);
    header.classList.add("feature-main-title");
    container.appendChild(titleRow);
  }
}
