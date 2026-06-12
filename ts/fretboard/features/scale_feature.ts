import {
  Feature,
  ConfigurationSchema,
  ConfigurationSchemaArg,
  ArgType,
  UiComponentType,
} from "../../feature";
import { InstrumentFeature } from "../fretboard_base";
import { Scale, scale_names, scales } from "../scales";
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
import { peekPendingCanvasWidth } from "../fretboard_base";
import { planSingleFretboard } from "../fretboard_layout";
import {
  InstrumentSettings,
  DEFAULT_INSTRUMENT_SETTINGS,
} from "../fretboard_settings";

const NON_HIGHLIGHTED_SCALE_COLOR = "#CCCCCC";
const OUT_OF_SCALE_HIGHLIGHT_STROKE = "#C0392B";
const IN_SCALE_HIGHLIGHT_STROKE = "#333333";

/** Displays scale diagrams on the fretboard using FretboardView. */
export class ScaleFeature extends InstrumentFeature {
  static readonly typeName = "Scale";
  static readonly displayName = "Scale Diagram";
  static readonly description =
    "Displays a specified scale on the fretboard in a given key. Optionally highlight specific notes (highlighted notes outside the scale get a red border).";

  readonly typeName = ScaleFeature.typeName;
  private readonly scale: Scale;
  private readonly keyIndex: number;
  private readonly highlightNotes: Set<string>;
  private readonly headerText: string;
  private fretboardViewInstance: FretboardView;
  private fretCount: number;

  constructor(
    config: ReadonlyArray<string>,
    scale: Scale,
    keyIndex: number,
    highlightNotes: Set<string>,
    headerText: string,
    settings: AppSettings,
    maxCanvasHeight?: number,
  ) {
    const availW = peekPendingCanvasWidth();
    super(config, settings, maxCanvasHeight);
    this.scale = scale;
    this.keyIndex = keyIndex;
    this.highlightNotes = highlightNotes;
    this.headerText = headerText;
    this.fretCount = 18;

    const guitarSettings =
      (settings.instrumentSettings as InstrumentSettings | undefined) ??
      DEFAULT_INSTRUMENT_SETTINGS;
    this.fretboardConfig = planSingleFretboard(
      this.fretboardConfig,
      availW,
      maxCanvasHeight,
      guitarSettings.zoomMultiplier ?? 1.2,
      this.fretCount,
    );

    this.fretboardViewInstance = new FretboardView(
      this.fretboardConfig,
      this.fretCount,
    );
    this._views.unshift(this.fretboardViewInstance);

    this.calculateAndSetScaleNotes();
  }

  static getConfigurationSchema(): ConfigurationSchema {
    const availableScaleNames = Object.keys(scale_names).sort();
    const availableKeys = NOTE_NAMES_FROM_A as string[];
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
        uiComponentData: { buttonLabels: allNoteNames },
        description:
          "Select notes to highlight. Notes outside the scale get a red border. If none selected, colors based on interval.",
      },
    ];
    return {
      description: `Config: ${this.typeName},ScaleName,RootNote[,HighlightNote...]`,
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
        `[${this.typeName}] Invalid config. Expected [ScaleName, RootNote, ...]. Received: [${config.join(", ")}]`,
      );
    }
    const scaleNameOrAlias = config[0]!;
    const rootNoteName = config[1]!;

    const highlightNotesArray = config
      .slice(2)
      .filter((v) => !v.startsWith("{"));
    const highlightNotesSet = new Set(highlightNotesArray);

    const scaleKey =
      scale_names[scaleNameOrAlias as keyof typeof scale_names] ??
      scaleNameOrAlias.toUpperCase().replace(/ /g, "_");
    const scale = scales[scaleKey as keyof typeof scales];
    if (!scale)
      throw new Error(
        `[${this.typeName}] Unknown scale: "${scaleNameOrAlias}" (tried key "${scaleKey}")`,
      );

    const keyIndex = getKeyIndex(rootNoteName);
    if (keyIndex === -1)
      throw new Error(`[${this.typeName}] Unknown key: "${rootNoteName}"`);
    const validRootName = NOTE_NAMES_FROM_A[keyIndex] ?? rootNoteName;

    const headerText = `${validRootName} ${scale.name}`;

    return new ScaleFeature(
      config as string[],
      scale,
      keyIndex,
      highlightNotesSet,
      headerText,
      settings,
      maxCanvasHeight,
    );
  }

  private calculateAndSetScaleNotes(): void {
    const notesData: NoteRenderData[] = [];
    const config = this.fretboardConfig;
    const tuning = config.tuning.notes;
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
        let strokeColor: string | string[] = "transparent";
        let strokeWidth: number = 1;
        let colorSchemeOverride: "note" | "interval" | undefined = undefined;
        let displayLabel: string = noteName;

        const labelDisplay = this.fretboardConfig.labelDisplay;

        if (highlightingActive) {
          if (isNoteHighlighted) {
            shouldRender = true;
            colorSchemeOverride = "note";
            strokeWidth = 1.5;
            strokeColor = isNoteInScale
              ? IN_SCALE_HIGHLIGHT_STROKE
              : OUT_OF_SCALE_HIGHLIGHT_STROKE;
            displayLabel =
              labelDisplay === "note"
                ? noteName
                : labelDisplay === "none"
                  ? ""
                  : getIntervalLabel(noteRelativeToKey);
          } else if (isNoteInScale) {
            shouldRender = true;
            fillColor = NON_HIGHLIGHTED_SCALE_COLOR;
            strokeWidth = 1;
            displayLabel = "";
          }
        } else {
          if (isNoteInScale) {
            shouldRender = true;
            const intervalLabel = getIntervalLabel(noteRelativeToKey);
            displayLabel =
              labelDisplay === "note"
                ? noteName
                : labelDisplay === "none"
                  ? ""
                  : intervalLabel;
          }
        }

        if (shouldRender) {
          notesData.push({
            fret: fretIndex,
            stringIndex: stringIndex,
            noteName: noteName,
            intervalLabel: getIntervalLabel(noteRelativeToKey),
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
