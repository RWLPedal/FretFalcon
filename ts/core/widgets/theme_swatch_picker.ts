import { Theme, themeNames } from '../../theme_manager';

export type ThemePickerSize = 'compact' | 'normal';

export class ThemeSwatchPicker {
    public readonly el: HTMLElement;
    private _current: Theme;
    private _onChange?: (theme: Theme) => void;

    constructor(currentTheme: Theme, size: ThemePickerSize, onChange?: (theme: Theme) => void) {
        this._current = currentTheme;
        this._onChange = onChange;
        this.el = this._build(size);
    }

    private _build(size: ThemePickerSize): HTMLElement {
        const row = document.createElement('div');
        row.className = `theme-picker theme-picker--${size}`;

        for (const t of themeNames) {
            const wrap = document.createElement('div');
            wrap.className = 'theme-picker__wrap';

            const btn = document.createElement('button');
            btn.className = `theme-swatch theme-swatch--${t.key}${this._current === t.key ? ' is-active' : ''}`;
            btn.dataset.theme = t.key;
            btn.title = t.title;
            btn.type = 'button';

            if (size === 'normal') {
                const label = document.createElement('span');
                label.className = 'theme-picker__label';
                label.textContent = t.title;
                wrap.append(btn, label);
            } else {
                wrap.appendChild(btn);
            }

            wrap.addEventListener('click', () => {
                this.setValue(t.key);
                this._onChange?.(t.key);
            });

            row.appendChild(wrap);
        }

        return row;
    }

    getValue(): Theme {
        return this._current;
    }

    setValue(theme: Theme): void {
        this._current = theme;
        this.el.querySelectorAll<HTMLElement>('.theme-swatch').forEach(s => {
            s.classList.toggle('is-active', s.dataset.theme === theme);
        });
    }
}
