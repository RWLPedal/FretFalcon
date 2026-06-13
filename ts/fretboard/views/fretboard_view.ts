import { BaseView } from "../../core/base_view";
import { FretboardConfig } from "../fretboard_config";
import {
  Fretboard,
  NoteRenderData,
  LineData,
  PolygonData,
} from "../renderer";
import { addCanvas, START_PX } from "../fretboard_utils";

/**
 * A View that wraps a Fretboard instance, sets up its canvas,
 * and delegates rendering and data updates to it.
 */
export class FretboardView extends BaseView {
  private fretboardConfig: FretboardConfig;
  private fretCount: number;
  private fretboard: Fretboard; // Internal Fretboard logic instance
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private soundEnabled: boolean;

  // Store calculated dimensions (mostly for canvas creation)
  private requiredWidth: number = 0;
  private requiredHeight: number = 0;

  /**
   * Creates a FretboardView.
   * @param fretboardConfig - The configuration for the fretboard appearance.
   * @param fretCount - The number of frets to display.
   */
  constructor(fretboardConfig: FretboardConfig, fretCount: number, soundEnabled = true) {
    super();
    this.fretboardConfig = fretboardConfig;
    this.fretCount = fretCount > 0 ? fretCount : 12;
    this.soundEnabled = soundEnabled;

    // Calculate dimensions needed for the canvas based on config and fret count
    this.calculateDimensions();

    // Instantiate the Fretboard logic class
    // The Fretboard class itself uses START_PX internally for drawing padding
    this.fretboard = new Fretboard(
      this.fretboardConfig,
      this.fretboardConfig.scaleFactor * START_PX, // Pass scaled start X
      this.fretboardConfig.scaleFactor * START_PX, // Pass scaled start Y
      this.fretCount
    );
  }

  /** Calculates the required canvas dimensions, accounting for orientation. */
  private calculateDimensions(): void {
    this.requiredWidth = this.fretboardConfig.getRequiredWidth(this.fretCount);
    this.requiredHeight = this.fretboardConfig.getRequiredHeight(this.fretCount);
  }

  /** Creates the canvas and triggers the initial render via the Fretboard instance. */
  render(container: HTMLElement): void {
    if (!this.canvas) {
      this.createCanvas(container);
    } else {
      if (!this.canvas.isConnected) {
        // Re-attach if detached or in a detached subtree
        container.appendChild(this.canvas);
      }
    }

    // Always delegate rendering to the Fretboard instance
    if (this.ctx) {
      this.fretboard.render(this.ctx);
    } else {
      console.error("Canvas context not available for FretboardView render.");
    }
  }

  /** Creates the canvas element. */
  private createCanvas(container: HTMLElement): void {
    const canvasIdSuffix = `fretboard-${Date.now()}`;
    this.canvas = addCanvas(container, canvasIdSuffix);
    this.canvas.width = Math.max(50, this.requiredWidth);
    this.canvas.height = Math.max(50, this.requiredHeight);
    this.canvas.classList.add("fretboard-view-canvas");

    this.ctx = this.canvas.getContext("2d");
    if (!this.ctx) {
      console.error("Failed to get 2D context for FretboardView.");
      this.canvas = null;
      return;
    }
    if (this.soundEnabled) {
      this.fretboard.attachClickHandler(this.canvas);
    }
  }

  // --- Public Methods to Pass Data to Fretboard Instance ---

  public setNotes(notes: NoteRenderData[]): void {
    this.fretboard.setNotes(notes);
    this.redrawIfReady(); // Trigger redraw after data update
  }

  public setLines(lines: LineData[]): void {
    this.fretboard.setLines(lines);
    this.redrawIfReady();
  }

  public setPolygons(polygons: PolygonData[]): void {
    this.fretboard.setPolygons(polygons);
    this.redrawIfReady();
  }

  public clearMarkings(): void {
    this.fretboard.clearMarkings();
    this.redrawIfReady();
  }

  /** Helper to redraw the canvas content via the Fretboard instance. */
  private redrawIfReady(): void {
    if (this.ctx && this.canvas?.parentNode) {
      // Use rAF for potentially smoother updates if rapid changes occur
      requestAnimationFrame(() => {
        if (this.ctx) this.fretboard.render(this.ctx);
      });
    }
  }

  // --- Expose Methods/Properties (Optional) ---
  // May not be needed if Fretboard handles all drawing
  public getFretboard(): Fretboard {
    return this.fretboard;
  }
  public getCanvasElement(): HTMLCanvasElement | null {
    return this.canvas;
  }

  destroy(): void {
    this.fretboard.detachClickHandler();
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.fretboard.clearMarkings();
    super.destroy();
  }
}
