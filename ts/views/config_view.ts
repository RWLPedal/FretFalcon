import { ConfigurationSchema, ConfigurationSchemaArg, ArgType, UiComponentType, LabelValue } from "../feature";
import { createLayerListInput, extractLayerListValues } from "../fretboard/features/layer_list_ui";
import { ChordEntryPanel, ChordEntry, entryDisplayLabel } from "../fretboard/features/chord_entry_panel";
import { DiatonicMode } from "../fretboard/music_types";

export type ConfigChangeCallback = (config: (string | null)[]) => void;

/** Renders a compact configuration UI for a feature schema inside a floating view. */
export class ConfigView {
    private schema: ConfigurationSchema;
    private container: HTMLElement;
    private callback: ConfigChangeCallback;

    // Values keyed by schema arg index.
    // Non-variadic args: string | null.  Variadic (toggle) args: string[].
    private argValues: Map<number, string | string[] | null> = new Map();
    // Containers for layer_list args — values extracted from DOM at read time.
    private layerListContainers: Map<number, HTMLElement> = new Map();
    // Containers for chord_entry_widget args — values stored via hooks.
    private chordEntryContainers: Map<number, HTMLElement> = new Map();
    // Tracks whether any LayerList arg is currently in linked/driven state.
    private _isLinked = false;
    private _hasNextSignals = false;

    constructor(schema: ConfigurationSchema, container: HTMLElement, callback: ConfigChangeCallback) {
        this.schema = schema;
        this.container = container;
        this.callback = callback;
    }

    /** Flat config consumed by ConfigurableFeatureView (accessed as configView['currentConfig']). */
    get currentConfig(): (string | null)[] {
        return this.buildFlatConfig();
    }

    /**
     * Applies a saved flat config array to the current UI state and fires the change callback.
     * Must be called after render(). Variadic args consume all remaining config values.
     */
    public setConfig(config: string[]): void {
        if (typeof this.schema === 'string' || config.length === 0) return;

        let configIndex = 0;
        this.schema.args.forEach((arg, argIndex) => {
            if (arg.uiComponentType === UiComponentType.Checkbox || arg.uiComponentType === UiComponentType.Ellipsis) return;
            if (arg.uiComponentType === UiComponentType.LayerList) {
                // LayerList is variadic — consume all remaining config values and repopulate
                // the list so saved layers survive zoom, rotate, and page refresh.
                const layerValues = config.slice(configIndex);
                configIndex = config.length;
                const listEl = this.layerListContainers.get(argIndex);
                if (listEl && layerValues.length > 0) {
                    listEl.innerHTML = '';
                    createLayerListInput(listEl, arg, layerValues, () => this.notifyChange());
                    if (this._isLinked) {
                        const fn = (listEl as any)._setLinked;
                        if (typeof fn === 'function') fn(true, false, this._hasNextSignals);
                    }
                }
                return;
            }
            if (configIndex >= config.length) return;

            if (arg.isVariadic && arg.uiComponentType === UiComponentType.ToggleButtonSelector) {
                // Toggle-button variadic: consume all remaining values
                const values = config.slice(configIndex);
                configIndex = config.length;
                const control = this.container.querySelector<HTMLElement>(
                    `[data-arg-index="${argIndex}"] .control`
                );
                const btns = control
                    ? Array.from(control.querySelectorAll<HTMLButtonElement>('button[data-value]'))
                    : [];
                // Resolve incoming values to button dataset.value. If a value doesn't match
                // any button's value directly, try matching by innerText (label) to handle
                // legacy configs that stored Roman numeral strings instead of degree indices.
                const resolvedValues = values.map(v => {
                    if (btns.some(b => b.dataset.value === v)) return v;
                    const byLabel = btns.find(b => b.innerText === v);
                    return byLabel?.dataset.value ?? v;
                });
                this.argValues.set(argIndex, resolvedValues);
                btns.forEach(btn => {
                    btn.classList.toggle('is-active', resolvedValues.includes(btn.dataset.value ?? ''));
                });
            } else if (arg.isVariadic && arg.uiComponentType === UiComponentType.ChordEntryWidget) {
                // Chord-entry widget variadic: consume all remaining values
                const values = config.slice(configIndex);
                configIndex = config.length;
                const container = this.chordEntryContainers.get(argIndex);
                const fn = (container as any)?._setValues as ((vals: string[]) => void) | undefined;
                if (fn) fn(values);
                else this.argValues.set(argIndex, values);
            } else {
                // Non-variadic enum, or variadic enum rendered as a single <select>:
                // consume exactly one value and update the select/toggle element.
                const val = config[configIndex++];
                this.argValues.set(argIndex, val);
                const select = this.container.querySelector<HTMLSelectElement>(
                    `select[data-arg-name="${arg.name}"]`
                );
                if (select && val !== undefined) select.value = val;
                // Sync Toggle checkbox if present
                const cb = this.container.querySelector<HTMLInputElement>(
                    `input[type="checkbox"][data-arg-name="${arg.name}"]`
                );
                if (cb && val !== undefined) cb.checked = val === 'true';
            }
        });

        this.notifyChange();
    }

    private buildFlatConfig(): (string | null)[] {
        if (typeof this.schema === 'string') return [];
        const result: (string | null)[] = [];
        this.schema.args.forEach((arg, index) => {
            // Checkboxes are purely UI-only; ellipsis (guitar settings) is handled externally.
            if (arg.uiComponentType === UiComponentType.Checkbox || arg.uiComponentType === UiComponentType.Ellipsis) return;
            if (arg.uiComponentType === UiComponentType.LayerList) {
                const listContainer = this.layerListContainers.get(index);
                if (listContainer) {
                    extractLayerListValues(listContainer).forEach(v => result.push(v));
                }
                return;
            }
            const val = this.argValues.get(index) ?? null;
            if (arg.isVariadic) {
                const arr = Array.isArray(val) ? val : (val !== null ? [val as string] : []);
                arr.forEach(v => result.push(v));
            } else {
                result.push(val as string | null);
            }
        });
        return result;
    }

    private notifyChange(): void {
        this.callback(this.buildFlatConfig());
    }

    /** Updates a ChordEntryWidget arg's values and triggers a config change notification. */
    public updateChordValues(argName: string, values: string[]): void {
        if (typeof this.schema === 'string') return;
        const argIndex = this.schema.args.findIndex(a => a.name === argName);
        if (argIndex === -1) return;
        const container = this.chordEntryContainers.get(argIndex);
        if (container) {
            const fn = (container as any)._setValues as ((vals: string[]) => void) | undefined;
            if (fn) fn(values);
            else this.argValues.set(argIndex, values);
        } else {
            this.argValues.set(argIndex, values);
        }
        this.notifyChange();
    }

    /**
     * Shows or hides "⟳ Driven" (and optionally "⟳ Driven (Next)") sentinel options in the
     * named arg's select element. Pass hasNext=true when the connected source emits next signals.
     */
    public setDrivenVisible(argName: string, visible: boolean, hasNext = false): void {
        const select = this.container.querySelector<HTMLSelectElement>(`select[data-arg-name="${argName}"]`);
        if (select) {
            const existingCurrent = select.querySelector<HTMLOptionElement>('option[value="driven"]');
            const existingNext    = select.querySelector<HTMLOptionElement>('option[value="driven_next"]');
            if (visible) {
                // Insert "⟳ Driven" at top if not present
                if (!existingCurrent) {
                    const opt = document.createElement('option');
                    opt.value = 'driven';
                    opt.text = '⟳ Driven';
                    opt.style.fontStyle = 'italic';
                    select.insertBefore(opt, select.firstChild);
                }
                // Insert "⟳ Driven (Next)" directly after "⟳ Driven" if source supports it
                if (hasNext && !existingNext) {
                    const optNext = document.createElement('option');
                    optNext.value = 'driven_next';
                    optNext.text = '⟳ Driven (Next)';
                    optNext.style.fontStyle = 'italic';
                    const afterCurrent = select.querySelector<HTMLOptionElement>('option[value="driven"]');
                    if (afterCurrent?.nextSibling) {
                        select.insertBefore(optNext, afterCurrent.nextSibling);
                    } else {
                        select.appendChild(optNext);
                    }
                } else if (!hasNext && existingNext) {
                    // Source no longer emits next — remove the option, fall back if selected
                    if (select.value === 'driven_next') {
                        const first = select.querySelector<HTMLOptionElement>('option:not([value="driven_next"])');
                        if (first) { select.value = first.value; }
                    }
                    existingNext.remove();
                }
                // Restore a sentinel that was stored by setConfig before the option existed in the DOM.
                if (typeof this.schema !== 'string') {
                    const argIndex = this.schema.args.findIndex(a => a.name === argName);
                    if (argIndex !== -1) {
                        const saved = this.argValues.get(argIndex);
                        if ((saved === 'driven' || saved === 'driven_next') &&
                            select.querySelector(`option[value="${saved}"]`)) {
                            select.value = saved as string;
                        }
                    }
                }
            } else {
                // Remove both sentinel options
                for (const opt of [existingCurrent, existingNext]) {
                    if (!opt) continue;
                    if (select.value === opt.value) {
                        const first = select.querySelector<HTMLOptionElement>(`option:not([value="${opt.value}"])`);
                        if (first) select.value = first.value;
                    }
                    opt.remove();
                }
                // Sync argValues so buildFlatConfig no longer emits a sentinel.
                if (typeof this.schema !== 'string') {
                    const argIndex = this.schema.args.findIndex(a => a.name === argName);
                    if (argIndex !== -1) this.argValues.set(argIndex, select.value);
                }
            }
            return;
        }
        // LayerList arg: track state and delegate to the container's _setLinked hook
        this._isLinked = visible;
        this._hasNextSignals = hasNext;
        this._callLayerListLinked(argName, visible, false, hasNext);
    }

    /**
     * Switches the named arg's select to the "⟳ Driven" sentinel and triggers a feature rebuild.
     * No-ops if the arg is not a select element or is already in driven mode.
     * Called automatically when an incoming link arrives on a simple (non-layer-list) arg.
     * For LayerList args, adds "⟳ Driven" to field dropdowns and auto-selects it.
     */
    public selectDriven(argName: string): void {
        if (typeof this.schema === 'string') return;
        const select = this.container.querySelector<HTMLSelectElement>(`select[data-arg-name="${argName}"]`);
        if (select) {
            if (select.value === 'driven' || select.value === 'driven_next') return;
            let argIndex = -1;
            this.schema.args.forEach((arg, i) => { if (arg.name === argName) argIndex = i; });
            if (argIndex === -1) return;
            // Ensure "⟳ Driven" option exists without disturbing "⟳ Driven (Next)" if present.
            if (!select.querySelector('option[value="driven"]')) {
                const opt = document.createElement('option');
                opt.value = 'driven';
                opt.text = '⟳ Driven';
                opt.style.fontStyle = 'italic';
                select.insertBefore(opt, select.firstChild);
            }
            select.value = 'driven';
            this.argValues.set(argIndex, 'driven');
            this.notifyChange();
            return;
        }
        // LayerList arg: show driven options and auto-select them
        this._isLinked = true;
        this._callLayerListLinked(argName, true, true, this._hasNextSignals);
    }

    private _callLayerListLinked(argName: string, linked: boolean, autoSelect: boolean, hasNext = false): void {
        if (typeof this.schema === 'string') return;
        const argIndex = this.schema.args.findIndex(a => a.name === argName);
        if (argIndex === -1) return;
        const listEl = this.layerListContainers.get(argIndex);
        if (!listEl) return;
        const fn = (listEl as any)._setLinked;
        if (typeof fn === 'function') fn(linked, autoSelect, hasNext);
    }

    /**
     * Directly sets the selection for a variadic toggle-button arg and syncs the UI.
     * Returns true if the selection actually changed. Used by transparent drive slots
     * (e.g. Qualities on TriadFeature) that update silently without a "Driven" sentinel.
     */
    public setTransparentValue(argName: string, values: string[]): boolean {
        if (typeof this.schema === 'string') return false;
        const argIndex = this.schema.args.findIndex(a => a.name === argName);
        if (argIndex === -1) return false;

        const current = this.argValues.get(argIndex);
        const currentArr = Array.isArray(current) ? current : [];
        if (currentArr.length === values.length && currentArr.every((v, i) => v === values[i])) return false;

        this.argValues.set(argIndex, [...values]);

        const field = this.container.querySelector<HTMLElement>(`[data-arg-index="${argIndex}"] .control`);
        field?.querySelectorAll<HTMLButtonElement>('button[data-value]').forEach(btn => {
            btn.classList.toggle('is-active', values.includes(btn.dataset.value ?? ''));
        });

        return true;
    }

    /**
     * Updates the select element's displayed value without triggering the save callback.
     * Used to reflect a driven value in real-time during playback.
     */
    public applyDrivenValue(argName: string, value: string): void {
        const select = this.container.querySelector<HTMLSelectElement>(`select[data-arg-name="${argName}"]`);
        if (!select) return;
        // Only apply if the select is currently in driven mode
        if (select.value !== 'driven') return;
        // Carry the driven value on a data attribute (used by buildDrivenConfig externally)
        select.dataset.drivenValue = value;

        if (typeof this.schema === 'string') return;
        const argIndex = this.schema.args.findIndex(a => a.name === argName);
        if (argIndex < 0) return;
        const arg = this.schema.args[argIndex];

        // Update argValues so getKeyTypeForArg sees the driven mode
        this.argValues.set(argIndex, value);

        // If this enum arg controls another arg, update its labels for the new value
        if (arg.controlsArgName) {
            const controlledArg = this.schema.args.find(a => a.name === arg.controlsArgName);
            if (controlledArg) {
                if (controlledArg.uiComponentType === UiComponentType.ChordEntryWidget) {
                    // ChordEntryWidget reads root/mode at popup-open time — no rebuild needed.
                } else {
                    const controlledIndex = this.schema.args.indexOf(controlledArg);
                    const advCb = this.container.querySelector<HTMLInputElement>(
                        `input[type="checkbox"][data-controls-arg-name="${arg.controlsArgName}"]`
                    );
                    this.rebuildToggleButtons(controlledArg, controlledIndex, value, advCb?.checked ?? false);
                }
            }
        }
    }

    /**
     * Reflects a live next-state driven value in the select display.
     * Only updates when the select is currently showing driven_next.
     */
    public applyDrivenNextValue(argName: string, value: string): void {
        const select = this.container.querySelector<HTMLSelectElement>(`select[data-arg-name="${argName}"]`);
        if (!select) return;
        if (select.value !== 'driven_next') return;
        select.dataset.drivenNextValue = value;
        if (typeof this.schema === 'string') return;
        const argIndex = this.schema.args.findIndex(a => a.name === argName);
        if (argIndex < 0) return;
        this.argValues.set(argIndex, value);
    }

    public render(): void {
        if (typeof this.schema === 'string') {
            this.container.innerHTML = `<p>${this.schema}</p>`;
            return;
        }

        this.container.innerHTML = '';

        this.schema.args.forEach((arg, index) => {
            if (arg.uiComponentType === UiComponentType.Ellipsis) return; // handled externally

            const field = document.createElement('div');
            field.classList.add('field');
            if (arg.uiComponentType === UiComponentType.LayerList) {
                field.classList.add('is-layer-list-field');
            }
            field.dataset.argIndex = String(index);
            field.dataset.argName = arg.name;

            // Checkbox, Toggle, and LayerList manage their own labels — skip the separate label element.
            if (arg.uiComponentType !== UiComponentType.Checkbox && arg.uiComponentType !== UiComponentType.Toggle && arg.uiComponentType !== UiComponentType.LayerList) {
                const label = document.createElement('label');
                label.classList.add('config-label');
                label.innerText = arg.name;
                field.appendChild(label);
            }

            const control = document.createElement('div');
            control.classList.add('control');
            field.appendChild(control);

            this.renderArg(control, arg, index);
            this.container.appendChild(field);
        });

        // Wire dynamic Key→Prog and Advanced→Prog relationships.
        this.wireControllers();
    }

    // ------------------------------------------------------------------ //

    private renderArg(parent: HTMLElement, arg: ConfigurationSchemaArg, index: number): void {
        if (arg.uiComponentType === UiComponentType.Checkbox) {
            this.renderCheckbox(parent, arg);
        } else if (arg.uiComponentType === UiComponentType.Toggle) {
            this.renderToggle(parent, arg, index);
        } else if (arg.uiComponentType === UiComponentType.LayerList) {
            this.renderLayerList(parent, arg, index);
        } else if (arg.uiComponentType === UiComponentType.ToggleButtonSelector) {
            const keyType = this.getKeyTypeForArg(arg);
            this.renderToggleButtons(parent, arg, index, keyType, false);
        } else if (arg.uiComponentType === UiComponentType.ChordEntryWidget) {
            this.renderChordEntryWidget(parent, arg, index);
        } else if (arg.type === ArgType.Enum) {
            this.renderEnumSelector(parent, arg, index);
        }
    }

    private renderLayerList(parent: HTMLElement, arg: ConfigurationSchemaArg, index: number): void {
        this.layerListContainers.set(index, parent);
        createLayerListInput(parent, arg, [], () => this.notifyChange());
    }

    private renderCheckbox(parent: HTMLElement, arg: ConfigurationSchemaArg): void {
        const wrapper = document.createElement('div');
        wrapper.classList.add('config-checkbox-label');

        const textSpan = document.createElement('span');
        textSpan.textContent = arg.name;

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.dataset.argName = arg.name;
        if (arg.controlsArgName) cb.dataset.controlsArgName = arg.controlsArgName;

        const toggleLabel = document.createElement('label');
        toggleLabel.classList.add('toggle-switch', 'toggle-switch--sm');
        const slider = document.createElement('span');
        slider.classList.add('toggle-switch__slider');
        toggleLabel.append(cb, slider);

        wrapper.append(textSpan, toggleLabel);
        parent.appendChild(wrapper);
        // No argValues entry — checkbox is purely UI state.
    }

    private renderToggle(parent: HTMLElement, arg: ConfigurationSchemaArg, index: number): void {
        const wrapper = document.createElement('div');
        wrapper.classList.add('config-checkbox-label');

        const textSpan = document.createElement('span');
        textSpan.textContent = arg.name;

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.dataset.argName = arg.name;
        const defaultVal = arg.defaultValue === 'true';
        cb.checked = defaultVal;

        const toggleLabel = document.createElement('label');
        toggleLabel.classList.add('toggle-switch', 'toggle-switch--sm');
        const slider = document.createElement('span');
        slider.classList.add('toggle-switch__slider');
        toggleLabel.append(cb, slider);

        wrapper.append(textSpan, toggleLabel);
        parent.appendChild(wrapper);

        this.argValues.set(index, defaultVal ? 'true' : 'false');

        cb.addEventListener('change', () => {
            this.argValues.set(index, cb.checked ? 'true' : 'false');
            this.notifyChange();
        });
    }

    private renderEnumSelector(parent: HTMLElement, arg: ConfigurationSchemaArg, index: number): void {
        const selectContainer = document.createElement('div');
        selectContainer.classList.add('config-select-wrap');

        const select = document.createElement('select');
        select.dataset.argName = arg.name;

        const options = arg.enum ?? [];
        options.forEach((optionValue, i) => {
            const option = document.createElement('option');
            option.value = optionValue;
            option.text = arg.enumLabels?.[i] ?? optionValue;
            select.appendChild(option);
        });

        select.addEventListener('change', () => {
            this.argValues.set(index, select.value);
            this.notifyChange();
        });

        if (options.length > 0) {
            const initial = (arg.defaultValue && options.includes(arg.defaultValue))
                ? arg.defaultValue
                : options[0];
            select.value = initial;
            this.argValues.set(index, initial);
        }

        selectContainer.appendChild(select);
        parent.appendChild(selectContainer);
    }

    private renderToggleButtons(
        parent: HTMLElement,
        arg: ConfigurationSchemaArg,
        index: number,
        keyType: string,
        showAdvanced: boolean
    ): void {
        if (!this.argValues.has(index)) {
            this.argValues.set(index, []);
        }
        const currentSelection = new Set(this.argValues.get(index) as string[]);

        const buttonsDiv = document.createElement('div');
        buttonsDiv.style.display = 'flex';
        buttonsDiv.style.flexWrap = 'wrap';
        buttonsDiv.style.gap = '3px';

        const data = arg.uiComponentData ?? {};
        let basicItems:    (string | LabelValue)[];
        let advancedItems: (string | LabelValue)[];
        if (data.labelsByMode?.[keyType]) {
          basicItems    = data.labelsByMode[keyType].basic;
          advancedItems = data.labelsByMode[keyType].advanced;
        } else {
          basicItems    = keyType === 'Minor' && data.minorButtonLabels
              ? data.minorButtonLabels : (data.buttonLabels ?? []);
          advancedItems = keyType === 'Minor' && data.minorAdvancedButtonLabels
              ? data.minorAdvancedButtonLabels : (data.advancedButtonLabels ?? []);
        }

        const makeBtn = (item: string | LabelValue, isAdvanced: boolean): void => {
            const label = typeof item === 'string' ? item : item.label;
            const value = typeof item === 'string' ? item : item.value;
            const btn = document.createElement('button');
            btn.classList.add('config-toggle-btn');
            btn.innerText = label;
            btn.dataset.value = value;

            if (isAdvanced) {
                btn.classList.add('is-advanced-btn');
                if (!showAdvanced) btn.style.display = 'none';
            }
            if (currentSelection.has(value)) btn.classList.add('is-active');

            btn.addEventListener('click', () => {
                btn.classList.toggle('is-active');
                const arr = (this.argValues.get(index) as string[]) ?? [];
                const pos = arr.indexOf(value);
                if (btn.classList.contains('is-active')) {
                    if (pos === -1) arr.push(value);
                } else {
                    if (pos !== -1) arr.splice(pos, 1);
                }
                this.argValues.set(index, arr);
                this.notifyChange();
            });

            buttonsDiv.appendChild(btn);
        };

        basicItems.forEach(item => makeBtn(item, false));
        advancedItems.forEach(item => makeBtn(item, true));

        parent.appendChild(buttonsDiv);
    }

    private renderChordEntryWidget(parent: HTMLElement, arg: ConfigurationSchemaArg, index: number): void {
        if (!this.argValues.has(index)) this.argValues.set(index, []);
        this.chordEntryContainers.set(index, parent);

        const diatonicOnly: boolean = arg.uiComponentData?.diatonicOnly ?? false;

        const readonlyRow = document.createElement('div');
        readonlyRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;align-items:center;min-height:22px;';

        const editBtn = document.createElement('button');
        editBtn.className = 'config-toggle-btn';
        editBtn.style.cssText = 'font-size:0.75rem;padding:1px 7px;';
        editBtn.textContent = '✎ Edit';

        parent.appendChild(readonlyRow);
        parent.appendChild(editBtn);

        const getValues = (): string[] => (this.argValues.get(index) as string[]) ?? [];

        const getCurrentRootMode = (): { rootNote: string; mode: DiatonicMode } => {
            let rootNote = 'C';
            let mode = DiatonicMode.Ionian;
            if (typeof this.schema !== 'string') {
                const rootIdx = this.schema.args.findIndex(a => a.name === 'Root Note');
                const modeIdx = this.schema.args.findIndex(a => a.name === 'Mode');
                if (rootIdx !== -1) rootNote = (this.argValues.get(rootIdx) as string) ?? 'C';
                if (modeIdx !== -1) {
                    const mv = (this.argValues.get(modeIdx) as string) ?? DiatonicMode.Ionian;
                    if (Object.values(DiatonicMode).includes(mv as DiatonicMode)) mode = mv as DiatonicMode;
                }
            }
            return { rootNote, mode };
        };

        const refreshDisplay = (values: string[], appliedEntries?: ChordEntry[]) => {
            readonlyRow.innerHTML = '';
            if (values.length === 0) {
                const empty = document.createElement('span');
                empty.style.cssText = 'font-size:0.78rem;color:var(--clr-text-subtle,#888);';
                empty.textContent = 'No chords selected';
                readonlyRow.appendChild(empty);
                return;
            }
            const { rootNote, mode } = getCurrentRootMode();
            values.forEach((val, i) => {
                const chip = document.createElement('span');
                chip.style.cssText =
                    'display:inline-flex;align-items:center;' +
                    'background:var(--clr-chip,rgba(90,153,90,0.15));' +
                    'border:1px solid var(--clr-chip-border,rgba(90,153,90,0.4));' +
                    'border-radius:4px;padding:1px 7px;font-size:0.78rem;font-weight:500;white-space:nowrap;';
                const label = appliedEntries?.[i]?.display
                    ?? entryDisplayLabel(val, diatonicOnly, rootNote, mode);
                chip.textContent = label;
                readonlyRow.appendChild(chip);
            });
        };

        refreshDisplay(getValues());

        // ── Popup ────────────────────────────────────────────────────────────────

        let activePopup: HTMLElement | null = null;
        let activePanel: ChordEntryPanel | null = null;
        let activeOutsideHandler: ((ev: MouseEvent) => void) | null = null;

        const closePopup = () => {
            if (activeOutsideHandler) {
                document.removeEventListener('mousedown', activeOutsideHandler, true);
                activeOutsideHandler = null;
            }
            activePanel?.destroy();
            activePanel = null;
            activePopup?.remove();
            activePopup = null;
        };

        const openPopup = () => {
            if (activePopup) return;
            const { rootNote, mode } = getCurrentRootMode();

            const storedValues = getValues();
            const initialEntries: ChordEntry[] = storedValues.map(val => ({
                value: val,
                display: entryDisplayLabel(val, diatonicOnly, rootNote, mode),
                roman: null,
            }));

            const panel = new ChordEntryPanel(rootNote, mode, diatonicOnly);
            panel.setInitialEntries(initialEntries);

            const popup = document.createElement('div');
            popup.style.cssText =
                'position:fixed;z-index:9999;background:var(--clr-panel,var(--dm-panel,#fff));' +
                'border:1px solid var(--clr-border,#ccc);border-radius:8px;' +
                'box-shadow:0 4px 16px rgba(0,0,0,0.15);padding:10px 12px;min-width:260px;max-width:340px;';
            document.body.appendChild(popup);
            activePopup = popup;
            activePanel = panel;

            const rect = editBtn.getBoundingClientRect();
            popup.style.top  = `${rect.bottom + 6}px`;
            popup.style.left = `${Math.min(rect.left, window.innerWidth - 360)}px`;

            panel.renderInto(popup,
                (entries) => {
                    const vals = entries.map(e => e.value);
                    this.argValues.set(index, vals);
                    refreshDisplay(vals, entries);
                    this.notifyChange();
                    closePopup();
                },
                closePopup
            );

            // Close on outside click (deferred so this click doesn't immediately close).
            // Store the handler so closePopup can always remove it — preventing stale
            // handlers from a previous open from firing on the next popup's elements.
            const onOutside = (ev: MouseEvent) => {
                if (!popup.contains(ev.target as Node) && ev.target !== editBtn) {
                    closePopup();
                }
            };
            activeOutsideHandler = onOutside;
            setTimeout(() => document.addEventListener('mousedown', onOutside, true), 0);

            // Clean up if editBtn leaves DOM
            const observer = new MutationObserver(() => {
                if (!document.body.contains(editBtn)) { closePopup(); observer.disconnect(); }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        };

        editBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (activePopup) closePopup(); else openPopup();
        });

        // Hooks for setConfig / buildFlatConfig
        (parent as any)._setValues = (vals: string[]) => {
            this.argValues.set(index, vals);
            refreshDisplay(vals);
        };
        (parent as any)._getValues = (): string[] => getValues();
    }

    // ------------------------------------------------------------------ //

    /** Returns the current key type value for any enum arg that controls `arg`. */
    private getKeyTypeForArg(arg: ConfigurationSchemaArg): string {
        if (typeof this.schema === 'string') return 'Major';
        const schema = this.schema;
        const controller = schema.args.find(a => a.controlsArgName === arg.name && a.type === ArgType.Enum);
        if (!controller) return 'Major';
        const idx = schema.args.indexOf(controller);
        const val = (this.argValues.get(idx) as string) ?? controller.enum?.[0] ?? 'Major';
        if (val === 'driven' || val === 'driven_next') return controller.enum?.[0] ?? 'Major';
        return val;
    }

    /** Rebuilds the toggle button set for an arg after Key or Advanced changes. */
    private rebuildToggleButtons(arg: ConfigurationSchemaArg, index: number, keyType: string, showAdvanced: boolean): void {
        const field = this.container.querySelector<HTMLElement>(`[data-arg-name="${arg.name}"] .control`);
        if (!field) return;
        field.innerHTML = '';
        // When buttons use separate label/value (labelsByMode), the stored values are
        // mode-agnostic degree indices — preserve them so selections survive mode changes.
        // For plain string buttons (label === value), reset to avoid stale values.
        if (!arg.uiComponentData?.labelsByMode) {
            this.argValues.set(index, []);
        }
        this.renderToggleButtons(field, arg, index, keyType, showAdvanced);
    }

    /** Wires controlsArgName relationships after the DOM is built. */
    private wireControllers(): void {
        if (typeof this.schema === 'string') return;
        const schema = this.schema;

        schema.args.forEach(arg => {
            if (!arg.controlsArgName) return;

            const controlledArg = schema.args.find(a => a.name === arg.controlsArgName);
            if (!controlledArg) return;
            const controlledIndex = schema.args.indexOf(controlledArg);

            if (arg.uiComponentType === UiComponentType.Checkbox) {
                // Advanced checkbox → show/hide advanced buttons
                const cb = this.container.querySelector<HTMLInputElement>(
                    `input[type="checkbox"][data-arg-name="${arg.name}"]`
                );
                if (!cb) return;

                cb.addEventListener('change', () => {
                    const advBtns = this.container.querySelectorAll<HTMLElement>(
                        `[data-arg-name="${arg.controlsArgName}"] .is-advanced-btn`
                    );
                    advBtns.forEach(btn => {
                        btn.style.display = cb.checked ? '' : 'none';
                        if (!cb.checked) {
                            btn.classList.remove('is-active');
                            // Remove from selection
                            const arr = (this.argValues.get(controlledIndex) as string[]) ?? [];
                            const label = (btn as HTMLButtonElement).dataset.value ?? '';
                            const pos = arr.indexOf(label);
                            if (pos !== -1) arr.splice(pos, 1);
                            this.argValues.set(controlledIndex, arr);
                        }
                    });
                    this.notifyChange();
                });

            } else if (arg.type === ArgType.Enum) {
                // Key dropdown → rebuild Prog toggle buttons
                const select = this.container.querySelector<HTMLSelectElement>(
                    `select[data-arg-name="${arg.name}"]`
                );
                if (!select) return;

                select.addEventListener('change', () => {
                    if (controlledArg.uiComponentType === UiComponentType.ChordEntryWidget) {
                        // ChordEntryWidget reads root/mode at popup-open time — no rebuild needed.
                    } else {
                        // Find whether the Advanced checkbox (if any) is currently checked.
                        const advCb = this.container.querySelector<HTMLInputElement>(
                            `input[type="checkbox"][data-controls-arg-name="${arg.controlsArgName}"]`
                        );
                        const showAdvanced = advCb?.checked ?? false;
                        this.rebuildToggleButtons(controlledArg, controlledIndex, select.value, showAdvanced);
                    }
                    this.notifyChange();
                });
            }
        });
    }
}
