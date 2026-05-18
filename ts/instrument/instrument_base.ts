import { Feature, ConfigurationSchemaArg, ArgType, UiComponentType } from "../feature";

// --- Pending render constraints ---
// Set by ConfigurableFeatureView immediately before createFeature(); consumed once by InstrumentFeature.
interface RenderConstraints { maxWidth?: number; }
let _pendingConstraints: RenderConstraints = {};

export function setPendingRenderConstraints(c: RenderConstraints): void {
  _pendingConstraints = c;
}

/** Peek at the pending canvas width without consuming it (used by sub-features before super()). */
export function peekPendingCanvasWidth(): number | undefined {
  return _pendingConstraints.maxWidth;
}

// --- End pending render constraints ---
import { View } from "../view";
import { MetronomeView } from "./views/metronome_view";
import {
  FretboardConfig,
  INSTRUMENT_TUNINGS,
  InstrumentName,
} from "./fretboard";
import { AppSettings } from "../settings";
import {
  InstrumentSettings,
  DEFAULT_INSTRUMENT_SETTINGS,
} from "./instrument_settings";
import { InstrumentIntervalSettings } from "./instrument_interval_settings";
import { AudioController } from "../audio_controller";
import {
  clearAllChildren,
  addHeader,
  addCanvas,
  START_PX,
} from "./instrument_utils";
import { IntervalSettings } from "../schedule/editor/interval/types";

/**
 * Base class for all Guitar-related features.
 * Handles common setup like FretboardConfig and conditional MetronomeView creation based on interval settings.
 */
export abstract class InstrumentFeature implements Feature {
  abstract readonly typeName: string;
  readonly config: ReadonlyArray<string>;
  protected settings: AppSettings;
  protected audioController?: AudioController;
  protected fretboardConfig: FretboardConfig;
  readonly maxCanvasHeight?: number;

  protected _views: View[] = []; // Mutable array for internal use
  get views(): ReadonlyArray<View> {
    // Expose as readonly externally
    return this._views;
  }
  protected metronomeBpm: number = 0;

  static readonly BASE_INSTRUMENT_SETTINGS_CONFIG_ARG: ConfigurationSchemaArg = {
    name: "",
    type: ArgType.Ellipsis,
    uiComponentType: UiComponentType.Ellipsis,
    description: "Configure interval-specific settings (e.g., Metronome).",
    nestedSchema: [
      {
        name: "metronomeBpm",
        type: ArgType.Number,
        description: "Metronome BPM (0=off)",
      },
    ],
  };

  constructor(
    config: ReadonlyArray<string>,
    settings: AppSettings,
    intervalSettings: InstrumentIntervalSettings,
    audioController?: AudioController,
    maxCanvasHeight?: number
  ) {
    this.config = config;
    this.settings = settings;
    this.maxCanvasHeight = maxCanvasHeight;
    this.audioController = audioController;

    const guitarGlobalSettings = settings.instrumentSettings ?? DEFAULT_INSTRUMENT_SETTINGS;

    const instrument: InstrumentName = guitarGlobalSettings.instrument ?? "Guitar";
    const tuningsForInstrument = INSTRUMENT_TUNINGS[instrument] ?? INSTRUMENT_TUNINGS["Guitar"];
    const tuningName = tuningsForInstrument[guitarGlobalSettings.tuning]
      ? guitarGlobalSettings.tuning
      : Object.keys(tuningsForInstrument)[0];
    const tuning = tuningsForInstrument[tuningName];

    // Pass explicit widths for 6-string guitar to preserve existing appearance.
    const stringWidths = instrument === "Guitar" ? [3, 3, 2, 2, 1, 1] : undefined;

    // Consume the pending width constraint set by ConfigurableFeatureView before createFeature().
    const maxCanvasWidth = _pendingConstraints.maxWidth;
    _pendingConstraints = {};

    this.fretboardConfig = new FretboardConfig(
      tuning,
      guitarGlobalSettings.handedness,
      guitarGlobalSettings.orientation,
      guitarGlobalSettings.colorScheme,
      undefined, // markerDots
      undefined, // sideNumbers
      stringWidths,
      this.maxCanvasHeight,
      maxCanvasWidth,
      guitarGlobalSettings.zoomMultiplier ?? 1.2
    );

    // --- Metronome Handling ---
    let metronomeViewInstance: MetronomeView | null = null;
    this.metronomeBpm = intervalSettings?.metronomeBpm ?? 0;
    if (this.metronomeBpm > 0) {
      if (
        this.audioController &&
        this.audioController.metronomeAudioEl &&
        this.audioController.accentMetronomeAudioEl
      ) {
        metronomeViewInstance = new MetronomeView(
          this.metronomeBpm,
          this.audioController
        );
      } else {
        console.warn(
          `Metronome requested (BPM: ${this.metronomeBpm}) but audio elements/controller missing. MetronomeView not created.`
        );
      }
    }

    // Subclasses add their views to this._views BEFORE calling super.
    // Add the metronome view if created, ensuring it's last.
    if (metronomeViewInstance) {
      this._views.push(metronomeViewInstance);
    }
  }

  // Abstract render method
  abstract render(container: HTMLElement): void;

  // Common lifecycle methods
  prepare?(): void {
    this._views.forEach((view) => {
      if (typeof (view as any).prepare === "function") {
        (view as any).prepare();
      }
    });
  }
  start?(): void {
    this._views.forEach((view) => view.start());
  }
  stop?(): void {
    this._views.forEach((view) => view.stop());
  }
  destroy?(): void {
    this._views.forEach((view) => view.destroy());
  }

  // Helper for canvas setup
  protected clearAndAddCanvas(
    container: HTMLElement,
    headerText: string
  ): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
    clearAllChildren(container);
    addHeader(container, headerText);
    const uniqueSuffix = `${this.typeName}-${Math.random().toString(36).substring(2, 9)}`;
    const canvasEl = addCanvas(container, uniqueSuffix);
    const ctx = canvasEl.getContext("2d");
    if (!ctx) {
      throw new Error(
        `Could not get 2D context for canvas in feature ${this.typeName}.`
      );
    }
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    ctx.resetTransform(); // Use resetTransform for modern canvas state clearing
    // Optional: Translate for sharper lines
    // ctx.translate(0.5, 0.5);
    return { canvas: canvasEl, ctx: ctx };
  }
}