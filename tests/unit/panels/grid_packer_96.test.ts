// tests/unit/panels/grid_packer_96.test.ts
// grid_packer contracts at PRODUCTION scale (cols = 96, gap = 1, border = 1).
//
// grid_packer.test.ts exercises the algorithms with small readable cases at COLS = 32;
// this file re-asserts the documented contracts at the real GRID_COLS = 96 defaults and
// adds seeded property-style sweeps: no overlap, no right overflow, idempotence. The
// PRNG is a local mulberry32 so runs are fully deterministic with zero dependencies.

import { describe, it, expect } from 'vitest';
import {
  packShelves,
  reconcileLayout,
  tidyLayout,
  layoutBottomRow,
  ReconcileItem,
  PlacedRect,
} from '../../../ts/panels/layout/grid_packer';
import { GRID_COLS } from '../../../ts/panels/grid_constants';

// ─── Deterministic PRNG ───────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random panel set: 1–20 panels, spans 4–60 cols × 4–55 rows, positions anywhere
 *  in-bounds horizontally (col + colSpan ≤ 96) but freely overlapping each other.
 *  Panels wider than the workspace are a separately-documented failure mode (see
 *  default_configs.test.ts "Any view" case), not part of the packer contract. */
function randomItems(rand: () => number): ReconcileItem[] {
  const n = 1 + Math.floor(rand() * 20);
  const items: ReconcileItem[] = [];
  for (let i = 0; i < n; i++) {
    const colSpan = 4 + Math.floor(rand() * 57); // 4..60
    const rowSpan = 4 + Math.floor(rand() * 52); // 4..55
    const col = Math.floor(rand() * (GRID_COLS - colSpan + 1));
    const row = Math.floor(rand() * 80);
    items.push({ id: `fv-${i}`, col, row, colSpan, rowSpan });
  }
  return items;
}

function overlappingPairs(rects: Record<string, PlacedRect>): string[] {
  const entries = Object.entries(rects);
  const bad: string[] = [];
  for (let i = 0; i < entries.length; i++)
    for (let j = i + 1; j < entries.length; j++) {
      const [idA, a] = entries[i];
      const [idB, b] = entries[j];
      const overlap =
        a.col < b.col + b.colSpan &&
        a.col + a.colSpan > b.col &&
        a.row < b.row + b.rowSpan &&
        a.row + a.rowSpan > b.row;
      if (overlap) bad.push(`${idA}×${idB}`);
    }
  return bad;
}

function maxRight(rects: Record<string, PlacedRect>): number {
  return Math.max(...Object.values(rects).map((r) => r.col + r.colSpan));
}

/** Feed a packer result back in as items (spans preserved, ids kept). */
function asItems(rects: Record<string, PlacedRect>): ReconcileItem[] {
  return Object.entries(rects).map(([id, r]) => ({ id, ...r }));
}

const ROUNDS = 200;

describe('reconcileLayout @ cols=96 (production defaults)', () => {
  it('random layouts: no overlap, no right overflow, idempotent', () => {
    const rand = mulberry32(0xf5e7);
    for (let round = 0; round < ROUNDS; round++) {
      const items = randomItems(rand);
      const once = reconcileLayout(items);

      expect(overlappingPairs(once), `overlap (seed round ${round})`).toEqual([]);
      expect(maxRight(once), `right overflow (seed round ${round})`).toBeLessThanOrEqual(
        GRID_COLS,
      );
      // Documented: idempotent — a clean layout passes through unchanged.
      const twice = reconcileLayout(asItems(once));
      expect(twice, `not idempotent (seed round ${round})`).toEqual(once);
    }
  });

  it('never changes a panel column or any span (preserve-X, push-down only)', () => {
    const rand = mulberry32(0xa11c);
    for (let round = 0; round < 50; round++) {
      const items = randomItems(rand);
      const out = reconcileLayout(items);
      // Columns may shift only by the uniform border-alignment delta.
      const deltas = new Set(items.map((i) => out[i.id].col - i.col));
      expect(deltas.size, `non-uniform column shift (round ${round})`).toBe(1);
      // Rows shift uniformly to the border, then only ever move DOWN.
      const dRow = 1 - Math.min(...items.map((i) => i.row)); // border = 1
      for (const i of items) {
        expect(out[i.id].colSpan).toBe(i.colSpan);
        expect(out[i.id].rowSpan).toBe(i.rowSpan);
        expect(
          out[i.id].row,
          `push-down only — ${i.id} moved up (round ${round})`,
        ).toBeGreaterThanOrEqual(i.row + dRow);
      }
    }
  });

  it('keeps aligned columns aligned (the property that makes restores look authored)', () => {
    const items: ReconcileItem[] = [
      { id: 'fv-1', col: 10, row: 0, colSpan: 20, rowSpan: 10 },
      { id: 'fv-2', col: 10, row: 5, colSpan: 20, rowSpan: 10 }, // overlaps fv-1
      { id: 'fv-3', col: 40, row: 0, colSpan: 20, rowSpan: 10 },
    ];
    const out = reconcileLayout(items);
    expect(out['fv-1'].col).toBe(out['fv-2'].col);
    expect(overlappingPairs(out)).toEqual([]);
    // fv-2 pushed below fv-1 with the default 1-cell gap.
    expect(out['fv-2'].row).toBe(out['fv-1'].row + 10 + 1);
    // Non-overlapping neighbour untouched relative to the pair.
    expect(out['fv-3'].row).toBe(out['fv-1'].row);
  });
});

describe('tidyLayout @ cols=96 (production defaults)', () => {
  it('random layouts: no overlap, no right overflow, idempotent', () => {
    const rand = mulberry32(0x71d1);
    for (let round = 0; round < ROUNDS; round++) {
      const items = randomItems(rand);
      const once = tidyLayout(items);

      expect(overlappingPairs(once), `overlap (seed round ${round})`).toEqual([]);
      expect(maxRight(once), `right overflow (seed round ${round})`).toBeLessThanOrEqual(
        GRID_COLS,
      );
      const twice = tidyLayout(asItems(once));
      expect(twice, `not idempotent (seed round ${round})`).toEqual(once);
    }
  });

  it('gravity: no panel can move up a full step without colliding or leaving the border', () => {
    const rand2 = mulberry32(0x97a7);
    for (let round = 0; round < 50; round++) {
      const items = randomItems(rand2);
      const out = tidyLayout(items);
      const rects = Object.entries(out);
      for (const [id, r] of rects) {
        if (r.row <= 1) continue; // resting on the top border
        const lifted = { ...r, row: r.row - 1 };
        const collides = rects.some(
          ([otherId, o]) =>
            otherId !== id &&
            lifted.col < o.col + o.colSpan &&
            lifted.col + lifted.colSpan > o.col &&
            lifted.row < o.row + o.rowSpan &&
            lifted.row + lifted.rowSpan > o.row,
        );
        // Moving up one row must either collide or close the guaranteed 1-cell gap
        // with the panel it rests on — i.e. the panel above ends exactly gap cells up.
        const restsOnNeighbour = rects.some(
          ([otherId, o]) =>
            otherId !== id &&
            lifted.col < o.col + o.colSpan &&
            lifted.col + lifted.colSpan > o.col &&
            o.row + o.rowSpan + 1 === r.row,
        );
        expect(
          collides || restsOnNeighbour,
          `${id} floats free at row ${r.row} (round ${round})`,
        ).toBe(true);
      }
    }
  });

  it('packs toward the border: a clean fitting layout keeps its top-left at (border, border)', () => {
    const items: ReconcileItem[] = [
      { id: 'fv-1', col: 30, row: 20, colSpan: 20, rowSpan: 10 },
      { id: 'fv-2', col: 60, row: 40, colSpan: 20, rowSpan: 10 },
    ];
    const out = tidyLayout(items);
    const minCol = Math.min(...Object.values(out).map((r) => r.col));
    const minRow = Math.min(...Object.values(out).map((r) => r.row));
    expect(minCol).toBe(1);
    expect(minRow).toBe(1);
  });
});

describe('packShelves @ cols=96', () => {
  it('random sets: in-bounds, no overlap', () => {
    const rand = mulberry32(0x5e1f);
    for (let round = 0; round < ROUNDS; round++) {
      const base = randomItems(rand);
      const items = base.map(({ id, colSpan, rowSpan }) => ({ id, colSpan, rowSpan }));
      const placed = packShelves(items, GRID_COLS);
      const rects: Record<string, PlacedRect> = {};
      for (const it of items) {
        rects[it.id] = { ...placed[it.id], colSpan: Math.min(it.colSpan, GRID_COLS), rowSpan: it.rowSpan };
      }
      expect(overlappingPairs(rects), `overlap (round ${round})`).toEqual([]);
      expect(maxRight(rects), `right overflow (round ${round})`).toBeLessThanOrEqual(GRID_COLS);
    }
  });
});

describe('layoutBottomRow', () => {
  it('returns the bottom edge of the lowest rect, 0 for an empty set', () => {
    expect(layoutBottomRow([])).toBe(0);
    expect(
      layoutBottomRow([
        { col: 0, row: 2, colSpan: 5, rowSpan: 10 },
        { col: 8, row: 30, colSpan: 5, rowSpan: 25 },
      ]),
    ).toBe(55);
  });
});
