// tests/unit/modules/strum_layout.test.ts
// How the strum grid wraps when it is as wide as its panel (the tabbed/mobile layout):
// whole beats per row, never a slot narrower than MIN_SLOT_PX, rows of even length.

import { describe, it, expect } from 'vitest';
import { beatsPerRow, MIN_SLOT_PX, BEAT_GAP } from '../../../ts/modules/strum/strum_layout';

/** Slot width the grid ends up with for a given beats-per-row. */
const slotWidth = (width: number, perRow: number, slotsInBeat: number) =>
  (width - (perRow - 1) * BEAT_GAP) / perRow / slotsInBeat;

describe('beatsPerRow', () => {
  const PHONE = 351; // a 375px phone less the panel padding

  it('keeps 4/4 in eighths on one row of a phone', () => {
    expect(beatsPerRow(PHONE, 4, 2)).toBe(4);
  });

  it('wraps 4/4 in sixteenths onto two rows of two beats', () => {
    expect(beatsPerRow(PHONE, 4, 4)).toBe(2);
  });

  it('evens the rows out rather than leaving a short one', () => {
    // 6/8 in sixteenths: four beats would fit, but 3 + 3 reads better than 4 + 2.
    expect(beatsPerRow(PHONE, 6, 2)).toBe(3);
    // 5/4 in eighths: 3 + 2, not 4 + 1.
    expect(beatsPerRow(PHONE, 5, 2)).toBe(3);
  });

  it('never needs more beats per row than the bar has', () => {
    expect(beatsPerRow(2000, 4, 2)).toBe(4);
    expect(beatsPerRow(2000, 7, 1)).toBe(7);
  });

  it('always shows at least one beat per row, however narrow', () => {
    expect(beatsPerRow(40, 4, 4)).toBe(1);
  });

  it('falls back to a single row before the grid has been measured', () => {
    expect(beatsPerRow(0, 4, 4)).toBe(4);
  });

  it('never squeezes a slot below the minimum when a narrower row would avoid it', () => {
    const bars: Array<[beats: number, slotsInBeat: number]> = [
      [4, 2], [4, 4], [3, 2], [3, 4], [2, 2], [2, 4], [6, 1], [6, 2], [5, 2], [5, 4], [7, 1], [7, 2],
    ];
    for (const width of [296, 351, 400, 744, 820]) {
      for (const [beats, slotsInBeat] of bars) {
        const perRow = beatsPerRow(width, beats, slotsInBeat);
        expect(perRow).toBeGreaterThanOrEqual(1);
        expect(perRow).toBeLessThanOrEqual(beats);
        if (perRow > 1) {
          expect(
            slotWidth(width, perRow, slotsInBeat),
            `${beats} beats × ${slotsInBeat} slots at ${width}px`,
          ).toBeGreaterThanOrEqual(MIN_SLOT_PX);
        }
      }
    }
  });
});
