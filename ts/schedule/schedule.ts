import { Feature } from "../feature";
import { AudioController } from "../audio_controller";
import { IDisplayController, Status } from "../display_controller";

// Colors for tasks in intervals.
const intervalColors = [
  '#e7cba9',
  '#aad9cd',
  '#e8d595',
  '#8da47e',
  '#e9bbb5',
];

// An instance of a schedule.
export class Schedule {
  intervals: Array<Interval>;
  currentIntervalIndex: number;
  accumulatedSeconds: number;
  totalDuration: number;
  display: IDisplayController;
  audio: AudioController;
  color_index: number;
  name: string = '';

  constructor(display: IDisplayController,
    audio: AudioController) {
    this.display = display;
    this.audio = audio;
    this.intervals = [];
    this.currentIntervalIndex = 0;
    this.accumulatedSeconds = 0;
    this.totalDuration = 0;
    this.color_index = 0;
  }

  addInterval(interval: Interval): void {
    interval.setCallbacks(
      this.onIntroEnd.bind(this),
      this.onTimerUpdate.bind(this),
      this.onIntervalEnd.bind(this));
    interval.setColor(intervalColors[this.color_index]);
    this.color_index = (this.color_index + 1) % intervalColors.length;
    this.totalDuration += interval.getTotalDuration();
    this.intervals.push(interval);
  }

  isFinished(): boolean {
    return this.currentIntervalIndex >= this.intervals.length;
  }

  isRunning(): boolean {
    // Check if the current interval exists and its timer is running
    return this.getCurrentInterval()?.isTimerRunning() ?? false;
  }

  getCurrentInterval(): Interval | null { // Return type can be null
    return this.isFinished() ?
      null : this.intervals[this.currentIntervalIndex];
  }

  onTimerUpdate(time: number): void {
    this.display.setTime(time);
    this.setTotalTime();
    // Only increment accumulated seconds if the timer is actually running
    // This prevents accumulation during pauses or skips.
    // We might need a more robust way if skipping should contribute time.
    if (this.isRunning()) {
        this.accumulatedSeconds++;
    }
  }

  onIntroEnd(): void {
    this.audio.playIntroEnd();
    this.setDisplayTask(this.getCurrentInterval());
    this.display.flashOverlay();
  }

  onIntervalEnd(): void {
    const endedInterval = this.getCurrentInterval(); // Get interval that just finished

    // Stop the feature and its views for the interval that just ended
    endedInterval?.stopFeatureAndViews();
    endedInterval?.destroyFeatureAndViews(); // Clean up ended interval views/feature

    this.currentIntervalIndex += 1;
    this.audio.playIntervalEnd();
    this.display.flashOverlay();

    if (!this.isFinished()) {
      const nextInterval = this.getCurrentInterval();
      this.setDisplayTask(nextInterval); // Prepare display for the next interval
      this.display.setTimerDuration(nextInterval.getTotalDuration());
      this.updateUpcoming();
      nextInterval.start(); // Start the next interval timer AND its features/views
    } else {
      this.setDisplayFinished();
      // No need to stop/destroy here, already done for the last interval
    }
  }

  setTotalTime(): void {
    this.display.setTotalTime(this.accumulatedSeconds, this.totalDuration);
  }


  setDisplayTask(interval: Interval): void {
    const suffix = interval.isIntroActive() ? " (Warmup)" : "";
    const title = this.name ? `${this.name}: ${interval.task}${suffix}` : interval.task + suffix;
    this.display.setTask(title, interval.color);
    this.display.setCurrentCategoryName(interval.categoryName);

    if (interval.feature) {
      // Render feature (which includes its views via DisplayController)
      this.display.renderFeature(interval.feature);
    } else {
      this.display.clearFeature();
    }

    // Emit a next-state signal for the upcoming interval so linked views can preview it.
    const nextInterval = this.intervals[this.currentIntervalIndex + 1] ?? null;
    this.display.renderNextFeature?.(nextInterval?.feature ?? null);
  }

  setDisplayFinished(): void {
    this.display.setTask('DONE!', '');
    this.display.setStatus(Status.Stop);
    this.display.setStart();
  }

  updateUpcoming(): void {
    if (this.isFinished()) {
      this.display.setUpcoming([], true); // Pass true for isEndVisible when finished
      return;
    }
    const upcomingTasks = [];
    // Change +3 to +6 to potentially include the next 5 intervals
    const maxSize = Math.min(
      this.currentIntervalIndex + 6, // Look ahead up to 5 intervals (current + 1 to current + 5)
      this.intervals.length
    );
    for (var i = this.currentIntervalIndex + 1; i < maxSize; i++) {
      upcomingTasks.push(this.intervals[i]);
    }
    // Determine if the loop reached the actual end of the schedule
    const isEndVisible = (maxSize === this.intervals.length);
    this.display.setUpcoming(upcomingTasks, isEndVisible); // Pass the flag
  }

  start(): void {
    const interval = this.getCurrentInterval();
    if (!interval || this.isFinished()) {
      return;
    }
    if (interval.isTimerRunning()) {
      return; // Avoid double start
    }

    this.display.setPause(); // Set button to PAUSE state
    this.display.setStatus(Status.Play);
    interval.start(); // This now also starts feature/views
  }

  // Prepare display for the first interval (or current if paused)
  prepare(): void {
    const interval = this.getCurrentInterval();
    if (!interval) {
      this.setDisplayFinished(); // Or some initial state
      return;
    }
    this.display.setTime(interval.getCurrentTimeRemaining());
    this.display.setTimerDuration(interval.getTotalDuration());
    this.setDisplayTask(interval); // Renders feature/views via DisplayController
    this.setTotalTime();
    this.updateUpcoming();
    this.display.setStart(); // Ensure button shows START initially or after pause
    this.display.setStatus(Status.Pause); // Show pause icon initially
  }

  /** Updates the current interval's remaining time (called when user edits the timer). */
  setCurrentIntervalTime(seconds: number): void {
    const interval = this.getCurrentInterval();
    if (!interval) return;
    const clamped = Math.max(0, Math.floor(seconds));
    if (interval.isIntroActive()) {
      interval.timer.introTimeRemaining = clamped;
    } else {
      interval.timer.timeRemaining = clamped;
    }
    this.display.setTime(clamped);
  }

  // Pause the current interval
  pause(): void {
    const interval = this.getCurrentInterval();
    if (!interval || this.isFinished() || !interval.isTimerRunning()) {
      return;
    }
    this.display.setStart(); // Set button to START state
    this.display.setStatus(Status.Pause);
    interval.pause();
  }

  // Skip the current interval
  skip(): void {
    if (this.isFinished()) {
        console.warn("Cannot skip: Schedule is already finished.");
        return;
    }

    const currentInterval = this.getCurrentInterval();
    if (!currentInterval) {
        console.error("Cannot skip: Failed to get current interval.");
        return; // Should not happen if not finished, but safety check
    }

    // Stop the timer and feature/views of the current interval
    currentInterval.pause(); // Ensure timer is stopped
    currentInterval.stopFeatureAndViews();
    currentInterval.destroyFeatureAndViews();

    // Advance to the next interval
    this.currentIntervalIndex += 1;

    // Play sound and flash overlay like interval end
    this.audio.playIntervalEnd();
    this.display.flashOverlay();

    // Check if the schedule finished after skipping
    if (this.isFinished()) {
        this.setDisplayFinished();
        // Update accumulated time here? Or leave as is?
        // For simplicity, skip doesn't add the remaining time to accumulated.
        this.setTotalTime();
        this.updateUpcoming();
    } else {
        // Prepare and start the next interval
        const nextInterval = this.getCurrentInterval();
        this.setDisplayTask(nextInterval); // Set display for the new interval
        this.updateUpcoming();

        // Start the next interval and update UI controls
        nextInterval.start();
        this.display.setPause(); // Set button to PAUSE state
        this.display.setStatus(Status.Play); // Set status to Play

        // Set timer display to the *start* of the new interval
        this.display.setTime(nextInterval.getCurrentTimeRemaining());
        this.display.setTimerDuration(nextInterval.getTotalDuration());
        this.setTotalTime(); // Update total time display
    }
}
}

// An interval in a schedule.
export class Interval {
  duration: number;
  introDuration: number;
  task: string;
  color: string = '';
  feature: Feature | null;
  categoryName: string;
  timer: IntervalTimer;
  introFinishedCallback: Function | null = null;
  updateCallback: Function | null = null;
  finishedCallback: Function | null = null;

  constructor(duration: number, introDuration: number, task: string, feature: Feature | null = null, categoryName: string = '') {
    this.duration = duration;
    this.introDuration = introDuration;
    this.task = task;
    this.feature = feature;
    this.categoryName = categoryName;
    this.timer = new IntervalTimer(duration, introDuration);
  }

  setColor(color: string) {
    this.color = color;
  }

  setCallbacks(introFinishedCallback: Function, updateCallback: Function, finishedCallback: Function) {
    this.introFinishedCallback = introFinishedCallback;
    this.updateCallback = updateCallback;
    this.finishedCallback = finishedCallback;
    // Pass callbacks to timer
    this.timer.setCallbacks(
      () => this.introFinishedCallback?.(),
      (time: number) => this.updateCallback?.(time),
      () => this.finishedCallback?.()
    );
  }

  isIntroActive(): boolean {
    return !this.timer.isIntroFinished;
  }

  isTimerRunning(): boolean {
    return this.timer.isRunning();
  }

  getTotalDuration(): number {
    return this.duration + this.introDuration;
  }

  getCurrentTimeRemaining(): number {
    if (this.isIntroActive()) {
      return this.timer.introTimeRemaining;
    }
    return this.timer.timeRemaining;
  }

  start(): void {
    if (this.timer.isRunning()) return; // Prevent double start
    this.timer.countdown();
    this.feature?.prepare?.(); // Prepare feature before starting
    this.feature?.start?.();
  }

  pause(): void {
    if (!this.timer.isRunning()) return; // Can't pause if not running
    this.timer.pause();
    this.feature?.stop?.();
  }

  stopFeatureAndViews(): void {
    this.timer.pause(); // Ensure timer is paused when stopping features
    this.feature?.stop?.();
  }
  destroyFeatureAndViews(): void {
    this.feature?.destroy?.();
  }
}

class IntervalTimer {
  timeRemaining: number;
  introTimeRemaining: number;
  isIntroFinished: boolean;
  introFinishedCallback!: Function;
  updateCallback!: Function;
  finishedCallback!: Function;
  private countdownTimerId: number | null = null;

  constructor(time: number,
    introductionTime: number) {
    this.timeRemaining = time;
    this.introTimeRemaining = introductionTime;
    this.isIntroFinished = introductionTime == 0 ? true : false;
  }

  isRunning(): boolean {
    return this.countdownTimerId !== null;
  }

  setCallbacks(introFinishedCallback: Function,
    updateCallback: Function,
    finishedCallback: Function) {
    this.introFinishedCallback = introFinishedCallback;
    this.updateCallback = updateCallback;
    this.finishedCallback = finishedCallback;
  }

  countdown(): void {
    if (this.countdownTimerId !== null) return; // Already running

    const tick = () => {
        if (this.countdownTimerId === null) return; // Stop if paused externally

      if (this.introTimeRemaining > 0) {
        this.introTimeRemaining -= 1;
        this.updateCallback?.(this.introTimeRemaining);
        this.countdownTimerId = window.setTimeout(tick, 1000);
      } else {
        if (!this.isIntroFinished) {
          this.isIntroFinished = true;
          this.introFinishedCallback?.();
          // Update timer display immediately after intro finishes
          this.updateCallback?.(this.timeRemaining);
        }

        if (this.timeRemaining > 0) {
          this.timeRemaining -= 1;
          this.updateCallback?.(this.timeRemaining);
          this.countdownTimerId = window.setTimeout(tick, 1000);
        } else {
          // Timer finished
          this.countdownTimerId = null; // Mark as stopped *before* callback
          this.finishedCallback?.();
        }
      }
    };

    // Start the first tick
    if (this.introTimeRemaining > 0 || this.timeRemaining > 0) {
      this.countdownTimerId = window.setTimeout(tick, 1000); // Initial start with timeout
    } else {
      this.finishedCallback?.(); // Call immediately if zero duration
    }
  }

  pause(): void {
    if (this.countdownTimerId !== null) {
      window.clearTimeout(this.countdownTimerId);
      this.countdownTimerId = null;
    }
  }
}