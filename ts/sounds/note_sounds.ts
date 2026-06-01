// ts/sounds/note_sounds.ts
// Library for dynamically playing musical notes as pure tones via Web Audio API.

import { volumeManager } from './volume_manager';
import { NoteName, NOTE_NAMES } from '../fretboard/music_types';

export { NoteName, NOTE_NAMES } from '../fretboard/music_types';

export type WaveType = 'sine' | 'square' | 'sawtooth' | 'triangle' | 'guitar';

// Cache PeriodicWave per AudioContext so we only build it once.
const _guitarWaveCache = new WeakMap<AudioContext, PeriodicWave>();

/**
 * Returns a PeriodicWave approximating a plucked steel-string guitar:
 * strong fundamental with harmonics falling off naturally.
 */
export function getGuitarWave(ctx: AudioContext): PeriodicWave {
  const cached = _guitarWaveCache.get(ctx);
  if (cached) return cached;
  const real = new Float32Array([0, 1, 0.5, 0.25, 0.14, 0.08, 0.05, 0.03, 0.02]);
  const imag = new Float32Array(9).fill(0);
  const wave = ctx.createPeriodicWave(real, imag);
  _guitarWaveCache.set(ctx, wave);
  return wave;
}

export interface PlayNoteOptions {
  /** Duration in seconds (default: 0.5) */
  duration?: number;
  /** Volume 0–1 (default: 0.5) */
  volume?: number;
  /** Oscillator waveform (default: 'sine') */
  wave?: WaveType;
  /** Attack ramp in seconds (default: 0.01) */
  attack?: number;
  /** Release ramp in seconds (default: 0.1) */
  release?: number;
}

const NOTE_SEMITONES: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1,
  D: 2, 'D#': 3, Eb: 3,
  E: 4,
  F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8,
  A: 9, 'A#': 10, Bb: 10,
  B: 11,
};

/**
 * Convert a note name + octave to its frequency in Hz.
 * Uses equal temperament with A4 = 440 Hz.
 *
 * @example noteToFrequency('A', 4) // 440
 * @example noteToFrequency('C', 4) // ~261.63
 */
export function noteToFrequency(note: NoteName, octave: number = 4): number {
  const semitone = NOTE_SEMITONES[note];
  if (semitone === undefined) throw new Error(`Unknown note: ${note}`);
  // MIDI note number (C4 = 60, A4 = 69)
  const midi = (octave + 1) * 12 + semitone;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Find the nearest note name and octave for a given frequency.
 * Returns the note name, octave, and how many cents sharp (+) or flat (–) the
 * frequency is from equal temperament.
 */
export function frequencyToNote(freq: number): { note: NoteName; octave: number; cents: number } {
  const midi = 69 + 12 * Math.log2(freq / 440);
  const rounded = Math.round(midi);
  const cents = Math.round((midi - rounded) * 100);
  const octave = Math.floor(rounded / 12) - 1;
  const semitone = ((rounded % 12) + 12) % 12;
  return { note: NOTE_NAMES[semitone], octave, cents };
}

// Shared AudioContext — reused across calls to avoid repeated warm-up latency.
let _ctx: AudioContext | null = null;

function getContext(): AudioContext {
  if (!_ctx || _ctx.state === 'closed') {
    _ctx = new AudioContext();
  }
  if (_ctx.state === 'suspended') {
    _ctx.resume().catch(() => {});
  }
  return _ctx;
}

/**
 * Play a pure tone at the given frequency.
 *
 * @param frequency - Frequency in Hz
 * @param options   - Playback options (duration, volume, waveform, attack, release)
 */
export function playFrequency(frequency: number, options: PlayNoteOptions = {}): void {
  const {
    duration = 0.5,
    volume = 0.5,
    wave = 'sine',
    attack = 0.01,
    release = 0.1,
  } = options;
  const scaledVolume = volume * volumeManager.getVolume();

  try {
    const ctx = getContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (wave === 'guitar') {
      osc.setPeriodicWave(getGuitarWave(ctx));
    } else {
      osc.type = wave;
    }
    osc.frequency.value = frequency;
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(scaledVolume, now + attack);
    // Hold, then release
    const releaseStart = Math.max(now + attack, now + duration - release);
    gain.gain.setValueAtTime(scaledVolume, releaseStart);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.start(now);
    osc.stop(now + duration);
  } catch (e) {
    console.warn('note_sounds: could not play frequency', frequency, e);
  }
}

/**
 * Play a note by name and octave.
 *
 * @param note    - Note name, e.g. 'C', 'F#', 'Bb'
 * @param octave  - Octave number (default 4 — middle octave, A4 = 440 Hz)
 * @param options - Playback options
 *
 * @example playNote('A', 4)              // 440 Hz sine, 0.5 s
 * @example playNote('C', 5, { wave: 'triangle', duration: 1 })
 */
export function playNote(note: NoteName, octave: number = 4, options: PlayNoteOptions = {}): void {
  playFrequency(noteToFrequency(note, octave), options);
}

export interface SustainedNoteOptions {
  wave?: WaveType;
  volume?: number;
  tremolo?: { rate: number; depth: number };
}

/** A continuously-playing note that can be started, retargeted, and stopped with a fade. */
export class SustainedNote {
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private lfo: OscillatorNode | null = null;
  private lfoGain: GainNode | null = null;
  private unsubscribeVolume: (() => void) | null = null;
  private baseVolume = 0.5;
  private tremoloOpts: { rate: number; depth: number } | undefined;

  start(note: NoteName, octave = 4, options: SustainedNoteOptions = {}): void {
    this.destroy();
    const { wave = 'guitar', volume = 0.625, tremolo } = options;
    this.baseVolume = volume;
    this.tremoloOpts = tremolo;
    try {
      const ctx = getContext();
      const masterVol = volumeManager.getVolume();
      const gain = ctx.createGain();
      const dc = tremolo ? volume * (1 - tremolo.depth) * masterVol : volume * masterVol;
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(dc, ctx.currentTime + 0.05);
      gain.connect(ctx.destination);

      const osc = ctx.createOscillator();
      if (wave === 'guitar') {
        osc.setPeriodicWave(getGuitarWave(ctx));
      } else {
        osc.type = wave;
      }
      osc.frequency.value = noteToFrequency(note, octave);
      osc.connect(gain);
      osc.start();

      this.oscillator = osc;
      this.gainNode = gain;

      if (tremolo) {
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.type = 'sine';
        lfo.frequency.value = tremolo.rate;
        lfoGain.gain.value = volume * tremolo.depth * masterVol;
        lfo.connect(lfoGain);
        lfoGain.connect(gain.gain);
        lfo.start();
        this.lfo = lfo;
        this.lfoGain = lfoGain;
      }

      this.unsubscribeVolume = volumeManager.onChange((v) => {
        if (!this.gainNode) return;
        const t = this.tremoloOpts;
        const newDc = t ? this.baseVolume * (1 - t.depth) * v : this.baseVolume * v;
        this.gainNode.gain.setTargetAtTime(newDc, getContext().currentTime, 0.05);
        if (this.lfoGain && t) {
          this.lfoGain.gain.setTargetAtTime(this.baseVolume * t.depth * v, getContext().currentTime, 0.05);
        }
      });
    } catch (e) {
      console.warn('SustainedNote: could not start', e);
    }
  }

  setNote(note: NoteName, octave = 4): void {
    if (!this.oscillator) return;
    this.oscillator.frequency.setTargetAtTime(noteToFrequency(note, octave), getContext().currentTime, 0.05);
  }

  stop(): void {
    this.unsubscribeVolume?.();
    this.unsubscribeVolume = null;
    if (!this.oscillator || !this.gainNode) return;

    const ctx = getContext();
    const gain = this.gainNode;
    const osc = this.oscillator;
    this.oscillator = null;
    this.gainNode = null;

    this._destroyLFO();

    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
    osc.stop(ctx.currentTime + 0.1);
    osc.addEventListener('ended', () => {
      osc.disconnect();
      gain.disconnect();
    });
  }

  /** Hard stop with no fade — use when the view is being destroyed. */
  destroy(): void {
    this.unsubscribeVolume?.();
    this.unsubscribeVolume = null;
    this._destroyLFO();
    if (this.oscillator) {
      try { this.oscillator.stop(); } catch {}
      try { this.oscillator.disconnect(); } catch {}
      this.oscillator = null;
    }
    if (this.gainNode) {
      try { this.gainNode.disconnect(); } catch {}
      this.gainNode = null;
    }
  }

  private _destroyLFO(): void {
    if (this.lfo) {
      try { this.lfo.stop(); } catch {}
      try { this.lfo.disconnect(); } catch {}
      this.lfo = null;
    }
    if (this.lfoGain) {
      try { this.lfoGain.disconnect(); } catch {}
      this.lfoGain = null;
    }
  }
}
