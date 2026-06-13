import { describe, it, expect } from 'vitest'
import { findBestGridLayout } from '../../../ts/fretboard/layout'

// Helper: uniform canvas budget — every column count gets the same per-element size.
function uniform(w: number, h: number) {
  return (_cols: number) => ({ w, h })
}

// ─── findBestGridLayout ───────────────────────────────────────────────────────

describe('findBestGridLayout — basic layout', () => {
  it('1 item, maxCols=1 → cols=1, rows=1', () => {
    const result = findBestGridLayout(1, 1, 1.0, uniform(400, 400))
    expect(result.cols).toBe(1)
    expect(result.rows).toBe(1)
  })

  it('element dimensions are non-negative', () => {
    const result = findBestGridLayout(4, 6, 1.5, uniform(800, 600))
    expect(result.elementW).toBeGreaterThan(0)
    expect(result.elementH).toBeGreaterThan(0)
  })

  it('rows = ceil(itemCount / cols)', () => {
    const result = findBestGridLayout(4, 7, 1.0, uniform(400, 300))
    expect(result.rows).toBe(Math.ceil(7 / result.cols))
  })
})

describe('findBestGridLayout — aspect ratio binding', () => {
  it('wide canvas (width-surplus) → height-limited: element fills height', () => {
    // Canvas 1600×400, aspect 1.0 → height-limited → elemH=400, elemW=400
    const result = findBestGridLayout(1, 1, 1.0, uniform(1600, 400))
    expect(result.elementH).toBeCloseTo(400, 1)
    expect(result.elementW).toBeCloseTo(400, 1)
  })

  it('tall canvas (height-surplus) → width-limited: element fills width', () => {
    // Canvas 400×1600, aspect 1.0 → width-limited → elemW=400, elemH=400
    const result = findBestGridLayout(1, 1, 1.0, uniform(400, 1600))
    expect(result.elementW).toBeCloseTo(400, 1)
    expect(result.elementH).toBeCloseTo(400, 1)
  })

  it('aspect ratio is respected: elemW / elemH ≈ aspectRatio', () => {
    const aspectRatio = 0.6  // typical portrait chord diagram
    const result = findBestGridLayout(1, 1, aspectRatio, uniform(300, 600))
    expect(result.elementW / result.elementH).toBeCloseTo(aspectRatio, 3)
  })
})

describe('findBestGridLayout — maximises element area', () => {
  it('prefers fewer cols when items are few and canvas is tall', () => {
    // 2 items, tall canvas: 1 column gives large height per item; 2 columns splits width.
    // With a 1.0 aspect ratio in a 200×800 space: 1-col elemH=400, elemW=200 → area 80000
    // 2-col: each cell is 200×400, height-limited → elemH=200, elemW=200 → area 40000
    // So 1 col should win.
    const result = findBestGridLayout(2, 2, 1.0, (_cols) => ({
      w: 200 / _cols,
      h: 800 / Math.ceil(2 / _cols),
    }))
    expect(result.cols).toBe(1)
  })

  it('prefers more cols when canvas is very wide', () => {
    // 4 items in 1600×200: 4 columns gives w=400, height-limited → elemH=200, elemW=200 → area 40000
    // 1 column: w=1600, h=200, width-limited → elemW=1600, elemH=1600... but h=200 so height-limited
    //   actually: 1600/200 > aspect(1.0) → height-limited: elemH=200, elemW=200 → area 40000
    // 2 cols: w=800, h=200 → height-limited: elemH=200, elemW=200 → area 40000 (same)
    // 4 cols: w=400, h=200 → height-limited: elemH=200, elemW=200 → area 40000 (same for 1.0 ratio)
    // With a 0.5 aspect: portrait cards
    // 1 col: w=1600, h=200 → w/h=8 > 0.5 → height-limited → elemH=200, elemW=100 → area=20000
    // 4 cols: w=400, h=200 → w/h=2 > 0.5 → height-limited → elemH=200, elemW=100 → area=20000
    // With aspect=4.0 (landscape):
    // 4 cols: w=400, h=200 → w/h=2 < 4 → width-limited → elemW=400, elemH=100 → area=40000
    // 1 col: w=1600, h=200 → w/h=8 > 4 → height-limited → elemH=200, elemW=800 → area=160000 ← winner
    // So 1 col wins with landscape aspect on a wide canvas. Try a narrower case.
    // With 4 items in equal square: each col layout gives same size when uniform budget.
    // Use a realistic diminishing-returns case: per-element budget shrinks with more columns.
    const result = findBestGridLayout(4, 4, 1.0, (cols) => ({
      w: 800 / cols,
      h: 200 / Math.ceil(4 / cols),
    }))
    // With 1 col: w=800, h=50 → h-limited → elemH=50, elemW=50 → area=2500
    // With 2 cols: w=400, h=100 → h-limited → elemH=100, elemW=100 → area=10000
    // With 4 cols: w=200, h=200 → equal → elemH=200, elemW=200 → area=40000 ← winner
    expect(result.cols).toBe(4)
  })
})

describe('findBestGridLayout — degenerate inputs', () => {
  it('zero canvas size candidates are skipped; returns fallback cols=1', () => {
    const result = findBestGridLayout(4, 4, 1.0, () => ({ w: 0, h: 0 }))
    expect(result.cols).toBe(1)
    expect(result.elementW).toBe(0)
    expect(result.elementH).toBe(0)
  })

  it('negative canvas size is treated as invalid, returns fallback', () => {
    const result = findBestGridLayout(4, 4, 1.0, () => ({ w: -10, h: 100 }))
    expect(result.cols).toBe(1)
  })
})
