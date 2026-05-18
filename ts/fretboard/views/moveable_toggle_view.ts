import { BaseView } from "../../base_view";
import { Chord } from "../chords";
import { FretboardConfig, InstrumentName } from "../fretboard";
import { ChordDiagramView } from "./chord_diagram_view";
import { getMoveableShapes } from "../moveable_shapes";
import { clearAllChildren } from "../instrument_utils";

/**
 * Renders either static chord diagrams or moveable barre-chord shapes depending
 * on the current mode. The "Moveable" checkbox lives in the owning Feature's
 * header row; call setIsMoveable() when it changes.
 */
export class MoveableToggleView extends BaseView {
  private diagramDiv: HTMLElement | null = null;
  private isMoveable = false;

  private readonly staticViews: ChordDiagramView[];
  private readonly moveableViews: ChordDiagramView[];
  readonly hasMoveableShapes: boolean;

  constructor(chords: ReadonlyArray<Chord>, fretboardConfig: FretboardConfig, initialIsMoveable: boolean = false, instrumentName: InstrumentName = "Guitar") {
    super();
    this.isMoveable = initialIsMoveable;
    this.staticViews = chords.map(
      (c) => new ChordDiagramView(c, c.name, fretboardConfig)
    );

    const moveableResults = ([] as ReturnType<typeof getMoveableShapes>).concat(
      ...Array.from(chords).map((c: Chord) =>
        getMoveableShapes(instrumentName, c.name, fretboardConfig.tuning, c.chordType)
      )
    );

    this.moveableViews = moveableResults.map(
      (r) => new ChordDiagramView(r.chord, r.title, fretboardConfig, {
        stringIndex: r.rootStringIndex,
        fret: r.rootFret,
      })
    );

    this.hasMoveableShapes = this.moveableViews.length > 0;
  }

  /** Called by the owning Feature when the "Moveable" checkbox changes. */
  setIsMoveable(value: boolean): void {
    this.isMoveable = value;
    this._renderDiagrams();
  }

  render(container: HTMLElement): void {
    if (!this.diagramDiv) {
      this.diagramDiv = document.createElement("div");
      this.diagramDiv.style.cssText = "display: flex; flex-wrap: wrap;";
    }
    if (!this.diagramDiv.parentNode) {
      container.appendChild(this.diagramDiv);
    }
    this._renderDiagrams();
  }

  private _renderDiagrams(): void {
    if (!this.diagramDiv) return;
    clearAllChildren(this.diagramDiv);

    if (this.isMoveable) {
      this.staticViews.forEach((v) => v.render(this.diagramDiv!));
      this.moveableViews.forEach((v) => v.render(this.diagramDiv!));
    } else {
      this.staticViews.forEach((v) => v.render(this.diagramDiv!));
    }
  }

  start(): void {
    this._activeViews().forEach((v) => v.start());
  }

  stop(): void {
    [...this.staticViews, ...this.moveableViews].forEach((v) => v.stop());
  }

  destroy(): void {
    [...this.staticViews, ...this.moveableViews].forEach((v) => v.destroy());
    if (this.diagramDiv?.parentNode) {
      this.diagramDiv.parentNode.removeChild(this.diagramDiv);
    }
    this.diagramDiv = null;
    super.destroy();
  }

  private _activeViews(): ChordDiagramView[] {
    return this.isMoveable
      ? [...this.staticViews, ...this.moveableViews]
      : this.staticViews;
  }
}
