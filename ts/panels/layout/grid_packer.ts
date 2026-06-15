// ts/panels/layout/grid_packer.ts
// Pure, testable shelf bin-packer used for layout Cleanup and packer-on-overflow restore.

export interface PackItem {
  id: string;
  colSpan: number;
  rowSpan: number;
}

/**
 * Pack items into shelves left→right, wrapping to a new shelf when a row is full.
 * Stable-sort order: descending rowSpan, then colSpan, then numeric id suffix (fv-N).
 * Items wider than `cols` are clamped to `cols`.
 * Returns a map of id → { col, row } top-left corner in grid-cell coordinates.
 */
export function packShelves(
  items: PackItem[],
  cols: number,
  gapCols = 2,
  gapRows = 2,
): Record<string, { col: number; row: number }> {
  if (items.length === 0) return {};

  const clamped: PackItem[] = items.map(item => ({
    ...item,
    colSpan: Math.min(item.colSpan, cols),
  }));

  const sorted = [...clamped].sort((a, b) => {
    if (b.rowSpan !== a.rowSpan) return b.rowSpan - a.rowSpan;
    if (b.colSpan !== a.colSpan) return b.colSpan - a.colSpan;
    // Numeric suffix for fv-N creation order
    const numA = parseInt(a.id.replace(/\D+/g, ''), 10) || 0;
    const numB = parseInt(b.id.replace(/\D+/g, ''), 10) || 0;
    return numA - numB;
  });

  const result: Record<string, { col: number; row: number }> = {};
  let shelfCol = 0;
  let shelfRow = 0;
  let shelfHeight = 0;

  for (const item of sorted) {
    if (shelfCol > 0 && shelfCol + item.colSpan > cols) {
      shelfRow += shelfHeight + gapRows;
      shelfCol = 0;
      shelfHeight = 0;
    }

    result[item.id] = { col: shelfCol, row: shelfRow };
    shelfCol += item.colSpan + gapCols;
    shelfHeight = Math.max(shelfHeight, item.rowSpan);
  }

  return result;
}

// ─── Preserve-X, push-down de-overlap (load + Tidy) ───────────────────────────

export interface ReconcileItem {
  id: string;
  /** Top-left + size, in grid cells. */
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
}

export interface PlacedRect {
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
}

function idNum(id: string): number {
  return parseInt(id.replace(/\D+/g, ''), 10) || 0;
}

/** True when two canonical grid rects overlap on both axes. */
function rectsOverlap(a: PlacedRect, b: PlacedRect): boolean {
  return a.col < b.col + b.colSpan && a.col + a.colSpan > b.col
      && a.row < b.row + b.rowSpan && a.row + a.rowSpan > b.row;
}

/**
 * Reconcile an authored / dragged layout into an aligned, non-overlapping one while
 * staying as close to the input as possible. The rules that make it "look like the
 * layout you authored":
 *
 *   - Each panel keeps its column EXACTLY (its `col` and `colSpan` are never changed),
 *     so panels the author aligned by giving them the same `col` stay lined up.
 *   - Panels are never resized.
 *   - Overlaps are resolved by pushing the lower panel straight DOWN (never sideways):
 *     processing top-to-bottom, a panel that would overlap an already-placed panel it
 *     also horizontally overlaps is moved to that panel's bottom + `gap`.
 *   - The whole result is shifted so the top-left panel sits at a `border`-cell margin.
 *
 * This preserves both column layouts (a vertical stack) and free-form 2D layouts with
 * wide spanning panels. It is idempotent: a clean layout passes through unchanged.
 * Vertical fit to the viewport is handled separately by the fit-aware cell size.
 */
export function reconcileLayout(
  items: ReconcileItem[],
  opts: { gap?: number; border?: number; cols?: number } = {},
): Record<string, PlacedRect> {
  if (items.length === 0) return {};
  const gap = opts.gap ?? 1;
  const border = opts.border ?? 1;
  const cols = opts.cols ?? 96;

  // Shift so the top-left-most panel sits at the border margin (top + left). The
  // horizontal shift is clamped so a full-width layout is never pushed off the right
  // edge (a dense layout simply keeps no left margin rather than overflowing).
  const minCol = Math.min(...items.map(i => i.col));
  const minRow = Math.min(...items.map(i => i.row));
  const maxRight = Math.max(...items.map(i => i.col + i.colSpan));
  let dCol = border - minCol;
  if (maxRight + dCol > cols) dCol = cols - maxRight;
  if (minCol + dCol < 0) dCol = -minCol;
  const dRow = border - minRow;

  const ordered = items
    .map(i => ({ ...i, col: i.col + dCol, row: i.row + dRow }))
    .sort((a, b) => (a.row - b.row) || (a.col - b.col) || idNum(a.id) - idNum(b.id));

  const placed: PlacedRect[] = [];
  const out: Record<string, PlacedRect> = {};

  for (const it of ordered) {
    let row = it.row;
    // Push down past any already-placed panel that overlaps horizontally and would
    // overlap vertically at the current row. Re-scan until stable (a push may bring
    // it into contact with a different lower panel).
    let moved = true;
    while (moved) {
      moved = false;
      for (const p of placed) {
        const hOverlap = it.col < p.col + p.colSpan && it.col + it.colSpan > p.col;
        if (!hOverlap) continue;
        const vOverlap = row < p.row + p.rowSpan && row + it.rowSpan > p.row;
        if (vOverlap) { row = p.row + p.rowSpan + gap; moved = true; }
      }
    }
    const rect: PlacedRect = { col: it.col, row, colSpan: it.colSpan, rowSpan: it.rowSpan };
    placed.push(rect);
    out[it.id] = rect;
  }

  return out;
}

// ─── Directional de-overlap (Tidy) ────────────────────────────────────────────

/**
 * Tidy an authored / dragged layout into an aligned, non-overlapping one. Like
 * {@link reconcileLayout} it preserves the arrangement — it never resizes, and it
 * processes panels in reading order (top→bottom, then left→right) so the upper-left
 * panels act as anchors that later panels slide around. The difference is HOW an
 * overlap is resolved: instead of always pushing the lower panel straight DOWN, each
 * overlap is cleared by sliding the panel DOWN or RIGHT — whichever needs the smaller
 * move — so the layout uses the horizontal real estate a pure push-down would waste.
 *
 *   - A panel only slides RIGHT when the result still fits within `cols` (the "is there
 *     space?" check). If it would overflow the right edge it falls back to pushing down.
 *   - Ties, and the vertical-stack case (two panels in the same column, where sliding
 *     right costs a whole panel width), resolve DOWN — so intentional stacks collapse
 *     downward exactly as before.
 *   - The whole result is shifted so the top-left panel sits at a `border`-cell margin,
 *     pulling the arrangement toward the top-left (same clamp as reconcileLayout, so a
 *     full-width layout is never shoved off the right edge).
 *
 * Idempotent: a clean, border-aligned layout passes through unchanged.
 */
export function tidyLayout(
  items: ReconcileItem[],
  opts: { gap?: number; border?: number; cols?: number } = {},
): Record<string, PlacedRect> {
  if (items.length === 0) return {};
  const gap = opts.gap ?? 1;
  const border = opts.border ?? 1;
  const cols = opts.cols ?? 96;

  // Pull the layout to the top-left border margin. The horizontal shift is clamped so
  // a full-width layout is never pushed off the right edge (matches reconcileLayout).
  const minCol = Math.min(...items.map(i => i.col));
  const minRow = Math.min(...items.map(i => i.row));
  const maxRight = Math.max(...items.map(i => i.col + i.colSpan));
  let dCol = border - minCol;
  if (maxRight + dCol > cols) dCol = cols - maxRight;
  if (minCol + dCol < 0) dCol = -minCol;
  const dRow = border - minRow;

  const ordered = items
    .map(i => ({ ...i, col: i.col + dCol, row: i.row + dRow }))
    .sort((a, b) => (a.row - b.row) || (a.col - b.col) || idNum(a.id) - idNum(b.id));

  const placed: PlacedRect[] = [];
  const out: Record<string, PlacedRect> = {};

  for (const it of ordered) {
    const rect: PlacedRect = { col: it.col, row: it.row, colSpan: it.colSpan, rowSpan: it.rowSpan };

    // Each pass clears every panel the rect currently overlaps along ONE axis (the
    // cheaper one), then re-scans — the move may bring it into contact with another
    // panel. A pass always pushes the rect strictly down or strictly right and the
    // panels it clears can never block it again, so this settles in ≤ placed.length
    // passes; the guard is a defensive cap.
    for (let pass = 0; pass <= placed.length; pass++) {
      const hits = placed.filter(p => rectsOverlap(rect, p));
      if (hits.length === 0) break;

      const downRow = Math.max(...hits.map(p => p.row + p.rowSpan + gap));
      const rightCol = Math.max(...hits.map(p => p.col + p.colSpan + gap));
      const downCost = downRow - rect.row;
      const rightCost = rightCol - rect.col;
      const rightFits = rightCol + rect.colSpan <= cols;

      // Slide right only when there's room AND it's a strictly smaller move than going
      // down; otherwise push down (so stacks and tight layouts collapse downward).
      if (rightFits && rightCost < downCost) {
        rect.col = rightCol;
      } else {
        rect.row = downRow;
      }
    }

    placed.push(rect);
    out[it.id] = rect;
  }

  return out;
}

/** Largest `row + rowSpan` across a set of rects — the layout's bottom edge in cells.
 *  Used to size the fit-aware cell (see fitGridGeometry). */
export function layoutBottomRow(rects: Iterable<PlacedRect>): number {
  let max = 0;
  for (const r of rects) max = Math.max(max, r.row + r.rowSpan);
  return max;
}
