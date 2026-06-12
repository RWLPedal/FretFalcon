import { View } from './view';
import { onEvent, AppEventMap } from './events';

/**
 * Abstract base class providing lifecycle scaffolding for View implementations.
 *
 * Subclasses must implement render(). start(), stop(), and destroy() have
 * sensible defaults; override destroy() for resource cleanup, calling super.destroy().
 *
 * Use the protected helpers to register event listeners and timers — all are
 * automatically torn down when destroy() runs.
 */
export abstract class BaseView implements View {
  protected container: HTMLElement | null = null;

  private _cleanups: (() => void)[] = [];

  abstract render(container: HTMLElement): void;

  start(): void {}
  stop(): void {}

  destroy(): void {
    for (const fn of this._cleanups) fn();
    this._cleanups = [];
    this.container = null;
  }

  /** Register an event listener that is automatically removed on destroy(). */
  protected listen(
    target: EventTarget,
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void {
    target.addEventListener(type, handler, options);
    this._cleanups.push(() => target.removeEventListener(type, handler, options));
  }

  /** Create a setInterval that is automatically cleared on destroy(). Returns the id. */
  protected registerInterval(fn: () => void, ms: number): number {
    const id = window.setInterval(fn, ms);
    this._cleanups.push(() => clearInterval(id));
    return id;
  }

  /** Create a setTimeout that is automatically cleared on destroy(). Returns the id. */
  protected registerTimeout(fn: () => void, ms: number): number {
    const id = window.setTimeout(fn, ms);
    this._cleanups.push(() => clearTimeout(id));
    return id;
  }

  /** Escape hatch: register an arbitrary cleanup function to run on destroy(). */
  protected addCleanup(fn: () => void): void {
    this._cleanups.push(fn);
  }

  /**
   * Register a typed AppEvent listener that is automatically removed on destroy().
   * Prefer this over `listen()` for events defined in AppEventMap.
   */
  protected listenEvent<K extends keyof AppEventMap>(
    target: EventTarget,
    type: K,
    fn: (detail: AppEventMap[K]) => void
  ): void {
    this._cleanups.push(onEvent(target, type, fn));
  }
}
