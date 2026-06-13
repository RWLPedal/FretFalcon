import { emitEvent } from '../../core/events';
import { StrumSignal } from '../../panels/link_types';
import { playDrumSound } from '../../sounds/drum_sounds';
import { volumeManager } from '../../sounds/volume_manager';
import { buildVoiceChain } from '../../sounds/tone_voices';
import { ToneVoice } from '../../sounds/tone_voices';
import { getGuitarWave } from '../../sounds/note_sounds';
import {
  MAJOR_SCALE_SEMITONES,
  MINOR_SCALE_SEMITONES,
  chordToneFreq,
  playBassTone,
} from '../../sounds/bass_synth';
import {
  CHORD_ROOTS,
  getRomansForMode,
  resolveAbsoluteChordKey,
  isMajorChordQuality,
} from '../../music/chord_key_resolver';
import { chord_tones_library } from '../../music/chords';
import { DiatonicMode } from '../../music/music_types';
import { TrackData, BassStep, NUM_TRACKS } from './presets';

export interface EngineState {
  bpm: number;
  steps: number;
  swingAmount: number;
  tracks: TrackData[];
  bassTrack: BassStep[];
  measureChords: (number | null)[];
  numMeasures: 4 | 8 | 12;
  progMode: DiatonicMode;
  progRootNote: string;
  isStrumLinked: boolean;
  toneVoice: ToneVoice;
}

export interface EngineCallbacks {
  onStepChange(prevStep: number, step: number): void;
  onMeasureChange(prevMeasure: number, measure: number): void;
  onPlayStateChange(playing: boolean): void;
}

export class BackingTrackEngine {
  private container: HTMLElement | null = null;
  private callbacks: EngineCallbacks;
  private state: EngineState;

  private playing: boolean = false;
  private currentStep: number = -1;
  private currentMeasure: number = -1;
  private intervalId: number | null = null;
  private stepMs: number = 0;

  constructor(initialState: EngineState, callbacks: EngineCallbacks) {
    this.state = { ...initialState };
    this.callbacks = callbacks;
  }

  setContainer(container: HTMLElement | null): void {
    this.container = container;
  }

  updateState(partial: Partial<EngineState>): void {
    this.state = { ...this.state, ...partial };
  }

  isRunning(): boolean {
    return this.playing;
  }

  getCurrentStep(): number {
    return this.currentStep;
  }

  getCurrentMeasure(): number {
    return this.currentMeasure;
  }

  start(): void {
    if (this.playing) return;
    this.playing = true;
    this.callbacks.onPlayStateChange(true);
    this.startInterval();
    this.dispatchTransportChanged(true);
  }

  stop(): void {
    this.stopInterval();
    const prevStep = this.currentStep;
    const prevMeasure = this.currentMeasure;
    this.currentStep = -1;
    this.currentMeasure = -1;
    this.playing = false;
    this.callbacks.onPlayStateChange(false);
    if (prevStep >= 0) this.callbacks.onStepChange(prevStep, -1);
    if (prevMeasure >= 0) this.callbacks.onMeasureChange(prevMeasure, -1);
    this.dispatchTransportChanged(false);
  }

  handleStrumSignal(signal: StrumSignal): void {
    this.playStrumChord(signal);
  }

  destroy(): void {
    this.stop();
    this.container = null;
  }

  private startInterval(): void {
    if (this.intervalId !== null) return;
    this.stepMs = (60000 * 4) / this.state.bpm / this.state.steps;
    this.intervalId = window.setInterval(() => this.tick(), this.stepMs);
  }

  private stopInterval(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private tick(): void {
    const prevStep = this.currentStep;
    this.currentStep = (this.currentStep + 1) % this.state.steps;
    this.callbacks.onStepChange(prevStep, this.currentStep);

    const { swingAmount, steps, tracks, bassTrack } = this.state;
    const swingDelay =
      this.currentStep % 4 === 2 && swingAmount > 0
        ? this.stepMs * swingAmount
        : 0;

    const step = this.currentStep;
    const playHits = () => {
      for (let t = 0; t < NUM_TRACKS; t++) {
        const sound = tracks[t][step];
        if (sound) playDrumSound(sound);
      }
      const bassDegree = bassTrack[step];
      if (bassDegree !== null) this.playBassNote(bassDegree);
    };

    if (swingDelay > 0) {
      setTimeout(playHits, swingDelay);
    } else {
      playHits();
    }

    // Emit groove-tick on every beat boundary for linked driven views.
    const stepsPerBeat = Math.max(1, Math.floor(steps / 4));
    if (this.currentStep % stepsPerBeat === 0) {
      const beat = Math.floor(this.currentStep / stepsPerBeat);
      this.dispatchGrooveTick(beat);
    }

    if (this.currentStep === 0) {
      const prevMeasure = this.currentMeasure;
      this.currentMeasure = (this.currentMeasure + 1) % this.state.numMeasures;
      this.callbacks.onMeasureChange(prevMeasure, this.currentMeasure);
      const chordDeg = this.state.measureChords[this.currentMeasure];
      if (chordDeg !== null && !this.state.isStrumLinked)
        this.playChordDrone(chordDeg);
      this.dispatchTickEvent(chordDeg ?? null);
    }
  }

  private dispatchTransportChanged(playing: boolean): void {
    if (!this.container) return;
    emitEvent(this.container, 'transport-changed', { playing });
  }

  private dispatchGrooveTick(beat: number): void {
    if (!this.container) return;
    emitEvent(this.container, 'groove-tick', {
      bpm: this.state.bpm,
      timeSig: { beats: 4, division: 4 },
      swing: this.state.swingAmount,
      beat,
    });
  }

  private dispatchTickEvent(chordDeg: number | null): void {
    if (!this.container) return;
    const { progMode, progRootNote, bpm, swingAmount, measureChords, numMeasures } = this.state;

    let currentRoman: string | null = null;
    let chordKey: string | null = null;
    if (chordDeg !== null) {
      const entry = getRomansForMode(progMode)[chordDeg - 1];
      if (entry) {
        currentRoman = entry.roman;
        chordKey = resolveAbsoluteChordKey(entry.roman, progRootNote, progMode);
      }
    }

    const nextMeasureIndex = (this.currentMeasure + 1) % numMeasures;
    const nextChordDeg = measureChords[nextMeasureIndex] ?? null;
    let nextRoman: string | null = null;
    let nextChordKey: string | null = null;
    let nextRootNote: string | null = null;
    if (nextChordDeg !== null) {
      const nextEntry = getRomansForMode(progMode)[nextChordDeg - 1];
      if (nextEntry) {
        nextRoman = nextEntry.roman;
        nextChordKey = resolveAbsoluteChordKey(nextEntry.roman, progRootNote, progMode);
        nextRootNote = nextChordKey
          ? (nextChordKey.split("_")[0] ?? progRootNote)
          : progRootNote;
      }
    }

    emitEvent(this.container, 'backing-track-tick', {
      currentMeasure: this.currentMeasure,
      currentChordDeg: chordDeg,
      currentRoman,
      chordKey,
      progRootNote,
      progMode,
      bpm,
      timeSig: { beats: 4, division: 4 },
      swing: swingAmount,
      beat: 0,
      nextChordKey,
      nextRootNote,
      nextRoman,
    });
  }

  private playBassNote(bassDeg: number): void {
    const { progMode, progRootNote, measureChords, bpm, steps, toneVoice } = this.state;
    let rootName = progRootNote;
    let isMajorChord = true;

    const chordDeg = measureChords[Math.max(0, this.currentMeasure)];
    if (chordDeg !== null) {
      const entry = getRomansForMode(progMode)[chordDeg - 1];
      if (entry) {
        const rootIdx = CHORD_ROOTS.indexOf(progRootNote);
        rootName = CHORD_ROOTS[(rootIdx + entry.degree) % 12];
        isMajorChord = isMajorChordQuality(entry.quality);
      }
    }

    const intervals = isMajorChord ? MAJOR_SCALE_SEMITONES : MINOR_SCALE_SEMITONES;
    const semitones = intervals[(bassDeg - 1) % 7];
    const rootIdx = CHORD_ROOTS.indexOf(rootName);
    if (rootIdx === -1) return;
    const noteIdx = (rootIdx + semitones) % 12;
    const freq = chordToneFreq(CHORD_ROOTS[noteIdx], 2);
    if (!freq) return;

    playBassTone(freq, bpm, steps, toneVoice);
  }

  private playChordDrone(chordDeg: number): void {
    const { progMode, progRootNote, bpm, steps, toneVoice } = this.state;
    const entry = getRomansForMode(progMode)[chordDeg - 1];
    if (!entry) return;
    const chordKey = resolveAbsoluteChordKey(entry.roman, progRootNote, progMode);
    if (!chordKey) return;
    const chordEntry = chord_tones_library[chordKey];
    if (!chordEntry) return;

    const stepMs = (60000 * 4) / bpm / steps;
    const measureSec = (stepMs * steps) / 1000;

    try {
      const ctx = volumeManager.getAudioContext();
      const masterVol = volumeManager.getVolume();
      const peak = 0.225 * masterVol;
      const now = ctx.currentTime;

      chordEntry.tones.forEach((toneName, i) => {
        const octave = i === 0 ? 2 : 3;
        const freq = chordToneFreq(toneName, octave);
        if (!freq) return;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        // Pass dest only on the root tone so the pluck fires once per chord change
        const voiceOut = buildVoiceChain(
          ctx,
          osc,
          toneVoice,
          i === 0 ? { dest: ctx.destination, vol: masterVol } : undefined,
        );
        osc.frequency.value = freq;
        voiceOut.connect(gain);
        gain.connect(ctx.destination);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(peak, now + 0.008);
        gain.gain.setTargetAtTime(0, now + 0.008, measureSec * 0.6);

        osc.start(now);
        osc.stop(now + measureSec);
      });
    } catch (e) {
      console.warn("BackingTrackEngine: chord drone error", e);
    }
  }

  private playStrumChord(signal: StrumSignal): void {
    if (signal.action === "rest" || signal.action === "air") return;
    const { progMode, progRootNote, measureChords } = this.state;
    const chordDeg = measureChords[Math.max(0, this.currentMeasure)];
    if (chordDeg === null) return;

    const entry = getRomansForMode(progMode)[chordDeg - 1];
    if (!entry) return;
    const chordKey = resolveAbsoluteChordKey(entry.roman, progRootNote, progMode);
    if (!chordKey) return;
    const chordEntry = chord_tones_library[chordKey];
    if (!chordEntry) return;

    try {
      const ctx = volumeManager.getAudioContext();
      const masterVol = volumeManager.getVolume();
      const now = ctx.currentTime;

      if (signal.action === "chuck") {
        const rootTone = chordEntry.tones[0];
        if (!rootTone) return;
        const rootFreq = chordToneFreq(rootTone, 2);
        if (!rootFreq) return;
        const bufLen = Math.ceil(ctx.sampleRate * 0.06);
        const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = Math.min(rootFreq * 2, 1800);
        filter.Q.value = 1.5;
        const chuckGain = ctx.createGain();
        const peak = 0.35 * masterVol;
        chuckGain.gain.setValueAtTime(peak, now);
        chuckGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        src.connect(filter);
        filter.connect(chuckGain);
        chuckGain.connect(ctx.destination);
        src.start(now);
        src.stop(now + 0.06);
        return;
      }

      const isDown = signal.direction === "down";
      const isAccent = signal.action === "accent";
      const duration = isDown
        ? isAccent ? 0.45 : 0.35
        : isAccent ? 0.3 : 0.22;
      const peakVol = isDown ? (isAccent ? 0.55 : 0.4) : isAccent ? 0.45 : 0.3;
      const filterFreq = isDown ? 800 : 2200;
      const filterType: BiquadFilterType = isDown ? "lowpass" : "bandpass";

      chordEntry.tones.forEach((toneName, i) => {
        const octave = i === 0 ? 2 : 3;
        const freq = chordToneFreq(toneName, octave);
        if (!freq) return;

        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        osc.setPeriodicWave(getGuitarWave(ctx));
        osc.frequency.value = freq;
        filter.type = filterType;
        filter.frequency.value = filterFreq;
        filter.Q.value = isDown ? 0.7 : 1.2;

        const peak = peakVol * masterVol;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(peak, now + 0.006);
        gain.gain.setTargetAtTime(0, now + 0.006, duration * 0.5);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + duration);
      });
    } catch (e) {
      console.warn("BackingTrackEngine: strum chord error", e);
    }
  }
}
