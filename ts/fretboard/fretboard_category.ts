// ts/instrument/fretboard_category.ts
import { Category } from "../feature"; // Use Category from feature.ts
import { FeatureTypeDescriptor, SettingsUISchemaItem } from "../feature";
import {
  IntervalSettings,
  IntervalSettingsJSON,
  ScheduleRowData,
} from "../schedule/editor/interval/types";

// Import Guitar Features
import { NotesFeature } from "./features/notes_feature";
import { ScaleFeature } from "./features/scale_feature";
import { ChordFeature } from "./features/chord_feature";
import { ChordProgressionFeature } from "./features/chord_progression_feature";
import { TriadFeature } from "./features/triad_feature";
import { MetronomeFeature } from "./features/metronome_feature";

// Import Guitar Settings related items
import {
  DEFAULT_INSTRUMENT_SETTINGS,
  FretboardLabelDisplay,
  InstrumentSettings,
} from "./fretboard_settings";
import {
  InstrumentIntervalSettings,
  InstrumentIntervalSettingsJSON,
} from "./fretboard_interval_settings";

// Helper function imports (for settings UI schema)
import { INSTRUMENTS, InstrumentName, getAvailableTunings } from "./fretboard";
import type { CustomTuning } from "../settings";
import { FretboardColorScheme } from "./colors";
import { ArpeggioFeature } from "./features/arpeggio_feature";
import { CagedFeature } from "./features/caged_feature";
import { MultiLayerFretboardFeature } from "./features/multi_layer_fretboard_feature";
import { AnyFeature } from "./features/any_feature";
import { NearbyTriadsFeature } from "./features/nearby_triads_feature";

export const COLOR_SCHEME_OPTIONS: {
  value: FretboardColorScheme;
  text: string;
}[] = [
  { value: "interval", text: "Interval Colors (Default)" },
  { value: "note", text: "Note Name Colors" },
  { value: "simplified", text: "Simplified (Root Only)" },
];

export const LABEL_DISPLAY_OPTIONS: {
  value: FretboardLabelDisplay;
  text: string;
}[] = [
  { value: "interval", text: "Interval (R, 3, 5…)" },
  { value: "note", text: "Note Name (C, F#…)" },
  { value: "none", text: "None (dots only)" },
];

function getInstrumentGlobalSettingsUISchema(
  customTunings?: Partial<Record<string, CustomTuning[]>>,
): SettingsUISchemaItem[] {
  const instrumentOptions = Object.values(INSTRUMENTS).map((i) => ({
    value: i.name as string,
    text: i.displayText,
  }));
  const handednessOptions = [
    { value: "right", text: "Right-Handed" },
    { value: "left", text: "Left-Handed" },
  ];
  const orientationOptions = [
    { value: "horizontal", text: "Horizontal (Default)" },
    { value: "vertical", text: "Vertical" },
  ];
  const colorSchemeOptions = COLOR_SCHEME_OPTIONS;
  const labelDisplayOptions = LABEL_DISPLAY_OPTIONS;
  return [
    {
      key: "instrument",
      label: "Instrument",
      type: "select",
      options: instrumentOptions,
      triggersRebuild: true,
      description:
        "Select the instrument type. Changes the available tunings and features.",
    },
    {
      key: "handedness",
      label: "Diagram Handedness",
      type: "select",
      options: handednessOptions,
      description: "Orientation of fretboard diagrams.",
    },
    {
      key: "orientation",
      label: "Fretboard Layout",
      type: "select",
      options: orientationOptions,
      description: "Display the fretboard vertically or horizontally.",
    },
    {
      key: "tuning",
      label: "Tuning",
      type: "select",
      getDynamicOptions: (draft) => {
        const instrument =
          (draft.instrument as InstrumentName) ?? InstrumentName.Guitar;
        return getAvailableTunings(instrument, customTunings).map((t) => ({
          value: t.name,
          text: t.name,
        }));
      },
      triggersRebuild: true,
      description:
        "Select the tuning (options depend on the selected instrument).",
    },
    {
      key: "colorScheme",
      label: "Fretboard Color Scheme",
      type: "select",
      options: colorSchemeOptions,
      description: "How notes on the fretboard are colored.",
    },
    {
      key: "labelDisplay",
      label: "Note Label",
      type: "select",
      options: labelDisplayOptions,
      description: "What text is shown inside each note dot.",
    },
  ];
}

export class InstrumentCategory implements Category {
  private readonly name = "Instrument";
  private readonly displayName = "Instrument Tools";
  private readonly featureTypes: Map<string, FeatureTypeDescriptor>;
  private customTunings?: Partial<Record<string, CustomTuning[]>>;

  constructor() {
    // Instantiate the map of features provided by this category
    this.featureTypes = new Map<string, FeatureTypeDescriptor>([
      [NotesFeature.typeName, NotesFeature as unknown as FeatureTypeDescriptor],
      [ScaleFeature.typeName, ScaleFeature as unknown as FeatureTypeDescriptor],
      [ChordFeature.typeName, ChordFeature as unknown as FeatureTypeDescriptor],
      [
        ChordProgressionFeature.typeName,
        ChordProgressionFeature as unknown as FeatureTypeDescriptor,
      ],
      [TriadFeature.typeName, TriadFeature as unknown as FeatureTypeDescriptor],
      [CagedFeature.typeName, CagedFeature as unknown as FeatureTypeDescriptor],
      [
        MetronomeFeature.typeName,
        MetronomeFeature as unknown as FeatureTypeDescriptor,
      ],
      [
        MultiLayerFretboardFeature.typeName,
        MultiLayerFretboardFeature as unknown as FeatureTypeDescriptor,
      ],
      [AnyFeature.typeName, AnyFeature as unknown as FeatureTypeDescriptor],
      [
        NearbyTriadsFeature.typeName,
        NearbyTriadsFeature as unknown as FeatureTypeDescriptor,
      ],
      [
        ArpeggioFeature.typeName,
        ArpeggioFeature as unknown as FeatureTypeDescriptor,
      ],
    ]);
  }

  getName(): string {
    return this.name;
  }

  getDisplayName(): string {
    return this.displayName;
  }

  getFeatureTypes(): ReadonlyMap<string, FeatureTypeDescriptor> {
    return this.featureTypes;
  }

  getDefaultGlobalSettings(): InstrumentSettings {
    // Return a copy to prevent modification of the original default
    return { ...DEFAULT_INSTRUMENT_SETTINGS };
  }

  getIntervalSettingsFactory(): () => InstrumentIntervalSettings {
    // Return a function that creates a new default instance
    return () => new InstrumentIntervalSettings();
  }

  createIntervalSettingsFromJSON(
    json: IntervalSettingsJSON | undefined | null,
  ): InstrumentIntervalSettings {
    // Use the static method on the specific class
    // Cast the input json; the registry ensures this method is called for the correct category.
    return InstrumentIntervalSettings.fromJSON(
      json as InstrumentIntervalSettingsJSON | undefined | null,
    );
  }

  updateCustomTunings(
    customTunings: Partial<Record<string, CustomTuning[]>> | undefined,
  ): void {
    this.customTunings = customTunings;
  }

  getGlobalSettingsUISchema(): SettingsUISchemaItem[] {
    return getInstrumentGlobalSettingsUISchema(this.customTunings);
  }

  /** Returns a default set of intervals for a simple guitar schedule */
  getDefaultIntervals(): ScheduleRowData[] | null {
    // Use the factory to get default settings for these intervals
    const defaultIntervalSettings = this.getIntervalSettingsFactory()();

    return [
      {
        rowType: "interval",
        duration: "5:00",
        task: "Warmup",
        categoryName: this.getName(), // Use own name
        featureTypeName: "Notes",
        featureArgsList: [],
        intervalSettings: defaultIntervalSettings, // Assign instance
      },
      { rowType: "group", level: 1, name: "Scale Practice" },
      {
        rowType: "interval",
        duration: "3:00",
        task: "C Major Scale",
        categoryName: this.getName(),
        featureTypeName: "Scale",
        featureArgsList: ["Major", "C"],
        intervalSettings: defaultIntervalSettings, // Assign instance
      },
      {
        rowType: "interval",
        duration: "3:00",
        task: "G Major Scale",
        categoryName: this.getName(),
        featureTypeName: "Scale",
        featureArgsList: ["Major", "G"],
        intervalSettings: defaultIntervalSettings, // Assign instance
      },
    ];
  }
}

export const instrumentCategory = new InstrumentCategory();
