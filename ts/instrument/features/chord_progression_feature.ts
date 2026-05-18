// ts/instrument/features/chord_progression_feature.ts
import {
  Feature,
  // FeatureCategoryName removed
  ConfigurationSchema,
  ConfigurationSchemaArg,
  ArgType,
  UiComponentType,
} from "../../feature";
import { InstrumentFeature } from "../instrument_base";
import { Chord, chord_library, getChordLibraryForInstrument } from "../chords";
import { AppSettings } from "../../settings";
import { InstrumentSettings, DEFAULT_INSTRUMENT_SETTINGS } from "../instrument_settings";
import { AudioController } from "../../audio_controller";
// Import generic and specific interval settings types
import { IntervalSettings } from "../../schedule/editor/interval/types";
import { InstrumentIntervalSettings } from "../instrument_interval_settings";
import {
  NOTE_NAMES_FROM_A,
  getKeyIndex,
  addHeader,
  clearAllChildren,
} from "../instrument_utils";
import { KeyType, getChordInKey } from "../progressions";
import { ChordDiagramView } from "../views/chord_diagram_view";
import { getEasiestMoveableShape } from "../moveable_shapes";
import { peekPendingCanvasWidth } from "../instrument_base";
import { planChordDiagramGrid } from "../fretboard_layout";

/** Displays chord diagrams for a Roman numeral progression in a given key. */
export class ChordProgressionFeature extends InstrumentFeature {
  // Static properties (category removed, others unchanged)
  // static readonly category = FeatureCategoryName.Guitar; // Removed
  static readonly typeName = "Chord Progression";
  static readonly displayName = "Chord Progression";
  static readonly requiredInstruments = ["Guitar", "Mandolin", "Mandola"] as const;
  static readonly description =
    "Displays chord diagrams for a Roman numeral progression (e.g., I-IV-V) in a specified key.";

  readonly typeName = ChordProgressionFeature.typeName;
  private readonly rootNoteName: string;
  private readonly progression: string[]; // Array of Roman numerals specific to this feature
  private readonly headerText: string;
  private readonly keyType: KeyType;

  constructor(
    config: ReadonlyArray<string>, // Should contain only progression numerals now
    rootNoteName: string,
    progression: string[],
    headerText: string,
    keyType: KeyType,
    settings: AppSettings,
    intervalSettings: InstrumentIntervalSettings, // Constructor expects specific type
    audioController?: AudioController,
    maxCanvasHeight?: number,
    chordLibrary: Record<string, Chord> = chord_library
  ) {
    // Peek before super() consumes the pending constraint.
    const totalWidth = peekPendingCanvasWidth();

    super(
      config, // Pass specific config
      settings,
      intervalSettings, // Pass specific type
      audioController,
      maxCanvasHeight
    );
    this.rootNoteName = rootNoteName;
    this.progression = progression;
    this.headerText = headerText;
    this.keyType = keyType;

    // Create ChordDiagramViews (metronome view is handled by base constructor)
    const rootNoteIndex = getKeyIndex(this.rootNoteName);
    const guitarSettings = settings.instrumentSettings ?? DEFAULT_INSTRUMENT_SETTINGS;

    if (progression.length > 0) {
      const { config } = planChordDiagramGrid(
        this.fretboardConfig, totalWidth, maxCanvasHeight,
        progression.length, guitarSettings.zoomMultiplier ?? 1.2
      );
      this.fretboardConfig = config;
    }

    if (rootNoteIndex !== -1) {
      this.progression.forEach((numeral) => {
        const chordDetails = getChordInKey(rootNoteIndex, numeral, this.keyType, chordLibrary);
        const chordData = chordDetails.chordKey
          ? chordLibrary[chordDetails.chordKey]
          : null;
        if (chordData) {
          const title = `${chordDetails.chordName} (${numeral})`;
          this._views.push(new ChordDiagramView(chordData, title, this.fretboardConfig));
        } else {
          // Chord not in open-chord library — fall back to a moveable shape.
          const easiest = getEasiestMoveableShape(guitarSettings.instrument, chordDetails.chordName, this.fretboardConfig.tuning);
          if (easiest) {
            const title = `${chordDetails.chordName} [${easiest.shapeName}] (${numeral})`;
            this._views.push(new ChordDiagramView(easiest.chord, title, this.fretboardConfig));
          } else {
            console.warn(
              `[${this.typeName}] No chord shape found for ${chordDetails.chordName} (${numeral}) in key ${this.rootNoteName}`
            );
          }
        }
      });
    } else {
      console.error(
        `[${this.typeName}] Invalid root note provided: ${this.rootNoteName}`
      );
    }
  }

  // --- Static Methods ---
  static getConfigurationSchema(): ConfigurationSchema {
    const availableKeys = NOTE_NAMES_FROM_A as string[];

    const majorBasic    = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
    const majorAdvanced = ["Imaj7", "ii7", "iii7", "IVmaj7", "V7", "vi7", "viiø7"];
    const minorBasic    = ["i", "ii°", "III", "iv", "v", "VI", "VII"];
    const minorAdvanced = ["im7", "iiø7", "IIImaj7", "iv7", "v7", "VImaj7", "VII7"];

    const specificArgs: ConfigurationSchemaArg[] = [
      {
        name: "Root Note",
        type: ArgType.Enum,
        required: true,
        enum: availableKeys,
        description: "Root note (key) of the progression.",
      },
      {
        name: "Key Type",
        type: ArgType.Enum,
        required: true,
        enum: ["Major", "Minor"],
        description: "Major or natural minor key.",
        controlsArgName: "Prog",
      },
      {
        name: "Advanced",
        type: ArgType.Boolean,
        uiComponentType: UiComponentType.Checkbox,
        description: "Show 7th chord options.",
        controlsArgName: "Prog",
      },
      {
        name: "Prog",
        type: ArgType.String,
        required: true,
        uiComponentType: UiComponentType.ToggleButtonSelector,
        uiComponentData: {
          buttonLabels: majorBasic,
          advancedButtonLabels: majorAdvanced,
          minorButtonLabels: minorBasic,
          minorAdvancedButtonLabels: minorAdvanced,
        },
        isVariadic: true,
        description: "Build the progression sequence using Roman numeral buttons.",
      },
    ];
    return {
      description: `Config: ${this.typeName},Root,Key,ProgNumerals...[,InstrumentSettings]`,
      args: [...specificArgs, InstrumentFeature.BASE_INSTRUMENT_SETTINGS_CONFIG_ARG],
    };
  }

  static createFeature(
    config: ReadonlyArray<string>,
    audioController: AudioController,
    settings: AppSettings,
    intervalSettings: IntervalSettings,
    maxCanvasHeight: number | undefined,
    _categoryName: string
  ): Feature {
    // Config layout: [Root, Key, Numeral1, Numeral2, ...]
    if (config.length < 3) {
      throw new Error(
        `[${this.typeName}] Invalid config. Expected [Root, Key, Numeral1, ...], received: [${config.join(", ")}]`
      );
    }
    const rootNoteName = config[0];
    const keyType = config[1] as KeyType;
    if (keyType !== "Major" && keyType !== "Minor") {
      throw new Error(`[${this.typeName}] Invalid key type: "${keyType}". Expected "Major" or "Minor".`);
    }
    const progressionNumerals = config.slice(2);

    const keyIndex = getKeyIndex(rootNoteName);
    if (keyIndex === -1)
      throw new Error(`[${this.typeName}] Unknown root note: "${rootNoteName}"`);
    const validRootName = NOTE_NAMES_FROM_A[keyIndex] ?? rootNoteName;

    if (progressionNumerals.length === 0) {
      throw new Error(`[${this.typeName}] Progression cannot be empty.`);
    }

    const headerText = `${progressionNumerals.join("-")} in ${validRootName} ${keyType}`;
    const guitarIntervalSettings = intervalSettings as InstrumentIntervalSettings;
    const guitarSettings = settings.instrumentSettings ?? DEFAULT_INSTRUMENT_SETTINGS;
    const chordLibrary = getChordLibraryForInstrument(guitarSettings.instrument);

    return new ChordProgressionFeature(
      progressionNumerals,
      validRootName,
      progressionNumerals,
      headerText,
      keyType,
      settings,
      guitarIntervalSettings,
      audioController,
      maxCanvasHeight,
      chordLibrary
    );
  }

  /** Render method now just adds the header. Views are rendered by DisplayController. */
  render(container: HTMLElement): void {
    clearAllChildren(container);
    const header = addHeader(container, this.headerText);
    header.classList.add('feature-main-title');
    // DisplayController renders the views (_views) added in the constructor
  }
}
