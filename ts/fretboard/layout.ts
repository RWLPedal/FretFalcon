// ts/fretboard/layout.ts
//
// Centralised fretboard sizing algorithms. All measurements that depend on
// DOM element heights are read via layout_specs.ts (which pulls from CSS
// custom properties), keeping CSS and sizing math in sync.
//
// Note: .feature-main-title is hidden (display:none) inside .floating-view-content,
// so its height is always 0 in the context where these functions run. Only
// per-quality subtitle rows and per-chord-card overhead need to be reserved.

import { FretboardConfig } from './fretboard_config';
import {
  getFeatureSubtitleHeight,
  getChordCardOverheadHeight,
  getChordCardHorizontalPadding,
  getMaxChordCanvasWidth,
  getFretboardGridGap,
  getTriadRowMargin,
} from './layout_specs';

export interface GridCandidate {
  cols: number;
  rows: number;
  elementW: number;
  elementH: number;
}

/**
 * Brute-force search over column counts (1..maxCols) that finds the layout
 * maximising the area of one grid element.
 */
export function findBestGridLayout(
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
      elemH = canvasH;
      elemW = elemH * aspectRatio;
    } else {
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
      w: Math.min(maxW, availableWidth / c - hpad),
      h: availableHeight / rows - vpad,
    };
  });

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

export function planMultiFretboardGrid(
  baseConfig: FretboardConfig,
  availableWidth: number | undefined,
  availableHeight: number | undefined,
  itemsPerQuality: number,
  qualityCount: number,
  zoomMultiplier: number,
  fretCount: number
): { config: FretboardConfig; cols: number; rows: number } {
  if (!availableWidth) {
    return { config: baseConfig, cols: itemsPerQuality, rows: 1 };
  }

  const aspectRatio = baseConfig.getAspectRatio(fretCount);
  const gap       = getFretboardGridGap();
  const rowMargin = getTriadRowMargin();
  const subtitleH = getFeatureSubtitleHeight();

  if (!availableHeight) {
    const c = itemsPerQuality;
    const elemW = Math.max(1, (availableWidth - (c - 1) * gap) / c);
    const elemH = Math.max(1, elemW / aspectRatio);
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

  const perQualityH =
    (availableHeight - qualityCount * (subtitleH + rowMargin)) / qualityCount;

  const best = findBestGridLayout(itemsPerQuality, itemsPerQuality, aspectRatio, (c) => {
    const rowsPerQuality = Math.ceil(itemsPerQuality / c);
    return {
      w: (availableWidth - (c - 1) * gap) / c,
      h: (perQualityH - (rowsPerQuality - 1) * gap) / rowsPerQuality,
    };
  });

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
