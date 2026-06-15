import { BaseView } from '../../core/base_view';
import { AppSettings } from '../../settings';
import { Feature, FeatureContext } from '../../feature';
import { getFeatureTypeDescriptor } from '../../feature_registry';
import { getFeatureSpec } from '../../core/config/feature_spec_registry';
import { legacyCodec } from '../../core/config/codec';
import { resolveConfig } from '../../core/config/resolve';
import { emptyDrivenState } from '../../core/config/spec';
import { DriveSignal, SignalKind, SignalState, FeatureSignal, SignalSink } from '../../panels/link_types';
import { InstrumentSettings } from '../../fretboard/fretboard_settings';

const PLACEHOLDER_UNLINKED = 'Connect a Schedule to display features here';
const PLACEHOLDER_REST = '(Rest)';

/**
 * A blank canvas floating view that displays the current schedule interval's
 * feature content when linked to a ScheduleFloatingView via the link system.
 * Privileged: instantiates features directly from FeatureSignals.
 */
export class AnyFloatingView extends BaseView implements SignalSink {
  private appSettings: AppSettings;
  private currentFeature: Feature | null = null;
  private featureContainer: HTMLElement | null = null;
  private placeholderEl: HTMLElement | null = null;
  private isLinked = false;

  constructor(_initialState: any, appSettings: AppSettings) {
    super();
    this.appSettings = appSettings;
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

    this._showPlaceholder(PLACEHOLDER_UNLINKED);
  }

  // ─── SignalSink implementation ────────────────────────────────────────────

  receiveSignals(signals: DriveSignal[], _meta: { sourceInstanceId: string; linkId: string | null }): void {
    for (const signal of signals) {
      if (signal.kind !== SignalKind.Feature) continue;
      const featureSignal = signal as FeatureSignal;
      // The Any view renders the CURRENT interval only. The schedule also emits a
      // next-state preview signal after each current one; ignore it here so it does
      // not clobber the current feature (an "up next" panel could opt into it).
      if (featureSignal.state === SignalState.Next) continue;
      this._handleFeatureSignal(featureSignal);
    }
  }

  setLinkStatus(status: { hasIncomingLinks: boolean; hasNextSignals?: boolean }): void {
    this.isLinked = status.hasIncomingLinks;
    if (!this.isLinked && !this.currentFeature) {
      this._showPlaceholder(PLACEHOLDER_UNLINKED);
    }
  }

  // ─── Feature display ──────────────────────────────────────────────────────

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
    const spec = getFeatureSpec(signal.featureTypeName);
    if (!descriptor && !spec) {
      console.warn(`[AnyFloatingView] Unknown feature: ${signal.categoryName}/${signal.featureTypeName}`);
      this._showPlaceholder(`Unknown feature: ${signal.featureTypeName}`);
      return;
    }

    try {
      this._hidePlaceholder();

      const availW = this.featureContainer?.clientWidth || this.container?.clientWidth || 0;
      const availH = this.featureContainer?.clientHeight || this.container?.clientHeight || 0;
      const maxCanvasHeight = availH > 0 ? availH : undefined;
      const maxWidth = availW > 0 ? availW : undefined;

      const orientation = this._autoOrientation(availW, availH);

      const settingsForFeature: AppSettings = {
        ...this.appSettings,
        instrumentSettings: {
          ...this.appSettings.instrumentSettings,
          orientation,
        } as InstrumentSettings,
      };

      if (spec) {
        const codec = (legacyCodec as any)(spec.configSpec, spec.legacyArgOrder, spec.legacyVariadicTail);
        const drivenConfig = codec.decode(signal.config ?? []);
        const resolved = resolveConfig(drivenConfig, emptyDrivenState());
        if (resolved === null) {
          this._showPlaceholder('Waiting for signal…');
          return;
        }
        const ctx: FeatureContext = {
          settings: settingsForFeature,
          constraints: { maxWidth, maxHeight: maxCanvasHeight },
        };
        this.currentFeature = (spec as any).create(resolved, ctx);
      } else {
        this.currentFeature = descriptor!.createFeature(
          signal.config,
          settingsForFeature,
          maxCanvasHeight,
          signal.categoryName
        );
      }

      const feature = this.currentFeature;
      if (this.featureContainer && feature) {
        feature.render(this.featureContainer);
        feature.views?.forEach(v => v.render(this.featureContainer!));
        feature.start?.();
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
