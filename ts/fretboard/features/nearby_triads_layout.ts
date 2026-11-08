// ts/fretboard/features/nearby_triads_layout.ts
// Pure geometry for Nearby Triads' Reference display — one fretboard per chord. No
// DOM: the feature sets these sizes on its elements and plans its boards with the
// same numbers, so what is drawn and what was planned cannot drift apart.
//
// One slot is a column: chord label, board, voicing controls.

export const SLOT_GAP = 8;             // between slots, across and down
export const SLOT_PAD_X = 4;           // a slot's own padding, each side
export const SLOT_PAD_Y = 2;
export const SLOT_INNER_GAP = 2;       // label / board / controls
export const SLOT_LABEL_H = 18;
export const SLOT_CONTROLS_H = 24;     // also the width of each of its three buttons
export const SLOT_COUNTER_MIN_W = 50;
/** The narrowest a slot's contents can be — its controls. A board may be narrower. */
export const SLOT_MIN_W = 3 * SLOT_CONTROLS_H + SLOT_COUNTER_MIN_W + 3 * SLOT_INNER_GAP;
/** What a slot adds to its board's height. */
export const SLOT_OVERHEAD_H = SLOT_LABEL_H + SLOT_CONTROLS_H + 2 * SLOT_INNER_GAP + 2 * SLOT_PAD_Y;
export const SLOTS_MARGIN_TOP = 8;
/** A board is never planned shorter than this, however little room is left. */
export const MIN_BOARD_ROOM = 40;

/**
 * How to lay N slots out in a room: the column count (1..N) that gives the largest
 * boards, and the box each board must fit. A column count is only considered when a
 * slot's controls fit in it — boards that would be narrower than their own controls
 * do not get more columns, they get the width instead.
 */
export function planSlotGrid(
  count: number,
  width: number,
  height: number,
  aspectRatio: number,
): { cols: number; boardW: number; boardH: number } {
  let best = { cols: 1, boardW: 0, boardH: 0 };
  let bestArea = -1;
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const slotW = Math.floor((width - (cols - 1) * SLOT_GAP) / cols) - 2 * SLOT_PAD_X;
    const slotH = Math.floor((height - (rows - 1) * SLOT_GAP) / rows) - SLOT_OVERHEAD_H;
    if (cols > 1 && slotW < SLOT_MIN_W) break;
    if (slotW <= 0 || slotH <= 0) continue;
    const boardW = Math.min(slotW, slotH * aspectRatio);
    const boardH = boardW / aspectRatio;
    if (boardW * boardH > bestArea) {
      bestArea = boardW * boardH;
      best = { cols, boardW, boardH };
    }
  }
  if (bestArea < 0) {
    // No room at all: one column of the smallest boards, and the panel scrolls.
    const boardW = Math.max(1, Math.min(width - 2 * SLOT_PAD_X, MIN_BOARD_ROOM * aspectRatio));
    best = { cols: 1, boardW, boardH: boardW / aspectRatio };
  }
  return best;
}

/** As many columns as the width holds slots, when there is no height to plan against. */
export function slotColumnsForWidth(count: number, width: number): number {
  const perSlot = SLOT_MIN_W + 2 * SLOT_PAD_X + SLOT_GAP;
  return Math.max(1, Math.min(count, Math.floor((width + SLOT_GAP) / perSlot)));
}
