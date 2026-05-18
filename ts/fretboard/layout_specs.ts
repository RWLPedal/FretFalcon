// ts/instrument/layout_specs.ts
//
// Accessor functions for UI layout measurements used in fretboard sizing math.
// Values are read from CSS custom properties defined in style/views.css so that
// CSS and TypeScript stay in sync. Returning functions (rather than constants)
// keeps values dynamic — changing a CSS variable is all that's needed.

function readLayoutPx(varName: string, fallback: number): number {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  const n = parseFloat(raw);
  return isNaN(n) ? fallback : n;
}

/** Height of one .feature-subtitle row including its top+bottom margin.
 *  Used by TriadFeature to reserve space for per-quality-row headers. */
export function getFeatureSubtitleHeight(): number {
  return readLayoutPx('--layout-feature-subtitle-h', 38);
}

/** Vertical overhead per chord card not captured by the canvas itself:
 *  chord title div + notes list + wrapper top/bottom padding. */
export function getChordCardOverheadHeight(): number {
  return readLayoutPx('--layout-chord-card-overhead-h', 50);
}

/** Total horizontal padding on each chord card wrapper (left + right). */
export function getChordCardHorizontalPadding(): number {
  return readLayoutPx('--layout-chord-card-hpad', 10);
}

/** Maximum width of a single chord diagram canvas. */
export function getMaxChordCanvasWidth(): number {
  return readLayoutPx('--layout-chord-canvas-max-w', 350);
}

/** Gap between fretboard items in the TriadFeature diagrams flex container. */
export function getFretboardGridGap(): number {
  return readLayoutPx('--layout-fretboard-grid-gap', 4);
}

/** Bottom margin on each TriadFeature quality row container. */
export function getTriadRowMargin(): number {
  return readLayoutPx('--layout-triad-row-margin', 10);
}
