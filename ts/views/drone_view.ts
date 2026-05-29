import { BaseView } from '../base_view';
import { NoteName, NOTE_NAMES, SustainedNote, getGuitarWave } from '../sounds/note_sounds';
import { DriveSignal, SignalKind, StrumSignal } from '../panels/link_types';
import { volumeManager } from '../sounds/volume_manager';

export class DroneView extends BaseView {
  private note: NoteName;
  private octave: number;
  private isPlaying = false;
  private hasStrumLink = false;
  private drone = new SustainedNote();

  private playBtn: HTMLButtonElement | null = null;
  private noteSelect: HTMLSelectElement | null = null;
  private octaveSelect: HTMLSelectElement | null = null;
  private drivenOption: HTMLOptionElement | null = null;

  constructor(initialState?: any) {
    super();
    this.note = (initialState?.note as NoteName) ?? NoteName.A;
    this.octave = (initialState?.octave as number) ?? 4;
  }

  render(container: HTMLElement): void {
    this.container = container;
    container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.classList.add('drone-view');

    const controls = document.createElement('div');
    controls.classList.add('drone-controls', 'config-compact');

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
      this.drone.setNote(this.note, this.octave);
      this.dispatchTitle();
      this.saveState();
    });
    noteWrap.appendChild(this.noteSelect);
    controls.appendChild(noteWrap);

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
      this.drone.setNote(this.note, this.octave);
      this.saveState();
    });
    octaveWrap.appendChild(this.octaveSelect);
    controls.appendChild(octaveWrap);

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
      this.drone.setNote(this.note, this.octave);
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
        // Restore continuous sustain if we were playing in pluck mode
        if (this.isPlaying) this.drone.start(this.note, this.octave);
      }
    });

    this.dispatchTitle();
    this.saveState();
  }

  destroy(): void {
    this.drone.destroy();
    this.isPlaying = false;
    this.playBtn = null;
    this.noteSelect = null;
    this.octaveSelect = null;
    this.drivenOption = null;
    super.destroy();
  }

  private togglePlay(): void {
    if (this.isPlaying) {
      this.drone.stop();
      this.isPlaying = false;
    } else {
      this.isPlaying = true;
      // In strum-link mode, don't start a continuous sustain — plucks fire on strum signals.
      if (!this.hasStrumLink) this.drone.start(this.note, this.octave);
    }
    this.updatePlayBtn();
    this.dispatchTransportChanged();
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

      // Pitched pluck — compute drone frequency
      const SEMITONE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
      const noteIdx = SEMITONE_NAMES.indexOf(this.note as string);
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
    this.container.dispatchEvent(new CustomEvent('transport-changed', {
      bubbles: true,
      detail: { playing: this.isPlaying },
    }));
  }

  private updatePlayBtn(): void {
    if (!this.playBtn) return;
    const icon = this.playBtn.querySelector<HTMLElement>('.material-icons');
    if (icon) icon.textContent = this.isPlaying ? 'stop' : 'play_arrow';
    this.playBtn.classList.toggle('is-active', this.isPlaying);
  }

  private dispatchTitle(): void {
    if (!this.container) return;
    this.container.dispatchEvent(new CustomEvent('feature-title-changed', {
      bubbles: true,
      detail: { title: `Drone · ${this.note}` },
    }));
  }

  private saveState(): void {
    if (!this.container) return;
    this.container.dispatchEvent(new CustomEvent('feature-state-changed', {
      bubbles: true,
      detail: { note: this.note, octave: this.octave },
    }));
  }
}
