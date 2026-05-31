// ts/sounds/tone_voices.ts
// Tone-voice helpers for backing-track bass and chord playback.
// Each voice configures an OscillatorNode's waveform and optionally inserts
// WaveShaper + filter nodes between the oscillator and the caller's GainNode.

import { getGuitarWave } from './note_sounds';

export type ToneVoice = 'clean' | 'overdrive' | 'fuzz' | 'organ' | 'sub' | 'warm' | 'rhodes';

export const TONE_VOICE_LABELS: Record<ToneVoice, string> = {
  clean:     'Clean',
  overdrive: 'Overdrive',
  fuzz:      'Fuzz',
  organ:     'Organ',
  sub:       'Sub',
  warm:      'Warm',
  rhodes:    'Rhodes',
};

export const ALL_TONE_VOICES: ToneVoice[] = ['clean', 'overdrive', 'fuzz', 'organ', 'sub', 'warm', 'rhodes'];

// ─── Wave / curve caches ──────────────────────────────────────────────────────

const _organWaveCache    = new WeakMap<AudioContext, PeriodicWave>();
const _rhodesWaveCache   = new WeakMap<AudioContext, PeriodicWave>();
let   _overdriveCurve: Float32Array | null = null;
let   _fuzzCurve:      Float32Array | null = null;

function getOrganWave(ctx: AudioContext): PeriodicWave {
  let wave = _organWaveCache.get(ctx);
  if (!wave) {
    // Classic Hammond drawbar approximation: harmonics 1, 2, 3, 4, 6 (16', 8', 5⅓', 4', 2⅔')
    const real = new Float32Array([0, 1, 0.70, 0.35, 0.18, 0, 0.09]);
    const imag = new Float32Array(7).fill(0);
    wave = ctx.createPeriodicWave(real, imag);
    _organWaveCache.set(ctx, wave);
  }
  return wave;
}

function getRhodesWave(ctx: AudioContext): PeriodicWave {
  let wave = _rhodesWaveCache.get(ctx);
  if (!wave) {
    // Electric piano tine: strong fundamental, tapered even harmonics, slight inharmonic 3rd
    const real = new Float32Array([0, 1, 0.45, 0.20, 0.08, 0.04, 0.02, 0.01]);
    const imag = new Float32Array(8).fill(0);
    wave = ctx.createPeriodicWave(real, imag);
    _rhodesWaveCache.set(ctx, wave);
  }
  return wave;
}

// Soft saturation via tanh with normalisation so output stays in [-1, 1].
function getOverdriveCurve(): Float32Array {
  if (_overdriveCurve) return _overdriveCurve;
  const n   = 512;
  const k   = 8; // higher = more saturation
  const div = Math.tanh(k);
  _overdriveCurve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    _overdriveCurve[i] = Math.tanh(k * x) / div;
  }
  return _overdriveCurve;
}

// Hard clip: pre-gain then clamp to [-1, 1].
function getFuzzCurve(): Float32Array {
  if (_fuzzCurve) return _fuzzCurve;
  const n       = 512;
  const preGain = 10;
  _fuzzCurve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    _fuzzCurve[i] = Math.max(-1, Math.min(1, x * preGain));
  }
  return _fuzzCurve;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Configures `osc`'s waveform for `voice`, creates any intermediate processing
 * nodes (WaveShaper, filter), connects them, and returns the last node in the
 * chain. Callers should connect: returned node → their GainNode → destination.
 *
 * The oscillator's frequency must be set by the caller after this call.
 *
 * Pass `dest` + `vol` so the 'clean' voice can fire a pick-transient node
 * directly at the destination with a properly-scaled amplitude.
 */
export function buildVoiceChain(
  ctx: AudioContext,
  osc: OscillatorNode,
  voice: ToneVoice,
  options?: { dest?: AudioNode; vol?: number },
): AudioNode {
  if (voice === 'sub') {
    osc.type = 'sine';
    return osc;
  }

  if (voice === 'warm') {
    osc.type = 'triangle';
    return osc;
  }

  if (voice === 'organ') {
    osc.setPeriodicWave(getOrganWave(ctx));
    return osc;
  }

  if (voice === 'rhodes') {
    osc.setPeriodicWave(getRhodesWave(ctx));
    return osc;
  }

  if (voice === 'overdrive') {
    osc.setPeriodicWave(getGuitarWave(ctx));
    const shaper = ctx.createWaveShaper();
    shaper.curve = getOverdriveCurve();
    shaper.oversample = '4x';
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 3500;
    osc.connect(shaper);
    shaper.connect(filter);
    return filter;
  }

  if (voice === 'fuzz') {
    osc.type = 'sawtooth';
    const shaper = ctx.createWaveShaper();
    shaper.curve = getFuzzCurve();
    shaper.oversample = '4x';
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2800;
    osc.connect(shaper);
    shaper.connect(filter);
    return filter;
  }

  // 'clean' — guitar periodic wave + pick-attack transient
  osc.setPeriodicWave(getGuitarWave(ctx));
  const { dest, vol = 1 } = options ?? {};
  if (dest) {
    // Short bandpass-filtered noise burst simulating the pick/pluck attack
    const now  = ctx.currentTime;
    const dur  = 0.038;
    const len  = Math.ceil(ctx.sampleRate * dur);
    const buf  = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src  = ctx.createBufferSource();
    src.buffer = buf;
    const flt  = ctx.createBiquadFilter();
    flt.type   = 'bandpass';
    flt.frequency.value = 4200;
    flt.Q.value         = 1.5;
    const pg   = ctx.createGain();
    pg.gain.setValueAtTime(0.12 * vol, now);
    pg.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(flt);
    flt.connect(pg);
    pg.connect(dest);
    src.start(now);
    src.stop(now + dur);
  }
  return osc;
}
