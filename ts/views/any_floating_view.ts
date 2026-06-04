import { BaseView } from '../base_view';
import { AppSettings } from '../settings';
import { AudioController } from '../audio_controller';
import { Feature } from '../feature';
import { getFeatureTypeDescriptor } from '../feature_registry';
import { instrumentCategory } from '../fretboard/fretboard_category';
import { DriveSignal, SignalKind, FeatureSignal } from '../panels/link_types';
import { InstrumentSettings } from '../fretboard/fretboard_settings';
import { setPendingRenderConstraints } from '../fretboard/fretboard_base';

const PLACEHOLDER_UNLINKED = 'Connect a Schedule to display features here';
const PLACEHOLDER_REST = '(Rest)';

/**
 * A blank canvas floating view that displays the current schedule interval's
 * feature content when linked to a ScheduleFloatingView via the link system.
 */
export class AnyFloatingView extends BaseView {
  private appSettings: AppSettings;
  private audioController: AudioController;
  private currentFeature: Feature | null = null;
  private featureContainer: HTMLElement | null = null;
  private placeholderEl: HTMLElement | null = null;
  private isLinked = false;

  constructor(_initialState: any, appSettings: AppSettings) {
    super();
    this.appSettings = appSettings;
    this.audioController = new AudioController(
      document.querySelector('#intro-end-sound') as HTMLAudioElement | null,
      document.querySelector('#interval-end-sound') as HTMLAudioElement | null,
      document.querySelector('#metronome-sound') as HTMLAudioElement | null,
      document.querySelector('#metronome-accent-sound') as HTMLAudioElement | null,
    );
  }

  render(container: HTMLElement): void {
    this.container = container;
    container.innerHTML = '';
    container.classList.add('any-floating-view');

    this.placeholderEl = document.createElement('div');
    this.placeholderEl.classList.add('any-view-placeholder');
    container.appendChild(this.placeholderEl);

    this.featureContainer = document.createElement('div');
    this.featureContainer.classList.add('any-view-feature-container');
    container.appendChild(this.featureContainer);

    this.listen(container, 'drive-signal', (e: Event) => {
      const detail = (e as CustomEvent<{ signal: DriveSignal }>).detail;
      if (detail?.signal?.kind === SignalKind.Feature) {
        this._handleFeatureSignal(detail.signal as FeatureSignal);
      }
    });

    this.listen(container, 'link-status-changed', (e: Event) => {
      const detail = (e as CustomEvent<{ hasIncomingLinks: boolean }>).detail;
      this.isLinked = !!detail?.hasIncomingLinks;
      if (!this.isLinked && !this.currentFeature) {
        this._showPlaceholder(PLACEHOLDER_UNLINKED);
      }
    });

    this._showPlaceholder(PLACEHOLDER_UNLINKED);
  }

  /** Choose orientation based on the container's aspect ratio. Falls back to
   *  the global setting if the container has not been laid out yet (0×0).
   *  IMPORTANT: only call this after the placeholder is hidden, otherwise the
   *  featureContainer shares flex space with the placeholder (both flex:1) and
   *  reports roughly half its true height — which flips the orientation. */
  private _autoOrientation(w: number, h: number): "vertical" | "horizontal" {
    if (w === 0 && h === 0) return this.appSettings.instrumentSettings?.orientation ?? "vertical";
    return w >= h ? "horizontal" : "vertical";
  }

  private _handleFeatureSignal(signal: FeatureSignal): void {
    this._clearFeature();

    if (!signal.featureTypeName) {
      this._showPlaceholder(PLACEHOLDER_REST);
      return;
    }

    const descriptor = getFeatureTypeDescriptor(signal.categoryName, signal.featureTypeName);
    if (!descriptor) {
      console.warn(`[AnyFloatingView] Unknown feature: ${signal.categoryName}/${signal.featureTypeName}`);
      this._showPlaceholder(`Unknown feature: ${signal.featureTypeName}`);
      return;
    }

    try {
      const intervalSettings = instrumentCategory.getIntervalSettingsFactory()();

      // Hide the placeholder BEFORE measuring. While it is visible it shares flex
      // space with the featureContainer (both flex:1), so the featureContainer
      // reports ~half its true height — which would flip the orientation and make
      // single fretboards size to width instead of the constraining dimension.
      this._hidePlaceholder();

      // Now the featureContainer fills the full content box; measure both axes
      // from it so orientation and the height budget are mutually consistent.
      const availW = this.featureContainer?.clientWidth || this.container?.clientWidth || 0;
      const availH = this.featureContainer?.clientHeight || this.container?.clientHeight || 0;
      if (availW > 0) setPendingRenderConstraints({ maxWidth: availW });
      const maxCanvasHeight = availH > 0 ? availH : undefined;

      const orientation = this._autoOrientation(availW, availH);
      console.log('[AnyFloatingView] sizing', {
        containerW: this.container?.clientWidth,
        containerH: this.container?.clientHeight,
        featureContainerW: this.featureContainer?.clientWidth,
        featureContainerH: this.featureContainer?.clientHeight,
        availW,
        availH,
        maxCanvasHeight,
        orientation,
        feature: signal.featureTypeName,
      });

      const settingsForFeature: AppSettings = {
        ...this.appSettings,
        instrumentSettings: {
          ...this.appSettings.instrumentSettings,
          orientation,
        } as InstrumentSettings,
      };

      this.currentFeature = descriptor.createFeature(
        signal.config,
        this.audioController,
        settingsForFeature,
        intervalSettings,
        maxCanvasHeight,
        signal.categoryName
      );

      // Placeholder already hidden above (before measuring).
      if (this.featureContainer) {
        this.currentFeature.render(this.featureContainer);
        this.currentFeature.views?.forEach(v => v.render(this.featureContainer!));
        this.currentFeature.start?.();
      }
    } catch (err) {
      console.error('[AnyFloatingView] Error creating feature:', err);
      this._showPlaceholder(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private _clearFeature(): void {
    if (this.currentFeature) {
      this.currentFeature.stop?.();
      this.currentFeature.destroy?.();
      this.currentFeature = null;
    }
    if (this.featureContainer) this.featureContainer.innerHTML = '';
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
    this._clearFeature();
    super.destroy();
  }
}
