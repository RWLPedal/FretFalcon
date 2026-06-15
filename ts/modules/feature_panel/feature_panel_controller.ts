// ts/modules/feature_panel/feature_panel_controller.ts
// Replaces ts/views/configurable_feature_view.ts.
// Uses FormBuilder + DrivenConfig for all registered FeatureSpec features.

import { BaseView } from '../../core/base_view';
import { AppSettings } from '../../settings';
import { Feature, FeatureSpec, FeatureContext } from '../../feature';
import { emitEvent } from '../../core/events';
import { DriveSignal, SignalKind, SignalState, SignalSink } from '../../panels/link_types';
import { getFeatureSpec } from '../../core/config/feature_spec_registry';
import { FormBuilder } from '../../core/config/form_builder';
import { resolveConfig } from '../../core/config/resolve';
import { defaultDrivenConfig, emptyDrivenState, DrivenState, DrivenConfig } from '../../core/config/spec';
import { legacyCodec } from '../../core/config/codec';

export class FeaturePanelController extends BaseView implements SignalSink {
  private readonly appSettings: AppSettings;
  private readonly categoryName: string;
  private readonly featureTypeName: string;
  private readonly initialState: any;

  private feature: Feature | null = null;
  private configCollapsed = false;
  private _lastConfigHeight = 0;
  private configContainer!: HTMLElement;
  private featureContainer!: HTMLElement;
  private _availableWidth = 0;
  private _availableHeight = 0;

  private spec: FeatureSpec<unknown> | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private formBuilder: FormBuilder<any> | null = null;
  private drivenConfig: DrivenConfig<unknown> | null = null;
  private drivenState: DrivenState = emptyDrivenState();
  private lastResolvedConfig: unknown | null = null;
  // Capo fret from a linked Capo source (0 = no capo). Not a config field — it's transient
  // and re-applied on every feature rebuild via buildFeatureContext().
  private currentCapo = 0;

  constructor(initialState: any, appSettings: AppSettings) {
    super();
    this.appSettings = appSettings;
    this.initialState = initialState;
    this.categoryName = initialState?.categoryName ?? 'Instrument';
    this.featureTypeName = initialState?.featureTypeName;
  }

  render(container: HTMLElement): void {
    if (!this.featureTypeName) {
      container.innerHTML = 'Error: featureTypeName not provided to FeaturePanelController.';
      return;
    }

    this.container = container;
    container.innerHTML = '';

    this.configContainer = document.createElement('div');
    this.configContainer.classList.add('config-compact');
    this.featureContainer = document.createElement('div');
    container.appendChild(this.configContainer);
    container.appendChild(this.featureContainer);

    this.spec = getFeatureSpec(this.featureTypeName) ?? null;
    if (this.spec) {
      this.renderNewPath();
    } else {
      container.innerHTML = `Error: No FeatureSpec registered for '${this.featureTypeName}'.`;
      return;
    }

    const savedCollapsed = this.initialState?.configCollapsed as boolean | undefined;
    const defaultCollapsed = this.spec?.defaultConfigCollapsed ?? false;
    this.configCollapsed = savedCollapsed !== undefined ? savedCollapsed : defaultCollapsed;
    if (this.configCollapsed) {
      this.configContainer.style.transition = 'none';
      this.configContainer.classList.add('is-collapsed');
      void this.configContainer.offsetHeight;
      this.configContainer.style.transition = '';
    }
    emitEvent(container, 'config-collapse-changed', { collapsed: this.configCollapsed, isInitial: true });

    this.listen(container, 'config-visibility-toggle', () => {
      const collapsing = !this.configCollapsed;
      if (collapsing) {
        const mb = parseFloat(getComputedStyle(this.configContainer).marginBottom) || 0;
        this._lastConfigHeight = this.configContainer.offsetHeight + mb;
      }
      this.configCollapsed = collapsing;
      this.configContainer.classList.toggle('is-collapsed', this.configCollapsed);
      emitEvent(container, 'feature-state-changed', { configCollapsed: this.configCollapsed });
      let settled = false;
      const notify = () => {
        if (settled) return;
        settled = true;
        clearTimeout(fallback);
        this.configContainer.removeEventListener('transitionend', onEnd);
        if (!this.configCollapsed) {
          const mb = parseFloat(getComputedStyle(this.configContainer).marginBottom) || 0;
          this._lastConfigHeight = this.configContainer.offsetHeight + mb;
        }
        const delta = this.configCollapsed ? -this._lastConfigHeight : this._lastConfigHeight;
        emitEvent(container, 'config-collapse-changed', { collapsed: this.configCollapsed, delta, isInitial: false });
      };
      const onEnd = (e: TransitionEvent) => { if (e.propertyName !== 'max-height') return; notify(); };
      const fallback = setTimeout(notify, 350);
      this.configContainer.addEventListener('transitionend', onEnd);
    });

    this.listenEvent(container, 'wrapper-user-resized', ({ width, height }) => {
      if (width > 0)  this._availableWidth  = width;
      if (height > 0) this._availableHeight = height;
      this.rebuildFeatureNew();
    });
  }

  // ─── SignalSink ─────────────────────────────────────────────────────────────

  receiveSignals(signals: DriveSignal[], meta: { sourceInstanceId: string; linkId: string | null }): void {
    this.receiveSignalsNew(signals, meta);
  }

  setLinkStatus(status: { hasIncomingLinks: boolean; hasNextSignals?: boolean; incomingKinds?: SignalKind[] }): void {
    this.setLinkStatusNew(status);
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  start(): void { this.feature?.start?.(); }
  stop():  void { this.feature?.stop?.(); }

  destroy(): void {
    this.feature?.destroy?.();
    if (this.container) this.container.innerHTML = '';
    super.destroy();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW PATH — FeatureSpec
  // ═══════════════════════════════════════════════════════════════════════════

  private renderNewPath(): void {
    const spec = this.spec!;
    const codec = makeCodec(spec);
    const savedConfig = Array.isArray(this.initialState?.config) ? this.initialState.config as string[] : null;
    this.drivenConfig = savedConfig ? codec.decode(savedConfig) : defaultDrivenConfig(spec.configSpec as any);

    this.formBuilder = new FormBuilder({
      spec: spec.configSpec as any,
      initialConfig: this.drivenConfig,
      onChange: (newConfig) => {
        this.drivenConfig = newConfig;
        this.rebuildFeatureNew();
      },
      appSettings: this.appSettings,
    });
    this.formBuilder.render(this.configContainer);
    this.rebuildFeatureNew();
  }

  private rebuildFeatureNew(): void {
    if (!this.spec || !this.drivenConfig) return;
    const resolved = resolveConfig(this.drivenConfig, this.drivenState);
    if (resolved === null) {
      return;
    }

    const titleStr = this.spec.title?.(resolved as Partial<unknown>);
    if (titleStr) emitEvent(this.featureContainer, 'feature-title-changed', { title: titleStr });

    const ctx = this.buildFeatureContext();
    this.feature?.destroy?.();
    this.featureContainer.innerHTML = '';
    try {
      this.feature = (this.spec as FeatureSpec<any>).create(resolved, ctx);
      this.lastResolvedConfig = resolved;
      this.feature.render(this.featureContainer);
      this.feature.views?.forEach(v => v.render(this.featureContainer));

      const mainTitleEl = this.featureContainer.querySelector<HTMLElement>('.feature-main-title');
      if (mainTitleEl?.textContent) {
        emitEvent(this.featureContainer, 'feature-title-changed', { title: mainTitleEl.textContent });
      }

      if (this._availableWidth === 0 && !this.lastResolvedConfig) {
        emitEvent(this.featureContainer, 'feature-auto-size', {});
      }

      const codec = makeCodec(this.spec);
      const literalConfig: DrivenConfig<unknown> = {} as any;
      for (const k of Object.keys(resolved as object)) {
        (literalConfig as any)[k] = { mode: 'literal', value: (resolved as any)[k] };
      }
      const encodedConfig = codec.encode(literalConfig);
      emitEvent(this.featureContainer, 'feature-state-changed', {
        featureTypeName: this.featureTypeName,
        config: encodedConfig,
      });
    } catch (err) {
      this.featureContainer.innerHTML = `<p>Error creating feature: ${err instanceof Error ? err.message : String(err)}</p>`;
      console.error(err);
    }
  }

  private receiveSignalsNew(signals: DriveSignal[], meta: { sourceInstanceId: string; linkId: string | null }): void {
    if (!this.spec || !this.drivenConfig) return;
    let needsRebuild = false;
    const specKeys = Object.keys(this.spec.configSpec) as string[];

    for (const signal of signals) {
      const isNext = (signal.state ?? SignalState.Current) === SignalState.Next;

      // Capo isn't a config field; track it on the controller so it survives feature
      // rebuilds and gets re-applied via buildFeatureContext().
      if (signal.kind === SignalKind.Capo) {
        if (!isNext && this.currentCapo !== signal.fret) {
          this.currentCapo = signal.fret;
          needsRebuild = true;
        }
        continue;
      }

      for (const key of specKeys) {
        const field = (this.spec.configSpec as any)[key];
        if (!field.drivable) continue;
        if (!field.drivable.kinds.includes(signal.kind)) continue;
        const value = field.drivable.fromSignal(signal);
        if (value === undefined) continue;

        if (field.drivable.transparent) {
          if (!isNext) {
            const values = Array.isArray(value) ? (value as string[]) : [value as string];
            const changed = this.formBuilder?.setTransparentValue(key as any, values);
            if (changed) needsRebuild = true;
          }
        } else if (isNext) {
          if (this.drivenState.next.get(key) === value) continue;
          this.drivenState.next.set(key, value);
          this.formBuilder?.applyDrivenNextValue(key as any, value);
          needsRebuild = true;
        } else {
          if (this.drivenState.current.get(key) === value) continue;
          this.drivenState.current.set(key, value);
          this.formBuilder?.applyDrivenValue(key as any, value);
          needsRebuild = true;
        }
      }
    }

    if (needsRebuild) this.rebuildFeatureNew();

    if (this.featureContainer) {
      for (const signal of signals) {
        emitEvent(this.featureContainer, 'drive-signal', { signal, linkId: meta.linkId ?? '' }, { bubbles: false });
      }
    }
  }

  private setLinkStatusNew(status: { hasIncomingLinks: boolean; hasNextSignals?: boolean; incomingKinds?: SignalKind[] }): void {
    if (!this.spec) return;
    const { hasIncomingLinks, hasNextSignals, incomingKinds } = status;
    let kinds = new Set(
      Object.values(this.spec.configSpec as any)
        .flatMap((f: any) => f.drivable?.kinds ?? []) as SignalKind[]
    );
    // Only auto-follow fields whose drivable kinds are actually carried by an incoming link.
    // Without this, a Capo-only link would flip Root/Mode to "driven" with no value to resolve,
    // leaving resolveConfig() stuck at null and the feature frozen.
    if (incomingKinds) {
      const carried = new Set(incomingKinds);
      kinds = new Set([...kinds].filter(k => carried.has(k)));
    }
    this.formBuilder?.setLinkStatus(hasIncomingLinks, hasNextSignals ?? false, kinds);

    // Drop the capo when no incoming link carries Capo any more (e.g. the Capo link was removed).
    if (incomingKinds && this.currentCapo > 0 && !incomingKinds.includes(SignalKind.Capo)) {
      this.currentCapo = 0;
      this.rebuildFeatureNew();
    }

    if (this.featureContainer) {
      emitEvent(this.featureContainer, 'link-status-changed', { hasIncomingLinks, hasNextSignals }, { bubbles: false });
    }
  }

  // ─── Shared helpers ─────────────────────────────────────────────────────────

  private buildFeatureContext(): FeatureContext {
    let maxWidth: number | undefined;
    let maxHeight: number | undefined;

    if (this._availableWidth > 0) {
      const paddingH = this.container
        ? (parseFloat(getComputedStyle(this.container).paddingLeft) || 0) +
          (parseFloat(getComputedStyle(this.container).paddingRight) || 0)
        : 10;
      maxWidth = Math.max(50, this._availableWidth - paddingH);
    }

    if (this._availableHeight > 0) {
      const paddingV = this.container
        ? (parseFloat(getComputedStyle(this.container).paddingTop) || 0) +
          (parseFloat(getComputedStyle(this.container).paddingBottom) || 0)
        : 10;
      const configH = this.configContainer
        ? this.configContainer.offsetHeight +
          (parseFloat(getComputedStyle(this.configContainer).marginBottom) || 0)
        : 0;
      maxHeight = Math.max(50, this._availableHeight - configH - paddingV);
    }

    return { settings: this.appSettings, constraints: { maxWidth, maxHeight }, capo: this.currentCapo };
  }
}

function makeCodec(spec: FeatureSpec<unknown>) {
  return (legacyCodec as any)(spec.configSpec, spec.legacyArgOrder, spec.legacyVariadicTail) as {
    encode(c: DrivenConfig<unknown>): string[];
    decode(raw: ReadonlyArray<string>): DrivenConfig<unknown>;
  };
}
