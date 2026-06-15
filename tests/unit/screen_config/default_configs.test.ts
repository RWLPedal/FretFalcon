import { describe, it, expect } from 'vitest'
import { DEFAULT_CONFIGS } from '../../../ts/screen_config/default_configs'
import { GRID_COLS, DESIGN_ROWS } from '../../../ts/panels/grid_constants'

// Every bundled layout is authored in grid cells against a fixed GRID_COLS × DESIGN_ROWS
// design space. A panel whose right edge spills past GRID_COLS breaks the load path
// (reconcileLayout's border-shift clamp goes negative, killing the edge margin) AND the
// Tidy path (gravityCompact clamps the over-wide panel back onto a neighbour, cascading
// the whole layout into a vertical stack). This was the PRACTICE_LAYOUT "Any view" bug:
// it was authored 60 cells wide at col 50 (right edge col 110, 14 past the 96-col grid).
describe('bundled default layouts fit the grid', () => {
  for (const [key, entry] of Object.entries(DEFAULT_CONFIGS)) {
    const perInstance = entry.default.layout?.floating?.perInstance ?? {}

    it(`"${key}" keeps every panel within GRID_COLS columns`, () => {
      for (const [id, rect] of Object.entries(perInstance)) {
        const right = rect.col + (rect.colSpan ?? 1)
        expect(right, `${key}/${id} right edge (col ${rect.col} + colSpan ${rect.colSpan})`)
          .toBeLessThanOrEqual(GRID_COLS)
      }
    })

    it(`"${key}" keeps every panel within DESIGN_ROWS rows`, () => {
      for (const [id, rect] of Object.entries(perInstance)) {
        const bottom = rect.row + (rect.rowSpan ?? 1)
        expect(bottom, `${key}/${id} bottom edge (row ${rect.row} + rowSpan ${rect.rowSpan})`)
          .toBeLessThanOrEqual(DESIGN_ROWS)
      }
    })
  }
})
