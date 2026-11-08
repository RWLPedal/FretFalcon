// tests/unit/fretboard/nearby_triads_layout.test.ts
// How Nearby Triads' Reference display (one fretboard per chord) divides its room:
// never more columns than the slots' own controls fit in, the largest boards that
// still fit both ways, and something drawable even when there is no room at all.

import { describe, it, expect } from 'vitest';
import {
  planSlotGrid,
  slotColumnsForWidth,
  SLOT_GAP,
  SLOT_MIN_W,
  SLOT_OVERHEAD_H,
  SLOT_PAD_X,
} from '../../../ts/fretboard/features/nearby_triads_layout';

// A six-string board drawn to 15 frets: about three times as long as it is wide.
const UPRIGHT = 0.33; // width / height, standing up
const ACROSS = 3.05; //                 lying down

/** The room a planned grid takes, to compare with the room it was given. */
function footprint(count: number, plan: { cols: number; boardW: number; boardH: number }) {
  const rows = Math.ceil(count / plan.cols);
  const slotW = Math.max(SLOT_MIN_W, plan.boardW) + 2 * SLOT_PAD_X;
  return {
    width: plan.cols * slotW + (plan.cols - 1) * SLOT_GAP,
    height: rows * (plan.boardH + SLOT_OVERHEAD_H) + (rows - 1) * SLOT_GAP,
  };
}

describe('planSlotGrid', () => {
  it('fits the room it is given, both ways', () => {
    const rooms: Array<[number, number]> = [
      [351, 690], [351, 430], [296, 440], [744, 300], [820, 270], [470, 600], [670, 880],
    ];
    for (const [width, height] of rooms) {
      for (const aspect of [UPRIGHT, ACROSS]) {
        for (const count of [1, 2, 3, 4, 6, 7]) {
          const plan = planSlotGrid(count, width, height, aspect);
          const used = footprint(count, plan);
          const where = `${count} slots in ${width}x${height} at ${aspect}`;
          expect(used.width, where).toBeLessThanOrEqual(width + 0.5);
          // A room too short for even the smallest boards is allowed to scroll.
          if (plan.boardH > 41) expect(used.height, where).toBeLessThanOrEqual(height + 0.5);
          expect(plan.boardW / plan.boardH, where).toBeCloseTo(aspect, 5);
        }
      }
    }
  });

  it('never uses more columns than the slot controls fit in', () => {
    // A 375px phone: four upright boards would fit side by side, their controls would not.
    const plan = planSlotGrid(4, 351, 690, UPRIGHT);
    expect(plan.cols).toBe(2);
    // A 320px phone still gets two columns — one would stack four tiny boards.
    expect(planSlotGrid(4, 296, 440, UPRIGHT).cols).toBe(2);
  });

  it('stacks boards lying across an upright phone, one per row', () => {
    const plan = planSlotGrid(4, 351, 690, ACROSS);
    expect(plan.cols).toBe(1);
    // …and they are longer than the same four standing up, two by two.
    const upright = planSlotGrid(4, 351, 690, UPRIGHT);
    expect(plan.boardW).toBeGreaterThan(upright.boardH * 1.1);
  });

  it('puts boards side by side where the room is wide and short', () => {
    expect(planSlotGrid(4, 820, 160, ACROSS).cols).toBe(4); // a phone on its side, settings open
    expect(planSlotGrid(4, 744, 300, ACROSS).cols).toBe(2); // half a tablet
  });

  it('gives one chord the whole room', () => {
    const plan = planSlotGrid(1, 351, 690, UPRIGHT);
    expect(plan.cols).toBe(1);
    expect(plan.boardH).toBeGreaterThan(600);
  });

  it('still plans a board when there is no room for one', () => {
    const plan = planSlotGrid(4, 296, 120, UPRIGHT);
    expect(plan.boardW).toBeGreaterThan(0);
    expect(plan.boardH).toBeGreaterThan(0);
    expect(Number.isFinite(plan.boardW + plan.boardH)).toBe(true);
  });
});

describe('slotColumnsForWidth', () => {
  it('is how many slots the width holds', () => {
    expect(slotColumnsForWidth(4, 351)).toBe(2);
    expect(slotColumnsForWidth(4, 820)).toBe(4);
    expect(slotColumnsForWidth(7, 820)).toBe(5);
  });

  it('is never less than one, nor more than there are slots', () => {
    expect(slotColumnsForWidth(4, 40)).toBe(1);
    expect(slotColumnsForWidth(2, 2000)).toBe(2);
  });
});
