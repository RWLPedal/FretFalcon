/**
 * Internal schedule adapter for feature creation.
 * Wraps the new createFeature(config, settings, maxCanvasHeight, categoryName) signature
 * and handles schedule-specific concerns (metronomeBpm, audioController) that have
 * been removed from the core Feature contract.
 *
 * Nothing outside ts/schedule/ should import this file.
 */
import { Feature } from '../feature';
import { FeatureTypeDescriptor } from '../feature';
import { View } from '../view';
import { AppSettings } from '../settings';
import { AudioController } from '../audio_controller';
import { MetronomeView } from '../fretboard/views/metronome_view';
import { InstrumentIntervalSettings } from './fretboard_interval_settings';

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
    extraViews: View[]
  ) {
    this.typeName = inner.typeName;
    this.config = inner.config;
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
  const feature = descriptor.createFeature(config, settings, maxCanvasHeight, categoryName);

  if (intervalSettings.metronomeBpm > 0
    && audioController.metronomeAudioEl
    && audioController.accentMetronomeAudioEl) {
    const metronomeView = new MetronomeView(intervalSettings.metronomeBpm, audioController);
    return new ScheduleFeatureWrapper(feature, [metronomeView]);
  }

  return feature;
}
