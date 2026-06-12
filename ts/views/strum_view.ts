// ts/views/strum_view.ts
import { BaseView } from '../base_view';
import { SignalKind, GrooveSignal, DriveSignal, StrumAction } from '../panels/link_types';
import { emitEvent, FeatureStateChangedDetail } from '../core/events';
import { AudioController } from '../audio_controller';
import { BUILT_IN_PRESETS } from './strum_presets';
export { StrokeAction, StrumPreset } from './strum_types';
import { StrokeAction, StrumPreset } from './strum_types';
import { ValueSlider } from './components/value_slider';
interface StrumViewState {
  _v: 1;
  subdivision: 'eighth' | 'sixteenth';
  timeSig: { beats: number; division: number };
  bpm: number;
  swing: number;
  slots: StrokeAction[];
  customPresets: StrumPreset[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GRID_WIDTH = 416; // total pixel width for all slot cells, matching dm grid
const BEAT_GAP   = 8;   // margin-left pixels added at each beat-start slot

const CYCLE_ORDER: StrokeAction[] = [
  StrokeAction.Rest,
  StrokeAction.Stroke,
  StrokeAction.Accent,
  StrokeAction.Chuck,
  StrokeAction.Air,
];

const COMMON_TIME_SIGS = [
  { beats: 4, division: 4, label: '4/4' },
  { beats: 3, division: 4, label: '3/4' },
  { beats: 2, division: 4, label: '2/4' },
  { beats: 6, division: 8, label: '6/8' },
  { beats: 5, division: 4, label: '5/4' },
  { beats: 7, division: 8, label: '7/8' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slotDirection(index: number): 'down' | 'up' {
  return index % 2 === 0 ? 'down' : 'up';
}

function slotLabel(action: StrokeAction, direction: 'down' | 'up'): string {
  switch (action) {
    case StrokeAction.Rest:   return '–';
    case StrokeAction.Chuck:  return '✕';
    case StrokeAction.Stroke: return direction === 'down' ? '↓' : '↑';
    case StrokeAction.Accent: return direction === 'down' ? '↓' : '↑';
    case StrokeAction.Air:    return direction === 'down' ? '↓' : '↑';
  }
}

function totalSlots(timeSig: { beats: number; division: number }, subdivision: 'eighth' | 'sixteenth'): number {
  const eighthsPerBar = timeSig.beats * (8 / timeSig.division);
  return subdivision === 'eighth' ? eighthsPerBar : eighthsPerBar * 2;
}

function slotsPerBeat(timeSig: { beats: number; division: number }, subdivision: 'eighth' | 'sixteenth'): number {
  return (8 / timeSig.division) * (subdivision === 'eighth' ? 1 : 2);
}

function slotBeatLabel(index: number, timeSig: { beats: number; division: number }, subdivision: 'eighth' | 'sixteenth'): string {
  const spb  = slotsPerBeat(timeSig, subdivision);
  const beat = Math.floor(index / spb) + 1;
  const pos  = index % spb;
  if (spb === 1) return String(beat);
  if (subdivision === 'eighth') return pos === 0 ? String(beat) : '+';
  const s16 = ['', 'e', '+', 'a'];
  return pos === 0 ? String(beat) : (s16[pos] ?? '');
}

function computeCellWidth(timeSig: { beats: number; division: number }, subdivision: 'eighth' | 'sixteenth'): number {
  const n   = totalSlots(timeSig, subdivision);
  const spb = slotsPerBeat(timeSig, subdivision);
  let gaps  = 0;
  for (let i = 1; i < n; i++) { if (i % spb === 0) gaps++; }
  return (GRID_WIDTH - gaps * BEAT_GAP) / n;
}

// ─── StrumView ────────────────────────────────────────────────────────────────

export class StrumView extends BaseView {
  private subdivision: 'eighth' | 'sixteenth';
  private timeSig: { beats: number; division: number };
  private bpm: number;
  private swing: number;
  private slots: StrokeAction[];
  private customPresets: StrumPreset[];

  private isPlaying = false;
  private currentStep = -1;
  private intervalId: number | null = null;
  private isGrooveTarget = false;

  private audioController: AudioController | null;

  // UI refs
  private gridEl: HTMLElement | null = null;
  private beatLabelsEl: HTMLElement | null = null;
  private cellEls: HTMLElement[] = [];
  private beatLabelEls: HTMLElement[] = [];
  private playBtn: HTMLButtonElement | null = null;
  private bpmSlider: ValueSlider | null = null;
  private timeSigSelect: HTMLSelectElement | null = null;
  private subdivisionBtn: HTMLButtonElement | null = null;
  private presetSelect: HTMLSelectElement | null = null;

  constructor(initialState?: Partial<StrumViewState>, audioController?: AudioController) {
    super();
    this.audioController = audioController ?? null;
    this.bpm           = initialState?.bpm           ?? 100;
    this.subdivision   = initialState?.subdivision   ?? 'eighth';
    this.timeSig       = initialState?.timeSig       ?? { beats: 4, division: 4 };
    this.swing         = initialState?.swing         ?? 0;
    this.customPresets = initialState?.customPresets ?? [];
    const n = totalSlots(this.timeSig, this.subdivision);
    this.slots = (initialState?.slots?.length === n)
      ? [...initialState.slots]
      : new Array(n).fill(StrokeAction.Rest);
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  render(container: HTMLElement): void {
    this.container = container;
    container.innerHTML = '';

    const root = document.createElement('div');
    root.className = 'sv-root';
    root.appendChild(this.buildHeader());
    root.appendChild(this.buildGridWrapper());
    container.appendChild(root);

    this.listen(container, 'drive-signal', (e: Event) => {
      const signal = (e as CustomEvent).detail?.signal as DriveSignal | undefined;
      if (!signal) return;
      if (signal.kind === SignalKind.Groove) this.handleGrooveSignal(signal);
      else if (signal.kind === SignalKind.Play) {
        if (signal.playing) this.start(); else this.stop();
      }
    });

    this.listen(container, 'link-status-changed', (e: Event) => {
      this.isGrooveTarget = !!((e as CustomEvent).detail?.hasIncomingLinks);
      this.bpmSlider?.setDisabled(this.isGrooveTarget);
    });
  }

  // ─── Header ───────────────────────────────────────────────────────────────────

  private buildHeader(): HTMLElement {
    const header = document.createElement('div');
    header.className = 'sv-header';

    // Tall play button (left column, spans both rows)
    const playWrap = document.createElement('div');
    playWrap.className = 'sv-play-large';
    this.playBtn = document.createElement('button');
    this.playBtn.type = 'button';
    this.playBtn.className = 'button is-small is-light sv-play-btn';
    this.playBtn.innerHTML = `<span class="material-icons">play_arrow</span>`;
    this.playBtn.title = 'Play / Stop';
    this.playBtn.addEventListener('click', () => {
      if (this.isPlaying) this.stop(); else this.start();
    });
    playWrap.appendChild(this.playBtn);
    header.appendChild(playWrap);

    const rows = document.createElement('div');
    rows.className = 'sv-controls-rows';
    rows.appendChild(this.buildControlRow1());
    rows.appendChild(this.buildControlRow2());
    header.appendChild(rows);

    return header;
  }

  /** Row 1: time sig | subdivision | BPM | metronome */
  private buildControlRow1(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'sv-controls-row';

    // Time signature
    const tsWrap = document.createElement('div');
    tsWrap.className = 'select is-small';
    this.timeSigSelect = document.createElement('select');
    COMMON_TIME_SIGS.forEach(ts => {
      const opt = new Option(ts.label, ts.label);
      if (ts.beats === this.timeSig.beats && ts.division === this.timeSig.division) opt.selected = true;
      this.timeSigSelect!.appendChild(opt);
    });
    this.timeSigSelect.addEventListener('change', () => {
      const found = COMMON_TIME_SIGS.find(ts => ts.label === this.timeSigSelect!.value);
      if (found) {
        this.timeSig = { beats: found.beats, division: found.division };
        this.rebuildGrid();
        this.refreshPresetList();
        this.dispatchStateChange();
      }
    });
    tsWrap.appendChild(this.timeSigSelect);
    row.appendChild(tsWrap);

    // Subdivision pill toggle
    this.subdivisionBtn = document.createElement('button');
    this.subdivisionBtn.type = 'button';
    this.subdivisionBtn.className = 'button is-small sv-subdiv-btn';
    this.subdivisionBtn.title = 'Toggle subdivision: 8th vs 16th notes per slot';
    this.updateSubdivBtnLabel();
    this.subdivisionBtn.addEventListener('click', () => {
      this.subdivision = this.subdivision === 'eighth' ? 'sixteenth' : 'eighth';
      this.updateSubdivBtnLabel();
      this.rebuildGrid();
      this.refreshPresetList();
      this.dispatchStateChange();
    });
    row.appendChild(this.subdivisionBtn);

    // BPM
    this.bpmSlider = new ValueSlider({
      min: 20, max: 240, value: this.bpm, label: 'BPM',
      disabled: this.isGrooveTarget,
      onChange: (v) => {
        this.bpm = v;
        if (this.isPlaying) this.restartInterval();
        this.dispatchGrooveConfig();
        this.dispatchStateChange();
      },
    });
    this.bpmSlider.element.classList.add('sv-bpm-slider');
    row.appendChild(this.bpmSlider.element);

    return row;
  }

  /** Row 2: preset selector + save */
  private buildControlRow2(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'sv-controls-row';

    const label = document.createElement('span');
    label.className = 'sv-label';
    label.textContent = 'Preset:';
    row.appendChild(label);

    const selectWrap = document.createElement('div');
    selectWrap.className = 'select is-small sv-preset-wrap';
    this.presetSelect = document.createElement('select');
    selectWrap.appendChild(this.presetSelect);
    row.appendChild(selectWrap);

    this.refreshPresetList();

    this.presetSelect.addEventListener('change', () => {
      const presetId = this.presetSelect!.value;
      if (!presetId) return;
      const preset = [...BUILT_IN_PRESETS, ...this.customPresets].find(p => p.id === presetId);
      if (preset) this.applyPreset(preset);
    });

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'button is-small sv-icon-btn';
    saveBtn.title = 'Save current pattern as preset';
    saveBtn.innerHTML = `<span class="material-icons">bookmark_add</span>`;
    saveBtn.addEventListener('click', () => this.saveCustomPreset());
    row.appendChild(saveBtn);

    return row;
  }

  private updateSubdivBtnLabel(): void {
    if (!this.subdivisionBtn) return;
    const is16th = this.subdivision === 'sixteenth';
    this.subdivisionBtn.textContent = is16th ? '16th' : '8th';
    this.subdivisionBtn.classList.toggle('sv-subdiv-btn--active', is16th);
  }

  // ─── Grid ─────────────────────────────────────────────────────────────────────

  private buildGridWrapper(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'sv-grid-wrapper';

    this.beatLabelsEl = document.createElement('div');
    this.beatLabelsEl.className = 'sv-beat-labels';
    wrapper.appendChild(this.beatLabelsEl);

    this.gridEl = document.createElement('div');
    this.gridEl.className = 'sv-grid';
    wrapper.appendChild(this.gridEl);

    this.buildCells();
    return wrapper;
  }

  private buildCells(): void {
    if (!this.gridEl || !this.beatLabelsEl) return;
    this.gridEl.innerHTML = '';
    this.beatLabelsEl.innerHTML = '';
    this.cellEls = [];
    this.beatLabelEls = [];

    const n    = totalSlots(this.timeSig, this.subdivision);
    const spb  = slotsPerBeat(this.timeSig, this.subdivision);
    const cellW = computeCellWidth(this.timeSig, this.subdivision);

    if (this.slots.length !== n) {
      this.slots = new Array(n).fill(StrokeAction.Rest);
    }

    for (let i = 0; i < n; i++) {
      const isBeatStart = i > 0 && i % spb === 0;

      // Beat label
      const lbl = document.createElement('div');
      lbl.className = 'sv-beat-label';
      lbl.style.width    = `${cellW}px`;
      lbl.style.minWidth = `${cellW}px`;
      if (i % spb === 0) lbl.classList.add('sv-beat-label--beat');
      if (isBeatStart)   lbl.classList.add('sv-beat-start');
      lbl.textContent = slotBeatLabel(i, this.timeSig, this.subdivision);
      this.beatLabelEls.push(lbl);
      this.beatLabelsEl.appendChild(lbl);

      // Slot cell
      const cell = document.createElement('div');
      cell.className = 'sv-slot';
      cell.style.width    = `${cellW}px`;
      cell.style.minWidth = `${cellW}px`;
      if (isBeatStart) cell.classList.add('sv-beat-start');

      const indicator = document.createElement('span');
      indicator.className = 'sv-slot-indicator';
      cell.appendChild(indicator);

      this.updateCellStyle(cell, i);
      cell.addEventListener('click', () => this.cycleSlot(i));
      this.cellEls.push(cell);
      this.gridEl.appendChild(cell);
    }
  }

  private rebuildGrid(): void {
    const n = totalSlots(this.timeSig, this.subdivision);
    const oldSlots = [...this.slots];
    this.slots = new Array(n).fill(StrokeAction.Rest);
    for (let i = 0; i < Math.min(n, oldSlots.length); i++) this.slots[i] = oldSlots[i];
    const wasPlaying = this.isPlaying;
    if (wasPlaying) this.stop();
    this.buildCells();
    if (wasPlaying) this.start();
  }

  private updateCellStyle(cell: HTMLElement, index: number): void {
    const action = this.slots[index];
    const dir    = slotDirection(index);
    const ind    = cell.querySelector<HTMLElement>('.sv-slot-indicator');

    cell.classList.remove(
      'sv-slot--rest', 'sv-slot--stroke', 'sv-slot--accent',
      'sv-slot--chuck', 'sv-slot--air', 'sv-slot--down', 'sv-slot--up',
    );
    cell.classList.add(`sv-slot--${action}`);
    if (action !== StrokeAction.Rest && action !== StrokeAction.Chuck) {
      cell.classList.add(`sv-slot--${dir}`);
    }
    if (ind) ind.textContent = slotLabel(action, dir);
  }

  private cycleSlot(index: number): void {
    const current = this.slots[index];
    const idx = CYCLE_ORDER.indexOf(current);
    this.slots[index] = CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length];
    this.updateCellStyle(this.cellEls[index], index);
    this.dispatchStateChange();
  }

  // ─── Presets ──────────────────────────────────────────────────────────────────

  private refreshPresetList(): void {
    if (!this.presetSelect) return;
    this.presetSelect.innerHTML = '<option value="">— load preset —</option>';
    const allPresets  = [...BUILT_IN_PRESETS, ...this.customPresets];
    const compatible  = allPresets.filter(p =>
      p.timeSig.beats === this.timeSig.beats &&
      p.timeSig.division === this.timeSig.division
    );
    const builtIn = compatible.filter(p => p.isBuiltIn);
    const custom  = compatible.filter(p => !p.isBuiltIn);
    if (builtIn.length) {
      const grp = document.createElement('optgroup');
      grp.label = 'Built-in';
      builtIn.forEach(p => grp.appendChild(new Option(p.name, p.id)));
      this.presetSelect.appendChild(grp);
    }
    if (custom.length) {
      const grp = document.createElement('optgroup');
      grp.label = 'Custom';
      custom.forEach(p => grp.appendChild(new Option(p.name, p.id)));
      this.presetSelect.appendChild(grp);
    }
  }

  private applyPreset(preset: StrumPreset): void {
    this.timeSig     = { ...preset.timeSig };
    this.subdivision = preset.subdivision;
    this.updateSubdivBtnLabel();
    if (this.timeSigSelect) {
      const label = COMMON_TIME_SIGS.find(
        ts => ts.beats === preset.timeSig.beats && ts.division === preset.timeSig.division
      )?.label ?? '4/4';
      this.timeSigSelect.value = label;
    }
    const n = totalSlots(preset.timeSig, preset.subdivision);
    this.slots = preset.slots.length === n ? [...preset.slots] : [...preset.slots].slice(0, n);
    this.buildCells();
    this.dispatchStateChange();
  }

  private saveCustomPreset(): void {
    const name = prompt('Preset name:')?.trim();
    if (!name) return;
    const preset: StrumPreset = {
      _v: 1, id: `custom_${Date.now()}`, name,
      instrument: 'Guitar',
      timeSig: { ...this.timeSig },
      subdivision: this.subdivision,
      slots: [...this.slots],
      isBuiltIn: false,
    };
    this.customPresets.push(preset);
    this.refreshPresetList();
    this.dispatchStateChange();
  }

  // ─── Playback ─────────────────────────────────────────────────────────────────

  start(): void {
    this.isPlaying = true;
    if (this.playBtn) {
      this.playBtn.innerHTML = `<span class="material-icons">stop</span>`;
      this.playBtn.classList.add('is-danger');
      this.playBtn.classList.remove('is-light');
    }
    this.startInterval();
    this.dispatchTransportChanged(true);
  }

  stop(): void {
    this.isPlaying = false;
    if (this.playBtn) {
      this.playBtn.innerHTML = `<span class="material-icons">play_arrow</span>`;
      this.playBtn.classList.remove('is-danger');
      this.playBtn.classList.add('is-light');
    }
    this.stopInterval();
    this.clearHighlight();
    this.currentStep = -1;
    this.dispatchTransportChanged(false);
  }

  destroy(): void {
    this.stopInterval();
    super.destroy();
  }

  private startInterval(): void {
    if (this.intervalId !== null) return;
    const msPerQuarter = 60000 / this.bpm;
    const msPerSlot = this.subdivision === 'eighth' ? msPerQuarter / 2 : msPerQuarter / 4;
    this.intervalId = window.setInterval(() => this.tick(), msPerSlot);
  }

  private stopInterval(): void {
    if (this.intervalId !== null) { clearInterval(this.intervalId); this.intervalId = null; }
  }

  private restartInterval(): void {
    this.stopInterval();
    if (this.isPlaying) this.startInterval();
  }

  private tick(): void {
    this.clearHighlight();
    this.currentStep = (this.currentStep + 1) % totalSlots(this.timeSig, this.subdivision);
    this.highlightStep(this.currentStep);
    this.playAudioForStep(this.currentStep);
    this.dispatchGrooveTick(this.currentStep);
    this.dispatchStrumTick(this.currentStep);
  }

  private highlightStep(step: number): void {
    this.cellEls[step]?.classList.add('sv-slot--current');
    this.beatLabelEls[step]?.classList.add('sv-beat-label--current');
  }

  private clearHighlight(): void {
    if (this.currentStep >= 0) {
      this.cellEls[this.currentStep]?.classList.remove('sv-slot--current');
      this.beatLabelEls[this.currentStep]?.classList.remove('sv-beat-label--current');
    }
  }

  private playAudioForStep(step: number): void {
    if (this.audioController) {
      const action = this.slots[step];
      const dir = slotDirection(step);
      if (action === StrokeAction.Chuck) {
        this.audioController.playStrumChuck();
      } else if (action === StrokeAction.Stroke) {
        dir === 'down' ? this.audioController.playStrumDown(false) : this.audioController.playStrumUp(false);
      } else if (action === StrokeAction.Accent) {
        dir === 'down' ? this.audioController.playStrumDown(true) : this.audioController.playStrumUp(true);
      }
      // Rest and Air: no sound
    }

  }

  // ─── Groove signal I/O ────────────────────────────────────────────────────────

  private handleGrooveSignal(signal: GrooveSignal): void {
    // Sync BPM from any groove signal (beat tick or config update)
    const clamped = Math.max(20, Math.min(240, Math.round(signal.bpm)));
    if (clamped !== this.bpm) {
      this.bpm = clamped;
      this.bpmSlider?.setValue(clamped);
      // Config-only signals restart the interval immediately for the new BPM.
      // Beat signals are handled below and will restart at the bar boundary.
      if (this.isPlaying && signal.beat === undefined) this.restartInterval();
    }

    if (signal.beat === undefined) return; // config-only signal, done
    if (signal.beat !== 0) return;         // only sync on bar start

    if (!this.isPlaying) {
      this.start();
      this.tick(); // fire step 0 immediately — no initial setInterval delay
    } else {
      // Re-align to bar boundary: clear the old position, restart the timer,
      // then fire step 0 immediately so we don't skip a slot each bar.
      this.clearHighlight();
      this.currentStep = -1;
      this.restartInterval();
      this.tick();
    }
  }

  private dispatchGrooveTick(beat: number): void {
    if (!this.container) return;
    emitEvent(this.container, 'groove-tick', { bpm: this.bpm, timeSig: this.timeSig, swing: this.swing, beat });
  }

  private dispatchTransportChanged(playing: boolean): void {
    if (!this.container) return;
    emitEvent(this.container, 'transport-changed', { playing });
  }

  private dispatchStrumTick(step: number): void {
    if (!this.container) return;
    const n = totalSlots(this.timeSig, this.subdivision);
    emitEvent(this.container, 'strum-tick', {
      action:     this.slots[step] as unknown as StrumAction,
      direction:  slotDirection(step),
      bpm:        this.bpm,
      timeSig:    this.timeSig,
      step,
      totalSteps: n,
    });
  }

  private dispatchGrooveConfig(): void {
    if (!this.container) return;
    emitEvent(this.container, 'metronome-tempo-changed', { bpm: this.bpm, timeSig: this.timeSig, swing: this.swing });
  }

  private dispatchStateChange(): void {
    if (!this.container) return;
    emitEvent(this.container, 'feature-state-changed', this.getState() as unknown as FeatureStateChangedDetail);
  }

  private getState(): StrumViewState {
    return {
      _v: 1,
      subdivision:   this.subdivision,
      timeSig:       { ...this.timeSig },
      bpm:           this.bpm,
      swing:         this.swing,
      slots:         [...this.slots],
      customPresets: this.customPresets,
    };
  }
}
