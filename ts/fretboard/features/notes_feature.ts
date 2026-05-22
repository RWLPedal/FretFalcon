/* ts/instrument/features/notes_feature.ts */

import {
  Feature,
  // FeatureCategoryName removed
  ConfigurationSchema,
  ConfigurationSchemaArg,
  ArgType,
} from "../../feature";
import { InstrumentFeature, peekPendingCanvasWidth } from "../fretboard_base";
import { AppSettings } from "../../settings";
import { AudioController } from "../../audio_controller";
// Import generic and specific interval settings types
import { IntervalSettings } from "../../schedule/editor/interval/types";
import { InstrumentIntervalSettings } from "../fretboard_interval_settings";
import { NoteRenderData, FretboardConfig } from "../fretboard"; // Import FretboardConfig
import {
  NOTE_NAMES_FROM_A,
  getKeyIndex,
  getIntervalLabel,
  OPEN_NOTE_RADIUS_FACTOR,
  addHeader,
  clearAllChildren,
} from "../fretboard_utils";
import { FretboardColorScheme } from "../colors";
import { FretboardView } from "../views/fretboard_view";
import { planSingleFretboard } from "../fretboard_layout";
import { InstrumentSettings, DEFAULT_INSTRUMENT_SETTINGS } from "../fretboard_settings";

/** A guitar feature for displaying all notes on the fretboard using FretboardView. */
export class NotesFeature extends InstrumentFeature {
  // Static properties (category removed, others unchanged)
  // static readonly category = FeatureCategoryName.Guitar; // Removed
  static readonly typeName = "Notes";
  static readonly displayName = "Fretboard Notes";
  static readonly description =
    "Displays all notes on the fretboard. Select 'None' for note-based colors, or a root note for interval-based colors.";
  static readonly defaultConfigCollapsed = true;

  readonly typeName = NotesFeature.typeName;
  private readonly rootNoteName: string | null;
  private fretboardViewInstance: FretboardView;

  constructor(
    config: ReadonlyArray<string>,
    settings: AppSettings,
    rootNoteName: string | null,
    intervalSettings: InstrumentIntervalSettings,
    audioController?: AudioController,
    maxCanvasHeight?: number
  ) {
    const availW = peekPendingCanvasWidth();
    super(config, settings, intervalSettings, audioController, maxCanvasHeight);
    this.rootNoteName = rootNoteName;
    const fretCount = 18;

    const guitarSettings = (settings.instrumentSettings as InstrumentSettings | undefined)
      ?? DEFAULT_INSTRUMENT_SETTINGS;
    this.fretboardConfig = planSingleFretboard(
      this.fretboardConfig, availW, maxCanvasHeight,
      guitarSettings.zoomMultiplier ?? 1.2, fretCount
    );

    this.fretboardViewInstance = new FretboardView(this.fretboardConfig, fretCount);
    this._views.push(this.fretboardViewInstance);

    this.calculateAndSetNotes(fretCount);
  }

  // --- Static Methods ---
  static getConfigurationSchema(): ConfigurationSchema {
    // Unchanged
    const availableKeys = ["None", ...NOTE_NAMES_FROM_A];
    const specificArgs: ConfigurationSchemaArg[] = [
      {
        name: "Root Note",
        type: ArgType.Enum,
        required: false, // Optional argument
        enum: availableKeys,
        description:
          "Select 'None' (default) to color by note name, or a root note for interval-based colors.",
      },
    ];
    return {
      description: `Config: ${this.typeName}[,RootNote][,InstrumentSettings]`,
      args: [...specificArgs, InstrumentFeature.BASE_INSTRUMENT_SETTINGS_CONFIG_ARG], // Merge with base
    };
  }

  // **** UPDATED createFeature Signature ****
  static createFeature(
    config: ReadonlyArray<string>,
    audioController: AudioController,
    settings: AppSettings,
    intervalSettings: IntervalSettings, // <<< CHANGED: Accept generic base type
    maxCanvasHeight: number | undefined,
    categoryName: string // <<< ADDED: Accept category name string
  ): Feature {
    let rootNoteName: string | null = null;
    let featureSpecificConfig: ReadonlyArray<string> = []; // NotesFeature has no specific args to pass down

    // Notes feature has only one optional specific argument: RootNote
    if (config.length > 0 && config[0]) {
      const potentialRoot = config[0];
      if (potentialRoot.toLowerCase() === "none") {
        rootNoteName = null;
        // featureSpecificConfig remains empty
      } else if (getKeyIndex(potentialRoot) !== -1) {
        rootNoteName = potentialRoot;
        // featureSpecificConfig remains empty
      } else {
        console.warn(
          `[${this.typeName}] Invalid RootNote value "${potentialRoot}", using note-based coloring.`
        );
        rootNoteName = null;
        // featureSpecificConfig remains empty
      }
    } else {
      // No argument provided, default to note-based coloring
      rootNoteName = null;
    }

    // --- Type Assertion for Constructor ---
    const guitarIntervalSettings = intervalSettings as InstrumentIntervalSettings;
    // --- End Type Assertion ---

    return new NotesFeature(
      featureSpecificConfig, // Pass empty array
      settings,
      rootNoteName, // Pass parsed root note
      guitarIntervalSettings, // Pass asserted specific type
      audioController,
      maxCanvasHeight
    );
  }

  /** Calculates all note data and passes it to the FretboardView instance. */
  private calculateAndSetNotes(fretCount: number): void {
    const notesData: NoteRenderData[] = [];
    const rootNoteIndex = this.rootNoteName ? getKeyIndex(this.rootNoteName) : -1;
    const hasRoot = rootNoteIndex !== -1;
    const config = this.fretboardConfig;
    const labelDisplay = config.labelDisplay;

    for (let stringIndex = 0; stringIndex < config.tuning.tuning.length; stringIndex++) {
      const stringTuning = config.tuning.tuning[stringIndex];
      for (let fretIndex = 0; fretIndex <= fretCount; fretIndex++) {
        const noteOffsetFromA = (stringTuning + fretIndex) % 12;
        const noteName = NOTE_NAMES_FROM_A[noteOffsetFromA] ?? "?";
        let intervalLabel = "?";
        if (hasRoot) {
          const noteRelativeToKey = (noteOffsetFromA - rootNoteIndex + 12) % 12;
          intervalLabel = getIntervalLabel(noteRelativeToKey);
        }

        // Without a root, interval colors/labels are meaningless — force note coloring.
        // With a root, let the global colorScheme flow through (no override).
        const colorSchemeOverride: FretboardColorScheme | undefined = hasRoot ? undefined : "note";

        // Label: always fall back to note name when no root (interval would show "?")
        let displayLabel: string;
        if (!hasRoot || labelDisplay === "note") {
          displayLabel = noteName;
        } else if (labelDisplay === "none") {
          displayLabel = "";
        } else {
          displayLabel = intervalLabel;
        }

        notesData.push({
          fret: fretIndex,
          stringIndex,
          noteName,
          intervalLabel,
          displayLabel,
          colorSchemeOverride,
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
    // Unchanged
    clearAllChildren(container);
    const headerText = this.rootNoteName
      ? `Notes (Interval Colors Relative to ${this.rootNoteName})`
      : "Notes (Note Name Colors)";
    const header = addHeader(container, headerText);
    header.classList.add('feature-main-title');
  }
}