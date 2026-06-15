// ts/panels/panel_sizing.ts
// Orientation-aware panel sizing helpers (DOM-free).
//
// A panel's flat default/min/max size describes its VERTICAL (default) orientation.
// Descriptors may also carry a `horizontal` override block for the rotated layout;
// any field omitted there falls back to the vertical value.

import { FloatingViewDescriptor } from './panel_types';

export type Orientation = 'vertical' | 'horizontal';

/** The px size fields a panel can constrain. */
export interface ResolvedSizing {
  defaultWidth?: number;
  defaultHeight?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
}

/**
 * Swap width/height — the rotated footprint of a square-aspect, chrome-free panel.
 * Intended as a convenience for module authors deriving a horizontal size from a
 * vertical one. Use sparingly: panels with a header/config row do NOT rotate
 * cleanly (that chrome keeps its height), so prefer declaring explicit horizontal
 * sizes for those.
 */
export function rotateSize<T extends { width: number; height: number }>(s: T): { width: number; height: number } {
  return { width: s.height, height: s.width };
}

/** Resolve a descriptor's effective sizing for the given orientation. Horizontal
 *  fields override the flat (vertical) ones; anything unset falls back to vertical. */
export function resolveSizing(
  desc: FloatingViewDescriptor | undefined,
  orientation: Orientation,
): ResolvedSizing {
  if (!desc) return {};
  const h = orientation === 'horizontal' ? desc.horizontal : undefined;
  return {
    defaultWidth:  h?.defaultWidth  ?? desc.defaultWidth,
    defaultHeight: h?.defaultHeight ?? desc.defaultHeight,
    minWidth:      h?.minWidth      ?? desc.minWidth,
    minHeight:     h?.minHeight     ?? desc.minHeight,
    maxWidth:      h?.maxWidth      ?? desc.maxWidth,
    maxHeight:     h?.maxHeight     ?? desc.maxHeight,
  };
}
