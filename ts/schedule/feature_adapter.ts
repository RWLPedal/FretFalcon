/**
 * Internal schedule adapter for feature creation.
 * Wraps the new createFeature(config, settings, maxCanvasHeight, categoryName) signature
 * and handles schedule-specific concerns (metronomeBpm, audioController) that have
 * been removed from the core Feature contract.
 *
 * Nothing outside ts/schedule/ should import this file.
 */
import { Feature, FeatureContext, FeatureTypeDescriptor } from '../feature';
import { View } from '../core/view';
import { AppSettings } from '../settings';
import { AudioController } from '../audio_controller';
import { MetronomeView } from '../modules/metronome/metronome_view';
import { InstrumentIntervalSettings } from './fretboard_interval_settings';
import { getFeatureSpec } from '../core/config/feature_spec_registry';
import { legacyCodec } from '../core/config/codec';
import { resolveConfig } from '../core/config/resolve';
import { emptyDrivenState } from '../core/config/spec';

/**
 * A thin wrapper that attaches a MetronomeView to the feature's view list
 * for schedule-playback rendering (via the legacy DisplayController path).
 */
class ScheduleFeatureWrapper implements Feature {
  readonly typeName: string;
  readonly config: ReadonlyArray<string>;
  readonly maxCanvasHeight?: number;
  readonly views: ReadonlyArray<View>;

  constructor(
    private readonly inner: Feature,
    extraViews: View[],
    config?: ReadonlyArray<string>
  ) {
    this.typeName = inner.typeName;
    // Spec-created features are constructed with an empty config array, so prefer
    // the original schedule args when provided. This keeps the emitted FeatureSignal
    // (config: [...feature.config]) accurate so linked views render the right interval.
    this.config = config ?? inner.config;
    this.maxCanvasHeight = inner.maxCanvasHeight;
    this.views = [...(inner.views ?? []), ...extraViews];
  }

  render(container: HTMLElement): void { this.inner.render(container); }
  prepare(): void { this.inner.prepare?.(); }
  start(): void { this.inner.start?.(); }
  stop(): void { this.inner.stop?.(); }
  destroy(): void { this.inner.destroy?.(); }
}

/**
 * Creates a Feature for schedule playback.
 * If intervalSettings.metronomeBpm > 0 and audio elements are available,
 * a MetronomeView is appended to the returned feature's views.
 */
export function createScheduleFeature(
  descriptor: FeatureTypeDescriptor,
  config: ReadonlyArray<string>,
  audioController: AudioController,
  settings: AppSettings,
  intervalSettings: InstrumentIntervalSettings,
  maxCanvasHeight: number | undefined,
  categoryName: string
): Feature {
  const spec = getFeatureSpec(descriptor.typeName);
  let feature: Feature;
  if (spec) {
    const codec = (legacyCodec as any)(spec.configSpec, spec.legacyArgOrder, spec.legacyVariadicTail);
    const drivenConfig = codec.decode(config);
    const resolved = resolveConfig(drivenConfig, emptyDrivenState());
    const ctx: FeatureContext = { settings, constraints: { maxHeight: maxCanvasHeight } };
    feature = resolved !== null
      ? (spec as any).create(resolved, ctx)
      : descriptor.createFeature(config, settings, maxCanvasHeight, categoryName);
  } else {
    feature = descriptor.createFeature(config, settings, maxCanvasHeight, categoryName);
  }

  const extraViews: View[] = [];
  if (intervalSettings.metronomeBpm > 0) {
    extraViews.push(new MetronomeView(intervalSettings.metronomeBpm, audioController));
  }

  // Always wrap so the feature exposes the original legacy config. Spec-created
  // features drop it (constructed with []), which would otherwise make linked
  // views such as AnyFloatingView fall back to feature defaults every interval.
  return new ScheduleFeatureWrapper(feature, extraViews, config);
}
