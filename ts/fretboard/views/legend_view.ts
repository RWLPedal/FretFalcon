import { BaseView } from "../../base_view";
import { AppSettings } from "../../settings";
import { InstrumentSettings, DEFAULT_INSTRUMENT_SETTINGS } from "../fretboard_settings";
import { INTERVAL_COLORS, NOTE_COLORS } from "../colors";

const SVG_NS = "http://www.w3.org/2000/svg";
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
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", String(SWATCH_SIZE));
  svg.setAttribute("height", String(SWATCH_SIZE));
  svg.setAttribute("viewBox", `0 0 ${SWATCH_SIZE} ${SWATCH_SIZE}`);
  svg.setAttribute("overflow", "visible");
  svg.classList.add("legend-note-swatch");

  const fill = fillColor && fillColor !== "transparent" ? fillColor : "#9AABB8";

  const circle = document.createElementNS(SVG_NS, "circle");
  circle.setAttribute("cx", String(SWATCH_CX));
  circle.setAttribute("cy", String(SWATCH_CY));
  circle.setAttribute("r", String(NOTE_RADIUS));
  circle.setAttribute("fill", fill);
  circle.setAttribute("stroke", "rgba(0,0,0,0.2)");
  circle.setAttribute("stroke-width", "1");
  svg.appendChild(circle);

  if (circleLabel) {
    const fg = _fgColor(fill);
    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("x", String(SWATCH_CX));
    text.setAttribute("y", String(SWATCH_CY));
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "central");
    text.setAttribute("font-size", circleLabel.length > 1 ? "5.5" : "7");
    text.setAttribute("font-weight", "600");
    text.setAttribute("fill", fg);
    text.setAttribute("font-family", "Hanken Grotesk, sans-serif");
    text.textContent = circleLabel;
    svg.appendChild(text);
  }

  // Faint ring same color as fill at low opacity — mirrors root-note rendering in fretboard
  if (opts.rootRing) {
    const ring = document.createElementNS(SVG_NS, "circle");
    ring.setAttribute("cx", String(SWATCH_CX));
    ring.setAttribute("cy", String(SWATCH_CY));
    ring.setAttribute("r", String(NOTE_RADIUS + 2.5));
    ring.setAttribute("fill", "none");
    ring.setAttribute("stroke", fill);
    ring.setAttribute("stroke-width", "1.5");
    ring.setAttribute("opacity", "0.35");
    svg.appendChild(ring);
  }

  // Thick X — uses --danger CSS var, same as fretboard xOverlay
  if (opts.xOverlay) {
    const sz = NOTE_RADIUS * 0.65;
    const l1 = document.createElementNS(SVG_NS, "line");
    l1.setAttribute("x1", String(SWATCH_CX - sz));
    l1.setAttribute("y1", String(SWATCH_CY - sz));
    l1.setAttribute("x2", String(SWATCH_CX + sz));
    l1.setAttribute("y2", String(SWATCH_CY + sz));
    l1.setAttribute("style", "stroke: var(--danger); stroke-width: 2.5; stroke-linecap: round");
    svg.appendChild(l1);

    const l2 = document.createElementNS(SVG_NS, "line");
    l2.setAttribute("x1", String(SWATCH_CX + sz));
    l2.setAttribute("y1", String(SWATCH_CY - sz));
    l2.setAttribute("x2", String(SWATCH_CX - sz));
    l2.setAttribute("y2", String(SWATCH_CY + sz));
    l2.setAttribute("style", "stroke: var(--danger); stroke-width: 2.5; stroke-linecap: round");
    svg.appendChild(l2);
  }

  // Outer ring — uses --note-pivot CSS var, same as fretboard outerRing
  if (opts.outerRing) {
    const ring = document.createElementNS(SVG_NS, "circle");
    ring.setAttribute("cx", String(SWATCH_CX));
    ring.setAttribute("cy", String(SWATCH_CY));
    ring.setAttribute("r", String(NOTE_RADIUS + 3));
    ring.setAttribute("fill", "none");
    ring.setAttribute("style", "stroke: var(--note-pivot); stroke-width: 2.5");
    svg.appendChild(ring);
  }

  return svg;
}

function _makeLegendItem(svg: SVGSVGElement, labelText: string): HTMLDivElement {
  const item = document.createElement("div");
  item.classList.add("legend-item");
  item.appendChild(svg);
  const label = document.createElement("span");
  label.classList.add("legend-label");
  label.textContent = labelText;
  item.appendChild(label);
  return item;
}

function _makeSectionLabel(text: string): HTMLDivElement {
  const el = document.createElement("div");
  el.classList.add("legend-section-label");
  el.textContent = text;
  return el;
}

function _makeGrid(single = false): HTMLDivElement {
  const grid = document.createElement("div");
  grid.classList.add("legend-grid");
  if (single) grid.classList.add("legend-grid--single");
  return grid;
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

    const titleEl = document.createElement("div");
    titleEl.classList.add("legend-title");
    titleEl.textContent = "Legend";
    this.container.appendChild(titleEl);

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
