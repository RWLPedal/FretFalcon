// ts/panels/grid_constants.ts
// DOM-free grid coordinate constants and px↔cell helpers.
// Migrations and tests import from here — keep this file free of DOM imports.
//
// Coordinate model:
//   The floating workspace is divided into GRID_COLS columns spanning the CONTENT
//   region (the area to the right of the sidebar). Column 0 sits at the sidebar's
//   right edge — see GridGeometry.originX — so a config authored as col 0..GRID_COLS
//   always spans exactly the visible content at any window size.
//
//   Cells are SQUARE: the same `cell` edge length is used for both column width and
//   row height, so panels keep their proportions when the window resizes. The cell
//   size scales with the content width (clamped to [MIN_CELL_PX, MAX_CELL_PX]).

/** Number of columns the content region is divided into (react-grid-layout style). */
export const GRID_COLS = 96;

/** Reference HEIGHT of the workspace, in rows. The grid is a fixed GRID_COLS × DESIGN_ROWS
 *  cell "design space" scaled uniformly to fit the viewport (see {@link fitGridGeometry}):
 *  the cell is the largest square that fits GRID_COLS across the content width AND
 *  DESIGN_ROWS down the height. Crucially this depends ONLY on the viewport — never on the
 *  open layout — so the grid size is identical for every layout and changes only when the
 *  window does. Author layouts within ~0..GRID_COLS cols and ~0..DESIGN_ROWS rows. */
export const DESIGN_ROWS = 61;

/** Square cell edge clamps (px). Prevents giant panels on ultrawide monitors and
 *  illegibly small ones on narrow windows. */
export const MIN_CELL_PX = 8;
export const MAX_CELL_PX = 22;

/** Vestigial 16px row unit. Retained ONLY as the value written to the persisted
 *  `rowPx` field and the V4 stamp; live geometry uses the square GridGeometry.cell.
 *  Do not use for new coordinate math. */
export const ROW_PX = 16;

/** Live grid geometry for a workspace. Computed once per layout operation from the
 *  content area width and the sidebar offset. */
export interface GridGeometry {
  /** Square cell edge length, in px. */
  readonly cell: number;
  /** Pixel x of grid column 0 (== sidebar width). */
  readonly originX: number;
  /** Column count (== GRID_COLS). */
  readonly cols: number;
}

/** Clamp a raw cell size to the legible square-cell range, floored to an integer
 *  px so grid lines stay crisp. */
export function clampCell(raw: number): number {
  return Math.floor(Math.max(MIN_CELL_PX, Math.min(MAX_CELL_PX, raw)));
}

/** Build the grid geometry for a given full area width and sidebar offset. */
export function gridGeometry(areaWidth: number, sidebarWidth: number): GridGeometry {
  const contentWidth = Math.max(1, areaWidth - sidebarWidth);
  return { cell: clampCell(contentWidth / GRID_COLS), originX: sidebarWidth, cols: GRID_COLS };
}

/**
 * Fit-aware geometry: like {@link gridGeometry}, but the cell is also bounded so a
 * layout `layoutRows` cells tall fits within `availableHeight` px. This is how a
 * saved/authored layout "scales down to fit" a shorter screen — the cell shrinks
 * uniformly, preserving the layout's proportions and column alignment, leaving a
 * right margin. The height term only ever *lowers* the cell (never enlarges past the
 * width-based size). Pass `layoutRows = 0` (empty workspace) to get the plain
 * width-based cell.
 */
export function fitGridGeometry(
  areaWidth: number,
  sidebarWidth: number,
  availableHeight: number,
  layoutRows: number,
): GridGeometry {
  const contentWidth = Math.max(1, areaWidth - sidebarWidth);
  const widthCell = contentWidth / GRID_COLS;
  const heightCell = layoutRows > 0 ? availableHeight / layoutRows : Infinity;
  return { cell: clampCell(Math.min(widthCell, heightCell)), originX: sidebarWidth, cols: GRID_COLS };
}

/** Convert a (possibly fractional) column number to a pixel x-coordinate. */
export function colToPx(col: number, g: GridGeometry): number {
  return g.originX + col * g.cell;
}

/** Convert a pixel x-coordinate to a (possibly fractional) column number. */
export function pxToCol(px: number, g: GridGeometry): number {
  return (px - g.originX) / g.cell;
}

/** Convert a (possibly fractional) row number to a pixel y-coordinate. */
export function rowToPx(row: number, g: GridGeometry): number {
  return row * g.cell;
}

/** Convert a pixel y-coordinate to a (possibly fractional) row number. */
export function pxToRow(py: number, g: GridGeometry): number {
  return py / g.cell;
}

/** Snap `v` to the nearest multiple of `unit`. */
export function snapToUnit(v: number, unit: number): number {
  return Math.round(v / unit) * unit;
}

/** Returns true if the right/bottom edge of every entry fits within the area
 *  (areaWidth × areaHeight px), given geometry `g`. */
export function allPanelsFit(
  perInstance: Record<string, { col: number; row: number; colSpan?: number; rowSpan?: number }>,
  areaWidth: number,
  areaHeight: number,
  g: GridGeometry,
): boolean {
  for (const p of Object.values(perInstance)) {
    const right = colToPx(p.col + (p.colSpan ?? 1), g);
    const bottom = rowToPx(p.row + (p.rowSpan ?? 1), g);
    // Half-px slack absorbs integer-cell rounding.
    if (right > areaWidth + 0.5 || bottom > areaHeight + 0.5) return false;
  }
  return true;
}
