// tests/unit/panels/strum_drone_link.test.ts
// Regression: the DOM `link-status-changed` event must carry `incomingKinds`.
// A Drone target uses it to arm for strum articulation *before* any Play/Strum
// signal arrives — otherwise the Play signal (dispatched synchronously when the
// strum starts) makes it begin a sustained tone, then the later strum ticks pluck
// on top of it (the "drone *and* strum" bug).

import { describe, it, expect, vi, beforeAll } from 'vitest';

const { emitEvent } = vi.hoisted(() => ({ emitEvent: vi.fn() }));

vi.mock('../../../ts/panels/link_overlay', () => ({
  LinkOverlay: vi.fn().mockImplementation(() => ({
    onLinkCreated: null,
    onLinkDeleted: null,
    registerWrapper: vi.fn(),
    unregisterWrapper: vi.fn(),
    redrawAll: vi.fn(),
    destroy: vi.fn(),
  })),
}));

vi.mock('../../../ts/core/events', () => ({
  onEvent: vi.fn().mockReturnValue(() => {}),
  emitEvent,
}));

(globalThis as any).MutationObserver = class {
  observe() {}
  disconnect() {}
};
(globalThis as any).requestAnimationFrame = vi.fn();

import { LinkManager } from '../../../ts/panels/link_manager';
import { registerDriveSource, registerDriveTarget } from '../../../ts/panels/drive_registry';
import { SignalKind } from '../../../ts/panels/link_types';
import type { ViewId } from '../../../ts/core/ids';

const STRUM_SRC = 'test_strum_src' as ViewId;
const DRONE_TGT = 'test_drone_tgt' as ViewId;

beforeAll(() => {
  // Mirrors the real Strum source: it emits Strum (plus Groove/Play) over one link.
  registerDriveSource({
    viewId: STRUM_SRC,
    emittedKinds: [SignalKind.Groove, SignalKind.Strum, SignalKind.Play],
    extractSignals: () => [],
  });
  registerDriveTarget({
    featureTypeName: 'TestDroneTarget',
    viewId: DRONE_TGT,
    argName: 'Strum',
    label: 'Strum',
    acceptedKinds: [SignalKind.Strum],
    resolveValue: () => null,
  });
});

describe('Strum → Drone link-status', () => {
  it('DOM link-status-changed carries incomingKinds including Strum (no sink)', () => {
    emitEvent.mockClear();
    const viewIds: Record<string, ViewId> = { 'strum-src': STRUM_SRC, 'drone-tgt': DRONE_TGT };
    const lm = new LinkManager(
      {} as HTMLElement,
      () => null,
      (id) => viewIds[id] ?? null,
      () => ({}) as HTMLElement, // getContentEl returns a non-null el → DOM-event path
      null,
      () => undefined,            // no sink → routes through emitEvent
    );

    lm.createLink('strum-src', 'bottom', 'drone-tgt', 'top');

    const statusCall = emitEvent.mock.calls.find((c) => c[1] === 'link-status-changed');
    expect(statusCall).toBeDefined();
    expect(statusCall?.[2].hasIncomingLinks).toBe(true);
    expect(statusCall?.[2].incomingKinds).toContain(SignalKind.Strum);
  });
});
