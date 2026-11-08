// ts/instrument/fretboard_category.ts
import { Category } from "../feature"; // Use Category from feature.ts
import { FeatureTypeDescriptor, SettingsUISchemaItem } from "../feature";
import { registerFeatureSpec } from "../core/config/feature_spec_registry";

// Features are auto-discovered from features/*_feature.ts — see feature_manifest.ts.
// Adding a feature = create its feature file + module file; no edits here.
import { FEATURE_DESCRIPTORS, FEATURE_SPECS } from "./features/feature_manifest";

// Import Guitar Settings related items
import {
  DEFAULT_INSTRUMENT_SETTINGS,
  FretboardLabelDisplay,
  InstrumentSettings,
} from "./fretboard_settings";
// Helper function imports (for settings UI schema)
import { INSTRUMENTS, InstrumentName, getAvailableTunings } from "./instruments";
import type { CustomTuning } from "../settings";
import { FretboardColorScheme } from "./colors";

export const COLOR_SCHEME_OPTIONS: {
  value: FretboardColorScheme;
  text: string;
  description: string;
  dots: Array<{ label: string; color: string; dim?: boolean }>;
}[] = [
  {
    value: "interval",
    text: "Interval colors",
    description: "Color by harmonic role",
    dots: [
      { label: "R", color: "var(--note-root)" },
      { label: "3", color: "var(--note-third)" },
      { label: "5", color: "var(--note-fifth)" },
    ],
  },
  {
    value: "note",
    text: "By note name",
    description: "Chromatic, 12 hues",
    dots: [
      { label: "A",  color: "var(--note-root)" },
      { label: "A#", color: "var(--note-third)" },
      { label: "B",  color: "var(--note-fifth)" },
    ],
  },
  {
    value: "simplified",
    text: "Single color",
    description: "One accent everywhere",
    dots: [
      { label: "R", color: "var(--accent)" },
      { label: "3", color: "var(--accent)", dim: true },
      { label: "5", color: "var(--accent)", dim: true },
    ],
  },
];

export const LABEL_DISPLAY_OPTIONS: {
  value: FretboardLabelDisplay;
  text: string;
  description: string;
  dots: Array<{ label: string; color: string; dim?: boolean }>;
}[] = [
  {
    value: "interval",
    text: "Intervals",
    description: "Scale degrees",
    dots: [
      { label: "R", color: "var(--note-root)" },
      { label: "3", color: "var(--note-third)" },
      { label: "5", color: "var(--note-fifth)" },
    ],
  },
  {
    value: "note",
    text: "Note names",
    description: "Chromatic names",
    dots: [
      { label: "A",  color: "var(--note-root)" },
      { label: "A#", color: "var(--note-third)" },
      { label: "B",  color: "var(--note-fifth)" },
    ],
  },
  {
    value: "none",
    text: "None",
    description: "Dots only",
    dots: [
      { label: "", color: "var(--note-root)" },
      { label: "", color: "var(--note-third)" },
      { label: "", color: "var(--note-fifth)" },
    ],
  },
];

function getInstrumentGlobalSettingsUISchema(
  customTunings?: Partial<Record<string, CustomTuning[]>>,
): SettingsUISchemaItem[] {
  const instrumentOptions = Object.values(INSTRUMENTS).map((i) => ({
    value: i.name as string,
    text: i.displayText,
  }));
  return [
    {
      key: "instrument",
      label: "Instrument",
      type: "select",
      options: instrumentOptions,
      triggersRebuild: true,
    },
    {
      key: "handedness",
      label: "Handedness",
      type: "segmented",
      options: [
        { value: "left",  text: "Left" },
        { value: "right", text: "Right" },
      ],
    },
    {
      key: "orientation",
      label: "Default layout",
      type: "segmented",
      options: [
        { value: "horizontal", text: "Horizontal" },
        { value: "vertical",   text: "Vertical" },
      ],
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
    },
    {
      key: "colorScheme",
      label: "Default color scheme",
      type: "radio-cards",
      description: "What the dot colors mean",
      options: COLOR_SCHEME_OPTIONS,
    },
    {
      key: "labelDisplay",
      label: "Default note labels",
      type: "radio-cards",
      description: "What text appears on fretboard dots.",
      options: LABEL_DISPLAY_OPTIONS,
    },
  ];
}

export class InstrumentCategory implements Category {
  private readonly name = "Instrument";
  private readonly featureTypes: Map<string, FeatureTypeDescriptor>;
  private customTunings?: Partial<Record<string, CustomTuning[]>>;

  constructor() {
    // Both registries derive from the auto-discovered feature manifest — one entry per
    // features/*_feature.ts. Legacy descriptors key the category map; migrated features
    // additionally register their typed FeatureSpec.
    this.featureTypes = new Map<string, FeatureTypeDescriptor>(
      FEATURE_DESCRIPTORS.map((d) => [d.typeName, d]),
    );
    FEATURE_SPECS.forEach(registerFeatureSpec);
  }

  getName(): string {
    return this.name;
  }

  getDisplayName(): string {
    return this.name;
  }

  getFeatureTypes(): ReadonlyMap<string, FeatureTypeDescriptor> {
    return this.featureTypes;
  }

  getDefaultGlobalSettings(): InstrumentSettings {
    // Return a copy to prevent modification of the original default
    return { ...DEFAULT_INSTRUMENT_SETTINGS };
  }

  updateCustomTunings(
    customTunings: Partial<Record<string, CustomTuning[]>> | undefined,
  ): void {
    this.customTunings = customTunings;
  }

  getGlobalSettingsUISchema(): SettingsUISchemaItem[] {
    return getInstrumentGlobalSettingsUISchema(this.customTunings);
  }

}

export const instrumentCategory = new InstrumentCategory();
