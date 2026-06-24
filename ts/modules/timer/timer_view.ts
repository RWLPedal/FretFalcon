import { BaseView } from '../../core/base_view';
import { formatDuration, parseDurationString } from '../../time_utils';
import { SignalKind, DriveSignal } from '../../panels/link_types';
import { getFloatingViewGridCell } from '../../panels/panel_wrapper';
import { emitEvent } from '../../core/events';

export type TimerMode = 'simple' | 'intervals' | 'stopwatch';

export interface TimerSettings {
  mode: TimerMode;
  duration: number;     // simple-mode countdown, seconds
  focusSeconds: number; // intervals focus phase, seconds
  restSeconds: number;  // intervals rest phase, seconds
  rounds: number;       // intervals round count
  countIn: 0 | 3 | 5;   // pre-roll seconds
  chime: boolean;
}

const DEFAULTS: TimerSettings = {
  mode: 'simple',
  duration: 300,
  focusSeconds: 300,
  restSeconds: 60,
  rounds: 4,
  countIn: 0,
  chime: true,
};

const STEP_SECONDS = 30;       // focus/rest stepper granularity
const MIN_PHASE = 30;          // minimum focus/rest length
const DEFAULT_TITLE = 'Timer'; // chrome title when there's no status to show

type ChimeKind = 'end' | 'transition' | 'go' | 'tick';
type Phase = 'focus' | 'rest';

/**
 * Standalone practice timer. Three modes — Simple countdown, Stopwatch (counts
 * up) and Intervals (focus/rest × rounds) — plus an optional count-in pre-roll
 * and a chime. A gear button flips the panel to an in-place settings face; when
 * the settings face is taller than the panel it asks the wrapper to grow
 * temporarily (and restores the size on the way out).
 *
 * The schedule-driven setters (setTitle/setDisplayTime/setDuration/setRunning)
 * are retained so the legacy DisplayController still compiles; the live app
 * drives the schedule through ScheduleDisplayAdapter, not this view.
 */
export class TimerView extends BaseView {
  private settings: TimerSettings;

  // Runtime state
  private currentSeconds: number = 0;
  private isRunning: boolean = false;
  private isEditing: boolean = false;
  private isDone: boolean = false;
  private hasStarted: boolean = false; // true once a fresh run begins (gates count-in)
  private timerId: number | null = null;

  // Intervals runtime
  private currentRound: number = 1;
  private currentPhase: Phase = 'focus';
  private countInRemaining: number = 0;

  // Settings toggle + panel-expansion bookkeeping
  private settingsOpen: boolean = false;
  private appliedExpandDelta: number = 0; // px we've asked the wrapper to add

  // The status text (phase, "Done", etc.) is shown in the panel's title bar
  // instead of in the body; cache the last value so we don't re-emit every tick.
  private lastTitle: string | null = null;

  // DOM refs — main face
  private barEl: HTMLElement | null = null;
  private barFillEl: HTMLElement | null = null;
  private segFillEls: HTMLElement[] = [];
  private startPauseBtn: HTMLButtonElement | null = null;
  private displayEl: HTMLElement | null = null;
  private editBtn: HTMLElement | null = null;

  // DOM refs — inline config section
  private settingsBtn: HTMLButtonElement | null = null;
  private stepperValEls: Partial<Record<'focus' | 'rest' | 'rounds', HTMLElement>> = {};

  constructor(initial?: unknown) {
    super();
    this.settings = TimerView.parseSettings(initial);
    this.resetToBaseline();
  }

  private static parseSettings(blob: unknown): TimerSettings {
    const s = (blob && typeof blob === 'object') ? blob as Record<string, unknown> : {};
    const num = (v: unknown, d: number) =>
      (typeof v === 'number' && isFinite(v) && v >= 0 ? Math.floor(v) : d);
    const mode: TimerMode =
      (s.mode === 'intervals' || s.mode === 'stopwatch' || s.mode === 'simple')
        ? s.mode : DEFAULTS.mode;
    const ci = num(s.countIn, DEFAULTS.countIn);
    return {
      mode,
      duration: Math.max(1, num(s.duration, DEFAULTS.duration)),
      focusSeconds: Math.max(MIN_PHASE, num(s.focusSeconds, DEFAULTS.focusSeconds)),
      restSeconds: Math.max(MIN_PHASE, num(s.restSeconds, DEFAULTS.restSeconds)),
      rounds: Math.max(1, num(s.rounds, DEFAULTS.rounds)),
      countIn: (ci === 3 || ci === 5 ? ci : 0) as 0 | 3 | 5,
      chime: typeof s.chime === 'boolean' ? s.chime : DEFAULTS.chime,
    };
  }

  // ─── View interface ────────────────────────────────────────────────────────

  render(container: HTMLElement): void {
    this.container = container;

    // One-time, container-level wiring (render() is called once per instance).
    this.listen(container, 'drive-signal', (e: Event) => {
      const signal = (e as CustomEvent<{ signal: DriveSignal }>).detail?.signal;
      if (!signal || signal.kind !== SignalKind.Play) return;
      if (signal.playing) this.startCountdown(); else this.stopCountdown();
    });

    this.rebuild();

    // Persist the full settings blob so the wrapper can restore it on reload.
    this.persist();
  }

  destroy(): void {
    // Make sure any temporary settings-expansion is handed back before teardown,
    // so an inflated height is never persisted as the panel's canonical size.
    this.setExpansion(0);
    this.stopCountdown();
    this.barEl = null;
    this.barFillEl = null;
    this.segFillEls = [];
    this.startPauseBtn = null;
    this.settingsBtn = null;
    this.displayEl = null;
    this.editBtn = null;
    this.stepperValEls = {};
    super.destroy();
  }

  // ─── Build / rebuild ─────────────────────────────────────────────────────────

  private rebuild(): void {
    if (!this.container) return;
    this.container.innerHTML = '';
    // Drop refs to the old DOM so a background tick() can't write to detached nodes.
    this.barEl = null;
    this.barFillEl = null;
    this.segFillEls = [];
    this.startPauseBtn = null;
    this.settingsBtn = null;
    this.displayEl = null;
    this.editBtn = null;
    this.buildMain(this.container);
  }

  private buildMain(container: HTMLElement): void {
    const wrapper = document.createElement('div');
    wrapper.classList.add('timer-view');
    // Top-align while the config is open so it stacks below the timer (and so the
    // overflow we measure for the panel-grow is accurate, not split by centering).
    if (this.settingsOpen) wrapper.classList.add('timer-view--config-open');

    this.barEl = this.buildBar();
    wrapper.appendChild(this.barEl);

    const row = document.createElement('div');
    row.classList.add('timer-row');

    const controls = document.createElement('div');
    controls.classList.add('timer-controls');

    this.startPauseBtn = document.createElement('button');
    this.startPauseBtn.classList.add('button', 'timer-start-pause');
    this.startPauseBtn.innerHTML = '<span class="material-icons">play_arrow</span>';
    this.startPauseBtn.title = 'Play / Pause';
    this.startPauseBtn.addEventListener('click', () => this.handleStartPause());
    controls.appendChild(this.startPauseBtn);

    const resetBtn = document.createElement('button');
    resetBtn.classList.add('button', 'timer-reset');
    resetBtn.innerHTML = '<span class="material-icons">replay</span>';
    resetBtn.title = 'Reset';
    resetBtn.addEventListener('click', () => this.handleReset());
    controls.appendChild(resetBtn);

    this.settingsBtn = document.createElement('button');
    this.settingsBtn.classList.add('button', 'timer-settings-btn');
    this.settingsBtn.classList.toggle('is-active', this.settingsOpen);
    this.settingsBtn.innerHTML = '<span class="material-icons">tune</span>';
    this.settingsBtn.title = 'Settings';
    this.settingsBtn.addEventListener('click', () => this.toggleSettings());
    controls.appendChild(this.settingsBtn);

    row.appendChild(controls);

    const displayWrap = document.createElement('div');
    displayWrap.classList.add('timer-display-wrap');

    this.editBtn = document.createElement('span');
    this.editBtn.classList.add('material-icons', 'timer-edit');
    this.editBtn.textContent = 'edit';
    this.editBtn.title = 'Edit time';
    this.editBtn.addEventListener('click', () => this.handleDisplayClick());
    displayWrap.appendChild(this.editBtn);

    this.displayEl = document.createElement('div');
    this.displayEl.classList.add('timer-display');
    this.displayEl.addEventListener('click', () => this.handleDisplayClick());
    displayWrap.appendChild(this.displayEl);

    row.appendChild(displayWrap);
    wrapper.appendChild(row);

    if (this.settingsOpen) this.buildConfig(wrapper);

    container.appendChild(wrapper);

    this.updateButtonState();
    this.updateDisplay();
  }

  /** Builds the progress bar for the current mode and wires fill refs. */
  private buildBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.classList.add('timer-bar');

    if (this.settings.mode === 'intervals') {
      bar.classList.add('timer-bar--segmented');
      this.segFillEls = [];
      // N focus periods, rests only between them → 2N − 1 segments (no trailing rest).
      const segCount = this.settings.rounds * 2 - 1;
      for (let i = 0; i < segCount; i++) {
        const seg = document.createElement('div');
        seg.classList.add('timer-seg');
        // Even segments are focus, odd are rest.
        const isFocus = i % 2 === 0;
        seg.classList.add(isFocus ? 'timer-seg--focus' : 'timer-seg--rest');
        // Width is proportional to the phase length (focus 5:00 vs rest 1:00 → 5×).
        seg.style.flexGrow = String(isFocus ? this.settings.focusSeconds : this.settings.restSeconds);
        const fill = document.createElement('div');
        fill.classList.add('timer-seg-fill');
        seg.appendChild(fill);
        bar.appendChild(seg);
        this.segFillEls.push(fill);
      }
    } else {
      // Simple gets a single fill; stopwatch stays empty.
      this.barFillEl = document.createElement('div');
      this.barFillEl.classList.add('timer-bar-fill');
      bar.appendChild(this.barFillEl);
    }
    return bar;
  }

  // ─── Settings face ───────────────────────────────────────────────────────────

  private buildConfig(parent: HTMLElement): void {
    const root = document.createElement('div');
    root.classList.add('timer-config');
    this.stepperValEls = {};

    // MODE
    root.appendChild(this.buildSettingRow('Mode', this.buildSegGroup<TimerMode>(
      [['simple', 'Simple'], ['intervals', 'Intervals'], ['stopwatch', 'Watch']],
      this.settings.mode,
      (v) => this.onModeChange(v),
    )));

    // CYCLE (intervals only) — focus / rest / rounds on one row
    if (this.settings.mode === 'intervals') {
      const cycle = document.createElement('div');
      cycle.classList.add('config-compact', 'timer-config-controls', 'timer-steppers');
      cycle.appendChild(this.buildStepper('focus', this.settings.focusSeconds, 'focus'));
      cycle.appendChild(this.buildStepper('rest', this.settings.restSeconds, 'rest'));
      cycle.appendChild(this.buildStepper('rounds', this.settings.rounds, 'rds'));
      root.appendChild(this.buildSettingRow('Cycle', cycle));
    }

    // COUNT-IN
    root.appendChild(this.buildSettingRow('Count-in', this.buildSegGroup<0 | 3 | 5>(
      [[0, 'Off'], [3, '3s'], [5, '5s']],
      this.settings.countIn,
      (v) => { this.settings.countIn = v; this.persist(); },
    )));

    // CHIME — omitted for stopwatch, which never ends
    if (this.settings.mode !== 'stopwatch') {
      root.appendChild(this.buildSettingRow('Chime', this.buildSegGroup<boolean>(
        [[false, 'Off'], [true, 'On']],
        this.settings.chime,
        (v) => { this.settings.chime = v; this.persist(); },
      )));
    }

    parent.appendChild(root);
  }

  private buildSettingRow(label: string, control: HTMLElement): HTMLElement {
    const row = document.createElement('div');
    row.classList.add('timer-settings-row');
    const lbl = document.createElement('span');
    lbl.classList.add('config-label');
    lbl.textContent = label;
    row.appendChild(lbl);
    row.appendChild(control);
    return row;
  }

  /** A segmented toggle group reusing the shared .config-toggle-btn styling. */
  private buildSegGroup<T>(
    options: Array<[T, string]>,
    current: T,
    onPick: (v: T) => void,
  ): HTMLElement {
    const group = document.createElement('div');
    group.classList.add('config-compact', 'timer-config-controls', 'timer-seg-group');
    const buttons: HTMLButtonElement[] = [];
    for (const [value, label] of options) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.classList.add('config-toggle-btn');
      btn.textContent = label;
      btn.classList.toggle('is-active', value === current);
      btn.addEventListener('click', () => {
        for (const b of buttons) b.classList.remove('is-active');
        btn.classList.add('is-active');
        onPick(value);
      });
      buttons.push(btn);
      group.appendChild(btn);
    }
    return group;
  }

  private buildStepper(
    field: 'focus' | 'rest' | 'rounds',
    value: number,
    unit: string,
  ): HTMLElement {
    const wrap = document.createElement('div');
    wrap.classList.add('timer-stepper');

    const minus = document.createElement('button');
    minus.type = 'button';
    minus.classList.add('config-toggle-btn', 'timer-step-btn');
    minus.textContent = '−';
    minus.addEventListener('click', () => this.onStepperChange(field, -1));
    wrap.appendChild(minus);

    const val = document.createElement('span');
    val.classList.add('timer-step-val');
    val.textContent = TimerView.stepperLabel(field, value);
    this.stepperValEls[field] = val;
    wrap.appendChild(val);

    const plus = document.createElement('button');
    plus.type = 'button';
    plus.classList.add('config-toggle-btn', 'timer-step-btn');
    plus.textContent = '+';
    plus.addEventListener('click', () => this.onStepperChange(field, +1));
    wrap.appendChild(plus);

    const unitEl = document.createElement('span');
    unitEl.classList.add('timer-step-unit');
    unitEl.textContent = unit;
    wrap.appendChild(unitEl);

    return wrap;
  }

  private static stepperLabel(field: 'focus' | 'rest' | 'rounds', value: number): string {
    return field === 'rounds' ? String(value) : formatDuration(value);
  }

  // ─── Settings handlers ─────────────────────────────────────────────────────────

  private onModeChange(mode: TimerMode): void {
    if (mode === this.settings.mode) return;
    this.stopCountdown();
    this.hasStarted = false;
    this.settings.mode = mode;
    this.resetToBaseline();
    this.persist();
    this.rebuild();      // show/hide the CYCLE + CHIME rows
    this.recompute();    // config height changed
  }

  private onStepperChange(field: 'focus' | 'rest' | 'rounds', dir: number): void {
    if (field === 'rounds') {
      this.settings.rounds = Math.max(1, this.settings.rounds + dir);
    } else {
      const key = field === 'focus' ? 'focusSeconds' : 'restSeconds';
      this.settings[key] = Math.max(MIN_PHASE, this.settings[key] + dir * STEP_SECONDS);
    }
    const valEl = this.stepperValEls[field];
    if (valEl) {
      const v = field === 'rounds' ? this.settings.rounds
        : field === 'focus' ? this.settings.focusSeconds : this.settings.restSeconds;
      valEl.textContent = TimerView.stepperLabel(field, v);
    }
    if (!this.isRunning && this.countInRemaining === 0) this.resetToBaseline();
    this.persist();
  }

  private toggleSettings(): void {
    this.settingsOpen = !this.settingsOpen;
    this.rebuild();
    this.recompute();
  }

  /** Grow the panel to fit the inline config (or shrink back when it closes). */
  private recompute(): void {
    // Collapse our own expansion first so the overflow is measured at the base
    // size, then add exactly what's needed — this shrinks as well as grows.
    this.setExpansion(0);
    requestAnimationFrame(() => {
      if (!this.container || !this.settingsOpen) return;
      const over = this.container.scrollHeight - this.container.clientHeight;
      this.setExpansion(over > 0 ? over + 2 : 0);
    });
  }

  /** Ask the wrapper to add/remove panel height so total extra == `want` px. */
  private setExpansion(want: number): void {
    if (!this.container) return;
    // Round the growth up to a whole number of grid cells so the panel stays
    // grid-aligned (its base height already is) — this also makes it a touch taller.
    if (want > 0) {
      const cell = getFloatingViewGridCell();
      if (cell && cell.h > 0) want = Math.ceil(want / cell.h) * cell.h;
    }
    const delta = want - this.appliedExpandDelta;
    if (delta === 0) return;
    // Reuse the wrapper's view→chrome height-adjust primitive; we only want the
    // height delta, so keep `collapsed` false (don't toggle any chrome state).
    emitEvent(this.container, 'config-collapse-changed', {
      collapsed: false,
      isInitial: false,
      delta,
    });
    this.appliedExpandDelta = want;
  }

  // ─── Engine ────────────────────────────────────────────────────────────────────

  private resetToBaseline(): void {
    this.isDone = false;
    this.countInRemaining = 0;
    this.currentRound = 1;
    this.currentPhase = 'focus';
    this.hasStarted = false;
    switch (this.settings.mode) {
      case 'stopwatch': this.currentSeconds = 0; break;
      case 'intervals': this.currentSeconds = this.settings.focusSeconds; break;
      default:          this.currentSeconds = this.settings.duration; break;
    }
  }

  private handleStartPause(): void {
    if (this.isRunning) this.stopCountdown();
    else this.startCountdown();
  }

  private handleReset(): void {
    this.stopCountdown();
    this.resetToBaseline();
    this.updateDisplay();
    this.updateButtonState();
  }

  private handleDisplayClick(): void {
    if (this.settings.mode !== 'simple') return;
    if (this.isRunning || this.isEditing || this.countInRemaining > 0) return;
    if (this.displayEl) this.enterEditMode(this.displayEl);
  }

  private startCountdown(): void {
    if (this.isRunning || this.timerId !== null) return;

    // Restart from baseline if the previous run finished.
    if (this.isDone) this.resetToBaseline();
    if (this.settings.mode === 'simple' && this.currentSeconds <= 0) {
      this.currentSeconds = this.settings.duration;
    }

    // Count-in only on a fresh start, never when resuming a paused run.
    if (!this.hasStarted && this.settings.countIn > 0) {
      this.countInRemaining = this.settings.countIn;
    }
    this.hasStarted = true;
    this.isRunning = true;
    this.isDone = false;
    this.updateButtonState();
    this.updateDisplay();
    this.dispatchTransportChanged(true);

    this.timerId = window.setInterval(() => this.tick(), 1000);
  }

  private stopCountdown(): void {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
    if (!this.isRunning) return;
    this.isRunning = false;
    this.updateButtonState();
    this.dispatchTransportChanged(false);
  }

  private tick(): void {
    // Count-in pre-roll
    if (this.countInRemaining > 0) {
      this.countInRemaining--;
      if (this.settings.chime) this.playChime(this.countInRemaining > 0 ? 'tick' : 'go');
      this.updateDisplay();
      return;
    }

    switch (this.settings.mode) {
      case 'stopwatch':
        this.currentSeconds++;
        break;
      case 'simple':
        if (this.currentSeconds > 0) this.currentSeconds--;
        if (this.currentSeconds <= 0) {
          if (this.settings.chime) this.playChime('end');
          this.isDone = true;
          this.stopCountdown();
        }
        break;
      case 'intervals':
        if (this.currentSeconds > 0) this.currentSeconds--;
        if (this.currentSeconds <= 0) this.advanceInterval();
        break;
    }
    this.updateDisplay();
  }

  /** Called when an intervals phase reaches 0; moves to the next phase/round. */
  private advanceInterval(): void {
    if (this.currentPhase === 'focus') {
      // No trailing rest — the final round's focus ends the session.
      if (this.currentRound >= this.settings.rounds) {
        if (this.settings.chime) this.playChime('end');
        this.isDone = true;
        this.currentSeconds = 0;
        this.stopCountdown();
        return;
      }
      // Otherwise focus → rest (rest only sits between focus periods).
      if (this.settings.chime) this.playChime('transition');
      this.currentPhase = 'rest';
      this.currentSeconds = this.settings.restSeconds;
      return;
    }
    // Rest finished → next round's focus.
    if (this.settings.chime) this.playChime('transition');
    this.currentRound++;
    this.currentPhase = 'focus';
    this.currentSeconds = this.settings.focusSeconds;
  }

  // ─── Edit mode (simple duration) ─────────────────────────────────────────────

  private enterEditMode(target: HTMLElement): void {
    this.isEditing = true;
    target.contentEditable = 'true';
    target.classList.add('is-editing');
    target.focus();
    const range = document.createRange();
    range.selectNodeContents(target);
    const sel = window.getSelection();
    if (sel) { sel.removeAllRanges(); sel.addRange(range); }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        cleanup();
        this.exitEditMode(target);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cleanup();
        this.cancelEditMode(target);
      }
    };
    const onBlur = () => { cleanup(); this.exitEditMode(target); };
    const cleanup = () => {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('blur', onBlur);
    };
    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('blur', onBlur);
  }

  private exitEditMode(target: HTMLElement): void {
    const raw = target.textContent?.trim() ?? '';
    this.isEditing = false;
    target.contentEditable = 'false';
    target.classList.remove('is-editing');
    try {
      const clamped = Math.max(1, parseDurationString(raw));
      this.settings.duration = clamped;
      this.currentSeconds = clamped;
      this.persist();
    } catch {
      // Invalid input — keep the previous value.
    }
    this.updateDisplay();
  }

  private cancelEditMode(target: HTMLElement): void {
    this.isEditing = false;
    target.contentEditable = 'false';
    target.classList.remove('is-editing');
    this.updateDisplay();
  }

  // ─── Display helpers ───────────────────────────────────────────────────────────

  private updateDisplay(): void {
    if (this.displayEl && !this.isEditing) {
      this.displayEl.textContent = this.countInRemaining > 0
        ? String(this.countInRemaining)
        : formatDuration(this.currentSeconds);
    }
    this.updateTitle();
    this.updateBarProgress();
    this.updateEditAffordance();
  }

  /** Show the status (phase, "Done", etc.) in the panel title bar, falling back
   *  to "Timer" when there's nothing to say. */
  private updateTitle(): void {
    const title = this.computeStatus() || DEFAULT_TITLE;
    if (title === this.lastTitle) return;
    this.lastTitle = title;
    if (this.container) emitEvent(this.container, 'feature-title-changed', { title });
  }

  private computeStatus(): string {
    if (this.countInRemaining > 0) return 'Get ready…';
    switch (this.settings.mode) {
      case 'stopwatch':
        return 'Stopwatch';
      case 'simple':
        return this.isDone ? 'Done' : '';
      case 'intervals': {
        if (this.isDone) return 'Done';
        if (this.isRunning || this.hasStarted) {
          const phase = this.currentPhase === 'focus' ? 'Focus' : 'Rest';
          return `${phase} · ${this.currentRound} of ${this.settings.rounds}`;
        }
        return `Focus ${formatDuration(this.settings.focusSeconds)}`
          + ` · Rest ${formatDuration(this.settings.restSeconds)}`
          + ` · ×${this.settings.rounds}`;
      }
    }
  }

  private updateBarProgress(): void {
    if (this.settings.mode === 'simple' && this.barFillEl) {
      const f = this.settings.duration > 0
        ? (this.settings.duration - this.currentSeconds) / this.settings.duration
        : 0;
      this.barFillEl.style.width = `${TimerView.clampFraction(f) * 100}%`;
      return;
    }
    if (this.settings.mode === 'stopwatch' && this.barFillEl) {
      this.barFillEl.style.width = '0%'; // no known end
      return;
    }
    if (this.settings.mode === 'intervals' && this.segFillEls.length) {
      const curIdx = (this.currentRound - 1) * 2 + (this.currentPhase === 'focus' ? 0 : 1);
      const phaseDur = this.currentPhase === 'focus'
        ? this.settings.focusSeconds : this.settings.restSeconds;
      this.segFillEls.forEach((fill, i) => {
        let f = 0;
        if (this.isDone || i < curIdx) {
          f = 1;
        } else if (i === curIdx && this.countInRemaining === 0) {
          f = phaseDur > 0 ? (phaseDur - this.currentSeconds) / phaseDur : 0;
        }
        fill.style.width = `${TimerView.clampFraction(f) * 100}%`;
      });
    }
  }

  private static clampFraction(f: number): number {
    return Math.max(0, Math.min(1, f));
  }

  private updateEditAffordance(): void {
    // Editing only makes sense for the Simple countdown — Intervals/Stopwatch
    // durations come from settings. Hide via `display` (not the `hidden` attr,
    // which the material-icons `display` rule would override and keep visible).
    const editable = this.settings.mode === 'simple'
      && !this.isRunning && this.countInRemaining === 0;
    if (this.editBtn) this.editBtn.style.display = editable ? '' : 'none';
    if (this.displayEl) this.displayEl.classList.toggle('is-editable', editable);
  }

  private updateButtonState(): void {
    if (!this.startPauseBtn) return;
    const icon = this.startPauseBtn.querySelector<HTMLElement>('.material-icons');
    if (icon) icon.textContent = this.isRunning ? 'pause' : 'play_arrow';
    this.startPauseBtn.title = this.isRunning ? 'Pause' : 'Play';
  }

  private persist(): void {
    if (!this.container) return;
    emitEvent(this.container, 'feature-state-changed', { ...this.settings });
  }

  private dispatchTransportChanged(playing: boolean): void {
    if (!this.container) return;
    emitEvent(this.container, 'transport-changed', { playing });
  }

  // ─── Sounds ────────────────────────────────────────────────────────────────────

  private playChime(kind: ChimeKind): void {
    try {
      const ctx = new AudioContext();
      const gain = ctx.createGain();
      gain.connect(ctx.destination);

      let freqs: number[] = [880, 660, 440];
      let step = 0.18, dur = 0.15, peak = 0.35;
      switch (kind) {
        case 'transition': freqs = [660, 880]; step = 0.13; dur = 0.1; break;
        case 'go':         freqs = [880];      dur = 0.18; peak = 0.4; break;
        case 'tick':       freqs = [520];      dur = 0.06; peak = 0.18; break;
        // 'end' uses the defaults (descending three-tone).
      }

      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        osc.connect(gain);
        const t = ctx.currentTime + i * step;
        gain.gain.setValueAtTime(peak, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.start(t);
        osc.stop(t + step + 0.02);
      });

      setTimeout(() => ctx.close(), 800);
    } catch (e) {
      console.warn('Could not play timer sound:', e);
    }
  }

  // ─── Legacy schedule-driven setters (retained for DisplayController) ─────────────

  setDisplayTime(seconds: number): void {
    if (this.isEditing) return;
    this.currentSeconds = seconds;
    this.updateDisplay();
  }

  setDuration(seconds: number): void {
    this.settings.duration = seconds;
  }

  setRunning(running: boolean): void {
    this.isRunning = running;
    this.updateButtonState();
  }

  setTitle(title: string | null): void {
    const t = title || DEFAULT_TITLE;
    this.lastTitle = t;
    if (this.container) emitEvent(this.container, 'feature-title-changed', { title: t });
  }
}
