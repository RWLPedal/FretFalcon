import { Instrument, Tuning } from "./fretboard";

// Pitch-class semitones A=0
const NOTE_NAMES = ["A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#"] as const;

function semitoneToNoteName(semitone: number): string {
  return NOTE_NAMES[((semitone % 12) + 12) % 12];
}

function noteNameToSemitone(name: string): number | null {
  const idx = NOTE_NAMES.findIndex(n => n.toLowerCase() === name.toLowerCase().replace("bb", "#").replace("b", "#").replace("##", "b"));
  if (idx !== -1) return idx;
  // flat -> sharp mapping
  const flatMap: Record<string, string> = { "Bb": "A#", "Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#" };
  const normalized = flatMap[name] ?? name;
  const idx2 = NOTE_NAMES.findIndex(n => n.toLowerCase() === normalized.toLowerCase());
  return idx2 !== -1 ? idx2 : null;
}

export type TuningEditorCallbacks = {
  onSave: (name: string, notes: number[]) => void;
  onDelete: (name: string) => void;
};

export class TuningEditor {
  readonly el: HTMLElement;
  private instrument: Instrument;
  private allTunings: Tuning[];
  private currentNotes: number[];
  private selectedTuningName: string;
  private callbacks: TuningEditorCallbacks;

  // assigned in _build(), called from constructor before any other use
  private pillsContainer!: HTMLElement;
  private saveSection!: HTMLElement;
  private customNameInput!: HTMLInputElement;

  constructor(
    instrument: Instrument,
    initialTuning: Tuning,
    allTunings: Tuning[],
    callbacks: TuningEditorCallbacks
  ) {
    this.instrument = instrument;
    this.allTunings = allTunings;
    this.currentNotes = [...initialTuning.notes];
    this.selectedTuningName = initialTuning.name;
    this.callbacks = callbacks;

    this.el = document.createElement("div");
    this.el.className = "tuning-editor";

    this._build();
  }

  private _isBuiltIn(name: string): boolean {
    return this.instrument.availableTunings.some(t => t.name === name);
  }

  private _currentMatchesNamed(): string | null {
    for (const t of this.allTunings) {
      if (t.notes.length === this.currentNotes.length &&
          t.notes.every((n, i) => n === this.currentNotes[i])) {
        return t.name;
      }
    }
    return null;
  }

  private _build(): void {
    this.el.innerHTML = "";

    // --- Pills row (no Preset dropdown — the parent form's Tuning field handles that) ---
    const pillsRow = document.createElement("div");
    pillsRow.className = "field is-horizontal mb-0";
    const pillLabel = document.createElement("div");
    pillLabel.className = "field-label is-normal";
    pillLabel.innerHTML = '<label class="label">Strings</label>';
    const pillBody = document.createElement("div");
    pillBody.className = "field-body";
    const pillField = document.createElement("div");
    pillField.className = "field";
    const pillWrap = document.createElement("div");
    pillWrap.className = "tuning-pills-wrap";
    this.pillsContainer = document.createElement("div");
    this.pillsContainer.className = "tuning-pills";
    const dirHint = document.createElement("div");
    dirHint.className = "tuning-pills-hint";
    dirHint.textContent = "low → high";
    pillWrap.appendChild(this.pillsContainer);
    pillWrap.appendChild(dirHint);
    pillField.appendChild(pillWrap);
    pillBody.appendChild(pillField);
    pillsRow.appendChild(pillLabel);
    pillsRow.appendChild(pillBody);
    this.el.appendChild(pillsRow);
    this._renderPills();

    // --- Save section (hidden when nothing to show) ---
    this.saveSection = document.createElement("div");
    this.saveSection.className = "field is-horizontal tuning-save-section";
    this.el.appendChild(this.saveSection);
    this._renderSaveSection();
  }

  private _renderPills(): void {
    this.pillsContainer.innerHTML = "";
    this.currentNotes.forEach((semitone, i) => {
      const pill = document.createElement("span");
      pill.className = "tuning-pill tag is-medium";
      pill.title = "Left-click: next note  /  Right-click or Shift+click: previous note";
      pill.textContent = semitoneToNoteName(semitone);
      pill.addEventListener("click", (e) => {
        e.preventDefault();
        const delta = e.shiftKey ? -1 : 1;
        this.currentNotes[i] = ((this.currentNotes[i] + delta) + 12) % 12;
        pill.textContent = semitoneToNoteName(this.currentNotes[i]);
        this._refreshSaveSection();
      });
      pill.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        this.currentNotes[i] = ((this.currentNotes[i] - 1) + 12) % 12;
        pill.textContent = semitoneToNoteName(this.currentNotes[i]);
        this._refreshSaveSection();
      });
      this.pillsContainer.appendChild(pill);
    });
  }

  private _refreshPills(): void {
    const pills = this.pillsContainer.querySelectorAll<HTMLElement>(".tuning-pill");
    if (pills.length !== this.currentNotes.length) {
      this._renderPills();
      return;
    }
    this.currentNotes.forEach((semitone, i) => {
      pills[i].textContent = semitoneToNoteName(semitone);
    });
  }

  private _renderSaveSection(): void {
    this.saveSection.innerHTML = "";

    const matchedName = this._currentMatchesNamed();
    const isCustom = matchedName !== null && !this._isBuiltIn(matchedName);
    const isDirty = matchedName === null;

    // Collapse entirely when a built-in tuning is active
    this.saveSection.style.display = (isDirty || isCustom) ? "" : "none";
    if (!isDirty && !isCustom) return;

    // Align content with the field-body column above (skip the label column)
    const spacer = document.createElement("div");
    spacer.className = "field-label is-normal";
    this.saveSection.appendChild(spacer);

    const row = document.createElement("div");
    row.className = "tuning-save-row";
    this.saveSection.appendChild(row);

    if (isDirty) {
      this.customNameInput = document.createElement("input");
      this.customNameInput.type = "text";
      this.customNameInput.className = "input";
      this.customNameInput.placeholder = "Custom tuning name…";
      row.appendChild(this.customNameInput);

      const saveBtn = document.createElement("button");
      saveBtn.className = "button is-info";
      saveBtn.textContent = "Save as custom";
      saveBtn.addEventListener("click", () => {
        const name = this.customNameInput.value.trim();
        if (!name) { this.customNameInput.focus(); return; }
        this.callbacks.onSave(name, [...this.currentNotes]);
        this.selectedTuningName = name;
        if (!this.allTunings.some(t => t.name === name)) {
          this.allTunings.push({ name, notes: [...this.currentNotes] });
        }
        this._build();
      });
      row.appendChild(saveBtn);

    } else if (isCustom && matchedName) {
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "button is-danger is-outlined";
      deleteBtn.textContent = `Delete "${matchedName}"`;
      deleteBtn.addEventListener("click", () => {
        const name = matchedName!;
        this.callbacks.onDelete(name);
        this.allTunings = this.allTunings.filter(t => t.name !== name);
        const def = this.instrument.defaultTuning;
        this.currentNotes = [...def.notes];
        this.selectedTuningName = def.name;
        this._build();
      });
      row.appendChild(deleteBtn);
    }
  }

  private _refreshSaveSection(): void {
    this._renderSaveSection();
  }

  /** Returns the currently displayed notes array. */
  getCurrentNotes(): number[] {
    return [...this.currentNotes];
  }
}
