import { ToneVoice, buildVoiceChain } from './tone_voices';
import { CHORD_ROOTS } from '../music/chord_key_resolver';
import { volumeManager } from './volume_manager';

// Semitone offsets for each scale degree (1–7) in major and natural minor
export const MAJOR_SCALE_SEMITONES = [0, 2, 4, 5, 7, 9, 11];
export const MINOR_SCALE_SEMITONES = [0, 2, 3, 5, 7, 8, 10];

export function chordToneFreq(toneName: string, octave: number): number {
  const idx = CHORD_ROOTS.indexOf(toneName);
  if (idx === -1) return 0;
  return 440 * Math.pow(2, (idx + 12 * (octave - 4)) / 12);
}

export function playBassTone(
  freq: number,
  bpm: number,
  steps: number,
  toneVoice: ToneVoice,
): void {
  try {
    const ctx = volumeManager.getAudioContext();
    const masterVol = volumeManager.getVolume();
    const now = ctx.currentTime;
    const stepMs = (60000 * 4) / bpm / steps;
    const noteDur = Math.min((stepMs / 1000) * 0.75, 0.35);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const voiceOut = buildVoiceChain(ctx, osc, toneVoice, {
      dest: ctx.destination,
      vol: masterVol,
    });
    osc.frequency.value = freq;
    voiceOut.connect(gain);
    gain.connect(ctx.destination);

    const peak = 0.35 * masterVol;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.005);
    gain.gain.setTargetAtTime(0, now + 0.005, noteDur * 0.55);

    osc.start(now);
    osc.stop(now + noteDur);
  } catch (e) {
    console.warn("bass_synth: bass note error", e);
  }
}
