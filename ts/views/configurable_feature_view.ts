import { BaseView } from "../base_view";
import { AppSettings } from "../settings";
import { instrumentCategory } from "../fretboard/fretboard_category";
import { Feature, FeatureTypeDescriptor } from "../feature";
import { ConfigView } from "./config_view";
import { AudioController } from "../audio_controller";
import { InstrumentIntervalSettings } from "../fretboard/fretboard_interval_settings";
import { getDriveTargetSlots } from "../panels/drive_registry";
import { DriveSignal, SignalState } from "../panels/link_types";
import { setPendingRenderConstraints } from "../fretboard/fretboard_base";

export class ConfigurableFeatureView extends BaseView {
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
    private audioController: AudioController;

    // Exposed for signal handling
    private configView: ConfigView | null = null;
    // Available canvas space (px) measured from the last user-initiated wrapper resize.
    private _availableWidth = 0;
    private _availableHeight = 0;
    // Last received driven values per argName (used to substitute "driven" sentinel)
    private drivenValues = new Map<string, string>();
    // Last received next-state driven values per argName (used to substitute "driven_next" sentinel)
    private drivenNextValues = new Map<string, string>();
    // When true, createAndRenderFeature emits feature-state-drive instead of feature-state-changed
    private isDrivenUpdate = false;
    // Suppresses feature-auto-size during saved-state restore so user's saved size is preserved
    private _isRestoringFromSaved = false;

    constructor(initialState: any, appSettings: AppSettings) {
        super();
        this.appSettings = appSettings;
        this.initialState = initialState;
        this.categoryName = initialState?.categoryName ?? 'Instrument';
        this.featureTypeName = initialState?.featureTypeName;
        this.initialConfig = Array.isArray(initialState?.config) ? initialState.config : undefined;

        // A better solution for audio would be needed in a real app
        this.audioController = new AudioController(null, null, null, null);
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

        const FeatureClass = instrumentCategory.getFeatureTypes().get(this.featureTypeName);
        if (!FeatureClass) {
            this.container.innerHTML = `Error: Feature '${this.featureTypeName}' not found in category.`;
            return;
        }
        this.featureClass = FeatureClass;

        const schema = this.featureClass.getConfigurationSchema();

        this.configView = new ConfigView(schema, this.configContainer, (config) => {
            this.createAndRenderFeature(config);
        });

        this.configView.render();

        if (this.initialConfig?.length) {
            // Restore saved config — setConfig fires the callback which creates the feature.
            this._isRestoringFromSaved = true;
            this.configView.setConfig(this.initialConfig);
            this._isRestoringFromSaved = false;
        } else {
            this.createAndRenderFeature(this.configView.currentConfig);
        }

        // Apply initial config collapse state (saved > feature default > false).
        const savedCollapsed = this.initialState?.configCollapsed as boolean | undefined;
        const defaultCollapsed = (this.featureClass as any).defaultConfigCollapsed === true;
        this.configCollapsed = savedCollapsed !== undefined ? savedCollapsed : defaultCollapsed;
        if (this.configCollapsed) {
            // Suppress the CSS transition so the initial state is instant (no flash on
            // theme change / rotate / zoom which all recreate the view from scratch).
            this.configContainer.style.transition = 'none';
            this.configContainer.classList.add('is-collapsed');
            // Force a reflow to commit the above before re-enabling transitions.
            void this.configContainer.offsetHeight;
            this.configContainer.style.transition = '';
        }
        // Notify wrapper of the initial state so the button reflects it.
        container.dispatchEvent(new CustomEvent('config-collapse-changed', {
            bubbles: true,
            detail: { collapsed: this.configCollapsed, isInitial: true },
        }));

        // Handle user-triggered config toggle from the title-bar button.
        this.listen(container, 'config-visibility-toggle', () => {
            const collapsing = !this.configCollapsed;

            if (collapsing) {
                // Measure BEFORE the class is applied so we have the real rendered height.
                const mb = parseFloat(getComputedStyle(this.configContainer).marginBottom) || 0;
                this._lastConfigHeight = this.configContainer.offsetHeight + mb;
            }

            this.configCollapsed = collapsing;
            this.configContainer.classList.toggle('is-collapsed', this.configCollapsed);

            // Persist the new state via the standard save channel.
            container.dispatchEvent(new CustomEvent('feature-state-changed', {
                bubbles: true,
                detail: { configCollapsed: this.configCollapsed },
            }));

            // After the CSS transition completes, tell the wrapper to resize.
            // A setTimeout fallback guards against transitionend not firing.
            let settled = false;
            const notify = () => {
                if (settled) return;
                settled = true;
                clearTimeout(fallback);
                this.configContainer.removeEventListener('transitionend', onEnd);

                if (!this.configCollapsed) {
                    // Expanding: measure actual height now that transition is done.
                    const mb = parseFloat(getComputedStyle(this.configContainer).marginBottom) || 0;
                    this._lastConfigHeight = this.configContainer.offsetHeight + mb;
                }

                const delta = this.configCollapsed ? -this._lastConfigHeight : this._lastConfigHeight;
                container.dispatchEvent(new CustomEvent('config-collapse-changed', {
                    bubbles: true,
                    detail: { collapsed: this.configCollapsed, delta, isInitial: false },
                }));
            };
            const onEnd = (e: TransitionEvent) => {
                if (e.propertyName !== 'max-height') return;
                notify();
            };
            const fallback = setTimeout(notify, 350);
            this.configContainer.addEventListener('transitionend', onEnd);
        });

        // Rescale canvases when the user manually resizes the floating wrapper.
        this.listen(container, 'wrapper-user-resized', (e: Event) => {
            const { width, height } = (e as CustomEvent<{ width: number; height: number }>).detail;
            this._availableHeight = Math.max(50, height);
            this._availableWidth  = Math.max(50, width);
            if (this.configView) {
                this.createAndRenderFeature(this.configView.currentConfig);
            }
        });

        // React to incoming link notifications — show/hide "Driven" / "Driven (Next)" options
        this.listen(container, 'link-status-changed', (e: Event) => {
            const { hasIncomingLinks, hasNextSignals } = (e as CustomEvent<{ hasIncomingLinks: boolean; hasNextSignals?: boolean }>).detail;
            const slots = getDriveTargetSlots(this.featureTypeName);
            for (const slot of slots) {
                if (slot.transparent) continue; // transparent slots update silently, no UI affordance
                this.configView?.setDrivenVisible(slot.argName, hasIncomingLinks, hasNextSignals ?? false);
                // Auto-select "Driven" for simple select args (not layer_list) when a link arrives.
                // selectDriven no-ops if the arg isn't a select or is already driven.
                if (hasIncomingLinks) {
                    this.configView?.selectDriven(slot.argName);
                }
            }
        });

        // React to incoming drive signals
        this.listen(container, 'drive-signal', (e: Event) => {
            const detail = (e as CustomEvent<{ signal: DriveSignal; linkId: string }>).detail;
            const { signal } = detail;
            const isNext = (signal.state ?? SignalState.Current) === SignalState.Next;
            const slots = getDriveTargetSlots(this.featureTypeName);
            let needsRebuild = false;

            for (const slot of slots) {
                if (!slot.acceptedKinds.includes(signal.kind)) continue;
                const value = slot.resolveValue(signal);
                if (value === null) continue;

                if (slot.transparent) {
                    // Transparent slots update the toggle UI directly — only for current signals.
                    if (!isNext) {
                        const changed = this.configView?.setTransparentValue(slot.argName, [value]);
                        if (changed) needsRebuild = true;
                    }
                } else if (isNext) {
                    // Next-state: update drivenNextValues and reflect in UI if "driven_next" is selected.
                    if (this.drivenNextValues.get(slot.argName) === value) continue;
                    needsRebuild = true;
                    this.drivenNextValues.set(slot.argName, value);
                    this.configView?.applyDrivenNextValue(slot.argName, value);
                } else {
                    // Current-state: skip rebuild if the value hasn't changed.
                    if (this.drivenValues.get(slot.argName) === value) continue;
                    needsRebuild = true;
                    this.drivenValues.set(slot.argName, value);
                    this.configView?.applyDrivenValue(slot.argName, value);
                }
            }

            if (needsRebuild) {
                const currentConfig = this.configView?.currentConfig ?? [];
                this.isDrivenUpdate = true;
                this.createAndRenderFeature(currentConfig);
                this.isDrivenUpdate = false;
            }

            // Forward to featureContainer so features that self-handle drive signals
            // (e.g. MultiLayerFretboardFeature, AnyFeature) can receive the event —
            // the event was dispatched on this container (parent) and does not bubble down.
            this.featureContainer?.dispatchEvent(new CustomEvent('drive-signal', {
                bubbles: false,
                detail,
            }));
        });

        // Forward link-status-changed to featureContainer so features that track link
        // state directly (e.g. AnyFeature) can react — events bubble up, not down.
        this.listen(container, 'link-status-changed', (e: Event) => {
            this.featureContainer?.dispatchEvent(new CustomEvent('link-status-changed', {
                bubbles: false,
                detail: (e as CustomEvent).detail,
            }));
        });
    }

    private buildDrivenConfig(rawConfig: (string | null)[]): string[] {
        // Build position → argName map from the schema so each "driven" slot gets
        // the correct driven value instead of always resolving to the first slot's value.
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
        // If any driven sentinel has no value yet, return empty so the requiredArgs
        // check in createAndRenderFeature silently skips creation until signal arrives.
        if (anyUnresolved) return [];
        return mapped.filter(v => v !== null) as string[];
    }

    private createAndRenderFeature(config: (string | null)[]) {
        if (!this.featureClass) return;

        // Substitute "driven" / "driven_next" sentinels with the last known driven values.
        // Also use buildDrivenConfig for user-triggered rebuilds when sentinels are
        // present so that variadic args (e.g. CAGED shape buttons) are not discarded.
        const hasDrivenSentinel = config.some(c => c === 'driven' || c === 'driven_next');
        const finalConfig = (this.isDrivenUpdate || hasDrivenSentinel)
            ? this.buildDrivenConfig(config)
            : config.filter(c => c !== null && c !== 'driven') as string[];

        // Dispatch a partial/full title for features that implement getTitle, even before
        // the feature can fully render (e.g. only root note selected, no quality yet).
        const titleFn = (this.featureClass as any).getTitle;
        if (typeof titleFn === 'function') {
            const partialTitle = titleFn(finalConfig) as string | null;
            if (partialTitle) {
                this.featureContainer.dispatchEvent(new CustomEvent<{ title: string }>('feature-title-changed', {
                    bubbles: true,
                    detail: { title: partialTitle },
                }));
            }
        }

        // True only on the very first successful render (feature was null and not a restore).
        const isFirstRender = !this.feature && !this._isRestoringFromSaved;

        // A bit of a hack: some features expect a minimum number of args.
        // We check the schema for required args to guess.
        const requiredArgs = (typeof this.featureClass.getConfigurationSchema() !== 'string')
            ? (this.featureClass.getConfigurationSchema() as any).args.filter((a: any) => a.required).length
            : 0;

        if (finalConfig.length < requiredArgs) {
            return; // Not enough config to create feature yet
        }

        // Clean up previous feature
        this.feature?.destroy?.();
        this.featureContainer.innerHTML = '';

        // On user resize (_availableHeight > 0), pass a tight height constraint so the
        // canvas doesn't overflow the wrapper. Subtract the config section height because
        // the canvas lives below it inside featureContainer.
        // On initial load (_availableHeight === 0), pass undefined so FretboardConfig uses
        // its own default — _autoSizeToContent then grows the wrapper to fit.
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

        // Subtract horizontal padding of the content element so the canvas width
        // constraint reflects actual drawable space, not the padded container width.
        if (this._availableWidth > 0) {
            const paddingH = this.container
                ? ((parseFloat(getComputedStyle(this.container).paddingLeft) || 0) +
                   (parseFloat(getComputedStyle(this.container).paddingRight) || 0))
                : 10;
            setPendingRenderConstraints({ maxWidth: Math.max(50, this._availableWidth - paddingH) });
        }

        try {
            const intervalSettings = new InstrumentIntervalSettings(); // Placeholder
            this.feature = this.featureClass.createFeature(
                finalConfig,
                this.audioController,
                this.appSettings,
                intervalSettings,
                maxCanvasHeight,
                this.categoryName
            );

            this.feature.render(this.featureContainer);
            this.feature.views?.forEach(view => view.render(this.featureContainer));

            // Notify the FloatingViewWrapper of the current feature title
            const mainTitleEl = this.featureContainer.querySelector<HTMLElement>('.feature-main-title');
            if (mainTitleEl?.textContent) {
                this.featureContainer.dispatchEvent(new CustomEvent<{ title: string }>('feature-title-changed', {
                    bubbles: true,
                    detail: { title: mainTitleEl.textContent },
                }));
            }

            // Auto-size the wrapper the first time a feature renders (tile was empty before).
            if (isFirstRender) {
                this.featureContainer.dispatchEvent(new CustomEvent('feature-auto-size', { bubbles: true }));
            }

            // Persist current config (skip during driven real-time updates to avoid flooding localStorage)
            const eventName = this.isDrivenUpdate ? 'feature-state-drive' : 'feature-state-changed';
            this.featureContainer.dispatchEvent(new CustomEvent(eventName, {
                bubbles: true,
                detail: { featureTypeName: this.featureTypeName, config: finalConfig },
            }));
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
