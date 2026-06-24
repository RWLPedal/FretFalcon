// ts/fretboard/views/chord_interactive_view.ts
// Interactive "lever-rail" view: a regular-sized fretboard for a chord family
// that morphs between qualities via modifier buttons. Candidate frets each
// string can slide to are drawn as faint DOTTED circles; the active quality's
// notes are solid and interval-coloured. Switching quality SLIDES the moving
// notes along their rail (fractional fret) while their colour morphs. A styled
// header/legend/name/anchor/modifier/hint frame surrounds the board.

import { FretboardConfig } from "../fretboard_config";
import { Chord, ChordType, CHORD_TYPE_INTERVALS } from "../../music/chords";
import { ChordFamily } from "../../music/chord_family";
import { getKeyIndex, chordToneIntervalLabel, NOTE_NAMES_FROM_A } from "../fretboard_utils";
import { getColor } from "../colors";
import { createChordDiagram, FretboardDiagram } from "../diagram/chord_diagram";
import { computeChordStartFret } from "../diagram/chord_framing";
import type { NoteRenderData } from "../renderer";
import { shortChordLabel } from "./chord_view_utils";

const FRET_COUNT = 5;
const SLIDE_MS = 280;

const MODIFIER_LABELS: Partial<Record<ChordType, string>> = {
  [ChordType.MAJOR]: "maj",
  [ChordType.MINOR]: "min",
  [ChordType.SUS2]: "sus2",
  [ChordType.SUS4]: "sus4",
  [ChordType.DOM7]: "7",
  [ChordType.MAJ7]: "maj7",
  [ChordType.MIN7]: "m7",
  [ChordType.DIM]: "dim",
  [ChordType.ADD9]: "add9",
  [ChordType.MINOR_ADD9]: "m(add9)",
};

export interface ChordInteractiveOptions {
  family: ChordFamily;
  root: string;
  config: FretboardConfig;
  initialType: ChordType;
  onBack: () => void;
}

export interface ChordInteractiveHandle {
  destroy(): void;
}

function intervalAt(
  config: FretboardConfig,
  stringIndex: number,
  fret: number,
  rootIdx: number,
  chordType: ChordType,
): string {
  const note = (config.tuning.notes[stringIndex] + fret) % 12;
  return chordToneIntervalLabel(((note - rootIdx) % 12 + 12) % 12, chordType);
}

/** Pretty interval for a circle label: b → ♭. */
function pretty(label: string): string {
  return label.replace("b", "♭");
}

/** Fret the diagram window starts at, stable across morphs (from the anchor shape). */
function computeStartFret(anchor: Chord): number {
  return computeChordStartFret(anchor.strings, anchor.barre, FRET_COUNT);
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Parses an "rgb(r, g, b)" / "#rrggbb" colour into a tuple, or null. */
function parseColor(c: string): [number, number, number] | null {
  const m = c.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (m) return [+m[1], +m[2], +m[3]];
  const h = c.trim().replace("#", "");
  if (h.length === 6) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  return null;
}

/** Linearly interpolates two colour strings, returning an "rgb(...)" string. */
function lerpColor(from: string, to: string, t: number): string {
  const a = parseColor(from);
  const b = parseColor(to);
  if (!a || !b) return t < 0.5 ? from : to;
  const ch = (i: number) => Math.round(a[i] + (b[i] - a[i]) * t);
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
}

export function renderChordInteractive(
  container: HTMLElement,
  opts: ChordInteractiveOptions,
): ChordInteractiveHandle {
  const { family, root, config, onBack } = opts;
  const rootIdx = getKeyIndex(root);
  const stringCount = config.tuning.notes.length;
  const anchor = family.members.find((m) => m.isAnchor)?.chord ?? family.members[0].chord;
  const startFret = computeStartFret(anchor);

  let activeType: ChordType = family.members.some((m) => m.type === opts.initialType)
    ? opts.initialType
    : family.members[0].type;
  let rafId: number | null = null;

  const root_ = document.createElement("div");
  root_.classList.add("chord-interactive");

  // ── Header: back · chord name ────────────────────────────────────────────────
  // The shape/voicing is chosen from the shared control bar, so it isn't echoed
  // here. The live spelling (notes + numbers) lives in the modifier section.
  const header = document.createElement("div");
  header.classList.add("chord-interactive-header");
  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.classList.add("chord-interactive-back");
  backBtn.innerHTML = '<span class="material-icons">arrow_back</span>';
  backBtn.title = "Back to family";
  backBtn.addEventListener("click", () => onBack());
  const nameEl = document.createElement("span");
  nameEl.classList.add("chord-interactive-name");
  header.append(backBtn, nameEl);
  root_.appendChild(header);

  // ── Board ──────────────────────────────────────────────────────────────────
  const diagramHost = document.createElement("div");
  diagramHost.classList.add("chord-interactive-board");
  root_.appendChild(diagramHost);
  const diagram: FretboardDiagram = createChordDiagram("full", config, { fretCount: FRET_COUNT });
  diagram.setStartFret(startFret);
  diagram.mount(diagramHost);

  // The voicing is chosen from the shared control bar (above); switching voicing
  // rebuilds this view, so there's no in-view anchor/voicing picker.

  // ── Modifier section: quality buttons + live note/number spelling ────────────
  const modSection = document.createElement("div");
  modSection.classList.add("chord-interactive-section");
  const mods = document.createElement("div");
  mods.classList.add("chord-interactive-mods");
  const modButtons = new Map<ChordType, HTMLButtonElement>();
  for (const m of family.members) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.classList.add("config-toggle-btn", "chord-mod-btn");
    btn.textContent = MODIFIER_LABELS[m.type] ?? m.type;
    btn.addEventListener("click", () => animateTo(m.type));
    modButtons.set(m.type, btn);
    mods.appendChild(btn);
  }
  // Live spelling: each chord tone paired with its interval number, sharing the
  // interval colour so it's clear which note is which degree.
  const tonesEl = document.createElement("div");
  tonesEl.classList.add("chord-interactive-tones");
  modSection.append(mods, tonesEl);
  root_.appendChild(modSection);

  container.appendChild(root_);

  // ── Logic ────────────────────────────────────────────────────────────────────

  function chordFor(type: ChordType): Chord {
    return (family.members.find((m) => m.type === type) ?? family.members[0]).chord;
  }

  /** Dotted "rail" candidates for each string: sibling frets other than `active`'s. */
  function railNotes(active: Chord): NoteRenderData[] {
    const out: NoteRenderData[] = [];
    for (let i = 0; i < stringCount; i++) {
      const af = active.strings[i] ?? -1;
      // Remember which quality contributes each candidate fret so it gets that
      // quality's interval reading (e.g. a sus2's "2" vs an add9's "9").
      const cand = new Map<number, ChordType>();
      for (const m of family.members) {
        const f = m.chord.strings[i];
        if (f >= 0 && f !== af && !cand.has(f)) cand.set(f, m.type);
      }
      for (const [c, type] of cand) {
        const df = c - startFret;
        if (df < 0 || df > FRET_COUNT) continue;
        const lbl = intervalAt(config, i, c, rootIdx, type);
        const col = getColor("interval", "", lbl);
        out.push({
          fret: c, stringIndex: i, noteName: "", intervalLabel: lbl, displayLabel: pretty(lbl),
          fillColor: "transparent", strokeColor: col, labelColor: col,
          strokeWidth: 1.5, dashed: true, opacity: 0.5,
        });
      }
    }
    return out;
  }

  function solidNote(stringIndex: number, fret: number, chordType: ChordType, opacity = 1): NoteRenderData {
    const lbl = intervalAt(config, stringIndex, fret, rootIdx, chordType);
    return {
      fret, stringIndex, noteName: "", intervalLabel: lbl, displayLabel: pretty(lbl),
      fillColor: getColor("interval", "", lbl), opacity,
    };
  }

  function staticNotes(active: Chord, type: ChordType): NoteRenderData[] {
    const notes: NoteRenderData[] = railNotes(active);
    for (let i = 0; i < stringCount; i++) {
      const af = active.strings[i] ?? -1;
      if (af === -1) {
        notes.push({ fret: -1, stringIndex: i, noteName: "", intervalLabel: "", displayLabel: "" });
      } else {
        notes.push(solidNote(i, af, type));
      }
    }
    return notes;
  }

  /** Frame of the morph from `from` → `to` at eased progress `e` ∈ [0,1]. */
  function animatedNotes(
    from: Chord, fromType: ChordType, to: Chord, toType: ChordType, e: number,
  ): NoteRenderData[] {
    const notes: NoteRenderData[] = railNotes(to);
    for (let i = 0; i < stringCount; i++) {
      const pf = from.strings[i] ?? -1;
      const nf = to.strings[i] ?? -1;
      if (pf === nf) {
        if (nf === -1) notes.push({ fret: -1, stringIndex: i, noteName: "", intervalLabel: "", displayLabel: "" });
        else notes.push(solidNote(i, nf, toType));
      } else if (pf >= 0 && nf >= 0) {
        // Slide along the rail, morphing colour. Each end reads in its own quality.
        const fromLbl = intervalAt(config, i, pf, rootIdx, fromType);
        const toLbl = intervalAt(config, i, nf, rootIdx, toType);
        const lbl = e < 0.5 ? fromLbl : toLbl;
        notes.push({
          fret: pf + (nf - pf) * e, stringIndex: i, noteName: "",
          intervalLabel: lbl, displayLabel: pretty(lbl),
          fillColor: lerpColor(getColor("interval", "", fromLbl), getColor("interval", "", toLbl), e),
        });
      } else if (pf < 0 && nf >= 0) {
        notes.push(solidNote(i, nf, toType, e)); // add: fade in
      } else {
        notes.push(solidNote(i, pf, fromType, 1 - e)); // mute: fade out
      }
    }
    return notes;
  }

  function updateText(): void {
    const active = chordFor(activeType);
    nameEl.textContent = shortChordLabel(root, activeType);
    const intervals = CHORD_TYPE_INTERVALS[activeType] ?? [];
    // Weight a pitch class by the chord's own spelling so extensions sort after
    // the triad (…, 5, 9) rather than by raw pitch class (which puts 9 next to R).
    const weightOf = (pc: number) => intervals.find((iv) => iv % 12 === pc) ?? pc;
    const tones = new Set<number>();
    for (let i = 0; i < stringCount; i++) {
      const f = active.strings[i];
      if (f < 0) continue;
      tones.add((((config.tuning.notes[i] + f) % 12) - rootIdx + 12) % 12);
    }
    const semis = [...tones].sort((a, b) => weightOf(a) - weightOf(b));
    tonesEl.textContent = "";
    for (const s of semis) {
      const lbl = chordToneIntervalLabel(s, activeType);
      const chip = document.createElement("span");
      chip.classList.add("chord-tone");
      chip.style.color = getColor("interval", "", lbl);
      const note = document.createElement("span");
      note.classList.add("chord-tone-note");
      note.textContent = NOTE_NAMES_FROM_A[(rootIdx + s) % 12];
      const num = document.createElement("span");
      num.classList.add("chord-tone-num");
      num.textContent = s === 0 ? "1" : pretty(lbl);
      chip.append(note, num);
      tonesEl.appendChild(chip);
    }
  }

  function updateButtons(): void {
    for (const [type, btn] of modButtons) btn.classList.toggle("is-active", type === activeType);
  }

  function settle(): void {
    diagram.setNotes(staticNotes(chordFor(activeType), activeType));
    diagram.setBarres([]);
    diagram.render();
    updateText();
  }

  function animateTo(newType: ChordType): void {
    if (newType === activeType) return;
    const fromType = activeType;
    const from = chordFor(activeType);
    activeType = newType;
    const to = chordFor(newType);
    updateButtons();
    updateText();
    if (rafId !== null) cancelAnimationFrame(rafId);

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / SLIDE_MS);
      diagram.setNotes(animatedNotes(from, fromType, to, newType, easeInOutCubic(t)));
      diagram.setBarres([]);
      diagram.render();
      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        rafId = null;
        settle();
      }
    };
    rafId = requestAnimationFrame(tick);
  }

  // Initial render (no animation).
  updateButtons();
  settle();

  return {
    destroy() {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      diagram.destroy();
      root_.remove();
    },
  };
}
