// ts/fretboard/fretboard_config.ts
// FretboardConfig: sizing and scaling math for a fretboard canvas.

import { Tuning } from './instruments';
import { NOTE_RADIUS_PX, START_PX } from './fretboard_utils';
import { FretboardColorScheme } from './colors';
import { FretboardLabelDisplay } from './fretboard_settings';

const STRING_WIDTH_PRESETS: Record<number, number[]> = {
  4: [4, 2, 2, 1],
  5: [4, 3, 2, 1, 1],
  6: [4, 3, 2, 2, 1, 1],
  7: [4, 3, 2, 2, 1, 1, 1],
  8: [4, 3, 2, 2, 1, 1, 1, 1],
};

function defaultStringWidths(stringCount: number): number[] {
  return STRING_WIDTH_PRESETS[stringCount] ?? Array(stringCount).fill(1);
}

export class FretboardConfig {
  public readonly baseStringSpacingPx = 32;
  public readonly baseFretLengthPx = 39;
  public readonly baseMarkerDotRadiusPx = 5;
  public readonly baseNoteRadiusPx = NOTE_RADIUS_PX;

  public readonly stringSpacingPx: number;
  public readonly fretLengthPx: number;
  public readonly markerDotRadiusPx: number;
  public readonly noteRadiusPx: number;
  public readonly scaleFactor: number;
  public readonly stringWidths: number[];

  constructor(
    public readonly tuning: Tuning,
    public readonly handedness: "right" | "left" = "right",
    public readonly orientation: "vertical" | "horizontal" = "vertical",
    public readonly colorScheme: FretboardColorScheme = "interval",
    public readonly labelDisplay: FretboardLabelDisplay = "interval",
    public readonly markerDots = [
      0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 2, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0,
    ],
    public readonly sideNumbers = [
      "", "", "", "3", "", "5", "", "7", "", "9", "", "",
      "12", "", "", "15", "", "17", "", "19", "", "21", "",
    ],
    stringWidths?: number[],
    maxCanvasHeight?: number,
    maxCanvasWidth?: number,
    globalScaleMultiplier: number = 1.2,
    estimatedFretCount: number = 18
  ) {
    this.stringWidths = stringWidths ?? defaultStringWidths(tuning.notes.length);

    const estimatedBaseSpan = 2 * START_PX + (this.stringCount - 1) * this.baseStringSpacingPx;

    const actualBaseLengthPx = 2 * START_PX + 10
      + this.baseNoteRadiusPx * 2.5
      + estimatedFretCount * this.baseFretLengthPx;

    const defaultLengthPx = 650 * globalScaleMultiplier * actualBaseLengthPx
      / (this.baseFretLengthPx * estimatedFretCount + 80);

    const isHoriz = this.orientation === 'horizontal';
    const maxLength = isHoriz ? (maxCanvasWidth ?? defaultLengthPx)
                               : (maxCanvasHeight ?? defaultLengthPx);
    const maxSpan = isHoriz ? maxCanvasHeight : maxCanvasWidth;

    let rawScale = maxLength / (globalScaleMultiplier * actualBaseLengthPx);

    if (maxSpan !== undefined && maxSpan > 0) {
      rawScale = Math.min(rawScale, maxSpan / (globalScaleMultiplier * estimatedBaseSpan));
    }

    this.scaleFactor = rawScale * globalScaleMultiplier;

    this.stringSpacingPx = this.baseStringSpacingPx * this.scaleFactor;
    this.fretLengthPx = this.baseFretLengthPx * this.scaleFactor;
    this.markerDotRadiusPx = this.baseMarkerDotRadiusPx * this.scaleFactor;
    this.noteRadiusPx = this.baseNoteRadiusPx * this.scaleFactor;
  }

  get stringCount(): number {
    return this.tuning.notes.length;
  }

  getStringWidths(): Array<number> {
    return this.handedness === "left"
      ? [...this.stringWidths].reverse()
      : this.stringWidths;
  }

  getRequiredWidth(fretCount: number): number {
    const scaledStartPx = START_PX * this.scaleFactor;
    const stringSpan = (this.stringCount - 1) * this.stringSpacingPx;
    if (this.orientation === "horizontal") {
      const openNoteClearance = this.noteRadiusPx * 1.5 + 5 * this.scaleFactor;
      const fretboardLength = fretCount * this.fretLengthPx;
      const bottomClearance = this.noteRadiusPx + 5 * this.scaleFactor;
      return scaledStartPx + openNoteClearance + fretboardLength + bottomClearance + scaledStartPx;
    }
    return scaledStartPx + stringSpan + scaledStartPx;
  }

  getRequiredHeight(fretCount: number): number {
    const scaledStartPx = START_PX * this.scaleFactor;
    const stringSpan = (this.stringCount - 1) * this.stringSpacingPx;
    if (this.orientation === "horizontal") {
      return scaledStartPx + stringSpan + scaledStartPx;
    }
    const openNoteClearance = this.noteRadiusPx * 1.5 + 5 * this.scaleFactor;
    const fretboardLength = fretCount * this.fretLengthPx;
    const bottomClearance = this.noteRadiusPx + 5 * this.scaleFactor;
    return scaledStartPx + openNoteClearance + fretboardLength + bottomClearance + scaledStartPx;
  }

  getAspectRatio(fretCount: number): number {
    return this.getRequiredWidth(fretCount) / this.getRequiredHeight(fretCount);
  }
}
