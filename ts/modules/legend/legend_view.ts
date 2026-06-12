// ts/modules/legend/legend_view.ts
// The view implementation for the Legend module. Lives inside the module folder —
// an extension is self-contained: module.ts (the contract) + this file (the view).
// It may use core helpers (BaseView, dom) and app domain APIs (fretboard colors,
// settings), but no other view in the app.

import { BaseView } from "../../core/base_view";
import { el, svgEl } from "../../core/dom";
import { AppSettings } from "../../settings";
import { InstrumentSettings, DEFAULT_INSTRUMENT_SETTINGS } from "../../fretboard/fretboard_settings";
import { INTERVAL_COLORS, NOTE_COLORS } from "../../fretboard/colors";

const SWATCH_SIZE = 20;
const SWATCH_CX = SWATCH_SIZE / 2;
const SWATCH_CY = SWATCH_SIZE / 2;
const NOTE_RADIUS = 9;

function _fgColor(fill: string): string {
  const m = fill.match(/rgb\(\s*(\d+),\s*(\d+),\s*(\d+)/);
  if (m) {
    const brightness = (+m[1] * 299 + +m[2] * 587 + +m[3] * 114) / 1000;
    return brightness > 150 ? "#333" : "#eee";
  }
  return "#eee";
}

function _makeNoteSvg(
  fillColor: string,
  circleLabel: string,
  opts: { xOverlay?: boolean; outerRing?: boolean; rootRing?: boolean } = {}
): SVGSVGElement {
  const svg = svgEl<SVGSVGElement>("svg", {
    width: String(SWATCH_SIZE),
    height: String(SWATCH_SIZE),
    viewBox: `0 0 ${SWATCH_SIZE} ${SWATCH_SIZE}`,
    overflow: "visible",
    class: "legend-note-swatch",
  });

  const fill = fillColor && fillColor !== "transparent" ? fillColor : "#9AABB8";

  svg.appendChild(
    svgEl("circle", {
      cx: String(SWATCH_CX),
      cy: String(SWATCH_CY),
      r: String(NOTE_RADIUS),
      fill,
      stroke: "rgba(0,0,0,0.2)",
      "stroke-width": "1",
    })
  );

  if (circleLabel) {
    const text = svgEl<SVGTextElement>("text", {
      x: String(SWATCH_CX),
      y: String(SWATCH_CY),
      "text-anchor": "middle",
      "dominant-baseline": "central",
      "font-size": circleLabel.length > 1 ? "5.5" : "7",
      "font-weight": "600",
      fill: _fgColor(fill),
      "font-family": "Hanken Grotesk, sans-serif",
    });
    text.textContent = circleLabel;
    svg.appendChild(text);
  }

  // Faint ring same color as fill at low opacity — mirrors root-note rendering in fretboard
  if (opts.rootRing) {
    svg.appendChild(
      svgEl("circle", {
        cx: String(SWATCH_CX),
        cy: String(SWATCH_CY),
        r: String(NOTE_RADIUS + 2.5),
        fill: "none",
        stroke: fill,
        "stroke-width": "1.5",
        opacity: "0.35",
      })
    );
  }

  // Thick X — uses --danger CSS var, same as fretboard xOverlay
  if (opts.xOverlay) {
    const sz = NOTE_RADIUS * 0.65;
    const xStyle = "stroke: var(--danger); stroke-width: 2.5; stroke-linecap: round";
    svg.appendChild(
      svgEl("line", {
        x1: String(SWATCH_CX - sz),
        y1: String(SWATCH_CY - sz),
        x2: String(SWATCH_CX + sz),
        y2: String(SWATCH_CY + sz),
        style: xStyle,
      })
    );
    svg.appendChild(
      svgEl("line", {
        x1: String(SWATCH_CX + sz),
        y1: String(SWATCH_CY - sz),
        x2: String(SWATCH_CX - sz),
        y2: String(SWATCH_CY + sz),
        style: xStyle,
      })
    );
  }

  // Outer ring — uses --note-pivot CSS var, same as fretboard outerRing
  if (opts.outerRing) {
    svg.appendChild(
      svgEl("circle", {
        cx: String(SWATCH_CX),
        cy: String(SWATCH_CY),
        r: String(NOTE_RADIUS + 3),
        fill: "none",
        style: "stroke: var(--note-pivot); stroke-width: 2.5",
      })
    );
  }

  return svg;
}

function _makeLegendItem(svg: SVGSVGElement, labelText: string): HTMLDivElement {
  return el("div", { class: "legend-item" }, svg, el("span", { class: "legend-label", text: labelText }));
}

function _makeSectionLabel(text: string): HTMLDivElement {
  return el("div", { class: "legend-section-label", text });
}

function _makeGrid(single = false): HTMLDivElement {
  return el("div", { class: single ? ["legend-grid", "legend-grid--single"] : "legend-grid" });
}

export class LegendView extends BaseView {
  private appSettings: AppSettings;

  constructor(appSettings?: AppSettings) {
    super();
    if (!appSettings) throw new Error("LegendView requires AppSettings instance.");
    this.appSettings = appSettings;
  }

  render(container: HTMLElement): void {
    this.container = container;
    this.container.innerHTML = "";
    this.container.classList.add("legend-view");

    this.container.appendChild(el("div", { class: "legend-title", text: "Legend" }));

    const guitarSettings =
      (this.appSettings.instrumentSettings as InstrumentSettings | undefined) ??
      DEFAULT_INSTRUMENT_SETTINGS;
    const currentScheme = guitarSettings.colorScheme;

    if (currentScheme === "interval") {
      this._renderIntervalSection();
    } else if (currentScheme === "note") {
      this._renderNoteSection();
    } else {
      this._renderSimplifiedSection();
    }

    this._renderOverlaysSection();
  }

  private _renderIntervalSection(): void {
    const c = this.container!;
    c.appendChild(_makeSectionLabel("Intervals"));
    const grid = _makeGrid();

    const tiers: { key: string; label: string; rootRing?: boolean }[] = [
      { key: "R", label: "Root", rootRing: true },
      { key: "2", label: "2nd" },
      { key: "3", label: "3rd" },
      { key: "4", label: "4th" },
      { key: "5", label: "5th" },
      { key: "6", label: "6th" },
      { key: "7", label: "7th" },
    ];

    for (const { key, label, rootRing } of tiers) {
      grid.appendChild(
        _makeLegendItem(_makeNoteSvg(INTERVAL_COLORS[key], key, { rootRing }), label)
      );
    }

    c.appendChild(grid);
  }

  private _renderNoteSection(): void {
    const c = this.container!;
    c.appendChild(_makeSectionLabel("Notes"));
    const grid = _makeGrid();

    for (const key of ["A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#"]) {
      grid.appendChild(
        _makeLegendItem(_makeNoteSvg(NOTE_COLORS[key], key, {}), key)
      );
    }

    c.appendChild(grid);
  }

  private _renderSimplifiedSection(): void {
    const c = this.container!;
    c.appendChild(_makeSectionLabel("Simplified"));
    const grid = _makeGrid(true);

    grid.appendChild(
      _makeLegendItem(
        _makeNoteSvg(INTERVAL_COLORS["R"], "R", { rootRing: true }),
        "Root"
      )
    );
    grid.appendChild(
      _makeLegendItem(
        _makeNoteSvg(INTERVAL_COLORS["2"], "—", {}),
        "Other"
      )
    );

    c.appendChild(grid);
  }

  private _renderOverlaysSection(): void {
    const c = this.container!;
    c.appendChild(_makeSectionLabel("Overlays"));
    const grid = _makeGrid();

    const baseColor = INTERVAL_COLORS["5"];

    grid.appendChild(
      _makeLegendItem(_makeNoteSvg(baseColor, "", { xOverlay: true }), "Avoid")
    );
    grid.appendChild(
      _makeLegendItem(_makeNoteSvg(baseColor, "", { outerRing: true }), "Pivot")
    );

    c.appendChild(grid);
  }

  destroy(): void {
    if (this.container) this.container.innerHTML = "";
    super.destroy();
  }
}
