// ts/fretboard/features/chord_entry_panel.ts
import { DiatonicMode, DIATONIC_MODE_LABELS } from '../../music/music_types';
import {
  getSuggestions,
  parseChordInput,
  chordKeyToDisplay,
  inferKeyFromChords,
  getChordRomanInKey,
} from './nearby_triads_wizard';
import { getRomansForMode, resolveAbsoluteChordKey } from '../../music/chord_key_resolver';

export interface ChordEntry {
  /** Degree index string "0"â€“"6" when diatonicOnly; absolute chord key "C_MAJ" otherwise. */
  value: string;
  display: string;       // human-readable label: Roman numeral (diatonic) or chord name (free)
  roman: string | null;  // Roman numeral, or null for out-of-key chords in free mode
}

/**
 * Standalone chip+autocomplete chord entry panel.
 *
 * When `diatonicOnly` is true:
 *   - Only in-key chords are offered in autocomplete
 *   - Values stored as 0-based degree indices ("0"â€“"6") â€” transposable with key changes
 *
 * When `diatonicOnly` is false:
 *   - Any chord can be entered by name or Roman numeral
 *   - Values stored as absolute chord keys ("C_MAJ", "Am_MIN", etc.)
 *
 * Duplicates are always allowed.
 */
export class ChordEntryPanel {
  private entries: ChordEntry[] = [];
  private inferredRoot: string;
  private inferredMode: DiatonicMode;

  constructor(
    private readonly rootNote: string,
    private readonly mode: DiatonicMode,
    private readonly diatonicOnly: boolean,
  ) {
    this.inferredRoot = rootNote;
    this.inferredMode = mode;
  }

  setInitialEntries(entries: ChordEntry[]): void {
    this.entries = [...entries];
    if (!this.diatonicOnly) this._refreshInferredKey();
  }

  renderInto(
    container: HTMLElement,
    onApply: (entries: ChordEntry[]) => void,
    onCancel: () => void,
  ): void {
    container.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:4px 0;';
    container.appendChild(wrap);

    // Hint
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:0.78rem;color:var(--clr-text-subtle,#888);';
    hint.textContent = this.diatonicOnly
      ? 'Type a Roman numeral (I, IV, Vâ€¦) or chord name. Duplicates allowed.'
      : 'Type chord names (Am, G7â€¦) or Roman numerals (I, IV, viâ€¦). Duplicates allowed.';
    wrap.appendChild(hint);

    // Chip row + input
    const chipRow = document.createElement('div');
    chipRow.style.cssText =
      'display:flex;flex-wrap:wrap;align-items:center;gap:4px;' +
      'border:1px solid var(--clr-border,#ccc);border-radius:6px;padding:4px 6px;' +
      'background:var(--clr-input-bg,transparent);min-height:36px;cursor:text;';
    wrap.appendChild(chipRow);

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = this.diatonicOnly ? 'I, IV, Vâ€¦' : 'C, Am, G7, or I, IV, viâ€¦';
    input.style.cssText =
      'border:none;outline:none;background:transparent;font-size:0.85rem;' +
      'min-width:80px;flex:1;padding:2px;color:inherit;';
    chipRow.appendChild(input);
    chipRow.addEventListener('click', () => input.focus());

    // Dropdown
    const dropdown = document.createElement('div');
    dropdown.style.cssText =
      'display:none;border:1px solid var(--clr-border,#ccc);border-radius:6px;' +
      'background:var(--clr-panel,var(--dm-panel,#fff));' +
      'box-shadow:0 4px 12px rgba(0,0,0,0.12);overflow:hidden;';
    wrap.appendChild(dropdown);

    // Key indicator
    const keyEl = document.createElement('div');
    keyEl.style.cssText = 'font-size:0.75rem;color:var(--clr-text-subtle,#888);text-align:center;min-height:1em;';
    if (this.diatonicOnly) {
      const mLabel = DIATONIC_MODE_LABELS[this.mode] ?? this.mode;
      keyEl.textContent = `Key: ${this.rootNote} ${mLabel}`;
    }
    wrap.appendChild(keyEl);

    // Buttons
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;justify-content:space-between;gap:8px;margin-top:2px;';
    wrap.appendChild(btnRow);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'button is-small';
    cancelBtn.textContent = 'â† Cancel';
    cancelBtn.addEventListener('click', onCancel);
    btnRow.appendChild(cancelBtn);

    const applyBtn = document.createElement('button');
    applyBtn.className = 'button is-small is-primary';
    applyBtn.textContent = 'Apply âœ“';
    applyBtn.addEventListener('click', () => onApply([...this.entries]));
    btnRow.appendChild(applyBtn);

    // Internal state
    let suggestions: ReturnType<typeof getSuggestions> = [];
    let highlightIdx = 0;

    const addEntry = (chordKey: string, display: string) => {
      let entry: ChordEntry;
      if (this.diatonicOnly) {
        const romans = getRomansForMode(this.mode);
        const degIdx = romans.findIndex(r =>
          resolveAbsoluteChordKey(r.roman, this.rootNote, this.mode) === chordKey
        );
        if (degIdx === -1) return;
        const roman = romans[degIdx].roman;
        entry = { value: String(degIdx), display: roman, roman };
      } else {
        const roman = getChordRomanInKey(chordKey, this.inferredRoot, this.inferredMode);
        entry = { value: chordKey, display, roman };
      }
      this.entries.push(entry);
      if (!this.diatonicOnly) this._refreshInferredKey();
      input.value = '';
      input.placeholder = 'Add chordâ€¦';
      refresh();
      input.focus();
    };

    const refresh = () => {
      // Rebuild chips
      while (chipRow.firstChild !== input) chipRow.removeChild(chipRow.firstChild!);
      for (let ci = 0; ci < this.entries.length; ci++) {
        const e = this.entries[ci];
        const chip = document.createElement('span');
        chip.style.cssText =
          'display:inline-flex;align-items:center;gap:2px;' +
          'background:var(--clr-chip,rgba(90,153,90,0.15));' +
          'border:1px solid var(--clr-chip-border,rgba(90,153,90,0.4));' +
          'border-radius:4px;padding:1px 4px 1px 6px;font-size:0.82rem;font-weight:500;white-space:nowrap;';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = this.diatonicOnly
          ? e.display
          : e.display + (e.roman && e.roman !== e.display ? ` Â· ${e.roman}` : '');
        chip.appendChild(nameSpan);

        const del = document.createElement('button');
        del.textContent = 'Ã—';
        del.style.cssText =
          'background:none;border:none;padding:0 1px;font-size:0.9rem;cursor:pointer;' +
          'opacity:0.5;color:inherit;line-height:1;';
        const capturedIdx = ci;
        del.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.entries.splice(capturedIdx, 1);
          if (!this.diatonicOnly) this._refreshInferredKey();
          refresh();
        });
        chip.appendChild(del);
        chipRow.insertBefore(chip, input);
      }

      // Inferred key indicator (free mode only)
      if (!this.diatonicOnly) {
        if (this.entries.length >= 2) {
          const mLabel = this.inferredMode === DiatonicMode.Ionian ? 'major'
            : this.inferredMode === DiatonicMode.Aeolian ? 'minor'
            : (DIATONIC_MODE_LABELS[this.inferredMode] ?? this.inferredMode);
          keyEl.textContent = `Inferred key: ${this.inferredRoot} ${mLabel}`;
        } else {
          keyEl.textContent = '';
        }
      }

      updateDropdown();
    };

    const updateDropdown = () => {
      const partial = input.value;
      if (!partial.trim()) { dropdown.style.display = 'none'; return; }

      const sugRoot = this.diatonicOnly ? this.rootNote : this.inferredRoot;
      const sugMode = this.diatonicOnly ? this.mode     : this.inferredMode;
      let raw = getSuggestions(partial, sugRoot, sugMode);
      if (this.diatonicOnly) raw = raw.filter(s => s.inKey);
      suggestions = raw;

      if (!suggestions.length) { dropdown.style.display = 'none'; return; }

      dropdown.innerHTML = '';
      highlightIdx = 0;
      suggestions.forEach((s, i) => {
        const item = document.createElement('div');
        item.style.cssText =
          'padding:6px 10px;cursor:pointer;display:flex;justify-content:space-between;' +
          'align-items:center;font-size:0.85rem;';
        if (i === 0) item.style.background = 'var(--clr-hover,rgba(128,128,128,0.12))';

        const nameEl = document.createElement('span');
        nameEl.style.fontWeight = '500';
        // In diatonic mode show "I â€” C" so the user sees both degree and name
        nameEl.textContent = this.diatonicOnly && s.roman
          ? `${s.roman} â€” ${s.display}`
          : s.display;
        item.appendChild(nameEl);

        if (!this.diatonicOnly && s.roman) {
          const meta = document.createElement('span');
          meta.style.cssText = 'font-size:0.78rem;color:var(--clr-text-subtle,#888);margin-left:8px;';
          meta.textContent = `${s.roman} Â· in key`;
          item.appendChild(meta);
        }

        item.addEventListener('mouseenter', () => {
          highlightIdx = i;
          Array.from(dropdown.children).forEach((el, j) =>
            ((el as HTMLElement).style.background =
              j === i ? 'var(--clr-hover,rgba(128,128,128,0.12))' : '')
          );
        });
        item.addEventListener('mousedown', (ev) => {
          ev.preventDefault();
          addEntry(s.chordKey, s.display);
        });
        dropdown.appendChild(item);
      });
      dropdown.style.display = '';
    };

    const shiftHighlight = (delta: number) => {
      highlightIdx = Math.max(0, Math.min(highlightIdx + delta, suggestions.length - 1));
      Array.from(dropdown.children).forEach((el, j) =>
        ((el as HTMLElement).style.background =
          j === highlightIdx ? 'var(--clr-hover,rgba(128,128,128,0.12))' : '')
      );
    };

    input.addEventListener('input', updateDropdown);
    input.addEventListener('blur', () => setTimeout(() => { dropdown.style.display = 'none'; }, 150));
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowDown')  { ev.preventDefault(); shiftHighlight(+1); return; }
      if (ev.key === 'ArrowUp')    { ev.preventDefault(); shiftHighlight(-1); return; }
      if (ev.key === 'Escape')     { dropdown.style.display = 'none'; return; }
      if (ev.key === 'Backspace' && input.value === '' && this.entries.length > 0) {
        this.entries.pop();
        if (!this.diatonicOnly) this._refreshInferredKey();
        refresh();
        return;
      }
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        if (suggestions.length > 0) {
          const s = suggestions[highlightIdx] ?? suggestions[0];
          addEntry(s.chordKey, s.display);
        } else if (!this.diatonicOnly) {
          const key = parseChordInput(input.value);
          if (key) addEntry(key, chordKeyToDisplay(key));
        }
      }
    });

    refresh();
    setTimeout(() => input.focus(), 0);
  }

  private _refreshInferredKey(): void {
    const inferred = inferKeyFromChords(this.entries.map(e => e.value));
    this.inferredRoot = inferred.root;
    this.inferredMode = inferred.mode;
    for (const e of this.entries) {
      e.roman = getChordRomanInKey(e.value, this.inferredRoot, this.inferredMode);
    }
  }

  destroy(): void {
    this.entries = [];
  }
}

/** Converts a stored entry value back to a human-readable display label. */
export function entryDisplayLabel(
  value: string,
  diatonicOnly: boolean,
  rootNote: string,
  mode: DiatonicMode
): string {
  if (diatonicOnly) {
    const degIdx = parseInt(value, 10);
    if (isNaN(degIdx)) return value;
    const romans = getRomansForMode(mode);
    return romans[degIdx]?.roman ?? value;
  }
  return chordKeyToDisplay(value);
}

