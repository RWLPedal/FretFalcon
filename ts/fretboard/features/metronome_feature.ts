// ts/instrument/features/metronome_feature.ts
import {
  Feature,
  ConfigurationSchema,
} from "../../feature";
import { InstrumentFeature } from "../fretboard_base";
import { AppSettings } from "../../settings";
import { addHeader, clearAllChildren } from "../fretboard_utils";

/** A simple feature that only displays a MetronomeView (if BPM > 0). */
export class MetronomeFeature extends InstrumentFeature {
  // Static properties (category removed, others unchanged)
  // static readonly category = FeatureCategoryName.Guitar; // Removed
  static readonly typeName = "Metronome";
  static readonly displayName = "Metronome Only";
  static readonly description =
    "Displays only a metronome control/visualizer. BPM is set via Guitar Settings.";
  readonly typeName = MetronomeFeature.typeName;

  static getConfigurationSchema(): ConfigurationSchema {
    return {
      description: `Config: ${this.typeName}\nDisplays a metronome panel. Use the Metronome floating view for full controls.`,
      args: [],
    };
  }

  static createFeature(
    _config: ReadonlyArray<string>,
    settings: AppSettings,
    maxCanvasHeight: number | undefined,
    _categoryName: string
  ): Feature {
    return new MetronomeFeature([], settings, maxCanvasHeight);
  }

  constructor(
    config: ReadonlyArray<string>,
    settings: AppSettings,
    maxCanvasHeight?: number
  ) {
    super(config, settings, maxCanvasHeight);
  }

  render(container: HTMLElement): void {
    if (!container.querySelector(".feature-header")) {
      const headerEl = addHeader(container, "Metronome");
      headerEl.classList.add("feature-header");
    }
  }
}
