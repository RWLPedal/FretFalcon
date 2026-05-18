/* ts/instrument/features/caged_feature.ts */

import {
  Feature,
  ConfigurationSchema,
  ConfigurationSchemaArg,
  ArgType,
  UiComponentType,
} from "../../feature";
import { InstrumentFeature, peekPendingCanvasWidth } from "../fretboard_base";
import { planSingleFretboard } from "../fretboard_layout";
import { InstrumentSettings, DEFAULT_INSTRUMENT_SETTINGS } from "../fretboard_settings";
import { Scale, scales, scale_names } from "../scales";
import { AudioController } from "../../audio_controller";
import { AppSettings } from "../../settings";
import { IntervalSettings } from "../../schedule/editor/interval/types";
import { InstrumentIntervalSettings } from "../fretboard_interval_settings";
import { NoteRenderData, PolygonData, Tuning } from "../fretboard";
import {
  getKeyIndex,
  NOTE_NAMES_FROM_A,
  getIntervalLabel,
  OPEN_NOTE_RADIUS_FACTOR,
  addHeader,
  clearAllChildren,
} from "../fretboard_utils";
import { FretboardView } from "../views/fretboard_view";
import { getColor as getColorFromScheme, NOTE_COLORS } from "../colors";

// --- CAGED Definitions ---
export type CagedShapeName = "C" | "A" | "G" | "E" | "D";
type LabelDisplayType = "Note Name" | "Interval";

const CAGED_SHAPE_ORDER: CagedShapeName[] = ["C", "A", "G", "E", "D"];

// --- Reference CAGED Pattern Structure ---
interface CagedReferenceNote {
  string: number; // 0-5 (0=Low E)
  fret: number;   // Absolute fret number for the reference key (A Major)
}
interface CagedReferencePattern {
  shape: CagedShapeName;
  position: number; // Position number (1-5)
  notes: CagedReferenceNote[];
}

// Helper function to compare CAGED positions (5 < 1 < 2 < 3 < 4)
export function compareCagedPositions(a: number, b: number): number {
  if (a === 5 && b === 1) return -1;
  if (b === 5 && a === 1) return 1;
  return a - b;
}

// --- Reference CAGED Pattern Data (Key of A Major) ---
export const CAGED_REFERENCE_PATTERNS: CagedReferencePattern[] = [
  // A-Shape (Position 4)
  {
    shape: "A",
    position: 4,
    notes: [
      { string: 0, fret: 10 },
      { string: 0, fret: 12 },
      { string: 0, fret: 14 },
      { string: 1, fret: 11 },
      { string: 1, fret: 12 },
      { string: 1, fret: 14 },
      { string: 2, fret: 11 },
      { string: 2, fret: 12 },
      { string: 2, fret: 14 },
      { string: 3, fret: 11 },
      { string: 3, fret: 13 },
      { string: 3, fret: 14 },
      { string: 4, fret: 12 },
      { string: 4, fret: 14 },
      { string: 4, fret: 15 },
      { string: 5, fret: 12 },
      { string: 5, fret: 14 },
    ],
  },
  // G-Shape (Position 5)
  {
    shape: "G",
    position: 5,
    notes: [
      { string: 0, fret: 2 },
      { string: 0, fret: 4 },
      { string: 0, fret: 5 },
      { string: 1, fret: 2 },
      { string: 1, fret: 4 },
      { string: 1, fret: 5 },
      { string: 2, fret: 2 },
      { string: 2, fret: 4 },
      { string: 3, fret: 1 },
      { string: 3, fret: 2 },
      { string: 3, fret: 4 },
      { string: 4, fret: 2 },
      { string: 4, fret: 3 },
      { string: 4, fret: 5 },
      { string: 5, fret: 2 },
      { string: 5, fret: 4 },
      { string: 5, fret: 5 },
    ],
  },
  // E-Shape (Position 1)
  {
    shape: "E",
    position: 1,
    notes: [
      { string: 0, fret: 4 },
      { string: 0, fret: 5 },
      { string: 0, fret: 7 },
      { string: 1, fret: 4 },
      { string: 1, fret: 5 },
      { string: 1, fret: 7 },
      { string: 2, fret: 4 },
      { string: 2, fret: 6 },
      { string: 2, fret: 7 },
      { string: 3, fret: 4 },
      { string: 3, fret: 6 },
      { string: 3, fret: 7 },
      { string: 4, fret: 5 },
      { string: 4, fret: 7 },
      { string: 5, fret: 4 },
      { string: 5, fret: 5 },
      { string: 5, fret: 7 },
    ],
  },
  // D-Shape (Position 2)
  {
    shape: "D",
    position: 2,
    notes: [
      { string: 0, fret: 7 },
      { string: 0, fret: 9 },
      { string: 0, fret: 10 },
      { string: 1, fret: 7 },
      { string: 1, fret: 9 },
      { string: 2, fret: 6 },
      { string: 2, fret: 7 },
      { string: 2, fret: 9 },
      { string: 3, fret: 6 },
      { string: 3, fret: 7 },
      { string: 3, fret: 9 },
      { string: 4, fret: 7 },
      { string: 4, fret: 9 },
      { string: 4, fret: 10 },
      { string: 5, fret: 7 },
      { string: 5, fret: 9 },
      { string: 5, fret: 10 },
    ],
  },
  // C-Shape (Position 3)
  {
    shape: "C",
    position: 3,
    notes: [
      { string: 0, fret: 9 },
      { string: 0, fret: 10 },
      { string: 0, fret: 12 },
      { string: 1, fret: 9 },
      { string: 1, fret: 11 },
      { string: 1, fret: 12 },
      { string: 2, fret: 9 },
      { string: 2, fret: 11 },
      { string: 2, fret: 12 },
      { string: 3, fret: 9 },
      { string: 3, fret: 11 },
      { string: 4, fret: 9 },
      { string: 4, fret: 10 },
      { string: 4, fret: 12 },
      { string: 5, fret: 9 },
      { string: 5, fret: 10 },
      { string: 5, fret: 12 },
    ],
  },
];

/**
 * Returns the number of frets to add to standard-tuning CAGED reference positions
 * to account for a tuning that is uniformly shifted from standard E tuning.
 * Returns 0 for non-uniform tunings like Drop D.
 */
export function getCagedTuningOffset(tuning: Tuning): number {
  const STANDARD_INTERVALS = [5, 5, 5, 4, 5]; // P4-P4-P4-M3-P4
  for (let i = 0; i < 5; i++) {
    const interval = ((tuning.tuning[i + 1] - tuning.tuning[i]) + 12) % 12;
    if (interval !== STANDARD_INTERVALS[i]) return 0;
  }
  return (7 - tuning.tuning[0] + 12) % 12;
}

/**
 * Builds a lookup map from "string:fret" to the CAGED shapes (up to 2) that
 * contain that position, transposed from the A-major reference to the given
 * relative-major key index and tuning offset.
 */
export function buildCagedLookup(
  relativeMajorKeyIndex: number,
  fretCount: number,
  tuningOffset: number = 0
): Map<string, { shape: CagedShapeName; position: number }[]> {
  const lookup = new Map<string, { shape: CagedShapeName; position: number }[]>();
  const slideOffset = (relativeMajorKeyIndex + 12) % 12;

  for (const pattern of CAGED_REFERENCE_PATTERNS) {
    for (const refNote of pattern.notes) {
      for (let octave = -2; octave <= 2; octave++) {
        const expectedFret = refNote.fret + slideOffset + tuningOffset + octave * 12;
        if (expectedFret < 0 || expectedFret > fretCount) continue;

        const key = `${refNote.string}:${expectedFret}`;
        const existing = lookup.get(key) ?? [];
        if (existing.length < 2 && !existing.some(s => s.shape === pattern.shape)) {
          existing.push({ shape: pattern.shape, position: pattern.position });
          lookup.set(key, existing);
        }
      }
    }
  }

  return lookup;
}

export class CagedFeature extends InstrumentFeature {
  static readonly typeName = "CAGED";
  static readonly displayName = "CAGED Scale Shapes";
  static readonly requiredInstruments = ["Guitar"] as const;
  static readonly description =
    "Displays scale notes in a given key with semi-transparent overlays showing the five CAGED shape regions. Toggle individual shapes to focus on them.";

  readonly typeName = CagedFeature.typeName;
  private readonly keyIndex: number;
  private readonly rootNoteName: string;
  private readonly scaleType: string;
  private readonly scale: Scale;
  private readonly labelDisplay: LabelDisplayType;
  private fretboardViewInstance: FretboardView;
  private fretCount: number;

  // Shape toggle state
  private _selectedShapes = new Set<CagedShapeName>();

  // Cached computed data (populated once in _computeShapeData)
  private _noteBaseData: Array<{
    renderData: NoteRenderData;
    shapes: CagedShapeName[];
  }> = [];
  private _shapeToPoints = new Map<CagedShapeName, { stringIndex: number; fret: number }[]>();

  constructor(
    config: ReadonlyArray<string>,
    keyIndex: number,
    rootNoteName: string,
    scaleType: string,
    scale: Scale,
    labelDisplay: LabelDisplayType,
    initialSelectedShapes: CagedShapeName[],

    settings: AppSettings,
    intervalSettings: InstrumentIntervalSettings,
    audioController?: AudioController,
    maxCanvasHeight?: number
  ) {
    const availW = peekPendingCanvasWidth();
    super(config, settings, intervalSettings, audioController, maxCanvasHeight);
    this.keyIndex = keyIndex;
    this.rootNoteName = rootNoteName;
    this.scaleType = scaleType;
    this.scale = scale;
    this.labelDisplay = labelDisplay;
    this.fretCount = 18;

    const guitarSettings = (settings.instrumentSettings as InstrumentSettings | undefined)
      ?? DEFAULT_INSTRUMENT_SETTINGS;
    this.fretboardConfig = planSingleFretboard(
      this.fretboardConfig, availW, maxCanvasHeight,
      guitarSettings.zoomMultiplier ?? 1.2, this.fretCount
    );

    for (const shape of initialSelectedShapes) {
      this._selectedShapes.add(shape);
    }

    this.fretboardViewInstance = new FretboardView(
      this.fretboardConfig,
      this.fretCount
    );
    this._views.unshift(this.fretboardViewInstance);

    this._computeShapeData();
    this._applyDisplayState();
  }

  static getConfigurationSchema(): ConfigurationSchema {
    const availableKeys = NOTE_NAMES_FROM_A as string[];
    const availableScales = [
      "Major",
      "Minor",
      "Major Pentatonic",
      "Minor Pentatonic",
    ];
    const labelOptions: LabelDisplayType[] = ["Interval", "Note Name"];
    const specificArgs: ConfigurationSchemaArg[] = [
      {
        name: "Root Note",
        type: ArgType.Enum,
        required: true,
        enum: availableKeys,
        description: "Root note of the scale.",
      },
      {
        name: "Scale Type",
        type: ArgType.Enum,
        required: true,
        enum: availableScales.sort(),
        description: "Select the scale to display.",
      },
      {
        name: "Label Display",
        type: ArgType.Enum,
        required: true,
        enum: labelOptions,
        description: "Display intervals or note names on the dots.",
      },
      {
        name: "Active Shapes",
        type: ArgType.Enum,
        required: false,
        enum: ["C", "A", "G", "E", "D"],
        uiComponentType: UiComponentType.ToggleButtonSelector,
        isVariadic: true,
        uiComponentData: { buttonLabels: ["C", "A", "G", "E", "D"] },
        description: "Toggle CAGED shapes to focus on.",
      },
    ];
    return {
      description: `Config: ${this.typeName},Key,ScaleType,LabelDisplay[,InstrumentSettings]`,
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
    if (config.length < 2) {
      throw new Error(
        `[${this.typeName}] Invalid config. Expected [Key, ScaleType].`
      );
    }
    const rootNoteName = config[0];
    const scaleTypeName = config[1];
    const labelDisplay = (config[2] ?? "Interval") as LabelDisplayType;

    const keyIndex = getKeyIndex(rootNoteName);
    if (keyIndex === -1)
      throw new Error(`[${this.typeName}] Unknown key: "${rootNoteName}"`);
    const validRootName = NOTE_NAMES_FROM_A[keyIndex] ?? rootNoteName;

    let scaleKey = scale_names[scaleTypeName as keyof typeof scale_names];
    if (!scaleKey) scaleKey = scaleTypeName.toUpperCase().replace(/ /g, "_");
    const scale = scales[scaleKey as keyof typeof scales];
    if (!scale) {
      throw new Error(
        `[${this.typeName}] Unsupported or unknown scale type: "${scaleTypeName}"`
      );
    }

    const validLabelDisplay =
      labelDisplay === "Note Name" || labelDisplay === "Interval"
        ? labelDisplay
        : "Interval";

    const validShapeNames = new Set<string>(["C", "A", "G", "E", "D"]);
    const initialShapes = config.slice(3).filter(s => validShapeNames.has(s)) as CagedShapeName[];
    const featureSpecificConfig = [rootNoteName, scaleTypeName, validLabelDisplay, ...initialShapes];

    const guitarIntervalSettings = intervalSettings as InstrumentIntervalSettings;

    return new CagedFeature(
      featureSpecificConfig,
      keyIndex,
      validRootName,
      scaleTypeName,
      scale,
      validLabelDisplay,
      initialShapes,
      settings,
      guitarIntervalSettings,
      audioController,
      maxCanvasHeight
    );
  }

  /** Populates _noteBaseData and _shapeToPoints from the CAGED lookup. */
  private _computeShapeData(): void {
    const config    = this.fretboardConfig;
    const tuning    = config.tuning.tuning;
    const fretCount = this.fretCount;

    const isMinorScale        = this.scaleType.toLowerCase().includes("minor");
    const relativeMajorKeyIndex = isMinorScale ? (this.keyIndex + 3) % 12 : this.keyIndex;
    const tuningOffset        = getCagedTuningOffset(config.tuning);
    const slideOffset         = (relativeMajorKeyIndex + 12) % 12;

    // Build shapeToPoints from the canonical reference pattern position.
    // Use the transposed reference frets; if the average fret goes beyond the
    // fret count, shift down an octave so the polygon appears on the visible neck.
    this._shapeToPoints.clear();
    for (const pattern of CAGED_REFERENCE_PATTERNS) {
      const rawFrets = pattern.notes.map(n => n.fret + slideOffset + tuningOffset);
      const avgFret  = rawFrets.reduce((a, b) => a + b, 0) / rawFrets.length;
      const octaveAdj = avgFret > fretCount ? -12 : avgFret < 0 ? 12 : 0;

      const pts: { stringIndex: number; fret: number }[] = [];
      for (const refNote of pattern.notes) {
        const fret = refNote.fret + slideOffset + tuningOffset + octaveAdj;
        if (fret >= 0 && fret <= fretCount) {
          pts.push({ stringIndex: refNote.string, fret });
        }
      }
      if (pts.length > 0) this._shapeToPoints.set(pattern.shape, pts);
    }

    // Build a reverse lookup from polygon points to shapes so note highlighting
    // exactly matches the visible polygon regions (no cross-octave bleed).
    const posToShapes = new Map<string, CagedShapeName[]>();
    for (const [shape, pts] of this._shapeToPoints) {
      for (const pt of pts) {
        const key = `${pt.stringIndex}:${pt.fret}`;
        const existing = posToShapes.get(key) ?? [];
        existing.push(shape);
        posToShapes.set(key, existing);
      }
    }

    // Build note base data (all scale notes across all strings/frets)
    this._noteBaseData = [];
    for (let stringIndex = 0; stringIndex < tuning.length; stringIndex++) {
      const stringTuning = tuning[stringIndex];
      for (let fretIndex = 0; fretIndex <= fretCount; fretIndex++) {
        const noteOffsetFromA   = (stringTuning + fretIndex) % 12;
        const noteRelativeToKey = (noteOffsetFromA - this.keyIndex + 12) % 12;
        if (!this.scale.degrees.includes(noteRelativeToKey)) continue;

        const noteName     = NOTE_NAMES_FROM_A[noteOffsetFromA] ?? "?";
        const intervalLabel = getIntervalLabel(noteRelativeToKey);
        const displayLabel  = this.labelDisplay === "Interval" ? intervalLabel : noteName;

        const shapes = posToShapes.get(`${stringIndex}:${fretIndex}`) ?? [];

        this._noteBaseData.push({
          renderData: {
            fret:          fretIndex,
            stringIndex,
            noteName,
            intervalLabel,
            displayLabel,
            fillColor:   getColorFromScheme("interval", noteName, intervalLabel),
            strokeColor: "rgba(30, 30, 30, 0.4)",
            strokeWidth: 1,
            radiusOverride:
              fretIndex === 0
                ? config.noteRadiusPx * OPEN_NOTE_RADIUS_FACTOR
                : undefined,
          },
          shapes,
        });
      }
    }
  }

  /** Re-computes note opacities and polygon styles to match the current selection. */
  private _applyDisplayState(): void {
    const hasSelection = this._selectedShapes.size > 0;

    // Notes: dim those not in any selected shape
    const notes: NoteRenderData[] = this._noteBaseData.map(({ renderData, shapes }) => {
      const active = !hasSelection || shapes.some(s => this._selectedShapes.has(s));
      return { ...renderData, opacity: active ? 1.0 : 0.25 };
    });

    // Polygons: three emphasis levels —
    //   default (no selection): slightly muted
    //   selected:               full emphasis
    //   unselected:             dimmed but still visible
    const polygons: PolygonData[] = [];
    for (const shape of CAGED_SHAPE_ORDER) {
      const pts = this._shapeToPoints.get(shape);
      if (!pts || pts.length === 0) continue;
      const color = NOTE_COLORS[shape] ?? "#888888";

      let fillOpacity: number;
      let strokeOpacity: number;
      let strokeWidth: number;

      if (!hasSelection) {
        // Default: slightly lighter
        fillOpacity   = 0.12;
        strokeOpacity = 0.55;
        strokeWidth   = 2.0;
      } else if (this._selectedShapes.has(shape)) {
        // Selected: full emphasis
        fillOpacity   = 0.20;
        strokeOpacity = 1.0;
        strokeWidth   = 2.5;
      } else {
        // Unselected: dimmed but a bit more visible than before
        fillOpacity   = 0.07;
        strokeOpacity = 0.28;
        strokeWidth   = 1.0;
      }

      polygons.push({
        points: pts,
        color,
        fillColor:    color,
        fillOpacity,
        strokeOpacity,
        strokeWidth,
        padding:      2,
        cornerRadius: 8,
      });
    }

    requestAnimationFrame(() => {
      if (this.fretboardViewInstance) {
        this.fretboardViewInstance.setNotes(notes);
        this.fretboardViewInstance.setPolygons(polygons);
        this.fretboardViewInstance.setLines([]);
      }
    });
  }

  render(container: HTMLElement): void {
    clearAllChildren(container);

    const header = addHeader(container, this.rootNoteName + " " + this.scale.name);
    header.classList.add("caged-main-title");
  }

  destroy(): void {
    // Nothing to clean up beyond base class
  }
}
