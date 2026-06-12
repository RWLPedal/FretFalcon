import { BaseView } from "../base_view";
import { AppSettings } from "../settings";
import { Feature, FeatureTypeDescriptor } from "../feature";
import { ConfigView } from "./config_view";
import { getDriveTargetSlots } from "../panels/drive_registry";
import { DriveSignal, SignalState, SignalSink } from "../panels/link_types";
import { setPendingRenderConstraints } from "../fretboard/fretboard_base";
import { emitEvent } from "../core/events";
import { getFeatureTypeDescriptor } from "../feature_registry";

export class ConfigurableFeatureView extends BaseView implements SignalSink {
    private appSettings: AppSettings;
    private categoryName: string;
    private featureTypeName: string;
    private initialConfig: string[] | undefined;
    private initialState: any;
    private feature: Feature | null = null;
    private configCollapsed = false;
    private _lastConfigHeight = 0;

    private configContainer!: HTMLElement;
    private featureContainer!: HTMLElement;

    private featureClass: FeatureTypeDescriptor | null = null;
    private configView: ConfigView | null = null;
    private _availableWidth = 0;
    private _availableHeight = 0;
    private drivenValues = new Map<string, string>();
    private drivenNextValues = new Map<string, string>();
    private isDrivenUpdate = false;
    private _lastFinalConfig: string[] = [];
    private _isRestoringFromSaved = false;

    constructor(initialState: any, appSettings: AppSettings) {
        super();
        this.appSettings = appSettings;
        this.initialState = initialState;
        this.categoryName = initialState?.categoryName ?? 'Instrument';
        this.featureTypeName = initialState?.featureTypeName;
        this.initialConfig = Array.isArray(initialState?.config) ? initialState.config : undefined;
    }

    render(container: HTMLElement): void {
        if (!this.featureTypeName) {
            container.innerHTML = "Error: featureTypeName not provided to ConfigurableFeatureView.";
            return;
        }

        this.container = container;
        this.container.innerHTML = '';

        this.configContainer = document.createElement('div');
        this.configContainer.classList.add('config-compact');
        this.featureContainer = document.createElement('div');

        this.container.appendChild(this.configContainer);
        this.container.appendChild(this.featureContainer);

        const FeatureClass = getFeatureTypeDescriptor(this.categoryName, this.featureTypeName);
        if (!FeatureClass) {
            this.container.innerHTML = `Error: Feature '${this.featureTypeName}' not found in category.`;
            return;
        }
        this.featureClass = FeatureClass;

        const schema = this.featureClass.getConfigurationSchema(this.appSettings);

        this.configView = new ConfigView(schema, this.configContainer, (config) => {
            this.createAndRenderFeature(config);
        });

        this.configView.render();

        if (this.initialConfig?.length) {
            this._isRestoringFromSaved = true;
            this.configView.setConfig(this.initialConfig);
            this._isRestoringFromSaved = false;
        } else {
            this.createAndRenderFeature(this.configView.currentConfig);
        }

        const savedCollapsed = this.initialState?.configCollapsed as boolean | undefined;
        const defaultCollapsed = (this.featureClass as any).defaultConfigCollapsed === true;
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
            const onEnd = (e: TransitionEvent) => {
                if (e.propertyName !== 'max-height') return;
                notify();
            };
            const fallback = setTimeout(notify, 350);
            this.configContainer.addEventListener('transitionend', onEnd);
        });

        this.listenEvent(container, 'wrapper-user-resized', ({ width, height }) => {
            this._availableHeight = Math.max(50, height);
            this._availableWidth  = Math.max(50, width);
            if (this.configView) {
                this.createAndRenderFeature(this.configView.currentConfig);
            } else {
                console.warn('[ConfigurableFeatureView] wrapper-user-resized: no configView, skipping recreate');
            }
        });

        // Allow features to push chord key updates back into the config panel.
        this.listenEvent(container, 'nt-chord-keys-update', ({ chordKeys }) => {
            this.configView?.updateChordValues('Chords', chordKeys);
        });
    }

    // ─── SignalSink implementation ────────────────────────────────────────────
    // Called directly by LinkManager instead of dispatching 'drive-signal' events.

    receiveSignals(signals: DriveSignal[], _meta: { sourceInstanceId: string; linkId: string | null }): void {
        let needsRebuild = false;
        const slots = getDriveTargetSlots(this.featureTypeName);

        for (const signal of signals) {
            const isNext = (signal.state ?? SignalState.Current) === SignalState.Next;

            for (const slot of slots) {
                if (!slot.acceptedKinds.includes(signal.kind)) continue;
                const value = slot.resolveValue(signal);
                if (value === null) continue;

                if (slot.transparent) {
                    if (!isNext) {
                        const changed = this.configView?.setTransparentValue(slot.argName, [value]);
                        if (changed) needsRebuild = true;
                    }
                } else if (isNext) {
                    if (this.drivenNextValues.get(slot.argName) === value) continue;
                    needsRebuild = true;
                    this.drivenNextValues.set(slot.argName, value);
                    this.configView?.applyDrivenNextValue(slot.argName, value);
                } else {
                    if (this.drivenValues.get(slot.argName) === value) continue;
                    needsRebuild = true;
                    this.drivenValues.set(slot.argName, value);
                    this.configView?.applyDrivenValue(slot.argName, value);
                }
            }
        }

        if (needsRebuild) {
            const currentConfig = this.configView?.currentConfig ?? [];
            this.isDrivenUpdate = true;
            this.createAndRenderFeature(currentConfig);
            this.isDrivenUpdate = false;
        }

        // Forward to featureContainer so features that self-handle drive signals
        // (e.g. MultiLayerFretboardFeature, NearbyTriadsFeature) can receive them.
        if (this.featureContainer) {
            for (const signal of signals) {
                emitEvent(this.featureContainer, 'drive-signal', { signal, linkId: _meta.linkId }, { bubbles: false });
            }
        }
    }

    setLinkStatus(status: { hasIncomingLinks: boolean; hasNextSignals?: boolean }): void {
        const { hasIncomingLinks, hasNextSignals } = status;
        const slots = getDriveTargetSlots(this.featureTypeName);
        for (const slot of slots) {
            if (slot.transparent) continue;
            this.configView?.setDrivenVisible(slot.argName, hasIncomingLinks, hasNextSignals ?? false);
            if (hasIncomingLinks) {
                this.configView?.selectDriven(slot.argName);
            }
        }
        // Forward to featureContainer for features that track link state directly.
        if (this.featureContainer) {
            emitEvent(this.featureContainer, 'link-status-changed', { hasIncomingLinks, hasNextSignals }, { bubbles: false });
        }
    }

    // ─── Feature creation ─────────────────────────────────────────────────────

    private buildDrivenConfig(rawConfig: (string | null)[]): string[] {
        const schema = this.featureClass?.getConfigurationSchema() as any;
        const schemaArgs: any[] = schema?.args ?? [];
        const posToArgName: string[] = [];
        let pos = 0;
        for (const arg of schemaArgs) {
            if (arg.isVariadic) {
                for (let i = pos; i < rawConfig.length; i++) posToArgName[i] = arg.name;
                break;
            } else {
                posToArgName[pos++] = arg.name;
            }
        }
        let anyUnresolved = false;
        const mapped = rawConfig.map((v, i) => {
            if (v !== 'driven' && v !== 'driven_next') return v;
            const argName = posToArgName[i];
            const isNext = v === 'driven_next';
            const valueMap = isNext ? this.drivenNextValues : this.drivenValues;
            const driven = argName !== undefined ? valueMap.get(argName) : undefined;
            if (driven === undefined) { anyUnresolved = true; return null; }
            return driven;
        });
        if (anyUnresolved) return [];
        return mapped.filter(v => v !== null) as string[];
    }

    private createAndRenderFeature(config: (string | null)[]) {
        if (!this.featureClass) { return; }

        const hasDrivenSentinel = config.some(c => c === 'driven' || c === 'driven_next');
        let finalConfig = (this.isDrivenUpdate || hasDrivenSentinel)
            ? this.buildDrivenConfig(config)
            : config.filter(c => c !== null && c !== 'driven') as string[];
        if (!this.isDrivenUpdate && hasDrivenSentinel && finalConfig.length === 0 && this._lastFinalConfig.length > 0) {
            finalConfig = [...this._lastFinalConfig];
        }
        const titleFn = (this.featureClass as any).getTitle;
        if (typeof titleFn === 'function') {
            const partialTitle = titleFn(finalConfig) as string | null;
            if (partialTitle) {
                emitEvent(this.featureContainer, 'feature-title-changed', { title: partialTitle });
            }
        }

        const isFirstRender = !this.feature && !this._isRestoringFromSaved;

        const requiredArgs = (typeof this.featureClass.getConfigurationSchema() !== 'string')
            ? (this.featureClass.getConfigurationSchema() as any).args.filter((a: any) => a.required).length
            : 0;

        if (finalConfig.length < requiredArgs) {
            return;
        }

        this.feature?.destroy?.();
        this.featureContainer.innerHTML = '';

        let maxCanvasHeight: number | undefined;
        if (this._availableHeight > 0) {
            const paddingV = this.container
                ? ((parseFloat(getComputedStyle(this.container).paddingTop) || 0) +
                   (parseFloat(getComputedStyle(this.container).paddingBottom) || 0))
                : 10;
            const configH = this.configContainer
                ? (this.configContainer.offsetHeight +
                   (parseFloat(getComputedStyle(this.configContainer).marginBottom) || 0))
                : 0;
            maxCanvasHeight = Math.max(50, this._availableHeight - configH - paddingV);
        }

        if (this._availableWidth > 0) {
            const paddingH = this.container
                ? ((parseFloat(getComputedStyle(this.container).paddingLeft) || 0) +
                   (parseFloat(getComputedStyle(this.container).paddingRight) || 0))
                : 10;
            const maxWidth = Math.max(50, this._availableWidth - paddingH);
            setPendingRenderConstraints({ maxWidth });
        }

        try {
            this.feature = this.featureClass.createFeature(
                finalConfig,
                this.appSettings,
                maxCanvasHeight,
                this.categoryName
            );
            this._lastFinalConfig = finalConfig;

            this.feature.render(this.featureContainer);
            this.feature.views?.forEach(view => view.render(this.featureContainer));

            const mainTitleEl = this.featureContainer.querySelector<HTMLElement>('.feature-main-title');
            if (mainTitleEl?.textContent) {
                emitEvent(this.featureContainer, 'feature-title-changed', { title: mainTitleEl.textContent });
            }

            if (isFirstRender && this._availableWidth === 0) {
                emitEvent(this.featureContainer, 'feature-auto-size', {});
            }

            if (!this.isDrivenUpdate) {
                emitEvent(this.featureContainer, 'feature-state-changed', {
                    featureTypeName: this.featureTypeName,
                    config: finalConfig,
                });
            }
        } catch (error) {
            this.featureContainer.innerHTML = `<p>Error creating feature: ${error instanceof Error ? error.message : String(error)}</p>`;
            console.error(error);
        }
    }

    destroy(): void {
        this.feature?.destroy?.();
        if (this.container) {
          this.container.innerHTML = "";
        }
        super.destroy();
    }

    start(): void {
        this.feature?.start?.();
    }

    stop(): void {
        this.feature?.stop?.();
    }
}
