import {
  Feature,
  FeatureSpec,
  FeatureContext,
  ConfigurationSchema,
  ConfigurationSchemaArg,
  ArgType,
  UiComponentType,
} from "../../feature";
import { BaseView } from "../../core/base_view";
import { InstrumentFeature } from "../fretboard_base";
import {
  FretboardConfig,
  resolveTuning,
  STANDARD_TUNING,
  GUITAR_7_STANDARD_TUNING,
  GUITAR_8_STANDARD_TUNING,
  InstrumentName,
} from "../fretboard";
import { AppSettings } from "../../settings";
import {
  NOTE_NAMES_FROM_A,
  getKeyIndex,
  addHeader,
  clearAllChildren,
} from "../fretboard_utils";
import { planMultiFretboardGrid } from "../fretboard_layout";
import { TriadQuality, getTriadNotesAndLinesForGroup } from "../triads";
import { FretboardView } from "../views/fretboard_view";
import {
  DEFAULT_INSTRUMENT_SETTINGS,
  InstrumentSettings,
} from "../fretboard_settings";
import { featureTypeId } from "../../core/ids";
import { enumCodec, stringArrayCodec } from "../../core/config/codecs";
import type { FieldCodec } from "../../core/config/spec";
import type { ConfigSpec } from "../../core/config/spec";
import { SignalKind, KeyType } from "../../panels/link_types";
import { ChordQuality } from "../music_types";
import { scales } from "../scales";

// ─── Typed config ─────────────────────────────────────────────────────────────

export interface TriadConfig {
  rootNote: string;
  qualities: TriadQuality[];
}

const TRIAD_QUALITIES: TriadQuality[] = ['Major', 'Minor', 'Diminished', 'Augmented'];
const TRIAD_REQUIRED_INSTRUMENTS = [
  InstrumentName.Guitar, InstrumentName.SevenStrGuitar, InstrumentName.EightStrGuitar,
] as const;

function tonicIsMinorFromScale(scaleKey: string): boolean {
  const scale = (scales as any)[scaleKey];
  if (!scale || typeof scale.getChordQualityAt !== 'function') return false;
  const q: ChordQuality = scale.getChordQualityAt(0);
  return q === ChordQuality.Minor || q === ChordQuality.Diminished;
}

const triadConfigSpec: ConfigSpec<TriadConfig> = {
  rootNote: {
    label: 'Root Note',
    codec: enumCodec(NOTE_NAMES_FROM_A as string[]),
    ui: { kind: 'select', options: (NOTE_NAMES_FROM_A as string[]).map(v => ({ value: v })) },
    defaultValue: 'C',
    drivable: {
      kinds: [SignalKind.Chord, SignalKind.Key],
      fromSignal: (s: any) => (s.kind === SignalKind.Chord || s.kind === SignalKind.Key) ? (s.rootNote ?? undefined) : undefined,
    },
  },
  qualities: {
    label: 'Qualities',
    codec: stringArrayCodec as FieldCodec<TriadQuality[]>,
    ui: { kind: 'toggleButtons', options: TRIAD_QUALITIES.map(v => ({ value: v, label: v })) },
    defaultValue: ['Major', 'Minor'],
    drivable: {
      kinds: [SignalKind.Key, SignalKind.Chord],
      transparent: true,
      fromSignal: (s: any): TriadQuality[] | undefined => {
        if (s.kind === SignalKind.Key) return [tonicIsMinorFromScale(s.scaleKey) ? 'Minor' : 'Major'];
        if (s.kind === SignalKind.Chord) return [s.keyType === KeyType.Major ? 'Major' : 'Minor'];
        return undefined;
      },
    },
  },
};

export const TriadFeatureSpec: FeatureSpec<TriadConfig> = {
  id: featureTypeId('Triad Shapes'),
  displayName: 'Triad Shapes (3-String Sets)',
  description: 'Displays triad shapes for selected qualities across all positions for each 3-string set.',
  requiredInstruments: [...TRIAD_REQUIRED_INSTRUMENTS] as unknown as string[],
  isCompatibleWithTuning: TriadFeatureCompatCheck,
  legacyArgOrder: ['rootNote', 'qualities'],
  legacyVariadicTail: 'qualities',
  configSpec: triadConfigSpec,
  title: (config) => {
    const root = config.rootNote ?? 'C';
    const qs = config.qualities ?? [];
    const base = `${root} Triad Shapes`;
    return qs.length > 0 ? `${base} (${qs.join(', ')})` : base;
  },
  create(config: TriadConfig, ctx: FeatureContext): Feature {
    const keyIndex = getKeyIndex(config.rootNote);
    if (keyIndex === -1) throw new Error(`[TriadFeature] Unknown key: "${config.rootNote}"`);
    const validRootName = NOTE_NAMES_FROM_A[keyIndex] ?? config.rootNote;
    const mainHeaderText = `${validRootName} Triad Shapes (${config.qualities.join(', ')})`;
    return new TriadFeature([], validRootName, config.qualities, mainHeaderText, ctx.settings, ctx.constraints.maxHeight, ctx.constraints.maxWidth);
  },
};

function TriadFeatureCompatCheck(instrument: string, tuningName: string): boolean {
  if (instrument === InstrumentName.SevenStrGuitar) return tuningName === GUITAR_7_STANDARD_TUNING.name;
  if (instrument === InstrumentName.EightStrGuitar) return tuningName === GUITAR_8_STANDARD_TUNING.name;
  return true;
}

/** Returns all consecutive 3-string groups for a given string count. */
function getStringGroups(stringCount: number): [number, number, number][] {
  return Array.from(
    { length: stringCount - 2 },
    (_, i) => [i, i + 1, i + 2] as [number, number, number],
  );
}

/**
 * A dedicated View to render a single row for a given triad quality,
 * containing a header and four FretboardViews. This class is self-contained.
 */
class TriadQualityRowView extends BaseView {
  private quality: TriadQuality;
  private rootNoteName: string;
  private fretboardConfig: FretboardConfig;
  private fretboardViews: FretboardView[] = [];
  private rowContainer: HTMLElement | null = null;
  private diagramsContainer: HTMLElement | null = null; // Keep reference to this

  constructor(
    quality: TriadQuality,
    rootNoteName: string,
    fretboardConfig: FretboardConfig,
  ) {
    super();
    this.quality = quality;
    this.rootNoteName = rootNoteName;
    this.fretboardConfig = fretboardConfig;
    const fretCount = 15;

    let orderedGroups = getStringGroups(fretboardConfig.stringCount);
    if (this.fretboardConfig.handedness === "left") {
      orderedGroups.reverse();
    }
    orderedGroups.forEach((group) => {
      const triadData = getTriadNotesAndLinesForGroup(
        rootNoteName,
        quality,
        group,
        fretCount,
        fretboardConfig,
      );
      const view = new FretboardView(fretboardConfig, fretCount);
      view.setNotes(triadData.notes);
      view.setLines(triadData.lines);
      this.fretboardViews.push(view);
    });
  }

  render(container: HTMLElement): void {
    // Create the DOM elements only on the first render call
    if (!this.rowContainer) {
      this.rowContainer = document.createElement("div");
      this.rowContainer.className = "triad-quality-row";
      this.rowContainer.style.marginBottom = "10px";

      const header = addHeader(this.rowContainer, `${this.quality} Triads`);
      header.classList.add("feature-subtitle");
      header.style.textAlign = "left";
      header.style.fontSize = "0.95rem";

      this.diagramsContainer = document.createElement("div");
      this.diagramsContainer.style.display = "flex";
      this.diagramsContainer.style.flexWrap = "wrap";
      this.diagramsContainer.style.gap = "4px";
      this.rowContainer.appendChild(this.diagramsContainer);
    }

    // Ensure the main row container is attached to the parent DOM
    if (this.rowContainer && !this.rowContainer.parentNode) {
      container.appendChild(this.rowContainer);
    }

    // Always call render on the child FretboardViews to ensure they redraw themselves.
    // The diagramsContainer, which is the parent for the canvases, will be valid.
    if (this.diagramsContainer) {
      this.fretboardViews.forEach((view) => {
        view.render(this.diagramsContainer!);
      });
    }
  }

  destroy() {
    this.fretboardViews.forEach((view) => view.destroy());
    this.rowContainer?.remove();
    super.destroy();
  }
}

/** Displays triad shapes across four 3-string groups for multiple qualities. */
export class TriadFeature extends InstrumentFeature {
  static readonly typeName = "Triad Shapes";
  static readonly displayName = "Triad Shapes (3-String Sets)";
  static readonly requiredInstruments = [
    InstrumentName.Guitar,
    InstrumentName.SevenStrGuitar,
    InstrumentName.EightStrGuitar,
  ] as const;
  static isCompatibleWithTuning(
    instrument: string,
    tuningName: string,
  ): boolean {
    if (instrument === InstrumentName.SevenStrGuitar)
      return tuningName === GUITAR_7_STANDARD_TUNING.name;
    if (instrument === InstrumentName.EightStrGuitar)
      return tuningName === GUITAR_8_STANDARD_TUNING.name;
    return true;
  }
  static readonly defaultWidth = 415;
  static readonly defaultHeight = 685;
  static readonly description =
    "Displays triad shapes for selected qualities (Major, Minor, etc.) across all positions for each 3-string set.";

  readonly typeName = TriadFeature.typeName;
  private readonly mainHeaderText: string;

  // Stored for deferred layout when dimensions aren't known at construction time.
  private readonly _qualities: TriadQuality[];
  private readonly _rootNoteName: string;
  private readonly _zoomMultiplier: number;

  private rowViews: TriadQualityRowView[] = [];

  constructor(
    config: ReadonlyArray<string>,
    rootNoteName: string,
    qualities: TriadQuality[],
    mainHeaderText: string,
    settings: AppSettings,
    maxCanvasHeight?: number,
    maxWidth?: number,
  ) {
    const guitarGlobalSettings =
      (settings.instrumentSettings as InstrumentSettings | undefined) ??
      DEFAULT_INSTRUMENT_SETTINGS;

    // Reference config at default scale — base dimensions for the layout algorithm.
    const baseFretboardConfig = new FretboardConfig(
      resolveTuning(
        (guitarGlobalSettings.instrument as InstrumentName) ??
          InstrumentName.Guitar,
        guitarGlobalSettings.tuning,
      ),
      guitarGlobalSettings.handedness,
      guitarGlobalSettings.orientation,
      guitarGlobalSettings.colorScheme,
      guitarGlobalSettings.labelDisplay ?? "interval",
      undefined,
      undefined,
      undefined,
      maxCanvasHeight,
    );

    const { config: featureFretboardConfig } = planMultiFretboardGrid(
      baseFretboardConfig,
      maxWidth,
      maxCanvasHeight,
      baseFretboardConfig.stringCount - 2,
      qualities.length,
      guitarGlobalSettings.zoomMultiplier ?? 1.2,
      15,
    );

    super(config, settings, maxCanvasHeight, maxWidth);
    this.fretboardConfig = featureFretboardConfig;
    this.mainHeaderText = mainHeaderText;
    this._qualities = [...qualities];
    this._rootNoteName = rootNoteName;
    this._zoomMultiplier = guitarGlobalSettings.zoomMultiplier ?? 1.2;

    // Build views immediately when dimensions were available; otherwise defer to render().
    if (maxWidth && maxCanvasHeight) {
      this._buildRowViews(this.fretboardConfig);
    }
  }

  private _buildRowViews(config: FretboardConfig): void {
    this.rowViews.forEach((v) => v.destroy());
    this.rowViews = this._qualities.map(
      (quality) => new TriadQualityRowView(quality, this._rootNoteName, config),
    );
    this.fretboardConfig = config;
  }

  static getTitle(partialConfig: readonly string[]): string {
    if (partialConfig.length === 0) return "Triads";
    const rootNote = partialConfig[0];
    const qualities = partialConfig.slice(1);
    const base = `${rootNote} Triad Shapes`;
    return qualities.length > 0 ? `${base} (${qualities.join(", ")})` : base;
  }

  static getConfigurationSchema(): ConfigurationSchema {
    const availableKeys = NOTE_NAMES_FROM_A as string[];
    const qualities: TriadQuality[] = [
      "Major",
      "Minor",
      "Diminished",
      "Augmented",
    ];

    const specificArgs: ConfigurationSchemaArg[] = [
      {
        name: "Root Note",
        type: ArgType.Enum,
        required: true,
        enum: availableKeys,
        description: "Root note of the triads.",
      },
      {
        name: "Qualities",
        type: ArgType.Enum,
        required: true,
        isVariadic: true,
        uiComponentType: UiComponentType.ToggleButtonSelector,
        uiComponentData: { buttonLabels: qualities },
        description: "Select one or more triad qualities to display.",
      },
    ];
    return {
      description: `Config: ${this.typeName},RootNote,Quality1[,Quality2,...][,InstrumentSettings]`,
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
        `[${this.typeName}] Invalid config. Expected [RootNote, Quality1, ...].`,
      );
    }
    const rootNoteName = config[0];
    const qualities = config.slice(1) as TriadQuality[];

    const keyIndex = getKeyIndex(rootNoteName);
    if (keyIndex === -1)
      throw new Error(`[${this.typeName}] Unknown key: "${rootNoteName}"`);
    const validRootName = NOTE_NAMES_FROM_A[keyIndex] ?? rootNoteName;

    if (qualities.length === 0) {
      throw new Error(
        `[${this.typeName}] At least one triad quality must be selected.`,
      );
    }

    const mainHeaderText = `${validRootName} Triad Shapes (${qualities.join(", ")})`;

    return new TriadFeature(
      config,
      validRootName,
      qualities,
      mainHeaderText,
      settings,
      maxCanvasHeight,
    );
  }

  render(container: HTMLElement): void {
    // Lazily build row views when dimensions weren't available at construction time.
    if (this.rowViews.length === 0) {
      // Subtract computed padding so canvas widths match the actual flex layout space.
      const cs = getComputedStyle(container);
      const w =
        (container.clientWidth || container.offsetWidth) -
        parseFloat(cs.paddingLeft) -
        parseFloat(cs.paddingRight);
      if (w > 0) {
        // Height may be 0 when the container hasn't been laid out yet (e.g. after a
        // theme-change rebuild). Pass undefined in that case so the layout uses its
        // natural height, matching the unconstrained constructor path.
        const h =
          (container.clientHeight || container.offsetHeight) -
          parseFloat(cs.paddingTop) -
          parseFloat(cs.paddingBottom);
        const { config } = planMultiFretboardGrid(
          this.fretboardConfig,
          w,
          h > 0 ? h : undefined,
          this.fretboardConfig.stringCount - 2,
          this._qualities.length,
          this._zoomMultiplier,
          15,
        );
        this._buildRowViews(config);
      }
    }

    clearAllChildren(container);
    const mainHeader = addHeader(container, this.mainHeaderText);
    mainHeader.classList.add("feature-main-title");

    this.rowViews.forEach((view) => {
      view.render(container);
    });

    this._views.forEach((view) => {
      view.render(container);
    });
  }

  destroy?(): void {
    // Clean up our internal views.
    this.rowViews.forEach((view) => view.destroy());
    // Call the base class's destroy method to clean up its views (the metronome).
    super.destroy?.();
  }
}
