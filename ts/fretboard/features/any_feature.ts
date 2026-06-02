import {
  Feature,
  ConfigurationSchema,
  ArgType,
} from '../../feature';
import { AudioController } from '../../audio_controller';
import { AppSettings } from '../../settings';
import { IntervalSettings } from '../../schedule/editor/interval/types';
import { instrumentCategory } from '../fretboard_category';
import { getFeatureTypeDescriptor } from '../../feature_registry';
import { DriveSignal, FeatureSignal, SignalKind, SignalState } from '../../panels/link_types';

const PLACEHOLDER_UNLINKED = 'Connect a source to display features here';
const PLACEHOLDER_REST = '(Rest)';

/**
 * A container feature that displays whatever feature is driven by a connected
 * source (e.g. ScheduleFloatingView). The State config arg selects whether to
 * show the current-state or next-state signal from the source.
 *
 * Rendered inside a ConfigurableFeatureView — drive-signal and link-status-changed
 * events are forwarded to the feature container by ConfigurableFeatureView.
 */
export class AnyFeature implements Feature {
  static readonly typeName = 'AnyFeature';
  static readonly displayName = 'Any Feature';
  static readonly description =
    'Displays a feature driven by a connected Schedule or other source. ' +
    'Select whether to show the current or next state.';
  static readonly defaultConfigCollapsed = true;

  readonly typeName = AnyFeature.typeName;
  readonly config: ReadonlyArray<string>;

  private readonly mode: SignalState;
  private readonly appSettings: AppSettings;
  private readonly audioController: AudioController;
  private currentFeature: Feature | null = null;
  private featureContainerEl: HTMLElement | null = null;
  private placeholderEl: HTMLElement | null = null;
  private readonly _unlisten: Array<() => void> = [];

  static getConfigurationSchema(): ConfigurationSchema {
    return {
      description: 'Displays the feature driven by a connected source.',
      args: [
        {
          name: 'State',
          type: ArgType.Enum,
          enum: ['current', 'next'],
          enumLabels: ['Current', 'Next'],
          defaultValue: 'current',
          required: true,
        },
      ],
    };
  }

  static createFeature(
    config: ReadonlyArray<string>,
    audioController: AudioController | undefined,
    settings: AppSettings,
    _intervalSettings: IntervalSettings,
    _maxCanvasHeight: number | undefined,
    _categoryName: string
  ): Feature {
    return new AnyFeature(config, settings, audioController);
  }

  constructor(config: ReadonlyArray<string>, appSettings: AppSettings, audioController?: AudioController) {
    this.config = config;
    this.appSettings = appSettings;
    this.mode = config[0] === SignalState.Next ? SignalState.Next : SignalState.Current;
    this.audioController = audioController ?? new AudioController(
      document.querySelector('#intro-end-sound') as HTMLAudioElement | null,
      document.querySelector('#interval-end-sound') as HTMLAudioElement | null,
      document.querySelector('#metronome-sound') as HTMLAudioElement | null,
      document.querySelector('#metronome-accent-sound') as HTMLAudioElement | null,
    );
  }

  render(container: HTMLElement): void {
    container.innerHTML = '';

    this.placeholderEl = document.createElement('div');
    this.placeholderEl.classList.add('any-view-placeholder');
    container.appendChild(this.placeholderEl);

    this.featureContainerEl = document.createElement('div');
    this.featureContainerEl.classList.add('any-view-feature-container');
    container.appendChild(this.featureContainerEl);

    this._showPlaceholder(PLACEHOLDER_UNLINKED);

    // drive-signal is forwarded here (bubbles: false) by ConfigurableFeatureView.
    const driveListener = (e: Event) => {
      const detail = (e as CustomEvent<{ signal: DriveSignal }>).detail;
      if (detail?.signal?.kind !== SignalKind.Feature) return;
      const signal = detail.signal as FeatureSignal;
      if ((signal.state ?? SignalState.Current) === this.mode) {
        this._handleFeatureSignal(signal);
      }
    };
    container.addEventListener('drive-signal', driveListener);
    this._unlisten.push(() => container.removeEventListener('drive-signal', driveListener));

    // link-status-changed is forwarded here by ConfigurableFeatureView.
    const linkStatusListener = (e: Event) => {
      const { hasIncomingLinks } = (e as CustomEvent<{ hasIncomingLinks: boolean }>).detail;
      if (!hasIncomingLinks && !this.currentFeature) {
        this._showPlaceholder(PLACEHOLDER_UNLINKED);
      }
    };
    container.addEventListener('link-status-changed', linkStatusListener);
    this._unlisten.push(() => container.removeEventListener('link-status-changed', linkStatusListener));
  }

  private _handleFeatureSignal(signal: FeatureSignal): void {
    this._clearFeature();
    if (!signal.featureTypeName) {
      this._showPlaceholder(PLACEHOLDER_REST);
      return;
    }
    const descriptor = getFeatureTypeDescriptor(signal.categoryName, signal.featureTypeName);
    if (!descriptor) {
      console.warn(`[AnyFeature] Unknown feature: ${signal.categoryName}/${signal.featureTypeName}`);
      this._showPlaceholder(`Unknown feature: ${signal.featureTypeName}`);
      return;
    }
    try {
      const intervalSettings = instrumentCategory.getIntervalSettingsFactory()();
      const maxCanvasHeight = this.featureContainerEl?.clientHeight || 600;
      this.currentFeature = descriptor.createFeature(
        signal.config,
        this.audioController,
        this.appSettings,
        intervalSettings,
        maxCanvasHeight,
        signal.categoryName
      );
      this._hidePlaceholder();
      if (this.featureContainerEl) {
        this.currentFeature.render(this.featureContainerEl);
        this.currentFeature.views?.forEach(v => v.render(this.featureContainerEl!));
        this.currentFeature.start?.();
      }
    } catch (err) {
      console.error('[AnyFeature] Error creating feature:', err);
      this._showPlaceholder(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private _clearFeature(): void {
    this.currentFeature?.stop?.();
    this.currentFeature?.destroy?.();
    this.currentFeature = null;
    if (this.featureContainerEl) this.featureContainerEl.innerHTML = '';
  }

  private _showPlaceholder(text: string): void {
    if (!this.placeholderEl) return;
    this.placeholderEl.textContent = text;
    this.placeholderEl.style.display = '';
  }

  private _hidePlaceholder(): void {
    if (this.placeholderEl) this.placeholderEl.style.display = 'none';
  }

  start(): void { this.currentFeature?.start?.(); }
  stop(): void { this.currentFeature?.stop?.(); }

  destroy(): void {
    this._unlisten.forEach(fn => fn());
    (this._unlisten as Array<() => void>).length = 0;
    this._clearFeature();
  }
}
