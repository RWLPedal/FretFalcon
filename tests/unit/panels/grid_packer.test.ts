import { describe, it, expect } from 'vitest'
import { packShelves, PackItem, reconcileLayout, tidyLayout, ReconcileItem, PlacedRect, layoutBottomRow } from '../../../ts/panels/layout/grid_packer'

const COLS = 32

// Helper: assert no two placed items overlap in a packed result
function assertNoOverlap(
  items: PackItem[],
  placed: Record<string, { col: number; row: number }>,
): void {
  const rects = items.map(item => ({
    id: item.id,
    col:    placed[item.id].col,
    row:    placed[item.id].row,
    colEnd: placed[item.id].col + item.colSpan,
    rowEnd: placed[item.id].row + item.rowSpan,
  }))
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j]
      const overlapsX = a.col < b.colEnd && a.colEnd > b.col
      const overlapsY = a.row < b.rowEnd && a.rowEnd > b.row
      expect(overlapsX && overlapsY, `${a.id} overlaps ${b.id}`).toBe(false)
    }
  }
}

describe('packShelves', () => {
  it('returns empty record for no items', () => {
    expect(packShelves([], COLS)).toEqual({})
  })

  it('places a single item at col 0, row 0', () => {
    const result = packShelves([{ id: 'fv-1', colSpan: 8, rowSpan: 10 }], COLS)
    expect(result['fv-1']).toEqual({ col: 0, row: 0 })
  })

  it('places two items side-by-side with a gap when they fit on one shelf', () => {
    const items: PackItem[] = [
      { id: 'fv-1', colSpan: 10, rowSpan: 8 },
      { id: 'fv-2', colSpan: 10, rowSpan: 8 },
    ]
    const gapCols = 2
    const result = packShelves(items, COLS, gapCols, 2)
    // Both fit on one row: fv-1 at 0, fv-2 at 10+2=12
    expect(result['fv-1'].row).toBe(0)
    expect(result['fv-2'].row).toBe(0)
    expect(result['fv-2'].col).toBe(result['fv-1'].col + items[0].colSpan + gapCols)
  })

  it('wraps to a new shelf when items overflow the row', () => {
    const items: PackItem[] = [
      { id: 'fv-1', colSpan: 20, rowSpan: 10 },
      { id: 'fv-2', colSpan: 20, rowSpan: 10 },
    ]
    const result = packShelves(items, COLS, 2, 2)
    // fv-2 cannot fit alongside fv-1 (20+2+20=42 > 32) → new shelf
    expect(result['fv-1'].row).toBe(0)
    expect(result['fv-2'].row).toBe(10 + 2)  // shelfHeight + gapRows
    expect(result['fv-2'].col).toBe(0)
  })

  it('applies the row gap between shelves', () => {
    const items: PackItem[] = [
      { id: 'fv-1', colSpan: 18, rowSpan: 12 },
      { id: 'fv-2', colSpan: 18, rowSpan: 8 },
    ]
    const gapRows = 4
    const result = packShelves(items, COLS, 2, gapRows)
    expect(result['fv-2'].row).toBe(12 + gapRows)
  })

  it('clamps an over-wide item to cols', () => {
    const items: PackItem[] = [{ id: 'fv-1', colSpan: 50, rowSpan: 5 }]
    const result = packShelves(items, COLS)
    // The clamped item still starts at col 0; just its effective span is capped
    expect(result['fv-1'].col).toBe(0)
  })

  it('is deterministic: equal-span items ordered by numeric id suffix', () => {
    const items: PackItem[] = [
      { id: 'fv-3', colSpan: 8, rowSpan: 8 },
      { id: 'fv-1', colSpan: 8, rowSpan: 8 },
      { id: 'fv-2', colSpan: 8, rowSpan: 8 },
    ]
    const result = packShelves(items, COLS)
    // Should be placed in order fv-1, fv-2, fv-3 (ascending numeric suffix)
    expect(result['fv-1'].col).toBeLessThan(result['fv-2'].col)
    expect(result['fv-2'].col).toBeLessThan(result['fv-3'].col)
  })

  it('sorts by descending rowSpan when spans differ', () => {
    const items: PackItem[] = [
      { id: 'fv-1', colSpan: 8, rowSpan: 4 },
      { id: 'fv-2', colSpan: 8, rowSpan: 12 },
    ]
    const result = packShelves(items, COLS)
    // fv-2 (taller) should be placed first (col 0)
    expect(result['fv-2'].col).toBe(0)
    expect(result['fv-1'].col).toBeGreaterThan(0)
  })

  it('has no pairwise overlaps for a realistic multi-panel set', () => {
    const items: PackItem[] = [
      { id: 'fv-1', colSpan: 19, rowSpan: 14 },
      { id: 'fv-2', colSpan: 11, rowSpan: 38 },
      { id: 'fv-3', colSpan: 8,  rowSpan: 6  },
      { id: 'fv-4', colSpan: 19, rowSpan: 20 },
    ]
    const result = packShelves(items, COLS)
    // Verify all items got a position
    for (const item of items) {
      expect(result[item.id]).toBeDefined()
    }
    assertNoOverlap(items, result)
  })
})

// ─── reconcileLayout (load + Tidy) ────────────────────────────────────────────

function assertNoOverlapRects(rects: Record<string, PlacedRect>): void {
  const entries = Object.entries(rects)
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [idA, a] = entries[i], [idB, b] = entries[j]
      const overlapsX = a.col < b.col + b.colSpan && a.col + a.colSpan > b.col
      const overlapsY = a.row < b.row + b.rowSpan && a.row + a.rowSpan > b.row
      expect(overlapsX && overlapsY, `${idA} overlaps ${idB}`).toBe(false)
    }
  }
}

describe('reconcileLayout', () => {
  it('returns empty record for no items', () => {
    expect(reconcileLayout([])).toEqual({})
  })

  it('shifts a single panel to the border margin', () => {
    const result = reconcileLayout([{ id: 'fv-1', col: 5, row: 8, colSpan: 6, rowSpan: 4 }])
    expect(result['fv-1']).toEqual({ col: 1, row: 1, colSpan: 6, rowSpan: 4 })
  })

  it('never resizes a panel', () => {
    const items: ReconcileItem[] = [
      { id: 'fv-1', col: 1, row: 1, colSpan: 40, rowSpan: 30 },
      { id: 'fv-2', col: 1, row: 35, colSpan: 40, rowSpan: 30 },
    ]
    const result = reconcileLayout(items)
    expect(result['fv-1'].colSpan).toBe(40)
    expect(result['fv-1'].rowSpan).toBe(30)
    expect(result['fv-2'].colSpan).toBe(40)
    expect(result['fv-2'].rowSpan).toBe(30)
  })

  it('leaves a clean, border-aligned layout unchanged (idempotent)', () => {
    const items: ReconcileItem[] = [
      { id: 'fv-1', col: 1, row: 1, colSpan: 10, rowSpan: 6 },        // column A, top
      { id: 'fv-2', col: 1, row: 8, colSpan: 10, rowSpan: 6 },        // column A, below (1-cell gap)
      { id: 'fv-3', col: 13, row: 1, colSpan: 6, rowSpan: 13 },       // column B
    ]
    const once = reconcileLayout(items)
    expect(once['fv-1']).toEqual({ col: 1, row: 1, colSpan: 10, rowSpan: 6 })
    expect(once['fv-2']).toEqual({ col: 1, row: 8, colSpan: 10, rowSpan: 6 })
    expect(once['fv-3']).toEqual({ col: 13, row: 1, colSpan: 6, rowSpan: 13 })
    // Running it again changes nothing.
    const twice = reconcileLayout(Object.entries(once).map(([id, r]) => ({ id, ...r })))
    expect(twice).toEqual(once)
  })

  it('keeps a vertically-stacked overlap in the same column (pushes down, not sideways)', () => {
    const items: ReconcileItem[] = [
      { id: 'fv-1', col: 1, row: 1, colSpan: 8, rowSpan: 10 },
      { id: 'fv-2', col: 1, row: 8, colSpan: 8, rowSpan: 10 },   // overlaps fv-1
    ]
    const result = reconcileLayout(items)
    assertNoOverlapRects(result)
    expect(result['fv-2'].col).toBe(result['fv-1'].col)                       // same column
    expect(result['fv-2'].row).toBe(result['fv-1'].row + result['fv-1'].rowSpan + 1) // bottom + gap
  })

  it('never changes a panel column, even when columns horizontally overlap at different rows', () => {
    // Mirrors the backing-track layout: a wide panel (fv-mf) spans under two columns
    // but sits below them, so nothing moves.
    const items: ReconcileItem[] = [
      { id: 'fv-drum', col: 1, row: 1, colSpan: 32, rowSpan: 17 },
      { id: 'fv-timer', col: 52, row: 1, colSpan: 21, rowSpan: 12 },
      { id: 'fv-mf', col: 1, row: 20, colSpan: 66, rowSpan: 30 }, // wide, below both
    ]
    const result = reconcileLayout(items)
    assertNoOverlapRects(result)
    expect(result['fv-drum'].col).toBe(1)
    expect(result['fv-timer'].col).toBe(52)
    expect(result['fv-mf'].col).toBe(1)
    expect(result['fv-mf'].colSpan).toBe(66)
  })

  it('applies a 1-cell border and inter-panel gap', () => {
    const items: ReconcileItem[] = [
      { id: 'fv-1', col: 0, row: 0, colSpan: 6, rowSpan: 6 },
      { id: 'fv-2', col: 0, row: 4, colSpan: 6, rowSpan: 6 }, // same column, overlaps
    ]
    const result = reconcileLayout(items)
    expect(result['fv-1'].col).toBe(1)
    expect(result['fv-1'].row).toBe(1)
    expect(result['fv-2'].row).toBe(result['fv-1'].row + result['fv-1'].rowSpan + 1)
  })
})

// ─── tidyLayout (Tidy button: slide down OR right) ────────────────────────────

describe('tidyLayout', () => {
  it('returns empty record for no items', () => {
    expect(tidyLayout([])).toEqual({})
  })

  it('shifts a single panel to the border margin without resizing', () => {
    const result = tidyLayout([{ id: 'fv-1', col: 5, row: 8, colSpan: 6, rowSpan: 4 }])
    expect(result['fv-1']).toEqual({ col: 1, row: 1, colSpan: 6, rowSpan: 4 })
  })

  it('leaves a clean, border-aligned layout unchanged (idempotent)', () => {
    const items: ReconcileItem[] = [
      { id: 'fv-1', col: 1, row: 1, colSpan: 10, rowSpan: 6 },
      { id: 'fv-2', col: 1, row: 8, colSpan: 10, rowSpan: 6 },
      { id: 'fv-3', col: 13, row: 1, colSpan: 6, rowSpan: 13 },
    ]
    const once = tidyLayout(items, { cols: COLS })
    expect(once['fv-1']).toEqual({ col: 1, row: 1, colSpan: 10, rowSpan: 6 })
    expect(once['fv-2']).toEqual({ col: 1, row: 8, colSpan: 10, rowSpan: 6 })
    expect(once['fv-3']).toEqual({ col: 13, row: 1, colSpan: 6, rowSpan: 13 })
    const twice = tidyLayout(Object.entries(once).map(([id, r]) => ({ id, ...r })), { cols: COLS })
    expect(twice).toEqual(once)
  })

  it('slides a side-by-side overlap RIGHT (small horizontal overlap, room to spare)', () => {
    const items: ReconcileItem[] = [
      { id: 'fv-1', col: 1, row: 1, colSpan: 10, rowSpan: 10 },
      { id: 'fv-2', col: 8, row: 2, colSpan: 10, rowSpan: 10 }, // overlaps fv-1 on the right
    ]
    const result = tidyLayout(items, { cols: COLS })
    assertNoOverlapRects(result)
    // fv-2 keeps roughly its row and moves right past fv-1, rather than dropping below.
    expect(result['fv-2'].row).toBe(2)
    expect(result['fv-2'].col).toBe(result['fv-1'].col + result['fv-1'].colSpan + 1)
  })

  it('pushes a vertical-stack overlap DOWN (same column; sliding right would cost a full width)', () => {
    const items: ReconcileItem[] = [
      { id: 'fv-1', col: 1, row: 1, colSpan: 10, rowSpan: 10 },
      { id: 'fv-2', col: 1, row: 8, colSpan: 10, rowSpan: 10 }, // overlaps fv-1 vertically
    ]
    const result = tidyLayout(items, { cols: COLS })
    assertNoOverlapRects(result)
    expect(result['fv-2'].col).toBe(result['fv-1'].col)
    expect(result['fv-2'].row).toBe(result['fv-1'].row + result['fv-1'].rowSpan + 1)
  })

  it('falls back to DOWN when there is no horizontal room to slide right', () => {
    // Two wide panels: 20 + gap + 20 cannot share a 32-col grid, so fv-2 must drop.
    const items: ReconcileItem[] = [
      { id: 'fv-1', col: 1, row: 1, colSpan: 20, rowSpan: 10 },
      { id: 'fv-2', col: 5, row: 3, colSpan: 20, rowSpan: 10 },
    ]
    const result = tidyLayout(items, { cols: COLS })
    assertNoOverlapRects(result)
    expect(result['fv-2'].row).toBe(result['fv-1'].row + result['fv-1'].rowSpan + 1)
  })

  it('never resizes a panel', () => {
    const items: ReconcileItem[] = [
      { id: 'fv-1', col: 1, row: 1, colSpan: 8, rowSpan: 6 },
      { id: 'fv-2', col: 4, row: 3, colSpan: 12, rowSpan: 9 },
    ]
    const result = tidyLayout(items, { cols: COLS })
    expect(result['fv-1'].colSpan).toBe(8)
    expect(result['fv-1'].rowSpan).toBe(6)
    expect(result['fv-2'].colSpan).toBe(12)
    expect(result['fv-2'].rowSpan).toBe(9)
  })

  it('produces a non-overlapping layout for a realistic, messy multi-panel set', () => {
    const items: ReconcileItem[] = [
      { id: 'fv-1', col: 1, row: 1, colSpan: 8, rowSpan: 6 },
      { id: 'fv-2', col: 6, row: 2, colSpan: 8, rowSpan: 6 },
      { id: 'fv-3', col: 3, row: 4, colSpan: 6, rowSpan: 8 },
      { id: 'fv-4', col: 12, row: 5, colSpan: 10, rowSpan: 7 },
    ]
    const result = tidyLayout(items, { cols: COLS })
    for (const it of items) expect(result[it.id]).toBeDefined()
    assertNoOverlapRects(result)
  })
})

describe('layoutBottomRow', () => {
  it('returns the largest row + rowSpan', () => {
    expect(layoutBottomRow([
      { col: 1, row: 1, colSpan: 4, rowSpan: 6 },
      { col: 1, row: 8, colSpan: 4, rowSpan: 10 },
    ])).toBe(18)
  })
  it('returns 0 for an empty layout', () => {
    expect(layoutBottomRow([])).toBe(0)
  })
})
