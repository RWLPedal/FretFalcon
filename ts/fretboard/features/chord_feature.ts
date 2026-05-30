// ts/instrument/features/chord_feature.ts
import {
  Feature,
  // FeatureCategoryName removed
  ConfigurationSchema,
  ConfigurationSchemaArg,
  ArgType,
  UiComponentType,
} from "../../feature";
import { InstrumentFeature } from "../fretboard_base";
import {
  Chord,
  ChordType,
  CHORD_TYPE_SORT_ORDER,
  CHORD_LIBRARIES,
  ALL_CHORD_ROOTS,
  getChordLibraryForInstrument,
  getAvailableRoots,
  getAvailableChordTypes,
  findChordByRootAndType,
} from "../chords";
import { AudioController } from "../../audio_controller";
import type { NoteName } from "../music_types";
import { AppSettings } from "../../settings";
import { ChordDiagramView } from "../views/chord_diagram_view";
import { MoveableToggleView } from "../views/moveable_toggle_view";
import { MOVEABLE_CHORD_LIBRARIES, getEasiestMoveableShape, getMoveableShapes } from "../moveable_shapes";
import { resolveTuning, InstrumentName } from "../fretboard";
import { peekPendingCanvasWidth } from "../fretboard_base";
import { planChordDiagramGrid } from "../fretboard_layout";
import { addHeader, clearAllChildren } from "../fretboard_utils";
import { InstrumentSettings, DEFAULT_INSTRUMENT_SETTINGS } from "../fretboard_settings";
// Import generic and specific interval settings types
import { IntervalSettings } from "../../schedule/editor/interval/types";
import { InstrumentIntervalSettings } from "../fretboard_interval_settings";

/** A feature for displaying mulitple chord diagrams and a metronome. */
export class ChordFeature extends InstrumentFeature {
  // Static properties (category removed, others unchanged)
  // static readonly category = FeatureCategoryName.Guitar; // Removed
  static readonly typeName = "Chord";
  static readonly displayName = "Chord Diagram";
  static readonly requiredInstruments = [
    InstrumentName.Guitar, InstrumentName.Ukulele,
    InstrumentName.Mandolin, InstrumentName.Mandola,
    InstrumentName.TenorGuitar, InstrumentName.TenorBanjo,
  ] as const;
  static readonly description = "Displays one or more chord diagrams.";
  readonly typeName = ChordFeature.typeName;

  private static readonly MOVEABLE_PREF_KEY = "guitar-moveable-chord-pref";

  private readonly chords: ReadonlyArray<Chord>;
  private moveableView: MoveableToggleView | null = null;
  private readonly isMoveable: boolean;

  constructor(
    config: ReadonlyArray<string>, // Chord keys specific to this feature
    chords: ReadonlyArray<Chord>,
    settings: AppSettings,
    intervalSettings: InstrumentIntervalSettings, // Constructor still expects specific type from base class
    audioController?: AudioController,
    maxCanvasHeight?: number
  ) {
    // Peek before super() consumes the pending constraint.
    const totalWidth = peekPendingCanvasWidth();

    // Pass intervalSettings up to the base constructor
    super(
      config,
      settings,
      intervalSettings, // Pass specific type here
      audioController,
      maxCanvasHeight
    );

    this.chords = chords;
    this.isMoveable = localStorage.getItem(ChordFeature.MOVEABLE_PREF_KEY) === "true";

    if (chords.length > 0) {
      const guitarSettings = settings.instrumentSettings ?? DEFAULT_INSTRUMENT_SETTINGS;
      let diagramCount = chords.length;
      if (this.isMoveable && guitarSettings.instrument in MOVEABLE_CHORD_LIBRARIES) {
        const moveableCount = chords.reduce(
          (sum, chord) => sum + getMoveableShapes(guitarSettings.instrument, chord.name, this.fretboardConfig.tuning, chord.chordType).length,
          0
        );
        diagramCount += moveableCount;
      }
      const { config } = planChordDiagramGrid(
        this.fretboardConfig, totalWidth, maxCanvasHeight,
        diagramCount, guitarSettings.zoomMultiplier ?? 1.2
      );
      this.fretboardConfig = config;
    }

    const guitarSettings = settings.instrumentSettings ?? DEFAULT_INSTRUMENT_SETTINGS;

    if (guitarSettings.instrument in MOVEABLE_CHORD_LIBRARIES) {
      this.moveableView = new MoveableToggleView(chords, this.fretboardConfig, this.isMoveable, guitarSettings.instrument);
      this._views.push(this.moveableView);
    } else {
      // Other instruments: static chord diagrams only.
      chords.forEach((chord) => {
        this._views.push(new ChordDiagramView(chord, chord.name, this.fretboardConfig));
      });
    }
  }

  // --- Static Methods ---
  static readonly ALL_TYPES_VALUE = "All";

  static getConfigurationSchema(settings?: AppSettings): ConfigurationSchema {
    const instrument = (settings?.instrumentSettings?.instrument as InstrumentName) ?? InstrumentName.Guitar;
    const hasMoveable = instrument in MOVEABLE_CHORD_LIBRARIES;
    const library = getChordLibraryForInstrument(instrument);
    const availableRoots: string[] = hasMoveable ? [...ALL_CHORD_ROOTS] : getAvailableRoots(library);
    const filteredTypes = hasMoveable ? CHORD_TYPE_SORT_ORDER : getAvailableChordTypes(library);
    const chordTypes = [ChordFeature.ALL_TYPES_VALUE, ...filteredTypes.map(t => t as string)];

    const specificArgs: ConfigurationSchemaArg[] = [
      {
        name: "Root",
        type: ArgType.Enum,
        required: true,
        enum: availableRoots,
        description: "Root note of the chord.",
      },
      {
        name: "Type",
        type: ArgType.Enum,
        required: true,
        enum: chordTypes,
        defaultValue: ChordType.MAJOR,
        description: "Chord quality, or 'All' to show all variations. Available chords depend on the selected instrument.",
      },
      {
        name: "Moveable",
        type: ArgType.Boolean,
        uiComponentType: UiComponentType.Checkbox,
        description: "Show moveable barre chord shapes instead of standard open shapes. (Guitar only)",
      },
    ];
    return {
      description: `Config: ${this.typeName},Root,Type[,InstrumentSettings]`,
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
    const lastVal = config.length > 0 ? config[config.length - 1] : null;
    const hasMode = lastVal === 'true' || lastVal === 'false';
    const effectiveConfig = hasMode ? Array.from(config.slice(0, -1)) : Array.from(config);

    if (effectiveConfig.length < 1) {
      throw new Error(`Invalid config for ${this.typeName}. Expected Root and Type.`);
    }

    const guitarSettings = settings.instrumentSettings ?? DEFAULT_INSTRUMENT_SETTINGS;
    const library = getChordLibraryForInstrument(guitarSettings.instrument);
    const chords: Chord[] = [];

    // New format: config[0] is a root note like "A", "Bb", "F#".
    // Old format: config[0] is a library key like "A_MAJOR", "A7".
    const isNewFormat = /^[A-G][b#]?$/.test(effectiveConfig[0]);

    if (isNewFormat) {
      const rootNote = effectiveConfig[0];
      const typeName = effectiveConfig[1] ?? ChordType.MAJOR;

      const typesToFind = typeName === ChordFeature.ALL_TYPES_VALUE
        ? CHORD_TYPE_SORT_ORDER
        : [typeName as ChordType];

      for (const t of typesToFind) {
        let chord = findChordByRootAndType(library, rootNote as NoteName, t);
        if (!chord) {
          const tuning = resolveTuning(guitarSettings.instrument as InstrumentName ?? InstrumentName.Guitar, guitarSettings.tuning);
          const result = getEasiestMoveableShape(
            guitarSettings.instrument,
            `${rootNote} ${t}`,
            tuning,
            t
          );
          if (result) chord = result.chord;
        }
        if (chord) {
          chords.push(chord);
        } else if (typeName !== ChordFeature.ALL_TYPES_VALUE) {
          console.warn(`[${this.typeName}] No "${t}" chord for root "${rootNote}" in ${guitarSettings.instrument} library.`);
        }
      }
    } else {
      // Backward compat: treat each value as a library key.
      effectiveConfig.forEach((key) => {
        const chord = library[key];
        if (chord) {
          chords.push(chord);
        } else {
          console.warn(`[${this.typeName}] Unknown chord key for ${guitarSettings.instrument}: "${key}". Skipping.`);
        }
      });
    }

    if (chords.length === 0) {
      throw new Error(`[${this.typeName}] No valid chord found in config: ${config.join(",")}`);
    }

    const guitarIntervalSettings = intervalSettings as InstrumentIntervalSettings;
    return new ChordFeature(
      effectiveConfig,
      chords,
      settings,
      guitarIntervalSettings,
      audioController,
      maxCanvasHeight
    );
  }

  render(container: HTMLElement): void {
    clearAllChildren(container);
    const uniqueNames = [...new Set(this.chords.map((c) => c.name))];
    let headerText = "Chord Diagram";
    if (uniqueNames.length === 1) {
      headerText = `${uniqueNames[0]} Chord`;
    } else if (uniqueNames.length > 1) {
      const uniqueRoots = [...new Set(this.chords.map((c) => c.rootKey))];
      if (uniqueRoots.length === 1) {
        headerText = `${uniqueRoots[0]} Chord Variations`;
      } else {
        headerText = uniqueNames.slice(0, 3).join(" / ") + " Chords";
      }
    }
    const header = addHeader(container, headerText);
    header.classList.add("feature-main-title");

    const outerContainer = container.parentElement;
    const movField = outerContainer?.querySelector<HTMLElement>('[data-arg-name="Moveable"]');
    if (this.moveableView) {
      if (movField) movField.style.display = '';
      const movCb = movField?.querySelector<HTMLInputElement>('input[type="checkbox"]');
      if (movCb) {
        const freshCb = movCb.cloneNode(true) as HTMLInputElement;
        freshCb.checked = this.isMoveable;
        movCb.parentNode!.replaceChild(freshCb, movCb);
        freshCb.addEventListener('change', () => {
          localStorage.setItem(ChordFeature.MOVEABLE_PREF_KEY, String(freshCb.checked));
          this.moveableView!.setIsMoveable(freshCb.checked);
        });
      }
    } else {
      if (movField) movField.style.display = 'none';
    }
  }
}
