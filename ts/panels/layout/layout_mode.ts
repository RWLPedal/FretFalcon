// ts/panels/layout/layout_mode.ts
// Pure helpers shared by PanelHost and the layout strategies: which strategy a
// viewport gets, what orientation a tabbed fretboard takes, how the two strategies'
// persisted layout data coexist, and how a pair of tabs is linked. No DOM access —
// everything here is unit-testable under node.

import type { LayoutData } from './layout_strategy';
import type { Orientation } from '../panel_sizing';

/** The ONE definition of "this viewport gets the tabbed (mobile) strategy". Narrow
 *  screens, plus short ones so a phone held in landscape (e.g. 844×390) stays mobile
 *  instead of flipping to the desktop workspace. 480px sits above every landscape
 *  phone and below any desktop window the floating layout is usable in.
 *  CSS never repeats this query: PanelHost stamps the live strategy on
 *  <html data-layout="…"> and the stylesheets key off that. */
export const TABBED_MEDIA_QUERY = '(max-width: 768px), (max-height: 480px)';

/** A tabbed panel fills the screen, so a fretboard runs along the screen's long axis. */
export function viewportOrientation(width: number, height: number): Orientation {
  return height > width ? 'vertical' : 'horizontal';
}

/** The orientation a tabbed panel takes when the user has not rotated it. One
 *  fretboard runs along the screen's long axis. A panel that draws SEVERAL (Triad
 *  Shapes; Nearby Triads' Reference display) lays them across the screen instead: upright boards side by side on an
 *  upright phone are each a fraction of its width, while boards lying across it
 *  stack down the long axis at full width — about 70% bigger. On a phone turned on
 *  its side the two rules agree. */
export function tabbedDefaultOrientation(
  width: number,
  height: number,
  multiBoard: boolean,
): Orientation {
  return multiBoard ? 'horizontal' : viewportOrientation(width, height);
}

/** Combine the live strategy's layout data with the other strategy's last-known data,
 *  so saving while tabbed doesn't discard the floating geometry (and vice versa).
 *  Entries for instances that no longer exist are pruned. */
export function mergeLayoutData(
  dormant: LayoutData | undefined,
  live: LayoutData | undefined,
  instanceIds: ReadonlySet<string>,
): LayoutData {
  const out: LayoutData = {};

  const floating = live?.floating ?? dormant?.floating;
  if (floating) {
    const perInstance: typeof floating.perInstance = {};
    for (const [id, rect] of Object.entries(floating.perInstance)) {
      if (instanceIds.has(id)) perInstance[id] = rect;
    }
    out.floating = { ...floating, perInstance };
  }

  const tabbed = live?.tabbed ?? dormant?.tabbed;
  if (tabbed) {
    out.tabbed = {
      order: tabbed.order.filter((id) => instanceIds.has(id)),
      activeId:
        tabbed.activeId !== undefined && instanceIds.has(tabbed.activeId)
          ? tabbed.activeId
          : undefined,
      ...(tabbed.split !== undefined ? { split: tabbed.split } : {}),
    };
  }

  return out;
}

// ─── Panes (one panel, or two on a tablet) ────────────────────────────────────

/** The shorter side a screen needs before the tabbed layout shows two panels at
 *  once. Every phone is under it, whichever way it is held; an upright tablet
 *  (768×1024, the widest screen that is still tabbed) is over. */
export const TWO_UP_MIN_SHORT_SIDE = 600;

/** A pane under this height is short of room top-to-bottom (a phone on its side):
 *  panels switch to their wide arrangements. Stamped on the panel as data-pane. */
export const SHORT_PANE_PX = 400;

export interface TabbedPanes {
  /** How many panels the screen has room for. */
  count: 1 | 2;
  /** Two panes stack down a tall screen ('rows') or sit side by side ('columns'). */
  split: 'rows' | 'columns';
}

export function tabbedPanes(width: number, height: number): TabbedPanes {
  return {
    count: Math.min(width, height) >= TWO_UP_MIN_SHORT_SIDE ? 2 : 1,
    split: height >= width ? 'rows' : 'columns',
  };
}

/** The size of one pane on a screen of this size (the whole screen when it only has
 *  room for one). Orientation is decided against this, not against how many tabs
 *  happen to be open — so opening a second tab on a tablet never re-orients the first. */
export function tabbedPaneSize(width: number, height: number): { width: number; height: number } {
  const panes = tabbedPanes(width, height);
  if (panes.count === 1) return { width, height };
  return panes.split === 'rows' ? { width, height: height / 2 } : { width: width / 2, height };
}

/** The first pane's share of a two-pane screen. The divider between the panes can be
 *  dragged, within bounds that leave the smaller pane usable. */
export const PANE_SPLIT_DEFAULT = 0.5;
export const PANE_SPLIT_MIN = 0.3;
export const PANE_SPLIT_MAX = 0.7;

/** A usable split from anything (a saved value, a drag position): out-of-range
 *  values are pulled in, and non-numbers fall back to an even split. */
export function clampPaneSplit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return PANE_SPLIT_DEFAULT;
  return Math.min(PANE_SPLIT_MAX, Math.max(PANE_SPLIT_MIN, value));
}

/**
 * Which tabs are on screen, in tab order. With room for one: the active tab. With
 * room for two: the active tab and a NEIGHBOUR — neighbours are the tabs that can
 * be linked, so a linked pair (a key picker and the scale that follows it) is seen
 * together. The pair on screen (`previous`) is kept while the active tab is one of
 * it and the two are still neighbours; otherwise the active tab brings the tab
 * after it (or, for the last tab, the one before).
 */
export function visibleTabs(
  order: readonly string[],
  activeId: string | null,
  capacity: number,
  previous: readonly string[] = [],
): string[] {
  if (!activeId) return [];
  const i = order.indexOf(activeId);
  if (i === -1) return [];
  if (capacity < 2 || order.length < 2) return [activeId];

  if (previous.length === 2 && previous.includes(activeId)) {
    const j = order.indexOf(previous[0] === activeId ? previous[1] : previous[0]);
    if (j !== -1 && Math.abs(i - j) === 1) return i < j ? [activeId, order[j]] : [order[j], activeId];
  }
  return i + 1 < order.length ? [activeId, order[i + 1]] : [order[i - 1], activeId];
}

// ─── Swipe between tabs ───────────────────────────────────────────────────────

export type SwipeDirection = 'next' | 'previous';

const SWIPE_MIN_PX = 60;
const SWIPE_MAX_MS = 600;
/** A swipe is at least this many times further sideways than up or down. */
const SWIPE_AXIS_RATIO = 2;

/** Is a finger movement a sideways swipe between tabs? Swiping left brings the next
 *  tab, as turning a page does. Slow drags and diagonal scrolls are not swipes. */
export function classifySwipe(dx: number, dy: number, elapsedMs: number): SwipeDirection | null {
  if (elapsedMs > SWIPE_MAX_MS) return null;
  if (Math.abs(dx) < SWIPE_MIN_PX) return null;
  if (Math.abs(dx) < Math.abs(dy) * SWIPE_AXIS_RATIO) return null;
  return dx < 0 ? 'next' : 'previous';
}

/**
 * Where a swipe lands: the tabs on screen slide one place along the tab order.
 * Returns the tab to activate and the tabs to show, or null at either end of the
 * order. The active tab stays active while it is still on screen; otherwise the tab
 * that slid into view takes over.
 */
export function swipeTabs(
  order: readonly string[],
  visible: readonly string[],
  activeId: string | null,
  direction: SwipeDirection,
): { activeId: string; visible: string[] } | null {
  if (!visible.length) return null;
  const first = order.indexOf(visible[0]);
  if (first === -1) return null;
  const start = first + (direction === 'next' ? 1 : -1);
  if (start < 0 || start + visible.length > order.length) return null;
  const shown = order.slice(start, start + visible.length);
  const revealed = direction === 'next' ? shown[shown.length - 1] : shown[0];
  return {
    activeId: activeId && shown.includes(activeId) ? activeId : revealed,
    visible: shown,
  };
}

// ─── Tab pair links ───────────────────────────────────────────────────────────

export type PairLinkState = 'linked' | 'available' | 'incompatible';

export interface PairLink {
  state: PairLinkState;
  /** The driving panel and the panel that follows it. For 'linked' this is the
   *  existing link; for 'available' it is the link a toggle would create. Absent
   *  when incompatible. */
  sourceId?: string;
  targetId?: string;
}

/** Link state between two adjacent tabs (`leftId` sits left of `rightId`). A link in
 *  EITHER direction counts as linked, so links authored on desktop show up whatever
 *  the tab order. A new link prefers left → right, falling back to right → left when
 *  only that direction is compatible. */
export function pairLinkState(
  leftId: string,
  rightId: string,
  hasLink: (sourceId: string, targetId: string) => boolean,
  canLink: (sourceId: string, targetId: string) => boolean,
): PairLink {
  if (hasLink(leftId, rightId)) return { state: 'linked', sourceId: leftId, targetId: rightId };
  if (hasLink(rightId, leftId)) return { state: 'linked', sourceId: rightId, targetId: leftId };
  if (canLink(leftId, rightId)) return { state: 'available', sourceId: leftId, targetId: rightId };
  if (canLink(rightId, leftId)) return { state: 'available', sourceId: rightId, targetId: leftId };
  return { state: 'incompatible' };
}
