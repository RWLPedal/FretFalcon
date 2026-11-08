// tests/unit/panels/grid_geometry.test.ts
// fitGridGeometry invariants — the math that decides the grid cell on every device.
//
// Complements grid_coords.test.ts (which covers clampCell / gridGeometry / px↔cell
// round-trips): this file pins the FIT-aware geometry that scales a layout to the
// viewport, the caller contract that keeps the cell layout-independent, and the exact
// cells the Playwright viewport matrix produces — so a constants change fails here,
// in a fast unit test, before it churns browser goldens.

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  GRID_COLS,
  DESIGN_ROWS,
  MIN_CELL_PX,
  MAX_CELL_PX,
  clampCell,
  gridGeometry,
  fitGridGeometry,
  allPanelsFit,
} from '../../../ts/panels/grid_constants';

// Sample spaces for the property-style checks below.
const WIDTHS = [200, 320, 375, 768, 1024, 1366, 1600, 1920, 2560, 3440];
const HEIGHTS = [200, 560, 568, 768, 812, 1024, 1080, 1366, 2000];
const SIDEBARS = [0, 60, 220];

describe('fitGridGeometry', () => {
  it('cell = clampCell(min(width-fit, height-fit)) — the documented model', () => {
    for (const w of WIDTHS)
      for (const h of HEIGHTS)
        for (const s of SIDEBARS) {
          const g = fitGridGeometry(w, s, h, DESIGN_ROWS);
          const contentWidth = Math.max(1, w - s);
          const expected = clampCell(Math.min(contentWidth / GRID_COLS, h / DESIGN_ROWS));
          expect(g.cell).toBe(expected);
          expect(g.originX).toBe(s);
          expect(g.cols).toBe(GRID_COLS);
        }
  });

  it('the height term only ever LOWERS the cell, never enlarges past the width fit', () => {
    for (const w of WIDTHS)
      for (const h of HEIGHTS)
        for (const s of SIDEBARS) {
          expect(fitGridGeometry(w, s, h, DESIGN_ROWS).cell).toBeLessThanOrEqual(
            gridGeometry(w, s).cell,
          );
        }
  });

  it('layoutRows = 0 (empty workspace) degrades to the plain width-based cell', () => {
    for (const w of WIDTHS)
      for (const s of SIDEBARS) {
        expect(fitGridGeometry(w, s, 200, 0).cell).toBe(gridGeometry(w, s).cell);
      }
  });

  it('cell is monotonically non-decreasing in width and in height', () => {
    for (const s of SIDEBARS) {
      for (let i = 1; i < WIDTHS.length; i++) {
        expect(
          fitGridGeometry(WIDTHS[i], s, 900, DESIGN_ROWS).cell,
        ).toBeGreaterThanOrEqual(fitGridGeometry(WIDTHS[i - 1], s, 900, DESIGN_ROWS).cell);
      }
      for (let i = 1; i < HEIGHTS.length; i++) {
        expect(
          fitGridGeometry(1920, s, HEIGHTS[i], DESIGN_ROWS).cell,
        ).toBeGreaterThanOrEqual(
          fitGridGeometry(1920, s, HEIGHTS[i - 1], DESIGN_ROWS).cell,
        );
      }
    }
  });

  it('cell is always an integer within [MIN_CELL_PX, MAX_CELL_PX], even for degenerate inputs', () => {
    const degenerate: Array<[number, number, number, number]> = [
      [0, 0, 0, DESIGN_ROWS],
      [10, 500, 10, DESIGN_ROWS], // area narrower than sidebar → contentWidth floors at 1
      [100000, 0, 100000, DESIGN_ROWS],
      [1, 1, 1, 1],
    ];
    for (const [w, s, h, rows] of degenerate) {
      const cell = fitGridGeometry(w, s, h, rows).cell;
      expect(Number.isInteger(cell)).toBe(true);
      expect(cell).toBeGreaterThanOrEqual(MIN_CELL_PX);
      expect(cell).toBeLessThanOrEqual(MAX_CELL_PX);
    }
  });
});

describe('viewport pins (the Playwright matrix, at zero sidebar)', () => {
  // These are the raw fitGridGeometry results for each tested viewport size. The real
  // app subtracts sidebar/topbar space so live cells can be smaller — but a change to
  // GRID_COLS / DESIGN_ROWS / the clamps shifts these pins first, in milliseconds.
  const pin = (w: number, h: number) => fitGridGeometry(w, 0, h, DESIGN_ROWS).cell;

  it('desktop 1920×1080 → 17px cell (height-bound: 1080/61)', () => {
    expect(pin(1920, 1080)).toBe(17);
  });
  it('laptop 1366×768 → 12px cell (height-bound, near the floor)', () => {
    expect(pin(1366, 768)).toBe(12);
  });
  it('short-wide 1600×560 → hits the MIN_CELL_PX floor (raw fit 560/61 ≈ 9.2 < 12)', () => {
    expect(560 / DESIGN_ROWS).toBeLessThan(MIN_CELL_PX);
    expect(pin(1600, 560)).toBe(MIN_CELL_PX);
  });
  it('ultrawide 2560×2000 → hits the MAX_CELL_PX ceiling (raw fit 2560/96 ≈ 26.7 > 22)', () => {
    expect(2560 / GRID_COLS).toBeGreaterThan(MAX_CELL_PX);
    expect(pin(2560, 2000)).toBe(MAX_CELL_PX);
  });
  it('phone 375×812 → floor cell (width-bound: 375/96 ≈ 3.9 < 12)', () => {
    expect(pin(375, 812)).toBe(MIN_CELL_PX);
  });
});

describe('allPanelsFit half-px slack boundary', () => {
  const g = { cell: 10, originX: 0, cols: GRID_COLS } as const;

  it('an edge exactly 0.5px past the area still passes; 0.51px fails', () => {
    // One panel: right edge at colToPx(10) = 100px.
    const p = { a: { col: 0, row: 0, colSpan: 10, rowSpan: 2 } };
    expect(allPanelsFit(p, 99.5, 100, g)).toBe(true);
    expect(allPanelsFit(p, 99.49, 100, g)).toBe(false);
    // Bottom edge at rowToPx(2) = 20px.
    expect(allPanelsFit(p, 200, 19.5, g)).toBe(true);
    expect(allPanelsFit(p, 200, 19.49, g)).toBe(false);
  });
});

describe('caller contract: the cell depends only on the viewport', () => {
  it('floating_layout.ts always fits against the constant DESIGN_ROWS, never the open layout', () => {
    // Source-as-text pin (the runtime caller is DOM-bound). If fitGridGeometry were fed
    // the layout's own row count, switching layouts would resize the whole grid — the
    // invariant grid_constants.ts documents. Every call site must pass DESIGN_ROWS.
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../../ts/panels/layout/floating_layout.ts'),
      'utf-8',
    );
    // Find each call site (skip the import line) and require DESIGN_ROWS within the
    // argument window. Calls span lines and nest parens, so a simple window beats a
    // balanced-paren parse here.
    const sites: string[] = [];
    const re = /fitGridGeometry\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const lineStart = src.lastIndexOf('\n', m.index) + 1;
      const line = src.slice(lineStart, src.indexOf('\n', m.index));
      if (/^\s*(import|\}\s*from)/.test(line)) continue;
      sites.push(src.slice(m.index, m.index + 200));
    }
    expect(sites.length).toBeGreaterThan(0);
    for (const site of sites) {
      expect(
        site.includes('DESIGN_ROWS'),
        `fitGridGeometry call site does not pass DESIGN_ROWS as layoutRows:\n${site}`,
      ).toBe(true);
    }
  });
});
