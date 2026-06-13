// ts/core/config/form_builder.ts
// Renders a typed configuration form from a ConfigSpec + DrivenConfig.
// Replaces ts/views/config_view.ts.

import { el } from '../dom';
import type {
  ConfigSpec,
  DrivenConfig,
  ConfigValue,
  FieldSpec,
  LabelValue,
  CustomRenderContext,
  CustomFieldController,
} from './spec';
import { SignalKind } from '../../panels/link_types';
import { AppSettings } from '../../settings';

// ─── Public API ───────────────────────────────────────────────────────────────

export interface FormBuilderOpts<C> {
  spec: ConfigSpec<C>;
  initialConfig: DrivenConfig<C>;
  onChange(config: DrivenConfig<C>): void;
  appSettings: AppSettings;
}

/**
 * Renders a configuration form from a ConfigSpec + DrivenConfig.
 * Call render(container) to build the DOM; subsequent calls are ignored.
 * Use setConfig / setLinkStatus / applyDrivenValue to update the form from outside.
 */
export class FormBuilder<C> {
  private readonly spec: ConfigSpec<C>;
  private config: DrivenConfig<C>;
  private readonly onChange: (c: DrivenConfig<C>) => void;
  private readonly appSettings: AppSettings;

  private container: HTMLElement | null = null;
  // Per-field widget state
  private fieldWidgets = new Map<keyof C, FieldWidget<unknown>>();
  // Tracks whether any drivable field currently has an incoming link
  private hasIncomingLinks = false;
  private hasNextSignals = false;
  // Accepted kinds from the most recent setLinkStatus call
  private acceptedKinds = new Set<SignalKind>();

  constructor(opts: FormBuilderOpts<C>) {
    this.spec = opts.spec;
    this.config = { ...opts.initialConfig };
    this.onChange = opts.onChange;
    this.appSettings = opts.appSettings;
  }

  get currentConfig(): DrivenConfig<C> {
    return { ...this.config };
  }

  /** Returns the current effective value for each field (resolves driven values where available). */
  getFieldValues(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(this.spec) as (keyof C)[]) {
      const widget = this.fieldWidgets.get(key);
      out[key as string] = widget ? widget.getEffectiveValue() : undefined;
    }
    return out;
  }

  render(container: HTMLElement): void {
    if (this.container) return;
    this.container = container;
    container.innerHTML = '';
    this.fieldWidgets.clear();

    const keys = Object.keys(this.spec) as (keyof C)[];
    for (const key of keys) {
      const field = this.spec[key];
      const cv = this.config[key];
      const widget = this.buildFieldWidget(key, field as FieldSpec<unknown>, cv as ConfigValue<unknown>);
      this.fieldWidgets.set(key, widget);
      container.appendChild(widget.root);
    }

    // Wire controllers (fields that control other fields' rebuild).
    this.wireControllers();
  }

  /** Replace the entire config (e.g. on panel restore or zoom/rotate). Rebuilds changed fields. */
  setConfig(config: DrivenConfig<C>): void {
    this.config = { ...config };
    const keys = Object.keys(this.spec) as (keyof C)[];
    for (const key of keys) {
      const widget = this.fieldWidgets.get(key);
      if (widget) widget.setValue(config[key] as ConfigValue<unknown>);
    }
  }

  /**
   * Show / hide "⟳ Driven" options. Pass the set of SignalKinds the connected
   * source emits so only compatible fields expose the driven option.
   */
  setLinkStatus(hasLinks: boolean, hasNext: boolean, kinds: Set<SignalKind>): void {
    this.hasIncomingLinks = hasLinks;
    this.hasNextSignals = hasNext;
    this.acceptedKinds = kinds;

    const keys = Object.keys(this.spec) as (keyof C)[];
    for (const key of keys) {
      const field = this.spec[key] as FieldSpec<unknown>;
      const widget = this.fieldWidgets.get(key);
      if (!widget) continue;

      if (field.ui.kind === 'custom') {
        // Propagate link status to custom controllers that opt in.
        widget.setLinkStatus?.(hasLinks, hasLinks, hasNext);
        continue;
      }

      if (!field.drivable || field.drivable.transparent) continue;
      const compatible = field.drivable.kinds.some(k => kinds.has(k));
      widget.setDrivenVisible(hasLinks && compatible, hasLinks && compatible && hasNext);
      if (hasLinks && compatible) {
        widget.autoSelectDriven();
      }
    }
  }

  /** Reflect a live current-state driven value in the widget display. */
  applyDrivenValue(key: keyof C, value: unknown): void {
    const widget = this.fieldWidgets.get(key);
    if (widget) widget.applyDrivenValue(value);
  }

  /** Reflect a live next-state driven value in the widget display. */
  applyDrivenNextValue(key: keyof C, value: unknown): void {
    const widget = this.fieldWidgets.get(key);
    if (widget) widget.applyDrivenNextValue(value);
  }

  /**
   * Directly sets the selection for a toggle-buttons field and triggers rebuild.
   * Returns true if the value actually changed. Used for transparent driven slots.
   */
  setTransparentValue(key: keyof C, values: string[]): boolean {
    const widget = this.fieldWidgets.get(key);
    if (!widget) return false;
    const changed = widget.setTransparentValue(values);
    if (changed) {
      (this.config as any)[key] = { mode: 'literal', value: values };
      this.fireChange();
    }
    return changed;
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private fireChange(): void {
    this.onChange({ ...this.config });
  }

  private setFieldValue(key: keyof C, cv: ConfigValue<unknown>): void {
    (this.config as any)[key] = cv;
    this.fireChange();
  }

  private buildFieldWidget(
    key: keyof C,
    field: FieldSpec<unknown>,
    cv: ConfigValue<unknown>,
  ): FieldWidget<unknown> {
    const root = el('div', { class: 'field', dataset: { argName: String(key) } });
    const control = el('div', { class: 'control' });

    const ui = field.ui;
    let widget: FieldWidget<unknown>;

    if (ui.kind === 'select') {
      if (typeof (cv as any).value === 'string' || cv.mode !== 'literal') {
        root.appendChild(el('label', { class: 'config-label', text: field.label }));
      } else {
        root.appendChild(el('label', { class: 'config-label', text: field.label }));
      }
      root.appendChild(control);
      widget = this.buildSelectWidget(key, field, cv, control, ui.options.map(o => typeof o === 'string' ? { value: o } : o));
    } else if (ui.kind === 'toggleButtons') {
      root.appendChild(el('label', { class: 'config-label', text: field.label }));
      root.appendChild(control);
      widget = this.buildToggleButtonWidget(key, field, cv, control, ui);
    } else if (ui.kind === 'toggle') {
      root.appendChild(control);
      widget = this.buildToggleWidget(key, field, cv, control);
    } else if (ui.kind === 'checkbox') {
      root.appendChild(control);
      widget = this.buildCheckboxWidget(key, field, control);
    } else if (ui.kind === 'custom') {
      root.classList.add('is-custom-field');
      root.appendChild(control);
      const ctx: CustomRenderContext = {
        appSettings: this.appSettings,
        onChange: () => {
          const val = (customCtrl as CustomFieldController).getValue();
          (this.config as any)[key] = { mode: 'literal', value: val };
          this.fireChange();
        },
        getFieldValues: () => this.getFieldValues(),
      };
      let customCtrl: CustomFieldController;
      customCtrl = ui.render(control, ctx);
      if (cv.mode === 'literal') customCtrl.setValue(cv.value);
      widget = {
        root,
        getValue: (): ConfigValue<unknown> => ({ mode: 'literal', value: customCtrl.getValue() }),
        setValue: (newCv: ConfigValue<unknown>) => {
          if (newCv.mode === 'literal') customCtrl.setValue(newCv.value);
        },
        setDrivenVisible: () => {},
        autoSelectDriven: () => {},
        applyDrivenValue: () => {},
        applyDrivenNextValue: () => {},
        setTransparentValue: () => false,
        getControllerKey: () => undefined,
        getControlsKey: () => field.controls,
        getEffectiveValue: () => customCtrl.getValue(),
        setLinkStatus: (hasLinks, autoSelect, hasNext) => {
          customCtrl.setLinkStatus?.(hasLinks, autoSelect, hasNext);
        },
      };
    } else {
      // number
      root.appendChild(el('label', { class: 'config-label', text: field.label }));
      root.appendChild(control);
      widget = this.buildNumberWidget(key, field, cv, control, (ui as any).min, (ui as any).max, (ui as any).step);
    }

    return widget;
  }

  private buildSelectWidget(
    key: keyof C,
    field: FieldSpec<unknown>,
    initialCv: ConfigValue<unknown>,
    parent: HTMLElement,
    options: { value: string; label?: string }[],
  ): FieldWidget<unknown> {
    const wrap = el('div', { class: 'config-select-wrap' });
    const select = el('select', { dataset: { argName: String(key) } });
    options.forEach(opt => {
      const o = el('option', { text: opt.label ?? opt.value });
      o.value = opt.value;
      select.appendChild(o);
    });

    // Set initial value
    const initVal = initialCv.mode === 'literal'
      ? field.codec.serialize(initialCv.value)
      : (options[0]?.value ?? '');
    if (options.some(o => o.value === initVal)) select.value = initVal;

    select.addEventListener('change', () => {
      const parsed = field.codec.parse(select.value);
      const cv: ConfigValue<unknown> = parsed !== undefined
        ? { mode: 'literal', value: parsed }
        : { mode: 'literal', value: field.defaultValue };
      this.setFieldValue(key, cv);
      // If a controller, rebuild controlled fields
      if (field.controls) this.rebuildControlled(field.controls as keyof C, select.value);
    });

    wrap.appendChild(select);
    parent.appendChild(wrap);

    return {
      root: parent.parentElement!,
      getValue: () => {
        if (select.value === 'driven') return { mode: 'driven' };
        if (select.value === 'driven_next') return { mode: 'drivenNext' };
        const parsed = field.codec.parse(select.value);
        return { mode: 'literal', value: parsed ?? field.defaultValue };
      },
      setValue: (cv: ConfigValue<unknown>) => {
        if (cv.mode === 'driven' && select.querySelector('option[value="driven"]')) {
          select.value = 'driven';
        } else if (cv.mode === 'drivenNext' && select.querySelector('option[value="driven_next"]')) {
          select.value = 'driven_next';
        } else if (cv.mode === 'literal') {
          const serialized = field.codec.serialize(cv.value);
          if (options.some(o => o.value === serialized)) select.value = serialized;
        }
      },
      setDrivenVisible: (visible: boolean, hasNext: boolean) => {
        const existing = select.querySelector<HTMLOptionElement>('option[value="driven"]');
        const existingNext = select.querySelector<HTMLOptionElement>('option[value="driven_next"]');
        if (visible) {
          if (!existing) {
            const opt = el('option', { text: '⟳ Driven' });
            opt.value = 'driven';
            opt.style.fontStyle = 'italic';
            select.insertBefore(opt, select.firstChild);
          }
          if (hasNext && !existingNext) {
            const optNext = el('option', { text: '⟳ Driven (Next)' });
            optNext.value = 'driven_next';
            optNext.style.fontStyle = 'italic';
            const afterCurrent = select.querySelector<HTMLOptionElement>('option[value="driven"]');
            if (afterCurrent?.nextSibling) {
              select.insertBefore(optNext, afterCurrent.nextSibling);
            } else {
              select.appendChild(optNext);
            }
          } else if (!hasNext && existingNext) {
            if (select.value === 'driven_next') {
              const first = select.querySelector<HTMLOptionElement>('option:not([value="driven_next"])');
              if (first) select.value = first.value;
            }
            existingNext.remove();
          }
          // Restore saved sentinel if the option now exists
          const cv = this.config[key];
          if (cv.mode === 'driven' && select.querySelector('option[value="driven"]')) select.value = 'driven';
          else if (cv.mode === 'drivenNext' && select.querySelector('option[value="driven_next"]')) select.value = 'driven_next';
        } else {
          for (const opt of [existing, existingNext]) {
            if (!opt) continue;
            if (select.value === opt.value) {
              const first = select.querySelector<HTMLOptionElement>(`option:not([value="${opt.value}"])`);
              if (first) select.value = first.value;
            }
            opt.remove();
          }
          // Sync config to the non-sentinel value
          const parsed = field.codec.parse(select.value);
          (this.config as any)[key] = { mode: 'literal', value: parsed ?? field.defaultValue };
        }
      },
      autoSelectDriven: () => {
        const existingDriven = select.querySelector<HTMLOptionElement>('option[value="driven"]');
        if (!existingDriven) {
          const opt = el('option', { text: '⟳ Driven' });
          opt.value = 'driven';
          opt.style.fontStyle = 'italic';
          select.insertBefore(opt, select.firstChild);
        }
        select.value = 'driven';
        (this.config as any)[key] = { mode: 'driven' };
        this.fireChange();
      },
      applyDrivenValue: (val: unknown) => {
        if (select.value !== 'driven') return;
        select.dataset.drivenValue = String(val);
        // Update internal config so controllers can read the driven value
        (this.config as any)[key] = { mode: 'driven' };
        if (field.controls) this.rebuildControlled(field.controls as keyof C, String(val));
      },
      applyDrivenNextValue: (val: unknown) => {
        if (select.value !== 'driven_next') return;
        select.dataset.drivenNextValue = String(val);
      },
      setTransparentValue: () => false,
      getControllerKey: () => field.controls as string | undefined,
      getControlsKey: () => field.controls,
      getEffectiveValue: () => {
        if (select.value === 'driven') {
          const dv = select.dataset.drivenValue;
          return dv !== undefined ? field.codec.parse(dv) : undefined;
        }
        if (select.value === 'driven_next') {
          const dv = select.dataset.drivenNextValue;
          return dv !== undefined ? field.codec.parse(dv) : undefined;
        }
        return field.codec.parse(select.value);
      },
      setLinkStatus: undefined,
    };
  }

  private buildToggleButtonWidget(
    key: keyof C,
    field: FieldSpec<unknown>,
    initialCv: ConfigValue<unknown>,
    parent: HTMLElement,
    ui: Extract<import('./spec').UiControl, { kind: 'toggleButtons' }>,
  ): FieldWidget<unknown> {
    const currentSelection = new Set<string>(
      initialCv.mode === 'literal' && Array.isArray(initialCv.value) ? (initialCv.value as string[]) : []
    );
    const buttonsDiv = el('div', { class: 'toggle-buttons-wrap' });
    buttonsDiv.style.cssText = 'display:flex;flex-wrap:wrap;gap:3px;';

    const makeBtn = (item: string | LabelValue, isAdvanced: boolean): HTMLButtonElement => {
      const label = typeof item === 'string' ? item : item.label;
      const value = typeof item === 'string' ? item : item.value;
      const btn = el('button', {
        class: ['config-toggle-btn', ...(isAdvanced ? ['is-advanced-btn'] : [])],
        text: label,
        dataset: { value },
      }) as HTMLButtonElement;
      if (isAdvanced) btn.style.display = 'none';
      if (currentSelection.has(value)) btn.classList.add('is-active');
      btn.addEventListener('click', () => {
        btn.classList.toggle('is-active');
        const arr = this.getCurrentToggleValues(key);
        const pos = arr.indexOf(value);
        if (btn.classList.contains('is-active')) {
          if (pos === -1) arr.push(value);
        } else {
          if (pos !== -1) arr.splice(pos, 1);
        }
        (this.config as any)[key] = { mode: 'literal', value: arr };
        this.fireChange();
      });
      return btn;
    };

    let keyType = 'Major'; // default controller key

    const renderButtons = (kt: string, showAdvanced: boolean): void => {
      keyType = kt;
      buttonsDiv.innerHTML = '';
      let basic: (string | LabelValue)[];
      let advanced: (string | LabelValue)[];
      if (ui.labelsByMode?.[kt]) {
        basic    = ui.labelsByMode[kt].basic;
        advanced = ui.labelsByMode[kt].advanced;
      } else {
        basic    = ui.options ?? [];
        advanced = ui.advancedOptions ?? [];
      }
      basic.forEach(item => buttonsDiv.appendChild(makeBtn(item, false)));
      advanced.forEach(item => {
        const btn = makeBtn(item, true);
        if (showAdvanced) btn.style.display = '';
        buttonsDiv.appendChild(btn);
      });
    };

    renderButtons(keyType, false);
    parent.appendChild(buttonsDiv);

    return {
      root: parent.parentElement!,
      getValue: () => ({ mode: 'literal', value: this.getCurrentToggleValues(key) }),
      setValue: (cv: ConfigValue<unknown>) => {
        if (cv.mode !== 'literal') return;
        const vals = Array.isArray(cv.value) ? (cv.value as string[]) : [];
        const btns = buttonsDiv.querySelectorAll<HTMLButtonElement>('button[data-value]');
        btns.forEach(btn => {
          const v = btn.dataset.value ?? '';
          const resolved = vals.some(sv => sv === v) ? v : null;
          btn.classList.toggle('is-active', resolved !== null);
        });
        (this.config as any)[key] = { mode: 'literal', value: vals };
      },
      setDrivenVisible: () => {},
      autoSelectDriven: () => {},
      applyDrivenValue: () => {},
      applyDrivenNextValue: () => {},
      setTransparentValue: (values: string[]): boolean => {
        const current = this.getCurrentToggleValues(key);
        if (current.length === values.length && current.every((v, i) => v === values[i])) return false;
        const btns = buttonsDiv.querySelectorAll<HTMLButtonElement>('button[data-value]');
        btns.forEach(btn => btn.classList.toggle('is-active', values.includes(btn.dataset.value ?? '')));
        return true;
      },
      getControllerKey: (): string | undefined => undefined,
      getControlsKey: (): string | undefined => field.controls,
      getEffectiveValue: () => this.getCurrentToggleValues(key),
      // Expose the renderButtons fn so the controller (Key select) can trigger a rebuild
      _renderButtons: renderButtons,
      _getKeyType: () => keyType,
      setLinkStatus: undefined,
    } as any;
  }

  private buildToggleWidget(
    key: keyof C,
    field: FieldSpec<unknown>,
    initialCv: ConfigValue<unknown>,
    parent: HTMLElement,
  ): FieldWidget<unknown> {
    const defaultChecked = (field.ui as any).defaultChecked ?? false;
    const initVal = initialCv.mode === 'literal' ? Boolean(initialCv.value) : defaultChecked;

    const wrapper = el('div', { class: 'config-checkbox-label' });
    const span = el('span', { text: field.label });
    const cb = el('input', { attrs: { type: 'checkbox' }, dataset: { argName: String(key) } }) as HTMLInputElement;
    cb.checked = initVal;
    const toggleLabel = el('label', { class: 'toggle-switch toggle-switch--sm' });
    const slider = el('span', { class: 'toggle-switch__slider' });
    toggleLabel.append(cb, slider);
    wrapper.append(span, toggleLabel);
    parent.appendChild(wrapper);

    cb.addEventListener('change', () => {
      (this.config as any)[key] = { mode: 'literal', value: cb.checked };
      this.fireChange();
    });

    return {
      root: parent.parentElement!,
      getValue: () => ({ mode: 'literal', value: cb.checked }),
      setValue: (cv: ConfigValue<unknown>) => {
        if (cv.mode === 'literal') cb.checked = Boolean(cv.value);
      },
      setDrivenVisible: () => {},
      autoSelectDriven: () => {},
      applyDrivenValue: () => {},
      applyDrivenNextValue: () => {},
      setTransparentValue: () => false,
      getControllerKey: () => undefined,
      getControlsKey: () => field.controls,
      getEffectiveValue: () => cb.checked,
      setLinkStatus: undefined,
    };
  }

  private buildCheckboxWidget(
    key: keyof C,
    field: FieldSpec<unknown>,
    parent: HTMLElement,
  ): FieldWidget<unknown> {
    // UI-only; does not contribute to the config string.
    const wrapper = el('div', { class: 'config-checkbox-label' });
    const span = el('span', { text: field.label });
    const cb = el('input', { attrs: { type: 'checkbox' }, dataset: { argName: String(key) } }) as HTMLInputElement;
    const toggleLabel = el('label', { class: 'toggle-switch toggle-switch--sm' });
    const slider = el('span', { class: 'toggle-switch__slider' });
    toggleLabel.append(cb, slider);
    wrapper.append(span, toggleLabel);
    parent.appendChild(wrapper);

    cb.addEventListener('change', () => {
      // Advanced checkbox: show/hide advanced buttons in the controlled field
      if (field.controls) {
        const controlledWidget = this.fieldWidgets.get(field.controls as keyof C) as any;
        if (controlledWidget?._renderButtons) {
          const kt = controlledWidget._getKeyType?.() ?? 'Major';
          controlledWidget._renderButtons(kt, cb.checked);
        }
      }
      this.fireChange();
    });

    return {
      root: parent.parentElement!,
      getValue: () => ({ mode: 'literal', value: cb.checked }),
      setValue: () => {},
      setDrivenVisible: () => {},
      autoSelectDriven: () => {},
      applyDrivenValue: () => {},
      applyDrivenNextValue: () => {},
      setTransparentValue: () => false,
      getControllerKey: () => field.controls as string | undefined,
      getControlsKey: () => field.controls,
      getEffectiveValue: () => cb.checked,
      setLinkStatus: undefined,
    };
  }

  private buildNumberWidget(
    key: keyof C,
    field: FieldSpec<unknown>,
    initialCv: ConfigValue<unknown>,
    parent: HTMLElement,
    min?: number,
    max?: number,
    step?: number,
  ): FieldWidget<unknown> {
    const initVal = initialCv.mode === 'literal' ? Number(initialCv.value) : Number(field.defaultValue);
    const input = el('input', {
      attrs: {
        type: 'number',
        ...(min !== undefined ? { min: String(min) } : {}),
        ...(max !== undefined ? { max: String(max) } : {}),
        ...(step !== undefined ? { step: String(step) } : {}),
        value: String(initVal),
      },
    }) as HTMLInputElement;
    parent.appendChild(input);

    input.addEventListener('change', () => {
      const n = Number(input.value);
      (this.config as any)[key] = { mode: 'literal', value: isNaN(n) ? field.defaultValue : n };
      this.fireChange();
    });

    return {
      root: parent.parentElement!,
      getValue: () => ({ mode: 'literal', value: Number(input.value) }),
      setValue: (cv: ConfigValue<unknown>) => {
        if (cv.mode === 'literal') input.value = String(cv.value);
      },
      setDrivenVisible: () => {},
      autoSelectDriven: () => {},
      applyDrivenValue: () => {},
      applyDrivenNextValue: () => {},
      setTransparentValue: () => false,
      getControllerKey: () => undefined,
      getControlsKey: () => field.controls,
      getEffectiveValue: () => Number(input.value),
      setLinkStatus: undefined,
    };
  }

  private getCurrentToggleValues(key: keyof C): string[] {
    const cv = this.config[key];
    if (cv.mode === 'literal' && Array.isArray((cv as any).value)) {
      return [...(cv as any).value as string[]];
    }
    return [];
  }

  private wireControllers(): void {
    // Key-select → toggle-button-set relationships are handled inside buildSelectWidget
    // (calls rebuildControlled on change). Checkbox → advanced-toggle handled in buildCheckboxWidget.
  }

  private rebuildControlled(controlledKey: keyof C, controllerValue: string): void {
    const widget = this.fieldWidgets.get(controlledKey) as any;
    if (widget?._renderButtons) {
      // Get whether advanced checkbox is currently checked (if one exists)
      const advCheckbox = this.container?.querySelector<HTMLInputElement>(
        `[data-arg-name="${String(controlledKey)}"] ~ div input[type="checkbox"]`,
      );
      widget._renderButtons(controllerValue, advCheckbox?.checked ?? false);
    }
  }
}

// ─── Internal FieldWidget interface ──────────────────────────────────────────

interface FieldWidget<T> {
  root: HTMLElement;
  getValue(): ConfigValue<T>;
  setValue(cv: ConfigValue<T>): void;
  setDrivenVisible(visible: boolean, hasNext: boolean): void;
  autoSelectDriven(): void;
  applyDrivenValue(val: unknown): void;
  applyDrivenNextValue(val: unknown): void;
  /** Returns true if the value actually changed. */
  setTransparentValue(values: string[]): boolean;
  getControllerKey(): string | undefined;
  getControlsKey(): string | undefined;
  /** Returns the current effective value, resolving driven values when available. */
  getEffectiveValue(): unknown;
  setLinkStatus?: (hasLinks: boolean, autoSelect: boolean, hasNext: boolean) => void;
}
