import { describe, it, expect } from "vitest";
import { TRIAD_SHAPE_CATALOG } from "../../../ts/music/triads";
import { STANDARD_TUNING } from "../../../ts/fretboard/instruments";

// Standard guitar tuning [E,A,D,G,B,E] in A-indexed semitones (0=A).
const GUITAR_TUNING = STANDARD_TUNING.notes; // [7, 0, 5, 10, 2, 7]

// Music-theory ground truth for each triad quality, used to validate the shape catalog.
const EXPECTED_INTERVALS: Record<string, number[]> = {
  Major: [0, 4, 7],
  Minor: [0, 3, 7],
  Diminished: [0, 3, 6],
  Augmented: [0, 4, 8],
};

/** Computes the three interval values (0–11) that a shape produces relative
 *  to its root note. Result order matches the shape's stringGroup order. */
function computeShapeIntervals(
  shape: (typeof TRIAD_SHAPE_CATALOG)[0],
  tuning: number[],
): number[] {
  const rootRelFret = shape.relativeFrets[shape.rootStringIndexInGroup];
  const rootTuning = tuning[shape.stringGroup[shape.rootStringIndexInGroup]];
  return shape.stringGroup.map((strIdx, i) => {
    const relFret = shape.relativeFrets[i] - rootRelFret;
    return (((tuning[strIdx] + relFret - rootTuning) % 12) + 12) % 12;
  });
}

// ─── TRIAD_SHAPE_CATALOG structural integrity ─────────────────────────────────

describe("TRIAD_SHAPE_CATALOG — structural integrity", () => {
  for (const shape of TRIAD_SHAPE_CATALOG) {
    const label = `${shape.quality} ${shape.inversion} [${shape.stringGroup}]`;

    it(`${label}: stringGroup has 3 ascending unique values`, () => {
      expect(shape.stringGroup).toHaveLength(3);
      expect(shape.stringGroup[0]).toBeLessThan(shape.stringGroup[1]);
      expect(shape.stringGroup[1]).toBeLessThan(shape.stringGroup[2]);
    });

    it(`${label}: relativeFrets has 3 elements`, () => {
      expect(shape.relativeFrets).toHaveLength(3);
    });

    it(`${label}: rootStringIndexInGroup is 0, 1, or 2`, () => {
      expect([0, 1, 2]).toContain(shape.rootStringIndexInGroup);
    });

    it(`${label}: all stringGroup indices are within standard guitar range (0–5)`, () => {
      for (const idx of shape.stringGroup) {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThanOrEqual(5);
      }
    });
  }
});

// ─── TRIAD_SHAPE_CATALOG interval correctness ─────────────────────────────────

describe("TRIAD_SHAPE_CATALOG — interval correctness vs music theory", () => {
  for (const shape of TRIAD_SHAPE_CATALOG) {
    const label = `${shape.quality} ${shape.inversion} [${shape.stringGroup}]`;
    const expected = [...EXPECTED_INTERVALS[shape.quality]].sort(
      (a, b) => a - b,
    );

    it(`${label}: produces correct ${shape.quality} intervals on standard guitar tuning`, () => {
      const intervals = computeShapeIntervals(shape, GUITAR_TUNING).sort(
        (a, b) => a - b,
      );
      expect(intervals).toEqual(expected);
    });
  }
});
