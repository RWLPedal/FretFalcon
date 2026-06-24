import { AppSettings } from "./settings";
import { InstrumentCategory } from "./fretboard/fretboard_category";
import { DEFAULT_INSTRUMENT_SETTINGS } from "./fretboard/fretboard_settings";
import {
  INSTRUMENTS,
  InstrumentName,
  getAvailableTunings,
} from "./fretboard/instruments";
import { TuningEditor } from "./fretboard/tuning_editor";
import { ThemeSwatchPicker } from "./core/widgets/theme_swatch_picker";
import { Theme } from "./theme_manager";

type SaveCallback = (newSettings: AppSettings) => void;

interface InstrumentVariant {
  name: InstrumentName;
  label: string;
}
interface InstrumentFamily {
  key: string;
  label: string;
  abbrev: string;
  instruments: InstrumentVariant[];
}

const INSTRUMENT_FAMILIES: InstrumentFamily[] = [
  {
    key: "guitar",
    label: "Guitar",
    abbrev: "GTR",
    instruments: [
      { name: InstrumentName.Guitar, label: "6-string" },
      { name: InstrumentName.SevenStrGuitar, label: "7-string" },
      { name: InstrumentName.EightStrGuitar, label: "8-string" },
      { name: InstrumentName.TenorGuitar, label: "Tenor" },
    ],
  },
  {
    key: "bass",
    label: "Bass",
    abbrev: "BASS",
    instruments: [{ name: InstrumentName.Bass, label: "4-string" }],
  },
  {
    key: "ukulele",
    label: "Ukulele",
    abbrev: "UKE",
    instruments: [{ name: InstrumentName.Ukulele, label: "Standard" }],
  },
  {
    key: "mandolin",
    label: "Mandolin",
    abbrev: "MAND",
    instruments: [
      { name: InstrumentName.Mandolin, label: "Mandolin" },
      { name: InstrumentName.Mandola, label: "Mandola" },
      { name: InstrumentName.IrishBouzouki, label: "Bouzouki" },
    ],
  },
  {
    key: "charango",
    label: "Charango",
    abbrev: "CHGO",
    instruments: [{ name: InstrumentName.Charango, label: "Standard" }],
  },
  {
    key: "banjo",
    label: "Banjo",
    abbrev: "BJO",
    instruments: [{ name: InstrumentName.TenorBanjo, label: "Tenor" }],
  },
];

function familyForInstrument(
  name: InstrumentName,
): InstrumentFamily | undefined {
  return INSTRUMENT_FAMILIES.find((f) =>
    f.instruments.some((v) => v.name === name),
  );
}

const MODAL_HTML = `
<div class="modal" id="settings-modal">
  <div class="modal-background"></div>
  <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="settings-modal-title">
    <header class="modal-card-head settings-modal-head">
      <div class="settings-modal-title">
        <span class="settings-app-label">FretFalcon</span>
        <h2 class="settings-title" id="settings-modal-title">Settings</h2>
      </div>
      <button class="delete" aria-label="close" id="settings-modal-close"></button>
    </header>
    <section class="modal-card-body settings-modal-body">
    </section>
    <footer class="modal-card-foot settings-modal-foot">
      <span class="settings-apply-indicator">
        <span class="settings-apply-dot"></span>
        Changes apply instantly
      </span>
      <button class="button is-ghost" id="settings-reset-button">Reset to defaults</button>
    </footer>
  </div>
</div>
`;

export class SettingsManager {
  private settings: AppSettings;
  private modalEl: HTMLElement | null = null;
  private onSave: SaveCallback;
  private themePicker: ThemeSwatchPicker | null = null;
  private category: InstrumentCategory;
  private previouslyFocused: HTMLElement | null = null;

  constructor(settings: AppSettings, onSave: SaveCallback) {
    this.settings = settings;
    this.onSave = onSave;
    this.category = new InstrumentCategory();
    this.category.updateCustomTunings(settings.customTunings);
    this._injectModal();
  }

  private _injectModal(): void {
    if (document.getElementById("settings-modal")) return;
    const container = document.createElement("div");
    container.innerHTML = MODAL_HTML;
    document.body.appendChild(container);
    this.modalEl = document.getElementById("settings-modal");
    if (!this.modalEl) return;

    this.modalEl
      .querySelector("#settings-modal-close")
      ?.addEventListener("click", () => this.close());
    this.modalEl
      .querySelector(".modal-background")
      ?.addEventListener("click", () => this.close());
    this.modalEl
      .querySelector("#settings-reset-button")
      ?.addEventListener("click", () => this._resetToDefaults());

    // Keyboard support: Esc closes, Tab is trapped within the dialog.
    this.modalEl.addEventListener("keydown", (e) => this._onKeyDown(e));
  }

  private _onKeyDown(e: KeyboardEvent): void {
    if (!this.isOpen()) return;
    if (e.key === "Escape") {
      e.preventDefault();
      this.close();
      return;
    }
    if (e.key === "Tab") this._trapTab(e);
  }

  private _focusableEls(): HTMLElement[] {
    const card = this.modalEl?.querySelector(".modal-card");
    if (!card) return [];
    const sel =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return [...card.querySelectorAll<HTMLElement>(sel)].filter(
      (el) => el.offsetParent !== null,
    );
  }

  private _trapTab(e: KeyboardEvent): void {
    const focusable = this._focusableEls();
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  public open(): void {
    if (!this.modalEl) return;
    this.previouslyFocused = document.activeElement as HTMLElement | null;
    this._populate();
    this.modalEl.classList.add("is-active");
    // Move focus into the dialog for keyboard users.
    (
      this.modalEl.querySelector("#settings-modal-close") as HTMLElement | null
    )?.focus();
  }

  public close(): void {
    this.modalEl?.classList.remove("is-active");
    // Restore focus to whatever opened the modal (e.g. the settings button).
    this.previouslyFocused?.focus?.();
    this.previouslyFocused = null;
  }

  public isOpen(): boolean {
    return this.modalEl?.classList.contains("is-active") ?? false;
  }

  public updateSettings(settings: AppSettings): void {
    this.settings = settings;
    this.category.updateCustomTunings(settings.customTunings);
    if (this.isOpen()) {
      this.themePicker?.setValue(settings.theme);
      const gridEl = this.modalEl?.querySelector(
        "#settings-show-grid",
      ) as HTMLInputElement | null;
      if (gridEl) gridEl.checked = !!settings.showGrid;
    }
  }

  // ── Apply changes immediately ──────────────────────────────────────────────

  private _applyChange(updates: Partial<AppSettings>): void {
    this.settings = { ...this.settings, ...updates };
    this.onSave(this.settings);
  }

  private _applyInstrumentChange(key: string, value: any): void {
    this.settings = {
      ...this.settings,
      instrumentSettings: { ...this.settings.instrumentSettings, [key]: value },
    };
    this.onSave(this.settings);
  }

  private _resetToDefaults(): void {
    this.settings = {
      ...this.settings,
      theme: Theme.WARM,
      showGrid: true,
      instrumentSettings: { ...DEFAULT_INSTRUMENT_SETTINGS },
    };
    this.onSave(this.settings);
    this._populate();
  }

  // ── Section rendering ──────────────────────────────────────────────────────

  private _populate(): void {
    const body = this.modalEl?.querySelector(
      ".settings-modal-body",
    ) as HTMLElement;
    if (!body) return;
    body.innerHTML = "";

    this.category.updateCustomTunings(this.settings.customTunings);

    let sectionNum = 1;

    this._renderAppearanceSection(body, sectionNum++);
    this._renderInstrumentSection(body, sectionNum++);
    this._renderFretboardSection(body, sectionNum++);
  }

  private _renderAppearanceSection(parent: HTMLElement, num: number): void {
    const section = this._makeSection(num, "Appearance", "THEME & CANVAS");

    // Theme picker
    this.themePicker = new ThemeSwatchPicker(
      this.settings.theme,
      "normal",
      (theme) => this._applyChange({ theme }),
    );
    this._appendRow(
      section,
      "Theme",
      "Re-skins the whole app",
      this.themePicker.el,
    );

    // Show grid toggle
    const toggleWrap = document.createElement("label");
    toggleWrap.className = "toggle-switch";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = "settings-show-grid";
    checkbox.checked = !!this.settings.showGrid;
    checkbox.addEventListener("change", () =>
      this._applyChange({ showGrid: checkbox.checked }),
    );
    const slider = document.createElement("span");
    slider.className = "toggle-switch__slider";
    toggleWrap.append(checkbox, slider);
    this._appendRow(
      section,
      "Show grid",
      "Faint alignment grid on the canvas",
      toggleWrap,
    );

    parent.appendChild(section);
  }

  private _renderInstrumentSection(parent: HTMLElement, num: number): void {
    const section = this._makeSection(num, "Instrument", "PICK YOUR TOOL");
    this._populateInstrumentSection(section);
    parent.appendChild(section);
  }

  private _populateInstrumentSection(section: HTMLElement): void {
    // Clear existing rows (keep the section header)
    const header = section.querySelector(".settings-section-header");
    section.innerHTML = "";
    if (header) section.appendChild(header);

    const instrument = this.settings.instrumentSettings.instrument;
    const activeFamily =
      familyForInstrument(instrument) ?? INSTRUMENT_FAMILIES[0];

    // Instrument family picker
    const grid = document.createElement("div");
    grid.className = "settings-instrument-grid";
    INSTRUMENT_FAMILIES.forEach((family) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className =
        "settings-instrument-card" +
        (family.key === activeFamily.key ? " is-active" : "");
      const abbrev = document.createElement("span");
      abbrev.className = "settings-instrument-abbrev";
      abbrev.textContent = family.abbrev;
      const name = document.createElement("span");
      name.className = "settings-instrument-name";
      name.textContent = family.label;
      card.append(abbrev, name);
      card.addEventListener("click", () => {
        const defaultVariant = family.instruments[0];
        const defaultTuning =
          INSTRUMENTS[defaultVariant.name]?.defaultTuning.name ?? "Standard";
        this.settings = {
          ...this.settings,
          instrumentSettings: {
            ...this.settings.instrumentSettings,
            instrument: defaultVariant.name,
            tuning: defaultTuning,
          },
        };
        this.onSave(this.settings);
        this._populateInstrumentSection(section);
      });
      grid.appendChild(card);
    });
    this._appendRow(
      section,
      "Instrument",
      "Picking one loads sensible defaults",
      grid,
    );

    // Configuration segmented (only for families with >1 variant)
    if (activeFamily.instruments.length > 1) {
      const configControl = this._renderSegmented(
        activeFamily.instruments.map((v) => ({
          value: v.name as string,
          text: v.label,
        })),
        instrument as string,
        (val) => {
          const newInstrument = val as InstrumentName;
          const newTuning =
            INSTRUMENTS[newInstrument]?.defaultTuning.name ?? "Standard";
          this.settings = {
            ...this.settings,
            instrumentSettings: {
              ...this.settings.instrumentSettings,
              instrument: newInstrument,
              tuning: newTuning,
            },
          };
          this.onSave(this.settings);
          this._populateInstrumentSection(section);
        },
      );
      this._appendRow(section, "Configuration", "", configControl);
    }

    // Tuning dropdown
    const tuningOptions = getAvailableTunings(
      instrument,
      this.settings.customTunings,
    );
    const currentTuning = this.settings.instrumentSettings.tuning;
    const tuningSelect = document.createElement("select");
    const tuningSelectWrap = document.createElement("div");
    tuningSelectWrap.className = "select is-fullwidth";
    tuningOptions.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.name;
      opt.textContent = t.name;
      opt.selected = t.name === currentTuning;
      tuningSelect.appendChild(opt);
    });
    // Only one tuning to choose from — keep the dropdown but grey it out.
    if (tuningOptions.length <= 1) {
      tuningSelect.disabled = true;
      tuningSelect.title = "Only one tuning available for this instrument";
    }
    tuningSelectWrap.appendChild(tuningSelect);
    tuningSelect.addEventListener("change", () => {
      this._applyInstrumentChange("tuning", tuningSelect.value);
      this._populateInstrumentSection(section);
    });
    this._appendRow(section, "Tuning", "", tuningSelectWrap);

    // TuningEditor — interactive string pills + custom tuning save/delete
    const instrumentDef = INSTRUMENTS[instrument];
    if (instrumentDef) {
      const allTunings = getAvailableTunings(
        instrument,
        this.settings.customTunings,
      );
      const resolvedTuning =
        allTunings.find((t) => t.name === currentTuning) ??
        instrumentDef.defaultTuning;
      const tuningEditor = new TuningEditor(
        instrumentDef,
        resolvedTuning,
        allTunings,
        {
          onSave: (name, notes) => {
            if (!this.settings.customTunings) this.settings.customTunings = {};
            const existing = this.settings.customTunings[instrument] ?? [];
            const idx = existing.findIndex((t) => t.name === name);
            if (idx >= 0) existing[idx] = { name, notes };
            else existing.push({ name, notes });
            this.settings.customTunings[instrument] = existing;
            this.category.updateCustomTunings(this.settings.customTunings);
            this.settings = {
              ...this.settings,
              instrumentSettings: {
                ...this.settings.instrumentSettings,
                tuning: name,
              },
            };
            this.onSave(this.settings);
            this._populateInstrumentSection(section);
          },
          onDelete: (name) => {
            if (!this.settings.customTunings?.[instrument]) return;
            const remaining = this.settings.customTunings[instrument]!.filter(
              (t) => t.name !== name,
            );
            // Prune the key entirely once its last custom tuning is gone, rather
            // than leaving an empty array behind in storage.
            if (remaining.length > 0) {
              this.settings.customTunings[instrument] = remaining;
            } else {
              delete this.settings.customTunings[instrument];
            }
            this.category.updateCustomTunings(this.settings.customTunings);
            this.settings = {
              ...this.settings,
              instrumentSettings: {
                ...this.settings.instrumentSettings,
                tuning: instrumentDef.defaultTuning.name,
              },
            };
            this.onSave(this.settings);
            this._populateInstrumentSection(section);
          },
        },
      );
      section.appendChild(tuningEditor.el);
    }
  }

  private _renderFretboardSection(parent: HTMLElement, num: number): void {
    const section = this._makeSection(
      num,
      "Fretboard & diagrams",
      "HOW NOTES ARE DRAWN",
    );
    const schemaItems = this.category.getGlobalSettingsUISchema();
    const draft: Record<string, any> = {
      ...DEFAULT_INSTRUMENT_SETTINGS,
      ...this.settings.instrumentSettings,
    };

    schemaItems.forEach((item) => {
      if (item.key === "instrument" || item.key === "tuning") return;

      const currentValue = draft[item.key];

      if (item.type === "segmented") {
        const options = item.options ?? [];
        const control = this._renderSegmented(
          options,
          currentValue !== undefined
            ? String(currentValue)
            : (options[0]?.value ?? ""),
          (val) => this._applyInstrumentChange(item.key, val),
        );
        this._appendRow(section, item.label, item.description ?? "", control);
      } else if (item.type === "radio-cards") {
        const options = item.options ?? [];
        const control = this._renderRadioCards(
          options,
          currentValue !== undefined
            ? String(currentValue)
            : (options[0]?.value ?? ""),
          (val) => this._applyInstrumentChange(item.key, val),
        );
        this._appendRow(section, item.label, item.description ?? "", control);
      } else if (item.type === "select") {
        const options = item.getDynamicOptions
          ? item.getDynamicOptions(draft)
          : (item.options ?? []);
        const selectEl = document.createElement("select");
        const selectWrap = document.createElement("div");
        selectWrap.className = "select is-fullwidth";
        options.forEach((opt) => {
          const o = document.createElement("option");
          o.value = opt.value;
          o.textContent = opt.text;
          o.selected = String(currentValue) === opt.value;
          selectEl.appendChild(o);
        });
        selectWrap.appendChild(selectEl);
        selectEl.addEventListener("change", () =>
          this._applyInstrumentChange(item.key, selectEl.value),
        );
        this._appendRow(
          section,
          item.label,
          item.description ?? "",
          selectWrap,
        );
      }
    });

    parent.appendChild(section);
  }

  // ── Control builders ───────────────────────────────────────────────────────

  private _renderSegmented(
    options: { value: string; text: string }[],
    currentValue: string,
    onChange: (val: string) => void,
  ): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "settings-segmented";

    options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "settings-segmented-btn" +
        (opt.value === currentValue ? " is-active" : "");
      btn.textContent = opt.text;
      btn.addEventListener("click", () => {
        wrap
          .querySelectorAll(".settings-segmented-btn")
          .forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        onChange(opt.value);
      });
      wrap.appendChild(btn);
    });

    return wrap;
  }

  private _renderRadioCards(
    options: {
      value: string;
      text: string;
      description?: string;
      dots?: Array<{ label: string; color: string; dim?: boolean }>;
    }[],
    currentValue: string,
    onChange: (val: string) => void,
  ): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "settings-radio-cards";

    options.forEach((opt) => {
      const card = document.createElement("div");
      card.className =
        "settings-radio-card" +
        (opt.value === currentValue ? " is-active" : "");

      const preview = document.createElement("span");
      preview.className = `settings-radio-card-preview settings-radio-card-preview--${opt.value}`;
      if (opt.dots?.length) {
        opt.dots.forEach((dot) => {
          const dotEl = document.createElement("span");
          dotEl.className =
            "settings-radio-dot" + (dot.dim ? " settings-radio-dot--dim" : "");
          dotEl.style.background = dot.color;
          dotEl.textContent = dot.label;
          preview.appendChild(dotEl);
        });
      }

      const content = document.createElement("span");
      content.className = "settings-radio-card-content";
      const title = document.createElement("span");
      title.className = "settings-radio-card-title";
      title.textContent = opt.text;
      content.appendChild(title);
      if (opt.description) {
        const desc = document.createElement("span");
        desc.className = "settings-radio-card-desc";
        desc.textContent = opt.description;
        content.appendChild(desc);
      }

      const check = document.createElement("span");
      check.className = "settings-radio-card-check";

      card.append(preview, content, check);
      card.addEventListener("click", () => {
        wrap
          .querySelectorAll(".settings-radio-card")
          .forEach((c) => c.classList.remove("is-active"));
        card.classList.add("is-active");
        onChange(opt.value);
      });
      wrap.appendChild(card);
    });

    return wrap;
  }

  // ── Layout helpers ─────────────────────────────────────────────────────────

  private _makeSection(num: number, title: string, tag: string): HTMLElement {
    const section = document.createElement("div");
    section.className = "settings-section";

    const header = document.createElement("div");
    header.className = "settings-section-header";

    const numEl = document.createElement("span");
    numEl.className = "settings-section-num";
    numEl.textContent = String(num).padStart(2, "0");

    const titleEl = document.createElement("h3");
    titleEl.className = "settings-section-title";
    titleEl.textContent = title;

    const tagEl = document.createElement("span");
    tagEl.className = "settings-section-tag";
    tagEl.textContent = tag;

    header.append(numEl, titleEl, tagEl);
    section.appendChild(header);
    return section;
  }

  private _appendRow(
    section: HTMLElement,
    labelText: string,
    descText: string,
    controlEl: HTMLElement,
  ): void {
    const row = document.createElement("div");
    row.className = "settings-row";
    // data attribute for targeted updates (e.g. strings display refresh)
    row.dataset.rowKey = labelText.toLowerCase().replace(/\s+/g, "-");

    const labelCol = document.createElement("div");
    labelCol.className = "settings-row-label";

    const label = document.createElement("span");
    label.className = "settings-row-label-text";
    label.textContent = labelText;
    labelCol.appendChild(label);

    if (descText) {
      const desc = document.createElement("span");
      desc.className = "settings-row-label-desc";
      desc.textContent = descText;
      labelCol.appendChild(desc);
    }

    const controlCol = document.createElement("div");
    controlCol.className = "settings-row-control";
    controlCol.appendChild(controlEl);

    row.append(labelCol, controlCol);
    section.appendChild(row);
  }
}
