// ts/views/backing_track_view.ts
import { BaseView } from '../base_view';
import { SignalKind, TempoSignal } from '../panels/link_types';
import {
  DrumSoundId,
  DRUM_SOUND_LABELS,
  ALL_DRUM_SOUND_IDS,
  playDrumSound,
} from '../sounds/drum_sounds';
import { chord_tones_library } from '../fretboard/chords';
import { volumeManager } from '../sounds/volume_manager';
import {
  CHORD_ROOTS,
  getRomansForMode,
  resolveAbsoluteChordKey,
  isMajorChordQuality,
} from '../fretboard/chord_key_resolver';
import {
  DiatonicMode,
  ALL_DIATONIC_MODES,
  DIATONIC_MODE_LABELS,
} from '../fretboard/music_types';

// ─── Data types ────────────────────────────────────────────────────────────────

type TrackData = (DrumSoundId | null)[];
type BassStep  = number | null; // 1–7 scale degree, null = rest

interface DrumPreset {
  name: string;
  bpm: number;
  steps: number;
  tracks: TrackData[];
  bassTrack: BassStep[];
  numMeasures?: 4 | 8 | 12;
  measureChords?: (number | null)[];  // scale degree numbers 1–7, null = rest
}

// ─── Chord tone frequency helper ───────────────────────────────────────────────

function chordToneFreq(toneName: string, octave: number): number {
  const idx = CHORD_ROOTS.indexOf(toneName);
  if (idx === -1) return 0;
  return 440 * Math.pow(2, (idx + 12 * (octave - 4)) / 12);
}

// ─── Bass helpers ──────────────────────────────────────────────────────────────

// Semitone offsets for each scale degree (1–7) in major and natural minor
const MAJOR_SCALE_SEMITONES = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE_SEMITONES = [0, 2, 3, 5, 7, 8, 10];

const BASS_DEGREE_COLORS: Record<number, string> = {
  1: 'var(--dm-palette-1)',
  2: 'var(--dm-palette-2)',
  3: 'var(--dm-palette-3)',
  4: 'var(--dm-palette-4)',
  5: 'var(--dm-palette-5)',
  6: 'var(--dm-palette-6)',
  7: 'var(--dm-palette-7)',
};

// ─── Constants ─────────────────────────────────────────────────────────────────

const NUM_TRACKS = 4;
const DEFAULT_TRACK_SOUNDS: DrumSoundId[] = ['kick', 'snare', 'hihat', 'crash'];

const SOUND_COLORS: Record<DrumSoundId, string> = {
  kick:       'var(--dm-palette-1)',
  snare:      'var(--dm-palette-2)',
  hihat:      'var(--dm-palette-3)',
  open_hihat: 'var(--dm-palette-4)',
  crash:      'var(--dm-palette-5)',
  tom:        'var(--dm-palette-6)',
  shaker:     'var(--dm-palette-7)',
};

// ─── Preset library ────────────────────────────────────────────────────────────

function emptyTracks(steps: number): TrackData[] {
  return Array.from({ length: NUM_TRACKS }, () => new Array(steps).fill(null));
}
function emptyBass(steps: number): BassStep[] {
  return new Array(steps).fill(null);
}

// measureChords values are scale degree numbers (1=tonic, 4=subdominant, 5=dominant…)
// Presets assume Ionian (Major) by default; mode changes re-express the same degrees.
const PRESETS: DrumPreset[] = [
  {
    name: 'Empty', bpm: 120, steps: 16, numMeasures: 4,
    tracks: emptyTracks(16), bassTrack: emptyBass(16),
    measureChords: [null, null, null, null],
  },
  {
    name: 'Rock Beat', bpm: 120, steps: 16, numMeasures: 4,
    tracks: [
      ['kick', null, null, null, null, null, null, null, 'kick', null, null, 'kick', null, null, null, null],
      [null, null, null, null, 'snare', null, null, null, null, null, null, null, 'snare', null, null, null],
      ['hihat', null, 'hihat', null, 'hihat', null, 'hihat', null, 'hihat', null, 'hihat', null, 'hihat', null, 'hihat', null],
      ['crash', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    ],
    bassTrack: [1, null, null, null, null, null, null, null, 5, null, null, null, null, null, null, null],
    measureChords: [1, 4, 5, 1],
  },
  {
    name: 'Funk', bpm: 100, steps: 16, numMeasures: 4,
    tracks: [
      ['kick', null, null, 'kick', null, null, 'kick', null, null, null, 'kick', null, null, 'kick', null, null],
      [null, null, null, null, 'snare', null, null, null, null, null, null, null, 'snare', null, 'snare', null],
      ['hihat','hihat','hihat','hihat','hihat','hihat','hihat','hihat','hihat','hihat','hihat','hihat','hihat','hihat','hihat','hihat'],
      [null, null, null, null, null, null, 'open_hihat', null, null, null, null, null, null, null, 'open_hihat', null],
    ],
    bassTrack: [1, null, null, 1, null, null, null, 3, 5, null, null, 1, null, null, null, null],
    measureChords: [1, 4, 1, 5],
  },
  {
    name: 'Electronic', bpm: 128, steps: 16, numMeasures: 4,
    tracks: [
      ['kick', null, null, null, 'kick', null, null, null, 'kick', null, null, null, 'kick', null, null, null],
      [null, null, null, null, 'snare', null, null, null, null, null, null, null, 'snare', null, null, null],
      [null, null, 'open_hihat', null, null, null, 'open_hihat', null, null, null, 'open_hihat', null, null, null, 'open_hihat', null],
      ['crash', null, 'hihat', null, 'hihat', null, 'hihat', null, 'hihat', null, 'hihat', null, 'hihat', null, 'hihat', null],
    ],
    bassTrack: [1, null, null, null, 1, null, null, null, 5, null, null, null, 5, null, null, null],
    measureChords: [1, 5, 6, 4],
  },
  {
    name: 'Blues Shuffle', bpm: 90, steps: 16, numMeasures: 12,
    tracks: [
      ['kick', null, null, null, null, null, null, null, 'tom', null, null, null, null, null, null, null],
      [null, null, null, null, 'snare', null, null, null, null, null, null, null, 'snare', null, null, null],
      ['hihat', null, 'hihat', null, 'hihat', null, 'hihat', null, 'hihat', null, 'hihat', null, 'hihat', null, 'hihat', null],
      [null, null, null, null, null, null, null, null, null, null, null, null, null, null, 'open_hihat', null],
    ],
    bassTrack: [1, null, null, null, 3, null, null, null, 5, null, null, null, 7, null, null, null],
    measureChords: [1,1,1,1,4,4,1,1,5,4,1,5],
  },
  {
    name: 'Indie Rock', bpm: 118, steps: 16, numMeasures: 8,
    tracks: [
      ['kick', null, null, null, null, null, 'kick', null, 'kick', null, null, null, null, null, null, null],
      [null, null, null, null, 'snare', null, null, null, null, null, null, null, 'snare', null, null, null],
      ['hihat', null, 'hihat', null, 'hihat', null, 'hihat', null, 'hihat', null, 'hihat', null, 'hihat', null, 'hihat', null],
      ['crash', null, 'shaker', null, 'shaker', null, 'shaker', null, 'shaker', null, 'shaker', null, 'shaker', null, 'shaker', null],
    ],
    bassTrack: [1, null, null, null, null, null, null, null, 5, null, null, null, null, null, 7, null],
    measureChords: [1, 1, 5, 5, 6, 6, 4, 4],
  },
  {
    name: 'Jazz Swing', bpm: 160, steps: 16, numMeasures: 8,
    tracks: [
      [null, null, null, null, null, null, null, null, null, null, null, null, 'kick', null, null, null],
      [null, null, null, null, 'snare', null, null, null, null, null, null, null, 'snare', null, null, null],
      ['hihat', null, null, null, 'hihat', null, 'hihat', null, 'hihat', null, null, null, 'hihat', null, 'hihat', null],
      [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    ],
    bassTrack: [1, null, null, null, 2, null, null, null, 5, null, null, null, 4, null, null, null],
    measureChords: [1, 6, 2, 5, 1, 6, 2, 5],
  },
];

// ─── View ──────────────────────────────────────────────────────────────────────

export class BackingTrackView extends BaseView {
  // Drum playback state
  private bpm: number = 120;
  private steps: number = 16;
  private swingAmount: number = 0; // 0.0–0.5 fraction of stepMs to delay odd steps
  private stepMs: number = 0;
  private tracks: TrackData[] = [];
  private bassTrack: BassStep[] = [];
  private trackSounds: DrumSoundId[] = [...DEFAULT_TRACK_SOUNDS];
  private selectedBassDegree: number | null = null;
  private isPlaying: boolean = false;
  private currentStep: number = -1;
  private intervalId: number | null = null;

  // Chord progression state
  private numMeasures: 4 | 8 | 12 = 4;
  private progRootNote: string = 'C';
  private progMode: DiatonicMode = DiatonicMode.Ionian;
  private selectedChordDeg: number | null = null; // 1–7, null = erase tool
  private measureChords: (number | null)[] = []; // degree numbers 1–7, null = rest
  private currentMeasure: number = -1;

  // Tempo target state
  private isTempoTarget: boolean = false;

  // DOM refs
  private gridEl: HTMLElement | null = null;
  private cellEls: HTMLElement[][] = [];
  private bassCellEls: HTMLElement[] = [];
  private stepNumEls: HTMLElement[] = [];
  private playBtn: HTMLButtonElement | null = null;
  private bpmSliderEl: HTMLInputElement | null = null;
  private bpmDisplayEl: HTMLElement | null = null;
  private swingSliderEl: HTMLInputElement | null = null;
  private swingDisplayEl: HTMLElement | null = null;
  private barsBtns: Map<number, HTMLButtonElement> = new Map();
  private trackDropdowns: HTMLSelectElement[] = [];
  private chordToolSelectEl: HTMLSelectElement | null = null;
  private progRootSelectEl: HTMLSelectElement | null = null;
  private progModeSelectEl: HTMLSelectElement | null = null;
  private chordMeasureCellEls: HTMLElement[] = [];

  constructor(initialState?: any) {
    super();
    this.bpm          = initialState?.bpm          ?? 120;
    this.steps        = initialState?.steps        ?? 16;
    this.swingAmount  = Math.min(0.5, Math.max(0, initialState?.swingAmount ?? 0));
    this.progRootNote = initialState?.progRootNote ?? 'C';

    const modeRaw = initialState?.progMode;
    this.progMode = (modeRaw && (Object.values(DiatonicMode) as string[]).includes(modeRaw))
      ? (modeRaw as DiatonicMode)
      : DiatonicMode.Ionian;

    const nm = initialState?.numMeasures;
    this.numMeasures = (nm === 4 || nm === 8 || nm === 12) ? nm : 4;

    if (Array.isArray(initialState?.measureChords)) {
      this.measureChords = this.parseMeasureChords(initialState.measureChords, this.numMeasures);
    } else {
      this.measureChords = new Array(this.numMeasures).fill(null);
    }
    this.trackSounds = this.resolveTrackSounds(initialState?.trackSounds, initialState?.tracks);
    this.initTracks(initialState?.tracks);
    this.initBassTrack(initialState?.bassTrack);
  }

  // Accepts either degree numbers (new) or Roman numeral strings (legacy import).
  private parseMeasureChords(raw: any[], size: number): (number | null)[] {
    const parsed = raw.slice(0, size).map((c: any): number | null => {
      if (c === null || c === undefined) return null;
      if (typeof c === 'number' && c >= 1 && c <= 7) return c;
      if (typeof c === 'string') {
        const entry = getRomansForMode(this.progMode).find(r => r.roman === c);
        return entry ? entry.degreeIndex + 1 : null;
      }
      return null;
    });
    while (parsed.length < size) parsed.push(null);
    return parsed;
  }

  // ─── View interface ──────────────────────────────────────────────────────────

  render(container: HTMLElement): void {
    this.container = container;
    container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.classList.add('drum-machine-view');

    wrapper.appendChild(this.buildHeader());

    this.gridEl = document.createElement('div');
    this.gridEl.classList.add('dm-grid');
    wrapper.appendChild(this.gridEl);
    this.rebuildGrid();

    container.appendChild(wrapper);
    this.dispatchStateChange();

    this.listen(container, 'drive-signal', (e: Event) => {
      const signal = (e as CustomEvent).detail?.signal;
      if (!signal || signal.kind !== SignalKind.Tempo) return;
      const tempo = signal as TempoSignal;
      const clamped = Math.max(30, Math.min(200, Math.round(tempo.bpm)));
      if (clamped === this.bpm) return;
      this.bpm = clamped;
      if (this.bpmSliderEl)  this.bpmSliderEl.value = String(clamped);
      if (this.bpmDisplayEl) this.bpmDisplayEl.textContent = String(clamped);
      if (this.isPlaying) { this.stopInterval(); this.startInterval(); }
    });
    this.listen(container, 'link-status-changed', (e: Event) => {
      this.isTempoTarget = !!((e as CustomEvent).detail?.hasIncomingLinks);
      this.applyTempoTargetState();
    });
  }

  private applyTempoTargetState(): void {
    if (this.bpmSliderEl) this.bpmSliderEl.disabled = this.isTempoTarget;
  }

  destroy(): void {
    this.stopPlayback();
    this.gridEl              = null;
    this.cellEls             = [];
    this.bassCellEls         = [];
    this.stepNumEls          = [];
    this.playBtn             = null;
    this.bpmSliderEl         = null;
    this.bpmDisplayEl        = null;
    this.swingSliderEl       = null;
    this.swingDisplayEl      = null;
    this.barsBtns.clear();
    this.trackDropdowns      = [];
    this.chordToolSelectEl   = null;
    this.progRootSelectEl    = null;
    this.progModeSelectEl    = null;
    this.chordMeasureCellEls = [];
    super.destroy();
  }

  // ─── Header (two-row layout with large play button) ──────────────────────────

  private buildHeader(): HTMLElement {
    const header = document.createElement('div');
    header.classList.add('dm-header');

    const playWrap = document.createElement('div');
    playWrap.classList.add('dm-play-large');
    this.playBtn = document.createElement('button');
    this.playBtn.classList.add('button', 'is-small', 'dm-play-btn');
    this.playBtn.innerHTML = '<span class="material-icons">play_arrow</span>';
    this.playBtn.title = 'Play / Stop';
    this.playBtn.addEventListener('click', () => {
      if (this.isPlaying) this.stopPlayback();
      else this.startPlayback();
    });
    playWrap.appendChild(this.playBtn);
    header.appendChild(playWrap);

    const rows = document.createElement('div');
    rows.classList.add('dm-controls-rows');
    rows.appendChild(this.buildControlRow1());
    rows.appendChild(this.buildControlRow2());
    header.appendChild(rows);
    return header;
  }

  /** Row 1: PRESET [Dropdown] [Save] [Load] | Root [Dropdown] | Mode [Dropdown] */
  private buildControlRow1(): HTMLElement {
    const row = document.createElement('div');
    row.classList.add('dm-controls-row');

    // Preset label + dropdown
    const presetLbl = document.createElement('span');
    presetLbl.classList.add('dm-label');
    presetLbl.textContent = 'Preset:';
    row.appendChild(presetLbl);

    const presetWrap = document.createElement('div');
    presetWrap.classList.add('select', 'is-small');
    const sel = document.createElement('select');
    PRESETS.forEach((p, i) => sel.appendChild(new Option(p.name, String(i))));
    sel.addEventListener('change', () => {
      const idx = parseInt(sel.value, 10);
      if (!isNaN(idx)) this.applyPreset(PRESETS[idx]);
    });
    presetWrap.appendChild(sel);
    row.appendChild(presetWrap);

    // Save
    const saveBtn = document.createElement('button');
    saveBtn.classList.add('button', 'is-small', 'dm-icon-btn');
    saveBtn.title = 'Save to JSON';
    saveBtn.innerHTML = '<span class="material-icons">save</span>';
    saveBtn.addEventListener('click', () => this.exportToJSON());
    row.appendChild(saveBtn);

    // Load
    const loadBtn = document.createElement('button');
    loadBtn.classList.add('button', 'is-small', 'dm-icon-btn');
    loadBtn.title = 'Load from JSON';
    loadBtn.innerHTML = '<span class="material-icons">folder_open</span>';
    loadBtn.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (file) this.importFromFile(file);
      });
      input.click();
    });
    row.appendChild(loadBtn);

    // Key root dropdown
    const rootWrap = document.createElement('div');
    rootWrap.classList.add('select', 'is-small', 'dm-root-select-wrap');
    this.progRootSelectEl = document.createElement('select');
    CHORD_ROOTS.forEach(r => {
      const opt = new Option(r, r);
      if (r === this.progRootNote) opt.selected = true;
      this.progRootSelectEl!.appendChild(opt);
    });
    this.progRootSelectEl.addEventListener('change', () => {
      this.progRootNote = this.progRootSelectEl!.value;
      this.selectedChordDeg = null;
      this.rebuildChordToolOptions();
      this.dispatchStateChange();
    });
    rootWrap.appendChild(this.progRootSelectEl);
    row.appendChild(rootWrap);

    // Mode dropdown (replaces binary Major/Minor toggle)
    const modeWrap = document.createElement('div');
    modeWrap.classList.add('select', 'is-small');
    this.progModeSelectEl = document.createElement('select');
    for (const mode of ALL_DIATONIC_MODES) {
      const opt = new Option(DIATONIC_MODE_LABELS[mode], mode);
      if (mode === this.progMode) opt.selected = true;
      this.progModeSelectEl.appendChild(opt);
    }
    this.progModeSelectEl.addEventListener('change', () => {
      this.progMode = this.progModeSelectEl!.value as DiatonicMode;
      this.selectedChordDeg = null;
      this.rebuildChordToolOptions();
      this.dispatchStateChange();
    });
    modeWrap.appendChild(this.progModeSelectEl);
    row.appendChild(modeWrap);

    return row;
  }

  /** Row 2: BPM: [slider+display] SWING: [slider+display] BARS: [4|8|12] */
  private buildControlRow2(): HTMLElement {
    const row = document.createElement('div');
    row.classList.add('dm-controls-row');

    const bpmLbl = document.createElement('span');
    bpmLbl.classList.add('dm-label');
    bpmLbl.textContent = 'BPM:';
    row.appendChild(bpmLbl);

    const bpmGroup = document.createElement('div');
    bpmGroup.classList.add('dm-bpm-group');
    this.bpmSliderEl       = document.createElement('input');
    this.bpmSliderEl.type  = 'range';
    this.bpmSliderEl.min   = '30';
    this.bpmSliderEl.max   = '200';
    this.bpmSliderEl.value = String(this.bpm);
    this.bpmSliderEl.classList.add('dm-bpm-slider');
    this.bpmSliderEl.addEventListener('input', () => {
      this.bpm = parseInt(this.bpmSliderEl!.value, 10);
      if (this.bpmDisplayEl) this.bpmDisplayEl.textContent = String(this.bpm);
      if (this.isPlaying) { this.stopInterval(); this.startInterval(); }
      this.dispatchStateChange();
    });
    this.bpmDisplayEl = document.createElement('span');
    this.bpmDisplayEl.classList.add('dm-bpm-display');
    this.bpmDisplayEl.textContent = String(this.bpm);
    bpmGroup.appendChild(this.bpmSliderEl);
    bpmGroup.appendChild(this.bpmDisplayEl);
    row.appendChild(bpmGroup);

    const swingLbl = document.createElement('span');
    swingLbl.classList.add('dm-label');
    swingLbl.textContent = 'Swing:';
    row.appendChild(swingLbl);

    const swingGroup = document.createElement('div');
    swingGroup.classList.add('dm-bpm-group');
    this.swingSliderEl = document.createElement('input');
    this.swingSliderEl.type = 'range';
    this.swingSliderEl.min = '0';
    this.swingSliderEl.max = '50';
    this.swingSliderEl.value = String(Math.round(this.swingAmount * 100));
    this.swingSliderEl.classList.add('dm-bpm-slider');
    this.swingSliderEl.addEventListener('input', () => {
      this.swingAmount = parseInt(this.swingSliderEl!.value, 10) / 100;
      if (this.swingDisplayEl) this.swingDisplayEl.textContent = `${this.swingSliderEl!.value}%`;
      this.dispatchStateChange();
    });
    this.swingDisplayEl = document.createElement('span');
    this.swingDisplayEl.classList.add('dm-bpm-display');
    this.swingDisplayEl.textContent = `${Math.round(this.swingAmount * 100)}%`;
    swingGroup.appendChild(this.swingSliderEl);
    swingGroup.appendChild(this.swingDisplayEl);
    row.appendChild(swingGroup);

    const barsLbl = document.createElement('span');
    barsLbl.classList.add('dm-label');
    barsLbl.textContent = 'Bars:';
    row.appendChild(barsLbl);

    const toggle = document.createElement('div');
    toggle.classList.add('dm-bars-toggle');
    this.barsBtns.clear();
    for (const n of [4, 8, 12] as const) {
      const btn = document.createElement('button');
      btn.classList.add('dm-bars-btn');
      btn.textContent = String(n);
      if (n === this.numMeasures) btn.classList.add('is-active');
      btn.addEventListener('click', () => this.setNumMeasures(n));
      this.barsBtns.set(n, btn);
      toggle.appendChild(btn);
    }
    row.appendChild(toggle);

    return row;
  }

  // ─── Grid ────────────────────────────────────────────────────────────────────

  private rebuildGrid(): void {
    if (!this.gridEl) return;
    this.gridEl.innerHTML = '';
    this.cellEls             = [];
    this.bassCellEls         = [];
    this.stepNumEls          = [];
    this.chordMeasureCellEls = [];
    this.trackDropdowns      = [];

    // Header row — beat numbers
    const headerRow = document.createElement('div');
    headerRow.classList.add('dm-row', 'dm-header-row');
    headerRow.appendChild(this.makeTrackLabel(''));
    for (let s = 0; s < this.steps; s++) {
      const el = document.createElement('div');
      el.classList.add('dm-step-num');
      if (s % 4 === 0) el.textContent = String(s / 4 + 1);
      if (s > 0 && s % 4 === 0) el.classList.add('dm-beat-start');
      this.stepNumEls.push(el);
      headerRow.appendChild(el);
    }
    this.gridEl.appendChild(headerRow);

    // Drum track rows
    for (let t = 0; t < NUM_TRACKS; t++) {
      const row = document.createElement('div');
      row.classList.add('dm-row');
      row.appendChild(this.makeTrackHeader(t));
      const rowCells: HTMLElement[] = [];
      for (let s = 0; s < this.steps; s++) {
        const cell = document.createElement('div');
        cell.classList.add('dm-cell');
        if (s > 0 && s % 4 === 0) cell.classList.add('dm-beat-start');
        this.updateCellAppearance(cell, this.tracks[t][s]);
        cell.addEventListener('click', () => this.handleCellClick(t, s));
        rowCells.push(cell);
        row.appendChild(cell);
      }
      this.cellEls.push(rowCells);
      this.gridEl.appendChild(row);
    }

    this.buildBassRow();
    this.buildProgRow();
  }

  private buildBassRow(): void {
    if (!this.gridEl) return;

    const sep = document.createElement('div');
    sep.classList.add('dm-prog-separator');
    this.gridEl.appendChild(sep);

    const row = document.createElement('div');
    row.classList.add('dm-row');
    row.appendChild(this.makeBassHeader());

    for (let s = 0; s < this.steps; s++) {
      const cell = document.createElement('div');
      cell.classList.add('dm-cell', 'dm-bass-cell');
      if (s > 0 && s % 4 === 0) cell.classList.add('dm-beat-start');
      this.updateBassCellAppearance(cell, this.bassTrack[s]);
      cell.addEventListener('click', () => this.handleBassCellClick(s));
      this.bassCellEls.push(cell);
      row.appendChild(cell);
    }

    this.gridEl.appendChild(row);
  }

  /** Single row with numMeasures cells that align to the beat grid. */
  private buildProgRow(): void {
    if (!this.gridEl) return;
    this.chordMeasureCellEls = [];

    const sep = document.createElement('div');
    sep.classList.add('dm-prog-separator');
    this.gridEl.appendChild(sep);

    const row = document.createElement('div');
    row.classList.add('dm-row', 'dm-prog-row');
    row.appendChild(this.makeChordHeader());

    const cellW    = this.measureCellWidth();
    const fontSize = this.numMeasures <= 4 ? '0.75rem' : this.numMeasures === 8 ? '0.68rem' : '0.58rem';

    for (let m = 0; m < this.numMeasures; m++) {
      const cell = document.createElement('div');
      cell.classList.add('dm-measure-cell');
      cell.style.width    = `${cellW}px`;
      cell.style.minWidth = `${cellW}px`;
      cell.style.fontSize = fontSize;
      if (this.measureBeatStart(m)) cell.classList.add('dm-beat-start');
      this.updateMeasureCellAppearance(cell, this.measureChords[m]);
      cell.addEventListener('click', () => this.handleMeasureCellClick(m));
      this.chordMeasureCellEls.push(cell);
      row.appendChild(cell);
    }

    this.gridEl.appendChild(row);
  }

  private makeTrackLabel(text: string): HTMLElement {
    const el = document.createElement('div');
    el.classList.add('dm-track-header');
    el.textContent = text;
    return el;
  }

  private makeTrackHeader(t: number): HTMLElement {
    const wrap = document.createElement('div');
    wrap.classList.add('select', 'is-small', 'dm-track-header-wrap');
    const sel = document.createElement('select');
    for (const id of ALL_DRUM_SOUND_IDS) {
      const opt = new Option(DRUM_SOUND_LABELS[id], id);
      if (id === this.trackSounds[t]) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => {
      this.trackSounds[t] = sel.value as DrumSoundId;
    });
    this.trackDropdowns[t] = sel;
    wrap.appendChild(sel);
    return wrap;
  }

  private makeBassHeader(): HTMLElement {
    const BASS_LABELS: Record<number, string> = {
      1: '1 Root', 2: '2', 3: '3 Third', 4: '4', 5: '5 Fifth', 6: '6', 7: '7 Seventh',
    };
    const wrap = document.createElement('div');
    wrap.classList.add('select', 'is-small', 'dm-track-header-wrap');
    const sel = document.createElement('select');
    sel.appendChild(new Option('Bass', ''));
    for (let d = 1; d <= 7; d++) {
      const opt = new Option(BASS_LABELS[d] ?? String(d), String(d));
      if (d === this.selectedBassDegree) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => {
      const val = sel.value;
      this.selectedBassDegree = val ? parseInt(val, 10) : null;
    });
    wrap.appendChild(sel);
    return wrap;
  }

  /** Chord row header: dropdown listing the 7 diatonic triads for the current mode. */
  private makeChordHeader(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.classList.add('select', 'is-small', 'dm-track-header-wrap');
    const sel = document.createElement('select');
    this.chordToolSelectEl = sel;
    this.rebuildChordToolOptions();
    sel.addEventListener('change', () => {
      const val = parseInt(sel.value, 10);
      this.selectedChordDeg = isNaN(val) ? null : val;
    });
    wrap.appendChild(sel);
    return wrap;
  }

  // ─── Cell width / beat-alignment helpers ─────────────────────────────────────

  private measureCellWidth(): number {
    return 416 / this.numMeasures - 2;
  }

  private measureBeatStart(m: number): boolean {
    if (m === 0) return false;
    return m % (this.numMeasures / 4) === 0;
  }

  // ─── Cell appearance ─────────────────────────────────────────────────────────

  private updateCellAppearance(cell: HTMLElement, sound: DrumSoundId | null): void {
    if (sound) {
      cell.style.background = SOUND_COLORS[sound];
      cell.textContent      = DRUM_SOUND_LABELS[sound].slice(0, 1);
      cell.classList.add('dm-cell-filled');
      cell.title = DRUM_SOUND_LABELS[sound];
    } else {
      cell.style.background = '';
      cell.textContent      = '';
      cell.classList.remove('dm-cell-filled');
      cell.title = '';
    }
  }

  private updateBassCellAppearance(cell: HTMLElement, degree: BassStep): void {
    if (degree !== null) {
      cell.style.background = BASS_DEGREE_COLORS[degree] ?? 'var(--dm-palette-1)';
      cell.textContent      = String(degree);
      cell.classList.add('dm-cell-filled');
      cell.title = `Scale degree ${degree}`;
    } else {
      cell.style.background = '';
      cell.textContent      = '';
      cell.classList.remove('dm-cell-filled');
      cell.title = '';
    }
  }

  private updateMeasureCellAppearance(cell: HTMLElement, chordDeg: number | null): void {
    if (chordDeg !== null && chordDeg >= 1 && chordDeg <= 7) {
      const entries = getRomansForMode(this.progMode);
      const entry   = entries[chordDeg - 1]; // first 7 entries are triads
      const roman   = entry?.roman ?? String(chordDeg);
      const chordKey = entry
        ? resolveAbsoluteChordKey(entry.roman, this.progRootNote, this.progMode)
        : null;
      const chordName = chordKey ? (chord_tones_library[chordKey]?.name ?? roman) : roman;

      cell.textContent = roman;
      cell.title       = chordName;
      cell.style.setProperty('--dm-measure-color', 'var(--accent-dim)');
      cell.classList.add('dm-measure-filled');
    } else {
      cell.textContent = '';
      cell.title       = '';
      cell.style.removeProperty('--dm-measure-color');
      cell.classList.remove('dm-measure-filled');
    }
  }

  private refreshAllMeasureCells(): void {
    this.chordMeasureCellEls.forEach((cell, m) => {
      const isCurrent = this.currentMeasure === m;
      this.updateMeasureCellAppearance(cell, this.measureChords[m]);
      if (isCurrent) cell.classList.add('dm-measure-current');
    });
  }

  // ─── Click handlers ──────────────────────────────────────────────────────────

  private handleCellClick(track: number, step: number): void {
    const selectedSound = this.trackSounds[track];
    const current = this.tracks[track][step];
    this.tracks[track][step] = (current === selectedSound) ? null : selectedSound;
    if (this.tracks[track][step]) playDrumSound(selectedSound);
    const cell = this.cellEls[track]?.[step];
    if (cell) {
      const isCurrent = this.currentStep === step;
      this.updateCellAppearance(cell, this.tracks[track][step]);
      if (isCurrent) cell.classList.add('dm-cell-current');
    }
    this.dispatchStateChange();
  }

  private handleBassCellClick(step: number): void {
    const current = this.bassTrack[step];
    if (this.selectedBassDegree !== null) {
      this.bassTrack[step] = (current === this.selectedBassDegree) ? null : this.selectedBassDegree;
    } else {
      this.bassTrack[step] = null;
    }
    const cell = this.bassCellEls[step];
    if (cell) {
      const isCurrent = this.currentStep === step;
      this.updateBassCellAppearance(cell, this.bassTrack[step]);
      if (isCurrent) cell.classList.add('dm-cell-current');
    }
    this.dispatchStateChange();
  }

  private handleMeasureCellClick(measureIndex: number): void {
    const current = this.measureChords[measureIndex];
    if (this.selectedChordDeg !== null) {
      this.measureChords[measureIndex] = (current === this.selectedChordDeg) ? null : this.selectedChordDeg;
    } else {
      this.measureChords[measureIndex] = null;
    }
    const cell = this.chordMeasureCellEls[measureIndex];
    if (cell) {
      const isCurrent = this.currentMeasure === measureIndex;
      this.updateMeasureCellAppearance(cell, this.measureChords[measureIndex]);
      if (isCurrent) cell.classList.add('dm-measure-current');
    }
    this.dispatchStateChange();
  }

  // ─── Chord tool options ───────────────────────────────────────────────────────

  private rebuildChordToolOptions(): void {
    if (!this.chordToolSelectEl) return;
    this.chordToolSelectEl.innerHTML = '';
    this.chordToolSelectEl.appendChild(new Option('Chord', ''));

    const entries = getRomansForMode(this.progMode);
    const triads = entries.slice(0, 7); // first 7 are the diatonic triads
    for (const entry of triads) {
      const chordKey  = resolveAbsoluteChordKey(entry.roman, this.progRootNote, this.progMode);
      const chordName = chordKey ? (chord_tones_library[chordKey]?.name ?? entry.roman) : entry.roman;
      const degNum    = entry.degreeIndex + 1; // 1–7
      const opt = new Option(`${entry.roman} — ${chordName}`, String(degNum));
      if (degNum === this.selectedChordDeg) opt.selected = true;
      this.chordToolSelectEl.appendChild(opt);
    }
    this.refreshAllMeasureCells();
  }

  // ─── Bars count ───────────────────────────────────────────────────────────────

  private setNumMeasures(n: 4 | 8 | 12): void {
    if (this.numMeasures === n) return;
    const old = this.measureChords.slice();
    this.numMeasures = n;
    this.measureChords = new Array(n).fill(null);
    for (let i = 0; i < Math.min(old.length, n); i++) this.measureChords[i] = old[i];
    if (this.currentMeasure >= n) this.currentMeasure = -1;
    this.barsBtns.forEach((btn, bars) => btn.classList.toggle('is-active', bars === n));
    this.rebuildGrid();
    this.dispatchStateChange();
  }

  // ─── Steps / preset / state changes ──────────────────────────────────────────

  private applyPreset(preset: DrumPreset): void {
    const wasPlaying = this.isPlaying;
    if (wasPlaying) this.stopPlayback();
    this.bpm   = preset.bpm;
    this.steps = preset.steps;
    if (preset.numMeasures) {
      this.numMeasures = preset.numMeasures;
      this.barsBtns.forEach((btn, bars) => btn.classList.toggle('is-active', bars === this.numMeasures));
    }
    if (Array.isArray(preset.measureChords)) {
      this.measureChords = preset.measureChords.slice(0, this.numMeasures);
      while (this.measureChords.length < this.numMeasures) this.measureChords.push(null);
    } else {
      this.measureChords = new Array(this.numMeasures).fill(null);
    }
    this.initTracks(preset.tracks);
    this.initBassTrack(preset.bassTrack);
    this.trackSounds = this.resolveTrackSounds(undefined, preset.tracks);
    this.currentStep    = -1;
    this.currentMeasure = -1;
    if (this.bpmSliderEl)  this.bpmSliderEl.value = String(this.bpm);
    if (this.bpmDisplayEl) this.bpmDisplayEl.textContent = String(this.bpm);
    this.rebuildGrid();
    if (wasPlaying) this.startPlayback();
    this.dispatchStateChange();
  }

  private applyState(state: any): void {
    const wasPlaying = this.isPlaying;
    if (wasPlaying) this.stopPlayback();

    this.bpm          = state.bpm          ?? this.bpm;
    this.steps        = state.steps        ?? this.steps;
    if (typeof state.swingAmount === 'number') {
      this.swingAmount = Math.min(0.5, Math.max(0, state.swingAmount));
    }
    this.progRootNote = state.progRootNote ?? this.progRootNote;

    const modeRaw = state.progMode;
    if (modeRaw && (Object.values(DiatonicMode) as string[]).includes(modeRaw)) {
      this.progMode = modeRaw as DiatonicMode;
    }

    const nm = state.numMeasures;
    if (nm === 4 || nm === 8 || nm === 12) this.numMeasures = nm;

    if (Array.isArray(state.measureChords)) {
      this.measureChords = this.parseMeasureChords(state.measureChords, this.numMeasures);
    }
    this.trackSounds = this.resolveTrackSounds(state.trackSounds, state.tracks);
    this.initTracks(state.tracks);
    this.initBassTrack(state.bassTrack);
    this.currentStep    = -1;
    this.currentMeasure = -1;

    if (this.bpmSliderEl)      this.bpmSliderEl.value = String(this.bpm);
    if (this.bpmDisplayEl)     this.bpmDisplayEl.textContent = String(this.bpm);
    const swingPct = Math.round(this.swingAmount * 100);
    if (this.swingSliderEl)    this.swingSliderEl.value = String(swingPct);
    if (this.swingDisplayEl)   this.swingDisplayEl.textContent = `${swingPct}%`;
    if (this.progRootSelectEl) this.progRootSelectEl.value = this.progRootNote;
    if (this.progModeSelectEl) this.progModeSelectEl.value = this.progMode;
    this.barsBtns.forEach((btn, bars) => btn.classList.toggle('is-active', bars === this.numMeasures));

    this.rebuildGrid();
    this.rebuildChordToolOptions();

    if (wasPlaying) this.startPlayback();
    this.dispatchStateChange();
  }

  private resolveTrackSounds(savedSounds?: DrumSoundId[], tracks?: TrackData[]): DrumSoundId[] {
    return DEFAULT_TRACK_SOUNDS.map((def, t) => {
      if (savedSounds?.[t] && ALL_DRUM_SOUND_IDS.includes(savedSounds[t])) return savedSounds[t];
      if (tracks?.[t]) {
        const first = (tracks[t] as (DrumSoundId | null)[]).find(s => s !== null);
        if (first) return first;
      }
      return def;
    });
  }

  private initTracks(saved?: TrackData[]): void {
    this.tracks = [];
    for (let t = 0; t < NUM_TRACKS; t++) {
      const track: TrackData = new Array(this.steps).fill(null);
      if (saved?.[t]) {
        for (let s = 0; s < Math.min(saved[t].length, this.steps); s++) track[s] = saved[t][s];
      }
      this.tracks.push(track);
    }
  }

  private initBassTrack(saved?: BassStep[]): void {
    this.bassTrack = new Array(this.steps).fill(null);
    if (saved) {
      for (let s = 0; s < Math.min(saved.length, this.steps); s++) this.bassTrack[s] = saved[s];
    }
  }

  // ─── Playback engine ─────────────────────────────────────────────────────────

  private startPlayback(): void {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.updatePlayButton();
    this.startInterval();
  }

  private stopPlayback(): void {
    this.stopInterval();
    this.clearStepHighlight();
    this.clearMeasureHighlight();
    this.currentStep    = -1;
    this.currentMeasure = -1;
    this.isPlaying = false;
    this.updatePlayButton();
  }

  private startInterval(): void {
    if (this.intervalId !== null) return;
    this.stepMs = (60000 * 4) / this.bpm / this.steps;
    this.intervalId = window.setInterval(() => this.tick(), this.stepMs);
  }

  private stopInterval(): void {
    if (this.intervalId !== null) { clearInterval(this.intervalId); this.intervalId = null; }
  }

  private tick(): void {
    this.clearStepHighlight();
    this.currentStep = (this.currentStep + 1) % this.steps;
    this.highlightStep(this.currentStep);

    const swingDelay = (this.currentStep % 4 === 2 && this.swingAmount > 0)
      ? this.stepMs * this.swingAmount
      : 0;

    const step = this.currentStep;
    const playHits = () => {
      for (let t = 0; t < NUM_TRACKS; t++) {
        const sound = this.tracks[t][step];
        if (sound) playDrumSound(sound);
      }
      const bassDegree = this.bassTrack[step];
      if (bassDegree !== null) this.playBassStep(bassDegree);
    };

    if (swingDelay > 0) {
      setTimeout(playHits, swingDelay);
    } else {
      playHits();
    }

    if (this.currentStep === 0) {
      this.clearMeasureHighlight();
      this.currentMeasure = (this.currentMeasure + 1) % this.numMeasures;
      this.highlightCurrentMeasure();
      const chordDeg = this.measureChords[this.currentMeasure];
      if (chordDeg !== null) this.playChordDrone(chordDeg);
      this.dispatchTickEvent(chordDeg ?? null);
    }
  }

  private dispatchTickEvent(chordDeg: number | null): void {
    if (!this.container) return;
    let currentRoman: string | null = null;
    let chordKey: string | null = null;
    if (chordDeg !== null) {
      const entry = getRomansForMode(this.progMode)[chordDeg - 1];
      if (entry) {
        currentRoman = entry.roman;
        chordKey = resolveAbsoluteChordKey(entry.roman, this.progRootNote, this.progMode);
      }
    }
    this.container.dispatchEvent(new CustomEvent('backing-track-tick', {
      bubbles: true,
      detail: {
        currentMeasure:  this.currentMeasure,
        currentChordDeg: chordDeg,
        currentRoman,
        chordKey,
        progRootNote:    this.progRootNote,
        progMode:        this.progMode,
        bpm:             this.bpm,
      },
    }));
  }

  private clearStepHighlight(): void {
    if (this.currentStep < 0) return;
    for (const row of this.cellEls) row[this.currentStep]?.classList.remove('dm-cell-current');
    this.bassCellEls[this.currentStep]?.classList.remove('dm-cell-current');
    this.stepNumEls[this.currentStep]?.classList.remove('dm-step-current');
  }

  private highlightStep(step: number): void {
    for (const row of this.cellEls) row[step]?.classList.add('dm-cell-current');
    this.bassCellEls[step]?.classList.add('dm-cell-current');
    this.stepNumEls[step]?.classList.add('dm-step-current');
  }

  private clearMeasureHighlight(): void {
    for (const cell of this.chordMeasureCellEls) cell.classList.remove('dm-measure-current');
  }

  private highlightCurrentMeasure(): void {
    this.chordMeasureCellEls[this.currentMeasure]?.classList.add('dm-measure-current');
  }

  private updatePlayButton(): void {
    if (!this.playBtn) return;
    this.playBtn.innerHTML = this.isPlaying
      ? '<span class="material-icons">stop</span>'
      : '<span class="material-icons">play_arrow</span>';
    this.playBtn.classList.toggle('is-danger', this.isPlaying);
    this.playBtn.classList.toggle('is-light',  !this.isPlaying);
  }

  // ─── Bass playback ────────────────────────────────────────────────────────────

  private playBassStep(bassDeg: number): void {
    let rootName     = this.progRootNote;
    let isMajorChord = true;

    const chordDeg = this.measureChords[Math.max(0, this.currentMeasure)];
    if (chordDeg !== null) {
      const entry = getRomansForMode(this.progMode)[chordDeg - 1];
      if (entry) {
        const rootIdx = CHORD_ROOTS.indexOf(this.progRootNote);
        rootName     = CHORD_ROOTS[(rootIdx + entry.degree) % 12];
        isMajorChord = isMajorChordQuality(entry.quality);
      }
    }

    const intervals = isMajorChord ? MAJOR_SCALE_SEMITONES : MINOR_SCALE_SEMITONES;
    const semitones = intervals[(bassDeg - 1) % 7];
    const rootIdx   = CHORD_ROOTS.indexOf(rootName);
    if (rootIdx === -1) return;
    const noteIdx = (rootIdx + semitones) % 12;
    const freq    = chordToneFreq(CHORD_ROOTS[noteIdx], 2);
    if (!freq) return;

    try {
      const ctx       = volumeManager.getAudioContext();
      const masterVol = volumeManager.getVolume();
      const now       = ctx.currentTime;
      const stepMs    = (60000 * 4) / this.bpm / this.steps;
      const noteDur   = Math.min(stepMs / 1000 * 0.75, 0.35);

      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type            = 'triangle';
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.28 * masterVol, now + 0.012);
      gain.gain.setValueAtTime(0.28 * masterVol, now + noteDur * 0.7);
      gain.gain.linearRampToValueAtTime(0, now + noteDur);

      osc.start(now);
      osc.stop(now + noteDur);
    } catch (e) {
      console.warn('BackingTrackView: bass note error', e);
    }
  }

  // ─── Chord drone ─────────────────────────────────────────────────────────────

  private playChordDrone(chordDeg: number): void {
    const entry = getRomansForMode(this.progMode)[chordDeg - 1];
    if (!entry) return;
    const chordKey = resolveAbsoluteChordKey(entry.roman, this.progRootNote, this.progMode);
    if (!chordKey) return;
    const chordEntry = chord_tones_library[chordKey];
    if (!chordEntry) return;

    const stepMs     = (60000 * 4) / this.bpm / this.steps;
    const measureSec = (stepMs * this.steps) / 1000;
    const fadeSec    = Math.min(0.12, measureSec * 0.08);

    try {
      const ctx       = volumeManager.getAudioContext();
      const masterVol = volumeManager.getVolume();
      const chordVol  = 0.18 * masterVol;
      const now       = ctx.currentTime;

      chordEntry.tones.forEach((toneName, i) => {
        const octave = i === 0 ? 2 : 3;
        const freq   = chordToneFreq(toneName, octave);
        if (!freq) return;

        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(ctx.destination);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(chordVol, now + fadeSec);
        gain.gain.setValueAtTime(chordVol, now + measureSec - fadeSec);
        gain.gain.linearRampToValueAtTime(0, now + measureSec);

        osc.start(now);
        osc.stop(now + measureSec);
      });
    } catch (e) {
      console.warn('BackingTrackView: chord drone error', e);
    }
  }

  // ─── Export / Import ──────────────────────────────────────────────────────────

  private getState(): object {
    return {
      bpm:           this.bpm,
      steps:         this.steps,
      swingAmount:   this.swingAmount,
      tracks:        this.tracks,
      bassTrack:     this.bassTrack,
      trackSounds:   this.trackSounds,
      progRootNote:  this.progRootNote,
      progMode:      this.progMode,
      numMeasures:   this.numMeasures,
      measureChords: this.measureChords,
    };
  }

  private exportToJSON(): void {
    const json = JSON.stringify(this.getState(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'drum-machine.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  private importFromFile(file: File): void {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const state = JSON.parse(e.target?.result as string);
        this.applyState(state);
      } catch {
        console.error('BackingTrackView: invalid JSON file');
      }
    };
    reader.readAsText(file);
  }

  private dispatchStateChange(): void {
    if (!this.container) return;
    this.container.dispatchEvent(new CustomEvent('feature-state-changed', {
      bubbles: true,
      detail:  this.getState(),
    }));
  }
}
