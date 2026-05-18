import { Feature } from '../feature';
import { Interval } from './schedule';
import { IDisplayController, Status } from '../display_controller';
import { TimerView } from '../views/timer_view';
import { SchedulePlaybackView } from '../views/schedule_playback_view';
import { SignalKind, FeatureSignal } from '../panels/link_types';

/**
 * An IDisplayController implementation for the Schedule floating view.
 * Instead of rendering features into a static #diagram element, it:
 *   - Updates an embedded TimerView and SchedulePlaybackView
 *   - Dispatches 'schedule-feature-changed' DOM events so the LinkManager
 *     can route FeatureSignals to connected AnyFloatingView instances
 */
export class ScheduleDisplayAdapter implements IDisplayController {
  private timerView: TimerView | null = null;
  private playbackView: SchedulePlaybackView | null = null;
  private signalSourceEl: HTMLElement | null = null;
  private currentCategoryName: string = '';

  private onStartCb: (() => void) | null = null;
  private onPauseCb: (() => void) | null = null;
  private onFlashCb: (() => void) | null = null;

  setTimerView(view: TimerView): void { this.timerView = view; }
  setPlaybackView(view: SchedulePlaybackView): void { this.playbackView = view; }
  setSignalSourceElement(el: HTMLElement): void { this.signalSourceEl = el; }

  setOnStart(cb: () => void): void { this.onStartCb = cb; }
  setOnPause(cb: () => void): void { this.onPauseCb = cb; }
  setOnFlash(cb: () => void): void { this.onFlashCb = cb; }

  // ─── IDisplayController ────────────────────────────────────────────────────

  setTask(taskName: string, _color: string): void {
    this.timerView?.setTitle(taskName || null);
  }

  setTime(seconds: number): void {
    this.timerView?.setDisplayTime(seconds);
  }

  setTimerDuration(seconds: number): void {
    this.timerView?.setDuration(seconds);
  }

  setStatus(status: Status): void {
    this.timerView?.setRunning(status === Status.Play);
  }

  flashOverlay(): void {
    this.onFlashCb?.();
  }

  setStart(): void {
    this.onStartCb?.();
  }

  setPause(): void {
    this.onPauseCb?.();
  }

  setTotalTime(elapsed: number, total: number): void {
    this.playbackView?.setTotalTime(elapsed, total);
  }

  setUpcoming(intervals: Interval[], isEndVisible: boolean): void {
    this.playbackView?.setUpcoming(intervals, isEndVisible);
  }

  setCurrentCategoryName(categoryName: string): void {
    this.currentCategoryName = categoryName;
  }

  renderFeature(feature: Feature): void {
    const signal: FeatureSignal = {
      kind: SignalKind.Feature,
      categoryName: this.currentCategoryName,
      featureTypeName: feature.typeName,
      config: [...feature.config],
    };
    this._dispatchFeatureSignal(signal);
  }

  clearFeature(): void {
    const signal: FeatureSignal = {
      kind: SignalKind.Feature,
      categoryName: this.currentCategoryName,
      featureTypeName: null,
      config: [],
    };
    this._dispatchFeatureSignal(signal);
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private _dispatchFeatureSignal(signal: FeatureSignal): void {
    if (!this.signalSourceEl) return;
    this.signalSourceEl.dispatchEvent(new CustomEvent('schedule-feature-changed', {
      bubbles: true,
      detail: signal,
    }));
  }
}
