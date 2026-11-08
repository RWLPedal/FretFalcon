// ts/core/screen_wake.ts
// Keeps the screen on while something is playing. A phone on a music stand dims and
// locks after half a minute without a touch — in the middle of a metronome run.
//
// Anything that plays calls holdScreenAwake(owner) when it starts and
// releaseScreenAwake(owner) when it stops or is destroyed. The screen is kept on
// while at least one owner is playing, and handed back the moment the last one stops.
//
// The browser drops the lock whenever the page is hidden (another tab, the phone
// locked by hand), and never gives it back by itself, so it is asked for again when
// the page returns. A browser without the Wake Lock API, or one that refuses (low
// battery), simply behaves as it always did.

/** The lock, once granted. */
export interface WakeSentinel {
  release(): Promise<void> | void;
  /** Called when the browser takes the lock away on its own. */
  onReleased(callback: () => void): void;
}

/** What ScreenWake needs from the page. Separate so it can be tested without one. */
export interface WakeLockEnv {
  /** Ask for the lock. Rejects when the browser refuses. */
  request(): Promise<WakeSentinel>;
  isVisible(): boolean;
  /** Called every time the page becomes visible again. */
  onVisible(callback: () => void): void;
}

export class ScreenWake {
  private readonly holders = new Set<object>();
  private sentinel: WakeSentinel | null = null;
  private requesting = false;
  private syncQueued = false;

  constructor(private readonly env: WakeLockEnv) {
    env.onVisible(() => this.apply());
  }

  /** `owner` is playing. Safe to call again while it still is. */
  hold(owner: object): void {
    this.holders.add(owner);
    this.sync();
  }

  /** `owner` has stopped. Safe to call when it never held. */
  release(owner: object): void {
    if (this.holders.delete(owner)) this.sync();
  }

  /** How many owners are playing. */
  get holderCount(): number {
    return this.holders.size;
  }

  /** True while the browser has actually granted the lock. */
  get locked(): boolean {
    return this.sentinel !== null;
  }

  // Not straight away: a schedule moving to its next interval stops one timer and
  // starts the next in the same turn, and the lock should not be dropped and
  // re-requested for that.
  private sync(): void {
    if (this.syncQueued) return;
    this.syncQueued = true;
    queueMicrotask(() => {
      this.syncQueued = false;
      this.apply();
    });
  }

  private apply(): void {
    const wanted = this.holders.size > 0 && this.env.isVisible();
    if (wanted && !this.sentinel && !this.requesting) {
      this.requesting = true;
      this.env.request().then(
        (sentinel) => {
          this.requesting = false;
          this.sentinel = sentinel;
          sentinel.onReleased(() => {
            if (this.sentinel === sentinel) this.sentinel = null;
          });
          this.apply(); // everything may have stopped while the browser was deciding
        },
        () => {
          this.requesting = false; // refused: carry on without it
        },
      );
    } else if (!wanted && this.sentinel) {
      const sentinel = this.sentinel;
      this.sentinel = null;
      void sentinel.release();
    }
  }
}

function browserEnv(): WakeLockEnv | null {
  if (typeof navigator === 'undefined' || typeof document === 'undefined') return null;
  const wakeLock = navigator.wakeLock;
  if (!wakeLock) return null;
  return {
    request: async () => {
      const lock = await wakeLock.request('screen');
      return {
        release: () => lock.release(),
        onReleased: (callback) => lock.addEventListener('release', callback),
      };
    },
    isVisible: () => document.visibilityState === 'visible',
    onVisible: (callback) =>
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') callback();
      }),
  };
}

let shared: ScreenWake | null | undefined;

function sharedScreenWake(): ScreenWake | null {
  if (shared === undefined) {
    const env = browserEnv();
    shared = env ? new ScreenWake(env) : null;
  }
  return shared;
}

/** Keep the screen on for as long as `owner` is playing. */
export function holdScreenAwake(owner: object): void {
  sharedScreenWake()?.hold(owner);
}

/** `owner` has stopped playing (or is being destroyed). */
export function releaseScreenAwake(owner: object): void {
  sharedScreenWake()?.release(owner);
}
