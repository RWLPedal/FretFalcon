// ts/views/backing_track_view.ts
import { BaseView } from '../base_view';
import { KeyType, SignalKind, TempoSignal } from '../panels/link_types';
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
  MAJOR_ROMANS,
  MINOR_ROMANS,
  RomanEntry,
  resolveAbsoluteChordKey,
  isMajorChordSuffix,
} from '../fretboard/chord_key_resolver';

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
  measureChords?: (string | null)[];
}

// ─── Chord progression helpers ─────────────────────────────────────────────────
// CHORD_ROOTS, MAJOR_ROMANS, MINOR_ROMANS are imported from chord_key_resolver.ts


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

const PRESETS: DrumPreset[] = [
  {
    name: '— Empty —', bpm: 120, steps: 16, numMeasures: 4,
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
    measureChords: ['I', 'IV', 'V', 'I'],
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
    measureChords: ['I', 'IV', 'I', 'V'],
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
    measureChords: ['I', 'V', 'vi', 'IV'],
  },
  {
    name: 'Blues Shuffle', bpm: 90, steps: 16, numMeasures: 12,
    tracks: [
      // Kick on 1, Tom on 3 for variety
      ['kick', null, null, null, null, null, null, null, 'tom', null, null, null, null, null, null, null],
      [null, null, null, null, 'snare', null, null, null, null, null, null, null, 'snare', null, null, null],
      ['hihat', null, 'hihat', null, 'hihat', null, 'hihat', null, 'hihat', null, 'hihat', null, 'hihat', null, 'hihat', null],
      [null, null, null, null, null, null, null, null, null, null, null, null, null, null, 'open_hihat', null],
    ],
    // Walking quarter notes: 1 → 3 → 5 → 7
    bassTrack: [1, null, null, null, 3, null, null, null, 5, null, null, null, 7, null, null, null],
    // Standard 12-bar blues: I I I I | IV IV I I | V IV I V
    measureChords: ['I','I','I','I','IV','IV','I','I','V','IV','I','V'],
  },
  {
    name: 'Indie Rock', bpm: 118, steps: 16, numMeasures: 8,
    tracks: [
      // Kick pushes on beat 2½ for a stumble-forward feel
      ['kick', null, null, null, null, null, 'kick', null, 'kick', null, null, null, null, null, null, null],
      [null, null, null, null, 'snare', null, null, null, null, null, null, null, 'snare', null, null, null],
      ['hihat', null, 'hihat', null, 'hihat', null, 'hihat', null, 'hihat', null, 'hihat', null, 'hihat', null, 'hihat', null],
      // Crash on 1, shaker driving 8th notes after
      ['crash', null, 'shaker', null, 'shaker', null, 'shaker', null, 'shaker', null, 'shaker', null, 'shaker', null, 'shaker', null],
    ],
    bassTrack: [1, null, null, null, null, null, null, null, 5, null, null, null, null, null, 7, null],
    measureChords: ['I', 'I', 'V', 'V', 'vi', 'vi', 'IV', 'IV'],
  },
  {
    name: 'Jazz Swing', bpm: 160, steps: 16, numMeasures: 8,
    tracks: [
      // Kick on beat 4 ("dropping the bomb"), otherwise sparse
      [null, null, null, null, null, null, null, null, null, null, null, null, 'kick', null, null, null],
      [null, null, null, null, 'snare', null, null, null, null, null, null, null, 'snare', null, null, null],
      // Ride cymbal: quarter notes with "and of 2" subdivision (swing approximation)
      ['hihat', null, null, null, 'hihat', null, 'hihat', null, 'hihat', null, null, null, 'hihat', null, 'hihat', null],
      [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    ],
    // Walking quarter notes: 1 → 2 → 5 → 4
    bassTrack: [1, null, null, null, 2, null, null, null, 5, null, null, null, 4, null, null, null],
    // I-vi7-ii7-V turnaround × 2
    measureChords: ['Imaj7', 'vi7', 'ii7', 'V', 'Imaj7', 'vi7', 'ii7', 'V'],
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
  private selectedSound: DrumSoundId | null = 'kick';
  private selectedBassDegree: number | null = null;
  private isPlaying: boolean = false;
  private currentStep: number = -1;
  private intervalId: number | null = null;

  // Chord progression state
  private numMeasures: 4 | 8 | 12 = 4;
  private progRootNote: string = 'C';
  private progKeyType: KeyType = KeyType.Major;
  private selectedChord: string | null = null;
  private measureChords: (string | null)[] = [];
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
  private soundPaletteBtns: Map<DrumSoundId, HTMLButtonElement> = new Map();
  private barsBtns: Map<number, HTMLButtonElement> = new Map();
  private bassToolSelectEl: HTMLSelectElement | null = null;
  private chordToolSelectEl: HTMLSelectElement | null = null;
  private progRootSelectEl: HTMLSelectElement | null = null;
  private progKeyTypeBtn: HTMLButtonElement | null = null;
  private chordMeasureCellEls: HTMLElement[] = [];

  constructor(initialState?: any) {
    super();
    this.bpm          = initialState?.bpm          ?? 120;
    this.steps        = initialState?.steps        ?? 16;
    this.swingAmount  = Math.min(0.5, Math.max(0, initialState?.swingAmount ?? 0));
    this.progRootNote = initialState?.progRootNote ?? 'C';
    this.progKeyType  = initialState?.progKeyType  ?? 'Major';
    const nm = initialState?.numMeasures;
    this.numMeasures  = (nm === 4 || nm === 8 || nm === 12) ? nm : 4;
    if (Array.isArray(initialState?.measureChords)) {
      this.measureChords = initialState.measureChords.slice(0, this.numMeasures);
      while (this.measureChords.length < this.numMeasures) this.measureChords.push(null);
    } else {
      this.measureChords = new Array(this.numMeasures).fill(null);
    }
    this.initTracks(initialState?.tracks);
    this.initBassTrack(initialState?.bassTrack);
  }

  // ─── View interface ──────────────────────────────────────────────────────────

  render(container: HTMLElement): void {
    this.container = container;
    container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.classList.add('drum-machine-view');

    wrapper.appendChild(this.buildControls());
    wrapper.appendChild(this.buildPalette());

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
    this.soundPaletteBtns.clear();
    this.barsBtns.clear();
    this.bassToolSelectEl    = null;
    this.chordToolSelectEl   = null;
    this.progRootSelectEl    = null;
    this.progKeyTypeBtn      = null;
    this.chordMeasureCellEls = [];
    super.destroy();
  }

  // ─── Controls row ────────────────────────────────────────────────────────────

  private buildControls(): HTMLElement {
    const row = document.createElement('div');
    row.classList.add('dm-controls');

    // Preset selector
    row.appendChild(this.buildLabeledControl('Preset', () => {
      const wrap = document.createElement('div');
      wrap.classList.add('select', 'is-small');
      const sel = document.createElement('select');
      PRESETS.forEach((p, i) => sel.appendChild(new Option(p.name, String(i))));
      sel.addEventListener('change', () => {
        const idx = parseInt(sel.value, 10);
        if (!isNaN(idx)) this.applyPreset(PRESETS[idx]);
      });
      wrap.appendChild(sel);
      return wrap;
    }));

    // BPM
    row.appendChild(this.buildLabeledControl('BPM', () => {
      const group = document.createElement('div');
      group.classList.add('dm-bpm-group');

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

      group.appendChild(this.bpmSliderEl);
      group.appendChild(this.bpmDisplayEl);
      return group;
    }));

    // Swing
    row.appendChild(this.buildLabeledControl('Swing', () => {
      const group = document.createElement('div');
      group.classList.add('dm-bpm-group');

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

      group.appendChild(this.swingSliderEl);
      group.appendChild(this.swingDisplayEl);
      return group;
    }));

    // Bars pill toggle
    row.appendChild(this.buildLabeledControl('Bars', () => {
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
      return toggle;
    }));

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

    // Play/Stop
    this.playBtn = document.createElement('button');
    this.playBtn.classList.add('button', 'is-small', 'dm-play-btn');
    this.playBtn.innerHTML = '<span class="material-icons">play_arrow</span>';
    this.playBtn.title = 'Play / Stop';
    this.playBtn.addEventListener('click', () => {
      if (this.isPlaying) this.stopPlayback();
      else this.startPlayback();
    });
    row.appendChild(this.playBtn);

    return row;
  }

  private buildLabeledControl(labelText: string, buildContent: () => HTMLElement): HTMLElement {
    const group = document.createElement('div');
    group.classList.add('dm-control-group');
    const lbl = document.createElement('label');
    lbl.classList.add('dm-label');
    lbl.textContent = labelText;
    group.appendChild(lbl);
    group.appendChild(buildContent());
    return group;
  }

  // ─── Palette (two rows) ──────────────────────────────────────────────────────

  private buildPalette(): HTMLElement {
    const palette = document.createElement('div');
    palette.classList.add('dm-palette');

    // ── Row 1: drum sound selector ───────────────────────────────────────────
    const soundRow = document.createElement('div');
    soundRow.classList.add('dm-palette-row');

    const drumLbl = document.createElement('span');
    drumLbl.classList.add('dm-label');
    drumLbl.textContent = 'Drum:';
    soundRow.appendChild(drumLbl);

    this.soundPaletteBtns.clear();
    for (const id of ALL_DRUM_SOUND_IDS) {
      const btn = document.createElement('button');
      btn.classList.add('button', 'is-small', 'dm-sound-btn');
      btn.textContent = DRUM_SOUND_LABELS[id];
      btn.style.setProperty('--dm-color', SOUND_COLORS[id]);
      btn.dataset.soundId = id;
      if (id === this.selectedSound) btn.classList.add('is-active');
      btn.addEventListener('click', () => {
        this.selectedSound = (this.selectedSound === id) ? null : id;
        if (this.selectedSound) {
          this.selectedChord = null;
          this.selectedBassDegree = null;
          this.updateChordToolSelect();
          this.updateBassToolSelect();
        }
        this.updatePaletteSelection();
        if (this.selectedSound === id) playDrumSound(id);
      });
      this.soundPaletteBtns.set(id, btn);
      soundRow.appendChild(btn);
    }

    palette.appendChild(soundRow);

    // ── Row 2: key / chord / bass ────────────────────────────────────────────
    const keyRow = document.createElement('div');
    keyRow.classList.add('dm-palette-row');

    // Key root dropdown
    const keyLbl = document.createElement('span');
    keyLbl.classList.add('dm-label');
    keyLbl.textContent = 'Key:';
    keyRow.appendChild(keyLbl);

    const rootWrap = document.createElement('div');
    rootWrap.classList.add('select', 'is-small');
    this.progRootSelectEl = document.createElement('select');
    CHORD_ROOTS.forEach(r => {
      const opt = new Option(r, r);
      if (r === this.progRootNote) opt.selected = true;
      this.progRootSelectEl!.appendChild(opt);
    });
    this.progRootSelectEl.addEventListener('change', () => {
      this.progRootNote = this.progRootSelectEl!.value;
      this.selectedChord = null;
      this.rebuildChordToolOptions();
      this.dispatchStateChange();
    });
    rootWrap.appendChild(this.progRootSelectEl);
    keyRow.appendChild(rootWrap);

    // Major / Minor toggle
    this.progKeyTypeBtn = document.createElement('button');
    this.progKeyTypeBtn.classList.add('button', 'is-small', 'dm-key-type-btn');
    this.progKeyTypeBtn.textContent = this.progKeyType;
    this.progKeyTypeBtn.addEventListener('click', () => {
      this.progKeyType = this.progKeyType === KeyType.Major ? KeyType.Minor : KeyType.Major;
      this.progKeyTypeBtn!.textContent = this.progKeyType;
      this.selectedChord = null;
      this.measureChords = new Array(this.numMeasures).fill(null);
      this.rebuildChordToolOptions();
      this.dispatchStateChange();
    });
    keyRow.appendChild(this.progKeyTypeBtn);

    // Chord tool dropdown
    const chordLbl = document.createElement('span');
    chordLbl.classList.add('dm-label');
    chordLbl.textContent = 'Chord:';
    keyRow.appendChild(chordLbl);

    const chordWrap = document.createElement('div');
    chordWrap.classList.add('select', 'is-small');
    this.chordToolSelectEl = document.createElement('select');
    this.chordToolSelectEl.classList.add('dm-chord-tool-select');
    this.rebuildChordToolOptions();
    this.chordToolSelectEl.addEventListener('change', () => {
      this.selectedChord = this.chordToolSelectEl!.value || null;
      if (this.selectedChord) {
        this.selectedSound = null;
        this.selectedBassDegree = null;
        this.updatePaletteSelection();
        this.updateBassToolSelect();
      }
      this.updateChordToolSelect();
    });
    chordWrap.appendChild(this.chordToolSelectEl);
    keyRow.appendChild(chordWrap);

    // Bass degree dropdown
    const bassLbl = document.createElement('span');
    bassLbl.classList.add('dm-label');
    bassLbl.textContent = 'Bass:';
    keyRow.appendChild(bassLbl);

    const bassWrap = document.createElement('div');
    bassWrap.classList.add('select', 'is-small');
    this.bassToolSelectEl = document.createElement('select');
    this.bassToolSelectEl.classList.add('dm-bass-tool-select');
    this.rebuildBassToolOptions();
    this.bassToolSelectEl.addEventListener('change', () => {
      const val = this.bassToolSelectEl!.value;
      this.selectedBassDegree = val ? parseInt(val, 10) : null;
      if (this.selectedBassDegree !== null) {
        this.selectedSound = null;
        this.selectedChord = null;
        this.updatePaletteSelection();
        this.updateChordToolSelect();
      }
      this.updateBassToolSelect();
    });
    bassWrap.appendChild(this.bassToolSelectEl);
    keyRow.appendChild(bassWrap);

    palette.appendChild(keyRow);

    return palette;
  }

  private rebuildChordToolOptions(): void {
    if (!this.chordToolSelectEl) return;
    this.chordToolSelectEl.innerHTML = '';
    this.chordToolSelectEl.appendChild(new Option('— none —', ''));
    const romans = this.progKeyType === 'Major' ? MAJOR_ROMANS : MINOR_ROMANS;
    for (const entry of romans) {
      const chordKey = this.resolveChordKey(entry);
      if (!chordKey) continue;
      const label = `${entry.roman} — ${chord_tones_library[chordKey]?.name ?? entry.roman}`;
      const opt = new Option(label, entry.roman);
      if (entry.roman === this.selectedChord) opt.selected = true;
      this.chordToolSelectEl.appendChild(opt);
    }
    this.refreshAllMeasureCells();
  }

  private updateChordToolSelect(): void {
    if (!this.chordToolSelectEl) return;
    this.chordToolSelectEl.value = this.selectedChord ?? '';
    this.chordToolSelectEl.classList.toggle('dm-chord-tool-active', this.selectedChord !== null);
  }

  private rebuildBassToolOptions(): void {
    if (!this.bassToolSelectEl) return;
    this.bassToolSelectEl.innerHTML = '';
    this.bassToolSelectEl.appendChild(new Option('— none —', ''));
    const labels: Record<number, string> = { 1: '1 — Root', 3: '3 — Third', 5: '5 — Fifth', 7: '7 — Seventh' };
    for (let d = 1; d <= 7; d++) {
      const opt = new Option(labels[d] ?? String(d), String(d));
      if (d === this.selectedBassDegree) opt.selected = true;
      this.bassToolSelectEl.appendChild(opt);
    }
  }

  private updateBassToolSelect(): void {
    if (!this.bassToolSelectEl) return;
    this.bassToolSelectEl.value = this.selectedBassDegree !== null ? String(this.selectedBassDegree) : '';
    this.bassToolSelectEl.classList.toggle('dm-bass-tool-active', this.selectedBassDegree !== null);
  }

  // ─── Grid ────────────────────────────────────────────────────────────────────

  private rebuildGrid(): void {
    if (!this.gridEl) return;
    this.gridEl.innerHTML = '';
    this.cellEls             = [];
    this.bassCellEls         = [];
    this.stepNumEls          = [];
    this.chordMeasureCellEls = [];

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
      row.appendChild(this.makeTrackLabel(`T${t + 1}`));
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

    // Bass row (separated by a thin rule)
    this.buildBassRow();

    // Chord progression: single inline row
    this.buildProgRow();
  }

  private buildBassRow(): void {
    if (!this.gridEl) return;

    const sep = document.createElement('div');
    sep.classList.add('dm-prog-separator');
    this.gridEl.appendChild(sep);

    const row = document.createElement('div');
    row.classList.add('dm-row');
    row.appendChild(this.makeTrackLabel('Bass'));

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
    row.appendChild(this.makeTrackLabel('Chords'));

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
    el.classList.add('dm-track-label');
    el.textContent = text;
    return el;
  }

  // ─── Cell width / beat-alignment helpers ─────────────────────────────────────

  /**
   * Width in px for a measure cell so that N cells always fill the same total
   * row width as the 16-step drum grid (490 px content, excluding the label).
   * Formula derivation: N×w + (N−1)×2 + 3×4 = 490  →  w = 480/N − 2
   */
  private measureCellWidth(): number {
    return 480 / this.numMeasures - 2;
  }

  /**
   * Returns true when cell m should carry a dm-beat-start margin so that
   * visual beat boundaries (groups of 4 drum steps) are mirrored in the
   * chord row regardless of how many measures are shown.
   *   4 bars  → beat-start every 1 cell (i.e. cells 1, 2, 3)
   *   8 bars  → beat-start every 2 cells (i.e. cells 2, 4, 6)
   *  12 bars  → beat-start every 3 cells (i.e. cells 3, 6, 9)
   */
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

  private updateMeasureCellAppearance(cell: HTMLElement, chord: string | null): void {
    if (chord) {
      const romans = this.progKeyType === 'Major' ? MAJOR_ROMANS : MINOR_ROMANS;
      const entry = romans.find(r => r.roman === chord);
      const chordKey = entry ? this.resolveChordKey(entry) : null;
      const chordName = chordKey ? (chord_tones_library[chordKey]?.name ?? chord) : chord;

      cell.textContent = chord;
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
    const current = this.tracks[track][step];
    if (this.selectedSound !== null) {
      this.tracks[track][step] = (current === this.selectedSound) ? null : this.selectedSound;
      if (this.tracks[track][step]) playDrumSound(this.selectedSound!);
    } else {
      this.tracks[track][step] = null;
    }
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
    if (this.selectedChord !== null) {
      this.measureChords[measureIndex] = (current === this.selectedChord) ? null : this.selectedChord;
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

  private updatePaletteSelection(): void {
    this.soundPaletteBtns.forEach((btn, id) => {
      btn.classList.toggle('is-active', id === this.selectedSound);
    });
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
    this.progKeyType  = state.progKeyType  ?? this.progKeyType;
    const nm = state.numMeasures;
    if (nm === 4 || nm === 8 || nm === 12) this.numMeasures = nm;
    if (Array.isArray(state.measureChords)) {
      this.measureChords = state.measureChords.slice(0, this.numMeasures);
      while (this.measureChords.length < this.numMeasures) this.measureChords.push(null);
    }
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
    if (this.progKeyTypeBtn)   this.progKeyTypeBtn.textContent = this.progKeyType;
    this.barsBtns.forEach((btn, bars) => btn.classList.toggle('is-active', bars === this.numMeasures));

    this.rebuildGrid();
    this.rebuildChordToolOptions();
    this.updateChordToolSelect();
    this.rebuildBassToolOptions();
    this.updateBassToolSelect();

    if (wasPlaying) this.startPlayback();
    this.dispatchStateChange();
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

    // Advance measure at the start of each drum loop
    if (this.currentStep === 0) {
      this.clearMeasureHighlight();
      this.currentMeasure = (this.currentMeasure + 1) % this.numMeasures;
      this.highlightCurrentMeasure();
      const chord = this.measureChords[this.currentMeasure];
      if (chord) this.playChordDrone(chord);
      this.dispatchTickEvent(chord ?? null);
    }
  }

  private dispatchTickEvent(currentChord: string | null): void {
    if (!this.container) return;
    this.container.dispatchEvent(new CustomEvent('backing-track-tick', {
      bubbles: true,
      detail: {
        currentMeasure:  this.currentMeasure,
        currentChord,
        progRootNote:    this.progRootNote,
        progKeyType:     this.progKeyType,
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

  /**
   * Plays a bass note for the given scale degree.
   * The degree is interpreted relative to the current measure's chord root;
   * if no chord is assigned, it falls back to the key root.
   */
  private playBassStep(degree: number): void {
    let rootName     = this.progRootNote;
    let isMajorChord = this.progKeyType === 'Major';

    const chord = this.measureChords[Math.max(0, this.currentMeasure)];
    if (chord) {
      const romans = this.progKeyType === 'Major' ? MAJOR_ROMANS : MINOR_ROMANS;
      const entry  = romans.find(r => r.roman === chord);
      if (entry) {
        const rootIdx = CHORD_ROOTS.indexOf(this.progRootNote);
        rootName      = CHORD_ROOTS[(rootIdx + entry.degree) % 12];
        isMajorChord  = isMajorChordSuffix(entry.suffix);
      }
    }

    const intervals = isMajorChord ? MAJOR_SCALE_SEMITONES : MINOR_SCALE_SEMITONES;
    const semitones = intervals[(degree - 1) % 7];
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

  private resolveChordKey(entry: RomanEntry): string | null {
    const key = resolveAbsoluteChordKey(entry.roman, this.progRootNote, this.progKeyType);
    return (key && chord_tones_library[key]) ? key : null;
  }

  private playChordDrone(roman: string): void {
    const romans  = this.progKeyType === 'Major' ? MAJOR_ROMANS : MINOR_ROMANS;
    const entry   = romans.find(r => r.roman === roman);
    if (!entry) return;
    const chordKey = this.resolveChordKey(entry);
    if (!chordKey) return;
    const chordEntry = chord_tones_library[chordKey];
    if (!chordEntry) return;

    const stepMs      = (60000 * 4) / this.bpm / this.steps;
    const measureSec  = (stepMs * this.steps) / 1000;
    const fadeSec     = Math.min(0.12, measureSec * 0.08);

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
      progRootNote:  this.progRootNote,
      progKeyType:   this.progKeyType,
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
