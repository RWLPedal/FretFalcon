// tests/unit/panels/panel_sizing.test.ts
// resolveSizing orientation-fallback contract + FEATURE_PANEL_SIZE sanity.
//
// Every panel's px footprint starts from resolveSizing(desc, orientation), so the
// fallback rules here are load-bearing for layout on every device: a wrong fallback
// spawns a rotated panel at its portrait footprint (or vice versa).

import { describe, it, expect } from 'vitest';
import {
  resolveSizing,
  FEATURE_PANEL_SIZE,
  PanelSizing,
} from '../../../ts/panels/panel_sizing';
import { GRID_COLS, DESIGN_ROWS } from '../../../ts/panels/grid_constants';

const VERTICAL: PanelSizing = { default: { cols: 20, rows: 30 } };
const HORIZONTAL: PanelSizing = { default: { cols: 40, rows: 15 } };

describe('resolveSizing', () => {
  it('returns undefined when the descriptor carries no sizing at all', () => {
    expect(resolveSizing(undefined, 'vertical')).toBeUndefined();
    expect(resolveSizing(undefined, 'horizontal')).toBeUndefined();
    expect(resolveSizing({}, 'vertical')).toBeUndefined();
    expect(resolveSizing({}, 'horizontal')).toBeUndefined();
  });

  it('uses `size` for both orientations when no horizontal override exists', () => {
    const desc = { size: VERTICAL };
    expect(resolveSizing(desc, 'vertical')).toBe(VERTICAL);
    expect(resolveSizing(desc, 'horizontal')).toBe(VERTICAL);
  });

  it('falls back to `sizeHorizontal` for vertical when only it is declared', () => {
    const desc = { sizeHorizontal: HORIZONTAL };
    expect(resolveSizing(desc, 'horizontal')).toBe(HORIZONTAL);
    expect(resolveSizing(desc, 'vertical')).toBe(HORIZONTAL);
  });

  it('picks the orientation-matching footprint when both are declared', () => {
    const desc = { size: VERTICAL, sizeHorizontal: HORIZONTAL };
    expect(resolveSizing(desc, 'vertical')).toBe(VERTICAL);
    expect(resolveSizing(desc, 'horizontal')).toBe(HORIZONTAL);
  });
});

describe('FEATURE_PANEL_SIZE', () => {
  it('declares both orientations', () => {
    expect(FEATURE_PANEL_SIZE.size).toBeDefined();
    expect(FEATURE_PANEL_SIZE.sizeHorizontal).toBeDefined();
  });

  it('both defaults fit the GRID_COLS × DESIGN_ROWS design space', () => {
    for (const sizing of [FEATURE_PANEL_SIZE.size, FEATURE_PANEL_SIZE.sizeHorizontal]) {
      expect(sizing.default.cols).toBeLessThanOrEqual(GRID_COLS);
      expect(sizing.default.rows ?? 0).toBeLessThanOrEqual(DESIGN_ROWS);
    }
  });

  it('horizontal is wider and shorter than vertical (rotated footprint)', () => {
    const v = FEATURE_PANEL_SIZE.size.default;
    const h = FEATURE_PANEL_SIZE.sizeHorizontal.default;
    expect(h.cols).toBeGreaterThan(v.cols);
    expect(h.rows!).toBeLessThan(v.rows!);
  });
});
