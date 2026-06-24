// ts/fretboard/diagram/chord_diagram.ts
// Shared abstraction over chord-diagram renderers. Both the heavyweight canvas
// Fretboard and the lightweight fixed-size SVG mini renderer implement
// FretboardDiagram, so callers can swap renderers by flipping `style`.

import { FretboardConfig } from "../fretboard_config";
import type { NoteRenderData, BarreData, LineData } from "../renderer";
import { CanvasFretboardDiagram } from "./canvas_fretboard_diagram";
import { SvgMiniFretboardDiagram } from "./svg_mini_fretboard";

export type ChordDiagramStyle = "full" | "mini";

export interface ChordDiagramOptions {
  /** Frets shown in the window (default 5). */
  fretCount?: number;
  /** Mini only: pixel multiplier applied to the fixed base geometry (default 1). */
  scale?: number;
  /** Enable click-to-hear on notes (canvas only; mini ignores). */
  interactiveSound?: boolean;
}

/**
 * A self-contained chord diagram. Implementations own their DOM element
 * (an <svg> or a <canvas>) and (re)draw from the data set via the setters.
 */
export interface FretboardDiagram {
  setStartFret(fret: number): void;
  setNotes(notes: NoteRenderData[]): void;
  setBarres(barres: BarreData[]): void;
  setLines(lines: LineData[]): void;
  /** Creates the element, appends it to `container`, draws once, and returns it. */
  mount(container: HTMLElement): HTMLElement;
  /** Redraws with the current data (call after changing notes/barres post-mount). */
  render(): void;
  /** Highlight affordance (e.g. progression "active chord"). */
  setActive(active: boolean): void;
  getElement(): HTMLElement | null;
  destroy(): void;
}

/**
 * Factory — the single "flip a flag" seam between the renderers. The
 * implementations import this module's interface as a type only, so the static
 * cycle is erased at compile time.
 */
export function createChordDiagram(
  style: ChordDiagramStyle,
  config: FretboardConfig,
  options: ChordDiagramOptions = {},
): FretboardDiagram {
  return style === "full"
    ? new CanvasFretboardDiagram(config, options)
    : new SvgMiniFretboardDiagram(config, options);
}
