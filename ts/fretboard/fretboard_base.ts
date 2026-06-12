import { Feature, ConfigurationSchemaArg } from "../feature";

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
import {
  FretboardConfig,
  INSTRUMENTS,
  InstrumentName,
  resolveTuning,
} from "./fretboard";
import { AppSettings } from "../settings";
import {
  InstrumentSettings,
  DEFAULT_INSTRUMENT_SETTINGS,
} from "./fretboard_settings";
import {
  clearAllChildren,
  addHeader,
  addCanvas,
  START_PX,
} from "./fretboard_utils";

/**
 * Base class for all Guitar-related features.
 * Handles common setup like FretboardConfig.
 * MetronomeView creation (schedule-era) has been moved to ts/schedule/feature_adapter.ts.
 */
export abstract class InstrumentFeature implements Feature {
  abstract readonly typeName: string;
  readonly config: ReadonlyArray<string>;
  protected settings: AppSettings;
  protected fretboardConfig: FretboardConfig;
  readonly maxCanvasHeight?: number;

  protected _views: View[] = []; // Mutable array for internal use
  get views(): ReadonlyArray<View> {
    return this._views;
  }

  constructor(
    config: ReadonlyArray<string>,
    settings: AppSettings,
    maxCanvasHeight?: number
  ) {
    this.config = config;
    this.settings = settings;
    this.maxCanvasHeight = maxCanvasHeight;

    const guitarGlobalSettings = settings.instrumentSettings ?? DEFAULT_INSTRUMENT_SETTINGS;

    const instrument: InstrumentName = (guitarGlobalSettings.instrument as InstrumentName) ?? InstrumentName.Guitar;
    const tuning = resolveTuning(instrument, guitarGlobalSettings.tuning, settings.customTunings);

    // Pass explicit widths for 6-string guitar to preserve existing appearance.
    const stringWidths = instrument === InstrumentName.Guitar ? [3, 3, 2, 2, 1, 1] : undefined;

    // Consume the pending width constraint set by ConfigurableFeatureView before createFeature().
    const maxCanvasWidth = _pendingConstraints.maxWidth;
    _pendingConstraints = {};

    this.fretboardConfig = new FretboardConfig(
      tuning,
      guitarGlobalSettings.handedness,
      guitarGlobalSettings.orientation,
      guitarGlobalSettings.colorScheme,
      guitarGlobalSettings.labelDisplay ?? "interval",
      undefined, // markerDots
      undefined, // sideNumbers
      stringWidths,
      this.maxCanvasHeight,
      maxCanvasWidth,
      guitarGlobalSettings.zoomMultiplier ?? 1.2
    );
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
    ctx.resetTransform();
    return { canvas: canvasEl, ctx: ctx };
  }
}
