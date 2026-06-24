// ts/fretboard/views/chord_family_view.ts
// Family tab: the chord's quality "family" for a root, grouped by CAGED shape.
// Renders the anchor (major) plus each sibling with a one-line alteration hint
// and a "N moves" badge. Clicking a card calls onPick (Phase 4: interactive view).

import { FretboardConfig } from "../fretboard_config";
import { ChordLabelDisplay } from "../fretboard_settings";
import { ChordType } from "../../music/chords";
import { ChordFamily, describeAlteration } from "../../music/chord_family";
import { ChordDiagramView } from "./chord_diagram_view";
import { shortChordLabel } from "./chord_view_utils";

export interface ChordFamilyOptions {
  root: string;
  config: FretboardConfig;
  display: ChordLabelDisplay;
  /** Currently-selected quality: highlighted, and the reference every other card's hint is measured from. */
  selectedType: ChordType;
  /** Register a created card view so the host can destroy it later. */
  register: (view: ChordDiagramView) => void;
  /** Called when a family card is picked → opens the interactive view. */
  onPick: (type: ChordType) => void;
}

export function renderChordFamily(container: HTMLElement, family: ChordFamily, opts: ChordFamilyOptions): void {
  const { root, config, display, selectedType, register, onPick } = opts;

  const grid = document.createElement("div");
  grid.classList.add("chord-card-grid", "chord-family-grid");
  container.appendChild(grid);

  // The card every other quality is measured from: the selected type if this
  // family has it, otherwise the major anchor.
  const reference =
    family.members.find((m) => m.type === selectedType) ??
    family.members.find((m) => m.isAnchor) ??
    family.members[0];

  for (const m of family.members) {
    const rsi = m.chord.rootStringIndex;
    const rootPosition =
      m.chord.barre && m.chord.barre.length > 0 && rsi !== undefined && (m.chord.strings[rsi] ?? -1) > 0
        ? { stringIndex: rsi, fret: m.chord.strings[rsi] }
        : undefined;

    const isReference = m.type === reference.type;
    const hint = isReference
      ? "measure every cousin from here"
      : describeAlteration(reference.chord, m.chord, root, config.tuning).hint;

    const view = new ChordDiagramView(
      m.chord,
      shortChordLabel(root, m.type),
      config,
      rootPosition,
      false,
      display,
      {
        subtitle: isReference ? `${family.shapeName} · anchor` : undefined,
        anchor: isReference,
        hint,
        onClick: () => onPick(m.type),
      },
    );
    view.render(grid);
    register(view);
  }
}
