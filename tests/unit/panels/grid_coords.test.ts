import { describe, it, expect } from 'vitest'
import {
  GRID_COLS,
  MIN_CELL_PX,
  MAX_CELL_PX,
  clampCell,
  gridGeometry,
  pxToCol,
  colToPx,
  pxToRow,
  rowToPx,
  snapToUnit,
  allPanelsFit,
} from '../../../ts/panels/grid_constants'

describe('clampCell', () => {
  it('clamps into [MIN_CELL_PX, MAX_CELL_PX] and floors to an integer', () => {
    expect(clampCell(0.3)).toBe(MIN_CELL_PX)
    expect(clampCell(5000)).toBe(MAX_CELL_PX)
    expect(clampCell(20.9)).toBe(20)
  })
})

describe('gridGeometry', () => {
  it('divides the CONTENT width (area − sidebar) into GRID_COLS square cells', () => {
    const g = gridGeometry(1200, 200) // content = 1000
    expect(g.cols).toBe(GRID_COLS)
    expect(g.originX).toBe(200)
    expect(g.cell).toBe(clampCell(1000 / GRID_COLS)) // floor(31.25) = 31
  })

  it('clamps the cell size on extreme widths', () => {
    expect(gridGeometry(100000, 0).cell).toBe(MAX_CELL_PX)
    expect(gridGeometry(10, 0).cell).toBe(MIN_CELL_PX)
  })
})

describe('pxToCol / colToPx round-trip (content-anchored)', () => {
  const g = gridGeometry(1200, 200)

  it('col 0 maps to the content origin (sidebar right edge)', () => {
    expect(colToPx(0, g)).toBe(g.originX)
  })

  it('round-trips at a cell boundary', () => {
    const px = colToPx(8, g)
    expect(pxToCol(px, g)).toBe(8)
  })

  it('round-trips a fractional position', () => {
    const px = colToPx(5, g) + g.cell / 2
    expect(colToPx(pxToCol(px, g), g)).toBeCloseTo(px, 6)
  })
})

describe('pxToRow / rowToPx round-trip (square cells)', () => {
  const g = gridGeometry(1200, 200)

  it('round-trips at a row boundary', () => {
    const py = rowToPx(10, g)
    expect(pxToRow(py, g)).toBe(10)
  })

  it('a row is one square cell tall (== a column is wide)', () => {
    expect(rowToPx(1, g)).toBe(g.cell)
    expect(rowToPx(1, g)).toBe(colToPx(1, g) - colToPx(0, g))
  })
})

describe('snapToUnit', () => {
  it('rounds to nearest unit', () => {
    expect(snapToUnit(17, 12)).toBe(12)
    expect(snapToUnit(19, 12)).toBe(24)
    expect(snapToUnit(18, 12)).toBe(24)
  })
})

describe('allPanelsFit', () => {
  const g = gridGeometry(1200, 200) // originX 200, content 1000, GRID_COLS 96 → cell 10

  it('returns true when all panels are within the area', () => {
    const perInstance = {
      'fv-1': { col: 0, row: 0, colSpan: 8, rowSpan: 5 },
      'fv-2': { col: 9, row: 0, colSpan: 8, rowSpan: 5 },
    }
    expect(allPanelsFit(perInstance, 1200, 800, g)).toBe(true)
  })

  it('returns false when a panel overflows right', () => {
    // right edge = colToPx(80+20) = 200 + 100*10 = 1200 > 1100
    const perInstance = { 'fv-1': { col: 80, row: 0, colSpan: 20, rowSpan: 5 } }
    expect(allPanelsFit(perInstance, 1100, 800, g)).toBe(false)
  })

  it('returns false when a panel overflows the bottom', () => {
    // bottom = rowToPx(0+70) = 70*10 = 700 > 600
    const perInstance = { 'fv-1': { col: 0, row: 0, colSpan: 4, rowSpan: 70 } }
    expect(allPanelsFit(perInstance, 1200, 600, g)).toBe(false)
  })

  it('returns true for an empty layout', () => {
    expect(allPanelsFit({}, 800, 600, g)).toBe(true)
  })
})
