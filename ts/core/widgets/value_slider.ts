export interface ValueSliderOptions {
  min: number;
  max: number;
  value: number;
  /** Short label prepended to the value, e.g. "BPM" → displays "BPM: 120" */
  label?: string;
  /** Formats the numeric value for display; default is String(v) */
  format?: (v: number) => string;
  step?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

/**
 * A compact slider that renders the current value as text inside the track
 * rather than beside it. Uses a hidden native <input type="range"> for all
 * mouse/touch/keyboard interaction, overlaid with a custom fill + label.
 *
 * Usage:
 *   const s = new ValueSlider({ min: 20, max: 240, value: 120, label: 'BPM', onChange: v => ... });
 *   row.appendChild(s.element);
 *   s.setValue(140);          // external update (driven, tap-tempo, etc.)
 *   s.setDisabled(true);      // when driven by a groove link
 */
export class ValueSlider {
  private el: HTMLElement;
  private fillEl: HTMLElement;
  private labelEl: HTMLElement;
  private inputEl: HTMLInputElement;

  private min: number;
  private max: number;
  private _value: number;
  private prefix: string;
  private fmt: (v: number) => string;

  constructor(opts: ValueSliderOptions) {
    this.min    = opts.min;
    this.max    = opts.max;
    this._value = Math.max(opts.min, Math.min(opts.max, opts.value));
    this.prefix = opts.label ?? '';
    this.fmt    = opts.format ?? ((v) => String(v));

    this.el = document.createElement('div');
    this.el.className = 'value-slider';

    this.fillEl = document.createElement('div');
    this.fillEl.className = 'value-slider__fill';
    this.el.appendChild(this.fillEl);

    this.labelEl = document.createElement('span');
    this.labelEl.className = 'value-slider__label';
    this.el.appendChild(this.labelEl);

    this.inputEl = document.createElement('input');
    this.inputEl.type      = 'range';
    this.inputEl.className = 'value-slider__input';
    this.inputEl.min       = String(opts.min);
    this.inputEl.max       = String(opts.max);
    this.inputEl.step      = String(opts.step ?? 1);
    this.inputEl.value     = String(this._value);
    this.el.appendChild(this.inputEl);

    this.inputEl.addEventListener('input', () => {
      this._value = parseInt(this.inputEl.value, 10);
      this.refreshDisplay();
      opts.onChange(this._value);
    });

    if (opts.disabled) this.setDisabled(true);
    this.refreshDisplay();
  }

  get element(): HTMLElement { return this.el; }
  get value(): number { return this._value; }

  /** Update value without triggering onChange (for external/driven updates). */
  setValue(v: number): void {
    this._value = Math.max(this.min, Math.min(this.max, Math.round(v)));
    this.inputEl.value = String(this._value);
    this.refreshDisplay();
  }

  setDisabled(disabled: boolean): void {
    this.inputEl.disabled = disabled;
    this.el.classList.toggle('value-slider--disabled', disabled);
  }

  private refreshDisplay(): void {
    const pct = ((this._value - this.min) / (this.max - this.min)) * 100;
    this.fillEl.style.width = `${pct}%`;
    this.labelEl.textContent = this.prefix
      ? `${this.prefix}: ${this.fmt(this._value)}`
      : this.fmt(this._value);
  }
}
