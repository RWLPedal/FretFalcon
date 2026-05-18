import { BaseView } from '../base_view';
import { NoteName, NOTE_NAMES, SustainedNote } from '../sounds/note_sounds';
import { DriveSignal, SignalKind } from '../panels/link_types';

const DRONE_OCTAVE = 4;

export class DroneView extends BaseView {
  private note: NoteName;
  private isPlaying = false;
  private drone = new SustainedNote();

  private playBtn: HTMLButtonElement | null = null;
  private noteSelect: HTMLSelectElement | null = null;
  private drivenOption: HTMLOptionElement | null = null;

  constructor(initialState?: any) {
    super();
    this.note = (initialState?.note as NoteName) ?? NoteName.A;
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
      if (val === '__driven__') return;
      this.note = val as NoteName;
      this.drone.setNote(this.note, DRONE_OCTAVE);
      this.dispatchTitle();
      this.saveState();
    });
    noteWrap.appendChild(this.noteSelect);
    controls.appendChild(noteWrap);

    this.playBtn = document.createElement('button');
    this.playBtn.classList.add('button', 'drone-play-btn');
    this.playBtn.innerHTML = '<span class="material-icons">play_arrow</span>';
    this.playBtn.addEventListener('click', () => this.togglePlay());
    controls.appendChild(this.playBtn);

    wrapper.appendChild(controls);
    container.appendChild(wrapper);

    this.listen(container, 'drive-signal', (e: Event) => {
      if (this.noteSelect?.value !== '__driven__') return;
      const { signal } = (e as CustomEvent<{ signal: DriveSignal }>).detail;
      if (signal.kind !== SignalKind.Chord) return;
      const rootNote = signal.rootNote as NoteName;
      if (!NOTE_NAMES.includes(rootNote)) return;
      this.note = rootNote;
      if (this.drivenOption) this.drivenOption.textContent = `Driven (${rootNote})`;
      this.drone.setNote(this.note, DRONE_OCTAVE);
      this.dispatchTitle();
    });

    this.listen(container, 'link-status-changed', (e: Event) => {
      const { hasIncomingLinks } = (e as CustomEvent<{ hasIncomingLinks: boolean }>).detail;
      if (hasIncomingLinks) {
        if (!this.drivenOption) {
          this.drivenOption = document.createElement('option');
          this.drivenOption.value = '__driven__';
          this.drivenOption.textContent = 'Driven';
          this.noteSelect?.insertBefore(this.drivenOption, this.noteSelect.firstChild);
        }
        if (this.noteSelect) this.noteSelect.value = '__driven__';
      } else {
        if (this.drivenOption) {
          this.drivenOption.remove();
          this.drivenOption = null;
        }
        if (this.noteSelect) this.noteSelect.value = this.note;
        this.dispatchTitle();
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
    this.drivenOption = null;
    super.destroy();
  }

  private togglePlay(): void {
    if (this.isPlaying) {
      this.drone.stop();
      this.isPlaying = false;
    } else {
      this.drone.start(this.note, DRONE_OCTAVE);
      this.isPlaying = true;
    }
    this.updatePlayBtn();
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
      detail: { note: this.note },
    }));
  }
}
