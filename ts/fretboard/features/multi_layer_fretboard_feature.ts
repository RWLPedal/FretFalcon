// ts/fretboard/features/multi_layer_fretboard_feature.ts

import { Feature, ConfigurationSchema, ConfigurationSchemaArg, ArgType, UiComponentType } from "../../feature";
import { InstrumentFeature, peekPendingCanvasWidth } from "../fretboard_base";
import { planSingleFretboard } from "../fretboard_layout";
import { InstrumentSettings, DEFAULT_INSTRUMENT_SETTINGS } from "../fretboard_settings";
import { AppSettings } from "../../settings";
import { AudioController } from "../../audio_controller";
import { emitEvent } from "../../core/events";
import { IntervalSettings } from "../../schedule/editor/interval/types";
import { InstrumentIntervalSettings } from "../fretboard_interval_settings";
import { NoteRenderData } from "../fretboard";
import {
  NOTE_NAMES_FROM_A,
  NOTE_FLAT_ALIAS_FROM_A,
  getKeyIndex,
  getIntervalLabel,
  OPEN_NOTE_RADIUS_FACTOR,
  addHeader,
  clearAllChildren,
} from "../fretboard_utils";
import { FretboardView } from "../views/fretboard_view";
import { scale_names, scales } from "../scales";
import { chord_tones_library } from "../chords";
import { NOTE_COLORS } from "../colors";
import {
  buildCagedLookup,
  compareCagedPositions,
  getCagedTuningOffset,
} from "./caged_feature";
import { DriveSignal, ChordSignal, KeySignal, SignalKind, SignalState } from "../../panels/link_types";
import { LayerType } from "./layer_types";
import {
  computeNoteSemantics,
  toRenderAnnotation,
  chordToneNamesToSemitones,
  scaleSemitonesFromDegrees,
} from "../note_semantics";

// --- Layer Spec Types ---
// rootNote / chordKey may be the sentinel "driven" — resolved at runtime from the incoming signal.

interface ScaleLayer {
  type: LayerType.Scale;
  scaleName: string;
  rootNote: string;   // "driven" → use lastRootSignal
  fillColor: string | null;
  strokeColor: string | null;
}

interface ChordLayer {
  type: LayerType.Chord;
  chordKey: string;   // "driven" → use lastChordSignal
  fillColor: string | null;
  strokeColor: string | null;
}

interface NotesLayer {
  type: LayerType.Notes;
  noteNames: string[];
  fillColor: string | null;
  strokeColor: string | null;
}

interface CagedLayer {
  type: LayerType.Caged;
  scaleName: string;
  rootNote: string;
}

type LayerSpec = ScaleLayer | ChordLayer | NotesLayer | CagedLayer;

// --- Layer String Encoding ---
// Scale:   "scale|{scaleName}|{rootNote}|{hexColor}"
// Chord:   "chord|{chordKey}|{hexColor}"
// Notes:   "notes|{note1,note2,...}|{hexColor}"
// CAGED:   "caged|{scaleName}|{rootNote}"
// Driven:  "driven|chord|{hexColor}" or "driven|scale|{hexColor}"

function parseNullableColor(s: string | undefined): string | null {
  if (!s || s === 'none') return null;
  return s;
}

function parseLayerString(layerStr: string): LayerSpec | null {
  const parts = layerStr.split("|");
  if (parts.length < 2) return null;

  const type = parts[0] as LayerType;

  if (type === LayerType.Caged && parts.length >= 3) {
    return { type: LayerType.Caged, scaleName: parts[1], rootNote: parts[2] };
  }

  if (parts.length < 3) return null;

  if (type === LayerType.Scale && parts.length >= 4) {
    // scale|scaleName|rootNote|fillColor[|strokeColor]
    return {
      type: LayerType.Scale,
      scaleName: parts[1],
      rootNote: parts[2],
      fillColor: parseNullableColor(parts[3]),
      strokeColor: parseNullableColor(parts[4]),
    };
  } else if (type === LayerType.Chord) {
    // chord|chordKey|fillColor[|strokeColor]
    return {
      type: LayerType.Chord,
      chordKey: parts[1],
      fillColor: parseNullableColor(parts[2]),
      strokeColor: parseNullableColor(parts[3]),
    };
  } else if (type === LayerType.Notes) {
    const notesStr = parts[1];
    const noteNames = notesStr
      ? notesStr.split(",").map((n) => n.trim()).filter((n) => n.length > 0)
      : [];
    // notes|noteNames|fillColor[|strokeColor]
    return {
      type: LayerType.Notes,
      noteNames,
      fillColor: parseNullableColor(parts[2]),
      strokeColor: parseNullableColor(parts[3]),
    };
  }
  return null;
}

function resolveCssColor(color: string): string {
  if (color.startsWith('var(--')) {
    const varName = color.slice(4, -1);
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || color;
  }
  return color;
}

// --- Feature Class ---

export class MultiLayerFretboardFeature extends InstrumentFeature {
  static readonly typeName = "MultiLayerFretboard";
  static readonly displayName = "Multi-Layer Fretboard";
  static readonly description =
    "Overlay multiple scales, chord tones, note sets, or CAGED patterns on a single fretboard. Each layer has its own color; layers listed first take precedence.";

  readonly typeName = MultiLayerFretboardFeature.typeName;
  private readonly layers: LayerSpec[];
  private readonly showOverlays: boolean;
  // Last signals received — used to resolve "driven" / "driven_next" sentinels in layer fields
  private lastChordSignal: ChordSignal | null = null;
  private lastRootSignal: ChordSignal | KeySignal | null = null;
  private lastNextChordSignal: ChordSignal | null = null;
  private lastNextRootSignal: ChordSignal | KeySignal | null = null;
  private fretboardViewInstance: FretboardView;
  private readonly fretCount = 18;
  private driveSignalHandler: ((e: Event) => void) | null = null;
  private featureContainer: HTMLElement | null = null;

  constructor(
    config: ReadonlyArray<string>,
    layers: LayerSpec[],
    showOverlays: boolean,
    settings: AppSettings,
    intervalSettings: InstrumentIntervalSettings,
    audioController?: AudioController,
    maxCanvasHeight?: number
  ) {
    const availW = peekPendingCanvasWidth();
    super(config, settings, intervalSettings, audioController, maxCanvasHeight);
    this.layers = layers;
    this.showOverlays = showOverlays;

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

    this.calculateAndSetNotes();
  }

  public render(container: HTMLElement): void {
    this.featureContainer = container;
    clearAllChildren(container);
    const header = addHeader(container, "Multi-Layer Fretboard");
    header.classList.add("feature-main-title");

    // Listen for drive-signal events forwarded by ConfigurableFeatureView
    this.driveSignalHandler = (e: Event) => {
      const { signal } = (e as CustomEvent<{ signal: DriveSignal }>).detail;
      const isNextState = (signal.state ?? SignalState.Current) === SignalState.Next;

      const hasDrivenRootNote = this.layers.some(l => l.type === LayerType.Scale && (l as ScaleLayer).rootNote === 'driven');
      const hasDrivenScaleName = this.layers.some(l => l.type === LayerType.Scale && (l as ScaleLayer).scaleName === 'driven');
      const hasDrivenChord = this.layers.some(l => l.type === LayerType.Chord && (l as ChordLayer).chordKey === 'driven');
      const hasDrivenNextRootNote = this.layers.some(l => l.type === LayerType.Scale && (l as ScaleLayer).rootNote === 'driven_next');
      const hasDrivenNextScaleName = this.layers.some(l => l.type === LayerType.Scale && (l as ScaleLayer).scaleName === 'driven_next');
      const hasDrivenNextChord = this.layers.some(l => l.type === LayerType.Chord && (l as ChordLayer).chordKey === 'driven_next');

      const anyDriven = hasDrivenRootNote || hasDrivenScaleName || hasDrivenChord
                     || hasDrivenNextRootNote || hasDrivenNextScaleName || hasDrivenNextChord;
      if (!anyDriven) return;

      let changed = false;
      if (isNextState) {
        if (signal.kind === SignalKind.Chord) {
          if (hasDrivenNextChord || hasDrivenNextRootNote) {
            this.lastNextChordSignal = signal as ChordSignal;
            this.lastNextRootSignal = signal;
            changed = true;
          }
        } else if (signal.kind === SignalKind.Key) {
          if (hasDrivenNextRootNote || hasDrivenNextScaleName) {
            this.lastNextRootSignal = signal;
            changed = true;
          }
        }
      } else {
        if (signal.kind === SignalKind.Chord) {
          if (hasDrivenChord || hasDrivenRootNote) {
            this.lastChordSignal = signal as ChordSignal;
            this.lastRootSignal = signal;
            changed = true;
          }
        } else if (signal.kind === SignalKind.Key) {
          if (hasDrivenRootNote || hasDrivenScaleName) {
            this.lastRootSignal = signal;
            changed = true;
          }
        }
      }
      if (changed) {
        this.calculateAndSetNotes();
        emitEvent(container, 'feature-signal-relay', {
          featureTypeName: MultiLayerFretboardFeature.typeName, signal,
        });
      }
    };
    container.addEventListener('drive-signal', this.driveSignalHandler);
  }

  public destroy(): void {
    if (this.featureContainer && this.driveSignalHandler) {
      this.featureContainer.removeEventListener('drive-signal', this.driveSignalHandler);
    }
    super.destroy?.();
  }

  // --- Static Schema & Factory ---

  static getConfigurationSchema(): ConfigurationSchema {
    const availableScaleNames = Object.keys(scale_names).sort();
    const rootNoteOptions = NOTE_NAMES_FROM_A as string[];
    const chordEntries = Object.entries(chord_tones_library).map(([key, entry]) => ({
      key,
      label: entry.name,
    }));
    const noteNames = NOTE_NAMES_FROM_A as string[];

    const showOverlaysArg: ConfigurationSchemaArg = {
      name: "Show Overlays",
      type: ArgType.Boolean,
      uiComponentType: UiComponentType.Toggle,
      defaultValue: "false",
      description: "Mark avoid notes with an X overlay (requires a scale + driven chord layer) and highlight pivot notes shared between the current and next chord with a gold ring.",
    };

    const layersArg: ConfigurationSchemaArg = {
      name: "Layers",
      type: ArgType.String,
      isVariadic: true,
      uiComponentType: UiComponentType.LayerList,
      description:
        "Layers to display on the fretboard, top-to-bottom in the list equals highest-to-lowest precedence.",
      uiComponentData: {
        scaleNames: availableScaleNames,
        rootNoteOptions,
        chordEntries,
        noteNames,
      },
    };

    return {
      description: `Config: ${this.typeName}[,ShowOverlays][,layer1]...[,InstrumentSettings]`,
      args: [showOverlaysArg, layersArg, InstrumentFeature.BASE_INSTRUMENT_SETTINGS_CONFIG_ARG],
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
    const isNewFormat = config.length === 0
      || (config[0] === 'none' || config[0] === 'enabled' || config[0] === 'true' || config[0] === 'false');
    const showOverlays = isNewFormat && (config[0] === 'enabled' || config[0] === 'true');
    const layerStart = isNewFormat ? 1 : 0;

    const layers: LayerSpec[] = [];
    for (const layerStr of config.slice(layerStart)) {
      const parsed = parseLayerString(layerStr);
      if (parsed) layers.push(parsed);
    }
    return new MultiLayerFretboardFeature(
      config,
      layers,
      showOverlays,
      settings,
      intervalSettings as InstrumentIntervalSettings,
      audioController,
      maxCanvasHeight
    );
  }

  // --- Note Calculation ---

  private calculateAndSetNotes(): void {
    // Collect all notes per position, ordered by layer priority (highest first).
    const positionNotes = new Map<string, NoteRenderData[]>();
    for (const layer of this.layers) {
      for (const note of this.getLayerNotes(layer)) {
        const key = `${note.stringIndex}-${note.fret}`;
        const bucket = positionNotes.get(key);
        if (bucket) bucket.push(note);
        else positionNotes.set(key, [note]);
      }
    }

    // Composite fill and stroke channels independently:
    // fill   = topmost layer with a non-transparent fillColor
    // stroke = topmost layer with a non-transparent strokeColor
    const notesData: NoteRenderData[] = [];
    for (const notes of positionNotes.values()) {
      const base = notes[0];
      const fillNote = notes.find(n => {
        const f = n.fillColor;
        return f && f !== 'transparent';
      });
      const resolvedFill = fillNote?.fillColor ?? 'transparent';
      const strokeNote = notes.find(n => n.strokeColor && n.strokeColor !== 'transparent');
      const resolvedStroke = strokeNote?.strokeColor
        ?? (resolvedFill !== 'transparent' ? 'rgba(50,50,50,0.7)' : 'transparent');
      notesData.push({
        ...base,
        fillColor: resolvedFill,
        strokeColor: resolvedStroke,
        strokeWidth: strokeNote ? (strokeNote.strokeWidth ?? 1) * 2 : base.strokeWidth,
      });
    }

    // --- Semantic overlays (additive, applied after compositing) ---

    if (this.showOverlays) {
      const scaleSemitones = this._resolveScaleSemitones();
      const currentChordSemitones = this._resolveChordSemitones(this.lastChordSignal?.chordKey ?? null);
      if (scaleSemitones && currentChordSemitones) {
        const semanticMap = computeNoteSemantics({ scaleSemitones, currentChordSemitones });
        for (const note of notesData) {
          const absS = getKeyIndex(note.noteName);
          if (absS === -1) continue;
          const sem = semanticMap.get(absS);
          if (!sem) continue;
          const ann = toRenderAnnotation(sem);
          if (ann.xOverlay) note.xOverlay = true;
        }
      }
    }

    if (this.showOverlays) {
      const currentKey = this.lastChordSignal?.chordKey ?? null;
      const nextKey = this.lastNextChordSignal?.chordKey ?? null;
      const currentChordSemitones = currentKey !== null && currentKey === nextKey
        ? null
        : this._resolveChordSemitones(currentKey);
      const nextChordSemitones = this._resolveChordSemitones(nextKey);
      if (currentChordSemitones && nextChordSemitones) {
        const semanticMap = computeNoteSemantics({ currentChordSemitones, nextChordSemitones });
        for (const note of notesData) {
          const absS = getKeyIndex(note.noteName);
          if (absS === -1) continue;
          const sem = semanticMap.get(absS);
          if (!sem) continue;
          const ann = toRenderAnnotation(sem);
          if (ann.outerRing) note.outerRing = true;
        }
      }
    }

    requestAnimationFrame(() => {
      this.fretboardViewInstance.setNotes(notesData);
      this.fretboardViewInstance.setLines([]);
    });
  }

  private _resolveScaleSemitones(): Set<number> | null {
    const scaleLayer = this.layers.find(l => l.type === LayerType.Scale) as ScaleLayer | undefined;
    if (!scaleLayer) return null;
    const rootNote = scaleLayer.rootNote === 'driven_next'
      ? (this.lastNextRootSignal?.rootNote ?? '')
      : scaleLayer.rootNote === 'driven'
      ? (this.lastRootSignal?.rootNote ?? '')
      : scaleLayer.rootNote;
    if (!rootNote) return null;
    let resolvedScaleName = scaleLayer.scaleName;
    if (resolvedScaleName === 'driven_next') {
      if (!this.lastNextRootSignal) return null;
      if (this.lastNextRootSignal.kind === SignalKind.Key) {
        const s = scales[this.lastNextRootSignal.scaleKey as keyof typeof scales];
        resolvedScaleName = s?.name ?? 'Major';
      } else {
        resolvedScaleName = (this.lastNextRootSignal as ChordSignal).keyType === 'Minor' ? 'Natural Minor' : 'Major';
      }
    } else if (resolvedScaleName === 'driven') {
      if (!this.lastRootSignal) return null;
      if (this.lastRootSignal.kind === SignalKind.Key) {
        const s = scales[this.lastRootSignal.scaleKey as keyof typeof scales];
        resolvedScaleName = s?.name ?? 'Major';
      } else {
        resolvedScaleName = (this.lastRootSignal as ChordSignal).keyType === 'Minor' ? 'Natural Minor' : 'Major';
      }
    }
    const scaleKey = scale_names[resolvedScaleName as keyof typeof scale_names]
      ?? resolvedScaleName.toUpperCase().replace(/ /g, '_');
    const scale = scales[scaleKey as keyof typeof scales];
    if (!scale) return null;
    const keyIndex = getKeyIndex(rootNote);
    if (keyIndex === -1) return null;
    return scaleSemitonesFromDegrees(keyIndex, scale.degrees);
  }

  private _resolveChordSemitones(chordKey: string | null): Set<number> | null {
    if (!chordKey) return null;
    const entry = chord_tones_library[chordKey];
    if (!entry) return null;
    return chordToneNamesToSemitones(entry.tones);
  }

  private getLayerNotes(layer: LayerSpec): NoteRenderData[] {
    switch (layer.type) {
      case LayerType.Scale: return this.getScaleLayerNotes(layer);
      case LayerType.Chord: return this.getChordLayerNotes(layer);
      case LayerType.Notes: return this.getNoteSetLayerNotes(layer.noteNames, layer.fillColor, layer.strokeColor);
      case LayerType.Caged: return this.getCagedLayerNotes(layer);
      default: return [];
    }
  }

  private getScaleLayerNotes(layer: ScaleLayer): NoteRenderData[] {
    const rootNote = layer.rootNote === 'driven_next'
      ? (this.lastNextRootSignal?.rootNote ?? '')
      : layer.rootNote === 'driven'
      ? (this.lastRootSignal?.rootNote ?? '')
      : layer.rootNote;
    if (!rootNote) return [];

    let resolvedScaleName = layer.scaleName;
    if (resolvedScaleName === 'driven_next') {
      if (!this.lastNextRootSignal) return [];
      if (this.lastNextRootSignal.kind === SignalKind.Key) {
        const scale = scales[this.lastNextRootSignal.scaleKey as keyof typeof scales];
        resolvedScaleName = scale?.name ?? 'Major';
      } else {
        resolvedScaleName = this.lastNextRootSignal.keyType === 'Minor' ? 'Natural Minor' : 'Major';
      }
    } else if (resolvedScaleName === 'driven') {
      if (!this.lastRootSignal) return [];
      if (this.lastRootSignal.kind === SignalKind.Key) {
        const scale = scales[this.lastRootSignal.scaleKey as keyof typeof scales];
        resolvedScaleName = scale?.name ?? 'Major';
      } else {
        resolvedScaleName = this.lastRootSignal.keyType === 'Minor' ? 'Natural Minor' : 'Major';
      }
    }

    const scaleKey =
      scale_names[resolvedScaleName as keyof typeof scale_names] ??
      resolvedScaleName.toUpperCase().replace(/ /g, "_");
    const scale = scales[scaleKey as keyof typeof scales];
    if (!scale) return [];

    const keyIndex = getKeyIndex(rootNote);
    if (keyIndex === -1) return [];

    const tuning = this.fretboardConfig.tuning.notes;
    const notes: NoteRenderData[] = [];

    for (let stringIndex = 0; stringIndex < tuning.length; stringIndex++) {
      for (let fretIndex = 0; fretIndex <= this.fretCount; fretIndex++) {
        const noteOffset = (tuning[stringIndex] + fretIndex) % 12;
        const relativeOffset = (noteOffset - keyIndex + 12) % 12;
        if (!scale.degrees.includes(relativeOffset)) continue;

        const noteName = NOTE_NAMES_FROM_A[noteOffset] ?? "?";
        const intervalLabel = getIntervalLabel(relativeOffset);
        const isRoot = relativeOffset === 0;

        const fill = layer.fillColor ? resolveCssColor(layer.fillColor) : 'transparent';
        const stroke = layer.strokeColor ? resolveCssColor(layer.strokeColor) : 'transparent';
        notes.push({
          fret: fretIndex,
          stringIndex,
          noteName,
          intervalLabel,
          displayLabel: intervalLabel,
          fillColor: fill,
          strokeColor: stroke,
          strokeWidth: isRoot ? 2.0 : 1,
          radiusOverride:
            fretIndex === 0
              ? this.fretboardConfig.noteRadiusPx * OPEN_NOTE_RADIUS_FACTOR
              : undefined,
        });
      }
    }
    return notes;
  }

  private getChordLayerNotes(layer: ChordLayer): NoteRenderData[] {
    const chordKey = layer.chordKey === 'driven_next'
      ? (this.lastNextChordSignal?.chordKey ?? null)
      : layer.chordKey === 'driven'
      ? (this.lastChordSignal?.chordKey ?? null)
      : layer.chordKey;
    if (!chordKey) return [];
    const entry = chord_tones_library[chordKey];
    if (!entry || entry.tones.length === 0) return [];
    return this.getNoteSetLayerNotes(entry.tones, layer.fillColor, layer.strokeColor);
  }

  private getNoteSetLayerNotes(
    toneNames: string[],
    fillColor: string | null,
    strokeColor: string | null
  ): NoteRenderData[] {
    const fill = fillColor ? resolveCssColor(fillColor) : 'transparent';
    const stroke = strokeColor ? resolveCssColor(strokeColor) : 'transparent';
    const toneSet = new Set(toneNames);
    const tuning = this.fretboardConfig.tuning.notes;
    const notes: NoteRenderData[] = [];

    for (let stringIndex = 0; stringIndex < tuning.length; stringIndex++) {
      for (let fretIndex = 0; fretIndex <= this.fretCount; fretIndex++) {
        const noteOffset = (tuning[stringIndex] + fretIndex) % 12;
        const noteName = NOTE_NAMES_FROM_A[noteOffset] ?? "?";
        const alias = NOTE_FLAT_ALIAS_FROM_A[noteOffset];
        if (!toneSet.has(noteName) && !(alias && toneSet.has(alias))) continue;

        notes.push({
          fret: fretIndex,
          stringIndex,
          noteName,
          intervalLabel: noteName,
          displayLabel: noteName,
          fillColor: fill,
          strokeColor: stroke,
          strokeWidth: 1.5,
          radiusOverride:
            fretIndex === 0
              ? this.fretboardConfig.noteRadiusPx * OPEN_NOTE_RADIUS_FACTOR
              : undefined,
        });
      }
    }
    return notes;
  }

  private getCagedLayerNotes(layer: CagedLayer): NoteRenderData[] {
    // CAGED patterns are only defined for 6-string guitar.
    if (this.fretboardConfig.tuning.notes.length !== 6) return [];

    const scaleKey =
      scale_names[layer.scaleName as keyof typeof scale_names] ??
      layer.scaleName.toUpperCase().replace(/ /g, "_");
    const scale = scales[scaleKey as keyof typeof scales];
    if (!scale) return [];

    const keyIndex = getKeyIndex(layer.rootNote);
    if (keyIndex === -1) return [];

    const isMinor = layer.scaleName.toLowerCase().includes("minor");
    const relativeMajorKeyIndex = isMinor ? (keyIndex + 3) % 12 : keyIndex;
    const tuningOffset = getCagedTuningOffset(this.fretboardConfig.tuning);
    const cagedLookup = buildCagedLookup(relativeMajorKeyIndex, this.fretCount, tuningOffset);

    const tuning = this.fretboardConfig.tuning.notes;
    const notes: NoteRenderData[] = [];

    for (let stringIndex = 0; stringIndex < tuning.length; stringIndex++) {
      for (let fretIndex = 0; fretIndex <= this.fretCount; fretIndex++) {
        const noteOffset = (tuning[stringIndex] + fretIndex) % 12;
        const relativeOffset = (noteOffset - keyIndex + 12) % 12;
        if (!scale.degrees.includes(relativeOffset)) continue;

        const noteName = NOTE_NAMES_FROM_A[noteOffset] ?? "?";
        const intervalLabel = getIntervalLabel(relativeOffset);

        const lookupKey = `${stringIndex}:${fretIndex}`;
        const shapeMembership = cagedLookup.get(lookupKey) ?? [];
        const sorted =
          shapeMembership.length >= 2
            ? [...shapeMembership].sort((a, b) =>
                compareCagedPositions(a.position, b.position)
              )
            : shapeMembership;

        const cagedColor1 =
          sorted.length >= 1 ? (NOTE_COLORS[sorted[0].shape] ?? "#888888") : "#909090";
        const cagedColor2 =
          sorted.length >= 2 ? (NOTE_COLORS[sorted[1].shape] ?? "#888888") : null;

        const fillColor: string | string[] =
          sorted.length === 0
            ? "#909090"
            : sorted.length === 1
            ? cagedColor1
            : [cagedColor1, cagedColor2!];

        notes.push({
          fret: fretIndex,
          stringIndex,
          noteName,
          intervalLabel,
          displayLabel: intervalLabel,
          fillColor,
          strokeColor: "rgba(40, 40, 40, 0.6)",
          strokeWidth: 1,
          radiusOverride:
            fretIndex === 0
              ? this.fretboardConfig.noteRadiusPx * OPEN_NOTE_RADIUS_FACTOR
              : undefined,
        });
      }
    }
    return notes;
  }

}
