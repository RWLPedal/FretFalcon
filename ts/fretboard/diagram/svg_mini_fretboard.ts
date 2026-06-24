// ts/fretboard/diagram/svg_mini_fretboard.ts
// Lightweight, fixed-size SVG chord diagram. Implements FretboardDiagram so it
// is swappable with the canvas renderer. Honours both orientation
// (vertical/horizontal) and handedness, matching the main canvas renderer's
// conventions so chord cards agree with the board the user has configured.

import { FretboardConfig } from "../fretboard_config";
import type { NoteRenderData, BarreData, LineData } from "../renderer";
import type { FretboardDiagram, ChordDiagramOptions } from "./chord_diagram";
import { getColor } from "../colors";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Fixed base geometry in px (multiplied by options.scale). */
const BASE = {
  stringSpacing: 16,
  fretLength: 20,
  noteRadius: 7,
  openFactor: 0.72,
  padStart: 10, // before the first string (string axis)
  padEnd: 22, // after the last string — room for the "Nfr" position label
  padNut: 17, // before the nut (fret axis) — room for open/muted markers
  padBody: 7, // after the last fret (fret axis)
};

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** Picks a readable label colour for a given resolved fill (oklch()/rgb()/hex). */
function textColorFor(fill: string): string {
  // Modern engines resolve theme colours to oklch(); use its lightness directly.
  const ok = fill.match(/oklch\(\s*([\d.]+)(%?)/);
  if (ok) {
    const L = ok[2] === "%" ? parseFloat(ok[1]) / 100 : parseFloat(ok[1]);
    return L > 0.62 ? "#333" : "#eee";
  }
  let r: number, g: number, b: number;
  const m = fill.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) {
    r = +m[1]; g = +m[2]; b = +m[3];
  } else if (fill.startsWith("#") && fill.length >= 7) {
    r = parseInt(fill.slice(1, 3), 16);
    g = parseInt(fill.slice(3, 5), 16);
    b = parseInt(fill.slice(5, 7), 16);
  } else {
    return "#eee";
  }
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#333" : "#eee";
}

export class SvgMiniFretboardDiagram implements FretboardDiagram {
  private readonly fretCount: number;
  private readonly stringCount: number;
  private readonly handedLeft: boolean;
  private readonly horizontal: boolean;
  private readonly g: typeof BASE;
  /** Extent along the string axis (first → last string), excluding padding. */
  private readonly stringSpan: number;
  /** Extent along the fret axis (nut → last fret), excluding padding. */
  private readonly fretSpan: number;
  /** Full padded extent of the string axis / fret axis. */
  private readonly spanS: number;
  private readonly spanF: number;
  private readonly width: number;
  private readonly height: number;

  private startFret = 0;
  private notes: NoteRenderData[] = [];
  private barres: BarreData[] = [];
  private svg: SVGSVGElement | null = null;

  constructor(private readonly config: FretboardConfig, options: ChordDiagramOptions = {}) {
    this.fretCount = options.fretCount ?? 5;
    this.stringCount = config.stringCount;
    this.handedLeft = config.handedness === "left";
    this.horizontal = config.orientation === "horizontal";
    const s = options.scale ?? 1;
    this.g = {
      stringSpacing: BASE.stringSpacing * s,
      fretLength: BASE.fretLength * s,
      noteRadius: BASE.noteRadius * s,
      openFactor: BASE.openFactor,
      padStart: BASE.padStart * s,
      padEnd: BASE.padEnd * s,
      padNut: BASE.padNut * s,
      padBody: BASE.padBody * s,
    };
    this.stringSpan = (this.stringCount - 1) * this.g.stringSpacing;
    this.fretSpan = this.fretCount * this.g.fretLength;
    this.spanS = this.g.padStart + this.stringSpan + this.g.padEnd;
    this.spanF = this.g.padNut + this.fretSpan + this.g.padBody;
    this.width = this.horizontal ? this.spanF : this.spanS;
    this.height = this.horizontal ? this.spanS : this.spanF;
  }

  setStartFret(fret: number): void { this.startFret = Math.max(0, fret); }
  setNotes(notes: NoteRenderData[]): void { this.notes = notes; }
  setBarres(barres: BarreData[]): void { this.barres = barres; }
  setLines(_lines: LineData[]): void { /* mini diagram does not draw arbitrary lines */ }

  /**
   * Maps a board point — `sa` along the string axis (0 = first visual string),
   * `fa` along the fret axis (0 = nut, positive toward higher frets, negative for
   * the open/muted marker zone above the nut) — to SVG coordinates. Mirrors the
   * canvas renderer's transform so the two stay visually consistent.
   */
  private project(sa: number, fa: number): { x: number; y: number } {
    if (this.horizontal) {
      if (this.handedLeft) {
        // Nut on the right, frets increase leftward; first visual string at top.
        return { x: this.spanF - (this.g.padNut + fa), y: this.g.padStart + sa };
      }
      // Nut on the left, frets increase rightward; first visual string at bottom.
      return { x: this.g.padNut + fa, y: this.spanS - (this.g.padStart + sa) };
    }
    return { x: this.g.padStart + sa, y: this.g.padNut + fa };
  }

  /** String-axis position of a string index (handedness mirrors the order). */
  private stringAxis(stringIndex: number): number {
    const visual = this.handedLeft ? this.stringCount - 1 - stringIndex : stringIndex;
    return visual * this.g.stringSpacing;
  }

  /** Fret-axis position for a note at an absolute fret (markers sit before the nut). */
  private fretAxis(fret: number): number {
    const df = fret - this.startFret;
    if (df >= 1) return (df - 0.5) * this.g.fretLength;
    return -(this.g.noteRadius + 2);
  }

  private resolveFill(note: NoteRenderData): string {
    const explicit = Array.isArray(note.fillColor) ? note.fillColor[0] : note.fillColor;
    if (explicit) return explicit;
    const scheme = note.colorSchemeOverride ?? this.config.colorScheme;
    return getColor(scheme, note.noteName, note.intervalLabel);
  }

  mount(container: HTMLElement): HTMLElement {
    const svg = svgEl("svg", {
      class: "mini-fb",
      viewBox: `0 0 ${this.width} ${this.height}`,
      width: this.width,
      height: this.height,
      role: "img",
    });
    this.svg = svg;
    container.appendChild(svg);
    this.render();
    return svg as unknown as HTMLElement;
  }

  render(): void {
    const svg = this.svg;
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    this.drawGrid(svg);
    for (const barre of this.barres) this.drawBarre(svg, barre);
    for (const note of this.notes) this.drawNote(svg, note);
  }

  private drawGrid(svg: SVGSVGElement): void {
    const { fretLength, stringSpacing } = this.g;

    // Strings run along the fret axis (nut → last fret), one per string position.
    for (let i = 0; i < this.stringCount; i++) {
      const sa = i * stringSpacing;
      const p1 = this.project(sa, 0);
      const p2 = this.project(sa, this.fretSpan);
      svg.appendChild(svgEl("line", { class: "mini-fb-line", x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }));
    }
    // Frets run across the string axis (first → last string).
    for (let i = 1; i <= this.fretCount; i++) {
      const fa = i * fretLength;
      const p1 = this.project(0, fa);
      const p2 = this.project(this.stringSpan, fa);
      svg.appendChild(svgEl("line", { class: "mini-fb-line", x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }));
    }
    // Nut (bold when the window starts at fret 0; otherwise a normal fret + a position label).
    const n1 = this.project(0, 0);
    const n2 = this.project(this.stringSpan, 0);
    if (this.startFret === 0) {
      svg.appendChild(svgEl("line", { class: "mini-fb-nut", x1: n1.x, y1: n1.y, x2: n2.x, y2: n2.y }));
    } else {
      svg.appendChild(svgEl("line", { class: "mini-fb-line", x1: n1.x, y1: n1.y, x2: n2.x, y2: n2.y }));
      this.drawPositionLabel(svg);
    }
  }

  /**
   * The "Nfr" window-start label, kept clear of a barre that may sit on the first
   * fret (its round caps overhang the string-end margin by one note radius).
   * Vertical: just above the start-fret line, to the side of the last string —
   * the long axis gives the wide text room. Horizontal: centred in the clear band
   * of the string-end margin (beyond the barre cap), aligned over the first fret.
   */
  private drawPositionLabel(svg: SVGSVGElement): void {
    const r = this.g.noteRadius;
    let x: number, y: number, anchor: string;
    if (this.horizontal) {
      anchor = "middle";
      x = this.project(0, 0.5 * this.g.fretLength).x; // over the first fret
      const band = (this.g.padEnd - r) / 2; // margin past the barre cap
      y = this.handedLeft ? this.spanS - band : band;
    } else {
      anchor = "start";
      const p = this.project(this.stringSpan, 0);
      x = p.x + 3;
      y = p.y - r * 0.8; // lift clear of a first-fret barre cap
    }
    const label = svgEl("text", {
      class: "mini-fb-pos",
      x, y,
      "text-anchor": anchor,
      "dominant-baseline": "central",
      "font-size": (r * 0.95).toFixed(1),
    });
    label.textContent = `${this.startFret + 1}`;
    svg.appendChild(label);
  }

  private drawBarre(svg: SVGSVGElement, barre: BarreData): void {
    const df = barre.fret - this.startFret;
    if (df < 0 || df > this.fretCount) return;
    const r = this.g.noteRadius;
    const fa = df >= 1 ? this.fretAxis(barre.fret) : 0;
    const pa = this.project(this.stringAxis(barre.stringStart), fa);
    const pb = this.project(this.stringAxis(barre.stringEnd), fa);

    // A round-capped thick line is the capsule, regardless of orientation.
    svg.appendChild(svgEl("line", {
      class: "mini-fb-barre",
      x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y,
      "stroke-width": 2 * r,
      "stroke-linecap": "round",
    }));

    if (barre.labels) {
      for (let i = 0; i < barre.labels.length; i++) {
        const label = barre.labels[i];
        if (!label) continue;
        const p = this.project(this.stringAxis(barre.stringStart + i), fa);
        const t = svgEl("text", {
          class: "mini-fb-barre-label",
          x: p.x, y: p.y,
          "text-anchor": "middle",
          "dominant-baseline": "central",
        });
        t.textContent = label;
        svg.appendChild(t);
      }
    }
  }

  private drawNote(svg: SVGSVGElement, note: NoteRenderData): void {
    const sa = this.stringAxis(note.stringIndex);

    // Muted string: an X in the marker zone before the nut.
    if (note.fret === -1) {
      const p = this.project(sa, -(this.g.noteRadius + 2));
      const s = this.g.noteRadius * 0.55;
      const path = svgEl("path", {
        class: "mini-fb-mute",
        d: `M ${p.x - s} ${p.y - s} L ${p.x + s} ${p.y + s} M ${p.x + s} ${p.y - s} L ${p.x - s} ${p.y + s}`,
      });
      svg.appendChild(path);
      return;
    }

    const df = note.fret - this.startFret;
    if (df < 0 || df > this.fretCount) return;

    const isOpen = note.fret === 0;
    const radius = isOpen ? this.g.noteRadius * this.g.openFactor : this.g.noteRadius;
    const { x, y } = this.project(sa, this.fretAxis(note.fret));
    const fill = this.resolveFill(note);
    const opacity = note.opacity ?? 1;

    // Faint ring around root notes (mirrors the canvas affordance).
    if (note.intervalLabel === "R") {
      svg.appendChild(svgEl("circle", {
        class: "mini-fb-root-ring",
        cx: x, cy: y, r: radius + 2,
        stroke: fill, "stroke-opacity": (opacity * 0.35).toFixed(2),
      }));
    }

    const circle = svgEl("circle", {
      class: "mini-fb-note",
      cx: x, cy: y, r: radius,
      fill: note.fillColor === "transparent" ? "none" : fill,
      opacity,
    });
    if (note.dashed) {
      // Lever-rail candidate: hollow dashed ring, no fill.
      circle.setAttribute("stroke-dasharray", "3 2");
      circle.setAttribute("fill", "none");
      circle.setAttribute("stroke", fill);
      circle.setAttribute("stroke-opacity", "0.6");
    }
    svg.appendChild(circle);

    const text = note.displayLabel ?? "";
    if (text) {
      const t = svgEl("text", {
        class: "mini-fb-note-label",
        x, y,
        "text-anchor": "middle",
        "dominant-baseline": "central",
        fill: note.dashed ? fill : textColorFor(fill),
        "fill-opacity": note.dashed ? "0.75" : "1",
        "font-size": (radius * 1.15).toFixed(1),
      });
      t.textContent = text;
      svg.appendChild(t);
    }
  }

  setActive(active: boolean): void {
    this.svg?.classList.toggle("is-active", active);
  }

  getElement(): HTMLElement | null {
    return this.svg as unknown as HTMLElement | null;
  }

  destroy(): void {
    this.svg?.remove();
    this.svg = null;
  }
}
