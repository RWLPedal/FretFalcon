/* ts/instrument/features/notes_feature.ts */

import {
  Feature,
  FeatureSpec,
  FeatureContext,
  ConfigurationSchema,
  ConfigurationSchemaArg,
  ArgType,
} from "../../feature";
import { InstrumentFeature } from "../fretboard_base";
import { AppSettings } from "../../settings";
import { NoteRenderData, FretboardConfig } from "../fretboard";
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
import { featureTypeId } from "../../core/ids";
import { stringCodec, enumCodec } from "../../core/config/codecs";
import type { ConfigSpec } from "../../core/config/spec";

// ─── Typed config ─────────────────────────────────────────────────────────────

export interface NotesConfig {
  rootNote: string;
}

const ROOT_NOTE_OPTIONS = ['None', ...NOTE_NAMES_FROM_A as string[]];

const notesConfigSpec: ConfigSpec<NotesConfig> = {
  rootNote: {
    label: 'Root Note',
    codec: enumCodec(ROOT_NOTE_OPTIONS),
    ui: { kind: 'select', options: ROOT_NOTE_OPTIONS.map(v => ({ value: v })) },
    defaultValue: 'None',
  },
};

export const NotesFeatureSpec: FeatureSpec<NotesConfig> = {
  id: featureTypeId('Notes'),
  displayName: 'Fretboard Notes',
  description: "Displays all notes on the fretboard. Select 'None' for note-based colors, or a root note for interval-based colors.",
  defaultConfigCollapsed: true,
  legacyArgOrder: ['rootNote'],
  configSpec: notesConfigSpec,
  title: (config) => {
    const root = config.rootNote;
    if (!root || root === 'None') return 'Notes (Note Name Colors)';
    return `Notes (Interval Colors Relative to ${root})`;
  },
  create(config: NotesConfig, ctx: FeatureContext): Feature {
    const rootNoteName = (!config.rootNote || config.rootNote === 'None') ? null : config.rootNote;
    return new NotesFeature([], ctx.settings, rootNoteName, ctx.constraints.maxHeight, ctx.constraints.maxWidth);
  },
};

// ─── Feature class ────────────────────────────────────────────────────────────

/** A guitar feature for displaying all notes on the fretboard using FretboardView. */
export class NotesFeature extends InstrumentFeature {
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
    maxCanvasHeight?: number,
    maxWidth?: number
  ) {
    super(config, settings, maxCanvasHeight, maxWidth);
    this.rootNoteName = rootNoteName;
    const fretCount = 18;

    const guitarSettings = (settings.instrumentSettings as InstrumentSettings | undefined)
      ?? DEFAULT_INSTRUMENT_SETTINGS;
    this.fretboardConfig = planSingleFretboard(
      this.fretboardConfig, maxWidth, maxCanvasHeight,
      guitarSettings.zoomMultiplier ?? 1.2, fretCount
    );

    this.fretboardViewInstance = new FretboardView(this.fretboardConfig, fretCount);
    this._views.push(this.fretboardViewInstance);

    this.calculateAndSetNotes(fretCount);
  }

  // ─── Legacy compat (kept for schedule/feature_adapter.ts until step 6) ──────

  static getConfigurationSchema(): ConfigurationSchema {
    const availableKeys = ["None", ...NOTE_NAMES_FROM_A];
    const specificArgs: ConfigurationSchemaArg[] = [
      {
        name: "Root Note",
        type: ArgType.Enum,
        required: false,
        enum: availableKeys,
        description:
          "Select 'None' (default) to color by note name, or a root note for interval-based colors.",
      },
    ];
    return {
      description: `Config: ${this.typeName}[,RootNote]`,
      args: specificArgs,
    };
  }

  static createFeature(
    config: ReadonlyArray<string>,
    settings: AppSettings,
    maxCanvasHeight: number | undefined,
    _categoryName: string
  ): Feature {
    let rootNoteName: string | null = null;
    if (config.length > 0 && config[0]) {
      const potentialRoot = config[0];
      if (potentialRoot.toLowerCase() === "none") {
        rootNoteName = null;
      } else if (getKeyIndex(potentialRoot) !== -1) {
        rootNoteName = potentialRoot;
      } else {
        console.warn(`[${this.typeName}] Invalid RootNote "${potentialRoot}", using note-based coloring.`);
        rootNoteName = null;
      }
    }
    return new NotesFeature([], settings, rootNoteName, maxCanvasHeight);
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private calculateAndSetNotes(fretCount: number): void {
    const notesData: NoteRenderData[] = [];
    const rootNoteIndex = this.rootNoteName ? getKeyIndex(this.rootNoteName) : -1;
    const hasRoot = rootNoteIndex !== -1;
    const config = this.fretboardConfig;
    const labelDisplay = config.labelDisplay;

    for (let stringIndex = 0; stringIndex < config.tuning.notes.length; stringIndex++) {
      const stringTuning = config.tuning.notes[stringIndex];
      for (let fretIndex = 0; fretIndex <= fretCount; fretIndex++) {
        const noteOffsetFromA = (stringTuning + fretIndex) % 12;
        const noteName = NOTE_NAMES_FROM_A[noteOffsetFromA] ?? "?";
        let intervalLabel = "?";
        if (hasRoot) {
          const noteRelativeToKey = (noteOffsetFromA - rootNoteIndex + 12) % 12;
          intervalLabel = getIntervalLabel(noteRelativeToKey);
        }

        const colorSchemeOverride: FretboardColorScheme | undefined = hasRoot ? undefined : "note";

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
    clearAllChildren(container);
    const headerText = this.rootNoteName
      ? `Notes (Interval Colors Relative to ${this.rootNoteName})`
      : "Notes (Note Name Colors)";
    const header = addHeader(container, headerText);
    header.classList.add('feature-main-title');
  }
}
