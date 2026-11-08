// tests/unit/core/screen_wake.test.ts
// The screen is kept on while anything is playing: one lock however many tools are
// running, given back when the last one stops, and asked for again after the browser
// has taken it away because the page was hidden.

import { describe, it, expect } from 'vitest';
import { ScreenWake, WakeLockEnv, WakeSentinel } from '../../../ts/core/screen_wake';

/** A page that grants (or refuses) wake locks and can be hidden and shown. */
function fakePage(opts: { refuse?: boolean } = {}) {
  const state = {
    visible: true,
    requests: 0,
    releases: 0,
    /** Locks currently granted and not yet released by either side. */
    active: [] as Array<{ dropped: () => void }>,
    onVisible: [] as Array<() => void>,
  };
  const env: WakeLockEnv = {
    request: async () => {
      state.requests++;
      if (opts.refuse) throw new Error('NotAllowedError');
      let dropped = () => {};
      const lock = { dropped: () => dropped() };
      const sentinel: WakeSentinel = {
        release: () => {
          state.releases++;
          state.active = state.active.filter((l) => l !== lock);
        },
        onReleased: (callback) => {
          dropped = callback;
        },
      };
      state.active.push(lock);
      return sentinel;
    },
    isVisible: () => state.visible,
    onVisible: (callback) => state.onVisible.push(callback),
  };
  return {
    env,
    state,
    /** The browser hides the page and, as it does, takes every lock away. */
    hide() {
      state.visible = false;
      const taken = state.active;
      state.active = [];
      taken.forEach((l) => l.dropped());
    },
    show() {
      state.visible = true;
      state.onVisible.forEach((cb) => cb());
    },
  };
}

/** Let queued microtasks and resolved promises run. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('ScreenWake', () => {
  it('takes the lock when something starts and gives it back when it stops', async () => {
    const page = fakePage();
    const wake = new ScreenWake(page.env);
    const metronome = {};

    wake.hold(metronome);
    await settle();
    expect(wake.locked).toBe(true);
    expect(page.state.requests).toBe(1);

    wake.release(metronome);
    await settle();
    expect(wake.locked).toBe(false);
    expect(page.state.releases).toBe(1);
    expect(page.state.active).toHaveLength(0);
  });

  it('holds one lock for several tools and keeps it until the last stops', async () => {
    const page = fakePage();
    const wake = new ScreenWake(page.env);
    const metronome = {};
    const timer = {};

    wake.hold(metronome);
    wake.hold(timer);
    wake.hold(metronome); // starting twice is still one holder
    await settle();
    expect(wake.holderCount).toBe(2);
    expect(page.state.requests).toBe(1);

    wake.release(metronome);
    await settle();
    expect(wake.locked).toBe(true);

    wake.release(timer);
    await settle();
    expect(wake.locked).toBe(false);
    expect(page.state.releases).toBe(1);
  });

  it('does not drop and re-take the lock when one thing hands over to the next', async () => {
    // A schedule's interval ends and the next begins in the same turn.
    const page = fakePage();
    const wake = new ScreenWake(page.env);
    const first = {};
    const second = {};
    wake.hold(first);
    await settle();

    wake.release(first);
    wake.hold(second);
    await settle();

    expect(wake.locked).toBe(true);
    expect(page.state.requests).toBe(1);
    expect(page.state.releases).toBe(0);
  });

  it('ignores a release from something that was not playing', async () => {
    const page = fakePage();
    const wake = new ScreenWake(page.env);
    wake.hold({});
    await settle();
    wake.release({});
    await settle();
    expect(wake.locked).toBe(true);
  });

  it('asks again when the page comes back, if something is still playing', async () => {
    const page = fakePage();
    const wake = new ScreenWake(page.env);
    wake.hold({});
    await settle();

    page.hide(); // the browser takes the lock
    expect(wake.locked).toBe(false);

    page.show();
    await settle();
    expect(wake.locked).toBe(true);
    expect(page.state.requests).toBe(2);
  });

  it('does not ask when the page comes back to nothing playing', async () => {
    const page = fakePage();
    const wake = new ScreenWake(page.env);
    const metronome = {};
    wake.hold(metronome);
    await settle();
    page.hide();
    wake.release(metronome);
    await settle();

    page.show();
    await settle();
    expect(wake.locked).toBe(false);
    expect(page.state.requests).toBe(1);
  });

  it('waits for the page to be visible before asking', async () => {
    const page = fakePage();
    page.hide();
    const wake = new ScreenWake(page.env);
    wake.hold({});
    await settle();
    expect(page.state.requests).toBe(0);

    page.show();
    await settle();
    expect(wake.locked).toBe(true);
  });

  it('gives the lock straight back if everything stopped while the browser was deciding', async () => {
    const page = fakePage();
    const wake = new ScreenWake(page.env);
    const metronome = {};
    wake.hold(metronome);
    await Promise.resolve(); // the request has gone out, not yet been answered
    wake.release(metronome);
    await settle();
    expect(wake.locked).toBe(false);
    expect(page.state.active).toHaveLength(0);
  });

  it('carries on without a lock when the browser refuses one', async () => {
    const page = fakePage({ refuse: true });
    const wake = new ScreenWake(page.env);
    const metronome = {};
    wake.hold(metronome);
    await settle();
    expect(wake.locked).toBe(false);
    // …and tries again the next time something starts.
    wake.hold({});
    await settle();
    expect(page.state.requests).toBe(2);
    wake.release(metronome);
    await settle();
    expect(wake.holderCount).toBe(1);
  });
});
