// tests/unit/panels/link_manager.test.ts
// Unit tests for LinkManager link-management methods.
// DOM-dependent modules (LinkOverlay, events) are mocked so these run in Node.

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

// Stub browser globals absent in Node
(globalThis as any).MutationObserver = class {
  observe() {}
  disconnect() {}
};
(globalThis as any).requestAnimationFrame = vi.fn();

import { LinkManager } from '../../../ts/panels/link_manager';
import { registerDriveSource, registerDriveTarget } from '../../../ts/panels/drive_registry';
import { SignalKind } from '../../../ts/panels/link_types';
import type { ViewId } from '../../../ts/core/ids';
import type { LinkRecord } from '../../../ts/panels/link_types';

// Test-only view IDs — unique prefix avoids collisions with other test files.
const SRC_VIEW = 'test_lm_src' as ViewId;
const TGT_VIEW = 'test_lm_tgt' as ViewId;
const INCOMPAT_VIEW = 'test_lm_incompat' as ViewId;

beforeAll(() => {
  registerDriveSource({
    viewId: SRC_VIEW,
    emittedKinds: [SignalKind.Key],
    extractSignals: () => [],
  });
  registerDriveTarget({
    featureTypeName: 'TestLmTarget',
    viewId: TGT_VIEW,
    argName: 'key',
    label: 'Key',
    acceptedKinds: [SignalKind.Key],
    resolveValue: () => null,
  });
  // INCOMPAT_VIEW emits Chord only — incompatible with the Key-accepting target.
  registerDriveSource({
    viewId: INCOMPAT_VIEW,
    emittedKinds: [SignalKind.Chord],
    extractSignals: () => [],
  });
});

function makeManager(
  extraContentEls: Record<string, HTMLElement | null> = {},
): LinkManager {
  const viewIds: Record<string, ViewId> = {
    'fv-1': SRC_VIEW,
    'fv-2': TGT_VIEW,
    'fv-3': INCOMPAT_VIEW,
  };
  const contentEls: Record<string, HTMLElement | null> = {
    'fv-1': {} as HTMLElement,
    'fv-2': {} as HTMLElement,
    'fv-3': {} as HTMLElement,
    ...extraContentEls,
  };
  return new LinkManager(
    {} as HTMLElement,
    () => null,
    id => viewIds[id] ?? null,
    id => contentEls[id] ?? null,
    null,
    () => undefined,
  );
}

// ─── Link management ──────────────────────────────────────────────────────────

describe('LinkManager — link management', () => {
  it('hasLink returns false before any link is created', () => {
    const lm = makeManager();
    expect(lm.hasLink('fv-1', 'fv-2')).toBe(false);
  });

  it('createLink / hasLink / removeLinkBetween round-trip', () => {
    const lm = makeManager();
    lm.createLink('fv-1', 'right', 'fv-2', 'left');
    expect(lm.hasLink('fv-1', 'fv-2')).toBe(true);
    lm.removeLinkBetween('fv-1', 'fv-2');
    expect(lm.hasLink('fv-1', 'fv-2')).toBe(false);
  });

  it('createLink is idempotent — duplicate creates only one record', () => {
    const lm = makeManager();
    lm.createLink('fv-1', 'right', 'fv-2', 'left');
    lm.createLink('fv-1', 'right', 'fv-2', 'left');
    expect(lm.getLinks()).toHaveLength(1);
  });

  it('removeLinkBetween is a no-op when the link does not exist', () => {
    const lm = makeManager();
    expect(() => lm.removeLinkBetween('fv-1', 'fv-2')).not.toThrow();
    expect(lm.getLinks()).toHaveLength(0);
  });

  it('getLinks returns all active links', () => {
    const lm = makeManager();
    lm.createLink('fv-1', 'right', 'fv-2', 'left');
    lm.createLink('fv-3', 'right', 'fv-2', 'left');
    expect(lm.getLinks()).toHaveLength(2);
  });

  it('hasLink is directional — src→tgt does not imply tgt→src', () => {
    const lm = makeManager();
    lm.createLink('fv-1', 'right', 'fv-2', 'left');
    expect(lm.hasLink('fv-2', 'fv-1')).toBe(false);
  });
});

// ─── canLink ─────────────────────────────────────────────────────────────────

describe('LinkManager — canLink', () => {
  it('returns true for a compatible source→target pair', () => {
    const lm = makeManager();
    expect(lm.canLink('fv-1', 'fv-2')).toBe(true);
  });

  it('returns false when the source emits no accepted kinds (Chord vs Key slot)', () => {
    const lm = makeManager();
    expect(lm.canLink('fv-3', 'fv-2')).toBe(false);
  });

  it('returns false when the target has no registered drive slots', () => {
    const lm = makeManager();
    // fv-3 (INCOMPAT_VIEW) has no target registration
    expect(lm.canLink('fv-1', 'fv-3')).toBe(false);
  });

  it('returns false for an unknown source instance', () => {
    const lm = makeManager();
    expect(lm.canLink('unknown', 'fv-2')).toBe(false);
  });
});

// ─── initialize survivor filter ───────────────────────────────────────────────

describe('LinkManager — initialize', () => {
  const stubLink = (id: string, src: string, tgt: string): LinkRecord => ({
    id,
    sourceInstanceId: src,
    sourceHandle: 'right',
    targetInstanceId: tgt,
    targetHandle: 'left',
  });

  it('keeps links where both endpoints have content elements', () => {
    const lm = makeManager();
    lm.initialize([stubLink('link-1', 'fv-1', 'fv-2')]);
    expect(lm.getLinks()).toHaveLength(1);
  });

  it('drops a link when the target has no content element', () => {
    const lm = makeManager({ 'fv-2': null });
    lm.initialize([stubLink('link-1', 'fv-1', 'fv-2')]);
    expect(lm.getLinks()).toHaveLength(0);
  });

  it('drops a link when the source has no content element', () => {
    const lm = makeManager({ 'fv-1': null });
    lm.initialize([stubLink('link-1', 'fv-1', 'fv-2')]);
    expect(lm.getLinks()).toHaveLength(0);
  });

  it('restores nextLinkId from the highest link id in the list', () => {
    const lm = makeManager();
    lm.initialize([
      stubLink('link-5', 'fv-1', 'fv-2'),
    ]);
    // The next link created should have id 'link-6'
    lm.createLink('fv-3', 'right', 'fv-2', 'left');
    const ids = lm.getLinks().map(l => l.id);
    expect(ids).toContain('link-6');
  });
});
