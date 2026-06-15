// tests/unit/panels/capo_link.test.ts
// Verifies the Capo LinkType is wired so a Capo source can link to capo-accepting
// fretboard targets, and that targets without a Capo slot reject it.

import { describe, it, expect, vi, beforeAll } from 'vitest';

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
  emitEvent: vi.fn(),
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

const CAPO_SRC = 'test_capo_src' as ViewId;
const CAPO_TGT = 'test_capo_tgt' as ViewId;       // a capo-accepting fretboard panel
const CHORD_SRC = 'test_capo_chord_src' as ViewId; // emits Chord only
const PLAIN_TGT = 'test_capo_plain_tgt' as ViewId; // no Capo slot (like nearby triads)

beforeAll(() => {
  registerDriveSource({ viewId: CAPO_SRC, emittedKinds: [SignalKind.Capo], extractSignals: () => [] });
  registerDriveSource({ viewId: CHORD_SRC, emittedKinds: [SignalKind.Chord], extractSignals: () => [] });
  registerDriveTarget({
    featureTypeName: 'TestCapoTarget',
    viewId: CAPO_TGT,
    argName: 'Capo',
    label: 'Capo',
    acceptedKinds: [SignalKind.Capo],
    resolveValue: () => null,
  });
  registerDriveTarget({
    featureTypeName: 'TestCapoPlainTarget',
    viewId: PLAIN_TGT,
    argName: 'key',
    label: 'Key',
    acceptedKinds: [SignalKind.Key],
    resolveValue: () => null,
  });
});

function makeManager(): LinkManager {
  const viewIds: Record<string, ViewId> = {
    'capo-src': CAPO_SRC,
    'capo-tgt': CAPO_TGT,
    'chord-src': CHORD_SRC,
    'plain-tgt': PLAIN_TGT,
  };
  return new LinkManager(
    {} as HTMLElement,
    () => null,
    (id) => viewIds[id] ?? null,
    () => ({}) as HTMLElement,
    null,
    () => undefined,
  );
}

describe('Capo LinkType — canLink', () => {
  it('a Capo source can link to a capo-accepting target', () => {
    expect(makeManager().canLink('capo-src', 'capo-tgt')).toBe(true);
  });

  it('a Chord-only source cannot link to a capo-only target', () => {
    expect(makeManager().canLink('chord-src', 'capo-tgt')).toBe(false);
  });

  it('a Capo source cannot link to a target without a Capo slot', () => {
    expect(makeManager().canLink('capo-src', 'plain-tgt')).toBe(false);
  });
});

describe('Capo LinkType — link-status incomingKinds', () => {
  it('reports only Capo (not Key/Chord) so a capo link does not auto-drive other fields', () => {
    const sink = { receiveSignals: vi.fn(), setLinkStatus: vi.fn() };
    const viewIds: Record<string, ViewId> = { 'capo-src': CAPO_SRC, 'capo-tgt': CAPO_TGT };
    const lm = new LinkManager(
      {} as HTMLElement,
      () => null,
      (id) => viewIds[id] ?? null,
      () => ({}) as HTMLElement,
      null,
      (id) => (id === 'capo-tgt' ? sink : undefined),
    );

    lm.createLink('capo-src', 'right', 'capo-tgt', 'left');

    const lastCall = sink.setLinkStatus.mock.calls.at(-1)?.[0];
    expect(lastCall?.hasIncomingLinks).toBe(true);
    expect(lastCall?.incomingKinds).toEqual([SignalKind.Capo]);
  });
});
