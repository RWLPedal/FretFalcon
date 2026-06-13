// ts/fretboard/features/nearby_triads_feature.ts
import {
  Feature,
  FeatureSpec,
  FeatureContext,
  ConfigurationSchema,
  ConfigurationSchemaArg,
  ArgType,
} from '../../feature';
import { featureTypeId } from '../../core/ids';
import { ConfigSpec, FieldCodec } from '../../core/config/spec';
import { enumCodec, stringArrayCodec } from '../../core/config/codecs';
import { buildChordEntryWidget } from './chord_entry_widget';
import { InstrumentFeature } from '../fretboard_base';
import { emitEvent } from '../../core/events';
import { ChordDegreeProgressionFeature, rootNoteArg, modeArg, chordEntryArg } from './chord_degree_base';
import { AppSettings } from '../../settings';
import { DiatonicMode, DIATONIC_MODE_LABELS } from '../../music/music_types';
import { InstrumentName } from '../instruments';
import { FretboardConfig } from '../fretboard_config';
import { NoteRenderData, LineData } from '../renderer';
import { planSingleFretboard } from '../layout';
import { InstrumentSettings, DEFAULT_INSTRUMENT_SETTINGS } from '../fretboard_settings';
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
} from '../../music/chord_key_resolver';
import { chord_tones_library } from '../../music/chords';
import { FretboardView } from '../views/fretboard_view';
import {
  TriadVoicing,
  RankedVoicing,
  enumerateVoicings,
  rankVoicingsByTransitionCost,
  transitionCost,
  parseChordKey,
} from '../../music/nearby_triads_algo';
import { SignalKind, SignalState, ChordSignal, KeySignal } from '../../panels/link_types';
import { TriadsWizard, WizardChord, WizardInProgressState, getChordRomanInKey } from './nearby_triads_wizard';

// ─── Types ────────────────────────────────────────────────────────────────────

type NearbyTriadsMode = 'reference' | 'compact';

/** Compact key identifying a voicing by its physical position (frets + string group). */
function wizardVoicingKey(v: TriadVoicing): string {
  return `${v.frets.join(',')}|${v.stringGroup.join(',')}`;
}

/** Persisted to the container DOM element so wizard state survives feature recreation. */
interface NTWizardPersisted {
  chords: Array<{
    chordKey:   string;
    display:    string;
    roman:      string | null;
    voicingKey: string;  // identifies the selected voicing by physical position
    seen:       boolean; // if true, user explicitly chose this voicing; preserve across re-ranks
  }>;
  dismissed: boolean;
}

const NT_COMPACT_STORAGE_KEY = 'practempo_nearby_triads_compact_v1';

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
  columnEl: HTMLElement | null;  // outer column div in reference mode, for active-chord highlight
}

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

export class NearbyTriadsFeature extends ChordDegreeProgressionFeature {
  static readonly typeName       = 'Nearby Triads';
  static readonly displayName    = 'Nearby Triads (Voice Leading)';
  static readonly requiredInstruments = [
    InstrumentName.Guitar,
    InstrumentName.SevenStrGuitar,
    InstrumentName.EightStrGuitar,
  ] as const;
  static readonly description    =
    'Shows guitar triads for a chord progression ranked by transition cost for smooth voice leading.';

  readonly typeName = NearbyTriadsFeature.typeName;

  private readonly ntMode: NearbyTriadsMode;
  private readonly progDegrees: number[];
  private readonly progChordKeys: string[];
  private readonly rootNote: string;
  private readonly diatonicMode: DiatonicMode;
  private readonly maxFretSpan: number;
  private readonly targetFret: number | null;
  private readonly targetString: number | null;

  // Sized for one slot in reference mode (full-width ÷ N); equals fretboardConfig in other modes.
  private slotFretboardConfig: FretboardConfig;
  private _zoomMultiplier: number = 1.2;
  private _slotsNeedLayout: boolean = false;

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

  // Wizard state (compact mode only)
  private wizard: TriadsWizard | null = null;
  private wizardActive: boolean = false;
  private wizardDismissed: boolean = false;
  private wizardApplied: WizardChord[] | null = null;
  private _renderContainer: HTMLElement | null = null;
  private _wizardStateRestored: boolean = false;
  private _wizardInProgressState: WizardInProgressState | null = null;

  constructor(
    config: ReadonlyArray<string>,
    ntMode: NearbyTriadsMode,
    progDegrees: number[],
    progChordKeys: string[],
    rootNote: string,
    diatonicMode: DiatonicMode,
    maxFretSpan: number,
    targetFret: number | null,
    targetString: number | null,
    settings: AppSettings,
    maxCanvasHeight?: number,
    maxWidth?: number,
  ) {
    super(config, settings, maxCanvasHeight, maxWidth);
    this.ntMode        = ntMode;
    this.progDegrees   = progDegrees;
    this.progChordKeys = progChordKeys;
    this.rootNote      = rootNote;
    this.diatonicMode = diatonicMode;
    this.maxFretSpan   = maxFretSpan;
    this.targetFret    = targetFret;
    this.targetString  = targetString;

    const guitarSettings = (settings.instrumentSettings as InstrumentSettings | undefined)
      ?? DEFAULT_INSTRUMENT_SETTINGS;
    const zoom = guitarSettings.zoomMultiplier ?? 1.2;
    this._zoomMultiplier = zoom;

    // Single-fretboard config (compact + driven modes).
    this.fretboardConfig = planSingleFretboard(this.fretboardConfig, maxWidth, maxCanvasHeight, zoom, 15);

    if (ntMode === 'reference') {
      const N = Math.max(this.progDegrees.length, this.progChordKeys.length);
      const gap = 8;      // matches slotsRow CSS gap
      const slotPad = 8;  // col's padding:4px left + 4px right
      const overhead = 42;       // label + 2×gap(2px) + nav controls + 2×vpad(2px) per slot row
      const rowMargin = 8;       // slotsRow margin-top (fixed, not per-row)
      if (maxWidth && maxCanvasHeight) {
        this.slotFretboardConfig = NearbyTriadsFeature.bestSlotConfig(
          this.fretboardConfig, N, maxWidth, maxCanvasHeight - rowMargin, zoom, gap, slotPad, overhead
        );
      } else {
        const perSlotW = maxWidth ? (maxWidth - (N - 1) * gap - N * slotPad) / N : undefined;
        this.slotFretboardConfig = planSingleFretboard(
          this.fretboardConfig, perSlotW, undefined, zoom, 15
        );
      }
      // If maxWidth was unknown at construction, defer slot sizing to renderReference().
      this._slotsNeedLayout = !maxWidth;
    } else {
      this.slotFretboardConfig = this.fretboardConfig;
    }

    this.initSlots();
    if (ntMode === 'compact') {
      this.compactFretboardView = new FretboardView(this.fretboardConfig, 15);
    }
  }

  // ─── Slot management ─────────────────────────────────────────────────────────

  private initSlots(): void {
    this.slots = [];

    if (this.progChordKeys.length > 0) {
      for (const ck of this.progChordKeys) {
        const chordEntry = chord_tones_library[ck];
        const roman = getChordRomanInKey(ck, this.rootNote, this.diatonicMode);
        const slot: ChordSlot = {
          degreeIndex:    -1,
          chordKey:       ck,
          roman:          roman ?? chordEntry?.name ?? ck,
          chordName:      chordEntry?.name ?? ck,
          rawVoicings:    [],
          rankedVoicings: [],
          selectedIndex:  0,
          previewIndex:   0,
          fretboardView:  new FretboardView(this.slotFretboardConfig, 15),
          counterEl:      null,
          columnEl:       null,
        };
        this.slots.push(slot);
      }
    } else {
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
          fretboardView: new FretboardView(this.slotFretboardConfig, 15),
          counterEl:     null,
          columnEl:      null,
        };
        this.slots.push(slot);
      }
    }

    this.buildAllRawVoicings();
    this.rankAllSlots();
  }

  private buildAllRawVoicings(): void {
    for (const slot of this.slots) {
      slot.rawVoicings = slot.chordKey
        ? enumerateVoicings(slot.chordKey, this.slotFretboardConfig, 15, this.maxFretSpan)
        : [];
    }
  }

  private rankAllSlots(): void {
    for (let i = 0; i < this.slots.length; i++) {
      const slot    = this.slots[i];
      const prev    = this.slots[(i - 1 + this.slots.length) % this.slots.length];
      const prevVoicing = prev.rankedVoicings[prev.selectedIndex]?.voicing ?? null;
      slot.rankedVoicings = rankVoicingsByTransitionCost(prevVoicing, slot.rawVoicings, this.targetFret, this.targetString);
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
    slot.rankedVoicings  = rankVoicingsByTransitionCost(prevVoicing, slot.rawVoicings, this.targetFret);
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
    if (!this.wizardApplied) { this.compactFretboardView.clearMarkings(); return; }
    const fb = this.compactFretboardView.getFretboard();

    // Resolve CSS palette vars → actual rgb() strings for canvas use.
    // Canvas 2D fillStyle/strokeStyle cannot use var() or oklch(), so we
    // assign each var as a CSS color property on a temp element and read
    // back the browser-resolved rgb() string.
    const resolvedColors = this._resolveCanvasPaletteColors();

    type PosEntry = { noteName: string; intervalLabel: string; colors: string[] };
    const noteMap = new Map<string, PosEntry>();

    const source: Array<{ rankedVoicings: RankedVoicing[]; selectedIndex: number }> =
      this.wizardApplied ?? this.slots;

    for (let si = 0; si < source.length; si++) {
      const item    = source[si];
      const voicing = item.rankedVoicings[item.selectedIndex]?.voicing;
      if (!voicing) continue;
      const color = resolvedColors[si % resolvedColors.length];

      for (let i = 0; i < 3; i++) {
        const posKey = `${voicing.stringGroup[i]}:${voicing.frets[i]}`;
        if (!noteMap.has(posKey)) {
          noteMap.set(posKey, {
            noteName:      voicing.notes[i],
            intervalLabel: voicing.intervalLabels[i],
            colors:        [],
          });
        }
        noteMap.get(posKey)!.colors.push(color);
      }
    }

    const notes: NoteRenderData[] = [];
    for (const [posKey, entry] of noteMap) {
      const [strStr, fretStr] = posKey.split(':');
      const strIdx  = parseInt(strStr, 10);
      const fretNum = parseInt(fretStr, 10);
      const n = entry.colors.length;
      notes.push({
        fret:          fretNum,
        stringIndex:   strIdx,
        noteName:      entry.noteName,
        intervalLabel: entry.intervalLabel,
        displayLabel:  entry.noteName,  // always note name, not interval
        fillColor:     n >= 2 ? entry.colors : entry.colors[0],
        strokeColor:   'transparent',
        donut:         n >= 2,
      });
    }

    // Draw faint connecting lines between every pair of notes in each triad.
    const lines: LineData[] = [];
    const r = fb.config.noteRadiusPx;

    for (let si = 0; si < source.length; si++) {
      const item    = source[si];
      const voicing = item.rankedVoicings[item.selectedIndex]?.voicing;
      if (!voicing) continue;
      const color = resolvedColors[si % resolvedColors.length];

      for (let a = 0; a < 2; a++) {
        const from = fb.getNoteCoordinates(voicing.stringGroup[a], voicing.frets[a]);
        const to   = fb.getNoteCoordinates(voicing.stringGroup[a + 1], voicing.frets[a + 1]);
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < r * 2) continue;
        const nx = dx / dist;
        const ny = dy / dist;
        lines.push({
          startX: from.x + r * nx,
          startY: from.y + r * ny,
          endX:   to.x   - r * nx,
          endY:   to.y   - r * ny,
          color,
          strokeWidth: 1,
          opacity:     0.3,
        });
      }
    }

    // Set notes first, then lines. Both calls queue a rAF redraw, but since
    // JS is single-threaded, both setNotes() and setLines() complete before
    // any rAF fires — so the first rAF already sees both data sets.
    this.compactFretboardView.setNotes(notes);
    this.compactFretboardView.setLines(lines);
  }

  private _resolveCanvasPaletteColors(): string[] {
    const tmp = document.createElement('span');
    tmp.style.display = 'none';
    document.body.appendChild(tmp);
    const resolved = PALETTE_VARS.map(cssVar => {
      tmp.style.color = cssVar;
      return getComputedStyle(tmp).color || '#888888';
    });
    document.body.removeChild(tmp);
    return resolved;
  }

  // ─── Header text ─────────────────────────────────────────────────────────────

  private buildHeaderText(): string {
    const modeLabel = DIATONIC_MODE_LABELS[this.diatonicMode] ?? this.diatonicMode;
    if (this.progChordKeys.length > 0) {
      const names = this.progChordKeys.map(ck => {
        const roman = getChordRomanInKey(ck, this.rootNote, this.diatonicMode);
        return roman ?? (chord_tones_library[ck]?.name ?? ck);
      });
      return `${names.join(' – ')} in ${this.rootNote} ${modeLabel}`;
    }
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
    this._renderContainer = container;
    this._tryRestoreWizardState();

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
          // Restore active-chord highlight after any (re)render of reference mode.
          // The persisted value survives instance recreation so post-rebuild renders
          // don't lose the highlight that was current when the rebuild was triggered.
          const persisted = (container as any).__ntActiveChord as string | null | undefined;
          if (persisted != null) {
            this.activeChordKey = persisted;
            this.updateSlotHighlights();
          }
        } else {
          this.renderCompact(contentArea, renderContent);
        }
      }
    };

    this.attachChordSignalListener(container, () => {
      (container as any).__ntActiveChord = this.activeChordKey;
      if (this.ntMode === 'reference') this.updateSlotHighlights();
    }, () => this.runtimeDrivenActive);

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
    // Lazy layout: if maxWidth was unknown at construction, compute correct slot dims
    // from the actual container width now that the DOM is available.
    // If the container is not yet in the DOM (clientWidth === 0, which happens when
    // FloatingViewWrapper calls render() before appendChild), fall back to 420px —
    // the descriptor's defaultWidth — so slots are not created at full default size.
    if (this._slotsNeedLayout) {
      const cs = getComputedStyle(container);
      let w = (container.clientWidth || container.offsetWidth)
        - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      if (w <= 0) w = 420;
      const h = (container.clientHeight || container.offsetHeight)
        - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const N = this.slots.length;
      const gap = 8;
      const slotPad = 8;
      const overhead = 42;
      const rowMargin = 8;
      this.slotFretboardConfig = h > 0
        ? NearbyTriadsFeature.bestSlotConfig(
            this.fretboardConfig, N, w, h - rowMargin, this._zoomMultiplier, gap, slotPad, overhead
          )
        : planSingleFretboard(
            this.fretboardConfig, (w - (N - 1) * gap - N * slotPad) / N, undefined, this._zoomMultiplier, 15
          );
      this.slots.forEach(s => {
        s.fretboardView.destroy();
        s.fretboardView = new FretboardView(this.slotFretboardConfig, 15);
      });
      this.buildAllRawVoicings();
      this.rankAllSlots();
      this._slotsNeedLayout = false;
    }

    if (this.slots.length === 0) {
      const placeholder = document.createElement('div');
      placeholder.style.cssText = 'font-size:0.82rem;color:var(--clr-text-subtle,#888);text-align:center;padding:16px 0;';
      placeholder.textContent = 'No chords configured — add chords in the settings above.';
      container.appendChild(placeholder);
      return;
    }

    const slotsRow = document.createElement('div');
    slotsRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:8px;';
    container.appendChild(slotsRow);

    this.slots.forEach((slot, i) => {
      const col = document.createElement('div');
      col.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;border-radius:6px;padding:2px 4px;transition:box-shadow 0.15s;';
      slot.columnEl = col;

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

    this.updateSlotHighlights();
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

  private renderCompact(container: HTMLElement, reRender: () => void): void {
    if (!this.compactFretboardView) return;

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;margin-top:8px;';
    container.appendChild(wrap);

    // Auto-open wizard on first load (no previous result and not explicitly dismissed)
    if (!this.wizardActive && this.wizardApplied === null && !this.wizardDismissed) {
      this.wizardActive = true;
    }

    if (this.wizardActive) {
      // Lazy-create wizard; initialize from previously applied chords only (no slot defaults)
      if (!this.wizard) {
        this.wizard = new TriadsWizard(this.fretboardConfig, this.maxFretSpan, this.targetFret, this.targetString);
        if (this._wizardInProgressState) {
          this.wizard.restoreState(this._wizardInProgressState);
          this._wizardInProgressState = null;
        } else {
          const initialChords = (this.wizardApplied ?? [])
            .map(c => ({ chordKey: c.chordKey, display: c.display, roman: c.roman }));
          this.wizard.setInitialChords(initialChords);
        }
      }
      this.wizard.renderInto(wrap,
        (chords) => {
          this.wizardApplied = chords;
          this.wizardActive  = false;
          this._persistWizardState(false);
          reRender();
          // Sync applied chord keys back to the config panel.
          const chordKeys = chords.map(c => c.chordKey);
          const renderContainer = this._renderContainer;
          if (renderContainer) {
            setTimeout(() => {
              emitEvent(renderContainer, 'nt-chord-keys-update', { chordKeys });
            }, 0);
          }
        },
        () => {
          this.wizardActive    = false;
          this.wizardDismissed = true;
          this._persistWizardState(true);
          reRender();
        }
      );
      return;
    }

    // Standard compact view
    const editBtn = document.createElement('button');
    editBtn.className = 'button is-small';
    editBtn.style.cssText = 'align-self:flex-end;margin-right:4px;font-size:0.75rem;';
    editBtn.textContent = '✎ Edit chords & voicings';
    editBtn.addEventListener('click', () => {
      this.wizardActive = true;
      // Reset wizard so it re-initializes from current applied state
      this.wizard?.destroy();
      this.wizard = null;
      reRender();
    });
    wrap.appendChild(editBtn);

    if (this.wizardApplied) {
      const canvasWrap = document.createElement('div');
      wrap.appendChild(canvasWrap);
      this.compactFretboardView.render(canvasWrap);
      this.updateCompactFretboard();
      wrap.appendChild(this.buildCompactLegend());
    } else {
      const placeholder = document.createElement('div');
      placeholder.style.cssText =
        'font-size:0.82rem;color:var(--clr-text-subtle,#888);text-align:center;padding:16px 0;';
      placeholder.textContent = 'No chords selected yet. Click Edit to set up your progression.';
      wrap.appendChild(placeholder);
    }
  }

  private buildCompactLegend(): HTMLElement {
    const legend = document.createElement('div');
    legend.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;justify-content:center;font-size:0.8rem;';

    if (this.wizardApplied) {
      this.wizardApplied.forEach((c, i) => {
        const item = document.createElement('span');
        item.style.cssText = 'display:flex;align-items:center;gap:4px;';
        const dot = document.createElement('span');
        dot.style.cssText = `display:inline-block;width:12px;height:12px;border-radius:50%;background:${PALETTE_VARS[i % PALETTE_VARS.length]};flex-shrink:0;`;
        const text = document.createElement('span');
        text.textContent = c.roman ? `${c.roman} = ${c.display}` : c.display;
        item.appendChild(dot);
        item.appendChild(text);
        legend.appendChild(item);
      });
    } else {
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
    }
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
    const ranked = rankVoicingsByTransitionCost(this.drivenLastVoicing, currentVoicings, this.targetFret, this.targetString);
    const selected = ranked[0]?.voicing ?? null;

    let notes: NoteRenderData[] = [];
    if (selected) {
      this.drivenLastVoicing = selected;
      notes = [...buildCurrentNotes(selected)];

      if (this.drivenNextKey) {
        const nextVoicings = enumerateVoicings(
          this.drivenNextKey, this.fretboardConfig, 15, this.maxFretSpan
        );
        const nextRanked = rankVoicingsByTransitionCost(selected, nextVoicings, this.targetFret, this.targetString);
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

  // ─── Active-chord highlight ───────────────────────────────────────────────────

  private updateSlotHighlights(): void {
    for (const slot of this.slots) {
      if (!slot.columnEl) continue;
      const isActive = slot.chordKey !== null && slot.chordKey === this.activeChordKey;
      slot.columnEl.style.boxShadow = isActive ? '0 0 0 2px var(--clr-accent, #5a9)' : '';
    }
  }

  // ─── Wizard persistence (survives feature recreation on config change) ───────

  private _loadFromLocalStorage(): NTWizardPersisted | null {
    try {
      const stored = localStorage.getItem(NT_COMPACT_STORAGE_KEY);
      return stored ? JSON.parse(stored) as NTWizardPersisted : null;
    } catch {
      return null;
    }
  }

  /** Save applied wizard state to the outer container element and localStorage. */
  private _persistWizardState(dismissed: boolean): void {
    if (!this._renderContainer) return;
    const chords = (this.wizardApplied ?? []).map(c => {
      const v = c.rankedVoicings[c.selectedIndex]?.voicing;
      return {
        chordKey:   c.chordKey,
        display:    c.display,
        roman:      c.roman,
        voicingKey: v ? wizardVoicingKey(v) : '',
        seen:       c.seen,
      };
    });
    const data: NTWizardPersisted = { chords, dismissed };
    (this._renderContainer as any).__ntWizard = data;
    try { localStorage.setItem(NT_COMPACT_STORAGE_KEY, JSON.stringify(data)); } catch {}
  }

  /** On first render after recreation, restore wizard state from the container. */
  private _tryRestoreWizardState(): void {
    if (this.ntMode !== 'compact') return;
    if (this._wizardStateRestored) return;
    this._wizardStateRestored = true;

    // In-progress state (mid-wizard rebuild) always takes priority.
    const ip = (this._renderContainer as any)?.__ntWizardInProgress as WizardInProgressState | undefined;
    if (ip) {
      delete (this._renderContainer as any).__ntWizardInProgress;
      this.wizardActive = true;
      this._wizardInProgressState = ip;
      // Also restore applied state so cancel returns to the compact view correctly.
      const p2 = (this._renderContainer as any)?.__ntWizard as NTWizardPersisted | undefined;
      if (p2) {
        this.wizardDismissed = p2.dismissed;
        if (p2.chords.length > 0) {
          this.wizardApplied = this._restoreWizardApplied(p2.chords);
        }
      }
      return;
    }

    const domState = (this._renderContainer as any)?.__ntWizard as NTWizardPersisted | undefined;
    const p = domState ?? this._loadFromLocalStorage();

    if (this.progChordKeys.length > 0) {
      // Config has chord keys — treat them as the authoritative chord list.
      const savedKeys = p?.chords.map(c => c.chordKey) ?? [];
      const chordsMatch = savedKeys.length === this.progChordKeys.length &&
        savedKeys.every((k, i) => k === this.progChordKeys[i]);

      if (chordsMatch && p) {
        // Exact match — use saved state to preserve voicings and dismissed flag.
        this.wizardDismissed = p.dismissed;
        this.wizardApplied = this._restoreWizardApplied(p.chords);
      } else {
        // Config changed — reconcile: use config chord list, preserve voicings for unchanged chords.
        const savedMap = new Map((p?.chords ?? []).map(c => [c.chordKey, c]));
        const reconciledChords: NTWizardPersisted['chords'] = this.progChordKeys.map(ck => {
          const saved = savedMap.get(ck);
          if (saved) return saved;
          const roman = getChordRomanInKey(ck, this.rootNote, this.diatonicMode);
          const display = chord_tones_library[ck]?.name ?? ck;
          return { chordKey: ck, display, roman, voicingKey: '', seen: false };
        });
        this.wizardApplied = this._restoreWizardApplied(reconciledChords);
        this._persistWizardState(false);
      }
    } else if (p) {
      // No config chords — use wizard's saved state.
      this.wizardDismissed = p.dismissed;
      if (p.chords.length > 0) {
        this.wizardApplied = this._restoreWizardApplied(p.chords);
      }
    }
  }

  /**
   * Re-enumerate and re-rank voicings with the current targetFret.
   * Seen chords: find the same physical voicing in the new ranking (by frets+strings key).
   * Unseen chords: use index 0 — cheapest under the new cost function.
   */
  private _restoreWizardApplied(
    saved: NTWizardPersisted['chords']
  ): WizardChord[] {
    const result: WizardChord[] = [];
    let prevVoicing: TriadVoicing | null = null;

    for (const p of saved) {
      const raw    = enumerateVoicings(p.chordKey, this.fretboardConfig, 15, this.maxFretSpan);
      const ranked = rankVoicingsByTransitionCost(prevVoicing, raw, this.targetFret, this.targetString);

      let selectedIndex = 0;
      if (p.seen && p.voicingKey) {
        const idx = ranked.findIndex(r => wizardVoicingKey(r.voicing) === p.voicingKey);
        if (idx !== -1) selectedIndex = idx;
      }

      result.push({
        chordKey:       p.chordKey,
        display:        p.display,
        roman:          p.roman,
        rankedVoicings: ranked,
        selectedIndex,
        seen:           p.seen,
      });
      prevVoicing = ranked[selectedIndex]?.voicing ?? null;
    }

    return result;
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
    if (this.wizardActive && this.wizard && this._renderContainer) {
      (this._renderContainer as any).__ntWizardInProgress = this.wizard.exportState();
    }
    this.wizard?.destroy();
    this.wizard = null;

    super.destroy?.();
  }

  // ─── Layout helpers ──────────────────────────────────────────────────────────

  /**
   * Finds the column count (1..N) that maximises canvas area for the N-slot
   * reference grid, then returns a FretboardConfig sized to that canvas.
   * The flex-wrap layout naturally produces the chosen column count because
   * the canvas width determines the slot column width.
   */
  private static bestSlotConfig(
    base: FretboardConfig,
    N: number,
    maxWidth: number,
    availH: number,
    zoom: number,
    gap: number,
    slotPad: number,
    overhead: number
  ): FretboardConfig {
    const aspectRatio = base.getAspectRatio(15);
    let bestArea = -1;
    let bestW = 0;
    let bestH = 0;
    for (let cols = 1; cols <= N; cols++) {
      const rows = Math.ceil(N / cols);
      const bW = (maxWidth - (cols - 1) * gap) / cols - slotPad;
      const bH = (availH - (rows - 1) * gap) / rows - overhead;
      if (bW <= 0 || bH <= 0) continue;
      let eW: number, eH: number;
      if (bW / bH > aspectRatio) {
        eH = bH; eW = eH * aspectRatio;
      } else {
        eW = bW; eH = eW / aspectRatio;
      }
      const area = eW * eH;
      if (area > bestArea) {
        bestArea = area; bestW = eW; bestH = eH;
      }
    }
    return planSingleFretboard(base, bestW || undefined, bestH || undefined, zoom, 15);
  }

  // ─── Config schema ────────────────────────────────────────────────────────────

  static getConfigurationSchema(): ConfigurationSchema {
    const displayArg: ConfigurationSchemaArg = {
      name: 'Display',
      type: ArgType.Enum,
      required: true,
      enum: ['compact', 'reference'],
      enumLabels: ['Compact', 'Reference'],
      description: 'Display mode.',
    };
    const fretNums = Array.from({ length: 15 }, (_, i) => i + 1);
    const targetFretArg: ConfigurationSchemaArg = {
      name: 'Target Fret',
      type: ArgType.Enum,
      required: false,
      enum: ['none', ...fretNums.map(n => `fret:${n}`)],
      enumLabels: ['None', ...fretNums.map(String)],
      defaultValue: 'none',
      description: 'Center voicings around this fret position (adds 0.5 cost per fret of distance per note).',
    };
    const stringNums = Array.from({ length: 8 }, (_, i) => i + 1);
    const targetStringArg: ConfigurationSchemaArg = {
      name: 'Target String',
      type: ArgType.Enum,
      required: false,
      enum: ['none', ...stringNums.map(n => `string:${n}`)],
      enumLabels: ['None', ...stringNums.map(String)],
      defaultValue: 'none',
      description: 'Prefer voicings that include this string (adds cost per string of distance). String 1 is lowest/thickest.',
    };
    return {
      description: `Config: ${this.typeName},RootNote,Mode,Display[,TargetFret][,TargetString][,ChordKey,...][,InstrumentSettings]`,
      args: [rootNoteArg(), modeArg(), displayArg, targetFretArg, targetStringArg, chordEntryArg(false)],
    };
  }

  static createFeature(
    config: ReadonlyArray<string>,
    settings: AppSettings,
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

    // Remaining args after the first 3 are degree index strings ("0"–"6"), a target fret ("fret:N"), or a target string ("string:N").
    const targetFretStr = config.slice(3).find(s => /^fret:\d+$/.test(s));
    const targetFret = targetFretStr ? parseInt(targetFretStr.slice(5), 10) : null;

    const targetStringStr = config.slice(3).find(s => /^string:\d+$/.test(s));
    // convert 1-indexed UI value to 0-indexed internal string index
    const targetString = targetStringStr ? parseInt(targetStringStr.slice(7), 10) - 1 : null;

    // New format: absolute chord keys (ChordEntryWidget diatonicOnly=false)
    const chordKeyStrings = config.slice(3).filter(s => /^[A-G][b#]?_[A-Z0-9]+$/.test(s));
    // Legacy format: 0-based degree index strings "0"–"6"
    const degreeStrings = config.slice(3).filter(s => /^\d$/.test(s));

    let progChordKeys: string[];
    let progDegrees: number[];
    if (chordKeyStrings.length > 0) {
      progChordKeys = chordKeyStrings;
      progDegrees = [];
    } else {
      progChordKeys = [];
      progDegrees = degreeStrings.map(s => parseInt(s, 10) + 1);
    }

    return new NearbyTriadsFeature(
      config,
      ntMode,
      progDegrees,
      progChordKeys,
      validRoot as string,
      diatonicMode,
      4,
      targetFret,
      targetString,
      settings,
      maxCanvasHeight
    );
  }
}

// ─── FeatureSpec ─────────────────────────────────────────────────────────────

export interface NearbyTriadsConfig {
  rootNote: string;
  mode: DiatonicMode;
  display: string;
  targetFret: string;
  targetString: string;
  chords: string[];
}

const ALL_DIATONIC_MODES_NT = Object.values(DiatonicMode) as DiatonicMode[];
const NT_FRET_NUMS = Array.from({ length: 15 }, (_, i) => i + 1);
const NT_STRING_NUMS = Array.from({ length: 8 }, (_, i) => i + 1);

const nearbyTriadsConfigSpec: ConfigSpec<NearbyTriadsConfig> = {
  rootNote: {
    label: 'Root Note',
    codec: enumCodec(NOTE_NAMES_FROM_A as readonly string[]) as FieldCodec<string>,
    ui: { kind: 'select', options: (NOTE_NAMES_FROM_A as string[]).map(n => ({ value: n })) },
    defaultValue: 'C',
    drivable: {
      kinds: [SignalKind.Chord, SignalKind.Key],
      fromSignal: (s) => (s as ChordSignal).rootNote ?? (s as KeySignal).rootNote ?? undefined,
    },
  },
  mode: {
    label: 'Mode',
    codec: enumCodec(ALL_DIATONIC_MODES_NT),
    ui: {
      kind: 'select',
      options: ALL_DIATONIC_MODES_NT.map(m => ({ value: m, label: DIATONIC_MODE_LABELS[m] ?? m })),
    },
    defaultValue: DiatonicMode.Ionian,
    controls: 'chords',
    drivable: {
      kinds: [SignalKind.Key],
      fromSignal: (s) => {
        const ks = s as KeySignal;
        return (ALL_DIATONIC_MODES_NT as string[]).includes(ks.scaleKey)
          ? (ks.scaleKey as DiatonicMode) : undefined;
      },
    },
  },
  display: {
    label: 'Display',
    codec: enumCodec(['compact', 'reference'] as const),
    ui: { kind: 'select', options: [{ value: 'compact', label: 'Compact' }, { value: 'reference', label: 'Reference' }] },
    defaultValue: 'compact',
  },
  targetFret: {
    label: 'Target Fret',
    codec: enumCodec(['none', ...NT_FRET_NUMS.map(n => `fret:${n}`)] as const),
    ui: {
      kind: 'select',
      options: [
        { value: 'none', label: 'None' },
        ...NT_FRET_NUMS.map(n => ({ value: `fret:${n}`, label: String(n) })),
      ],
    },
    defaultValue: 'none',
  },
  targetString: {
    label: 'Target String',
    codec: enumCodec(['none', ...NT_STRING_NUMS.map(n => `string:${n}`)] as const),
    ui: {
      kind: 'select',
      options: [
        { value: 'none', label: 'None' },
        ...NT_STRING_NUMS.map(n => ({ value: `string:${n}`, label: String(n) })),
      ],
    },
    defaultValue: 'none',
  },
  chords: {
    label: 'Chords',
    codec: stringArrayCodec as FieldCodec<string[]>,
    ui: {
      kind: 'custom',
      render: (container, ctx) => buildChordEntryWidget(container, ctx, false),
    },
    defaultValue: [],
  },
};

export const NearbyTriadsFeatureSpec: FeatureSpec<NearbyTriadsConfig> = {
  id: featureTypeId(NearbyTriadsFeature.typeName),
  displayName: 'Nearby Triads',
  description: NearbyTriadsFeature.description ?? 'Visualize nearby triad voicings for chord progressions.',
  configSpec: nearbyTriadsConfigSpec,
  legacyArgOrder: ['rootNote', 'mode', 'display', 'targetFret', 'targetString', 'chords'],
  legacyVariadicTail: 'chords',
  create(config: NearbyTriadsConfig, ctx: FeatureContext): Feature {
    const legacyMap: Record<string, DiatonicMode> = {
      Major: DiatonicMode.Ionian, Minor: DiatonicMode.Aeolian,
    };
    const mode = (ALL_DIATONIC_MODES_NT as string[]).includes(config.mode)
      ? config.mode
      : (legacyMap[config.mode] ?? DiatonicMode.Ionian);

    const keyIndex = getKeyIndex(config.rootNote);
    const validRoot = keyIndex !== -1
      ? (NOTE_NAMES_FROM_A[keyIndex] ?? config.rootNote)
      : config.rootNote;

    const ntMode = config.display === 'compact' ? 'compact' : 'reference';

    const targetFretStr = config.targetFret;
    const targetFret = /^fret:\d+$/.test(targetFretStr)
      ? parseInt(targetFretStr.slice(5), 10) : null;

    const targetStringStr = config.targetString;
    const targetString = /^string:\d+$/.test(targetStringStr)
      ? parseInt(targetStringStr.slice(7), 10) - 1 : null;

    const chordKeyStrings = config.chords.filter(s => /^[A-G][b#]?_[A-Z0-9]+$/.test(s));
    const degreeStrings = config.chords.filter(s => /^\d$/.test(s));

    let progChordKeys: string[];
    let progDegrees: number[];
    if (chordKeyStrings.length > 0) {
      progChordKeys = chordKeyStrings;
      progDegrees = [];
    } else {
      progChordKeys = [];
      progDegrees = degreeStrings.map(s => parseInt(s, 10) + 1);
    }

    return new NearbyTriadsFeature(
      [],
      ntMode as NearbyTriadsMode,
      progDegrees,
      progChordKeys,
      validRoot,
      mode,
      4,
      targetFret,
      targetString,
      ctx.settings,
      ctx.constraints.maxHeight,
      ctx.constraints.maxWidth,
    );
  },
};

