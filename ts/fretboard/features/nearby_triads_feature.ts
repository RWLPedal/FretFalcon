// ts/fretboard/features/nearby_triads_feature.ts
import {
  Feature,
  ConfigurationSchema,
  ConfigurationSchemaArg,
  ArgType,
  UiComponentType,
  LabelValue,
} from '../../feature';
import { InstrumentFeature, peekPendingCanvasWidth } from '../fretboard_base';
import { AppSettings } from '../../settings';
import { AudioController } from '../../audio_controller';
import { IntervalSettings } from '../../schedule/editor/interval/types';
import { InstrumentIntervalSettings } from '../fretboard_interval_settings';
import {
  DiatonicMode,
  ALL_DIATONIC_MODES,
  DIATONIC_MODE_LABELS,
} from '../music_types';
import { InstrumentName } from '../fretboard';
import { NoteRenderData, LineData } from '../fretboard';
import {
  NOTE_NAMES_FROM_A,
  getKeyIndex,
  getIntervalLabel,
  clearAllChildren,
  addHeader,
} from '../fretboard_utils';
import {
  getRomansForMode,
  resolveAbsoluteChordKey,
  CHORD_ROOTS,
} from '../chord_key_resolver';
import { chord_tones_library } from '../chords';
import { scales } from '../scales';
import { FretboardView } from '../views/fretboard_view';
import {
  TriadVoicing,
  RankedVoicing,
  enumerateVoicings,
  rankVoicingsByTransitionCost,
  transitionCost,
  parseChordKey,
} from '../nearby_triads_algo';
import { SignalKind, SignalState, ChordSignal, KeySignal } from '../../panels/link_types';

// ─── Types ────────────────────────────────────────────────────────────────────

type NearbyTriadsMode = 'reference' | 'compact';

const PALETTE_VARS = [
  'var(--dm-palette-1)',
  'var(--dm-palette-2)',
  'var(--dm-palette-3)',
  'var(--dm-palette-4)',
  'var(--dm-palette-5)',
  'var(--dm-palette-6)',
  'var(--dm-palette-7)',
];

interface ChordSlot {
  degreeIndex: number;
  chordKey: string | null;
  roman: string;
  chordName: string;
  rawVoicings: TriadVoicing[];
  rankedVoicings: RankedVoicing[];
  selectedIndex: number;  // locked-in voicing (shown filled)
  previewIndex: number;   // which of this slot's voicings is previewed as dashed from the previous fretboard
  fretboardView: FretboardView;
  counterEl: HTMLElement | null;
}

// ─── Labels-by-mode helper (same approach as ChordProgressionFeature) ─────────

function buildLabelsByMode(): Record<string, { basic: LabelValue[]; advanced: LabelValue[] }> {
  const result: Record<string, { basic: LabelValue[]; advanced: LabelValue[] }> = {};
  for (const mode of ALL_DIATONIC_MODES) {
    const entries = scales[mode].generateRomanEntries(true);
    const basic = entries.slice(0, 7).map((e, i) => ({ label: e.roman, value: String(i) }));
    result[mode] = { basic, advanced: [] };
  }
  return result;
}

const LABELS_BY_MODE = buildLabelsByMode();

// ─── Note-building helpers ────────────────────────────────────────────────────

const NEXT_CHORD_STROKE = 'rgba(60, 60, 60, 0.75)';
const VOICE_LINE_COLOR  = 'rgba(160, 160, 160, 0.55)';

// No fillColor → fretboard uses the user's configured color scheme (interval or note).
// Pass fillColor only when the color itself is the distinguishing signal (compact mode).
function buildCurrentNotes(voicing: TriadVoicing, fillColor?: string): NoteRenderData[] {
  return voicing.stringGroup.map((strIdx, i) => {
    const note: NoteRenderData = {
      fret:          voicing.frets[i],
      stringIndex:   strIdx,
      noteName:      voicing.notes[i],
      intervalLabel: voicing.intervalLabels[i],
      displayLabel:  voicing.intervalLabels[i],
    };
    if (fillColor !== undefined) note.fillColor = fillColor;
    return note;
  });
}

function buildNextNotes(voicing: TriadVoicing): NoteRenderData[] {
  return voicing.stringGroup.map((strIdx, i) => ({
    fret:          voicing.frets[i],
    stringIndex:   strIdx,
    noteName:      voicing.notes[i],
    intervalLabel: voicing.intervalLabels[i],
    displayLabel:  '',
    fillColor:     'transparent',
    strokeColor:   NEXT_CHORD_STROKE,
    strokeWidth:   2.5,
    dashed:        true,
    opacity:       0.8,
  }));
}

function buildVoicingLines(
  curr: TriadVoicing,
  next: TriadVoicing,
  fb: {
    getNoteCoordinates(s: number, f: number): { x: number; y: number };
    readonly config: { noteRadiusPx: number };
  }
): LineData[] {
  const r = fb.config.noteRadiusPx;
  const lines: LineData[] = [];
  for (let ci = 0; ci < 3; ci++) {
    const label = curr.intervalLabels[ci];
    const ni = next.intervalLabels.indexOf(label);
    if (ni === -1) continue;
    const from = fb.getNoteCoordinates(curr.stringGroup[ci], curr.frets[ci]);
    const to   = fb.getNoteCoordinates(next.stringGroup[ni], next.frets[ni]);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < r * 2) continue; // circles overlap — skip
    const nx = dx / dist;
    const ny = dy / dist;
    lines.push({
      startX: from.x + r * nx, startY: from.y + r * ny,
      endX:   to.x   - r * nx, endY:   to.y   - r * ny,
      color: VOICE_LINE_COLOR, strokeWidth: 1.5, dashed: true,
    });
  }
  return lines;
}

// ─── Feature ──────────────────────────────────────────────────────────────────

export class NearbyTriadsFeature extends InstrumentFeature {
  static readonly typeName       = 'Nearby Triads';
  static readonly displayName    = 'Nearby Triads (Voice Leading)';
  static readonly requiredInstruments = [InstrumentName.Guitar] as const;
  static readonly description    =
    'Shows guitar triads for a chord progression ranked by transition cost for smooth voice leading.';

  readonly typeName = NearbyTriadsFeature.typeName;

  private readonly ntMode: NearbyTriadsMode;
  private readonly progDegrees: number[];
  private readonly rootNote: string;
  private readonly diatonicMode: DiatonicMode;
  private readonly maxFretSpan: number;

  // Reference / Compact state
  private slots: ChordSlot[] = [];
  private compactFretboardView: FretboardView | null = null;

  // Driven state
  private drivenCurrentKey: string | null = null;
  private drivenNextKey: string | null = null;
  private drivenRootNote: string = 'C';
  private drivenDiatonicMode: DiatonicMode = DiatonicMode.Ionian;
  private drivenLastVoicing: TriadVoicing | null = null;
  private drivenFretboardView: FretboardView | null = null;
  private drivenStatusEl: HTMLElement | null = null;
  private drivenSignalHandler: ((e: Event) => void) | null = null;
  private drivenSignalContainer: HTMLElement | null = null;
  private runtimeDrivenActive: boolean = false;
  private linkStatusHandler: ((e: Event) => void) | null = null;
  private linkStatusContainer: HTMLElement | null = null;

  constructor(
    config: ReadonlyArray<string>,
    ntMode: NearbyTriadsMode,
    progDegrees: number[],
    rootNote: string,
    diatonicMode: DiatonicMode,
    maxFretSpan: number,
    settings: AppSettings,
    intervalSettings: InstrumentIntervalSettings,
    audioController?: AudioController,
    maxCanvasHeight?: number
  ) {
    super(config, settings, intervalSettings, audioController, maxCanvasHeight);
    this.ntMode       = ntMode;
    this.progDegrees  = progDegrees.length > 0 ? progDegrees : [1, 4, 5];
    this.rootNote     = rootNote;
    this.diatonicMode = diatonicMode;
    this.maxFretSpan  = maxFretSpan;

    this.initSlots();
    if (ntMode === 'compact') {
      this.compactFretboardView = new FretboardView(this.fretboardConfig, 15);
    }
  }

  // ─── Slot management ─────────────────────────────────────────────────────────

  private initSlots(): void {
    this.slots = [];
    const romans = getRomansForMode(this.diatonicMode);

    for (let i = 0; i < this.progDegrees.length; i++) {
      const deg   = this.progDegrees[i];
      const entry = romans[deg - 1];
      const chordKey  = entry
        ? resolveAbsoluteChordKey(entry.roman, this.rootNote, this.diatonicMode)
        : null;
      const chordEntry = chordKey ? chord_tones_library[chordKey] : null;

      const slot: ChordSlot = {
        degreeIndex:    deg,
        chordKey,
        roman:         entry?.roman ?? String(deg),
        chordName:     chordEntry?.name ?? (chordKey ?? '?'),
        rawVoicings:   [],
        rankedVoicings: [],
        selectedIndex: 0,
        previewIndex:  0,
        fretboardView: new FretboardView(this.fretboardConfig, 15),
        counterEl:     null,
      };
      this.slots.push(slot);
    }

    this.buildAllRawVoicings();
    this.rankAllSlots();
  }

  private buildAllRawVoicings(): void {
    for (const slot of this.slots) {
      slot.rawVoicings = slot.chordKey
        ? enumerateVoicings(slot.chordKey, this.fretboardConfig, 15, this.maxFretSpan)
        : [];
    }
  }

  private rankAllSlots(): void {
    for (let i = 0; i < this.slots.length; i++) {
      const slot    = this.slots[i];
      const prev    = this.slots[(i - 1 + this.slots.length) % this.slots.length];
      const prevVoicing = prev.rankedVoicings[prev.selectedIndex]?.voicing ?? null;
      slot.rankedVoicings = rankVoicingsByTransitionCost(prevVoicing, slot.rawVoicings);
      slot.selectedIndex  = 0;
      slot.previewIndex   = 0;
    }
  }

  private reRankSlot(slotIndex: number): void {
    const slot = this.slots[slotIndex];
    if (!slot) return;
    const prev        = this.slots[(slotIndex - 1 + this.slots.length) % this.slots.length];
    const prevVoicing = prev.rankedVoicings[prev.selectedIndex]?.voicing ?? null;

    const currentVoicing = slot.rankedVoicings[slot.selectedIndex]?.voicing;
    slot.rankedVoicings  = rankVoicingsByTransitionCost(prevVoicing, slot.rawVoicings);
    slot.selectedIndex   = Math.max(
      0,
      Math.min(slot.selectedIndex, slot.rankedVoicings.length - 1)
    );
    // Try to preserve the previously-selected voicing in the new ranking
    if (currentVoicing) {
      const newIdx = slot.rankedVoicings.findIndex(r => r.voicing === currentVoicing);
      if (newIdx !== -1) slot.selectedIndex = newIdx;
    }
    slot.previewIndex = 0;
  }

  // ─── Fretboard note updates ───────────────────────────────────────────────────

  private updateSlotFretboard(slot: ChordSlot, slotIndex: number): void {
    const voicing = slot.rankedVoicings[slot.selectedIndex]?.voicing;
    if (!voicing) { slot.fretboardView.clearMarkings(); return; }

    const nextSlot    = this.slots[(slotIndex + 1) % this.slots.length];
    const nextVoicing = nextSlot?.rankedVoicings[nextSlot.previewIndex]?.voicing;

    const notes: NoteRenderData[] = [
      ...buildCurrentNotes(voicing),
      ...(nextVoicing ? buildNextNotes(nextVoicing) : []),
    ];
    const lines: LineData[] = nextVoicing
      ? buildVoicingLines(voicing, nextVoicing, slot.fretboardView.getFretboard())
      : [];
    slot.fretboardView.setNotes(notes);
    slot.fretboardView.setLines(lines);
    this.updateSlotControls(nextSlot);
  }

  private updateSlotControls(slot: ChordSlot): void {
    if (!slot.counterEl) return;
    const total = slot.rankedVoicings.length;
    const idx   = slot.previewIndex;
    if (total === 0) { slot.counterEl.textContent = '—'; return; }
    const ranked = slot.rankedVoicings[idx];
    const costStr = ranked && ranked.cost > 0 ? ` · ${ranked.cost}` : '';
    slot.counterEl.textContent = `${idx + 1}/${total}${costStr}`;
  }

  private updateCompactFretboard(): void {
    if (!this.compactFretboardView) return;

    const noteMap = new Map<string, { notes: string[]; labels: string[]; colors: string[] }>();

    for (let si = 0; si < this.slots.length; si++) {
      const slot    = this.slots[si];
      const voicing = slot.rankedVoicings[slot.selectedIndex]?.voicing;
      if (!voicing) continue;
      const color = PALETTE_VARS[si % PALETTE_VARS.length];

      for (let i = 0; i < 3; i++) {
        const posKey = `${voicing.stringGroup[i]}:${voicing.frets[i]}`;
        if (!noteMap.has(posKey)) {
          noteMap.set(posKey, { notes: [], labels: [], colors: [] });
        }
        const entry = noteMap.get(posKey)!;
        entry.notes.push(voicing.notes[i]);
        entry.labels.push(voicing.intervalLabels[i]);
        entry.colors.push(color);
      }
    }

    const notes: NoteRenderData[] = [];
    for (const [posKey, entry] of noteMap) {
      const [strStr, fretStr] = posKey.split(':');
      const strIdx  = parseInt(strStr, 10);
      const fretNum = parseInt(fretStr, 10);
      const fills: string[] = entry.colors;
      notes.push({
        fret:          fretNum,
        stringIndex:   strIdx,
        noteName:      entry.notes[0],
        intervalLabel: entry.labels[0],
        displayLabel:  entry.labels[0],
        fillColor:     fills.length >= 2 ? [fills[0], fills[1]] : fills[0],
        strokeColor:   'transparent',
      });
    }
    this.compactFretboardView.setNotes(notes);
  }

  // ─── Header text ─────────────────────────────────────────────────────────────

  private buildHeaderText(): string {
    const modeLabel = DIATONIC_MODE_LABELS[this.diatonicMode] ?? this.diatonicMode;
    const romans = getRomansForMode(this.diatonicMode);
    const progression = this.progDegrees
      .map(d => romans[d - 1]?.roman ?? String(d))
      .join(' – ');
    return `${progression} in ${this.rootNote} ${modeLabel}`;
  }

  // ─── render() ────────────────────────────────────────────────────────────────

  render(container: HTMLElement): void {
    // Clean up any existing listeners
    if (this.drivenSignalContainer && this.drivenSignalHandler) {
      this.drivenSignalContainer.removeEventListener('drive-signal', this.drivenSignalHandler);
      this.drivenSignalHandler   = null;
      this.drivenSignalContainer = null;
    }
    if (this.linkStatusContainer && this.linkStatusHandler) {
      this.linkStatusContainer.removeEventListener('link-status-changed', this.linkStatusHandler);
      this.linkStatusHandler   = null;
      this.linkStatusContainer = null;
    }
    this.runtimeDrivenActive = false;

    clearAllChildren(container);
    const header = addHeader(container, this.buildHeaderText());
    header.classList.add('feature-main-title');

    // Driven toggle button — hidden until a link-status-changed event fires with hasIncomingLinks
    const drivenBtn = document.createElement('button');
    drivenBtn.className = 'button is-small';
    drivenBtn.textContent = 'Driven Mode';
    drivenBtn.style.cssText = 'display:none;margin:4px auto;';
    container.appendChild(drivenBtn);

    const contentArea = document.createElement('div');
    container.appendChild(contentArea);

    const renderContent = () => {
      clearAllChildren(contentArea);
      if (this.drivenSignalContainer && this.drivenSignalHandler) {
        this.drivenSignalContainer.removeEventListener('drive-signal', this.drivenSignalHandler);
        this.drivenSignalHandler   = null;
        this.drivenSignalContainer = null;
      }
      if (this.runtimeDrivenActive) {
        if (!this.drivenFretboardView) {
          this.drivenFretboardView = new FretboardView(this.fretboardConfig, 15);
        }
        drivenBtn.textContent = '← Back';
        this.renderDriven(contentArea);
        this.attachDriveSignalListener(contentArea);
      } else {
        drivenBtn.textContent = 'Driven Mode';
        if (this.ntMode === 'reference') {
          this.renderReference(contentArea);
        } else {
          this.renderCompact(contentArea);
        }
      }
    };

    drivenBtn.addEventListener('click', () => {
      this.runtimeDrivenActive = !this.runtimeDrivenActive;
      renderContent();
    });

    this.linkStatusHandler = (e: Event) => {
      const detail   = (e as CustomEvent).detail;
      const hasLinks = detail?.hasIncomingLinks ?? false;
      drivenBtn.style.display = hasLinks ? '' : 'none';
      if (!hasLinks && this.runtimeDrivenActive) {
        this.runtimeDrivenActive = false;
        renderContent();
      }
    };
    this.linkStatusContainer = container;
    container.addEventListener('link-status-changed', this.linkStatusHandler);

    renderContent();
  }

  // ─── Reference mode ──────────────────────────────────────────────────────────

  private renderReference(container: HTMLElement): void {
    const slotsRow = document.createElement('div');
    slotsRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:8px;';
    container.appendChild(slotsRow);

    this.slots.forEach((slot, i) => {
      const col = document.createElement('div');
      col.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;';

      // Chord label
      const label = document.createElement('div');
      label.style.cssText = 'font-weight:bold;font-size:0.85rem;text-align:center;';
      label.textContent = `${slot.roman} — ${slot.chordName}`;
      col.appendChild(label);

      // Canvas container
      const canvasWrap = document.createElement('div');
      col.appendChild(canvasWrap);
      slot.fretboardView.render(canvasWrap);
      this.updateSlotFretboard(slot, i);

      // Navigation controls
      col.appendChild(this.buildSlotControls(slot, i));
      slotsRow.appendChild(col);
    });
  }

  private buildSlotControls(slot: ChordSlot, slotIndex: number): HTMLElement {
    const N        = this.slots.length;
    const nextSlot = this.slots[(slotIndex + 1) % N];

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;gap:2px;font-size:0.78rem;justify-content:center;';

    const mkNavBtn = (ch: string): HTMLButtonElement => {
      const btn = document.createElement('button');
      btn.textContent = ch;
      btn.style.cssText = 'background:none;border:none;padding:0 3px;font-size:0.85rem;cursor:pointer;opacity:0.6;color:inherit;line-height:1;';
      return btn;
    };

    const prevBtn = mkNavBtn('‹');
    prevBtn.addEventListener('click', () => {
      if (!nextSlot.rankedVoicings.length) return;
      nextSlot.previewIndex = (nextSlot.previewIndex - 1 + nextSlot.rankedVoicings.length) % nextSlot.rankedVoicings.length;
      this.updateSlotFretboard(slot, slotIndex);
    });

    const counter = document.createElement('span');
    counter.style.cssText = 'min-width:58px;text-align:center;';
    nextSlot.counterEl = counter;

    const nextBtn = mkNavBtn('›');
    nextBtn.addEventListener('click', () => {
      if (!nextSlot.rankedVoicings.length) return;
      nextSlot.previewIndex = (nextSlot.previewIndex + 1) % nextSlot.rankedVoicings.length;
      this.updateSlotFretboard(slot, slotIndex);
    });

    const lockBtn = document.createElement('button');
    lockBtn.textContent = '✓';
    lockBtn.title = 'Lock in this voicing for ' + nextSlot.roman;
    lockBtn.style.cssText = 'background:none;border:none;padding:0 4px;font-size:0.8rem;cursor:pointer;color:var(--clr-accent,#5a9);opacity:0.85;line-height:1;';
    lockBtn.addEventListener('click', () => {
      if (!nextSlot.rankedVoicings.length) return;
      nextSlot.selectedIndex = nextSlot.previewIndex;
      const afterIdx = (slotIndex + 2) % N;
      this.reRankSlot(afterIdx); // also resets afterSlot.previewIndex to 0
      this.updateSlotFretboard(slot, slotIndex);
      this.updateSlotFretboard(nextSlot, (slotIndex + 1) % N);
    });

    wrap.appendChild(prevBtn);
    wrap.appendChild(counter);
    wrap.appendChild(nextBtn);
    wrap.appendChild(lockBtn);

    this.updateSlotControls(nextSlot);
    return wrap;
  }

  // ─── Compact mode ────────────────────────────────────────────────────────────

  private renderCompact(container: HTMLElement): void {
    if (!this.compactFretboardView) return;

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;margin-top:8px;';
    container.appendChild(wrap);

    const canvasWrap = document.createElement('div');
    wrap.appendChild(canvasWrap);
    this.compactFretboardView.render(canvasWrap);
    this.updateCompactFretboard();

    wrap.appendChild(this.buildCompactLegend());
  }

  private buildCompactLegend(): HTMLElement {
    const legend = document.createElement('div');
    legend.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;justify-content:center;font-size:0.8rem;';

    this.slots.forEach((slot, i) => {
      const item = document.createElement('span');
      item.style.cssText = 'display:flex;align-items:center;gap:4px;';

      const dot = document.createElement('span');
      dot.style.cssText = `display:inline-block;width:12px;height:12px;border-radius:50%;background:${PALETTE_VARS[i % PALETTE_VARS.length]};flex-shrink:0;`;

      const text = document.createElement('span');
      text.textContent = `${slot.roman} = ${slot.chordName}`;

      item.appendChild(dot);
      item.appendChild(text);
      legend.appendChild(item);
    });
    return legend;
  }

  // ─── Driven mode ─────────────────────────────────────────────────────────────

  private renderDriven(container: HTMLElement): void {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;margin-top:8px;';
    container.appendChild(wrap);

    const status = document.createElement('div');
    status.style.cssText = 'font-size:0.8rem;color:var(--clr-text-subtle,#888);';
    status.textContent = 'Waiting for backing track signal…';
    this.drivenStatusEl = status;
    wrap.appendChild(status);

    if (this.drivenFretboardView) {
      const canvasWrap = document.createElement('div');
      wrap.appendChild(canvasWrap);
      this.drivenFretboardView.render(canvasWrap);
    }
  }

  private attachDriveSignalListener(container: HTMLElement): void {
    this.drivenSignalHandler = (e: Event) => {
      const signal = (e as CustomEvent).detail?.signal;
      if (!signal) return;

      if (signal.kind === SignalKind.Key) {
        const ks = signal as KeySignal;
        this.drivenRootNote     = ks.rootNote;
        const newMode = ks.scaleKey as DiatonicMode;
        if (Object.values(DiatonicMode).includes(newMode)) {
          this.drivenDiatonicMode = newMode;
        }
        return;
      }

      if (signal.kind === SignalKind.Chord) {
        const cs = signal as ChordSignal;
        if (cs.state === SignalState.Next) {
          this.drivenNextKey = cs.chordKey;
        } else {
          this.drivenCurrentKey = cs.chordKey;
          this.updateDrivenFretboard();
        }
      }
    };
    this.drivenSignalContainer = container;
    container.addEventListener('drive-signal', this.drivenSignalHandler);
  }

  private updateDrivenFretboard(): void {
    if (!this.drivenFretboardView) return;

    if (!this.drivenCurrentKey) {
      this.drivenFretboardView.clearMarkings();
      if (this.drivenStatusEl) this.drivenStatusEl.textContent = 'No chord — rest';
      return;
    }

    const currentVoicings = enumerateVoicings(
      this.drivenCurrentKey, this.fretboardConfig, 15, this.maxFretSpan
    );
    const ranked = rankVoicingsByTransitionCost(this.drivenLastVoicing, currentVoicings);
    const selected = ranked[0]?.voicing ?? null;

    let notes: NoteRenderData[] = [];
    if (selected) {
      this.drivenLastVoicing = selected;
      notes = [...buildCurrentNotes(selected)];

      if (this.drivenNextKey) {
        const nextVoicings = enumerateVoicings(
          this.drivenNextKey, this.fretboardConfig, 15, this.maxFretSpan
        );
        const nextRanked = rankVoicingsByTransitionCost(selected, nextVoicings);
        const nextSelected = nextRanked[0]?.voicing;
        if (nextSelected) {
          notes.push(...buildNextNotes(nextSelected));
        }
      }
    }

    this.drivenFretboardView.setNotes(notes);

    if (this.drivenStatusEl) {
      const parsed   = parseChordKey(this.drivenCurrentKey);
      const nextParsed = this.drivenNextKey ? parseChordKey(this.drivenNextKey) : null;
      const curr = parsed ? `${parsed.rootNote} ${parsed.quality}` : this.drivenCurrentKey;
      const next = nextParsed ? `${nextParsed.rootNote} ${nextParsed.quality}` : (this.drivenNextKey ?? '—');
      const cost = ranked[0]?.cost ?? 0;
      this.drivenStatusEl.textContent = `Current: ${curr} | Next: ${next}${this.drivenLastVoicing ? ` | cost: ${cost}` : ''}`;
    }
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────────

  destroy?(): void {
    if (this.drivenSignalContainer && this.drivenSignalHandler) {
      this.drivenSignalContainer.removeEventListener('drive-signal', this.drivenSignalHandler);
    }
    this.drivenSignalHandler   = null;
    this.drivenSignalContainer = null;
    if (this.linkStatusContainer && this.linkStatusHandler) {
      this.linkStatusContainer.removeEventListener('link-status-changed', this.linkStatusHandler);
    }
    this.linkStatusHandler   = null;
    this.linkStatusContainer = null;

    this.slots.forEach(s => s.fretboardView.destroy());
    this.slots = [];
    this.compactFretboardView?.destroy();
    this.compactFretboardView = null;
    this.drivenFretboardView?.destroy();
    this.drivenFretboardView  = null;

    super.destroy?.();
  }

  // ─── Config schema ────────────────────────────────────────────────────────────

  static getConfigurationSchema(): ConfigurationSchema {
    const specificArgs: ConfigurationSchemaArg[] = [
      {
        name: 'Root Note',
        type: ArgType.Enum,
        required: true,
        enum: NOTE_NAMES_FROM_A as string[],
        description: 'Root note of the progression.',
      },
      {
        name: 'Mode',
        type: ArgType.Enum,
        required: true,
        enum: ALL_DIATONIC_MODES as string[],
        enumLabels: ALL_DIATONIC_MODES.map(m => DIATONIC_MODE_LABELS[m]),
        description: 'Diatonic mode.',
        controlsArgName: 'Degrees',
      },
      {
        name: 'Display',
        type: ArgType.Enum,
        required: true,
        enum: ['reference', 'compact'],
        enumLabels: ['Reference', 'Compact'],
        description: 'Display mode.',
      },
      {
        name: 'Degrees',
        type: ArgType.String,
        required: false,
        uiComponentType: UiComponentType.OrderedDegreeList,
        uiComponentData: { labelsByMode: LABELS_BY_MODE },
        isVariadic: true,
        description: 'Ordered chord degrees for the progression — duplicates allowed.',
      },
    ];
    return {
      description: `Config: ${this.typeName},RootNote,Mode,Display[,Deg1,...][,InstrumentSettings]`,
      args: [...specificArgs, InstrumentFeature.BASE_INSTRUMENT_SETTINGS_CONFIG_ARG],
    };
  }

  static createFeature(
    config: ReadonlyArray<string>,
    audioController: AudioController,
    settings: AppSettings,
    intervalSettings: IntervalSettings,
    maxCanvasHeight: number | undefined,
    _categoryName: string
  ): Feature {
    if (config.length < 3) {
      throw new Error(`[${this.typeName}] Config must have at least [RootNote, Mode, Display].`);
    }

    const rootNote  = config[0];
    const modeStr   = config[1];
    const displayStr = config[2] as NearbyTriadsMode;

    const keyIndex = getKeyIndex(rootNote);
    if (keyIndex === -1) throw new Error(`[${this.typeName}] Unknown root note: "${rootNote}"`);
    const validRoot = NOTE_NAMES_FROM_A[keyIndex] ?? rootNote;

    const legacyMap: Record<string, DiatonicMode> = {
      Major: DiatonicMode.Ionian, Minor: DiatonicMode.Aeolian,
    };
    const diatonicMode: DiatonicMode =
      (Object.values(DiatonicMode) as string[]).includes(modeStr)
        ? (modeStr as DiatonicMode)
        : (legacyMap[modeStr] ?? DiatonicMode.Ionian);

    const ntMode: NearbyTriadsMode =
      displayStr === 'compact' ? 'compact' : 'reference';

    // Remaining args after the first 3 are degree index strings ("0"–"6")
    const degreeStrings = config.slice(3).filter(s => /^\d$/.test(s));
    const progDegrees = degreeStrings.length > 0
      ? degreeStrings.map(s => parseInt(s, 10) + 1)
      : [1, 4, 5];

    return new NearbyTriadsFeature(
      config,
      ntMode,
      progDegrees,
      validRoot as string,
      diatonicMode,
      4,
      settings,
      intervalSettings as InstrumentIntervalSettings,
      audioController,
      maxCanvasHeight
    );
  }
}
