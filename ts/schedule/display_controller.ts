import { Feature } from "../feature";
import { Interval } from "./schedule";
import { TimerView } from "../modules/timer/timer_view";
import { SchedulePlaybackView } from "./schedule_playback_view";

export { Status } from '../core/status';
import { Status } from '../core/status';

export interface IDisplayController {
  setTask(taskName: string, color: string): void;
  setTime(seconds: number): void;
  setTimerDuration(seconds: number): void;
  setStatus(status: Status): void;
  flashOverlay(): void;
  setStart(): void;
  setPause(): void;
  setTotalTime(elapsed: number, total: number): void;
  setUpcoming(intervals: Interval[], isEndVisible: boolean): void;
  renderFeature(feature: Feature): void;
  clearFeature(): void;
  setCurrentCategoryName(categoryName: string): void;
  /** Optional: emit a next-state FeatureSignal for the upcoming interval. */
  renderNextFeature?(feature: Feature | null): void;
  /** Optional: show the current group name and color in the play view. */
  setGroupContext?(name: string, color: string): void;
  /** Optional: set the segmented session bar (one entry per group). */
  setSessionSegments?(segments: { fraction: number; color: string }[]): void;
  /** Optional: show the interval counter (e.g. "3 / 8"). */
  setIntervalCounter?(current: number, total: number): void;
}

export class DisplayController implements IDisplayController {
  diagramEl: HTMLElement;
  controlButtonEl: HTMLElement;

  private playbackView: SchedulePlaybackView | null = null;
  private timerView: TimerView | null = null;

  constructor(
    diagramEl: HTMLElement,
    controlButtonEl: HTMLElement,
  ) {
    this.diagramEl = diagramEl;
    this.controlButtonEl = controlButtonEl;
  }

  setPlaybackView(view: SchedulePlaybackView): void {
    this.playbackView = view;
  }

  setTimerView(view: TimerView): void {
    this.timerView = view;
  }

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

  flashOverlay() {
    const overlay = document.getElementById("overlay");
    if (!overlay) return;
    overlay.classList.remove("hidden");
    overlay.classList.add("visible");
    setTimeout(() => {
      overlay.classList.remove("visible");
      overlay.classList.add("hidden");
    }, 500);
  }

  setTotalTime(elapsed: number, totalDuration: number): void {
    this.playbackView?.setTotalTime(elapsed, totalDuration);
  }

  setUpcoming(upcomingIntervals: Array<Interval>, isEndVisible: boolean): void {
    this.playbackView?.setUpcoming(upcomingIntervals, isEndVisible);
  }

  renderFeature(feature: Feature): void {
    this.clearFeature();

    if (!feature) {
      console.error(
        "[DisplayController.renderFeature] Cannot render null/undefined feature."
      );
      return;
    }

    try {
      feature.render(this.diagramEl);

      feature.views?.forEach((view) => {
        view.render(this.diagramEl);
      });
    } catch (error) {
      console.error(
        `[DisplayController.renderFeature] Error during rendering feature ${feature.typeName}:`,
        error
      );
      this.diagramEl.innerHTML = `<p style="color: red; padding: 10px;">Error rendering feature: ${feature.typeName}</p>`;
    }
  }

  clearFeature(): void {
    this.clearAllChildren(this.diagramEl);
  }

  formattedTime(totalSeconds: number): string {
    if (isNaN(totalSeconds) || totalSeconds < 0) return "0:00";
    const tsf = Math.floor(totalSeconds);
    const s = (tsf % 60).toString().padStart(2, "0");
    const tm = Math.floor(tsf / 60);
    return `${tm}:${s}`;
  }

  clearAllChildren(element: HTMLElement): void {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  setStart(): void {
    this.controlButtonEl.innerText = "START";
    this.controlButtonEl.classList.remove("is-warning");
    this.controlButtonEl.classList.add("is-success");
  }

  setPause(): void {
    this.controlButtonEl.innerText = "PAUSE";
    this.controlButtonEl.classList.remove("is-success");
    this.controlButtonEl.classList.add("is-warning");
  }

  setCurrentCategoryName(_categoryName: string): void {}

  setGroupContext(name: string, color: string): void {
    this.playbackView?.setGroupContext(name, color);
  }

  setSessionSegments(segments: { fraction: number; color: string }[]): void {
    this.playbackView?.setSessionSegments(segments);
  }

  setIntervalCounter(current: number, total: number): void {
    this.playbackView?.setIntervalCounter(current, total);
  }
}
