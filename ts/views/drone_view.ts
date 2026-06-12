import { BaseView } from '../base_view';
import { NoteName, NOTE_NAMES, SustainedNote, SustainedNoteOptions, getGuitarWave } from '../sounds/note_sounds';
import { DriveSignal, SignalKind, StrumSignal } from '../panels/link_types';
import { volumeManager } from '../sounds/volume_manager';
import { emitEvent } from '../core/events';

type ChordMode = 'note' | 'fifth' | 'major' | 'minor';
type EnvelopeMode = 'sustain' | 'slow' | 'fast';

const CHORD_OPTIONS: { value: ChordMode; label: string }[] = [
  { value: 'note',  label: 'Note'  },
  { value: 'fifth', label: '+5th'  },
  { value: 'major', label: 'Major' },
  { value: 'minor', label: 'Minor' },
];

const ENV_OPTIONS: { value: EnvelopeMode; label: string }[] = [
  { value: 'sustain', label: 'Sustain' },
  { value: 'slow',    label: 'Slow ~'  },
  { value: 'fast',    label: 'Fast ~~' },
];

const CHROMATIC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

export class DroneView extends BaseView {
  private note: NoteName;
  private octave: number;
  private chordMode: ChordMode;
  private envelope: EnvelopeMode;
  private isPlaying = false;
  private hasStrumLink = false;

  private droneRoot   = new SustainedNote();
  private droneVoice2 = new SustainedNote();
  private droneVoice3 = new SustainedNote();

  private playBtn: HTMLButtonElement | null = null;
  private noteSelect: HTMLSelectElement | null = null;
  private octaveSelect: HTMLSelectElement | null = null;
  private chordSelect: HTMLSelectElement | null = null;
  private envSelect: HTMLSelectElement | null = null;
  private drivenOption: HTMLOptionElement | null = null;

  constructor(initialState?: any) {
    super();
    this.note = (initialState?.note as NoteName) ?? NoteName.A;
    this.octave = (initialState?.octave as number) ?? 4;
    this.chordMode = (initialState?.chordMode as ChordMode) ?? 'note';
    this.envelope = (initialState?.envelope as EnvelopeMode) ?? 'sustain';
  }

  render(container: HTMLElement): void {
    this.container = container;
    container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.classList.add('drone-view');

    const controls = document.createElement('div');
    controls.classList.add('drone-controls', 'config-compact');

    // Note select
    const noteWrap = document.createElement('div');
    noteWrap.classList.add('config-select-wrap');
    this.noteSelect = document.createElement('select');
    for (const n of NOTE_NAMES) {
      const opt = document.createElement('option');
      opt.value = n;
      opt.textContent = n;
      if (n === this.note) opt.selected = true;
      this.noteSelect.appendChild(opt);
    }
    this.noteSelect.addEventListener('change', () => {
      const val = this.noteSelect!.value;
      if (val === 'driven') return;
      this.note = val as NoteName;
      if (this.isPlaying && !this.hasStrumLink) this.updateDroneNote();
      this.dispatchTitle();
      this.saveState();
    });
    noteWrap.appendChild(this.noteSelect);
    controls.appendChild(noteWrap);

    // Octave select
    const octaveWrap = document.createElement('div');
    octaveWrap.classList.add('config-select-wrap', 'drone-octave-select');
    this.octaveSelect = document.createElement('select');
    for (let o = 2; o <= 6; o++) {
      const opt = document.createElement('option');
      opt.value = String(o);
      opt.textContent = String(o);
      if (o === this.octave) opt.selected = true;
      this.octaveSelect.appendChild(opt);
    }
    this.octaveSelect.addEventListener('change', () => {
      this.octave = Number(this.octaveSelect!.value);
      if (this.isPlaying && !this.hasStrumLink) this.updateDroneNote();
      this.saveState();
    });
    octaveWrap.appendChild(this.octaveSelect);
    controls.appendChild(octaveWrap);

    // Chord mode select
    const chordWrap = document.createElement('div');
    chordWrap.classList.add('config-select-wrap', 'drone-chord-select');
    this.chordSelect = document.createElement('select');
    for (const { value, label } of CHORD_OPTIONS) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      if (value === this.chordMode) opt.selected = true;
      this.chordSelect.appendChild(opt);
    }
    this.chordSelect.addEventListener('change', () => {
      this.chordMode = this.chordSelect!.value as ChordMode;
      if (this.isPlaying && !this.hasStrumLink) this.startDrone();
      this.saveState();
    });
    chordWrap.appendChild(this.chordSelect);
    controls.appendChild(chordWrap);

    // Envelope select
    const envWrap = document.createElement('div');
    envWrap.classList.add('config-select-wrap', 'drone-envelope-select');
    this.envSelect = document.createElement('select');
    for (const { value, label } of ENV_OPTIONS) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      if (value === this.envelope) opt.selected = true;
      this.envSelect.appendChild(opt);
    }
    this.envSelect.addEventListener('change', () => {
      this.envelope = this.envSelect!.value as EnvelopeMode;
      if (this.isPlaying && !this.hasStrumLink) this.startDrone();
      this.saveState();
    });
    envWrap.appendChild(this.envSelect);
    controls.appendChild(envWrap);

    // Play button
    this.playBtn = document.createElement('button');
    this.playBtn.classList.add('button', 'drone-play-btn');
    this.playBtn.innerHTML = '<span class="material-icons">play_arrow</span>';
    this.playBtn.addEventListener('click', () => this.togglePlay());
    controls.appendChild(this.playBtn);

    wrapper.appendChild(controls);
    container.appendChild(wrapper);

    this.listen(container, 'drive-signal', (e: Event) => {
      const { signal } = (e as CustomEvent<{ signal: DriveSignal }>).detail;
      if (signal.kind === SignalKind.Play) {
        if (signal.playing) { if (!this.isPlaying) this.togglePlay(); }
        else { if (this.isPlaying) this.togglePlay(); }
        return;
      }
      if (signal.kind === SignalKind.Strum) {
        this.hasStrumLink = true;
        this.handleStrumPluck(signal as StrumSignal);
        return;
      }
      if (this.noteSelect?.value !== 'driven') return;
      if (signal.kind !== SignalKind.Chord) return;
      const rootNote = signal.rootNote as NoteName;
      if (!NOTE_NAMES.includes(rootNote)) return;
      this.note = rootNote;
      if (this.drivenOption) this.drivenOption.textContent = `Driven (${rootNote})`;
      if (this.isPlaying && !this.hasStrumLink) this.updateDroneNote();
      this.dispatchTitle();
    });

    this.listen(container, 'link-status-changed', (e: Event) => {
      const { hasIncomingLinks } = (e as CustomEvent<{ hasIncomingLinks: boolean }>).detail;
      if (hasIncomingLinks) {
        if (!this.drivenOption) {
          this.drivenOption = document.createElement('option');
          this.drivenOption.value = 'driven';
          this.drivenOption.textContent = 'Driven';
          this.noteSelect?.insertBefore(this.drivenOption, this.noteSelect.firstChild);
        }
        if (this.noteSelect) this.noteSelect.value = 'driven';
      } else {
        this.hasStrumLink = false;
        if (this.drivenOption) {
          this.drivenOption.remove();
          this.drivenOption = null;
        }
        if (this.noteSelect) this.noteSelect.value = this.note;
        this.dispatchTitle();
        if (this.isPlaying) this.startDrone();
      }
    });

    this.dispatchTitle();
    this.saveState();
  }

  destroy(): void {
    this.droneRoot.destroy();
    this.droneVoice2.destroy();
    this.droneVoice3.destroy();
    this.isPlaying = false;
    this.playBtn = null;
    this.noteSelect = null;
    this.octaveSelect = null;
    this.chordSelect = null;
    this.envSelect = null;
    this.drivenOption = null;
    super.destroy();
  }

  private togglePlay(): void {
    if (this.isPlaying) {
      this.stopDrone();
      this.isPlaying = false;
    } else {
      this.isPlaying = true;
      if (!this.hasStrumLink) this.startDrone();
    }
    this.updatePlayBtn();
    this.dispatchTransportChanged();
  }

  private startDrone(): void {
    this.stopDrone();
    const opts = this.envelopeOptions();
    switch (this.chordMode) {
      case 'note':
        this.droneRoot.start(this.note, this.octave, { ...opts, volume: 0.625 });
        break;
      case 'fifth': {
        const [n2, o2] = this.noteAtOffset(7);
        this.droneRoot.start(this.note, this.octave, { ...opts, volume: 0.50 });
        this.droneVoice2.start(n2, o2, { ...opts, volume: 0.38 });
        break;
      }
      case 'major': {
        const [n2, o2] = this.noteAtOffset(4);
        const [n3, o3] = this.noteAtOffset(7);
        this.droneRoot.start(this.note, this.octave, { ...opts, volume: 0.42 });
        this.droneVoice2.start(n2, o2, { ...opts, volume: 0.28 });
        this.droneVoice3.start(n3, o3, { ...opts, volume: 0.32 });
        break;
      }
      case 'minor': {
        const [n2, o2] = this.noteAtOffset(3);
        const [n3, o3] = this.noteAtOffset(7);
        this.droneRoot.start(this.note, this.octave, { ...opts, volume: 0.42 });
        this.droneVoice2.start(n2, o2, { ...opts, volume: 0.30 });
        this.droneVoice3.start(n3, o3, { ...opts, volume: 0.32 });
        break;
      }
    }
  }

  private stopDrone(): void {
    this.droneRoot.stop();
    this.droneVoice2.stop();
    this.droneVoice3.stop();
  }

  private updateDroneNote(): void {
    this.droneRoot.setNote(this.note, this.octave);
    switch (this.chordMode) {
      case 'fifth': {
        const [n2, o2] = this.noteAtOffset(7);
        this.droneVoice2.setNote(n2, o2);
        break;
      }
      case 'major': {
        const [n2, o2] = this.noteAtOffset(4);
        const [n3, o3] = this.noteAtOffset(7);
        this.droneVoice2.setNote(n2, o2);
        this.droneVoice3.setNote(n3, o3);
        break;
      }
      case 'minor': {
        const [n2, o2] = this.noteAtOffset(3);
        const [n3, o3] = this.noteAtOffset(7);
        this.droneVoice2.setNote(n2, o2);
        this.droneVoice3.setNote(n3, o3);
        break;
      }
    }
  }

  private envelopeOptions(): Partial<SustainedNoteOptions> {
    if (this.envelope === 'slow') return { tremolo: { rate: 3.5, depth: 0.175 } };
    if (this.envelope === 'fast') return { tremolo: { rate: 6.5, depth: 0.175 } };
    return {};
  }

  private noteAtOffset(semitones: number): [NoteName, number] {
    const idx = CHROMATIC.indexOf(this.note as string);
    const newIdx = idx + semitones;
    const note = CHROMATIC[((newIdx % 12) + 12) % 12] as NoteName;
    const octave = this.octave + Math.floor(newIdx / 12);
    return [note, octave];
  }

  private handleStrumPluck(signal: StrumSignal): void {
    if (!this.isPlaying) return;
    if (signal.action === 'rest' || signal.action === 'air') return;

    try {
      const ctx       = volumeManager.getAudioContext();
      const masterVol = volumeManager.getVolume();
      const now       = ctx.currentTime;

      if (signal.action === 'chuck') {
        const bufLen = Math.ceil(ctx.sampleRate * 0.06);
        const buf    = ctx.createBuffer(1, bufLen, ctx.sampleRate);
        const data   = buf.getChannelData(0);
        for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
        const src    = ctx.createBufferSource();
        src.buffer   = buf;
        const filter = ctx.createBiquadFilter();
        filter.type            = 'bandpass';
        filter.frequency.value = 1800;
        filter.Q.value         = 1.5;
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

      const noteIdx = CHROMATIC.indexOf(this.note as string);
      if (noteIdx === -1) return;
      const freq = 440 * Math.pow(2, (noteIdx + 12 * (this.octave - 4)) / 12);

      const isDown   = signal.direction === 'down';
      const isAccent = signal.action === 'accent';

      const osc    = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain   = ctx.createGain();

      osc.setPeriodicWave(getGuitarWave(ctx));
      osc.frequency.value = freq;

      filter.type            = isDown ? 'lowpass' : 'bandpass';
      filter.frequency.value = isDown ? 800 : 2200;
      filter.Q.value         = isDown ? 0.7 : 1.2;

      const duration = isDown ? (isAccent ? 0.45 : 0.35) : (isAccent ? 0.30 : 0.22);
      const peakVol  = isDown ? (isAccent ? 0.55 : 0.40) : (isAccent ? 0.45 : 0.30);
      const peak     = peakVol * masterVol;

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(peak, now + 0.006);
      gain.gain.setTargetAtTime(0, now + 0.006, duration * 0.5);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration);
    } catch (e) {
      console.warn('DroneView: strum pluck error', e);
    }
  }

  private dispatchTransportChanged(): void {
    if (!this.container) return;
    emitEvent(this.container, 'transport-changed', { playing: this.isPlaying });
  }

  private updatePlayBtn(): void {
    if (!this.playBtn) return;
    const icon = this.playBtn.querySelector<HTMLElement>('.material-icons');
    if (icon) icon.textContent = this.isPlaying ? 'stop' : 'play_arrow';
    this.playBtn.classList.toggle('is-active', this.isPlaying);
  }

  private dispatchTitle(): void {
    if (!this.container) return;
    emitEvent(this.container, 'feature-title-changed', { title: `Drone · ${this.note}` });
  }

  private saveState(): void {
    if (!this.container) return;
    emitEvent(this.container, 'feature-state-changed', {
      note: this.note, octave: this.octave, chordMode: this.chordMode, envelope: this.envelope,
    });
  }
}
