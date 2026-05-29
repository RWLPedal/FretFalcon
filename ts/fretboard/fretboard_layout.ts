// ts/instrument/fretboard_layout.ts
//
// Centralised fretboard sizing algorithms. All measurements that depend on
// DOM element heights are read via layout_specs.ts (which pulls from CSS
// custom properties), keeping CSS and sizing math in sync.
//
// Note: .feature-main-title is hidden (display:none) inside .floating-view-content,
// so its height is always 0 in the context where these functions run. Only
// per-quality subtitle rows and per-chord-card overhead need to be reserved.

import { FretboardConfig } from './fretboard';
import {
  getFeatureSubtitleHeight,
  getChordCardOverheadHeight,
  getChordCardHorizontalPadding,
  getMaxChordCanvasWidth,
  getFretboardGridGap,
  getTriadRowMargin,
} from './layout_specs';

// ─── Private layout helper ────────────────────────────────────────────────────

interface GridCandidate {
  cols: number;
  rows: number;
  elementW: number;
  elementH: number;
}

/**
 * Brute-force search over column counts (1..maxCols) that finds the layout
 * maximising the area of one grid element.
 *
 * For each candidate column count the caller supplies the usable canvas budget
 * per element via canvasSizeForCols — all padding, gap, and header subtractions
 * happen there. The element is then fitted to that budget at the given aspect
 * ratio; the binding axis (width or height) determines element size. The
 * column count that produces the largest element area wins.
 */
function findBestGridLayout(
  maxCols: number,
  itemCount: number,
  aspectRatio: number,
  canvasSizeForCols: (cols: number) => { w: number; h: number }
): GridCandidate {
  let bestScore = -1;
  let best: GridCandidate = { cols: 1, rows: itemCount, elementW: 0, elementH: 0 };

  for (let c = 1; c <= maxCols; c++) {
    const rows = Math.ceil(itemCount / c);
    const { w: canvasW, h: canvasH } = canvasSizeForCols(c);
    if (canvasW <= 0 || canvasH <= 0) continue;

    let elemW: number, elemH: number;
    if (canvasW / canvasH > aspectRatio) {
      // Height-limited: fill height, shrink width to match aspect ratio
      elemH = canvasH;
      elemW = elemH * aspectRatio;
    } else {
      // Width-limited: fill width, shrink height to match aspect ratio
      elemW = canvasW;
      elemH = elemW / aspectRatio;
    }

    const score = elemW * elemH;
    if (score > bestScore) {
      bestScore = score;
      best = { cols: c, rows, elementW: elemW, elementH: elemH };
    }
  }

  return best;
}

// ─── Single fretboard ────────────────────────────────────────────────────────

/**
 * Returns a FretboardConfig sized to fill the full available space.
 * Used by single-fretboard features (Scale, Notes, CAGED, MultiLayerFretboard).
 * The main feature title is hidden in floating views so no overhead is deducted.
 *
 * @param baseConfig         Source of instrument settings (tuning, handedness, etc.)
 * @param availableWidth     Content area width from wrapper-user-resized, or undefined
 * @param availableHeight    Content area height minus config section, or undefined
 * @param zoomMultiplier     From InstrumentSettings.zoomMultiplier
 * @param estimatedFretCount Used by FretboardConfig to calibrate scale
 */
export function planSingleFretboard(
  baseConfig: FretboardConfig,
  availableWidth: number | undefined,
  availableHeight: number | undefined,
  zoomMultiplier: number,
  estimatedFretCount: number
): FretboardConfig {
  return new FretboardConfig(
    baseConfig.tuning,
    baseConfig.handedness,
    baseConfig.orientation,
    baseConfig.colorScheme,
    baseConfig.labelDisplay,
    baseConfig.markerDots,
    baseConfig.sideNumbers,
    baseConfig.stringWidths,
    availableHeight,
    availableWidth,
    zoomMultiplier,
    estimatedFretCount
  );
}

// ─── Multi chord-diagram grid ─────────────────────────────────────────────────

/**
 * Computes the optimal grid layout for a set of chord diagrams.
 * Used by ChordFeature and ChordProgressionFeature.
 *
 * Brute-forces all column counts (1..chordCount) and picks the layout that
 * maximises diagram area while keeping the full grid within the available space.
 *
 * @param baseConfig      Source of instrument settings and base dimensions
 * @param availableWidth  Content area width, or undefined (returns baseConfig)
 * @param availableHeight Content area height, or undefined (returns baseConfig)
 * @param chordCount      Number of chord diagrams to lay out
 * @param zoomMultiplier  From InstrumentSettings.zoomMultiplier
 * @param fretCount       Frets per chord diagram (default 5)
 */
export function planChordDiagramGrid(
  baseConfig: FretboardConfig,
  availableWidth: number | undefined,
  availableHeight: number | undefined,
  chordCount: number,
  zoomMultiplier: number,
  fretCount = 5
): { config: FretboardConfig; cols: number; rows: number } {
  if (!availableWidth || !availableHeight || chordCount === 0) {
    return { config: baseConfig, cols: 1, rows: chordCount };
  }

  const aspectRatio = baseConfig.getAspectRatio(fretCount);
  const maxW = getMaxChordCanvasWidth();
  const hpad = getChordCardHorizontalPadding();
  const vpad = getChordCardOverheadHeight();

  const best = findBestGridLayout(chordCount, chordCount, aspectRatio, (c) => {
    const rows = Math.ceil(chordCount / c);
    return {
      // Cap width at maxW to prevent excessively wide chord cards.
      w: Math.min(maxW, availableWidth / c - hpad),
      h: availableHeight / rows - vpad,
    };
  });

  console.log(
    '[planChordDiagramGrid]',
    `chordCount=${chordCount}`,
    `cols=${best.cols}`, `rows=${best.rows}`,
    `elementW=${best.elementW.toFixed(1)}`, `elementH=${best.elementH.toFixed(1)}`,
    `aspectRatio=${aspectRatio.toFixed(3)}`,
    `avail=${availableWidth}×${availableHeight}`
  );

  const config = new FretboardConfig(
    baseConfig.tuning,
    baseConfig.handedness,
    baseConfig.orientation,
    baseConfig.colorScheme,
    baseConfig.labelDisplay,
    baseConfig.markerDots,
    baseConfig.sideNumbers,
    baseConfig.stringWidths,
    best.elementH,
    best.elementW,
    zoomMultiplier,
    fretCount
  );

  return { config, cols: best.cols, rows: best.rows };
}

// ─── Multi full-fretboard grid ────────────────────────────────────────────────

/**
 * Computes the optimal grid layout for full-neck fretboard diagrams arranged
 * in quality rows (e.g. TriadFeature: 4 diagrams × N quality rows).
 *
 * Each quality row has a visible subtitle header; that height is reserved
 * before dividing the remaining space evenly among rows.
 *
 * Brute-forces all column counts (1..itemsPerQuality) and picks the layout
 * that maximises diagram area while keeping everything within the available space.
 *
 * @param baseConfig      Source of instrument settings and base dimensions
 * @param availableWidth  Content area width, or undefined (falls back to base config)
 * @param availableHeight Content area height, or undefined (falls back to base config)
 * @param itemsPerQuality Max diagrams per quality row (e.g. 4 for triads)
 * @param qualityCount    Number of quality rows
 * @param zoomMultiplier  From InstrumentSettings.zoomMultiplier
 * @param fretCount       Frets per fretboard diagram
 */
export function planMultiFretboardGrid(
  baseConfig: FretboardConfig,
  availableWidth: number | undefined,
  availableHeight: number | undefined,
  itemsPerQuality: number,
  qualityCount: number,
  zoomMultiplier: number,
  fretCount: number
): { config: FretboardConfig; cols: number; rows: number } {
  console.log(
    '[planMultiFretboardGrid] called',
    `avail=${availableWidth}×${availableHeight}`,
    `itemsPerQuality=${itemsPerQuality}`, `qualityCount=${qualityCount}`
  );

  if (!availableWidth) {
    console.log('[planMultiFretboardGrid] early return — width unavailable');
    return { config: baseConfig, cols: itemsPerQuality, rows: 1 };
  }

  const aspectRatio = baseConfig.getAspectRatio(fretCount);
  const gap       = getFretboardGridGap();
  const rowMargin = getTriadRowMargin();
  const subtitleH = getFeatureSubtitleHeight();

  if (!availableHeight) {
    // Width is known but height isn't yet (container not laid out, e.g. first open from
    // the nav panel).  Place all items in one row per quality and derive canvas height
    // from the aspect ratio so canvases are naturally sized rather than falling back to
    // the unconstrained FretboardConfig default (~700 px tall).
    const c = itemsPerQuality;
    const elemW = Math.max(1, (availableWidth - (c - 1) * gap) / c);
    const elemH = Math.max(1, elemW / aspectRatio);
    console.log(
      '[planMultiFretboardGrid] width-only result',
      `cols=${c}`, `elemW=${elemW.toFixed(1)}`, `elemH=${elemH.toFixed(1)}`
    );
    const config = new FretboardConfig(
      baseConfig.tuning,
      baseConfig.handedness,
      baseConfig.orientation,
      baseConfig.colorScheme,
      baseConfig.labelDisplay,
      baseConfig.markerDots,
      baseConfig.sideNumbers,
      baseConfig.stringWidths,
      elemH,
      elemW,
      zoomMultiplier,
      fretCount
    );
    return { config, cols: c, rows: 1 };
  }

  // Both width and height available — compute the optimal layout.
  // Vertical budget per quality block after reserving subtitle + row margin for each.
  const perQualityH =
    (availableHeight - qualityCount * (subtitleH + rowMargin)) / qualityCount;

  const best = findBestGridLayout(itemsPerQuality, itemsPerQuality, aspectRatio, (c) => {
    const rowsPerQuality = Math.ceil(itemsPerQuality / c);
    return {
      // Subtract inter-column and inter-row gaps so items fit exactly.
      w: (availableWidth - (c - 1) * gap) / c,
      h: (perQualityH - (rowsPerQuality - 1) * gap) / rowsPerQuality,
    };
  });

  console.log(
    '[planMultiFretboardGrid] result',
    `cols=${best.cols}`, `rowsPerQuality=${best.rows}`,
    `elementW=${best.elementW.toFixed(1)}`, `elementH=${best.elementH.toFixed(1)}`,
    `perQualityH=${perQualityH.toFixed(1)}`
  );

  const config = new FretboardConfig(
    baseConfig.tuning,
    baseConfig.handedness,
    baseConfig.orientation,
    baseConfig.colorScheme,
    baseConfig.labelDisplay,
    baseConfig.markerDots,
    baseConfig.sideNumbers,
    baseConfig.stringWidths,
    best.elementH,
    best.elementW,
    zoomMultiplier,
    fretCount
  );

  return { config, cols: best.cols, rows: best.rows };
}
