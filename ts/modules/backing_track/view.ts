import { BaseView } from '../../core/base_view';
import { ValueSlider } from '../../core/widgets/value_slider';
import { SignalKind, StrumSignal } from '../../panels/link_types';
import { emitEvent, FeatureStateChangedDetail } from '../../core/events';
import {
  DrumSoundId,
  DRUM_SOUND_LABELS,
  ALL_DRUM_SOUND_IDS,
  playDrumSound,
} from '../../sounds/drum_sounds';
import { volumeManager as _volumeManager } from '../../sounds/volume_manager';
import {
  DiatonicMode,
  ALL_DIATONIC_MODES,
  DIATONIC_MODE_LABELS,
} from '../../music/music_types';
import {
  ToneVoice,
  ALL_TONE_VOICES,
  TONE_VOICE_LABELS,
} from '../../sounds/tone_voices';
import {
  CHORD_ROOTS,
  getRomansForMode,
  resolveAbsoluteChordKey,
} from '../../music/chord_key_resolver';
import { chord_tones_library } from '../../music/chords';
import {
  TrackData,
  BassStep,
  DrumPreset,
  NUM_TRACKS,
  DEFAULT_TRACK_SOUNDS,
  SOUND_COLORS,
  BASS_DEGREE_COLORS,
  PRESETS,
} from './presets';
import { BackingTrackEngine, EngineState } from './engine';

export class BackingTrackView extends BaseView {
  // Musical / sequencer state
  private bpm: number = 120;
  private steps: number = 16;
  private swingAmount: number = 0;
  private tracks: TrackData[] = [];
  private bassTrack: BassStep[] = [];
  private trackSounds: DrumSoundId[] = [...DEFAULT_TRACK_SOUNDS];
  private numMeasures: 4 | 8 | 12 = 4;
  private progRootNote: string = "C";
  private progMode: DiatonicMode = DiatonicMode.Ionian;
  private measureChords: (number | null)[] = [];
  private toneVoice: ToneVoice = "clean";
  private isStrumLinked: boolean = false;

  // UI-only state
  private selectedBassDegree: number | null = null;
  private selectedChordDeg: number | null = null;
  private activePresetIndex: number | null = null;
  private activeLayout: "horizontal" | "vertical" = "horizontal";
  private isTempoTarget: boolean = false;

  // Engine
  private engine: BackingTrackEngine;

  // DOM refs
  private gridEl: HTMLElement | null = null;
  private cellEls: HTMLElement[][] = [];
  private bassCellEls: HTMLElement[] = [];
  private stepNumEls: HTMLElement[] = [];
  private chordMeasureCellEls: HTMLElement[] = [];
  private playBtn: HTMLButtonElement | null = null;
  private bpmSlider: ValueSlider | null = null;
  private swingSlider: ValueSlider | null = null;
  private barsBtns: Map<number, HTMLButtonElement> = new Map();
  private trackDropdowns: HTMLSelectElement[] = [];
  private presetSelectEl: HTMLSelectElement | null = null;
  private chordToolSelectEl: HTMLSelectElement | null = null;
  private progRootSelectEl: HTMLSelectElement | null = null;
  private progModeSelectEl: HTMLSelectElement | null = null;
  private toneVoiceSelectEl: HTMLSelectElement | null = null;
  private gridResizeObserver: ResizeObserver | null = null;

  constructor(initialState?: any) {
    super();
    this.bpm = initialState?.bpm ?? 120;
    this.steps = initialState?.steps ?? 16;
    this.swingAmount = Math.min(0.5, Math.max(0, initialState?.swingAmount ?? 0));
    this.progRootNote = initialState?.progRootNote ?? "C";

    const modeRaw = initialState?.progMode;
    this.progMode =
      modeRaw && (Object.values(DiatonicMode) as string[]).includes(modeRaw)
        ? (modeRaw as DiatonicMode)
        : DiatonicMode.Ionian;

    const voiceRaw = initialState?.toneVoice;
    this.toneVoice =
      voiceRaw && (ALL_TONE_VOICES as string[]).includes(voiceRaw)
        ? (voiceRaw as ToneVoice)
        : "clean";

    const nm = initialState?.numMeasures;
    this.numMeasures = nm === 4 || nm === 8 || nm === 12 ? nm : 4;

    if (Array.isArray(initialState?.measureChords)) {
      this.measureChords = this.parseMeasureChords(
        initialState.measureChords,
        this.numMeasures,
      );
    } else {
      this.measureChords = new Array(this.numMeasures).fill(null);
    }
    this.trackSounds = this.resolveTrackSounds(
      initialState?.trackSounds,
      initialState?.tracks,
    );
    this.initTracks(initialState?.tracks);
    this.initBassTrack(initialState?.bassTrack);
    this.activePresetIndex = this.findMatchingPresetIndex();

    this.engine = new BackingTrackEngine(this.buildEngineState(), {
      onStepChange: (prev, curr) => {
        if (prev >= 0) {
          for (const row of this.cellEls)
            row[prev]?.classList.remove("dm-cell-current");
          this.bassCellEls[prev]?.classList.remove("dm-cell-current");
          this.stepNumEls[prev]?.classList.remove("dm-step-current");
        }
        if (curr >= 0) {
          for (const row of this.cellEls) row[curr]?.classList.add("dm-cell-current");
          this.bassCellEls[curr]?.classList.add("dm-cell-current");
          this.stepNumEls[curr]?.classList.add("dm-step-current");
        }
      },
      onMeasureChange: (prev, curr) => {
        if (prev >= 0)
          this.chordMeasureCellEls[prev]?.classList.remove("dm-measure-current");
        if (curr >= 0)
          this.chordMeasureCellEls[curr]?.classList.add("dm-measure-current");
      },
      onPlayStateChange: () => this.updatePlayButton(),
    });
  }

  // ─── View interface ──────────────────────────────────────────────────────────

  render(container: HTMLElement): void {
    this.container = container;
    container.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.classList.add("drum-machine-view");

    wrapper.appendChild(this.buildHeader());

    this.gridEl = document.createElement("div");
    this.gridEl.classList.add("dm-grid");
    wrapper.appendChild(this.gridEl);
    this.rebuildGrid();

    container.appendChild(wrapper);

    this.engine.setContainer(container);

    this.gridResizeObserver = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      const needed: "vertical" | "horizontal" = w <= 480 ? "vertical" : "horizontal";
      if (needed !== this.activeLayout) {
        this.activeLayout = needed;
        this.rebuildGrid();
      }
    });
    this.gridResizeObserver.observe(wrapper);

    this.dispatchStateChange();

    this.listen(container, "drive-signal", (e: Event) => {
      const signal = (e as CustomEvent).detail?.signal;
      if (!signal) return;
      if (signal.kind === SignalKind.Play) {
        if (signal.playing) this.startPlayback();
        else this.stopPlayback();
        return;
      }
      if (signal.kind === SignalKind.Strum) {
        this.isStrumLinked = true;
        this.engine.updateState({ isStrumLinked: true });
        this.engine.handleStrumSignal(signal as StrumSignal);
        return;
      }
      if (signal.kind !== SignalKind.Groove) return;
      // Ignore per-beat ticks — only sync BPM from config updates (no beat field)
      if (signal.beat !== undefined) return;
      const clamped = Math.max(30, Math.min(200, Math.round(signal.bpm)));
      if (clamped === this.bpm) return;
      this.bpm = clamped;
      this.bpmSlider?.setValue(clamped);
      if (this.engine.isRunning()) {
        this.engine.stop();
        this.engine.updateState(this.buildEngineState());
        this.engine.start();
      } else {
        this.engine.updateState({ bpm: clamped });
      }
    });
    this.listen(container, "link-status-changed", (e: Event) => {
      const detail = (e as CustomEvent).detail;
      this.isTempoTarget = !!detail?.hasIncomingLinks;
      if (!detail?.hasIncomingLinks) {
        this.isStrumLinked = false;
        this.engine.updateState({ isStrumLinked: false });
      }
      this.applyTempoTargetState();
    });
  }

  private applyTempoTargetState(): void {
    this.bpmSlider?.setDisabled(this.isTempoTarget);
  }

  destroy(): void {
    this.gridResizeObserver?.disconnect();
    this.gridResizeObserver = null;
    this.engine.destroy();
    this.gridEl = null;
    this.cellEls = [];
    this.bassCellEls = [];
    this.stepNumEls = [];
    this.playBtn = null;
    this.bpmSlider = null;
    this.swingSlider = null;
    this.barsBtns.clear();
    this.trackDropdowns = [];
    this.presetSelectEl = null;
    this.chordToolSelectEl = null;
    this.progRootSelectEl = null;
    this.progModeSelectEl = null;
    this.toneVoiceSelectEl = null;
    this.chordMeasureCellEls = [];
    super.destroy();
  }

  // ─── Playback delegation ─────────────────────────────────────────────────────

  private startPlayback(): void {
    this.engine.updateState(this.buildEngineState());
    this.engine.start();
  }

  private stopPlayback(): void {
    this.engine.stop();
  }

  private updatePlayButton(): void {
    if (!this.playBtn) return;
    const playing = this.engine.isRunning();
    this.playBtn.innerHTML = playing
      ? '<span class="material-icons">stop</span>'
      : '<span class="material-icons">play_arrow</span>';
    this.playBtn.classList.toggle("is-danger", playing);
    this.playBtn.classList.toggle("is-light", !playing);
  }

  // ─── Header ──────────────────────────────────────────────────────────────────

  private buildHeader(): HTMLElement {
    const header = document.createElement("div");
    header.classList.add("dm-header");

    const playWrap = document.createElement("div");
    playWrap.classList.add("dm-play-large");
    this.playBtn = document.createElement("button");
    this.playBtn.classList.add("button", "is-small", "dm-play-btn");
    this.playBtn.innerHTML = '<span class="material-icons">play_arrow</span>';
    this.playBtn.title = "Play / Stop";
    this.playBtn.addEventListener("click", () => {
      if (this.engine.isRunning()) this.stopPlayback();
      else this.startPlayback();
    });
    playWrap.appendChild(this.playBtn);
    header.appendChild(playWrap);

    const rows = document.createElement("div");
    rows.classList.add("dm-controls-rows");
    rows.appendChild(this.buildControlRow1());
    rows.appendChild(this.buildControlRow2());
    header.appendChild(rows);
    return header;
  }

  /** Row 1: PRESET [Dropdown] [Save] [Load] | Root [Dropdown] | Mode [Dropdown] */
  private buildControlRow1(): HTMLElement {
    const row = document.createElement("div");
    row.classList.add("dm-controls-row");

    const presetLbl = document.createElement("span");
    presetLbl.classList.add("dm-label");
    presetLbl.textContent = "Preset:";
    row.appendChild(presetLbl);

    const presetWrap = document.createElement("div");
    presetWrap.classList.add("select", "is-small");
    const sel = document.createElement("select");
    this.presetSelectEl = sel;
    sel.appendChild(new Option("Preset…", ""));
    PRESETS.forEach((p, i) => {
      const opt = new Option(p.name, String(i));
      if (i === this.activePresetIndex) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", () => {
      const idx = parseInt(sel.value, 10);
      if (!isNaN(idx)) this.applyPreset(PRESETS[idx]);
    });
    presetWrap.appendChild(sel);
    row.appendChild(presetWrap);

    const saveBtn = document.createElement("button");
    saveBtn.classList.add("button", "is-small", "dm-icon-btn");
    saveBtn.title = "Save to JSON";
    saveBtn.innerHTML = '<span class="material-icons">save</span>';
    saveBtn.addEventListener("click", () => this.exportToJSON());
    row.appendChild(saveBtn);

    const loadBtn = document.createElement("button");
    loadBtn.classList.add("button", "is-small", "dm-icon-btn");
    loadBtn.title = "Load from JSON";
    loadBtn.innerHTML = '<span class="material-icons">folder_open</span>';
    loadBtn.addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
      input.addEventListener("change", () => {
        const file = input.files?.[0];
        if (file) this.importFromFile(file);
      });
      input.click();
    });
    row.appendChild(loadBtn);

    const rootWrap = document.createElement("div");
    rootWrap.classList.add("select", "is-small", "dm-root-select-wrap");
    this.progRootSelectEl = document.createElement("select");
    CHORD_ROOTS.forEach((r) => {
      const opt = new Option(r, r);
      if (r === this.progRootNote) opt.selected = true;
      this.progRootSelectEl!.appendChild(opt);
    });
    this.progRootSelectEl.addEventListener("change", () => {
      this.progRootNote = this.progRootSelectEl!.value;
      this.selectedChordDeg = null;
      this.engine.updateState({ progRootNote: this.progRootNote });
      this.rebuildChordToolOptions();
      this.dispatchStateChange();
    });
    rootWrap.appendChild(this.progRootSelectEl);
    row.appendChild(rootWrap);

    const modeWrap = document.createElement("div");
    modeWrap.classList.add("select", "is-small");
    this.progModeSelectEl = document.createElement("select");
    for (const mode of ALL_DIATONIC_MODES) {
      const opt = new Option(DIATONIC_MODE_LABELS[mode], mode);
      if (mode === this.progMode) opt.selected = true;
      this.progModeSelectEl.appendChild(opt);
    }
    this.progModeSelectEl.addEventListener("change", () => {
      this.progMode = this.progModeSelectEl!.value as DiatonicMode;
      this.selectedChordDeg = null;
      this.engine.updateState({ progMode: this.progMode });
      this.rebuildChordToolOptions();
      this.dispatchStateChange();
    });
    modeWrap.appendChild(this.progModeSelectEl);
    row.appendChild(modeWrap);

    return row;
  }

  /** Row 2: Voice [dropdown] BPM: [slider+display] SWING: [slider+display] BARS: [4|8|12] */
  private buildControlRow2(): HTMLElement {
    const row = document.createElement("div");
    row.classList.add("dm-controls-row");

    const voiceWrap = document.createElement("div");
    voiceWrap.classList.add("select", "is-small");
    this.toneVoiceSelectEl = document.createElement("select");
    for (const voice of ALL_TONE_VOICES) {
      const opt = new Option(TONE_VOICE_LABELS[voice], voice);
      if (voice === this.toneVoice) opt.selected = true;
      this.toneVoiceSelectEl.appendChild(opt);
    }
    this.toneVoiceSelectEl.addEventListener("change", () => {
      this.toneVoice = this.toneVoiceSelectEl!.value as ToneVoice;
      this.engine.updateState({ toneVoice: this.toneVoice });
      this.dispatchStateChange();
    });
    voiceWrap.appendChild(this.toneVoiceSelectEl);
    row.appendChild(voiceWrap);

    this.bpmSlider = new ValueSlider({
      min: 30,
      max: 200,
      value: this.bpm,
      label: "BPM",
      onChange: (v) => {
        this.bpm = v;
        this.engine.updateState({ bpm: v });
        if (this.engine.isRunning()) {
          this.engine.stop();
          this.engine.updateState(this.buildEngineState());
          this.engine.start();
        }
        this.dispatchStateChange();
      },
    });
    this.bpmSlider.element.classList.add("dm-bpm-slider");
    row.appendChild(this.bpmSlider.element);

    this.swingSlider = new ValueSlider({
      min: 0,
      max: 50,
      value: Math.round(this.swingAmount * 100),
      label: "Swing",
      format: (v) => `${v}%`,
      onChange: (v) => {
        this.swingAmount = v / 100;
        this.engine.updateState({ swingAmount: this.swingAmount });
        this.dispatchStateChange();
      },
    });
    this.swingSlider.element.classList.add("dm-swing-slider");
    row.appendChild(this.swingSlider.element);

    const barsLbl = document.createElement("span");
    barsLbl.classList.add("dm-label");
    barsLbl.textContent = "Bars:";
    row.appendChild(barsLbl);

    const toggle = document.createElement("div");
    toggle.classList.add("dm-bars-toggle");
    this.barsBtns.clear();
    for (const n of [4, 8, 12] as const) {
      const btn = document.createElement("button");
      btn.classList.add("dm-bars-btn");
      btn.textContent = String(n);
      if (n === this.numMeasures) btn.classList.add("is-active");
      btn.addEventListener("click", () => this.setNumMeasures(n));
      this.barsBtns.set(n, btn);
      toggle.appendChild(btn);
    }
    row.appendChild(toggle);

    return row;
  }

  // ─── Grid ────────────────────────────────────────────────────────────────────

  private rebuildGrid(): void {
    if (!this.gridEl) return;
    this.gridEl.innerHTML = "";
    this.cellEls = [];
    this.bassCellEls = [];
    this.stepNumEls = [];
    this.chordMeasureCellEls = [];
    this.trackDropdowns = [];

    if (this.activeLayout === "vertical") {
      this.rebuildGridVertical();
    } else {
      this.rebuildGridHorizontal();
    }
  }

  private rebuildGridHorizontal(): void {
    if (!this.gridEl) return;

    const headerRow = document.createElement("div");
    headerRow.classList.add("dm-row", "dm-header-row");
    headerRow.appendChild(this.makeTrackLabel(""));
    for (let s = 0; s < this.steps; s++) {
      const el = document.createElement("div");
      el.classList.add("dm-step-num");
      if (s % 4 === 0) el.textContent = String(s / 4 + 1);
      if (s > 0 && s % 4 === 0) el.classList.add("dm-beat-start");
      this.stepNumEls.push(el);
      headerRow.appendChild(el);
    }
    this.gridEl.appendChild(headerRow);

    for (let t = 0; t < NUM_TRACKS; t++) {
      const row = document.createElement("div");
      row.classList.add("dm-row");
      row.appendChild(this.makeTrackHeader(t));
      const rowCells: HTMLElement[] = [];
      for (let s = 0; s < this.steps; s++) {
        const cell = document.createElement("div");
        cell.classList.add("dm-cell");
        if (s > 0 && s % 4 === 0) cell.classList.add("dm-beat-start");
        this.updateCellAppearance(cell, this.tracks[t][s]);
        cell.addEventListener("click", () => this.handleCellClick(t, s));
        rowCells.push(cell);
        row.appendChild(cell);
      }
      this.cellEls.push(rowCells);
      this.gridEl.appendChild(row);
    }

    this.buildBassRow();
    this.buildProgRow();
  }

  private rebuildGridVertical(): void {
    if (!this.gridEl) return;
    const spm = this.steps / this.numMeasures;

    const drumCols = Array(NUM_TRACKS).fill("28px").join(" ");
    this.gridEl.style.display = "grid";
    this.gridEl.style.gridTemplateColumns = `48px 20px ${drumCols} 28px`;
    this.gridEl.style.gap = "2px";
    this.gridEl.style.alignItems = "stretch";

    this.gridEl.appendChild(this.makeVHeaderCell("Chord"));
    this.gridEl.appendChild(this.makeVHeaderCell(""));
    for (let t = 0; t < NUM_TRACKS; t++) {
      const cell = this.makeVHeaderCell(
        DRUM_SOUND_LABELS[this.trackSounds[t]].slice(0, 1).toUpperCase(),
      );
      cell.title = DRUM_SOUND_LABELS[this.trackSounds[t]];
      this.gridEl.appendChild(cell);
    }
    this.gridEl.appendChild(this.makeVBassHeader());

    for (let m = 0; m < this.numMeasures; m++) {
      const cell = document.createElement("div");
      cell.classList.add("dm-v-measure-cell");
      cell.style.gridRow = `${2 + m * spm} / span ${spm}`;
      cell.style.gridColumn = "1";
      this.updateMeasureCellAppearance(cell, this.measureChords[m]);
      cell.addEventListener("click", () => this.handleMeasureCellClick(m));
      this.chordMeasureCellEls.push(cell);
      this.gridEl.appendChild(cell);
    }

    for (let t = 0; t < NUM_TRACKS; t++) this.cellEls.push([]);

    for (let s = 0; s < this.steps; s++) {
      const gridRow = s + 2;
      const isMeasureStart = s > 0 && s % spm === 0;

      const beatNum = document.createElement("div");
      beatNum.classList.add("dm-v-beat-num");
      beatNum.textContent = String((s % spm) + 1);
      beatNum.style.gridRow = String(gridRow);
      beatNum.style.gridColumn = "2";
      if (isMeasureStart) beatNum.classList.add("dm-v-measure-start");
      this.stepNumEls.push(beatNum);
      this.gridEl.appendChild(beatNum);

      for (let t = 0; t < NUM_TRACKS; t++) {
        const cell = document.createElement("div");
        cell.classList.add("dm-v-cell");
        cell.style.gridRow = String(gridRow);
        cell.style.gridColumn = String(t + 3);
        if (isMeasureStart) cell.classList.add("dm-v-measure-start");
        this.updateCellAppearance(cell, this.tracks[t][s]);
        cell.addEventListener("click", () => this.handleCellClick(t, s));
        this.cellEls[t].push(cell);
        this.gridEl.appendChild(cell);
      }

      const bassCell = document.createElement("div");
      bassCell.classList.add("dm-v-cell", "dm-v-bass-cell");
      bassCell.style.gridRow = String(gridRow);
      bassCell.style.gridColumn = String(NUM_TRACKS + 3);
      if (isMeasureStart) bassCell.classList.add("dm-v-measure-start");
      this.updateBassCellAppearance(bassCell, this.bassTrack[s]);
      bassCell.addEventListener("click", () => this.handleBassCellClick(s));
      this.bassCellEls.push(bassCell);
      this.gridEl.appendChild(bassCell);
    }
  }

  private makeVHeaderCell(text: string): HTMLElement {
    const el = document.createElement("div");
    el.classList.add("dm-v-hdr");
    el.textContent = text;
    return el;
  }

  private makeVBassHeader(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.classList.add("dm-v-hdr", "dm-v-bass-hdr");
    const sel = document.createElement("select");
    sel.classList.add("dm-v-bass-select");
    sel.title = "Bass degree to paint";
    sel.appendChild(new Option("B", ""));
    for (let d = 1; d <= 7; d++) {
      const opt = new Option(String(d), String(d));
      if (d === this.selectedBassDegree) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener("change", () => {
      const val = sel.value;
      this.selectedBassDegree = val ? parseInt(val, 10) : null;
    });
    wrap.appendChild(sel);
    return wrap;
  }

  private buildBassRow(): void {
    if (!this.gridEl) return;

    const sep = document.createElement("div");
    sep.classList.add("dm-prog-separator");
    this.gridEl.appendChild(sep);

    const row = document.createElement("div");
    row.classList.add("dm-row");
    row.appendChild(this.makeBassHeader());

    for (let s = 0; s < this.steps; s++) {
      const cell = document.createElement("div");
      cell.classList.add("dm-cell", "dm-bass-cell");
      if (s > 0 && s % 4 === 0) cell.classList.add("dm-beat-start");
      this.updateBassCellAppearance(cell, this.bassTrack[s]);
      cell.addEventListener("click", () => this.handleBassCellClick(s));
      this.bassCellEls.push(cell);
      row.appendChild(cell);
    }

    this.gridEl.appendChild(row);
  }

  /** Single row with numMeasures cells that align to the beat grid. */
  private buildProgRow(): void {
    if (!this.gridEl) return;
    this.chordMeasureCellEls = [];

    const sep = document.createElement("div");
    sep.classList.add("dm-prog-separator");
    this.gridEl.appendChild(sep);

    const row = document.createElement("div");
    row.classList.add("dm-row", "dm-prog-row");
    row.appendChild(this.makeChordHeader());

    const cellW = this.measureCellWidth();
    const fontSize =
      this.numMeasures <= 4
        ? "0.75rem"
        : this.numMeasures === 8
          ? "0.68rem"
          : "0.58rem";

    for (let m = 0; m < this.numMeasures; m++) {
      const cell = document.createElement("div");
      cell.classList.add("dm-measure-cell");
      cell.style.width = `${cellW}px`;
      cell.style.minWidth = `${cellW}px`;
      cell.style.fontSize = fontSize;
      if (this.measureBeatStart(m)) cell.classList.add("dm-beat-start");
      this.updateMeasureCellAppearance(cell, this.measureChords[m]);
      cell.addEventListener("click", () => this.handleMeasureCellClick(m));
      this.chordMeasureCellEls.push(cell);
      row.appendChild(cell);
    }

    this.gridEl.appendChild(row);
  }

  private makeTrackLabel(text: string): HTMLElement {
    const el = document.createElement("div");
    el.classList.add("dm-track-header");
    el.textContent = text;
    return el;
  }

  private makeTrackHeader(t: number): HTMLElement {
    const wrap = document.createElement("div");
    wrap.classList.add("select", "is-small", "dm-track-header-wrap");
    const sel = document.createElement("select");
    for (const id of ALL_DRUM_SOUND_IDS) {
      const opt = new Option(DRUM_SOUND_LABELS[id], id);
      if (id === this.trackSounds[t]) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener("change", () => {
      this.trackSounds[t] = sel.value as DrumSoundId;
    });
    this.trackDropdowns[t] = sel;
    wrap.appendChild(sel);
    return wrap;
  }

  private makeBassHeader(): HTMLElement {
    const BASS_LABELS: Record<number, string> = {
      1: "1 Root",
      2: "2",
      3: "3 Third",
      4: "4",
      5: "5 Fifth",
      6: "6",
      7: "7 Seventh",
    };
    const wrap = document.createElement("div");
    wrap.classList.add("select", "is-small", "dm-track-header-wrap");
    const sel = document.createElement("select");
    sel.appendChild(new Option("Bass", ""));
    for (let d = 1; d <= 7; d++) {
      const opt = new Option(BASS_LABELS[d] ?? String(d), String(d));
      if (d === this.selectedBassDegree) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener("change", () => {
      const val = sel.value;
      this.selectedBassDegree = val ? parseInt(val, 10) : null;
    });
    wrap.appendChild(sel);
    return wrap;
  }

  /** Chord row header: dropdown listing the 7 diatonic triads for the current mode. */
  private makeChordHeader(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.classList.add("select", "is-small", "dm-track-header-wrap");
    const sel = document.createElement("select");
    this.chordToolSelectEl = sel;
    this.rebuildChordToolOptions();
    sel.addEventListener("change", () => {
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
      cell.textContent = DRUM_SOUND_LABELS[sound].slice(0, 1);
      cell.classList.add("dm-cell-filled");
      cell.title = DRUM_SOUND_LABELS[sound];
    } else {
      cell.style.background = "";
      cell.textContent = "";
      cell.classList.remove("dm-cell-filled");
      cell.title = "";
    }
  }

  private updateBassCellAppearance(cell: HTMLElement, degree: BassStep): void {
    if (degree !== null) {
      cell.style.background = BASS_DEGREE_COLORS[degree] ?? "var(--dm-palette-1)";
      cell.textContent = String(degree);
      cell.classList.add("dm-cell-filled");
      cell.title = `Scale degree ${degree}`;
    } else {
      cell.style.background = "";
      cell.textContent = "";
      cell.classList.remove("dm-cell-filled");
      cell.title = "";
    }
  }

  private updateMeasureCellAppearance(cell: HTMLElement, chordDeg: number | null): void {
    if (chordDeg !== null && chordDeg >= 1 && chordDeg <= 7) {
      const entries = getRomansForMode(this.progMode);
      const entry = entries[chordDeg - 1];
      const roman = entry?.roman ?? String(chordDeg);
      const chordKey = entry
        ? resolveAbsoluteChordKey(entry.roman, this.progRootNote, this.progMode)
        : null;
      const chordName = chordKey
        ? (chord_tones_library[chordKey]?.name ?? roman)
        : roman;

      cell.textContent = roman;
      cell.title = chordName;
      cell.style.setProperty("--dm-measure-color", "var(--accent-dim)");
      cell.classList.add("dm-measure-filled");
    } else {
      cell.textContent = "";
      cell.title = "";
      cell.style.removeProperty("--dm-measure-color");
      cell.classList.remove("dm-measure-filled");
    }
  }

  private refreshAllMeasureCells(): void {
    const currentMeasure = this.engine.getCurrentMeasure();
    this.chordMeasureCellEls.forEach((cell, m) => {
      this.updateMeasureCellAppearance(cell, this.measureChords[m]);
      if (currentMeasure === m) cell.classList.add("dm-measure-current");
    });
  }

  // ─── Click handlers ───────────────────────────────────────────────────────────

  private handleCellClick(track: number, step: number): void {
    const selectedSound = this.trackSounds[track];
    const current = this.tracks[track][step];
    this.tracks[track][step] = current === selectedSound ? null : selectedSound;
    if (this.tracks[track][step]) playDrumSound(selectedSound);
    const cell = this.cellEls[track]?.[step];
    if (cell) {
      const isCurrent = this.engine.getCurrentStep() === step;
      this.updateCellAppearance(cell, this.tracks[track][step]);
      if (isCurrent) cell.classList.add("dm-cell-current");
    }
    this.engine.updateState({ tracks: this.tracks });
    this.dispatchStateChange();
  }

  private handleBassCellClick(step: number): void {
    const current = this.bassTrack[step];
    if (this.selectedBassDegree !== null) {
      this.bassTrack[step] =
        current === this.selectedBassDegree ? null : this.selectedBassDegree;
    } else {
      this.bassTrack[step] = null;
    }
    const cell = this.bassCellEls[step];
    if (cell) {
      const isCurrent = this.engine.getCurrentStep() === step;
      this.updateBassCellAppearance(cell, this.bassTrack[step]);
      if (isCurrent) cell.classList.add("dm-cell-current");
    }
    this.engine.updateState({ bassTrack: this.bassTrack });
    this.dispatchStateChange();
  }

  private handleMeasureCellClick(measureIndex: number): void {
    const current = this.measureChords[measureIndex];
    if (this.selectedChordDeg !== null) {
      this.measureChords[measureIndex] =
        current === this.selectedChordDeg ? null : this.selectedChordDeg;
    } else {
      this.measureChords[measureIndex] = null;
    }
    const cell = this.chordMeasureCellEls[measureIndex];
    if (cell) {
      const isCurrent = this.engine.getCurrentMeasure() === measureIndex;
      this.updateMeasureCellAppearance(cell, this.measureChords[measureIndex]);
      if (isCurrent) cell.classList.add("dm-measure-current");
    }
    this.engine.updateState({ measureChords: this.measureChords });
    this.dispatchStateChange();
  }

  // ─── Chord tool options ───────────────────────────────────────────────────────

  private rebuildChordToolOptions(): void {
    if (!this.chordToolSelectEl) return;
    this.chordToolSelectEl.innerHTML = "";
    this.chordToolSelectEl.appendChild(new Option("Chord", ""));

    const entries = getRomansForMode(this.progMode);
    const triads = entries.slice(0, 7);
    for (const entry of triads) {
      const chordKey = resolveAbsoluteChordKey(
        entry.roman,
        this.progRootNote,
        this.progMode,
      );
      const chordName = chordKey
        ? (chord_tones_library[chordKey]?.name ?? entry.roman)
        : entry.roman;
      const degNum = entry.degreeIndex + 1;
      const opt = new Option(`${entry.roman} – ${chordName}`, String(degNum));
      if (degNum === this.selectedChordDeg) opt.selected = true;
      this.chordToolSelectEl.appendChild(opt);
    }
    this.refreshAllMeasureCells();
  }

  // ─── Bars count ───────────────────────────────────────────────────────────────

  private setNumMeasures(n: 4 | 8 | 12): void {
    if (this.numMeasures === n) return;
    const old = this.measureChords.slice();
    const oldLen = old.length;

    // All valid counts (4, 8, 12) divide evenly into 4 beat-groups.
    // Remap group-by-group: if a group is internally uniform, broadcast its value
    // to the new group size. This makes transitions reversible (4↔8↔12).
    const oldGroupSize = oldLen / 4;
    const newGroupSize = n / 4;
    const newChords: (number | null)[] = new Array(n).fill(null);
    for (let g = 0; g < 4; g++) {
      const oldStart = g * oldGroupSize;
      const newStart = g * newGroupSize;
      const groupVal = old[oldStart];
      const uniform = old
        .slice(oldStart, oldStart + oldGroupSize)
        .every((v) => v === groupVal);
      if (uniform) {
        for (let i = 0; i < newGroupSize; i++)
          newChords[newStart + i] = groupVal;
      } else {
        for (let i = 0; i < Math.min(oldGroupSize, newGroupSize); i++)
          newChords[newStart + i] = old[oldStart + i];
      }
    }

    this.numMeasures = n;
    this.measureChords = newChords;
    this.barsBtns.forEach((btn, bars) =>
      btn.classList.toggle("is-active", bars === n),
    );
    this.engine.updateState({ numMeasures: n, measureChords: newChords });
    this.rebuildGrid();
    this.dispatchStateChange();
  }

  // ─── Steps / preset / state changes ──────────────────────────────────────────

  private applyPreset(preset: DrumPreset): void {
    this.activePresetIndex = PRESETS.indexOf(preset);
    const wasPlaying = this.engine.isRunning();
    if (wasPlaying) this.stopPlayback();
    this.bpm = preset.bpm;
    this.steps = preset.steps;
    if (preset.numMeasures) {
      this.numMeasures = preset.numMeasures;
      this.barsBtns.forEach((btn, bars) =>
        btn.classList.toggle("is-active", bars === this.numMeasures),
      );
    }
    if (preset.progMode) {
      this.progMode = preset.progMode;
      if (this.progModeSelectEl) this.progModeSelectEl.value = this.progMode;
    }
    if (typeof preset.swingAmount === "number") {
      this.swingAmount = Math.min(0.5, Math.max(0, preset.swingAmount));
      this.swingSlider?.setValue(Math.round(this.swingAmount * 100));
    }
    if (preset.toneVoice) {
      this.toneVoice = preset.toneVoice;
      if (this.toneVoiceSelectEl) this.toneVoiceSelectEl.value = this.toneVoice;
    }
    if (Array.isArray(preset.measureChords)) {
      this.measureChords = preset.measureChords.slice(0, this.numMeasures);
      while (this.measureChords.length < this.numMeasures)
        this.measureChords.push(null);
    } else {
      this.measureChords = new Array(this.numMeasures).fill(null);
    }
    this.initTracks(preset.tracks);
    this.initBassTrack(preset.bassTrack);
    this.trackSounds = this.resolveTrackSounds(undefined, preset.tracks);
    this.bpmSlider?.setValue(this.bpm);
    this.engine.updateState(this.buildEngineState());
    this.rebuildGrid();
    if (this.presetSelectEl && this.activePresetIndex !== null) {
      this.presetSelectEl.value = String(this.activePresetIndex);
    }
    this.rebuildChordToolOptions();
    if (wasPlaying) this.startPlayback();
    this.dispatchStateChange();
  }

  private applyState(state: any): void {
    const wasPlaying = this.engine.isRunning();
    if (wasPlaying) this.stopPlayback();

    this.bpm = state.bpm ?? this.bpm;
    this.steps = state.steps ?? this.steps;
    if (typeof state.swingAmount === "number") {
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
      this.measureChords = this.parseMeasureChords(
        state.measureChords,
        this.numMeasures,
      );
    }
    this.trackSounds = this.resolveTrackSounds(state.trackSounds, state.tracks);
    this.initTracks(state.tracks);
    this.initBassTrack(state.bassTrack);
    this.activePresetIndex = this.findMatchingPresetIndex();

    this.bpmSlider?.setValue(this.bpm);
    this.swingSlider?.setValue(Math.round(this.swingAmount * 100));
    const voiceRaw = state.toneVoice;
    if (voiceRaw && (ALL_TONE_VOICES as string[]).includes(voiceRaw)) {
      this.toneVoice = voiceRaw as ToneVoice;
    }

    if (this.progRootSelectEl) this.progRootSelectEl.value = this.progRootNote;
    if (this.progModeSelectEl) this.progModeSelectEl.value = this.progMode;
    if (this.toneVoiceSelectEl) this.toneVoiceSelectEl.value = this.toneVoice;
    this.barsBtns.forEach((btn, bars) =>
      btn.classList.toggle("is-active", bars === this.numMeasures),
    );

    this.engine.updateState(this.buildEngineState());
    this.rebuildGrid();
    if (this.presetSelectEl && this.activePresetIndex !== null) {
      this.presetSelectEl.value = String(this.activePresetIndex);
    }
    this.rebuildChordToolOptions();

    if (wasPlaying) this.startPlayback();
    this.dispatchStateChange();
  }

  private resolveTrackSounds(
    savedSounds?: DrumSoundId[],
    tracks?: TrackData[],
  ): DrumSoundId[] {
    return DEFAULT_TRACK_SOUNDS.map((def, t) => {
      if (savedSounds?.[t] && ALL_DRUM_SOUND_IDS.includes(savedSounds[t]))
        return savedSounds[t];
      if (tracks?.[t]) {
        const first = (tracks[t] as (DrumSoundId | null)[]).find(
          (s) => s !== null,
        );
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
        for (let s = 0; s < Math.min(saved[t].length, this.steps); s++)
          track[s] = saved[t][s];
      }
      this.tracks.push(track);
    }
  }

  private initBassTrack(saved?: BassStep[]): void {
    this.bassTrack = new Array(this.steps).fill(null);
    if (saved) {
      for (let s = 0; s < Math.min(saved.length, this.steps); s++)
        this.bassTrack[s] = saved[s];
    }
  }

  // ─── Preset matching ─────────────────────────────────────────────────────────

  private parseMeasureChords(raw: any[], size: number): (number | null)[] {
    const parsed = raw.slice(0, size).map((c: any): number | null => {
      if (c === null || c === undefined) return null;
      if (typeof c === "number" && c >= 1 && c <= 7) return c;
      if (typeof c === "string") {
        const entry = getRomansForMode(this.progMode).find(
          (r) => r.roman === c,
        );
        return entry ? entry.degreeIndex + 1 : null;
      }
      return null;
    });
    while (parsed.length < size) parsed.push(null);
    return parsed;
  }

  private findMatchingPresetIndex(): number | null {
    const tracksJson = JSON.stringify(this.tracks);
    const bassJson = JSON.stringify(this.bassTrack);
    const chordsJson = JSON.stringify(this.measureChords);
    for (let i = 0; i < PRESETS.length; i++) {
      const p = PRESETS[i];
      if (
        (p.steps ?? 16) !== this.steps ||
        (p.numMeasures ?? 4) !== this.numMeasures
      )
        continue;
      const pt: TrackData[] = [];
      for (let t = 0; t < NUM_TRACKS; t++) {
        const row: TrackData = new Array(this.steps).fill(null);
        if (p.tracks?.[t]) {
          for (let s = 0; s < Math.min(p.tracks[t].length, this.steps); s++)
            row[s] = p.tracks[t][s];
        }
        pt.push(row);
      }
      const pb: BassStep[] = new Array(this.steps).fill(null);
      if (p.bassTrack) {
        for (let s = 0; s < Math.min(p.bassTrack.length, this.steps); s++)
          pb[s] = p.bassTrack[s];
      }
      const nm = p.numMeasures ?? 4;
      const pc: (number | null)[] = (p.measureChords ?? []).slice(0, nm);
      while (pc.length < nm) pc.push(null);
      if (
        JSON.stringify(pt) === tracksJson &&
        JSON.stringify(pb) === bassJson &&
        JSON.stringify(pc) === chordsJson
      ) {
        return i;
      }
    }
    return null;
  }

  // ─── Engine state helper ─────────────────────────────────────────────────────

  private buildEngineState(): EngineState {
    return {
      bpm: this.bpm,
      steps: this.steps,
      swingAmount: this.swingAmount,
      tracks: this.tracks,
      bassTrack: this.bassTrack,
      measureChords: this.measureChords,
      numMeasures: this.numMeasures,
      progMode: this.progMode,
      progRootNote: this.progRootNote,
      isStrumLinked: this.isStrumLinked,
      toneVoice: this.toneVoice,
    };
  }

  // ─── Export / Import ──────────────────────────────────────────────────────────

  private getState(): object {
    return {
      bpm: this.bpm,
      steps: this.steps,
      swingAmount: this.swingAmount,
      tracks: this.tracks,
      bassTrack: this.bassTrack,
      trackSounds: this.trackSounds,
      progRootNote: this.progRootNote,
      progMode: this.progMode,
      numMeasures: this.numMeasures,
      measureChords: this.measureChords,
      toneVoice: this.toneVoice,
    };
  }

  private exportToJSON(): void {
    const json = JSON.stringify(this.getState(), null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "drum-machine.json";
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
        console.error("BackingTrackView: invalid JSON file");
      }
    };
    reader.readAsText(file);
  }

  private dispatchStateChange(): void {
    if (!this.container) return;
    emitEvent(this.container, 'feature-state-changed', this.getState() as FeatureStateChangedDetail);
  }
}
