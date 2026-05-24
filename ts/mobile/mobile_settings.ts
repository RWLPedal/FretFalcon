import { AppSettings } from '../settings';
import { Theme } from '../theme_manager';
import { INSTRUMENTS, InstrumentName, getAvailableTunings } from '../fretboard/fretboard';
import { FretboardColorScheme } from '../fretboard/colors';
import { COLOR_SCHEME_OPTIONS } from '../fretboard/fretboard_category';
import { ThemeSwatchPicker } from '../views/theme_swatch_picker';

type Draft = {
    instrument: InstrumentName;
    handedness: 'right' | 'left';
    tuning: string;
    colorScheme: FretboardColorScheme;
};

export class MobileSettingsDrawer {
    private panelEl!: HTMLElement;
    private overlayEl!: HTMLElement;
    private built = false;
    private draft: Draft = {
        instrument: InstrumentName.Guitar,
        handedness: 'right',
        tuning: 'Standard',
        colorScheme: 'interval',
    };

    constructor(
        private container: HTMLElement,
        private getSettings: () => AppSettings,
        private onSettingChanged: (s: AppSettings) => void,
    ) {}

    public open(): void {
        if (!this.built) this.build();
        this.refresh();
        this.overlayEl.classList.add('is-open');
        this.panelEl.classList.add('is-open');
    }

    public close(): void {
        this.overlayEl?.classList.remove('is-open');
        this.panelEl?.classList.remove('is-open');
    }

    private build(): void {
        this.built = true;

        this.overlayEl = document.createElement('div');
        this.overlayEl.className = 'mobile-settings-overlay';
        this.overlayEl.addEventListener('click', () => this.close());
        this.container.appendChild(this.overlayEl);

        this.panelEl = document.createElement('div');
        this.panelEl.className = 'mobile-settings-panel';

        const handle = document.createElement('div');
        handle.className = 'mobile-settings-handle';
        this.panelEl.appendChild(handle);
        this._setupDrag(handle);

        const header = document.createElement('div');
        header.className = 'mobile-settings-header';

        const title = document.createElement('span');
        title.className = 'mobile-settings-title';
        title.textContent = 'Settings';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'mobile-settings-close';
        closeBtn.innerHTML = '<span class="material-icons">close</span>';
        closeBtn.addEventListener('click', () => this.close());

        header.append(title, closeBtn);

        const body = document.createElement('div');
        body.className = 'mobile-settings-body';
        body.dataset.settingsBody = '1';

        this.panelEl.append(header, body);
        this.container.appendChild(this.panelEl);
    }

    private refresh(): void {
        const body = this.panelEl.querySelector<HTMLElement>('[data-settings-body]');
        if (!body) return;
        body.innerHTML = '';

        const settings = this.getSettings();
        this.draft = {
            instrument: (settings.instrumentSettings?.instrument ?? InstrumentName.Guitar) as InstrumentName,
            handedness: (settings.instrumentSettings?.handedness ?? 'right') as 'right' | 'left',
            tuning: settings.instrumentSettings?.tuning ?? 'Standard',
            colorScheme: (settings.instrumentSettings?.colorScheme ?? 'interval') as FretboardColorScheme,
        };

        body.appendChild(this._buildThemeSection(settings.theme));
        body.appendChild(this._buildInstrumentSection());
    }

    private _setupDrag(handle: HTMLElement): void {
        let startY = 0;
        let dragY = 0;
        let active = false;

        handle.addEventListener('touchstart', (e: TouchEvent) => {
            startY = e.touches[0].clientY;
            dragY = 0;
            active = true;
            this.panelEl.style.transition = 'none';
        }, { passive: true });

        handle.addEventListener('touchmove', (e: TouchEvent) => {
            if (!active) return;
            dragY = Math.max(0, e.touches[0].clientY - startY);
            this.panelEl.style.transform = `translateY(${dragY}px)`;
        }, { passive: true });

        const onEnd = () => {
            if (!active) return;
            active = false;
            const threshold = Math.min(100, this.panelEl.offsetHeight * 0.35);
            // Re-enable CSS transition before animating
            this.panelEl.style.transition = '';
            if (dragY > threshold) {
                this.panelEl.style.transform = 'translateY(100%)';
                this.panelEl.addEventListener('transitionend', () => {
                    this.panelEl.style.transform = '';
                    this.panelEl.classList.remove('is-open');
                    this.overlayEl.classList.remove('is-open');
                }, { once: true });
            } else {
                // Snap back — clear inline transform, CSS is-open rule takes over
                this.panelEl.style.transform = '';
            }
            dragY = 0;
        };

        handle.addEventListener('touchend', onEnd);
        handle.addEventListener('touchcancel', onEnd);
    }

    private _buildThemeSection(currentTheme: Theme): HTMLElement {
        const section = document.createElement('div');
        section.className = 'mobile-settings-section';

        const label = document.createElement('div');
        label.className = 'mobile-settings-section-label';
        label.textContent = 'Theme';
        section.appendChild(label);

        const picker = new ThemeSwatchPicker(currentTheme, 'normal', (theme) => this._emitTheme(theme));
        picker.el.style.padding = '4px 16px 8px';
        section.appendChild(picker.el);
        return section;
    }

    private _buildInstrumentSection(): HTMLElement {
        const section = document.createElement('div');
        section.className = 'mobile-settings-section';

        const label = document.createElement('div');
        label.className = 'mobile-settings-section-label';
        label.textContent = 'Instrument';
        section.appendChild(label);

        // Instrument select
        const instrumentOptions = Object.values(INSTRUMENTS).map(i => ({ value: i.name as string, text: i.displayText }));
        section.appendChild(this._buildRow('Instrument',
            this._buildSelect(
                instrumentOptions,
                this.draft.instrument,
                (val) => {
                    this.draft.instrument = val as InstrumentName;
                    const inst = INSTRUMENTS[this.draft.instrument as InstrumentName];
                    this.draft.tuning = inst?.defaultTuning.name ?? 'Standard';
                    this._emitDraft();
                    const tuningContainer = section.querySelector<HTMLElement>('[data-tuning-container]');
                    if (tuningContainer) {
                        tuningContainer.innerHTML = '';
                        tuningContainer.appendChild(this._buildTuningSelect());
                    }
                }
            )
        ));

        // Tuning select — wrapped for in-place replacement when instrument changes
        const tuningContainer = document.createElement('div');
        tuningContainer.dataset.tuningContainer = '1';
        tuningContainer.style.flex = '1';
        tuningContainer.style.maxWidth = '200px';
        tuningContainer.appendChild(this._buildTuningSelect());
        section.appendChild(this._buildRow('Tuning', tuningContainer));

        // Handedness toggle
        section.appendChild(this._buildRow('Handedness',
            this._buildToggleGroup(
                [{ value: 'right', label: 'Right' }, { value: 'left', label: 'Left' }],
                this.draft.handedness,
                (val) => { this.draft.handedness = val as 'right' | 'left'; this._emitDraft(); }
            )
        ));

        // Color scheme select
        section.appendChild(this._buildRow('Color Scheme',
            this._buildSelect(
                COLOR_SCHEME_OPTIONS.map(o => ({ value: o.value, text: o.text })),
                this.draft.colorScheme,
                (val) => { this.draft.colorScheme = val as FretboardColorScheme; this._emitDraft(); }
            )
        ));

        return section;
    }

    private _buildTuningSelect(): HTMLSelectElement {
        const settings = this.getSettings();
        const tunings = getAvailableTunings(this.draft.instrument as InstrumentName, settings.customTunings);
        const options = tunings.map(t => ({ value: t.name, text: t.name }));
        return this._buildSelect(options, this.draft.tuning, (val) => {
            this.draft.tuning = val;
            this._emitDraft();
        });
    }

    private _buildSelect(
        options: { value: string; text: string }[],
        currentVal: string,
        onChange: (val: string) => void,
    ): HTMLSelectElement {
        const sel = document.createElement('select');
        sel.className = 'mobile-settings-select';
        for (const opt of options) {
            const o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.text;
            if (opt.value === currentVal) o.selected = true;
            sel.appendChild(o);
        }
        sel.addEventListener('change', () => onChange(sel.value));
        return sel;
    }

    private _buildToggleGroup(
        options: { value: string; label: string }[],
        currentVal: string,
        onChange: (val: string) => void,
    ): HTMLElement {
        const wrap = document.createElement('div');
        wrap.className = 'mobile-settings-toggle-group';

        for (const opt of options) {
            const btn = document.createElement('button');
            btn.className = 'mobile-settings-toggle-btn' + (currentVal === opt.value ? ' is-active' : '');
            btn.textContent = opt.label;
            btn.dataset.val = opt.value;
            btn.addEventListener('click', () => {
                wrap.querySelectorAll<HTMLElement>('.mobile-settings-toggle-btn').forEach(b => {
                    b.classList.toggle('is-active', b.dataset.val === opt.value);
                });
                onChange(opt.value);
            });
            wrap.appendChild(btn);
        }

        return wrap;
    }

    private _buildRow(labelText: string, control: HTMLElement): HTMLElement {
        const row = document.createElement('div');
        row.className = 'mobile-settings-row';
        const lbl = document.createElement('label');
        lbl.className = 'mobile-settings-row-label';
        lbl.textContent = labelText;
        row.append(lbl, control);
        return row;
    }

    private _emitDraft(): void {
        const base = this.getSettings();
        this.onSettingChanged({
            ...base,
            instrumentSettings: { ...base.instrumentSettings, ...this.draft },
        });
    }

    private _emitTheme(theme: Theme): void {
        const base = this.getSettings();
        this.onSettingChanged({ ...base, theme });
    }
}
