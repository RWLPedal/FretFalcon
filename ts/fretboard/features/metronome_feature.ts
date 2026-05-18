// ts/instrument/features/metronome_feature.ts
import {
  Feature,
  // FeatureCategoryName removed
  ConfigurationSchema,
  ConfigurationSchemaArg,
} from "../../feature";
import { InstrumentFeature } from "../instrument_base";
import { AudioController } from "../../audio_controller";
import { AppSettings } from "../../settings";
// Import generic and specific interval settings types
import { IntervalSettings } from "../../schedule/editor/interval/types";
import { InstrumentIntervalSettings } from "../instrument_interval_settings";
import { addHeader, clearAllChildren } from "../instrument_utils";
import { View } from "../../view"; // Keep View import if used by base class logic

/** A simple feature that only displays a MetronomeView (if BPM > 0). */
export class MetronomeFeature extends InstrumentFeature {
  // Static properties (category removed, others unchanged)
  // static readonly category = FeatureCategoryName.Guitar; // Removed
  static readonly typeName = "Metronome";
  static readonly displayName = "Metronome Only";
  static readonly description =
    "Displays only a metronome control/visualizer. BPM is set via Guitar Settings.";
  readonly typeName = MetronomeFeature.typeName;

  // --- Static Methods ---
  static getConfigurationSchema(): ConfigurationSchema {
    // Unchanged
    return {
      description: `Config: ${this.typeName}[,InstrumentSettings]\nDisplays a metronome. BPM set via Guitar Settings.`,
      args: [InstrumentFeature.BASE_INSTRUMENT_SETTINGS_CONFIG_ARG],
    };
  }

  // **** UPDATED createFeature Signature ****
  static createFeature(
    config: ReadonlyArray<string>,
    audioController: AudioController,
    settings: AppSettings,
    intervalSettings: IntervalSettings, // <<< CHANGED: Accept generic base type
    maxCanvasHeight: number | undefined,
    categoryName: string // <<< ADDED: Accept category name string
  ): Feature {
    // --- Type Assertion for Constructor ---
    const guitarIntervalSettings = intervalSettings as InstrumentIntervalSettings;
    // --- End Type Assertion ---

    // Metronome feature has no specific config args itself
    const featureSpecificConfig: ReadonlyArray<string> = [];

    return new MetronomeFeature(
      featureSpecificConfig, // Pass empty array for specific config
      settings,
      guitarIntervalSettings, // Pass asserted specific type
      audioController,
      maxCanvasHeight
    );
  }

  // Constructor calls super, which handles metronome view creation
  constructor(
    config: ReadonlyArray<string>, // Expects empty array or potentially filtered settings args
    settings: AppSettings,
    intervalSettings: InstrumentIntervalSettings, // Constructor expects specific type
    audioController?: AudioController,
    maxCanvasHeight?: number
  ) {
    // Pass intervalSettings up to the base constructor
    // The base constructor will extract BPM and create MetronomeView if needed
    super(config, settings, intervalSettings, audioController, maxCanvasHeight); // Pass specific type
    // No feature-specific views to add here
  }

  /** Render just adds a header; DisplayController handles the MetronomeView. */
  render(container: HTMLElement): void {
    // **** FIX: Only add header if it doesn't exist ****
    // Check if a header already exists to avoid duplicates if render is called multiple times
    if (!container.querySelector(".feature-header")) {
      const headerText =
        this.metronomeBpm > 0
          ? `Metronome @ ${this.metronomeBpm} BPM`
          : "Metronome (Off)";
      const headerEl = addHeader(container, headerText);
      headerEl.classList.add("feature-header"); // Add class for identification
    }

    // Optional messages can still be added if needed, but don't clear
    if (this.views.length === 0 && this.metronomeBpm > 0) {
      if (!container.querySelector(".metronome-error-msg")) {
        const errorMsg = document.createElement("p");
        errorMsg.textContent =
          "Metronome view could not be created (check console for errors).";
        errorMsg.style.padding = "10px";
        errorMsg.style.color = "var(--clr-danger)";
        errorMsg.classList.add("metronome-error-msg");
        container.appendChild(errorMsg);
      }
    } else if (this.views.length === 0 && this.metronomeBpm <= 0) {
      if (!container.querySelector(".metronome-off-msg")) {
        const offMsg = document.createElement("p");
        offMsg.textContent = "Metronome BPM is set to 0.";
        offMsg.style.padding = "10px";
        offMsg.style.color = "var(--clr-text-subtle)";
        offMsg.classList.add("metronome-off-msg");
        container.appendChild(offMsg);
      }
    }
  }
}
