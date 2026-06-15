// Built-in strumming pattern presets for the StrumView.
//
// Presets are organised by meter + subdivision (not by instrument): the same
// pattern played on a guitar, ukulele or mandolin is one preset, so the list
// stays free of instrument-only duplicates. The StrumView filters the list by
// the current time signature and labels each option with its subdivision.

import { StrokeAction, StrumPreset } from "./strum_types";

// Single-letter aliases keep the slot arrays readable like a strum chart.
// Up/down direction is implied by slot position, so S is just "strum".
const R = StrokeAction.Rest;   // rest (silent, hand keeps moving)
const S = StrokeAction.Stroke; // strum (down on the beat, up off the beat)
const A = StrokeAction.Accent; // accented strum
const X = StrokeAction.Chuck;  // muted/percussive chuck
const G = StrokeAction.Air;    // ghost stroke (hand moves, no contact)

const FOUR_FOUR = { beats: 4, division: 4 } as const;
const THREE_FOUR = { beats: 3, division: 4 } as const;

function preset(
  id: string,
  name: string,
  timeSig: { beats: number; division: number },
  subdivision: "eighth" | "sixteenth",
  slots: StrokeAction[],
): StrumPreset {
  return { _v: 1, id, name, timeSig, subdivision, slots, isBuiltIn: true };
}

// ─── 4/4 — 8th notes ───────────────────────────────────────────────────────────
// 8 slots: down on the beat (even index), up off the beat (odd index).

const FOUR_FOUR_EIGHTH: StrumPreset[] = [
  preset("e44_all_down", "All Downs",            FOUR_FOUR, "eighth", [S, R, S, R, S, R, S, R]),
  preset("e44_down_up",  "Down-Up",              FOUR_FOUR, "eighth", [S, S, S, S, S, S, S, S]),
  preset("e44_island",   "Island (D DU UDU)",    FOUR_FOUR, "eighth", [S, R, S, S, G, S, S, S]),
  preset("e44_folk",     "Folk (D DU D DU)",     FOUR_FOUR, "eighth", [S, R, S, S, S, R, S, S]),
  preset("e44_rock",     "Rock Accent",          FOUR_FOUR, "eighth", [A, R, S, S, S, R, S, S]),
  preset("e44_constant", "Constant (DDU DDU)",   FOUR_FOUR, "eighth", [S, S, G, S, S, S, G, S]),
  preset("e44_calypso",  "Calypso",              FOUR_FOUR, "eighth", [S, R, S, G, S, S, G, S]),
  preset("e44_country",  "Country Chug (D X)",   FOUR_FOUR, "eighth", [S, X, S, X, S, X, S, X]),
  preset("e44_reggae",   "Reggae Skank (X D)",   FOUR_FOUR, "eighth", [X, S, X, S, X, S, X, S]),
  preset("e44_chop",     "Bluegrass Chop",       FOUR_FOUR, "eighth", [S, X, G, X, S, X, G, X]),
];

// ─── 3/4 — 8th notes ───────────────────────────────────────────────────────────
// 6 slots.

const THREE_FOUR_EIGHTH: StrumPreset[] = [
  preset("e34_waltz_down", "Waltz (All Downs)",  THREE_FOUR, "eighth", [S, R, S, R, S, R]),
  preset("e34_waltz_du",   "Waltz (D DU DU)",    THREE_FOUR, "eighth", [S, R, S, S, S, S]),
  preset("e34_ballad",     "Ballad",             THREE_FOUR, "eighth", [A, R, S, R, S, R]),
  preset("e34_full",       "Full Strum",         THREE_FOUR, "eighth", [S, S, S, S, S, S]),
];

// ─── 4/4 — 16th notes ──────────────────────────────────────────────────────────
// 16 slots: four per beat (down on the beat & the "+", up on the "e" & "a").

const FOUR_FOUR_SIXTEENTH: StrumPreset[] = [
  preset("s44_all",     "Sixteenths (all)",     FOUR_FOUR, "sixteenth",
    [S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S]),
  preset("s44_gallop",  "Gallop (D DU)",        FOUR_FOUR, "sixteenth",
    [S, R, S, S, S, R, S, S, S, R, S, S, S, R, S, S]),
  preset("s44_funk",    "Funk (accent + chuck)", FOUR_FOUR, "sixteenth",
    [A, X, S, X, A, X, S, X, A, X, S, X, A, X, S, X]),
  preset("s44_offbeat", "Offbeats (e & a)",     FOUR_FOUR, "sixteenth",
    [R, S, R, S, R, S, R, S, R, S, R, S, R, S, R, S]),
];

// ─── Full built-in preset list ────────────────────────────────────────────────

export const BUILT_IN_PRESETS: StrumPreset[] = [
  ...FOUR_FOUR_EIGHTH,
  ...THREE_FOUR_EIGHTH,
  ...FOUR_FOUR_SIXTEENTH,
];
