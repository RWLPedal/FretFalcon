// ts/fretboard/diagram/canvas_fretboard_diagram.ts
// Thin adapter that makes the existing canvas Fretboard satisfy FretboardDiagram.
// The full renderer is left untouched; this only owns the <canvas> element.

import { FretboardConfig } from "../fretboard_config";
import { Fretboard, NoteRenderData, BarreData, LineData } from "../renderer";
import { START_PX } from "../fretboard_utils";
import type { FretboardDiagram, ChordDiagramOptions } from "./chord_diagram";

export class CanvasFretboardDiagram implements FretboardDiagram {
  private readonly fretboard: Fretboard;
  private readonly fretCount: number;
  private readonly width: number;
  private readonly height: number;
  private readonly interactiveSound: boolean;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  constructor(private readonly config: FretboardConfig, options: ChordDiagramOptions = {}) {
    this.fretCount = options.fretCount ?? 5;
    this.interactiveSound = options.interactiveSound ?? false;
    this.width = config.getRequiredWidth(this.fretCount);
    this.height = config.getRequiredHeight(this.fretCount);
    const scaledStartPx = START_PX * config.scaleFactor;
    this.fretboard = new Fretboard(config, scaledStartPx, scaledStartPx, this.fretCount);
  }

  setStartFret(fret: number): void { this.fretboard.setStartFret(fret); }
  setNotes(notes: NoteRenderData[]): void { this.fretboard.setNotes(notes); }
  setBarres(barres: BarreData[]): void { this.fretboard.setBarres(barres); }
  setLines(lines: LineData[]): void { this.fretboard.setLines(lines); }

  mount(container: HTMLElement): HTMLElement {
    const canvas = document.createElement("canvas");
    canvas.width = this.width;
    canvas.height = this.height;
    canvas.style.maxWidth = "100%";
    canvas.style.height = "auto";
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    container.appendChild(canvas);
    if (this.interactiveSound) this.fretboard.attachClickHandler(canvas);
    this.render();
    return canvas;
  }

  render(): void {
    if (this.ctx) this.fretboard.render(this.ctx);
  }

  setActive(active: boolean): void {
    if (!this.canvas) return;
    this.canvas.style.boxShadow = active ? "0 0 0 2px var(--clr-accent, #5a9)" : "";
    this.canvas.style.borderRadius = active ? "4px" : "";
  }

  getElement(): HTMLElement | null { return this.canvas; }

  destroy(): void {
    this.fretboard.detachClickHandler();
    this.canvas?.remove();
    this.canvas = null;
    this.ctx = null;
    this.fretboard.clearMarkings();
  }
}
