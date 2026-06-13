import {
  Feature,
  FeatureSpec,
  FeatureContext,
  ConfigurationSchema,
  ConfigurationSchemaArg,
  ArgType,
  UiComponentType,
} from "../../feature";
import { InstrumentFeature } from "../fretboard_base";
import { AppSettings } from "../../settings";
import { NoteRenderData } from "../fretboard";
import {
  getKeyIndex,
  NOTE_NAMES_FROM_A,
  getIntervalLabel,
  OPEN_NOTE_RADIUS_FACTOR,
  addHeader,
  clearAllChildren,
} from "../fretboard_utils";
import { FretboardView } from "../views/fretboard_view";
import { planSingleFretboard } from "../fretboard_layout";
import {
  InstrumentSettings,
  DEFAULT_INSTRUMENT_SETTINGS,
} from "../fretboard_settings";
import { featureTypeId } from "../../core/ids";
import { enumCodec, stringArrayCodec } from "../../core/config/codecs";
import type { ConfigSpec } from "../../core/config/spec";
import { SignalKind } from "../../panels/link_types";

const DEFAULT_STROKE = "rgba(50, 50, 50, 0.7)";
const ROOT_STROKE = "#333333";

interface ArpeggioTypeSpec {
  name: string;
  intervals: number[];
}

const ARPEGGIO_TYPES: Record<string, ArpeggioTypeSpec> = {
  MAJ: { name: "Major", intervals: [0, 4, 7] },
  MIN: { name: "Minor", intervals: [0, 3, 7] },
  DOM7: { name: "Dom 7", intervals: [0, 4, 7, 10] },
  MAJ7: { name: "Maj 7", intervals: [0, 4, 7, 11] },
  MIN7: { name: "Min 7", intervals: [0, 3, 7, 10] },
  DIM: { name: "Dim", intervals: [0, 3, 6] },
  DIM7: { name: "Dim 7", intervals: [0, 3, 6, 9] },
  HDIM7: { name: "m7♭5", intervals: [0, 3, 6, 10] },
  AUG: { name: "Aug", intervals: [0, 4, 8] },
  SUS2: { name: "Sus 2", intervals: [0, 2, 7] },
  SUS4: { name: "Sus 4", intervals: [0, 5, 7] },
};

const ARPEGGIO_TYPE_KEYS = Object.keys(ARPEGGIO_TYPES);
const ARPEGGIO_TYPE_NAMES = ARPEGGIO_TYPE_KEYS.map(
  (k) => ARPEGGIO_TYPES[k]!.name,
);

// Interval labels that can be shown/hidden via the toggle arg.
// Order here determines toggle-button order in the UI.
const INTERVAL_TOGGLE_LABELS = [
  "R",
  "2",
  "b3",
  "3",
  "4",
  "b5",
  "5",
  "b6",
  "b7",
  "7",
];

// ─── Typed config ─────────────────────────────────────────────────────────────

export interface ArpeggioConfig {
  rootNote: string;
  quality: string;
  showIntervals: string[];
}

const arpeggioConfigSpec: ConfigSpec<ArpeggioConfig> = {
  rootNote: {
    label: 'Root Note',
    codec: enumCodec(NOTE_NAMES_FROM_A as string[]),
    ui: { kind: 'select', options: (NOTE_NAMES_FROM_A as string[]).map(v => ({ value: v })) },
    defaultValue: 'C',
    drivable: {
      kinds: [SignalKind.Chord],
      fromSignal: (s: any) => s.kind === SignalKind.Chord ? (s.rootNote ?? undefined) : undefined,
    },
  },
  quality: {
    label: 'Quality',
    codec: enumCodec(ARPEGGIO_TYPE_NAMES),
    ui: { kind: 'select', options: ARPEGGIO_TYPE_NAMES.map(v => ({ value: v })) },
    defaultValue: 'Major',
    drivable: {
      kinds: [SignalKind.Chord],
      fromSignal: (s: any) => {
        if (s.kind !== SignalKind.Chord || !s.chordKey) return undefined;
        const suffix = (s.chordKey as string).slice((s.chordKey as string).indexOf('_') + 1);
        const suffixMap: Record<string, string> = {
          MAJ: 'Major', MIN: 'Minor', DOM7: 'Dom 7', MAJ7: 'Maj 7', MIN7: 'Min 7', DIM: 'Dim', AUG: 'Aug',
        };
        return suffixMap[suffix];
      },
    },
  },
  showIntervals: {
    label: 'Show Intervals',
    codec: stringArrayCodec,
    ui: { kind: 'toggleButtons', options: INTERVAL_TOGGLE_LABELS.map(v => ({ value: v, label: v })) },
    defaultValue: [],
  },
};

export const ArpeggioFeatureSpec: FeatureSpec<ArpeggioConfig> = {
  id: featureTypeId('Arpeggio'),
  displayName: 'Arpeggio Map',
  description: 'Shows all chord tones across the full neck, colored by interval role.',
  legacyArgOrder: ['rootNote', 'quality', 'showIntervals'],
  legacyVariadicTail: 'showIntervals',
  configSpec: arpeggioConfigSpec,
  title: (config) => {
    const root = config.rootNote ?? 'C';
    const quality = config.quality ?? 'Major';
    return `${root} ${quality} Arpeggio`;
  },
  create(config: ArpeggioConfig, ctx: FeatureContext): Feature {
    const keyIndex = getKeyIndex(config.rootNote);
    if (keyIndex === -1) throw new Error(`[ArpeggioFeature] Unknown root note: "${config.rootNote}"`);
    const typeKey = ARPEGGIO_TYPE_KEYS.find(k => ARPEGGIO_TYPES[k]!.name === config.quality || k === config.quality);
    if (!typeKey) throw new Error(`[ArpeggioFeature] Unknown quality: "${config.quality}"`);
    const spec = ARPEGGIO_TYPES[typeKey]!;
    const intervals = new Set(spec.intervals);
    const visibleIntervals: Set<string> | null = config.showIntervals.length > 0 ? new Set(config.showIntervals) : null;
    const validRootName = NOTE_NAMES_FROM_A[keyIndex] ?? config.rootNote;
    const headerText = `${validRootName} ${spec.name} Arpeggio`;
    return new ArpeggioFeature([], keyIndex, intervals, visibleIntervals, headerText, ctx.settings, ctx.constraints.maxHeight, ctx.constraints.maxWidth);
  },
};

/** Displays all chord tones of an arpeggio across the full fretboard. */
export class ArpeggioFeature extends InstrumentFeature {
  static readonly typeName = "Arpeggio";
  static readonly displayName = "Arpeggio Map";
  static readonly description =
    "Shows all chord tones (root, 3rd, 5th, 7th) across the full neck, colored by interval role. Useful for targeting chord tones when soloing or improvising.";

  readonly typeName = ArpeggioFeature.typeName;
  private readonly keyIndex: number;
  private readonly chordIntervals: Set<number>;
  private readonly visibleIntervals: Set<string> | null; // null = show all
  private readonly headerText: string;
  private fretboardViewInstance: FretboardView;
  private fretCount: number;

  constructor(
    config: ReadonlyArray<string>,
    keyIndex: number,
    chordIntervals: Set<number>,
    visibleIntervals: Set<string> | null,
    headerText: string,
    settings: AppSettings,
    maxCanvasHeight?: number,
    maxWidth?: number,
  ) {
    super(config, settings, maxCanvasHeight, maxWidth);
    this.keyIndex = keyIndex;
    this.chordIntervals = chordIntervals;
    this.visibleIntervals = visibleIntervals;
    this.headerText = headerText;
    this.fretCount = 18;

    const guitarSettings =
      (settings.instrumentSettings as InstrumentSettings | undefined) ??
      DEFAULT_INSTRUMENT_SETTINGS;
    this.fretboardConfig = planSingleFretboard(
      this.fretboardConfig,
      maxWidth,
      maxCanvasHeight,
      guitarSettings.zoomMultiplier ?? 1.2,
      this.fretCount,
    );

    this.fretboardViewInstance = new FretboardView(
      this.fretboardConfig,
      this.fretCount,
    );
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
      description: `Config: ${this.typeName},RootNote,Quality[,IntervalLabel...]`,
      args: specificArgs,
    };
  }

  static createFeature(
    config: ReadonlyArray<string>,
    settings: AppSettings,
    maxCanvasHeight: number | undefined,
    _categoryName: string,
  ): Feature {
    if (config.length < 2) {
      throw new Error(
        `[${this.typeName}] Invalid config. Expected [RootNote, Quality]. Received: [${config.join(", ")}]`,
      );
    }

    const rootNoteName = config[0]!;
    const qualityName = config[1]!;

    const keyIndex = getKeyIndex(rootNoteName);
    if (keyIndex === -1)
      throw new Error(
        `[${this.typeName}] Unknown root note: "${rootNoteName}"`,
      );

    const typeKey = ARPEGGIO_TYPE_KEYS.find(
      (k) => ARPEGGIO_TYPES[k]!.name === qualityName || k === qualityName,
    );
    if (!typeKey)
      throw new Error(`[${this.typeName}] Unknown quality: "${qualityName}"`);

    const spec = ARPEGGIO_TYPES[typeKey]!;
    const intervals = new Set(spec.intervals);

    const toggleLabels = config
      .slice(2)
      .filter((v) => !v.startsWith("{") && INTERVAL_TOGGLE_LABELS.includes(v));
    const visibleIntervals: Set<string> | null =
      toggleLabels.length > 0 ? new Set(toggleLabels) : null;

    const validRootName = NOTE_NAMES_FROM_A[keyIndex] ?? rootNoteName;
    const headerText = `${validRootName} ${spec.name} Arpeggio`;

    return new ArpeggioFeature(
      config,
      keyIndex,
      intervals,
      visibleIntervals,
      headerText,
      settings,
      maxCanvasHeight,
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
        if (this.visibleIntervals && !this.visibleIntervals.has(intervalLabel))
          continue;
        const isRoot = noteRelativeToKey === 0;
        const labelDisplay = config.labelDisplay;

        notesData.push({
          fret: fretIndex,
          stringIndex,
          noteName,
          intervalLabel,
          displayLabel:
            labelDisplay === "note"
              ? noteName
              : labelDisplay === "none"
                ? ""
                : intervalLabel,
          strokeColor: isRoot ? ROOT_STROKE : DEFAULT_STROKE,
          strokeWidth: isRoot ? 2.0 : 1,
          radiusOverride:
            fretIndex === 0
              ? config.noteRadiusPx * OPEN_NOTE_RADIUS_FACTOR
              : undefined,
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
