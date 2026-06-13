// ts/instrument/features/chord_feature.ts
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
} from "../../music/chords";
import type { NoteName } from "../../music/music_types";
import { AppSettings } from "../../settings";
import { ChordDiagramView } from "../views/chord_diagram_view";
import { MoveableToggleView } from "../views/moveable_toggle_view";
import { MOVEABLE_CHORD_LIBRARIES, getEasiestMoveableShape, getMoveableShapes } from "../../music/moveable_shapes";
import { resolveTuning, InstrumentName } from "../instruments";
import { planChordDiagramGrid } from "../layout";
import { addHeader, clearAllChildren } from "../fretboard_utils";
import { InstrumentSettings, DEFAULT_INSTRUMENT_SETTINGS, ChordLabelDisplay } from "../fretboard_settings";
import { featureTypeId } from "../../core/ids";
import { enumCodec } from "../../core/config/codecs";
import type { ConfigSpec } from "../../core/config/spec";
import { SignalKind, KeyType } from "../../panels/link_types";

// ─── Typed config ─────────────────────────────────────────────────────────────

export interface ChordConfig {
  root: string;
  type: string;
  display: ChordLabelDisplay;
}

const CHORD_ALL_TYPES_VALUE = 'All';
const CHORD_REQUIRED_INSTRUMENTS = [
  InstrumentName.Guitar, InstrumentName.Ukulele,
  InstrumentName.Mandolin, InstrumentName.Mandola,
  InstrumentName.TenorGuitar, InstrumentName.TenorBanjo,
] as const;
const CHORD_TYPE_OPTIONS = [CHORD_ALL_TYPES_VALUE, ...CHORD_TYPE_SORT_ORDER];
const DISPLAY_OPTIONS: ChordLabelDisplay[] = ['fingering', 'interval', 'notes'];

const chordConfigSpec: ConfigSpec<ChordConfig> = {
  root: {
    label: 'Root',
    codec: enumCodec([...ALL_CHORD_ROOTS] as string[]),
    ui: { kind: 'select', options: [...ALL_CHORD_ROOTS].map(v => ({ value: v as string })) },
    defaultValue: 'G',
    drivable: {
      kinds: [SignalKind.Chord],
      fromSignal: (s: any) => s.kind === SignalKind.Chord ? (s.rootNote ?? undefined) : undefined,
    },
  },
  type: {
    label: 'Type',
    codec: enumCodec(CHORD_TYPE_OPTIONS),
    ui: { kind: 'select', options: CHORD_TYPE_OPTIONS.map(v => ({ value: v })) },
    defaultValue: ChordType.MAJOR,
    drivable: {
      kinds: [SignalKind.Chord],
      fromSignal: (s: any) => {
        if (s.kind !== SignalKind.Chord) return undefined;
        if (s.chordKey) {
          const sep = (s.chordKey as string).indexOf('_');
          if (sep !== -1) {
            const suffix = (s.chordKey as string).slice(sep + 1);
            const suffixMap: Record<string, string> = {
              MAJ: 'Major', MIN: 'Minor', DIM: 'Dim', DOM7: '7', MAJ7: 'Maj7', MIN7: 'Min7',
            };
            const resolved = suffixMap[suffix];
            if (resolved) return resolved;
          }
        }
        return s.keyType === KeyType.Major ? 'Major' : 'Minor';
      },
    },
  },
  display: {
    label: 'Display',
    codec: enumCodec(DISPLAY_OPTIONS),
    ui: { kind: 'toggleButtons', options: [
      { value: 'fingering', label: 'Fingering' },
      { value: 'interval', label: 'Interval' },
      { value: 'notes', label: 'Notes' },
    ]},
    defaultValue: 'fingering',
  },
};

function buildChordsFromConfig(config: ChordConfig, settings: AppSettings): Chord[] {
  const guitarSettings = settings.instrumentSettings ?? DEFAULT_INSTRUMENT_SETTINGS;
  const library = getChordLibraryForInstrument(guitarSettings.instrument);
  const chords: Chord[] = [];
  const typesToFind = config.type === CHORD_ALL_TYPES_VALUE
    ? CHORD_TYPE_SORT_ORDER
    : [config.type as ChordType];

  for (const t of typesToFind) {
    let chord = findChordByRootAndType(library, config.root as NoteName, t);
    if (!chord) {
      const tuning = resolveTuning(guitarSettings.instrument as InstrumentName ?? InstrumentName.Guitar, guitarSettings.tuning);
      const result = getEasiestMoveableShape(guitarSettings.instrument, `${config.root} ${t}`, tuning, t);
      if (result) chord = result;
    }
    if (chord) chords.push(chord);
  }
  return chords;
}

export const ChordFeatureSpec: FeatureSpec<ChordConfig> = {
  id: featureTypeId('Chord'),
  displayName: 'Chord Diagram',
  description: 'Displays one or more chord diagrams.',
  requiredInstruments: [...CHORD_REQUIRED_INSTRUMENTS] as unknown as string[],
  legacyArgOrder: ['root', 'type', 'display'],
  configSpec: chordConfigSpec,
  title: (config) => {
    const root = config.root ?? 'G';
    const type = config.type ?? 'Major';
    if (type === CHORD_ALL_TYPES_VALUE) return `${root} Chords`;
    return `${root} ${type}`;
  },
  create(config: ChordConfig, ctx: FeatureContext): Feature {
    const chords = buildChordsFromConfig(config, ctx.settings);
    if (chords.length === 0) throw new Error(`[ChordFeature] No chord found for ${config.root} ${config.type}`);
    return new ChordFeature([], chords, ctx.settings, ctx.constraints.maxHeight, config.display, ctx.constraints.maxWidth);
  },
};

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
    config: ReadonlyArray<string>,
    chords: ReadonlyArray<Chord>,
    settings: AppSettings,
    maxCanvasHeight?: number,
    chordLabelDisplay: ChordLabelDisplay = "fingering",
    maxWidth?: number,
  ) {
    super(config, settings, maxCanvasHeight, maxWidth);

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
        this.fretboardConfig, maxWidth, maxCanvasHeight,
        diagramCount, guitarSettings.zoomMultiplier ?? 1.2
      );
      this.fretboardConfig = config;
    }

    const guitarSettings = settings.instrumentSettings ?? DEFAULT_INSTRUMENT_SETTINGS;

    if (guitarSettings.instrument in MOVEABLE_CHORD_LIBRARIES) {
      this.moveableView = new MoveableToggleView(chords, this.fretboardConfig, this.isMoveable, guitarSettings.instrument, chordLabelDisplay);
      this._views.push(this.moveableView);
    } else {
      // Other instruments: static chord diagrams only.
      chords.forEach((chord) => {
        this._views.push(new ChordDiagramView(chord, chord.name, this.fretboardConfig, undefined, undefined, chordLabelDisplay));
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
        name: "Display",
        type: ArgType.Enum,
        enum: ["fingering", "interval", "notes"],
        enumLabels: ["Fingering", "Interval", "Notes"],
        defaultValue: "fingering",
        description: "What to show on chord note circles.",
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
      args: specificArgs,
    };
  }

  static createFeature(
    config: ReadonlyArray<string>,
    settings: AppSettings,
    maxCanvasHeight: number | undefined,
    _categoryName: string
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
          if (result) chord = result;
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

    const VALID_DISPLAY = new Set(["fingering", "interval", "notes"]);
    const rawDisplay = isNewFormat ? effectiveConfig[2] : undefined;
    const chordLabelDisplay: ChordLabelDisplay =
      rawDisplay && VALID_DISPLAY.has(rawDisplay) ? rawDisplay as ChordLabelDisplay : "fingering";

    return new ChordFeature(
      effectiveConfig,
      chords,
      settings,
      maxCanvasHeight,
      chordLabelDisplay
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

