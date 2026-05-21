import { Feature } from "./feature";
import { Interval } from "./schedule/schedule";
import { TimerView } from "./views/timer_view";
import { SchedulePlaybackView } from "./views/schedule_playback_view";

export enum Status {
  Play = "Play",
  Pause = "Pause",
  Stop = "Stop",
}

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

  renderFeature(
    feature: Feature,
    handedness: "left" | "right" = "right"
  ): void {
    console.log(
      `[DisplayController.renderFeature] Attempting to render feature: ${
        feature?.typeName || "UNKNOWN"
      }`
    );
    this.clearFeature();

    if (!feature) {
      console.error(
        "[DisplayController.renderFeature] Cannot render null/undefined feature."
      );
      return;
    }

    try {
      feature.render(this.diagramEl);
      console.log(
        `[DisplayController.renderFeature] Successfully called feature.render() for ${feature.typeName}`
      );

      feature.views?.forEach((view) => {
        console.log(
          `[DisplayController.renderFeature]   Rendering view: ${view.constructor.name}`
        );
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
}
