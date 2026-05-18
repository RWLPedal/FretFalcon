import {
  Feature,
  ConfigurationSchema,
  ConfigurationSchemaArg,
  ArgType,
  UiComponentType,
} from "../../feature";
import { InstrumentFeature } from "../fretboard_base";
import { Scale, scale_names, scales } from "../scales";
import { AudioController } from "../../audio_controller";
import { AppSettings } from "../../settings";
import { IntervalSettings } from "../../schedule/editor/interval/types";
import { InstrumentIntervalSettings } from "../fretboard_interval_settings";
import { NoteIcon, NoteRenderData, FretboardConfig } from "../fretboard";
import {
  getKeyIndex,
  NOTE_NAMES_FROM_A,
  getIntervalLabel,
  OPEN_NOTE_RADIUS_FACTOR,
  addHeader,
  clearAllChildren,
} from "../fretboard_utils"; // getNotesInScale removed
import { FretboardView } from "../views/fretboard_view";
import { peekPendingCanvasWidth } from "../fretboard_base";
import { planSingleFretboard } from "../fretboard_layout";
import { InstrumentSettings, DEFAULT_INSTRUMENT_SETTINGS } from "../fretboard_settings";
// Color for non-highlighted scale notes when highlighting is active
const NON_HIGHLIGHTED_SCALE_COLOR = "#CCCCCC"; // Lighter grey for contrast
const OUT_OF_SCALE_HIGHLIGHT_STROKE = "#C0392B"; // Muted red for out-of-scale highlights
const IN_SCALE_HIGHLIGHT_STROKE = "#333333"; // Dark grey/black for in-scale highlights
const DEFAULT_STROKE = "rgba(50, 50, 50, 0.7)"; // Subtle stroke for default interval view

/** Displays scale diagrams on the fretboard using FretboardView. */
export class ScaleFeature extends InstrumentFeature {
  static readonly typeName = "Scale";
  static readonly displayName = "Scale Diagram";
  static readonly description =
    "Displays a specified scale on the fretboard in a given key. Optionally highlight specific notes (highlighted notes outside the scale get a red border).";

  readonly typeName = ScaleFeature.typeName;
  private readonly scale: Scale;
  private readonly keyIndex: number;
  private readonly rootNoteName: string;
  private readonly highlightNotes: Set<string>; // Store notes to highlight
  private readonly headerText: string;
  private fretboardViewInstance: FretboardView;
  private fretCount: number;

  constructor(
    config: ReadonlyArray<string>, // [ScaleName, RootNote, ...HighlightNotes]
    scale: Scale,
    keyIndex: number,
    rootNoteName: string,
    highlightNotes: Set<string>,
    headerText: string,
    settings: AppSettings,
    intervalSettings: InstrumentIntervalSettings,
    audioController?: AudioController,
    maxCanvasHeight?: number
  ) {
    const availW = peekPendingCanvasWidth();
    super(config, settings, intervalSettings, audioController, maxCanvasHeight);
    this.scale = scale;
    this.keyIndex = keyIndex;
    this.rootNoteName = rootNoteName;
    this.highlightNotes = highlightNotes;
    this.headerText = headerText;
    this.fretCount = 18;

    const guitarSettings = (settings.instrumentSettings as InstrumentSettings | undefined)
      ?? DEFAULT_INSTRUMENT_SETTINGS;
    this.fretboardConfig = planSingleFretboard(
      this.fretboardConfig, availW, maxCanvasHeight,
      guitarSettings.zoomMultiplier ?? 1.2, this.fretCount
    );

    this.fretboardViewInstance = new FretboardView(
      this.fretboardConfig,
      this.fretCount
    );
    this._views.unshift(this.fretboardViewInstance);

    this.calculateAndSetScaleNotes();
  }

  // --- Static Methods ---
  static getConfigurationSchema(): ConfigurationSchema {
    const availableScaleNames = Object.keys(scale_names).sort();
    const availableKeys = NOTE_NAMES_FROM_A as string[];
    // Static list of all notes for the toggle buttons (sharps only)
    const allNoteNames = NOTE_NAMES_FROM_A as string[];

    const specificArgs: ConfigurationSchemaArg[] = [
      {
        name: "ScaleName",
        type: ArgType.Enum,
        required: true,
        enum: availableScaleNames,
        defaultValue: "Major",
        description: "Name of the scale.",
      },
      {
        name: "Root Note",
        type: ArgType.Enum,
        required: true,
        enum: availableKeys,
        description: "Root note of the scale.",
      },
      {
        name: "Highlight Notes",
        type: ArgType.Enum,
        required: false,
        enum: allNoteNames,
        uiComponentType: UiComponentType.ToggleButtonSelector,
        isVariadic: true,
        uiComponentData: { buttonLabels: allNoteNames }, // Provide static labels
        description:
          "Select notes to highlight. Notes outside the scale get a red border. If none selected, colors based on interval.",
      },
    ];
    return {
      description: `Config: ${this.typeName},ScaleName,RootNote[,HighlightNote1,...][,InstrumentSettings]`,
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
        `[${
          this.typeName
        }] Invalid config. Expected [ScaleName, RootNote, ...HighlightNotes]. Received: [${config.join(
          ", "
        )}]`
      );
    }
    const scaleNameOrAlias = config[0];
    const rootNoteName = config[1];
    const highlightNotesArray = config.slice(2);
    const highlightNotesSet = new Set(highlightNotesArray);

    const scaleKey =
      scale_names[scaleNameOrAlias as keyof typeof scale_names] ??
      scaleNameOrAlias.toUpperCase().replace(/ /g, "_");
    const scale = scales[scaleKey as keyof typeof scales];
    if (!scale)
      throw new Error(
        `[${this.typeName}] Unknown scale: "${scaleNameOrAlias}" (tried key "${scaleKey}")`
      );

    const keyIndex = getKeyIndex(rootNoteName);
    if (keyIndex === -1)
      throw new Error(`[${this.typeName}] Unknown key: "${rootNoteName}"`);
    const validRootName = NOTE_NAMES_FROM_A[keyIndex] ?? rootNoteName;

    const headerText = `${validRootName} ${scale.name}`;
    const guitarIntervalSettings = intervalSettings as InstrumentIntervalSettings;
    const featureSpecificConfig = [
      scaleNameOrAlias,
      rootNoteName,
      ...highlightNotesArray,
    ];

    return new ScaleFeature(
      featureSpecificConfig,
      scale,
      keyIndex,
      validRootName,
      highlightNotesSet,
      headerText,
      settings,
      guitarIntervalSettings,
      audioController,
      maxCanvasHeight
    );
  }

  /** Calculates scale notes and passes them to the FretboardView. */
  private calculateAndSetScaleNotes(): void {
    const notesData: NoteRenderData[] = [];
    const config = this.fretboardConfig;
    const tuning = config.tuning.tuning;
    const fretCount = this.fretCount;
    const highlightingActive = this.highlightNotes.size > 0;

    for (let stringIndex = 0; stringIndex < tuning.length; stringIndex++) {
      const stringTuning = tuning[stringIndex];

      for (let fretIndex = 0; fretIndex <= fretCount; fretIndex++) {
        const noteOffsetFromA = (stringTuning + fretIndex) % 12;
        const noteRelativeToKey = (noteOffsetFromA - this.keyIndex + 12) % 12;
        const noteName = NOTE_NAMES_FROM_A[noteOffsetFromA] ?? "?";
        const isNoteInScale = this.scale.degrees.includes(noteRelativeToKey);
        const isNoteHighlighted = this.highlightNotes.has(noteName);

        let shouldRender = false;
        let fillColor: string | undefined = undefined;
        let strokeColor: string | string[] = DEFAULT_STROKE;
        let strokeWidth: number = 1;
        let colorSchemeOverride: "note" | "interval" | undefined = undefined;
        let displayLabel: string = noteName;

        if (highlightingActive) {
          if (isNoteHighlighted) {
            shouldRender = true;
            colorSchemeOverride = "note"; // resolved at render time against current theme
            strokeWidth = 1.5;
            strokeColor = isNoteInScale
              ? IN_SCALE_HIGHLIGHT_STROKE
              : OUT_OF_SCALE_HIGHLIGHT_STROKE;
          } else if (isNoteInScale) {
            shouldRender = true;
            fillColor = NON_HIGHLIGHTED_SCALE_COLOR; // fixed grey, theme-independent
            strokeColor = DEFAULT_STROKE;
            strokeWidth = 1;
            displayLabel = ""; // Hide label for non-highlighted scale notes in highlight mode
          }
        } else {
          // No highlighting, default interval coloring
          if (isNoteInScale) {
            shouldRender = true;
            const intervalLabel = getIntervalLabel(noteRelativeToKey);
            colorSchemeOverride = "interval"; // resolved at render time against current theme
            strokeColor =
              intervalLabel === "R"
                ? IN_SCALE_HIGHLIGHT_STROKE
                : DEFAULT_STROKE;
            strokeWidth = intervalLabel === "R" ? 2.0 : 1;
            displayLabel = intervalLabel; // Show interval label in this mode
          }
        }

        if (shouldRender) {
          notesData.push({
            fret: fretIndex,
            stringIndex: stringIndex,
            noteName: noteName,
            intervalLabel: getIntervalLabel(noteRelativeToKey), // Keep interval for potential future use
            displayLabel: displayLabel,
            fillColor: fillColor,
            strokeColor: strokeColor,
            strokeWidth: strokeWidth,
            colorSchemeOverride: colorSchemeOverride,
            radiusOverride:
              fretIndex === 0
                ? config.noteRadiusPx * OPEN_NOTE_RADIUS_FACTOR
                : undefined,
          });
        }
      }
    }

    // Update the view
    requestAnimationFrame(() => {
      if (this.fretboardViewInstance) {
        this.fretboardViewInstance.setNotes(notesData);
        this.fretboardViewInstance.setLines([]);
      }
    });
  }

  render(container: HTMLElement): void {
    clearAllChildren(container);

    const titleRow = document.createElement('div');
    titleRow.classList.add('feature-title-row');
    const header = addHeader(titleRow, this.headerText);
    header.classList.add('feature-main-title');
    container.appendChild(titleRow);
  }
}
