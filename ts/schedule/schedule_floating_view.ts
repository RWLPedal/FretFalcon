import { BaseView } from '../core/base_view';
import { AppSettings, LAST_RUN_SCHEDULE_JSON_KEY, RECENT_SCHEDULES_JSON_KEY, MAX_RECENT_SCHEDULES } from '../settings';
import { AudioController } from '../audio_controller';
import { Schedule } from './schedule';
import { ScheduleEditor } from './editor/schedule_editor';
import { ScheduleDisplayAdapter } from './schedule_display_adapter';
import { SchedulePlaybackView } from './schedule_playback_view';
import { emitEvent } from '../core/events';

type SFVMode = 'edit' | 'play';

const DEFAULT_MAX_CANVAS_HEIGHT = 550;

/**
 * Floating view that embeds the full schedule workflow:
 *   - Edit mode: ScheduleEditor for defining practice intervals
 *   - Play mode: timer + upcoming list + controls (skip, reset, back to edit)
 *
 * When linked to an AnyFloatingView via the link system, feature signals
 * dispatched by ScheduleDisplayAdapter are routed there for rendering.
 */
export class ScheduleFloatingView extends BaseView {
  private mode: SFVMode = 'edit';
  private appSettings: AppSettings;
  private audioController: AudioController;
  private adapter: ScheduleDisplayAdapter;
  private editor: ScheduleEditor | null = null;
  private currentSchedule: Schedule | null = null;
  private playbackView: SchedulePlaybackView | null = null;
  private initialState: any;

  private editSection: HTMLElement | null = null;
  private playSection: HTMLElement | null = null;

  constructor(initialState: any, appSettings: AppSettings) {
    super();
    this.initialState = initialState;
    this.appSettings = appSettings;
    this.adapter = new ScheduleDisplayAdapter();
    this.audioController = new AudioController();
    if (initialState?.mode === 'play' || initialState?.mode === 'edit') {
      this.mode = initialState.mode;
    }
  }

  render(container: HTMLElement): void {
    this.container = container;
    container.innerHTML = '';
    container.classList.add('schedule-floating-view');

    // The adapter dispatches 'schedule-feature-changed' on this element;
    // it bubbles up through the floating-view-area to the LinkManager.
    this.adapter.setSignalSourceElement(container);
    this.adapter.setOnFlash(() => this._flashBorder());

    // Edit section
    this.editSection = document.createElement('div');
    this.editSection.classList.add('sfv-edit-section');
    container.appendChild(this.editSection);
    this._buildEditor();

    // Play section
    this.playSection = document.createElement('div');
    this.playSection.classList.add('sfv-play-section');
    container.appendChild(this.playSection);
    this._buildPlayUI();

    this._applyModeUI();

    // When restoring in play mode, pre-build the schedule so the upcoming list
    // is populated immediately. Deferred so onWindowSpawned() registers this
    // wrapper first — otherwise the signal can't be attributed to a source and
    // won't be cached for replay by initialize().
    if (this.mode === 'play' && this.editor) {
      Promise.resolve().then(() => {
        const schedule = this._buildSchedule();
        if (schedule) {
          this.currentSchedule = schedule;
          this.currentSchedule.prepare();
          this._updateScheduleInfo(schedule);
        }
      });
    }
  }

  // ─── Editor setup ──────────────────────────────────────────────────────────

  private _buildEditor(): void {
    if (!this.editSection) return;
    this.editSection.innerHTML = '';

    this.editor = new ScheduleEditor(
      this.editSection,
      () => this._applyAndPlay(),  // "Set Schedule" button → build + switch to play
      this.audioController,
      this.appSettings
    );

    // Relabel the apply button for floating-view context
    this.editor.setApplyButtonLabel('Apply');

    // Restore persisted schedule if available (overrides last-run from localStorage)
    if (this.initialState?.scheduleJSON) {
      this.editor.setScheduleJSON(this.initialState.scheduleJSON, true);
    }
  }

  // ─── Playback UI setup ─────────────────────────────────────────────────────

  private _buildPlayUI(): void {
    if (!this.playSection) return;
    this.playSection.innerHTML = '';

    const playbackContainer = document.createElement('div');
    this.playSection.appendChild(playbackContainer);
    this.playbackView = new SchedulePlaybackView(playbackContainer);
    this.adapter.setPlaybackView(this.playbackView);

    // Wire all control buttons
    this.playbackView.pauseBtn.addEventListener('click', () => this._handleStartPause());
    this.playbackView.prevBtn.addEventListener('click', () => this.currentSchedule?.prev());
    this.playbackView.nextBtn.addEventListener('click', () => this._handleSkip());
    this.playbackView.restartBtn.addEventListener('click', () => this._handleReset());
    this.playbackView.editBtn.addEventListener('click', () => this._switchToEdit());
  }

  // ─── Mode switching ────────────────────────────────────────────────────────

  private _applyAndPlay(): void {
    const schedule = this._buildSchedule();
    if (!schedule) return;
    this.currentSchedule = schedule;
    this.currentSchedule.prepare();
    this._saveScheduleToStorage();
    this._switchToPlay();
  }

  private _switchToPlay(): void {
    this.mode = 'play';
    if (this.currentSchedule) {
      this._updateScheduleInfo(this.currentSchedule);
    }
    this._applyModeUI();
    this._saveViewState();
  }

  private _updateScheduleInfo(schedule: Schedule): void {
    const name = this._getScheduleName();
    this.playbackView?.setScheduleInfo(
      name,
      schedule.totalDuration,
      schedule.intervals.length,
      schedule.groups.length,
    );
  }

  private _getScheduleName(): string {
    return this.editor?.getScheduleName() ?? '';
  }

  private _switchToEdit(): void {
    this.currentSchedule?.pause();
    this.mode = 'edit';
    this._applyModeUI();
    this._saveViewState();
  }

  private _applyModeUI(): void {
    if (!this.editSection || !this.playSection) return;
    const isPlay = this.mode === 'play';
    this.editSection.style.display = isPlay ? 'none' : '';
    this.playSection.style.display = isPlay ? '' : 'none';
  }

  // ─── Schedule lifecycle ────────────────────────────────────────────────────

  private _handleStartPause(): void {
    if (!this.currentSchedule) {
      // No schedule yet — build it and start
      const schedule = this._buildSchedule();
      if (!schedule) return;
      this.currentSchedule = schedule;
      this.currentSchedule.prepare();
      this._updateScheduleInfo(schedule);
    }
    if (this.currentSchedule.isFinished()) {
      this._handleReset();
      return;
    }
    if (this.currentSchedule.isRunning()) {
      this.currentSchedule.pause();
    } else {
      this.currentSchedule.start();
    }
  }

  private _handleSkip(): void {
    if (!this.currentSchedule || this.currentSchedule.isFinished()) return;
    this.currentSchedule.skip();
  }

  private _handleReset(): void {
    this.currentSchedule?.pause();
    const schedule = this._buildSchedule();
    if (!schedule) return;
    this.currentSchedule = schedule;
    this.currentSchedule.prepare();
    this._updateScheduleInfo(schedule);
  }

  private _buildSchedule(): Schedule | null {
    if (!this.editor) return null;
    const container = this.container;
    const maxCanvasHeight = container ? (container.clientHeight || DEFAULT_MAX_CANVAS_HEIGHT) : DEFAULT_MAX_CANVAS_HEIGHT;
    return this.editor.getSchedule(this.adapter, this.appSettings, maxCanvasHeight);
  }

  // ─── Border flash ──────────────────────────────────────────────────────────

  private _flashBorder(): void {
    if (!this.container) return;
    const wrapper = this.container.closest<HTMLElement>('.floating-view-wrapper');
    const target = wrapper ?? this.container;
    target.classList.add('sfv-flash');
    setTimeout(() => target.classList.remove('sfv-flash'), 600);
  }

  // ─── Persistence ──────────────────────────────────────────────────────────

  private _saveViewState(): void {
    const scheduleJSON = this.editor?.getScheduleJSON();
    const detail: Record<string, unknown> = { mode: this.mode };
    if (scheduleJSON) detail.scheduleJSON = scheduleJSON;
    if (this.container) emitEvent(this.container, 'feature-state-changed', detail);
  }

  private _saveScheduleToStorage(): void {
    if (!this.editor) return;
    try {
      const json = this.editor.getScheduleJSON();
      const parsed = JSON.parse(json);
      if (!parsed || !Array.isArray(parsed.items) || parsed.items.length === 0) return;
      localStorage.setItem(LAST_RUN_SCHEDULE_JSON_KEY, json);
      const stored = localStorage.getItem(RECENT_SCHEDULES_JSON_KEY);
      let recent: string[] = [];
      if (stored) {
        try { const p = JSON.parse(stored); if (Array.isArray(p)) recent = p; } catch {}
      }
      recent = recent.filter(s => s !== json);
      recent.unshift(json);
      if (recent.length > MAX_RECENT_SCHEDULES) recent.length = MAX_RECENT_SCHEDULES;
      localStorage.setItem(RECENT_SCHEDULES_JSON_KEY, JSON.stringify(recent));
    } catch {}
  }

  // ─── View lifecycle ────────────────────────────────────────────────────────

  start(): void {}

  stop(): void {
    this.currentSchedule?.pause();
  }

  destroy(): void {
    this.currentSchedule?.pause();
    super.destroy();
  }
}
