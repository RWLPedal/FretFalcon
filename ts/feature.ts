import { View } from "./core/view";
import { AppSettings } from "./settings";
import type { ConfigSpec, DrivenConfig } from "./core/config/spec";
import type { FeatureTypeId } from "./core/ids";

/**
 * Represents a category of features (e.g., Guitar, Piano).
 * Encapsulates category-specific features and settings.
 * Schedule-specific interval methods have been removed — they live in ts/schedule/.
 */
export interface Category {
  /** Unique identifier string for the category (e.g., "Guitar") */
  getName(): string;

  /** User-friendly display name (e.g., "Guitar Tools") */
  getDisplayName(): string;

  /** Returns a map of FeatureTypeDescriptors belonging to this category */
  getFeatureTypes(): ReadonlyMap<string, FeatureTypeDescriptor>;

  /** Returns the default *global* settings data object for this category */
  getDefaultGlobalSettings(): any;

  /** Optional: Returns a schema for the category's *global* settings UI */
  getGlobalSettingsUISchema?(): SettingsUISchemaItem[];
}

// --- Feature Interface ---
export interface Feature {
  readonly typeName: string;
  readonly config: ReadonlyArray<string>; // Feature-specific config args
  readonly views?: ReadonlyArray<View>;
  readonly maxCanvasHeight?: number;
  render(container: HTMLElement): void;
  prepare?(): void;
  start?(): void;
  stop?(): void;
  destroy?(): void;
}

// --- Feature Type Descriptor ---
// Describes a specific type of feature within a category (e.g., "Scale" within "Guitar")
export interface FeatureTypeDescriptor {
  readonly typeName: string; // Unique name within the category (e.g., "Scale", "Chord")
  readonly displayName: string; // User-friendly name (e.g., "Scale Diagram")
  readonly description: string;
  /**
   * If set, this feature is only available when the active instrument is one of
   * the listed instrument names. Omit for features that work on all instruments.
   */
  readonly requiredInstruments?: ReadonlyArray<string>;
  /**
   * Optional fine-grained compatibility check called after requiredInstruments passes.
   * Return false to hide the feature for this instrument+tuning combination.
   */
  isCompatibleWithTuning?(instrument: string, tuningName: string): boolean;
  /** When true, the config panel starts collapsed when the view is first opened. */
  readonly defaultConfigCollapsed?: boolean;
  getConfigurationSchema(settings?: AppSettings): ConfigurationSchema;
  /**
   * Factory method to create an instance of the feature.
   * audioController and intervalSettings have been removed — the schedule adapter
   * (ts/schedule/feature_adapter.ts) handles those concerns internally.
   */
  createFeature(
    config: ReadonlyArray<string>,
    settings: AppSettings,
    maxCanvasHeight: number | undefined,
    categoryName: string
  ): Feature;
}

export enum ArgType {
  String = "string",
  Number = "number",
  Boolean = "boolean",
  Enum = "enum",
  Ellipsis = "ellipsis",
}

export enum UiComponentType {
  Text = "text",
  Number = "number",
  Enum = "enum",
  ToggleButtonSelector = "toggle_button_selector",
  Ellipsis = "ellipsis",
  /** UI-only visibility gate via controlsArgName — writes nothing to the config string. */
  Checkbox = "checkbox",
  /** Serialized boolean — writes 'true'/'false' to the config string at its schema position. */
  Toggle = "toggle",
  LayerList = "layer_list",
  ChordEntryWidget = "chord_entry_widget",
}

/** A toggle button entry with a separate display label and stored value. */
export interface LabelValue { label: string; value: string }

export interface ConfigurationSchemaArg {
  name: string;
  type: ArgType;
  uiComponentType?: UiComponentType;
  uiComponentData?: {
    buttonLabels?: string[];
    /** Advanced (7th chord) labels — hidden until the Advanced checkbox is checked. */
    advancedButtonLabels?: string[];
    /** Basic labels used when Key type is Minor (legacy — prefer labelsByMode). */
    minorButtonLabels?: string[];
    /** Advanced labels used when Key type is Minor (legacy — prefer labelsByMode). */
    minorAdvancedButtonLabels?: string[];
    /**
     * Mode-aware button labels for ToggleButtonSelector.
     * Keys are DiatonicMode enum values (e.g. 'MAJOR', 'DORIAN').
     * Takes precedence over buttonLabels / minorButtonLabels when present.
     */
    labelsByMode?: Record<string, { basic: LabelValue[]; advanced: LabelValue[] }>;
    /** Layer list data for MultiLayerFretboard feature. */
    scaleNames?: string[];
    rootNoteOptions?: string[];
    chordEntries?: { key: string; label: string }[];
    noteNames?: string[];
    /** ChordEntryWidget: restrict to diatonic chords only; store as degree indices. */
    diatonicOnly?: boolean;
  };
  /** Display labels for enum values — parallel array to `enum`. Falls back to value if absent. */
  enumLabels?: string[];
  required?: boolean;
  enum?: string[];
  /** Initial selected value when rendering a fresh (unconfigured) enum selector. Overrides the first enum entry. */
  defaultValue?: string;
  description?: string;
  example?: string;
  isVariadic?: boolean;
  nestedSchema?: ConfigurationSchemaArg[];
  /**
   * Name of another arg in the same schema that this arg controls.
   * Used to wire up dynamic UI updates (e.g. a Key dropdown rebuilding
   * a toggle-button selector, or an Advanced checkbox showing hidden buttons).
   */
  controlsArgName?: string;
}

export type ConfigurationSchema =
  | { description: string; args: ConfigurationSchemaArg[] }
  | string; // Can be just a description string if no args

/** Describes a single UI element for the *global* settings modal for a category */
export interface SettingsUISchemaItem {
  key: string;
  label: string;
  type: "select" | "number" | "text" | "checkbox" | "segmented" | "radio-cards";
  /** Subtitle shown below the field label. */
  description?: string;
  options?: { value: string; text: string; description?: string; dots?: Array<{ label: string; color: string; dim?: boolean }> }[];
  /**
   * When present, options are computed from the current draft settings for this
   * category. Takes precedence over `options`. Used for fields whose choices
   * depend on other fields (e.g. tuning depends on instrument).
   */
  getDynamicOptions?: (draft: Record<string, any>) => { value: string; text: string; description?: string }[];
  /**
   * When true, changing this field triggers a re-render of the category settings
   * section so dependent fields (those with `getDynamicOptions`) can update.
   */
  triggersRebuild?: boolean;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
}

// ─── FeatureSpec (typed replacement for FeatureTypeDescriptor) ────────────────

/** Passed to FeatureSpec.create() instead of the legacy (config, settings, maxCanvasHeight) tuple. */
export interface FeatureContext {
  settings: AppSettings;
  constraints: { maxWidth?: number; maxHeight?: number };
}

/**
 * Typed feature descriptor.  Replaces FeatureTypeDescriptor; the two coexist
 * during Phase B migration (feature_panel_controller handles both).
 */
export interface FeatureSpec<C> {
  readonly id: FeatureTypeId;
  readonly displayName: string;
  readonly description: string;
  readonly requiredInstruments?: ReadonlyArray<string>;
  isCompatibleWithTuning?(instrument: string, tuningName: string): boolean;
  readonly defaultConfigCollapsed?: boolean;
  /** Ordered keys matching the legacy positional string array (for legacyCodec). */
  readonly legacyArgOrder: (keyof C)[];
  /** Optional last key whose codec value is string[] (variadic tail). */
  readonly legacyVariadicTail?: keyof C;
  readonly configSpec: ConfigSpec<C>;
  /** Optional: derive the panel title from a (possibly partial) resolved config. */
  title?(config: Partial<C>): string | null;
  create(config: C, ctx: FeatureContext): Feature;
}
