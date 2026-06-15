// ts/fretboard/renderer.ts
// Fretboard canvas renderer: render-data types and the Fretboard drawing class.

import { NOTE_RADIUS_PX, START_PX, OPEN_NOTE_RADIUS_FACTOR } from './fretboard_utils';
import { FretboardColorScheme, getColor as getColorFromScheme } from './colors';
import { FretboardLabelDisplay } from './fretboard_settings';
import { playFrequency } from '../sounds/note_sounds';
import { FretboardConfig } from './fretboard_config';

export enum NoteIcon {
  None = "none",
  Star = "star",
  Circle = "circle",
  Square = "square",
  Triangle = "triangle",
}

export interface NoteRenderData {
  fret: number;
  stringIndex: number;
  noteName: string;
  intervalLabel: string;
  displayLabel?: string;
  fillColor?: string | string[];
  strokeColor?: string | string[];
  strokeWidth?: number;
  icon?: NoteIcon;
  colorSchemeOverride?: FretboardColorScheme;
  radiusOverride?: number;
  opacity?: number;
  dashed?: boolean;
  donut?: boolean;
  xOverlay?: boolean;
  outerRing?: boolean;
}

export interface LineData {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  color: string;
  strokeWidth?: number;
  dashed?: boolean;
  opacity?: number;
}

export interface RoundedRectData {
  fretStart: number;
  fretEnd: number;
  stringStart: number;
  stringEnd: number;
  color: string;
  fillColor?: string;
  strokeWidth?: number;
  padding?: number;
  autoSplit?: boolean;
}

export interface PolygonData {
  points: { stringIndex: number; fret: number }[];
  color: string;
  fillColor?: string;
  fillOpacity?: number;
  strokeOpacity?: number;
  strokeWidth?: number;
  padding?: number;
  cornerRadius?: number;
}

export interface BarreData {
  fret: number;
  stringStart: number;
  stringEnd: number;
  color?: string;
  labels?: (string | null)[];
}

function _avgHexColors(c1: string, c2: string): string {
  const p = (c: string) => {
    const h = c.startsWith('#') ? c.slice(1) : '';
    if (h.length !== 6) return null;
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  };
  const a = p(c1), b = p(c2);
  if (!a || !b) return c1;
  return '#' + [0,1,2].map(i => Math.round((a[i]+b[i])/2).toString(16).padStart(2,'0')).join('');
}

export class Fretboard {
  private notesToRender: NoteRenderData[] = [];
  private linesToRender: LineData[] = [];
  private roundedRectsToRender: RoundedRectData[] = [];
  private barresToRender: BarreData[] = [];
  private polygonsToRender: PolygonData[] = [];
  private startFret: number = 0;
  private nutLineY = 0;
  private absoluteTopPx = 0;
  private absoluteLeftPx = 0;
  private verticalCanvasWidth: number;
  private horizontalCanvasWidth: number;

  private _clickCanvas: HTMLCanvasElement | null = null;
  private _clickHandler: ((e: MouseEvent) => void) | null = null;

  constructor(
    public readonly config: FretboardConfig,
    public readonly leftPx = 45,
    public readonly topPx = 45,
    public readonly fretCount: number
  ) {
    const scaleFactor = this.config.scaleFactor;
    const scaledNoteRadius = this.config.noteRadiusPx;
    this.absoluteLeftPx = this.leftPx;
    this.absoluteTopPx = this.topPx;
    const openNoteClearance = scaledNoteRadius * 1.5 + 5 * scaleFactor;
    this.nutLineY = this.absoluteTopPx + openNoteClearance;
    const stringSpan = (this.config.stringCount - 1) * this.config.stringSpacingPx;
    this.verticalCanvasWidth = 2 * this.leftPx + stringSpan;
    this.horizontalCanvasWidth = config.getRequiredWidth(fretCount);
  }

  public setNotes(notes: NoteRenderData[]): void { this.notesToRender = notes; }
  public setLines(lines: LineData[]): void { this.linesToRender = lines; }
  public setRoundedRects(rects: RoundedRectData[]): void { this.roundedRectsToRender = rects; }
  public setBarres(barres: BarreData[]): void { this.barresToRender = barres; }
  public setPolygons(polygons: PolygonData[]): void { this.polygonsToRender = polygons; }
  public clearMarkings(): void {
    this.notesToRender = [];
    this.linesToRender = [];
    this.roundedRectsToRender = [];
    this.barresToRender = [];
    this.polygonsToRender = [];
  }

  public setStartFret(fret: number): void { this.startFret = Math.max(0, fret); }

  public attachClickHandler(canvas: HTMLCanvasElement): void {
    if (this._clickCanvas && this._clickHandler) {
      this._clickCanvas.removeEventListener("click", this._clickHandler);
    }
    this._clickCanvas = canvas;
    this._clickHandler = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      this._handleCanvasClick(
        (e.clientX - rect.left) * scaleX,
        (e.clientY - rect.top) * scaleY
      );
    };
    canvas.style.cursor = "pointer";
    canvas.addEventListener("click", this._clickHandler);
  }

  public detachClickHandler(): void {
    if (this._clickCanvas && this._clickHandler) {
      this._clickCanvas.removeEventListener("click", this._clickHandler);
      this._clickCanvas.style.cursor = "";
      this._clickCanvas = null;
      this._clickHandler = null;
    }
  }

  private _handleCanvasClick(x: number, y: number): void {
    const hitRadius = this.config.noteRadiusPx * 1.5;
    for (const note of this.notesToRender) {
      if (note.fret < 0) continue;
      const { x: nx, y: ny } = this.getNoteCoordinates(note.stringIndex, note.fret);
      const dx = x - nx;
      const dy = y - ny;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        this._playNoteSound(note.stringIndex, note.fret);
        return;
      }
    }
  }

  private _playNoteSound(stringIndex: number, fret: number): void {
    const midiBase = this.config.tuning.openStringMidi;
    if (!midiBase || stringIndex >= midiBase.length) return;
    const midi = midiBase[stringIndex] + fret;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    playFrequency(freq, { wave: "triangle", duration: 1.2, attack: 0.01, release: 0.4, volume: 0.45 });
  }

  private _toCanvas(vx: number, vy: number): { x: number; y: number } {
    if (this.config.orientation === "horizontal") {
      if (this.config.handedness === "left") {
        return { x: this.horizontalCanvasWidth - vy, y: vx };
      }
      return { x: vy, y: this.verticalCanvasWidth - vx };
    }
    return { x: vx, y: vy };
  }

  private getStringX(visualIndex: number): number {
    return this.absoluteLeftPx + visualIndex * this.config.stringSpacingPx;
  }

  getNoteCoordinates(stringIndex: number, fret: number): { x: number; y: number } {
    const maxStringIndex = this.config.stringCount - 1;
    const visualStringIndex =
      this.config.handedness === "left" ? maxStringIndex - stringIndex : stringIndex;
    const vx = this.getStringX(visualStringIndex);

    const displayFret = fret - this.startFret;
    let vy: number;
    if (displayFret > 0) {
      vy = this.nutLineY + (displayFret - 0.5) * this.config.fretLengthPx;
    } else {
      const textBuffer = 5 * this.config.scaleFactor;
      vy = this.nutLineY - this.config.noteRadiusPx - textBuffer;
      vy = Math.max(this.absoluteTopPx + this.config.noteRadiusPx, vy);
    }
    return this._toCanvas(vx, vy);
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    this._renderGrid(ctx);
    this._renderBarres(ctx);
    this._renderLines(ctx);
    this._renderPolygons(ctx);
    this._renderNotes(ctx);
    this._renderRoundedRects(ctx);
  }

  private _renderGrid(ctx: CanvasRenderingContext2D): void {
    const config = this.config;
    const scaleFactor = config.scaleFactor;
    const textHeight = 12 * scaleFactor;
    const stringWidths = config.getStringWidths();
    const isHorizontal = config.orientation === "horizontal";
    const stringCount = config.stringCount;

    const themeStyle = getComputedStyle(document.documentElement);
    const stringColor = themeStyle.getPropertyValue('--text-muted').trim() || '#999';
    const fretColor = themeStyle.getPropertyValue('--border').trim() || '#ccc';
    const gridColor = _avgHexColors(stringColor, fretColor);

    const bgRaw = themeStyle.getPropertyValue('--bg').trim();
    const bgHex = bgRaw.startsWith('#') ? bgRaw.slice(1) : '';
    const isLightBg = bgHex.length === 6
      ? (parseInt(bgHex.slice(0, 2), 16) * 0.299 + parseInt(bgHex.slice(2, 4), 16) * 0.587 + parseInt(bgHex.slice(4, 6), 16) * 0.114) / 255 > 0.5
      : false;

    const halfSpacing = config.stringSpacingPx / 2;
    const tintBoardLeft  = this.absoluteLeftPx;
    const tintBoardRight = tintBoardLeft + (stringCount - 1) * config.stringSpacingPx;
    const tintMidVx = tintBoardLeft + Math.floor(stringCount / 2) * config.stringSpacingPx;
    {
      // Tint the half of the board holding the heavy (bass) strings to convey weight.
      // getStringWidths() reverses for left-handed, so the bass strings sit on the
      // high-vx half when left-handed and the low-vx half when right-handed.
      const splitVx = tintMidVx - halfSpacing;
      const tintNearVx = config.handedness === "left" ? splitVx : tintBoardLeft;
      const tintFarVx = config.handedness === "left" ? tintBoardRight : splitVx;
      const tintTL = this._toCanvas(tintNearVx, this.nutLineY);
      const tintBR = this._toCanvas(tintFarVx, this.nutLineY + this.fretCount * config.fretLengthPx);
      ctx.save();
      ctx.fillStyle = isLightBg ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.06)';
      ctx.fillRect(
        Math.min(tintTL.x, tintBR.x), Math.min(tintTL.y, tintBR.y),
        Math.abs(tintBR.x - tintTL.x), Math.abs(tintBR.y - tintTL.y)
      );
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha = isLightBg ? 0.8 : 0.9;
    ctx.fillStyle = gridColor;

    for (let visualIndex = 0; visualIndex < stringCount; visualIndex++) {
      const vx = this.getStringX(visualIndex);
      const p1 = this._toCanvas(vx, this.nutLineY);
      const p2 = this._toCanvas(vx, this.nutLineY + this.fretCount * config.fretLengthPx);
      ctx.beginPath();
      ctx.lineWidth = (stringWidths[visualIndex] ?? 1) * scaleFactor;
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = gridColor;
      ctx.stroke();
    }

    ctx.font = `400 ${textHeight}px 'Spline Sans Mono', monospace`;
    ctx.strokeStyle = gridColor;
    ctx.fillStyle = gridColor;

    const totalBoardSpan = (stringCount - 1) * config.stringSpacingPx;
    const leftEdge_v = this.absoluteLeftPx;
    const rightEdge_v = this.absoluteLeftPx + totalBoardSpan;
    const defaultFretLineWidth = 1 * scaleFactor;
    const boldFretLineWidth = 2 * scaleFactor;
    const sideNumberOffset = 18 * scaleFactor;

    const nutP1 = this._toCanvas(leftEdge_v, this.nutLineY);
    const nutP2 = this._toCanvas(rightEdge_v, this.nutLineY);
    ctx.beginPath();
    ctx.lineWidth = this.startFret === 0 ? boldFretLineWidth * 1.5 : boldFretLineWidth;
    ctx.moveTo(nutP1.x, nutP1.y);
    ctx.lineTo(nutP2.x, nutP2.y);
    ctx.stroke();

    for (let i = 1; i <= this.fretCount; i++) {
      const vy = this.nutLineY + i * config.fretLengthPx;
      const actualFretNumber = this.startFret + i;
      const hasSideNumber =
        actualFretNumber < config.sideNumbers.length &&
        !!config.sideNumbers[actualFretNumber];

      ctx.lineWidth = hasSideNumber ? boldFretLineWidth : defaultFretLineWidth;
      const fp1 = this._toCanvas(leftEdge_v, vy);
      const fp2 = this._toCanvas(rightEdge_v, vy);
      ctx.beginPath();
      ctx.moveTo(fp1.x, fp1.y);
      ctx.lineTo(fp2.x, fp2.y);
      ctx.stroke();

      const fretMidVY = this.nutLineY + (i - 0.5) * config.fretLengthPx;
      if (hasSideNumber && actualFretNumber > 0) {
        if (isHorizontal) {
          const numVX = config.handedness === "left"
            ? rightEdge_v + sideNumberOffset
            : leftEdge_v - sideNumberOffset;
          const numPos = this._toCanvas(numVX, fretMidVY);
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillText(config.sideNumbers[actualFretNumber], numPos.x, numPos.y);
        } else {
          ctx.textAlign = "right";
          ctx.textBaseline = "middle";
          ctx.fillText(
            config.sideNumbers[actualFretNumber],
            leftEdge_v - sideNumberOffset,
            fretMidVY
          );
        }
      }

      const markerDotType =
        actualFretNumber < config.markerDots.length
          ? config.markerDots[actualFretNumber]
          : 0;
      const scaledMarkerRadius = config.markerDotRadiusPx;

      if (markerDotType === 1) {
        const dotPos = this._toCanvas(leftEdge_v + totalBoardSpan / 2, fretMidVY);
        ctx.beginPath();
        ctx.arc(dotPos.x, dotPos.y, scaledMarkerRadius, 0, 2 * Math.PI);
        ctx.fill();
      } else if (markerDotType === 2) {
        const m1vx = leftEdge_v + totalBoardSpan * 0.25;
        const m2vx = leftEdge_v + totalBoardSpan * 0.75;
        const m1 = this._toCanvas(m1vx, fretMidVY);
        const m2 = this._toCanvas(m2vx, fretMidVY);
        ctx.beginPath();
        ctx.arc(m1.x, m1.y, scaledMarkerRadius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(m2.x, m2.y, scaledMarkerRadius, 0, 2 * Math.PI);
        ctx.fill();
      }
    }

    ctx.textAlign = "left";
    ctx.lineWidth = 1;
    ctx.restore();
  }

  private _roundedRectPath(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, width: number, height: number, radius: number
  ): void {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.arcTo(x + width, y, x + width, y + r, r);
    ctx.lineTo(x + width, y + height - r);
    ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
    ctx.lineTo(x + r, y + height);
    ctx.arcTo(x, y + height, x, y + height - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  private _expandedBBox(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    expand: number
  ): { x: number; y: number; w: number; h: number } {
    const x = Math.min(p1.x, p2.x) - expand;
    const y = Math.min(p1.y, p2.y) - expand;
    const w = Math.abs(p1.x - p2.x) + expand * 2;
    const h = Math.abs(p1.y - p2.y) + expand * 2;
    return { x, y, w, h };
  }

  private _computeRectSegments(rect: RoundedRectData): RoundedRectData[] {
    const tuning = this.config.tuning.notes;
    const segments: RoundedRectData[] = [];
    let segStart = rect.stringStart;
    let cumulativeOffset = 0;

    for (let s = rect.stringStart; s < rect.stringEnd; s++) {
      const interval = ((tuning[s + 1] - tuning[s]) + 12) % 12;
      const delta = interval - 5;
      if (delta !== 0) {
        segments.push({
          ...rect,
          stringStart: segStart,
          stringEnd: s,
          fretStart: rect.fretStart + cumulativeOffset,
          fretEnd: rect.fretEnd + cumulativeOffset,
        });
        cumulativeOffset += delta;
        segStart = s + 1;
      }
    }
    segments.push({
      ...rect,
      stringStart: segStart,
      stringEnd: rect.stringEnd,
      fretStart: rect.fretStart + cumulativeOffset,
      fretEnd: rect.fretEnd + cumulativeOffset,
    });

    return segments;
  }

  private _renderRoundedRects(ctx: CanvasRenderingContext2D): void {
    const scaleFactor = this.config.scaleFactor;
    const noteRadius = this.config.noteRadiusPx;

    this.roundedRectsToRender.forEach((rect) => {
      const segments =
        rect.autoSplit !== false ? this._computeRectSegments(rect) : [rect];

      segments.forEach((seg) => {
        const padding = (seg.padding ?? 4) * scaleFactor;
        const strokeWidth = (seg.strokeWidth ?? 2) * scaleFactor;
        const expand = noteRadius + padding;

        const c1 = this.getNoteCoordinates(seg.stringStart, seg.fretStart);
        const c2 = this.getNoteCoordinates(seg.stringEnd, seg.fretEnd);
        const { x, y, w, h } = this._expandedBBox(c1, c2, expand);
        const cornerRadius = noteRadius + padding;

        ctx.save();
        this._roundedRectPath(ctx, x, y, w, h, cornerRadius);
        if (seg.fillColor && seg.fillColor !== "transparent") {
          ctx.fillStyle = seg.fillColor;
          ctx.fill();
        }
        ctx.strokeStyle = seg.color;
        ctx.lineWidth = strokeWidth;
        ctx.stroke();
        ctx.restore();
      });
    });
  }

  private _renderBarres(ctx: CanvasRenderingContext2D): void {
    const scaleFactor = this.config.scaleFactor;
    const noteRadius = this.config.noteRadiusPx;
    const padding = 2 * scaleFactor;
    const noteAltColor = getComputedStyle(document.documentElement).getPropertyValue('--note-second').trim() || '#777';

    this.barresToRender.forEach((barre) => {
      const displayFret = barre.fret - this.startFret;
      if (displayFret === 0 && this.startFret !== 0) return;
      if (displayFret < 0 || displayFret > this.fretCount) return;

      const isNutBarre = displayFret === 0 && this.startFret === 0;
      const expand = isNutBarre ? (noteRadius + padding) * 0.5 : noteRadius + padding;

      const p1 = this.getNoteCoordinates(barre.stringStart, barre.fret);
      const p2 = this.getNoteCoordinates(barre.stringEnd, barre.fret);
      const { x, y, w, h } = this._expandedBBox(p1, p2, expand);
      const cornerRadius = Math.min(w, h) / 2;

      ctx.save();
      this._roundedRectPath(ctx, x, y, w, h, cornerRadius);
      ctx.fillStyle = barre.color ?? noteAltColor;
      ctx.fill();
      ctx.restore();

      if (barre.labels) {
        ctx.save();
        const fontSize = noteRadius * 0.9;
        ctx.font = `600 ${fontSize}px 'Hanken Grotesk', sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#fff";
        for (let i = 0; i < barre.labels.length; i++) {
          const label = barre.labels[i];
          if (!label) continue;
          const { x: lx, y: ly } = this.getNoteCoordinates(barre.stringStart + i, barre.fret);
          ctx.fillText(label, lx, ly + fontSize * 0.05);
        }
        ctx.restore();
      }
    });
  }

  private _buildPolygonCanvasPath(
    ctx: CanvasRenderingContext2D,
    points: { stringIndex: number; fret: number }[],
    padding: number,
    cornerRadius: number = 0
  ): boolean {
    const stringFretMap = new Map<number, { min: number; max: number }>();
    for (const p of points) {
      if (p.fret < 0) continue;
      const ex = stringFretMap.get(p.stringIndex);
      if (!ex) {
        stringFretMap.set(p.stringIndex, { min: p.fret, max: p.fret });
      } else {
        ex.min = Math.min(ex.min, p.fret);
        ex.max = Math.max(ex.max, p.fret);
      }
    }
    if (stringFretMap.size === 0) return false;

    const scaledPad  = padding * this.config.scaleFactor;
    const fretLen    = this.config.fretLengthPx;
    const strSpace   = this.config.stringSpacingPx;
    const noteRadius = this.config.noteRadiusPx;
    const maxSI      = this.config.stringCount - 1;

    const vxOf = (si: number) => {
      const vi = this.config.handedness === 'left' ? maxSI - si : si;
      return this.absoluteLeftPx + vi * strSpace;
    };

    const vyTop = (fret: number) => {
      const df = fret - this.startFret;
      if (df <= 0) return this.nutLineY - scaledPad;
      return this.nutLineY + (df - 1) * fretLen + scaledPad;
    };

    const vyBottom = (fret: number) => {
      const df = fret - this.startFret;
      if (df <= 0) return this.nutLineY - scaledPad;
      return this.nutLineY + df * fretLen - scaledPad;
    };

    const strings = [...stringFretMap.keys()].sort((a, b) => vxOf(a) - vxOf(b));
    const firstS  = strings[0];
    const lastS   = strings[strings.length - 1];
    const halfStr = noteRadius + scaledPad;

    const pts: { x: number; y: number }[] = [];

    pts.push(this._toCanvas(vxOf(firstS) - halfStr, vyTop(stringFretMap.get(firstS)!.min)));

    for (let i = 0; i < strings.length - 1; i++) {
      const si   = strings[i];
      const sj   = strings[i + 1];
      const minI = stringFretMap.get(si)!.min;
      const minJ = stringFretMap.get(sj)!.min;
      const midX = (vxOf(si) + vxOf(sj)) / 2;
      pts.push(this._toCanvas(midX, vyTop(minI)));
      if (minJ !== minI) pts.push(this._toCanvas(midX, vyTop(minJ)));
    }

    pts.push(this._toCanvas(vxOf(lastS) + halfStr, vyTop(stringFretMap.get(lastS)!.min)));
    pts.push(this._toCanvas(vxOf(lastS) + halfStr, vyBottom(stringFretMap.get(lastS)!.max)));

    for (let i = strings.length - 1; i > 0; i--) {
      const si   = strings[i];
      const sj   = strings[i - 1];
      const maxI = stringFretMap.get(si)!.max;
      const maxJ = stringFretMap.get(sj)!.max;
      const midX = (vxOf(si) + vxOf(sj)) / 2;
      pts.push(this._toCanvas(midX, vyBottom(maxI)));
      if (maxJ !== maxI) pts.push(this._toCanvas(midX, vyBottom(maxJ)));
    }

    pts.push(this._toCanvas(vxOf(firstS) - halfStr, vyBottom(stringFretMap.get(firstS)!.max)));

    if (pts.length < 3) return false;
    const n = pts.length;
    const r = cornerRadius * this.config.scaleFactor;
    ctx.beginPath();
    if (r <= 0) {
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < n; i++) ctx.lineTo(pts[i].x, pts[i].y);
    } else {
      const last = pts[n - 1];
      ctx.moveTo((last.x + pts[0].x) / 2, (last.y + pts[0].y) / 2);
      for (let i = 0; i < n; i++) {
        const p    = pts[i];
        const next = pts[(i + 1) % n];
        ctx.arcTo(p.x, p.y, next.x, next.y, r);
      }
    }
    ctx.closePath();
    return true;
  }

  private _renderPolygons(ctx: CanvasRenderingContext2D): void {
    const scaleFactor = this.config.scaleFactor;
    for (const poly of this.polygonsToRender) {
      const padding      = poly.padding      ?? 3;
      const cornerRadius = poly.cornerRadius ?? 0;
      if (!this._buildPolygonCanvasPath(ctx, poly.points, padding, cornerRadius)) continue;
      ctx.save();
      if (poly.fillColor) {
        ctx.globalAlpha = poly.fillOpacity ?? 0.15;
        ctx.fillStyle = poly.fillColor;
        ctx.fill();
      }
      ctx.globalAlpha = poly.strokeOpacity ?? 1;
      ctx.strokeStyle = poly.color;
      ctx.lineWidth = (poly.strokeWidth ?? 2) * scaleFactor;
      ctx.stroke();
      ctx.restore();
    }
  }

  private _renderLines(ctx: CanvasRenderingContext2D): void {
    const scaleFactor = this.config.scaleFactor;
    this.linesToRender.forEach((line) => {
      ctx.save();
      if (line.opacity !== undefined) ctx.globalAlpha = line.opacity;
      ctx.strokeStyle = line.color || "grey";
      ctx.lineWidth = (line.strokeWidth || 2) * scaleFactor;
      if (line.dashed) {
        const dashLength = 4 * scaleFactor;
        ctx.setLineDash([dashLength, dashLength]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.beginPath();
      ctx.moveTo(line.startX, line.startY);
      ctx.lineTo(line.endX, line.endY);
      ctx.stroke();
      ctx.restore();
    });
  }

  private _renderNotes(ctx: CanvasRenderingContext2D): void {
    const scaleFactor = this.config.scaleFactor;
    const baseFontSize = 18 * scaleFactor;
    const baseNoteRadius = this.config.noteRadiusPx;
    const maxStringIndex = this.config.stringCount - 1;

    this.notesToRender.forEach((noteData) => {
      const displayFret = noteData.fret - this.startFret;
      if (noteData.fret === -1 || (displayFret >= 0 && displayFret <= this.fretCount)) {
        ctx.save();
        ctx.globalAlpha = noteData.opacity ?? 1;

        if (noteData.fret === -1) {
          const visualStringIndex =
            this.config.handedness === "left"
              ? maxStringIndex - noteData.stringIndex
              : noteData.stringIndex;
          const vx = this.getStringX(visualStringIndex);
          const vy = this.nutLineY - baseNoteRadius * 1.5;
          const { x, y } = this._toCanvas(vx, vy);
          this._drawMutedString(ctx, x, y, baseNoteRadius);
        } else {
          const { x, y } = this.getNoteCoordinates(noteData.stringIndex, noteData.fret);
          const effectiveRadius =
            noteData.radiusOverride ??
            (noteData.fret === 0
              ? baseNoteRadius * OPEN_NOTE_RADIUS_FACTOR
              : baseNoteRadius);
          const effectiveStrokeWidth = (noteData.strokeWidth ?? 1) * scaleFactor;
          const effectiveColorScheme =
            noteData.colorSchemeOverride ?? this.config.colorScheme;

          let finalFillColor: string | string[] =
            noteData.fillColor ||
            getColorFromScheme(
              effectiveColorScheme,
              noteData.noteName,
              noteData.intervalLabel
            );

          let finalStrokeColor: string | string[] =
            noteData.strokeColor || "transparent";

          const primaryFill = Array.isArray(finalFillColor)
            ? finalFillColor[0]
            : finalFillColor;
          let fgColor = "#eee";
          if (primaryFill !== "transparent") {
            try {
              let r: number, g: number, b: number;
              const rgbMatch = primaryFill.match(/rgb\(\s*(\d+),\s*(\d+),\s*(\d+)/);
              if (rgbMatch) {
                r = +rgbMatch[1]; g = +rgbMatch[2]; b = +rgbMatch[3];
              } else {
                r = parseInt(primaryFill.slice(1, 3), 16);
                g = parseInt(primaryFill.slice(3, 5), 16);
                b = parseInt(primaryFill.slice(5, 7), 16);
              }
              const brightness = (r * 299 + g * 587 + b * 114) / 1000;
              fgColor = brightness > 150 ? "#333" : "#eee";
            } catch (e) { /* keep default */ }
          }

          const isDonut = noteData.donut === true
            && Array.isArray(finalFillColor)
            && (finalFillColor as string[]).length >= 2;
          if (isDonut) {
            fgColor = getComputedStyle(document.documentElement)
              .getPropertyValue('--text-primary').trim() || '#333';
          }

          if (noteData.dashed) ctx.setLineDash([4, 3]);
          if (isDonut) {
            this._drawDonut(ctx, x, y, effectiveRadius, finalFillColor as string[]);
          } else {
            this._drawCircle(ctx, x, y, effectiveRadius, finalFillColor, finalStrokeColor, effectiveStrokeWidth);
          }

          if (noteData.intervalLabel === "R" && !isDonut) {
            const ringFill = Array.isArray(finalFillColor) ? finalFillColor[0] : finalFillColor;
            ctx.save();
            ctx.globalAlpha = (noteData.opacity ?? 1) * 0.35;
            ctx.beginPath();
            ctx.arc(x, y, effectiveRadius + 2.5 * scaleFactor, 0, 2 * Math.PI);
            ctx.strokeStyle = ringFill;
            ctx.lineWidth = 1.5 * scaleFactor;
            ctx.setLineDash([]);
            ctx.stroke();
            ctx.restore();
          }

          let contentToDraw: string | null = null;
          let drawIconType: NoteIcon | undefined =
            noteData.icon && noteData.icon !== NoteIcon.None ? noteData.icon : undefined;

          if (!drawIconType) {
            contentToDraw = noteData.displayLabel !== undefined
              ? noteData.displayLabel
              : noteData.noteName;
          }

          if (drawIconType) {
            this._drawIcon(ctx, drawIconType, x, y, effectiveRadius, fgColor);
          } else if (contentToDraw) {
            const fontSizeRatio = 0.9;
            const innerR = isDonut ? effectiveRadius * 0.75 : effectiveRadius;
            const effectiveFontSize = Math.min(baseFontSize, innerR * 2 * fontSizeRatio * 0.7);
            this._drawText(ctx, contentToDraw, x, y, effectiveFontSize, fgColor);
          }

          if (noteData.outerRing) this._drawOuterRing(ctx, x, y, effectiveRadius, scaleFactor);
          if (noteData.xOverlay) this._drawXOverlay(ctx, x, y, effectiveRadius, scaleFactor);
        }
        ctx.restore();
      }
    });
  }

  private _drawCircle(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, radius: number,
    fill: string | string[], stroke: string | string[], strokeWidth: number
  ): void {
    ctx.save();
    ctx.lineWidth = strokeWidth;

    if (Array.isArray(fill) || Array.isArray(stroke)) {
      const topFill = Array.isArray(fill) ? fill[0] : fill;
      const bottomFill = Array.isArray(fill) ? fill[1] ?? fill[0] : fill;
      const topStroke = Array.isArray(stroke) ? stroke[0] : stroke;
      const bottomStroke = Array.isArray(stroke) ? stroke[1] ?? stroke[0] : stroke;

      ctx.beginPath();
      ctx.arc(x, y, radius, Math.PI, 0);
      if (topFill !== "transparent") { ctx.fillStyle = topFill; ctx.fill(); }
      if (topStroke !== "transparent") { ctx.strokeStyle = topStroke; ctx.stroke(); }

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI);
      if (bottomFill !== "transparent") { ctx.fillStyle = bottomFill; ctx.fill(); }
      if (bottomStroke !== "transparent") { ctx.strokeStyle = bottomStroke; ctx.stroke(); }

      const divLeft = Array.isArray(stroke) ? stroke[0] : stroke;
      const divRight = Array.isArray(stroke) ? stroke[1] ?? stroke[0] : stroke;
      ctx.beginPath();
      ctx.moveTo(x - radius, y);
      ctx.lineTo(x, y);
      ctx.strokeStyle = divLeft;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + radius, y);
      ctx.strokeStyle = divRight;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      if (fill !== "transparent") { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke !== "transparent") { ctx.strokeStyle = stroke; ctx.stroke(); }
    }
    ctx.restore();
  }

  private _drawDonut(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, radius: number, colors: string[]
  ): void {
    const n = colors.length;
    if (n === 0) return;
    const innerRadius = radius * 0.58;
    const sliceAngle = (2 * Math.PI) / n;
    const startAngle = -Math.PI / 2;
    const halfGap = Math.min(0.04, sliceAngle * 0.06);

    ctx.save();
    ctx.setLineDash([]);

    for (let i = 0; i < n; i++) {
      const a0 = startAngle + i * sliceAngle + halfGap;
      const a1 = startAngle + (i + 1) * sliceAngle - halfGap;
      ctx.beginPath();
      ctx.arc(x, y, radius, a0, a1);
      ctx.arc(x, y, innerRadius, a1, a0, true);
      ctx.closePath();
      ctx.fillStyle = colors[i];
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.lineWidth = Math.max(0.5, this.config.scaleFactor * 0.8);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, innerRadius, 0, 2 * Math.PI);
    ctx.stroke();

    ctx.restore();
  }

  private _drawMutedString(
    ctx: CanvasRenderingContext2D, x: number, y: number, baseScaledRadius: number
  ): void {
    const size = baseScaledRadius * 0.55;
    ctx.save();
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 1.5 * this.config.scaleFactor;
    ctx.beginPath();
    ctx.moveTo(x - size, y - size);
    ctx.lineTo(x + size, y + size);
    ctx.moveTo(x + size, y - size);
    ctx.lineTo(x - size, y + size);
    ctx.stroke();
    ctx.restore();
  }

  private _drawXOverlay(
    ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, scaleFactor: number
  ): void {
    const size = radius * 0.65;
    const color = getComputedStyle(document.documentElement).getPropertyValue('--danger').trim() || '#c0392b';
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5 * scaleFactor;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - size, y - size);
    ctx.lineTo(x + size, y + size);
    ctx.moveTo(x + size, y - size);
    ctx.lineTo(x - size, y + size);
    ctx.stroke();
    ctx.restore();
  }

  private _drawOuterRing(
    ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, scaleFactor: number
  ): void {
    const color = getComputedStyle(document.documentElement).getPropertyValue('--note-pivot').trim() || '#c9952a';
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5 * scaleFactor;
    ctx.beginPath();
    ctx.arc(x, y, radius + 3 * scaleFactor, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.restore();
  }

  private _drawText(
    ctx: CanvasRenderingContext2D,
    text: string, x: number, y: number, fontSize: number, color: string
  ): void {
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = `600 ${fontSize}px 'Hanken Grotesk', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y + fontSize * 0.05);
    ctx.restore();
  }

  private _drawIcon(
    ctx: CanvasRenderingContext2D,
    icon: NoteIcon, x: number, y: number, radius: number, color: string
  ): void {
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1 * this.config.scaleFactor;
    const iconSize = radius * 0.7;

    switch (icon) {
      case NoteIcon.Star:
        this._drawStarIcon(ctx, x, y, iconSize);
        break;
      case NoteIcon.Circle:
        ctx.beginPath();
        ctx.arc(x, y, iconSize / 2, 0, 2 * Math.PI);
        ctx.stroke();
        break;
      case NoteIcon.Square:
        ctx.fillRect(x - iconSize / 2, y - iconSize / 2, iconSize, iconSize);
        break;
      case NoteIcon.Triangle:
        ctx.beginPath();
        ctx.moveTo(x, y - iconSize / 1.7);
        ctx.lineTo(x + iconSize / 1.7, y + iconSize / 3.4);
        ctx.lineTo(x - iconSize / 1.7, y + iconSize / 3.4);
        ctx.closePath();
        ctx.fill();
        break;
      case NoteIcon.None:
      default:
        break;
    }
    ctx.restore();
  }

  private _drawStarIcon(
    ctx: CanvasRenderingContext2D, cx: number, cy: number, outerRadius: number
  ): void {
    const spikes = 5;
    const innerRadius = outerRadius * 0.4;
    let rot = (Math.PI / 2) * 3;
    let x = cx;
    let y = cy;
    const step = Math.PI / spikes;

    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerRadius;
      y = cy + Math.sin(rot) * outerRadius;
      ctx.lineTo(x, y);
      rot += step;
      x = cx + Math.cos(rot) * innerRadius;
      y = cy + Math.sin(rot) * innerRadius;
      ctx.lineTo(x, y);
      rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
    ctx.fill();
  }
}
