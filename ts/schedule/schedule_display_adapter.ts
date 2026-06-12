import { Feature } from '../feature';
import { Interval } from './schedule';
import { IDisplayController, Status } from './display_controller';
import { SchedulePlaybackView } from './schedule_playback_view';
import { SignalKind, SignalState, FeatureSignal } from '../panels/link_types';
import { emitEvent } from '../core/events';

/**
 * An IDisplayController implementation for the Schedule floating view.
 * Instead of rendering features into a static #diagram element, it:
 *   - Updates an embedded SchedulePlaybackView (timer display, task name, session bar, etc.)
 *   - Dispatches 'schedule-feature-changed' DOM events so the LinkManager
 *     can route FeatureSignals to connected AnyFloatingView instances
 */
export class ScheduleDisplayAdapter implements IDisplayController {
  private playbackView: SchedulePlaybackView | null = null;
  private signalSourceEl: HTMLElement | null = null;
  private currentCategoryName: string = '';

  private onStartCb: (() => void) | null = null;
  private onPauseCb: (() => void) | null = null;
  private onFlashCb: (() => void) | null = null;

  setPlaybackView(view: SchedulePlaybackView): void { this.playbackView = view; }
  setSignalSourceElement(el: HTMLElement): void { this.signalSourceEl = el; }

  setOnStart(cb: () => void): void { this.onStartCb = cb; }
  setOnPause(cb: () => void): void { this.onPauseCb = cb; }
  setOnFlash(cb: () => void): void { this.onFlashCb = cb; }

  // ─── IDisplayController ────────────────────────────────────────────────────

  setTask(taskName: string, _color: string): void {
    this.playbackView?.setCurrentTask(taskName || '');
  }

  setTime(seconds: number): void {
    this.playbackView?.setCurrentTime(seconds);
  }

  setTimerDuration(seconds: number): void {
    this.playbackView?.setIntervalDuration(seconds);
  }

  setStatus(status: Status): void {
    this.playbackView?.setPauseState(status === Status.Play);
  }

  flashOverlay(): void {
    this.onFlashCb?.();
  }

  setStart(): void {
    this.onStartCb?.();
    this.playbackView?.setPauseState(false);
  }

  setPause(): void {
    this.onPauseCb?.();
    this.playbackView?.setPauseState(true);
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

  setGroupContext(name: string, color: string): void {
    this.playbackView?.setGroupContext(name, color);
  }

  setSessionSegments(segments: { fraction: number; color: string }[]): void {
    this.playbackView?.setSessionSegments(segments);
  }

  setIntervalCounter(current: number, total: number): void {
    this.playbackView?.setIntervalCounter(current, total);
  }

  renderFeature(feature: Feature): void {
    this.playbackView?.setCurrentFeature(feature.typeName);
    const signal: FeatureSignal = {
      kind: SignalKind.Feature,
      categoryName: this.currentCategoryName,
      featureTypeName: feature.typeName,
      config: [...feature.config],
    };
    this._dispatchFeatureSignal(signal);
  }

  clearFeature(): void {
    this.playbackView?.setCurrentFeature(null);
    const signal: FeatureSignal = {
      kind: SignalKind.Feature,
      categoryName: this.currentCategoryName,
      featureTypeName: null,
      config: [],
    };
    this._dispatchFeatureSignal(signal);
  }

  renderNextFeature(feature: Feature | null): void {
    const signal: FeatureSignal = {
      kind: SignalKind.Feature,
      state: SignalState.Next,
      categoryName: this.currentCategoryName,
      featureTypeName: feature?.typeName ?? null,
      config: feature ? [...feature.config] : [],
    };
    this._dispatchFeatureSignal(signal);
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private _dispatchFeatureSignal(signal: FeatureSignal): void {
    if (!this.signalSourceEl) return;
    emitEvent(this.signalSourceEl, 'schedule-feature-changed', signal);
  }
}
