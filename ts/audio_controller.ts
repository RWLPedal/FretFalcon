import { volumeManager } from "./sounds/volume_manager";

export class AudioController {
  private playClick(freq: number, decay: number, vol: number): void {
    try {
      const ctx = volumeManager.getAudioContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + decay);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + decay + 0.01);
    } catch (e) {
      console.warn('AudioController: click error', e);
    }
  }

  private playBell(freq: number, decay: number, vol: number): void {
    try {
      const ctx = volumeManager.getAudioContext();
      const now = ctx.currentTime;
      // Fundamental + one upper partial for a bell-like timbre
      for (const [f, v] of [[freq, 1.0], [freq * 2.76, 0.35]] as [number, number][]) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = f;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(vol * v, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + decay * (f === freq ? 1 : 0.6));
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + decay + 0.01);
      }
    } catch (e) {
      console.warn('AudioController: bell error', e);
    }
  }

  playIntroEnd(): void {
    this.playBell(1046, 2.0, volumeManager.getVolume() * 0.5);
  }

  playIntervalEnd(): void {
    this.playBell(880, 1.5, volumeManager.getVolume() * 0.5);
  }

  playMetronomeClick(): void {
    this.playClick(1200, 0.05, volumeManager.getVolume() * 0.6);
  }

  playAccentMetronomeClick(): void {
    this.playClick(1800, 0.07, volumeManager.getVolume() * 0.8);
  }

  // ─── Strum synthesis ─────────────────────────────────────────────────────────
  // All strum sounds are noise-based (no pitch) so they blend neutrally with
  // any backing tones the app may be playing.

  private noiseSource(ctx: AudioContext, dur: number): AudioBufferSourceNode {
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  /** Down strum: mid-frequency noise sweeping from ~1200 Hz down to ~700 Hz,
   *  plus a low-frequency body thump to suggest the guitar resonating. */
  playStrumDown(accent: boolean): void {
    try {
      const ctx = volumeManager.getAudioContext();
      const now = ctx.currentTime;
      const vol = volumeManager.getVolume() * (accent ? 1.0 : 0.72);
      const dur = accent ? 0.18 : 0.13;

      const src = this.noiseSource(ctx, dur);
      const flt = ctx.createBiquadFilter();
      flt.type = "bandpass";
      flt.frequency.setValueAtTime(1200, now);
      flt.frequency.exponentialRampToValueAtTime(700, now + dur);
      flt.Q.value = 1.2;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(vol, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
      src.connect(flt);
      flt.connect(gain);
      gain.connect(ctx.destination);
      src.start(now);
      src.stop(now + dur + 0.01);

      // Body thump
      const tDur = 0.08;
      const tsrc = this.noiseSource(ctx, tDur);
      const tflt = ctx.createBiquadFilter();
      tflt.type = "lowpass";
      tflt.frequency.value = 220;
      const tgain = ctx.createGain();
      tgain.gain.setValueAtTime(vol * 0.4, now);
      tgain.gain.exponentialRampToValueAtTime(0.001, now + tDur);
      tsrc.connect(tflt);
      tflt.connect(tgain);
      tgain.connect(ctx.destination);
      tsrc.start(now);
      tsrc.stop(now + tDur + 0.01);
    } catch (e) {
      console.warn("AudioController: strum down error", e);
    }
  }

  /** Up strum: brighter noise sweep from ~2400 Hz down to ~1600 Hz,
   *  shorter and lighter than a down strum — no body thump. */
  playStrumUp(accent: boolean): void {
    try {
      const ctx = volumeManager.getAudioContext();
      const now = ctx.currentTime;
      const vol = volumeManager.getVolume() * (accent ? 0.9 : 0.65);
      const dur = accent ? 0.12 : 0.09;

      const src = this.noiseSource(ctx, dur);
      const flt = ctx.createBiquadFilter();
      flt.type = "bandpass";
      flt.frequency.setValueAtTime(2400, now);
      flt.frequency.exponentialRampToValueAtTime(1600, now + dur);
      flt.Q.value = 1.5;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(vol, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
      src.connect(flt);
      flt.connect(gain);
      gain.connect(ctx.destination);
      src.start(now);
      src.stop(now + dur + 0.01);
    } catch (e) {
      console.warn("AudioController: strum up error", e);
    }
  }

  /** Chuck: very short burst of bandpass-filtered noise around 1800 Hz,
   *  simulating muted strings being dampened against the fretboard. */
  playStrumChuck(): void {
    try {
      const ctx = volumeManager.getAudioContext();
      const now = ctx.currentTime;
      const vol = volumeManager.getVolume() * 0.72;
      const dur = 0.06;

      const src = this.noiseSource(ctx, dur);
      const flt = ctx.createBiquadFilter();
      flt.type = "bandpass";
      flt.frequency.value = 1800;
      flt.Q.value = 1.5;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
      src.connect(flt);
      flt.connect(gain);
      gain.connect(ctx.destination);
      src.start(now);
      src.stop(now + dur);
    } catch (e) {
      console.warn("AudioController: strum chuck error", e);
    }
  }
}
