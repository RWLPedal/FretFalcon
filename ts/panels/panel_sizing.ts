// ts/panels/panel_sizing.ts
// Grid-based, orientation-aware panel sizing (DOM-free).
//
// A panel's footprint is expressed in GRID CELLS (cols/rows) — the same coordinate
// system the layout engine uses (see grid_constants.ts) — not pixels. `size` describes
// the panel in its default (vertical) orientation; orientation-aware panels (fretboards)
// may add a `sizeHorizontal` override that is used when the panel is rotated. Non-oriented
// panels (timer, metronome, drum machine, …) only ever set `size`.
//
// Pixels exist only at the DOM boundary: FloatingLayout converts these grid footprints to
// px against the live cell when it mounts/sizes a panel, and re-applies them on resize.

export type Orientation = "vertical" | "horizontal";

/** A panel footprint in grid cells. `rows` omitted ⇒ the panel auto-sizes its height. */
export interface GridSize {
  cols: number;
  rows?: number;
}

/** Default / min / max footprint of a panel, all in grid cells. */
export interface PanelSizing {
  default: GridSize;
  min?: GridSize;
  max?: GridSize;
}

/** The two orientation footprints a sizing-bearing object (module panel / descriptor)
 *  can carry. `size` is the base (vertical) footprint; `sizeHorizontal` overrides it when
 *  the panel is rotated to horizontal. */
export interface OrientationSizing {
  size?: PanelSizing;
  sizeHorizontal?: PanelSizing;
}

/** Shared default footprint for fretboard feature panels. Modules built with
 *  featurePanelModule() inherit this unless they declare their own `size`/`sizeHorizontal`,
 *  so the common feature panels have a single source of truth. Vertical is portrait; the
 *  rotated layout is wide and short. */
export const FEATURE_PANEL_SIZE: Required<OrientationSizing> = {
  size: { default: { cols: 22, rows: 40 } },
  sizeHorizontal: {
    default: { cols: 46, rows: 20 },
  },
};

/** Resolve the effective footprint for an orientation: the horizontal override when the
 *  panel is rotated and one is declared, else the base size. Returns undefined only when
 *  the object carries no sizing at all. */
export function resolveSizing(
  desc: OrientationSizing | undefined,
  orientation: Orientation,
): PanelSizing | undefined {
  if (!desc) return undefined;
  return orientation === "horizontal"
    ? (desc.sizeHorizontal ?? desc.size)
    : (desc.size ?? desc.sizeHorizontal);
}
