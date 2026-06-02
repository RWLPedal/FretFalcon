// ts/fretboard/features/nearby_triads_wizard.ts
import { NoteRenderData, LineData } from '../fretboard';
import { FretboardConfig } from '../fretboard';
import { FretboardView } from '../views/fretboard_view';
import {
  TriadVoicing, RankedVoicing,
  enumerateVoicings, rankVoicingsByTransitionCost,
} from '../nearby_triads_algo';
import { DiatonicMode } from '../music_types';
import { CHORD_ROOTS, getRomansForMode, resolveAbsoluteChordKey } from '../chord_key_resolver';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WizardInProgressState {
  step: 'entry' | 'voicing';
  selectedIdx: number;
  chords: Array<{
    chordKey: string;
    display: string;
    roman: string | null;
    selectedVoicingKey: string;
    seen: boolean;
  }>;
}

export interface WizardChord {
  chordKey: string;
  display: string;       // e.g. "Am", "G7"
  roman: string | null;  // e.g. "vi", null if out of inferred key
  rankedVoicings: RankedVoicing[];
  selectedIndex: number;
  /** True once the user has visited this chord's slot in the voicing step. */
  seen: boolean;
}

interface ChordSuggestion {
  chordKey: string;
  display: string;
  roman: string | null;
  inKey: boolean;
}

// ─── Chord name helpers ───────────────────────────────────────────────────────

const SUFFIX_DISPLAY: Record<string, string> = {
  MAJ: '', MIN: 'm', DIM: 'dim', AUG: 'aug',
  DOM7: '7', MAJ7: 'maj7', MIN7: 'm7', DIM7: 'dim7',
};

const QUALITY_PARSE: Array<[RegExp, string]> = [
  [/^(maj7|M7|△7|Δ7)$/i, 'MAJ7'],
  [/^(m7|min7|-7)$/i,    'MIN7'],
  [/^(dim7|°7)$/i,       'DIM7'],
  [/^(dom7|7)$/i,        'DOM7'],
  [/^(dim|°)$/i,         'DIM'],
  [/^(aug|\+)$/i,        'AUG'],
  [/^(m|min|-)$/i,       'MIN'],
  [/^(maj|M|Δ|△)?$/i,    'MAJ'],
];

const ORDERED_SUFFIXES = ['MAJ', 'MIN', 'DIM', 'DOM7', 'MAJ7', 'MIN7', 'AUG'];

export function chordKeyToDisplay(chordKey: string): string {
  const idx = chordKey.indexOf('_');
  if (idx === -1) return chordKey;
  return chordKey.slice(0, idx) + (SUFFIX_DISPLAY[chordKey.slice(idx + 1)] ?? '');
}

export function parseChordInput(input: string): string | null {
  const t = input.trim();
  const m = t.match(/^([A-Ga-g][b#]?)/);
  if (!m) return null;
  const root = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
  if (!CHORD_ROOTS.includes(root)) return null;
  const qual = t.slice(m[1].length);
  for (const [pat, suf] of QUALITY_PARSE) {
    if (pat.test(qual)) return `${root}_${suf}`;
  }
  return null;
}

export function inferKeyFromChords(chordKeys: string[]): { root: string; mode: DiatonicMode } {
  if (chordKeys.length === 0) return { root: 'C', mode: DiatonicMode.Ionian };
  const MODES: DiatonicMode[] = [DiatonicMode.Ionian, DiatonicMode.Aeolian];
  let bestRoot = 'C';
  let bestMode = DiatonicMode.Ionian;
  let bestCount = -1;
  for (const mode of MODES) {
    const romans = getRomansForMode(mode);
    for (const root of CHORD_ROOTS) {
      const diatonic = new Set(
        romans.map(r => resolveAbsoluteChordKey(r.roman, root, mode)).filter(Boolean) as string[]
      );
      const count = chordKeys.filter(k => diatonic.has(k)).length;
      if (count > bestCount) { bestCount = count; bestRoot = root; bestMode = mode; }
    }
  }
  return { root: bestRoot, mode: bestMode };
}

export function getChordRomanInKey(
  chordKey: string, root: string, mode: DiatonicMode
): string | null {
  const romans = getRomansForMode(mode);
  for (const entry of romans) {
    if (resolveAbsoluteChordKey(entry.roman, root, mode) === chordKey) return entry.roman;
  }
  return null;
}

export function getSuggestions(
  partial: string, root: string, mode: DiatonicMode
): ChordSuggestion[] {
  const p = partial.trim().toLowerCase();
  if (!p) return [];
  const suggestions: ChordSuggestion[] = [];

  // Roman numeral matches (by their display equivalent)
  const romans = getRomansForMode(mode);
  for (const entry of romans) {
    const roman = entry.roman.toLowerCase();
    if (!roman.startsWith(p)) continue;
    const chordKey = resolveAbsoluteChordKey(entry.roman, root, mode);
    if (!chordKey) continue;
    const display = chordKeyToDisplay(chordKey);
    if (!suggestions.some(s => s.chordKey === chordKey)) {
      suggestions.push({ chordKey, display, roman: entry.roman, inKey: true });
    }
  }

  // Chord name prefix matches
  for (const noteRoot of CHORD_ROOTS) {
    for (const suf of ORDERED_SUFFIXES) {
      const chordKey = `${noteRoot}_${suf}`;
      const display = chordKeyToDisplay(chordKey);
      if (!display.toLowerCase().startsWith(p)) continue;
      if (suggestions.some(s => s.chordKey === chordKey)) continue;
      const roman = getChordRomanInKey(chordKey, root, mode);
      suggestions.push({ chordKey, display, roman, inKey: roman !== null });
    }
  }

  suggestions.sort((a, b) => {
    if (a.inKey !== b.inKey) return a.inKey ? -1 : 1;
    if (a.display.length !== b.display.length) return a.display.length - b.display.length;
    return a.display.localeCompare(b.display);
  });
  return suggestions.slice(0, 7);
}

function voicingKey(v: TriadVoicing): string {
  return `${v.frets.join(',')}|${v.stringGroup.join(',')}`;
}

// ─── Ghost note / line builders ───────────────────────────────────────────────

const PREV_FILL     = 'rgba(66, 133, 244, 0.45)';
const PREV_STROKE   = 'rgba(66, 133, 244, 0.9)';
const PREV_LINE     = 'rgba(66, 133, 244, 0.55)';
const NEXT_FILL     = 'transparent';
const NEXT_STROKE   = 'rgba(180, 90, 40, 0.85)';
const NEXT_LINE     = 'rgba(180, 90, 40, 0.55)';
const OUTLINE_STROKE = 'rgba(140,140,140,0.5)';
const HOVER_FILL    = 'rgba(90,153,90,0.45)';
const HOVER_STROKE  = 'rgba(90,153,90,0.85)';

function buildGhostNotes(
  v: TriadVoicing, fill: string, stroke: string
): NoteRenderData[] {
  return v.stringGroup.map((strIdx, i) => ({
    fret: v.frets[i], stringIndex: strIdx,
    noteName: v.notes[i], intervalLabel: v.intervalLabels[i],
    displayLabel: '', fillColor: fill, strokeColor: stroke,
    strokeWidth: 2, opacity: 0.75,
  }));
}

type FbCoordProvider = {
  getNoteCoordinates(s: number, f: number): { x: number; y: number };
  readonly config: { noteRadiusPx: number };
};

function buildTriadLines(
  v: TriadVoicing,
  fb: FbCoordProvider, color: string, dashed: boolean
): LineData[] {
  const r = fb.config.noteRadiusPx;
  const lines: LineData[] = [];
  for (const [a, b] of [[0, 1], [1, 2]] as [number, number][]) {
    const p1 = fb.getNoteCoordinates(v.stringGroup[a], v.frets[a]);
    const p2 = fb.getNoteCoordinates(v.stringGroup[b], v.frets[b]);
    const dx = p2.x - p1.x; const dy = p2.y - p1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < r * 2) continue;
    const nx = dx / dist; const ny = dy / dist;
    lines.push({
      startX: p1.x + r * nx, startY: p1.y + r * ny,
      endX: p2.x - r * nx, endY: p2.y - r * ny,
      color, strokeWidth: 1.5, dashed,
    });
  }
  return lines;
}

// ─── TriadsWizard ─────────────────────────────────────────────────────────────

export class TriadsWizard {
  private step: 'entry' | 'voicing' = 'entry';
  private chords: WizardChord[] = [];
  private selectedIdx: number = 0;
  private inferredRoot: string = 'C';
  private inferredMode: DiatonicMode = DiatonicMode.Ionian;
  private voicingFb: FretboardView | null = null;
  private hoveredVoicing: TriadVoicing | null = null;
  private _voicingCanvasCleanup: (() => void) | null = null;

  constructor(
    private readonly fretboardConfig: FretboardConfig,
    private readonly maxFretSpan: number,
    private readonly targetFret: number | null,
  ) {}

  exportState(): WizardInProgressState {
    return {
      step: this.step,
      selectedIdx: this.selectedIdx,
      chords: this.chords.map(c => {
        const v = c.rankedVoicings[c.selectedIndex]?.voicing;
        return {
          chordKey: c.chordKey,
          display: c.display,
          roman: c.roman,
          selectedVoicingKey: v ? voicingKey(v) : '',
          seen: c.seen,
        };
      }),
    };
  }

  /** Re-enumerate voicings (using current targetFret) and restore wizard to a saved step/selection. */
  restoreState(state: WizardInProgressState): void {
    this.step = state.step;
    this.selectedIdx = Math.min(state.selectedIdx, Math.max(0, state.chords.length - 1));
    this.chords = [];
    let prevVoicing: TriadVoicing | null = null;
    for (const sc of state.chords) {
      const raw    = enumerateVoicings(sc.chordKey, this.fretboardConfig, 15, this.maxFretSpan);
      const ranked = rankVoicingsByTransitionCost(prevVoicing, raw, this.targetFret);
      let selectedIndex = 0;
      if (sc.seen && sc.selectedVoicingKey) {
        const idx = ranked.findIndex(r => voicingKey(r.voicing) === sc.selectedVoicingKey);
        if (idx !== -1) selectedIndex = idx;
      }
      this.chords.push({
        chordKey: sc.chordKey, display: sc.display, roman: sc.roman,
        rankedVoicings: ranked, selectedIndex, seen: sc.seen,
      });
      prevVoicing = ranked[selectedIndex]?.voicing ?? null;
    }
    this._refreshKey();
  }

  /** Pre-populate chord list. No-op if chords already entered. */
  setInitialChords(
    initial: Array<{ chordKey: string; display: string; roman: string | null }>
  ): void {
    if (this.chords.length > 0) return;
    this.chords = initial
      .filter(c => c.chordKey)
      .map(c => ({ ...c, rankedVoicings: [], selectedIndex: 0, seen: false }));
    this._refreshKey();
  }

  private _refreshKey(): void {
    const inferred = inferKeyFromChords(this.chords.map(c => c.chordKey));
    this.inferredRoot = inferred.root;
    this.inferredMode = inferred.mode;
    for (const c of this.chords) {
      c.roman = getChordRomanInKey(c.chordKey, this.inferredRoot, this.inferredMode);
    }
  }

  private _buildVoicings(): void {
    for (let i = 0; i < this.chords.length; i++) {
      const c = this.chords[i];
      const prevVoicing = i > 0
        ? (this.chords[i - 1].rankedVoicings[this.chords[i - 1].selectedIndex]?.voicing ?? null)
        : null;
      const raw = enumerateVoicings(c.chordKey, this.fretboardConfig, 15, this.maxFretSpan);
      c.rankedVoicings = rankVoicingsByTransitionCost(prevVoicing, raw, this.targetFret);
      c.selectedIndex  = 0;
      c.seen           = false;
    }
  }

  /** Re-rank chord i from its predecessor's current voicing and reset to index 0. */
  private _activateChord(i: number): void {
    const c = this.chords[i];
    if (c.seen) return; // preserve user's locked choice
    const prevVoicing = i > 0
      ? (this.chords[i - 1].rankedVoicings[this.chords[i - 1].selectedIndex]?.voicing ?? null)
      : null;
    const raw = enumerateVoicings(c.chordKey, this.fretboardConfig, 15, this.maxFretSpan);
    c.rankedVoicings = rankVoicingsByTransitionCost(prevVoicing, raw, this.targetFret);
    c.selectedIndex  = 0;
    // seen stays false until the user explicitly clicks to lock a voicing
  }

  /**
   * Render wizard into container.
   * onApply is called with selected chords when the user clicks Apply.
   * onCancel is called when the user closes the wizard without applying.
   */
  renderInto(
    container: HTMLElement,
    onApply: (chords: WizardChord[]) => void,
    onCancel: () => void,
  ): void {
    container.innerHTML = '';
    if (this.step === 'entry') {
      this._renderEntry(container, () => {
        this._buildVoicings();
        this.step = 'voicing';
        this.selectedIdx = 0;
        this.renderInto(container, onApply, onCancel);
      }, onCancel);
    } else {
      this._renderVoicing(container,
        () => onApply(this.chords),
        () => {
          this.step = 'entry';
          this.renderInto(container, onApply, onCancel);
        }
      );
    }
  }

  // ─── Step 1: chord entry ────────────────────────────────────────────────────

  private _renderEntry(
    container: HTMLElement,
    onContinue: () => void,
    onCancel: () => void,
  ): void {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:4px 0;';
    container.appendChild(wrap);

    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:0.78rem;color:var(--clr-text-subtle,#888);';
    hint.textContent = 'Type chord names (Am, G7, Fmaj7…) or roman numerals. Press Enter or click to add.';
    wrap.appendChild(hint);

    // ── chip row + input ──────────────────────────────────────────────────────
    const chipRow = document.createElement('div');
    chipRow.style.cssText =
      'display:flex;flex-wrap:wrap;align-items:center;gap:4px;' +
      'border:1px solid var(--clr-border,#ccc);border-radius:6px;padding:4px 6px;' +
      'background:var(--clr-input-bg,transparent);min-height:36px;cursor:text;';
    wrap.appendChild(chipRow);

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'C Am F G …';
    input.style.cssText =
      'border:none;outline:none;background:transparent;font-size:0.85rem;' +
      'min-width:80px;flex:1;padding:2px;color:inherit;';
    chipRow.appendChild(input);
    chipRow.addEventListener('click', () => input.focus());

    // ── dropdown ──────────────────────────────────────────────────────────────
    const dropdown = document.createElement('div');
    dropdown.style.cssText =
      'display:none;border:1px solid var(--clr-border,#ccc);border-radius:6px;' +
      'background:var(--clr-panel,var(--dm-panel,#fff));' +
      'box-shadow:0 4px 12px rgba(0,0,0,0.12);overflow:hidden;';
    wrap.appendChild(dropdown);

    // ── key indicator ─────────────────────────────────────────────────────────
    const keyEl = document.createElement('div');
    keyEl.style.cssText = 'font-size:0.75rem;color:var(--clr-text-subtle,#888);text-align:center;min-height:1em;';
    wrap.appendChild(keyEl);

    // ── buttons ───────────────────────────────────────────────────────────────
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;justify-content:space-between;gap:8px;margin-top:2px;';
    wrap.appendChild(btnRow);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'button is-small';
    cancelBtn.textContent = '← Cancel';
    cancelBtn.addEventListener('click', onCancel);
    btnRow.appendChild(cancelBtn);

    const continueBtn = document.createElement('button');
    continueBtn.className = 'button is-small is-primary';
    continueBtn.textContent = 'Select Voicings →';
    continueBtn.addEventListener('click', () => { if (this.chords.length > 0) onContinue(); });
    btnRow.appendChild(continueBtn);

    // ── internal state ────────────────────────────────────────────────────────
    let suggestions: ChordSuggestion[] = [];
    let highlightIdx = 0;

    const addChord = (chordKey: string, display: string) => {
      if (this.chords.some(c => c.chordKey === chordKey)) return;
      this.chords.push({
        chordKey, display, roman: null, rankedVoicings: [], selectedIndex: 0, seen: false,
      });
      this._refreshKey();
      input.value = '';
      input.placeholder = 'Add chord…';
      refresh();
      input.focus();
    };

    const refresh = () => {
      // Rebuild chips
      while (chipRow.firstChild !== input) chipRow.removeChild(chipRow.firstChild!);
      for (let ci = 0; ci < this.chords.length; ci++) {
        const c = this.chords[ci];
        const chip = document.createElement('span');
        chip.style.cssText =
          'display:inline-flex;align-items:center;gap:2px;' +
          'background:var(--clr-chip,rgba(90,153,90,0.15));' +
          'border:1px solid var(--clr-chip-border,rgba(90,153,90,0.4));' +
          'border-radius:4px;padding:1px 4px 1px 6px;font-size:0.82rem;font-weight:500;white-space:nowrap;';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = c.display + (c.roman ? ` · ${c.roman}` : '');
        chip.appendChild(nameSpan);

        const del = document.createElement('button');
        del.textContent = '×';
        del.style.cssText =
          'background:none;border:none;padding:0 1px;font-size:0.9rem;cursor:pointer;' +
          'opacity:0.5;color:inherit;line-height:1;';
        const capturedIdx = ci;
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          this.chords.splice(capturedIdx, 1);
          this._refreshKey();
          refresh();
        });
        chip.appendChild(del);
        chipRow.insertBefore(chip, input);
      }

      // Key indicator
      if (this.chords.length >= 2) {
        const mLabel = this.inferredMode === DiatonicMode.Ionian ? 'major'
          : this.inferredMode === DiatonicMode.Aeolian ? 'minor'
          : this.inferredMode;
        keyEl.textContent = `Inferred key: ${this.inferredRoot} ${mLabel}`;
      } else {
        keyEl.textContent = '';
      }

      continueBtn.disabled = this.chords.length === 0;

      // Update suggestions for current input
      updateDropdown();
    };

    const updateDropdown = () => {
      const partial = input.value;
      if (!partial.trim()) { dropdown.style.display = 'none'; return; }
      suggestions = getSuggestions(partial, this.inferredRoot, this.inferredMode);
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
        nameEl.textContent = s.display;
        item.appendChild(nameEl);

        if (s.roman) {
          const meta = document.createElement('span');
          meta.style.cssText = 'font-size:0.78rem;color:var(--clr-text-subtle,#888);margin-left:8px;';
          meta.textContent = `${s.roman} · in key`;
          item.appendChild(meta);
        }

        item.addEventListener('mouseenter', () => {
          highlightIdx = i;
          Array.from(dropdown.children).forEach((el, j) =>
            ((el as HTMLElement).style.background =
              j === i ? 'var(--clr-hover,rgba(128,128,128,0.12))' : '')
          );
        });
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          addChord(s.chordKey, s.display);
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
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown')  { e.preventDefault(); shiftHighlight(+1); return; }
      if (e.key === 'ArrowUp')    { e.preventDefault(); shiftHighlight(-1); return; }
      if (e.key === 'Escape')     { dropdown.style.display = 'none'; return; }
      if (e.key === 'Backspace' && input.value === '' && this.chords.length > 0) {
        this.chords.pop();
        this._refreshKey();
        refresh();
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (suggestions.length > 0) {
          const s = suggestions[highlightIdx] ?? suggestions[0];
          addChord(s.chordKey, s.display);
        } else {
          const key = parseChordInput(input.value);
          if (key) addChord(key, chordKeyToDisplay(key));
        }
      }
    });

    refresh();
    setTimeout(() => input.focus(), 0);
  }

  // ─── Step 2: voicing selection ──────────────────────────────────────────────

  private _renderVoicing(
    container: HTMLElement,
    onApply: () => void,
    onBack: () => void,
  ): void {
    // Remove any previous canvas listeners before re-rendering
    this._voicingCanvasCleanup?.();
    this._voicingCanvasCleanup = null;
    this.hoveredVoicing = null;

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:4px 0;';
    container.appendChild(wrap);

    // ── chord tab bar ─────────────────────────────────────────────────────────
    const tabBar = document.createElement('div');
    tabBar.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;justify-content:center;';
    wrap.appendChild(tabBar);

    // ── fretboard ─────────────────────────────────────────────────────────────
    const canvasWrap = document.createElement('div');
    canvasWrap.style.cssText = 'display:flex;justify-content:center;';
    wrap.appendChild(canvasWrap);

    if (!this.voicingFb) {
      this.voicingFb = new FretboardView(this.fretboardConfig, 15, false);
    }
    this.voicingFb.render(canvasWrap);

    // ── chord label ───────────────────────────────────────────────────────────
    const chordLabel = document.createElement('div');
    chordLabel.style.cssText = 'text-align:center;font-size:0.82rem;color:var(--clr-text-subtle,#888);';
    wrap.appendChild(chordLabel);

    // ── status line ───────────────────────────────────────────────────────────
    const statusEl = document.createElement('div');
    statusEl.style.cssText = 'text-align:center;font-size:0.78rem;color:var(--clr-text-subtle,#888);min-height:1.2em;';
    wrap.appendChild(statusEl);

    // ── bottom buttons ────────────────────────────────────────────────────────
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;justify-content:space-between;gap:8px;margin-top:2px;';
    wrap.appendChild(btnRow);

    const backBtn = document.createElement('button');
    backBtn.className = 'button is-small';
    backBtn.textContent = '← Edit chords';
    backBtn.addEventListener('click', onBack);
    btnRow.appendChild(backBtn);

    const applyBtn = document.createElement('button');
    applyBtn.className = 'button is-small is-primary';
    applyBtn.textContent = 'Apply ✓';
    applyBtn.addEventListener('click', onApply);
    btnRow.appendChild(applyBtn);

    // ── helpers ───────────────────────────────────────────────────────────────
    const INVERSION_LABEL: Record<string, string> = { Root: 'Root pos.', '1st': '1st inv.', '2nd': '2nd inv.' };

    const updateStatus = () => {
      const c = this.chords[this.selectedIdx];
      if (!c?.rankedVoicings.length) { statusEl.textContent = 'No voicings'; return; }
      if (c.seen) {
        const rv = c.rankedVoicings[c.selectedIndex];
        const inv = rv?.voicing ? (INVERSION_LABEL[rv.voicing.inversion] ?? rv.voicing.inversion) : '';
        const cost = rv && rv.cost > 0 ? ` · cost ${rv.cost}` : '';
        statusEl.textContent = `✓ ${inv}${cost} · click to unlock`;
      } else if (this.hoveredVoicing) {
        const rv = c.rankedVoicings.find(r => r.voicing === this.hoveredVoicing);
        const inv = INVERSION_LABEL[this.hoveredVoicing.inversion] ?? this.hoveredVoicing.inversion;
        const cost = rv && rv.cost > 0 ? ` · cost ${rv.cost}` : '';
        const rank = rv ? c.rankedVoicings.indexOf(rv) + 1 : '?';
        statusEl.textContent = `${inv} · rank ${rank}/${c.rankedVoicings.length}${cost} · click to lock`;
      } else {
        statusEl.textContent = `${c.rankedVoicings.length} voicings · hover to preview, click to lock`;
      }
    };

    const renderTabs = () => {
      tabBar.innerHTML = '';
      this.chords.forEach((c, i) => {
        const isSel = i === this.selectedIdx;
        const tab = document.createElement('button');
        tab.title = c.roman ? `${c.roman} — ${c.display}` : c.display;
        tab.style.cssText =
          `background:${isSel ? 'var(--clr-accent,#5a9)' : 'var(--clr-btn,rgba(128,128,128,0.1))'};` +
          `color:${isSel ? '#fff' : 'inherit'};` +
          'border:1px solid var(--clr-border,transparent);border-radius:4px;' +
          `padding:3px 8px;font-size:0.82rem;font-weight:${isSel ? '600' : '400'};cursor:pointer;` +
          `display:inline-flex;align-items:center;gap:4px;`;

        const nameSpan = document.createElement('span');
        nameSpan.textContent = c.display;
        tab.appendChild(nameSpan);

        // Locked indicator: filled dot = locked, hollow = not yet locked
        const dot = document.createElement('span');
        dot.style.cssText =
          'display:inline-block;width:6px;height:6px;border-radius:50%;flex-shrink:0;' +
          (c.seen
            ? `background:${isSel ? 'rgba(255,255,255,0.85)' : 'var(--clr-accent,#5a9)'};`
            : `background:transparent;border:1.5px solid ${isSel ? 'rgba(255,255,255,0.6)' : '#aaa'};`);
        tab.appendChild(dot);

        tab.addEventListener('click', () => {
          this._activateChord(i);
          this.selectedIdx = i;
          this.hoveredVoicing = null;
          renderTabs();
          updateFb();
        });
        tabBar.appendChild(tab);
      });
    };

    const updateFb = () => {
      if (!this.voicingFb) return;
      const c = this.chords[this.selectedIdx];
      if (!c?.rankedVoicings.length) {
        this.voicingFb.clearMarkings();
        chordLabel.innerHTML = '';
        updateStatus();
        return;
      }

      const N = this.chords.length;
      const fb = this.voicingFb.getFretboard();
      const notes: NoteRenderData[] = [];
      const lines: LineData[] = [];

      // Resolve key voicings up front so grey-outline pass can use them
      const lockedVoicing = c.seen ? (c.rankedVoicings[c.selectedIndex]?.voicing ?? null) : null;
      const refVoicing    = lockedVoicing ?? this.hoveredVoicing ?? c.rankedVoicings[0]?.voicing ?? null;

      const prevC       = this.selectedIdx > 0 ? this.chords[this.selectedIdx - 1] : null;
      const prevVoicing = prevC ? (prevC.rankedVoicings[prevC.selectedIndex]?.voicing ?? null) : null;

      // Sets used by the grey-outline pass:
      //   activePositions  — positions occupied by the locked or hovered note (skip outline there)
      //   prevPositions    — positions from the previous chord's locked voicing (grey fill = finger stays)
      const activePositions = new Set<string>();
      const prevPositions   = new Set<string>();
      const addPos = (v: TriadVoicing, s: Set<string>) => {
        for (let i = 0; i < 3; i++) s.add(`${v.stringGroup[i]}:${v.frets[i]}`);
      };
      if (lockedVoicing)       addPos(lockedVoicing, activePositions);
      if (this.hoveredVoicing) addPos(this.hoveredVoicing, activePositions);
      if (prevVoicing)         addPos(prevVoicing, prevPositions);

      // Build posMap for all unique voicing positions (used for grey outlines)
      const posMap = new Map<string, { stringIndex: number; fret: number; noteName: string; intervalLabel: string }>();
      for (const rv of c.rankedVoicings) {
        for (let i = 0; i < 3; i++) {
          const key = `${rv.voicing.stringGroup[i]}:${rv.voicing.frets[i]}`;
          if (!posMap.has(key)) {
            posMap.set(key, {
              stringIndex: rv.voicing.stringGroup[i],
              fret:        rv.voicing.frets[i],
              noteName:    rv.voicing.notes[i],
              intervalLabel: rv.voicing.intervalLabels[i],
            });
          }
        }
      }

      // 1. Current chord voicing positions — drawn first so ghost notes paint on top.
      //    Positions occupied by the active (locked/hovered) note are skipped — those are
      //    drawn fully colored in steps 4/5 below.
      for (const [key, pos] of posMap) {
        if (activePositions.has(key)) continue;
        const staysFinger = prevPositions.has(key);
        notes.push({
          fret: pos.fret, stringIndex: pos.stringIndex,
          noteName: pos.noteName, intervalLabel: pos.intervalLabel,
          displayLabel: '',
          fillColor:   staysFinger ? 'rgba(130,130,130,0.55)' : 'rgba(130,130,130,0.32)',
          strokeColor: 'rgba(100,100,100,0.6)',
          strokeWidth: 1.4,
        });
      }

      // 2. Next chord ghost + triad connecting lines — only when locked or actively hovering
      if (this.selectedIdx < N - 1) {
        const nextC = this.chords[this.selectedIdx + 1];
        let nextVoicing: TriadVoicing | null = null;
        if (nextC.seen) {
          nextVoicing = nextC.rankedVoicings[nextC.selectedIndex]?.voicing ?? null;
        } else if (this.hoveredVoicing) {
          const nextRaw = enumerateVoicings(nextC.chordKey, this.fretboardConfig, 15, this.maxFretSpan);
          nextVoicing = rankVoicingsByTransitionCost(this.hoveredVoicing, nextRaw, this.targetFret)[0]?.voicing ?? null;
        }
        if (nextVoicing) {
          notes.push(...buildGhostNotes(nextVoicing, NEXT_FILL, NEXT_STROKE));
          lines.push(...buildTriadLines(nextVoicing, fb, NEXT_LINE, true));
        }
      }

      // 3. Previous chord ghost + triad connecting lines — rendered after next so it sits on top
      if (prevVoicing) {
        notes.push(...buildGhostNotes(prevVoicing, 'transparent', PREV_STROKE));
        lines.push(...buildTriadLines(prevVoicing, fb, PREV_LINE, false));
      }

      // 4. Hovered voicing + triad connecting lines
      if (this.hoveredVoicing && this.hoveredVoicing !== lockedVoicing) {
        for (let i = 0; i < 3; i++) {
          notes.push({
            fret: this.hoveredVoicing.frets[i], stringIndex: this.hoveredVoicing.stringGroup[i],
            noteName: this.hoveredVoicing.notes[i], intervalLabel: this.hoveredVoicing.intervalLabels[i],
            displayLabel: this.hoveredVoicing.intervalLabels[i],
            fillColor: HOVER_FILL, strokeColor: HOVER_STROKE, strokeWidth: 2,
          });
        }
        lines.push(...buildTriadLines(this.hoveredVoicing, fb, HOVER_STROKE, false));
      }

      // 5. Locked voicing + triad connecting lines
      if (lockedVoicing) {
        for (let i = 0; i < 3; i++) {
          notes.push({
            fret: lockedVoicing.frets[i], stringIndex: lockedVoicing.stringGroup[i],
            noteName: lockedVoicing.notes[i], intervalLabel: lockedVoicing.intervalLabels[i],
            displayLabel: lockedVoicing.intervalLabels[i],
          });
        }
        lines.push(...buildTriadLines(lockedVoicing, fb, 'rgba(100,100,100,0.4)', false));
      }

      this.voicingFb.setNotes(notes);
      this.voicingFb.setLines(lines);

      // Colored chord label: prev chord in blue, next chord in orange, current in default
      chordLabel.innerHTML = '';
      if (prevC) {
        const s = document.createElement('span');
        s.style.color = PREV_STROKE;
        s.textContent = `${prevC.display} ← `;
        chordLabel.appendChild(s);
      }
      const curr = document.createElement('span');
      curr.textContent = `${c.display}${c.roman ? ` (${c.roman})` : ''}`;
      chordLabel.appendChild(curr);
      if (this.selectedIdx < N - 1) {
        const s = document.createElement('span');
        s.style.color = NEXT_STROKE;
        s.textContent = ` → ${this.chords[this.selectedIdx + 1].display}`;
        chordLabel.appendChild(s);
      }

      updateStatus();
    };

    // ── Canvas mouse / click handling ─────────────────────────────────────────
    const canvas = this.voicingFb.getCanvasElement();
    if (canvas) {
      const toCanvasCoords = (e: MouseEvent): [number, number] => {
        const sx = canvas.width / (canvas.clientWidth || canvas.width);
        const sy = canvas.height / (canvas.clientHeight || canvas.height);
        return [e.offsetX * sx, e.offsetY * sy];
      };

      const handleMouseMove = (e: MouseEvent) => {
        const [cx, cy] = toCanvasCoords(e);
        const v = this._findVoicingAt(this.chords[this.selectedIdx], cx, cy);
        if (v !== this.hoveredVoicing) {
          this.hoveredVoicing = v;
          canvas.style.cursor = v ? 'pointer' : 'default';
          updateFb();
        }
      };

      const handleMouseLeave = () => {
        if (this.hoveredVoicing !== null) {
          this.hoveredVoicing = null;
          canvas.style.cursor = 'default';
          updateFb();
        }
      };

      const handleClick = (e: MouseEvent) => {
        const c = this.chords[this.selectedIdx];
        if (!c) return;
        const [cx, cy] = toCanvasCoords(e);
        const clicked = this._findVoicingAt(c, cx, cy);
        if (!clicked) return;
        const locked = c.seen ? c.rankedVoicings[c.selectedIndex]?.voicing : null;
        if (clicked === locked) {
          c.seen = false;
          c.selectedIndex = 0;
        } else {
          const idx = c.rankedVoicings.findIndex(r => r.voicing === clicked);
          if (idx !== -1) { c.selectedIndex = idx; c.seen = true; }
        }
        renderTabs();
        updateFb();
      };

      canvas.addEventListener('mousemove', handleMouseMove);
      canvas.addEventListener('mouseleave', handleMouseLeave);
      canvas.addEventListener('click', handleClick);
      this._voicingCanvasCleanup = () => {
        canvas.removeEventListener('mousemove', handleMouseMove);
        canvas.removeEventListener('mouseleave', handleMouseLeave);
        canvas.removeEventListener('click', handleClick);
      };
    }

    // ── Init ──────────────────────────────────────────────────────────────────
    this._activateChord(this.selectedIdx);
    renderTabs();
    updateFb();
  }

  // ─── Hover helpers ────────────────────────────────────────────────────────────

  /**
   * Maps a string index to the 3-string group used for hover selection.
   * The lowest string maps to [0,1,2], the highest to [n-3,n-2,n-1],
   * and all inner strings use the group centered on that string.
   */
  private _targetGroupForString(stringIdx: number): [number, number, number] {
    const n = this.fretboardConfig.tuning.notes.length;
    if (stringIdx <= 0) return [0, 1, 2];
    if (stringIdx >= n - 1) return [n - 3, n - 2, n - 1];
    return [stringIdx - 1, stringIdx, stringIdx + 1];
  }

  /**
   * Returns the best-ranked voicing (in the string group determined by the
   * hovered string) whose note on the hovered string falls within hit radius
   * of (canvasX, canvasY).
   */
  private _findVoicingAt(chord: WizardChord, canvasX: number, canvasY: number): TriadVoicing | null {
    if (!this.voicingFb || !chord?.rankedVoicings.length) return null;
    const fb = this.voicingFb.getFretboard();
    const r  = fb.config.noteRadiusPx;

    // Find the note position (if any) within hit radius of the pointer
    let hitStr = -1, hitFret = -1, hitDist = r + 1;
    for (const rv of chord.rankedVoicings) {
      for (let i = 0; i < 3; i++) {
        const { x, y } = fb.getNoteCoordinates(rv.voicing.stringGroup[i], rv.voicing.frets[i]);
        const d = Math.sqrt((canvasX - x) ** 2 + (canvasY - y) ** 2);
        if (d < r && d < hitDist) {
          hitStr = rv.voicing.stringGroup[i];
          hitFret = rv.voicing.frets[i];
          hitDist = d;
        }
      }
    }
    if (hitStr === -1) return null;

    const tg = this._targetGroupForString(hitStr);
    for (const rv of chord.rankedVoicings) {
      const v = rv.voicing;
      if (v.stringGroup[0] !== tg[0] || v.stringGroup[1] !== tg[1] || v.stringGroup[2] !== tg[2]) continue;
      const ni = v.stringGroup.indexOf(hitStr);
      if (ni !== -1 && v.frets[ni] === hitFret) return v;
    }
    return null;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────────

  destroy(): void {
    this._voicingCanvasCleanup?.();
    this._voicingCanvasCleanup = null;
    this.voicingFb?.destroy();
    this.voicingFb = null;
  }
}
