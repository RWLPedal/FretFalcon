// ts/modules/chord/chord_tool_view.ts
// The Chord tool: a stateful custom view with an in-panel control bar
// (Root · Positions/Family · contextual Type) instead of the config drawer.
// Stays drivable (Root/Type/Capo) by implementing receiveSignals (duck-typed
// as a SignalSink by the panel host). Co-located in the module folder per the
// extension-surface architecture rule.

import { BaseView } from "../../core/base_view";
import { AppSettings } from "../../settings";
import { emitEvent } from "../../core/events";
import { FretboardConfig } from "../../fretboard/fretboard_config";
import { InstrumentName } from "../../fretboard/instruments";
import {
  DEFAULT_INSTRUMENT_SETTINGS,
  InstrumentSettings,
  ChordLabelDisplay,
} from "../../fretboard/fretboard_settings";
import {
  Chord,
  ChordType,
  CHORD_TYPE_SORT_ORDER,
  ALL_CHORD_ROOTS,
  getChordLibraryForInstrument,
  getAvailableRoots,
  getAvailableChordTypes,
  findChordByRootAndType,
  chordsAreEquivalent,
} from "../../music/chords";
import type { NoteName } from "../../music/music_types";
import {
  getMoveableShapes,
  getEasiestMoveableShape,
  MOVEABLE_CHORD_LIBRARIES,
} from "../../music/moveable_shapes";
import { capoVoicing, capoChordTitle } from "../../fretboard/capo";
import { ChordDiagramView } from "../../fretboard/views/chord_diagram_view";
import { renderChordFamily } from "../../fretboard/views/chord_family_view";
import { renderChordInteractive, ChordInteractiveHandle } from "../../fretboard/views/chord_interactive_view";
import { buildChordFamily, buildChordVoicings, ChordVoicing, ChordFamily } from "../../music/chord_family";
import { shortChordLabel, buildChordFretboardConfig } from "../../fretboard/views/chord_view_utils";
import { DriveSignal, SignalKind, SignalState, KeyType } from "../../panels/link_types";

type ChordTab = "positions" | "family";

interface ChordToolState {
  tab: ChordTab;
  root: string;
  type: string; // a ChordType value
  display: ChordLabelDisplay;
  /** Selected CAGED voicing in Family mode (guitar). "" until first reconciled. */
  voicing: string;
}

const VALID_DISPLAY = new Set<ChordLabelDisplay>(["fingering", "interval", "notes"]);
const DISPLAY_LABELS: [ChordLabelDisplay, string][] = [
  ["fingering", "Fingering"],
  ["interval", "Interval"],
  ["notes", "Notes"],
];

function normalizeType(raw: unknown): string {
  if (typeof raw === "string" && (CHORD_TYPE_SORT_ORDER as string[]).includes(raw)) return raw;
  return ChordType.MAJOR;
}

/** Maps a Chord drive signal to a ChordType value, or undefined. */
function chordTypeFromSignal(s: DriveSignal): ChordType | undefined {
  if (s.kind !== SignalKind.Chord) return undefined;
  const sig = s as { chordKey?: string; keyType?: KeyType };
  if (sig.chordKey) {
    const sep = sig.chordKey.indexOf("_");
    if (sep !== -1) {
      const suffix = sig.chordKey.slice(sep + 1);
      const map: Record<string, ChordType> = {
        MAJ: ChordType.MAJOR, MIN: ChordType.MINOR, DIM: ChordType.DIM,
        DOM7: ChordType.DOM7, MAJ7: ChordType.MAJ7, MIN7: ChordType.MIN7,
      };
      if (map[suffix]) return map[suffix];
    }
  }
  return sig.keyType === KeyType.Major ? ChordType.MAJOR : ChordType.MINOR;
}

export class ChordToolView extends BaseView {
  private readonly settings: AppSettings;
  private readonly fretboardConfig: FretboardConfig;
  private readonly instrument: InstrumentName;
  private readonly hasMoveable: boolean;
  private state: ChordToolState;
  private capoFret = 0;

  private contentEl: HTMLElement | null = null;
  private rootSelect: HTMLSelectElement | null = null;
  private typeSelect: HTMLSelectElement | null = null;
  private displaySelect: HTMLSelectElement | null = null;
  private voicingWrap: HTMLElement | null = null;
  private voicingSelect: HTMLSelectElement | null = null;
  private tabButtons: Record<ChordTab, HTMLButtonElement> = {} as any;
  private activeViews: ChordDiagramView[] = [];
  private interactive: ChordInteractiveHandle | null = null;
  /** When set (Family tab), the interactive lever-rail view is shown for this quality. */
  private activeFamilyType: ChordType | null = null;

  constructor(state: unknown, settings: AppSettings) {
    super();
    this.settings = settings;
    const s = (state ?? {}) as Record<string, unknown>;

    let root = typeof s.root === "string" ? s.root : "G";
    let type = normalizeType(s.type);
    const voicing = typeof s.voicing === "string" ? s.voicing : "";
    let display: ChordLabelDisplay = VALID_DISPLAY.has(s.display as ChordLabelDisplay)
      ? (s.display as ChordLabelDisplay) : "fingering";
    // Legacy persisted shape: { featureTypeName:'Chord', config:[root,type,display] }
    if (Array.isArray(s.config)) {
      const [r, t, d] = s.config as string[];
      if (r) root = r;
      if (t) type = normalizeType(t);
      if (d && VALID_DISPLAY.has(d as ChordLabelDisplay)) display = d as ChordLabelDisplay;
    }
    this.state = { tab: s.tab === "family" ? "family" : "positions", root, type, display, voicing };

    const gs = (settings.instrumentSettings as InstrumentSettings | undefined) ?? DEFAULT_INSTRUMENT_SETTINGS;
    this.instrument = (gs.instrument as InstrumentName) ?? InstrumentName.Guitar;
    this.hasMoveable = this.instrument in MOVEABLE_CHORD_LIBRARIES;
    this.fretboardConfig = buildChordFretboardConfig(settings);
  }

  // ─── View ───────────────────────────────────────────────────────────────────

  render(container: HTMLElement): void {
    this.container = container;
    container.innerHTML = "";
    container.classList.add("chord-tool-view");

    this.buildControlBar(container);

    this.contentEl = document.createElement("div");
    this.contentEl.classList.add("chord-tool-content");
    container.appendChild(this.contentEl);

    this.renderContent();
    this.persist();
    this.updateTitle();
  }

  private buildControlBar(container: HTMLElement): void {
    // Reuse the shared config-compact styling (styled selects/toggles) and its
    // single wrapping row, so all controls sit on one rewrapping line.
    const bar = document.createElement("div");
    bar.classList.add("config-compact", "chord-tool-bar");

    // Root select (label-less chip, like the mock's "[G]")
    const rootWrap = document.createElement("div");
    rootWrap.classList.add("config-select-wrap");
    const rootSelect = document.createElement("select");
    rootSelect.title = "Root note";
    const roots = this.hasMoveable
      ? ([...ALL_CHORD_ROOTS] as string[])
      : getAvailableRoots(getChordLibraryForInstrument(this.instrument));
    for (const r of roots) {
      const opt = document.createElement("option");
      opt.value = r; opt.textContent = r;
      if (r === this.state.root) opt.selected = true;
      rootSelect.appendChild(opt);
    }
    rootSelect.addEventListener("change", () => {
      this.state.root = rootSelect.value;
      this.activeFamilyType = null;
      this.onStateChanged();
    });
    this.rootSelect = rootSelect;
    rootWrap.append(rootSelect);
    bar.appendChild(rootWrap);

    // Type select (next to Root; shown in both Positions and Family — in Family
    // it picks the highlighted reference quality that hints are measured from).
    const typeWrap = document.createElement("div");
    typeWrap.classList.add("config-select-wrap", "chord-tool-type");
    const typeSelect = document.createElement("select");
    typeSelect.title = "Chord type";
    const types = this.hasMoveable
      ? CHORD_TYPE_SORT_ORDER
      : getAvailableChordTypes(getChordLibraryForInstrument(this.instrument));
    for (const t of types) {
      const opt = document.createElement("option");
      opt.value = t; opt.textContent = t;
      if (t === this.state.type) opt.selected = true;
      typeSelect.appendChild(opt);
    }
    typeSelect.addEventListener("change", () => {
      this.state.type = typeSelect.value;
      this.onStateChanged();
    });
    this.typeSelect = typeSelect;
    typeWrap.append(typeSelect);
    bar.appendChild(typeWrap);

    // Tabs
    const tabs = document.createElement("div");
    tabs.classList.add("chord-tool-tabs");
    const mkTab = (tab: ChordTab, label: string) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.classList.add("config-toggle-btn");
      btn.textContent = label;
      btn.classList.toggle("is-active", this.state.tab === tab);
      btn.addEventListener("click", () => {
        if (this.state.tab === tab) return;
        this.state.tab = tab;
        this.activeFamilyType = null;
        this.tabButtons.positions.classList.toggle("is-active", tab === "positions");
        this.tabButtons.family.classList.toggle("is-active", tab === "family");
        this.onStateChanged();
      });
      this.tabButtons[tab] = btn;
      tabs.appendChild(btn);
    };
    mkTab("positions", "Positions");
    mkTab("family", "Family");
    bar.appendChild(tabs);

    // Display select (Fingering / Interval / Notes).
    const displayWrap = document.createElement("div");
    displayWrap.classList.add("config-select-wrap", "chord-tool-display");
    const displaySelect = document.createElement("select");
    displaySelect.title = "Note labels";
    for (const [value, label] of DISPLAY_LABELS) {
      const opt = document.createElement("option");
      opt.value = value; opt.textContent = label;
      if (value === this.state.display) opt.selected = true;
      displaySelect.appendChild(opt);
    }
    displaySelect.addEventListener("change", () => {
      this.state.display = displaySelect.value as ChordLabelDisplay;
      this.onStateChanged();
    });
    this.displaySelect = displaySelect;
    displayWrap.append(displaySelect);
    bar.appendChild(displayWrap);

    // Voicing select (Family tab only; populated per-root in renderContent).
    // Placed to the right of the display toggle.
    const voicingWrap = document.createElement("div");
    voicingWrap.classList.add("config-select-wrap", "chord-tool-voicing", "is-hidden");
    const voicingSelect = document.createElement("select");
    voicingSelect.title = "Voicing (shape)";
    voicingSelect.addEventListener("change", () => {
      this.state.voicing = voicingSelect.value;
      this.onStateChanged();
    });
    this.voicingWrap = voicingWrap;
    this.voicingSelect = voicingSelect;
    voicingWrap.append(voicingSelect);
    bar.appendChild(voicingWrap);

    container.appendChild(bar);
  }

  private onStateChanged(): void {
    this.renderContent();
    this.persist();
    this.updateTitle();
  }

  // ─── Content ─────────────────────────────────────────────────────────────────

  private clearContent(): void {
    this.activeViews.forEach(v => v.destroy());
    this.activeViews = [];
    this.interactive?.destroy();
    this.interactive = null;
    if (this.contentEl) this.contentEl.innerHTML = "";
  }

  private renderContent(): void {
    if (!this.contentEl) return;
    this.clearContent();

    if (this.state.tab !== "family") {
      this.setVoicingVisible(false);
      this.renderPositions();
      return;
    }

    const tuning = this.fretboardConfig.tuning;
    const voicings = buildChordVoicings(this.instrument, this.state.root, tuning);

    if (voicings.length > 0) {
      // Voicing-tagged instrument (guitar): the user picks the CAGED voicing from
      // the control bar; reconcile to the default if the saved one isn't available.
      if (!voicings.some((v) => v.voicingId === this.state.voicing)) {
        this.state.voicing = (voicings.find((v) => v.isDefault) ?? voicings[0]).voicingId;
      }
      this.syncVoicingOptions(voicings);
      this.setVoicingVisible(true);
      const selected = voicings.find((v) => v.voicingId === this.state.voicing) ?? voicings[0];
      this.renderFamily(selected);
      return;
    }

    // Fallback (no voicing-tagged shapes): single anchored family, no selector.
    this.setVoicingVisible(false);
    const family = buildChordFamily(this.instrument, this.state.root, tuning);
    if (!family || family.members.length === 0) {
      const msg = document.createElement("div");
      msg.classList.add("chord-tool-empty");
      msg.textContent = `No chord family available for ${this.state.root} on ${this.instrument}.`;
      this.contentEl.appendChild(msg);
      return;
    }
    this.renderFamily(family);
  }

  /** Renders either the interactive lever-rail or the family grid for `family`. */
  private renderFamily(family: ChordFamily): void {
    if (!this.contentEl) return;
    if (this.activeFamilyType !== null) {
      this.interactive = renderChordInteractive(this.contentEl, {
        family,
        root: this.state.root,
        config: this.fretboardConfig,
        initialType: this.activeFamilyType,
        onBack: () => { this.activeFamilyType = null; this.renderContent(); },
      });
    } else {
      renderChordFamily(this.contentEl, family, {
        root: this.state.root,
        config: this.fretboardConfig,
        display: this.state.display,
        selectedType: this.state.type as ChordType,
        register: (v) => this.activeViews.push(v),
        onPick: (type) => { this.activeFamilyType = type; this.renderContent(); },
      });
    }
  }

  private setVoicingVisible(visible: boolean): void {
    this.voicingWrap?.classList.toggle("is-hidden", !visible);
  }

  /** Rebuilds the voicing select's options for the current root's voicings. */
  private syncVoicingOptions(voicings: ChordVoicing[]): void {
    const sel = this.voicingSelect;
    if (!sel) return;
    sel.innerHTML = "";
    for (const v of voicings) {
      const opt = document.createElement("option");
      opt.value = v.voicingId;
      opt.textContent = v.shapeName;
      sel.appendChild(opt);
    }
    sel.value = this.state.voicing;
  }

  private renderPositions(): void {
    if (!this.contentEl) return;
    const grid = document.createElement("div");
    grid.classList.add("chord-card-grid");
    this.contentEl.appendChild(grid);

    const library = getChordLibraryForInstrument(this.instrument);
    const root = this.state.root;
    const type = this.state.type as ChordType;
    const tuning = this.fretboardConfig.tuning;

    const mount = (
      chord: Chord,
      title: string,
      subtitle?: string,
      rootPosition?: { stringIndex: number; fret: number },
      isFallback?: boolean,
    ) => {
      const view = new ChordDiagramView(chord, title, this.fretboardConfig, rootPosition, isFallback, this.state.display, { subtitle });
      view.render(grid);
      this.activeViews.push(view);
    };

    // Capo: show a single re-voiced shape playable above the capo.
    if (this.capoFret > 0) {
      const ctx = { library, instrument: this.instrument, tuning };
      const { chord, shapeLabel } = capoVoicing(root, type, `${root} ${type}`, this.capoFret, ctx);
      mount(chord, capoChordTitle(chord, this.capoFret, shapeLabel));
      return;
    }

    const open = findChordByRootAndType(library, root as NoteName, type);
    if (open) mount(open, shortChordLabel(root, type), "Open");

    const moveables = getMoveableShapes(this.instrument, `${root} ${type}`, tuning, type);
    for (const m of moveables) {
      if (open && chordsAreEquivalent(open, m)) continue;
      const rsi = m.rootStringIndex;
      const rootPosition = rsi !== undefined && m.strings[rsi] >= 0
        ? { stringIndex: rsi, fret: m.strings[rsi] }
        : undefined;
      mount(m, shortChordLabel(root, type), m.shapeName, rootPosition);
    }

    if (!open && moveables.length === 0) {
      const fallback = getEasiestMoveableShape(this.instrument, `${root} ${type}`, tuning, type);
      if (fallback) {
        mount(fallback, shortChordLabel(root, type), fallback.shapeName, undefined, true);
      } else {
        const msg = document.createElement("div");
        msg.classList.add("chord-tool-empty");
        msg.textContent = `No ${type} shape found for ${root} on ${this.instrument}.`;
        this.contentEl.appendChild(msg);
      }
    }
  }

  // ─── Persistence / title ─────────────────────────────────────────────────────

  private persist(): void {
    if (!this.container) return;
    emitEvent(this.container, "feature-state-changed", {
      tab: this.state.tab,
      root: this.state.root,
      type: this.state.type,
      display: this.state.display,
      voicing: this.state.voicing,
    });
  }

  private updateTitle(): void {
    if (!this.container) return;
    const title = this.state.tab === "family"
      ? `${this.state.root} Family`
      : shortChordLabel(this.state.root, this.state.type as ChordType);
    emitEvent(this.container, "feature-title-changed", { title });
  }

  // ─── Drive (SignalSink, duck-typed) ──────────────────────────────────────────

  receiveSignals(signals: DriveSignal[]): void {
    let changed = false;
    for (const s of signals) {
      if ((s.state ?? SignalState.Current) === SignalState.Next) continue;
      if (s.kind === SignalKind.Chord) {
        const sig = s as { rootNote?: string };
        if (sig.rootNote) { this.state.root = sig.rootNote; changed = true; }
        const t = chordTypeFromSignal(s);
        if (t) { this.state.type = t; changed = true; }
      } else if (s.kind === SignalKind.Capo) {
        const fret = (s as { fret?: number }).fret ?? 0;
        if (fret !== this.capoFret) { this.capoFret = fret; changed = true; }
      }
    }
    if (changed) {
      this.activeFamilyType = null;
      this.syncControls();
      this.onStateChanged();
    }
  }

  private syncControls(): void {
    if (this.rootSelect) this.rootSelect.value = this.state.root;
    if (this.typeSelect) this.typeSelect.value = this.state.type;
  }

  destroy(): void {
    this.clearContent();
    this.rootSelect = null;
    this.typeSelect = null;
    this.voicingWrap = null;
    this.voicingSelect = null;
    this.contentEl = null;
    super.destroy();
  }
}
