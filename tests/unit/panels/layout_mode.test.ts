// tests/unit/panels/layout_mode.test.ts
// The pure rules behind the tabbed (mobile) layout: which orientation a full-screen
// fretboard takes, how the two strategies' persisted layout data coexist, and how a
// pair of adjacent tabs is linked.

import { describe, it, expect } from 'vitest';
import {
  TABBED_MEDIA_QUERY,
  viewportOrientation,
  tabbedDefaultOrientation,
  tabbedPanes,
  tabbedPaneSize,
  visibleTabs,
  clampPaneSplit,
  PANE_SPLIT_DEFAULT,
  PANE_SPLIT_MIN,
  PANE_SPLIT_MAX,
  classifySwipe,
  swipeTabs,
  mergeLayoutData,
  pairLinkState,
} from '../../../ts/panels/layout/layout_mode';
import type { LayoutData } from '../../../ts/panels/layout/layout_strategy';

describe('TABBED_MEDIA_QUERY', () => {
  it('covers narrow viewports and short (landscape-phone) viewports', () => {
    expect(TABBED_MEDIA_QUERY).toContain('max-width: 768px');
    expect(TABBED_MEDIA_QUERY).toContain('max-height: 480px');
  });
});

describe('viewportOrientation', () => {
  it('runs the fretboard along the long axis of the screen', () => {
    expect(viewportOrientation(375, 812)).toBe('vertical');
    expect(viewportOrientation(844, 390)).toBe('horizontal');
    expect(viewportOrientation(768, 1024)).toBe('vertical');
  });

  it('treats a square viewport as horizontal', () => {
    expect(viewportOrientation(600, 600)).toBe('horizontal');
  });
});

describe('tabbedDefaultOrientation', () => {
  it('runs a single fretboard along the long axis', () => {
    expect(tabbedDefaultOrientation(375, 812, false)).toBe('vertical');
    expect(tabbedDefaultOrientation(844, 390, false)).toBe('horizontal');
  });

  it('lays several fretboards across the screen, so they stack at full width', () => {
    // Upright phone and tablet: NOT the long axis — boards lie across and stack.
    expect(tabbedDefaultOrientation(375, 812, true)).toBe('horizontal');
    expect(tabbedDefaultOrientation(768, 1024, true)).toBe('horizontal');
    // On its side the two rules agree.
    expect(tabbedDefaultOrientation(844, 390, true)).toBe('horizontal');
  });
});

describe('tabbedPanes', () => {
  it('gives every phone one pane, whichever way it is held', () => {
    expect(tabbedPanes(375, 812).count).toBe(1);
    expect(tabbedPanes(430, 932).count).toBe(1);
    expect(tabbedPanes(844, 390).count).toBe(1);
    expect(tabbedPanes(320, 568).count).toBe(1);
  });

  it('gives an upright tablet two panes, stacked', () => {
    expect(tabbedPanes(768, 1024)).toEqual({ count: 2, split: 'rows' });
    expect(tabbedPanes(744, 1133)).toEqual({ count: 2, split: 'rows' });
  });

  it('puts two panes side by side on a wide screen', () => {
    expect(tabbedPanes(768, 700)).toEqual({ count: 2, split: 'columns' });
  });
});

describe('tabbedPaneSize', () => {
  it('is the whole screen where only one pane fits', () => {
    expect(tabbedPaneSize(375, 812)).toEqual({ width: 375, height: 812 });
  });

  it('is half the screen along the split where two fit', () => {
    expect(tabbedPaneSize(768, 1024)).toEqual({ width: 768, height: 512 });
    expect(tabbedPaneSize(768, 700)).toEqual({ width: 384, height: 700 });
  });

  it('makes an upright tablet lay a single fretboard across its (wide) panes', () => {
    const pane = tabbedPaneSize(768, 1024);
    expect(tabbedDefaultOrientation(pane.width, pane.height, false)).toBe('horizontal');
  });
});

describe('visibleTabs', () => {
  const order = ['a', 'b', 'c', 'd'];

  it('shows nothing without an active tab', () => {
    expect(visibleTabs(order, null, 2)).toEqual([]);
    expect(visibleTabs(order, 'gone', 2)).toEqual([]);
  });

  it('shows only the active tab where one pane fits', () => {
    expect(visibleTabs(order, 'b', 1)).toEqual(['b']);
    // …even coming from a pair (a tablet turned so that only one fits).
    expect(visibleTabs(order, 'b', 1, ['b', 'c'])).toEqual(['b']);
  });

  it('pairs the active tab with the tab after it', () => {
    expect(visibleTabs(order, 'a', 2)).toEqual(['a', 'b']);
    expect(visibleTabs(order, 'c', 2)).toEqual(['c', 'd']);
  });

  it('pairs the last tab with the one before it, in tab order', () => {
    expect(visibleTabs(order, 'd', 2)).toEqual(['c', 'd']);
  });

  it('gives a lone tab the screen to itself', () => {
    expect(visibleTabs(['a'], 'a', 2)).toEqual(['a']);
  });

  it('keeps the pair on screen when the other pane becomes active', () => {
    // Touching the second pane must not slide the first one away.
    expect(visibleTabs(order, 'b', 2, ['a', 'b'])).toEqual(['a', 'b']);
    expect(visibleTabs(order, 'c', 2, ['c', 'd'])).toEqual(['c', 'd']);
  });

  it('re-pairs when the pair is no longer neighbours, or one of it is gone', () => {
    // Reordered apart: a and b now have c between them.
    expect(visibleTabs(['a', 'c', 'b', 'd'], 'a', 2, ['a', 'b'])).toEqual(['a', 'c']);
    // The companion was closed.
    expect(visibleTabs(['a', 'c', 'd'], 'a', 2, ['a', 'b'])).toEqual(['a', 'c']);
  });

  it('re-pairs when a tab that is not on screen is activated', () => {
    expect(visibleTabs(order, 'c', 2, ['a', 'b'])).toEqual(['c', 'd']);
  });

  it('follows the tab order if the pair swapped places', () => {
    expect(visibleTabs(['b', 'a', 'c'], 'a', 2, ['a', 'b'])).toEqual(['b', 'a']);
  });
});

describe('clampPaneSplit', () => {
  it('keeps a split inside the range that leaves both panes usable', () => {
    expect(clampPaneSplit(0.5)).toBe(0.5);
    expect(clampPaneSplit(0.62)).toBe(0.62);
    expect(clampPaneSplit(0.05)).toBe(PANE_SPLIT_MIN);
    expect(clampPaneSplit(0.99)).toBe(PANE_SPLIT_MAX);
  });

  it('falls back to an even split for anything that is not a number', () => {
    // What a layout saved before the divider existed, or a hand-edited file, holds.
    expect(clampPaneSplit(undefined)).toBe(PANE_SPLIT_DEFAULT);
    expect(clampPaneSplit('0.4')).toBe(PANE_SPLIT_DEFAULT);
    expect(clampPaneSplit(NaN)).toBe(PANE_SPLIT_DEFAULT);
    expect(clampPaneSplit(Infinity)).toBe(PANE_SPLIT_DEFAULT);
  });
});

describe('mergeLayoutData — pane split', () => {
  it('carries the split through a save made while the floating layout is live', () => {
    const dormant: LayoutData = { tabbed: { order: ['a', 'b'], activeId: 'a', split: 0.62 } };
    const merged = mergeLayoutData(dormant, { floating: undefined }, new Set(['a', 'b']));
    expect(merged.tabbed?.split).toBe(0.62);
  });

  it('writes no split when there is none to keep', () => {
    const merged = mergeLayoutData({ tabbed: { order: ['a'] } }, undefined, new Set(['a']));
    expect(merged.tabbed && 'split' in merged.tabbed).toBe(false);
  });
});

describe('classifySwipe', () => {
  it('reads a quick sideways drag as a swipe: left for next, right for previous', () => {
    expect(classifySwipe(-120, 8, 200)).toBe('next');
    expect(classifySwipe(120, -8, 200)).toBe('previous');
  });

  it('ignores a short drag, a slow one, and a mostly vertical one', () => {
    expect(classifySwipe(-40, 0, 200)).toBeNull();   // too short — a tap that slipped
    expect(classifySwipe(-200, 0, 900)).toBeNull();  // too slow — a drag, not a flick
    expect(classifySwipe(-100, 80, 200)).toBeNull(); // diagonal — a scroll
    expect(classifySwipe(0, -300, 200)).toBeNull();  // vertical — a scroll
  });
});

describe('swipeTabs', () => {
  const order = ['a', 'b', 'c', 'd'];

  it('turns to the neighbouring tab on a phone', () => {
    expect(swipeTabs(order, ['b'], 'b', 'next')).toEqual({ activeId: 'c', visible: ['c'] });
    expect(swipeTabs(order, ['b'], 'b', 'previous')).toEqual({ activeId: 'a', visible: ['a'] });
  });

  it('stops at either end of the tab order', () => {
    expect(swipeTabs(order, ['a'], 'a', 'previous')).toBeNull();
    expect(swipeTabs(order, ['d'], 'd', 'next')).toBeNull();
    expect(swipeTabs(order, ['c', 'd'], 'c', 'next')).toBeNull();
    expect(swipeTabs(order, [], null, 'next')).toBeNull();
  });

  it('slides a tablet pair along by one, keeping the active tab while it stays on screen', () => {
    expect(swipeTabs(order, ['a', 'b'], 'b', 'next')).toEqual({ activeId: 'b', visible: ['b', 'c'] });
    expect(swipeTabs(order, ['b', 'c'], 'b', 'previous')).toEqual({ activeId: 'b', visible: ['a', 'b'] });
  });

  it('hands over to the tab that slid in when the active one slid out', () => {
    expect(swipeTabs(order, ['a', 'b'], 'a', 'next')).toEqual({ activeId: 'c', visible: ['b', 'c'] });
    expect(swipeTabs(order, ['c', 'd'], 'd', 'previous')).toEqual({ activeId: 'b', visible: ['b', 'c'] });
  });

  it('lands on a pair that visibleTabs keeps (the two rules agree)', () => {
    const swiped = swipeTabs(order, ['a', 'b'], 'a', 'next')!;
    expect(visibleTabs(order, swiped.activeId, 2, swiped.visible)).toEqual(swiped.visible);
  });
});

const floating = (ids: string[]): NonNullable<LayoutData['floating']> => ({
  gridCols: 96,
  rowPx: 16,
  nextZIndex: 100 + ids.length,
  perInstance: Object.fromEntries(
    ids.map((id, i) => [id, { col: i * 10, row: 1, colSpan: 8, rowSpan: 8, zIndex: 100 + i }]),
  ),
});

describe('mergeLayoutData', () => {
  it('keeps the dormant floating geometry when the live strategy is tabbed', () => {
    const dormant: LayoutData = { floating: floating(['fv-1', 'fv-2']) };
    const live: LayoutData = { tabbed: { order: ['fv-2', 'fv-1'], activeId: 'fv-2' } };
    const merged = mergeLayoutData(dormant, live, new Set(['fv-1', 'fv-2']));
    expect(merged.floating?.perInstance['fv-1']).toEqual(dormant.floating!.perInstance['fv-1']);
    expect(merged.floating?.perInstance['fv-2']).toEqual(dormant.floating!.perInstance['fv-2']);
    expect(merged.tabbed).toEqual({ order: ['fv-2', 'fv-1'], activeId: 'fv-2' });
  });

  it('keeps the dormant tab order when the live strategy is floating', () => {
    const dormant: LayoutData = { tabbed: { order: ['fv-2', 'fv-1'], activeId: 'fv-1' } };
    const live: LayoutData = { floating: floating(['fv-1', 'fv-2']) };
    const merged = mergeLayoutData(dormant, live, new Set(['fv-1', 'fv-2']));
    expect(merged.tabbed).toEqual({ order: ['fv-2', 'fv-1'], activeId: 'fv-1' });
    expect(Object.keys(merged.floating!.perInstance).sort()).toEqual(['fv-1', 'fv-2']);
  });

  it('prefers live data over dormant data for the same strategy', () => {
    const dormant: LayoutData = { tabbed: { order: ['fv-1', 'fv-2'] } };
    const live: LayoutData = { tabbed: { order: ['fv-2', 'fv-1'] } };
    expect(mergeLayoutData(dormant, live, new Set(['fv-1', 'fv-2'])).tabbed?.order).toEqual([
      'fv-2',
      'fv-1',
    ]);
  });

  it('prunes instances that no longer exist, from both strategies', () => {
    const dormant: LayoutData = { floating: floating(['fv-1', 'fv-2', 'fv-3']) };
    const live: LayoutData = { tabbed: { order: ['fv-1', 'fv-2', 'fv-3'], activeId: 'fv-3' } };
    const merged = mergeLayoutData(dormant, live, new Set(['fv-1', 'fv-2']));
    expect(Object.keys(merged.floating!.perInstance).sort()).toEqual(['fv-1', 'fv-2']);
    expect(merged.tabbed).toEqual({ order: ['fv-1', 'fv-2'], activeId: undefined });
  });

  it('does not mutate its inputs', () => {
    const dormant: LayoutData = { floating: floating(['fv-1', 'fv-2']) };
    const snapshot = JSON.stringify(dormant);
    mergeLayoutData(dormant, { tabbed: { order: ['fv-1'] } }, new Set(['fv-1']));
    expect(JSON.stringify(dormant)).toBe(snapshot);
  });

  it('returns an empty object when neither side has data', () => {
    expect(mergeLayoutData(undefined, undefined, new Set())).toEqual({});
  });
});

describe('pairLinkState', () => {
  const links = (pairs: Array<[string, string]>) => (s: string, t: string) =>
    pairs.some(([a, b]) => a === s && b === t);

  it('reports a left → right link as linked', () => {
    expect(pairLinkState('a', 'b', links([['a', 'b']]), () => true)).toEqual({
      state: 'linked',
      sourceId: 'a',
      targetId: 'b',
    });
  });

  it('reports a right → left link as linked too (links authored on desktop)', () => {
    expect(pairLinkState('a', 'b', links([['b', 'a']]), () => true)).toEqual({
      state: 'linked',
      sourceId: 'b',
      targetId: 'a',
    });
  });

  it('offers left → right first when both directions are compatible', () => {
    expect(pairLinkState('a', 'b', links([]), () => true)).toEqual({
      state: 'available',
      sourceId: 'a',
      targetId: 'b',
    });
  });

  it('falls back to right → left when only that direction is compatible', () => {
    expect(pairLinkState('a', 'b', links([]), links([['b', 'a']]))).toEqual({
      state: 'available',
      sourceId: 'b',
      targetId: 'a',
    });
  });

  it('is incompatible when neither direction can link', () => {
    expect(pairLinkState('a', 'b', links([]), () => false)).toEqual({ state: 'incompatible' });
  });
});
