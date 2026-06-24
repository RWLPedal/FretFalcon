// ts/music/chord_family.ts
// Chord-family logic: group a root's voicings by CAGED shape, pick an anchor
// (the lowest major shape), and describe how to ALTER the anchor fingering into
// each sibling quality. Hints are computed lazily by diffing the two fingerings
// — no per-string interval metadata is stored (see design notes / user steer).

import { Chord, ChordType } from "./chords";
import { getMoveableShapes } from "./moveable_shapes";
import { InstrumentName } from "../fretboard/instruments";
import type { Tuning } from "../fretboard/instruments";
import { getKeyIndex, chordToneIntervalLabel } from "../fretboard/fretboard_utils";

/** Display order for family members (anchor first). */
export const FAMILY_TYPES: ChordType[] = [
  ChordType.MAJOR,
  ChordType.MINOR,
  ChordType.SUS2,
  ChordType.SUS4,
  ChordType.DOM7,
  ChordType.MAJ7,
  ChordType.MIN7,
  ChordType.DIM,
  ChordType.ADD9,
  ChordType.MINOR_ADD9,
];

export interface FamilyMember {
  type: ChordType;
  chord: Chord;
  isAnchor: boolean;
  /** One-line "how to change the anchor into this" hint (siblings only). */
  hint?: string;
  /** Number of strings that change vs the anchor (siblings only). */
  moves?: number;
}

export interface ChordFamily {
  /** CAGED shape the family is built on, e.g. "A-Shape", "E-Shape". */
  shapeName: string;
  members: FamilyMember[];
}

export interface ChordVoicing extends ChordFamily {
  /** CAGED voicing letter, e.g. "C", "A", "D", "E". */
  voicingId: string;
  /** True for the lowest-fret major voicing (what buildChordFamily would anchor on). */
  isDefault: boolean;
}

/**
 * Canonical voicing ordering for the selector, per instrument: guitar uses CAGED,
 * ukulele uses CAGFD (same five shapes, F replacing E for GCEA tuning). The
 * fifths-tuned family (mandolin, mandola, tenor guitar/banjo) shares one shape
 * library keyed by triad inversion — lowest (root-position) shape first. The charango
 * shares the ukulele's five shapes (its first four courses are the ukulele's GCEA)
 * but labels them with the traditional Hispanic "Forma de <nota>" names, ordered
 * do-la-sol-fa-re to mirror the ukulele's C-A-G-F-D.
 */
const FIFTHS_VOICING_ORDER = ["root", "inv1", "inv2"];
const VOICING_ORDER: Partial<Record<InstrumentName, string[]>> = {
  [InstrumentName.Guitar]: ["C", "A", "G", "E", "D"],
  [InstrumentName.Ukulele]: ["C", "A", "G", "F", "D"],
  [InstrumentName.Charango]: ["do", "la", "sol", "fa", "re"],
  [InstrumentName.Mandolin]: FIFTHS_VOICING_ORDER,
  [InstrumentName.Mandola]: FIFTHS_VOICING_ORDER,
  [InstrumentName.TenorGuitar]: FIFTHS_VOICING_ORDER,
  [InstrumentName.TenorBanjo]: FIFTHS_VOICING_ORDER,
};
function voicingRank(instrument: InstrumentName, voicingId: string): number {
  const order = VOICING_ORDER[instrument] ?? [];
  const i = order.indexOf(voicingId);
  return i < 0 ? order.length : i;
}

/** Interval label (R, ♭3, 5, ♭7, 9…) of a note, read in the given chord's quality. */
function intervalLabelAt(
  tuning: Tuning, stringIndex: number, fret: number, rootIdx: number, chordType: ChordType,
): string {
  const note = (tuning.notes[stringIndex] + fret) % 12;
  return chordToneIntervalLabel(((note - rootIdx) % 12 + 12) % 12, chordType);
}

/** "root", "3rd", "5th", "9th"… for a given interval label. */
function ordinal(interval: string | null): string {
  switch (interval) {
    case "R": return "root";
    case "b2": case "2": return "2nd";
    case "b3": case "3": return "3rd";
    case "4": return "4th";
    case "d5": case "5": return "5th";
    case "b6": case "6": return "6th";
    case "b7": case "7": return "7th";
    case "b9": case "9": case "#9": return "9th";
    case "11": case "#11": return "11th";
    case "b13": case "13": return "13th";
    default: return "note";
  }
}

/** Pretty interval for the "→ X" target, e.g. b3 → ♭3, R → root. */
function pretty(interval: string | null): string {
  if (!interval) return "";
  if (interval === "R") return "root";
  if (interval === "d5") return "♭5";
  return interval.replace("b", "♭");
}

interface StringChange { i: number; a: number; b: number; fromInt: string | null; toInt: string | null; }

/**
 * Describes the fret moves that turn `anchor` into `target` (same shape, same
 * root) and synthesises a short hint. Pure → unit-testable.
 */
export function describeAlteration(
  anchor: Chord,
  target: Chord,
  root: string,
  tuning: Tuning,
): { hint: string; moves: number } {
  const rootIdx = getKeyIndex(root);
  const n = Math.max(anchor.strings.length, target.strings.length);
  const changes: StringChange[] = [];
  for (let i = 0; i < n; i++) {
    const a = anchor.strings[i] ?? -1;
    const b = target.strings[i] ?? -1;
    if (a === b) continue;
    changes.push({
      i, a, b,
      fromInt: a >= 0 ? intervalLabelAt(tuning, i, a, rootIdx, anchor.chordType) : null,
      toInt: b >= 0 ? intervalLabelAt(tuning, i, b, rootIdx, target.chordType) : null,
    });
  }

  const phrases = changes.map((c) => {
    if (c.a >= 0 && c.b >= 0) {
      const dir = c.b > c.a ? "raise" : "lower";
      const amt = Math.abs(c.b - c.a) === 1 ? " one fret" : "";
      return `${dir} the ${ordinal(c.fromInt)}${amt} → ${pretty(c.toInt)}`;
    }
    if (c.a < 0 && c.b >= 0) return `add the ${pretty(c.toInt)}`;
    if (c.a >= 0 && c.b < 0) return `mute the ${ordinal(c.fromInt)}`;
    return "";
  }).filter(Boolean);

  const joined = phrases.join("; ");
  const hint = joined ? joined.charAt(0).toUpperCase() + joined.slice(1) : "Same fingering";
  return { hint, moves: changes.length };
}

/** Number of strings that differ between two voicings. */
export function chordMovesCount(anchor: Chord, target: Chord): number {
  const n = Math.max(anchor.strings.length, target.strings.length);
  let moves = 0;
  for (let i = 0; i < n; i++) {
    if ((anchor.strings[i] ?? -1) !== (target.strings[i] ?? -1)) moves++;
  }
  return moves;
}

/** Root fret of a (moveable) chord — where its root note sits. */
function rootFretOf(chord: Chord): number {
  const rsi = chord.rootStringIndex ?? 0;
  return chord.strings[rsi] ?? 0;
}

/** Drops a nut (fret-0) barre so an open-position shape renders as open strings. */
function stripNutBarre(c: Chord): Chord {
  if (!c.barre || !c.barre.some((b) => b.fret === 0)) return c;
  const kept = c.barre.filter((b) => b.fret > 0);
  const out = new Chord(c.name, c.strings, c.fingers, kept.length ? kept : undefined, c.chordType, c.rootKey);
  out.shapeName = c.shapeName;
  out.rootStringIndex = c.rootStringIndex;
  out.rootFretOffset = c.rootFretOffset;
  return out;
}

/**
 * Groups a root's moveable shapes by a key (shape name or voicing letter): for
 * each family quality, keeps the lowest-fret shape per key. Shapes whose key is
 * empty/undefined are skipped.
 */
function groupShapes(
  instrument: InstrumentName,
  root: string,
  tuning: Tuning,
  keyOf: (shape: Chord) => string | undefined,
): Map<string, Map<ChordType, Chord>> {
  const groups = new Map<string, Map<ChordType, Chord>>();
  for (const type of FAMILY_TYPES) {
    for (const shape of getMoveableShapes(instrument, `${root} ${type}`, tuning, type)) {
      const key = keyOf(shape);
      if (!key) continue;
      let g = groups.get(key);
      if (!g) { g = new Map(); groups.set(key, g); }
      if (!g.has(type)) g.set(type, shape); // shapes are sorted low→high; keep the lowest
    }
  }
  return groups;
}

/**
 * Builds the ordered family members (anchor major first) for one shape's
 * quality→voicing map, computing alteration hints for each sibling vs the major.
 */
function buildMembers(
  g: Map<ChordType, Chord>,
  root: string,
  tuning: Tuning,
): FamilyMember[] {
  const major = g.get(ChordType.MAJOR);
  const anchorChord = major ? stripNutBarre(major) : null;
  const members: FamilyMember[] = [];
  for (const type of FAMILY_TYPES) {
    const raw = g.get(type);
    if (!raw) continue;
    const chord = stripNutBarre(raw);
    if (type === ChordType.MAJOR) {
      members.push({ type, chord, isAnchor: true });
    } else if (anchorChord) {
      const { hint, moves } = describeAlteration(anchorChord, chord, root, tuning);
      members.push({ type, chord, isAnchor: false, hint, moves });
    } else {
      members.push({ type, chord, isAnchor: false });
    }
  }
  return members;
}

/**
 * Builds the chord family for a root on a given instrument: groups all qualities
 * by CAGED shape, anchors on the lowest major shape, and computes alteration
 * hints for each sibling. Returns null if the instrument has no moveable shapes.
 */
export function buildChordFamily(
  instrument: InstrumentName,
  root: string,
  tuning: Tuning,
): ChordFamily | null {
  if (getKeyIndex(root) < 0) return null;

  const groups = groupShapes(instrument, root, tuning, (s) => s.shapeName);

  // Anchor = group containing MAJOR with the lowest root fret (ties → most members).
  let best: { name: string; g: Map<ChordType, Chord>; fret: number } | null = null;
  for (const [name, g] of groups) {
    const maj = g.get(ChordType.MAJOR);
    if (!maj) continue;
    const fret = rootFretOf(maj);
    if (!best || fret < best.fret || (fret === best.fret && g.size > best.g.size)) {
      best = { name, g, fret };
    }
  }
  if (!best) return null;

  return { shapeName: best.name, members: buildMembers(best.g, root, tuning) };
}

/**
 * Builds every anchor-capable CAGED voicing for a root, ordered C-A-G-E-D, each
 * with its own family of qualities. Only shapes carrying a `voicing` tag are
 * considered, so instruments without tagged shapes return [] (callers fall back
 * to buildChordFamily). The lowest-fret major voicing is flagged isDefault.
 */
export function buildChordVoicings(
  instrument: InstrumentName,
  root: string,
  tuning: Tuning,
): ChordVoicing[] {
  if (getKeyIndex(root) < 0) return [];

  const groups = groupShapes(instrument, root, tuning, (s) => s.voicing);
  const entries: { voicingId: string; g: Map<ChordType, Chord>; fret: number }[] = [];
  for (const [voicingId, g] of groups) {
    const maj = g.get(ChordType.MAJOR);
    if (!maj) continue; // only voicings with a major can anchor a family
    entries.push({ voicingId, g, fret: rootFretOf(maj) });
  }
  if (entries.length === 0) return [];

  // Default = lowest-fret major (ties → most members), matching buildChordFamily.
  let best = entries[0];
  for (const e of entries) {
    if (e.fret < best.fret || (e.fret === best.fret && e.g.size > best.g.size)) best = e;
  }

  entries.sort((a, b) => voicingRank(instrument, a.voicingId) - voicingRank(instrument, b.voicingId));
  return entries.map((e) => ({
    shapeName: e.g.get(ChordType.MAJOR)!.shapeName ?? `${e.voicingId}-Shape`,
    voicingId: e.voicingId,
    isDefault: e.voicingId === best.voicingId,
    members: buildMembers(e.g, root, tuning),
  }));
}
