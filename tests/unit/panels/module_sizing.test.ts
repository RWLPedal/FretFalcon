// tests/unit/panels/module_sizing.test.ts
// Every module's declared panel footprint is sane for the GRID_COLS × DESIGN_ROWS
// design space. This is the unit-level guard for "panel doesn't fit on some device":
// a bad declaration here is what later shows up as an overflowing or illegible panel
// in the browser suite.
//
// Modules are enumerated from the filesystem and imported INDIVIDUALLY — the
// require.context manifest (ts/modules/manifest.ts) is webpack-only and must never be
// imported from vitest.

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { listModuleFiles } from '../helpers/module_files';
import {
  GRID_COLS,
  DESIGN_ROWS,
  MIN_CELL_PX,
} from '../../../ts/panels/grid_constants';
import type { PanelSizing, GridSize } from '../../../ts/panels/panel_sizing';

// Modules whose import chain touches the DOM at module scope and therefore cannot be
// loaded under vitest's node environment. This list may only SHRINK — if a new module
// lands here, its import chain grew a DOM dependency at module scope (usually by
// importing a view implementation eagerly instead of inside createView()).
const NOT_NODE_IMPORTABLE = new Set<string>([]);

/** A panel's min must give it a legible px footprint even at the smallest cell. */
const MIN_LEGIBLE_PX = 48;

interface LoadedModule {
  name: string;
  mod: {
    id?: unknown;
    panel?: { size?: PanelSizing; sizeHorizontal?: PanelSizing };
  };
}

const files = listModuleFiles();
const loaded: LoadedModule[] = [];
const failed: string[] = [];

for (const file of files) {
  const name = path.basename(path.dirname(file));
  try {
    // Vitest transforms TS on the fly; a module is importable unless its import
    // chain touches the DOM at module scope.
    const mod = (await import(file)).default;
    loaded.push({ name, mod });
  } catch {
    failed.push(name);
  }
}

describe('module import health', () => {
  it('only known modules are non-importable under node (list may only shrink)', () => {
    const unexpected = failed.filter((n) => !NOT_NODE_IMPORTABLE.has(n));
    expect(
      unexpected,
      `modules newly non-importable under node (DOM import at module scope?): ${unexpected.join(', ')}`,
    ).toEqual([]);
    const fixed = [...NOT_NODE_IMPORTABLE].filter((n) => !failed.includes(n));
    expect(
      fixed,
      `modules now import cleanly — remove from NOT_NODE_IMPORTABLE: ${fixed.join(', ')}`,
    ).toEqual([]);
  });

  it('imports the vast majority of modules', () => {
    expect(loaded.length).toBeGreaterThanOrEqual(20);
  });
});

// ─── Per-module sizing checks ─────────────────────────────────────────────────

function checkAxis(
  label: string,
  min: number | undefined,
  def: number | undefined,
  max: number | undefined,
): void {
  if (min !== undefined && def !== undefined) {
    expect(min, `${label}: min > default`).toBeLessThanOrEqual(def);
  }
  if (def !== undefined && max !== undefined) {
    expect(def, `${label}: default > max`).toBeLessThanOrEqual(max);
  }
}

describe('module panel sizing declarations', () => {
  for (const { name, mod } of loaded) {
    const footprints: Array<[string, PanelSizing]> = [];
    if (mod.panel?.size) footprints.push(['size', mod.panel.size]);
    if (mod.panel?.sizeHorizontal) footprints.push(['sizeHorizontal', mod.panel.sizeHorizontal]);

    it(`${name}: declares a default footprint`, () => {
      expect(mod.panel, `${name} has no panel descriptor`).toBeDefined();
      expect(footprints.length, `${name} declares no size at all`).toBeGreaterThan(0);
      for (const [, sizing] of footprints) {
        expect(sizing.default).toBeDefined();
      }
    });

    for (const [key, sizing] of footprints) {
      const label = `${name}.${key}`;

      it(`${label}: min ≤ default ≤ max, component-wise`, () => {
        checkAxis(`${label}.cols`, sizing.min?.cols, sizing.default.cols, sizing.max?.cols);
        checkAxis(`${label}.rows`, sizing.min?.rows, sizing.default.rows, sizing.max?.rows);
      });

      it(`${label}: fits the design space`, () => {
        // Horizontal overflow is never acceptable — there is no sideways scroll.
        for (const [which, g] of Object.entries({
          default: sizing.default,
          min: sizing.min,
          max: sizing.max,
        }) as Array<[string, GridSize | undefined]>) {
          if (!g) continue;
          expect(g.cols, `${label}.${which}.cols exceeds GRID_COLS`).toBeLessThanOrEqual(
            GRID_COLS,
          );
        }
        // Vertical: default and min must fit DESIGN_ROWS. `max` MAY exceed it —
        // scroll-instead-of-shrink makes vertical overflow legitimate for a panel the
        // user grows deliberately (e.g. legend's max of 62 rows).
        expect(
          sizing.default.rows ?? 0,
          `${label}.default.rows exceeds DESIGN_ROWS — the panel cannot fit any screen without scrolling`,
        ).toBeLessThanOrEqual(DESIGN_ROWS);
        expect(sizing.min?.rows ?? 0, `${label}.min.rows exceeds DESIGN_ROWS`).toBeLessThanOrEqual(
          DESIGN_ROWS,
        );
      });

      it(`${label}: legible at the smallest cell`, () => {
        // The effective floor is min when declared, else default. At MIN_CELL_PX the
        // panel must still get a usable px box on both axes.
        const floor = sizing.min ?? sizing.default;
        expect(
          floor.cols * MIN_CELL_PX,
          `${label} can shrink to ${floor.cols * MIN_CELL_PX}px wide`,
        ).toBeGreaterThanOrEqual(MIN_LEGIBLE_PX);
        if (floor.rows !== undefined) {
          expect(
            floor.rows * MIN_CELL_PX,
            `${label} can shrink to ${floor.rows * MIN_CELL_PX}px tall`,
          ).toBeGreaterThanOrEqual(MIN_LEGIBLE_PX);
        }
      });
    }
  }
});
