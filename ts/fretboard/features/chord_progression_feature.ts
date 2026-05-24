// ts/instrument/features/chord_progression_feature.ts
import {
  Feature,
  ConfigurationSchema,
  ConfigurationSchemaArg,
  ArgType,
  UiComponentType,
  LabelValue,
} from "../../feature";
import { InstrumentFeature } from "../fretboard_base";
import { BaseView } from "../../base_view";
import { Chord, chord_library, getChordLibraryForInstrument } from "../chords";
import { AppSettings } from "../../settings";
import { InstrumentSettings, DEFAULT_INSTRUMENT_SETTINGS } from "../fretboard_settings";
import { AudioController } from "../../audio_controller";
import { IntervalSettings } from "../../schedule/editor/interval/types";
import { InstrumentIntervalSettings } from "../fretboard_interval_settings";
import {
  NOTE_NAMES_FROM_A,
  getKeyIndex,
  addHeader,
  clearAllChildren,
} from "../fretboard_utils";
import { InstrumentName } from "../fretboard";
import { DiatonicMode, ALL_DIATONIC_MODES, DIATONIC_MODE_LABELS } from "../music_types";
import { scales } from "../scales";
import { getChordInKey } from "../progressions";
import { ChordDiagramView } from "../views/chord_diagram_view";
import { getEasiestMoveableShape } from "../moveable_shapes";
import { peekPendingCanvasWidth } from "../fretboard_base";
import { planChordDiagramGrid } from "../fretboard_layout";

/** Pre-computed per-mode button entries: label = Roman numeral, value = degree index string. */
function buildLabelsByMode(): Record<string, { basic: LabelValue[]; advanced: LabelValue[] }> {
  const result: Record<string, { basic: LabelValue[]; advanced: LabelValue[] }> = {};
  for (const mode of ALL_DIATONIC_MODES) {
    const entries = scales[mode].generateRomanEntries(true);
    const basic    = entries.slice(0, 7).map((e, i) => ({ label: e.roman, value: String(i) }));
    const advanced = entries.slice(7).map((e, i)  => ({ label: e.roman, value: String(i + 7) }));
    result[mode] = { basic, advanced };
  }
  return result;
}

const LABELS_BY_MODE = buildLabelsByMode();

/** Displays chord diagrams for a Roman numeral progression in a given key and mode. */
export class ChordProgressionFeature extends InstrumentFeature {
  static readonly typeName = "Chord Progression";
  static readonly displayName = "Chord Progression";
  static readonly requiredInstruments = [
    InstrumentName.Guitar, InstrumentName.Mandolin, InstrumentName.Mandola,
    InstrumentName.TenorGuitar, InstrumentName.TenorBanjo,
  ] as const;
  static readonly description =
    "Displays chord diagrams for a Roman numeral progression (e.g., I-IV-V) in a specified key and mode.";

  readonly typeName = ChordProgressionFeature.typeName;
  private readonly rootNoteName: string;
  private readonly progression: string[];
  private readonly headerText: string;
  private readonly mode: DiatonicMode;

  constructor(
    config: ReadonlyArray<string>,
    rootNoteName: string,
    progression: string[],
    headerText: string,
    mode: DiatonicMode,
    settings: AppSettings,
    intervalSettings: InstrumentIntervalSettings,
    audioController?: AudioController,
    maxCanvasHeight?: number,
    chordLibrary: Record<string, Chord> = chord_library
  ) {
    const totalWidth = peekPendingCanvasWidth();

    super(config, settings, intervalSettings, audioController, maxCanvasHeight);
    this.rootNoteName = rootNoteName;
    this.progression  = progression;
    this.headerText   = headerText;
    this.mode         = mode;

    const rootNoteIndex  = getKeyIndex(this.rootNoteName);
    const guitarSettings = settings.instrumentSettings ?? DEFAULT_INSTRUMENT_SETTINGS;
    const modeEntries    = scales[this.mode].generateRomanEntries(true);

    // Resolve stored values: degree index strings ("0"–"13") → Roman numerals for this mode.
    // Legacy Roman strings (e.g. "I", "IV") pass through unchanged.
    const resolveNumeral = (v: string): string => {
      const i = parseInt(v, 10);
      return (!isNaN(i) && i >= 0 && i < modeEntries.length) ? modeEntries[i].roman : v;
    };

    if (progression.length > 0) {
      const { config: fc } = planChordDiagramGrid(
        this.fretboardConfig, totalWidth, maxCanvasHeight,
        progression.length, guitarSettings.zoomMultiplier ?? 1.2
      );
      this.fretboardConfig = fc;
    }

    if (rootNoteIndex !== -1) {
      this.progression.forEach((stored) => {
        const numeral      = resolveNumeral(stored);
        const chordDetails = getChordInKey(rootNoteIndex, numeral, this.mode, chordLibrary);
        const chordData = chordDetails.chordKey ? chordLibrary[chordDetails.chordKey] : null;
        if (chordData) {
          const title = `${chordDetails.chordName} (${numeral})`;
          this._views.push(new ChordDiagramView(chordData, title, this.fretboardConfig));
        } else {
          const easiest = getEasiestMoveableShape(
            guitarSettings.instrument, chordDetails.chordName, this.fretboardConfig.tuning
          );
          if (easiest) {
            const title = `${chordDetails.chordName} [${easiest.shapeName}] (${numeral})`;
            this._views.push(new ChordDiagramView(easiest.chord, title, this.fretboardConfig));
          } else {
            console.warn(
              `[${this.typeName}] No chord shape found for ${chordDetails.chordName} (${numeral}) in ${this.rootNoteName} ${this.mode}`
            );
            this._views.push(new UnresolvableChordView(chordDetails.chordName, numeral));
          }
        }
      });
    } else {
      console.error(`[${this.typeName}] Invalid root note provided: ${this.rootNoteName}`);
    }
  }

  // --- Static Methods ---
  static getConfigurationSchema(): ConfigurationSchema {
    const availableKeys = NOTE_NAMES_FROM_A as string[];

    const specificArgs: ConfigurationSchemaArg[] = [
      {
        name: "Root Note",
        type: ArgType.Enum,
        required: true,
        enum: availableKeys,
        description: "Root note (key) of the progression.",
      },
      {
        name: "Mode",
        type: ArgType.Enum,
        required: true,
        enum: ALL_DIATONIC_MODES as string[],
        enumLabels: ALL_DIATONIC_MODES.map(m => DIATONIC_MODE_LABELS[m]),
        description: "Diatonic mode for the progression.",
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
        uiComponentData: { labelsByMode: LABELS_BY_MODE },
        isVariadic: true,
        description: "Build the progression sequence using Roman numeral buttons.",
      },
    ];
    return {
      description: `Config: ${this.typeName},Root,Mode,ProgNumerals...[,InstrumentSettings]`,
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
    // Config layout: [Root, Mode, Numeral1, Numeral2, ...]
    if (config.length < 3) {
      throw new Error(
        `[${this.typeName}] Invalid config. Expected [Root, Mode, Numeral1, ...], received: [${config.join(", ")}]`
      );
    }
    const rootNoteName = config[0];
    const modeStr = config[1];

    // Accept either the DiatonicMode value ('MAJOR') or legacy KeyType ('Major')
    const legacyMap: Record<string, DiatonicMode> = { Major: DiatonicMode.Ionian, Minor: DiatonicMode.Aeolian };
    const mode: DiatonicMode = (Object.values(DiatonicMode) as string[]).includes(modeStr)
      ? (modeStr as DiatonicMode)
      : (legacyMap[modeStr] ?? DiatonicMode.Ionian);

    const progressionNumerals = config.slice(2);

    const keyIndex = getKeyIndex(rootNoteName);
    if (keyIndex === -1)
      throw new Error(`[${this.typeName}] Unknown root note: "${rootNoteName}"`);
    const validRootName = NOTE_NAMES_FROM_A[keyIndex] ?? rootNoteName;

    if (progressionNumerals.length === 0)
      throw new Error(`[${this.typeName}] Progression cannot be empty.`);

    const modeLabel  = DIATONIC_MODE_LABELS[mode] ?? mode;
    const modeEntries = scales[mode].generateRomanEntries(true);
    const displayNumerals = progressionNumerals.map(v => {
      const i = parseInt(v, 10);
      return (!isNaN(i) && i >= 0 && i < modeEntries.length) ? modeEntries[i].roman : v;
    });
    const headerText = `${displayNumerals.join("-")} in ${validRootName} ${modeLabel}`;
    const guitarIntervalSettings = intervalSettings as InstrumentIntervalSettings;
    const guitarSettings = settings.instrumentSettings ?? DEFAULT_INSTRUMENT_SETTINGS;
    const chordLibrary = getChordLibraryForInstrument(guitarSettings.instrument);

    return new ChordProgressionFeature(
      progressionNumerals,
      validRootName,
      progressionNumerals,
      headerText,
      mode,
      settings,
      guitarIntervalSettings,
      audioController,
      maxCanvasHeight,
      chordLibrary
    );
  }

  render(container: HTMLElement): void {
    clearAllChildren(container);
    const header = addHeader(container, this.headerText);
    header.classList.add('feature-main-title');
  }
}

/** Placeholder shown when no chord shape (library or moveable) could be found. */
class UnresolvableChordView extends BaseView {
  private chordName: string;
  private numeral: string;

  constructor(chordName: string, numeral: string) {
    super();
    this.chordName = chordName;
    this.numeral = numeral;
  }

  render(container: HTMLElement): void {
    const wrapper = document.createElement("div");
    wrapper.classList.add("chord-diagram-view");
    wrapper.style.display = "inline-block";
    wrapper.style.verticalAlign = "top";
    wrapper.style.padding = "5px";
    wrapper.style.textAlign = "center";
    wrapper.style.opacity = "0.6";

    const titleEl = document.createElement("div");
    titleEl.classList.add("chord-diagram-title");
    titleEl.textContent = `${this.chordName} (${this.numeral})`;

    const warn = document.createElement("span");
    warn.textContent = " ⚠";
    warn.title = "No chord shape found for this chord";
    warn.style.color = "var(--clr-warning, #e6a817)";
    warn.style.fontSize = "0.9em";
    titleEl.appendChild(warn);
    wrapper.appendChild(titleEl);

    const msg = document.createElement("div");
    msg.style.fontSize = "0.75rem";
    msg.style.color = "var(--clr-text-subtle)";
    msg.style.marginTop = "8px";
    msg.textContent = "No shape found";
    wrapper.appendChild(msg);

    container.appendChild(wrapper);
  }
}
