// ts/views/global_key_view.ts
import { BaseView } from '../base_view';
import { NOTE_NAMES, DiatonicMode, DIATONIC_MODE_LABELS, ALL_DIATONIC_MODES } from '../fretboard/music_types';
import { emitEvent } from '../core/events';

export const GLOBAL_KEY_VIEW_ID = 'global_key';

export class GlobalKeyView extends BaseView {
  private rootNote: string;
  private scaleKey: string;

  constructor(initialState?: any) {
    super();
    this.rootNote = initialState?.rootNote ?? 'C';
    this.scaleKey = initialState?.scaleKey ?? DiatonicMode.Ionian;
  }

  render(container: HTMLElement): void {
    this.container = container;
    container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.classList.add('global-key-view', 'config-compact');

    // Root note
    const rootWrap = document.createElement('div');
    rootWrap.classList.add('config-select-wrap');
    const rootLabel = document.createElement('span');
    rootLabel.classList.add('config-label');
    rootLabel.textContent = 'Root';
    const rootSelect = document.createElement('select');
    for (const note of NOTE_NAMES) {
      const opt = document.createElement('option');
      opt.value = note;
      opt.textContent = note;
      if (note === this.rootNote) opt.selected = true;
      rootSelect.appendChild(opt);
    }
    rootSelect.addEventListener('change', () => {
      this.rootNote = rootSelect.value;
      this.dispatchKey();
      this.saveViewState();
    });
    rootWrap.appendChild(rootLabel);
    rootWrap.appendChild(rootSelect);

    // Mode
    const modeWrap = document.createElement('div');
    modeWrap.classList.add('config-select-wrap');
    const modeLabel = document.createElement('span');
    modeLabel.classList.add('config-label');
    modeLabel.textContent = 'Mode';
    const modeSelect = document.createElement('select');
    for (const mode of ALL_DIATONIC_MODES) {
      const opt = document.createElement('option');
      opt.value = mode;
      opt.textContent = DIATONIC_MODE_LABELS[mode];
      if (mode === this.scaleKey) opt.selected = true;
      modeSelect.appendChild(opt);
    }
    modeSelect.addEventListener('change', () => {
      this.scaleKey = modeSelect.value;
      this.dispatchKey();
      this.saveViewState();
    });
    modeWrap.appendChild(modeLabel);
    modeWrap.appendChild(modeSelect);

    wrapper.appendChild(rootWrap);
    wrapper.appendChild(modeWrap);
    container.appendChild(wrapper);

    // Broadcast after the panel is registered with LinkManager (next animation frame,
    // by which time onWindowSpawned has been called and all other panels are ready).
    requestAnimationFrame(() => this.dispatchKey());
  }

  private dispatchKey(): void {
    if (!this.container) return;
    emitEvent(this.container, 'cof-key-selected', { root: this.rootNote, mode: this.scaleKey as DiatonicMode });
  }

  private saveViewState(): void {
    if (!this.container) return;
    emitEvent(this.container, 'feature-state-changed', { rootNote: this.rootNote, scaleKey: this.scaleKey });
  }
}
