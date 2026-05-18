/**
 * Theme-aware chromatic palette for the guitar fretboard.
 *
 * Four semantic tiers, driven by CSS custom properties from theme-tokens.css:
 *   --note-root    Root note
 *   --note-third   Strong consonances (major 3rd, perfect 5th)
 *   --note-fifth   Mild consonances (minor 3rd, minor 6th, minor 7th)
 *   --note-alt     Extensions and tensions (2, 4, 6, b2, d5, 7)
 *
 * Colors are resolved at call time via getComputedStyle so they automatically
 * reflect the active theme without any manual invalidation.
 */

// ---------------------------------------------------------------------------
// Tier mapping (index = semitones above A)
// ---------------------------------------------------------------------------

const PALETTE_TIER: readonly string[] = [
  "--note-root",   //  0  A  / R
  "--note-alt",    //  1  A# / b2
  "--note-alt",    //  2  B  / 2
  "--note-fifth",  //  3  C  / b3
  "--note-third",  //  4  C# / 3
  "--note-alt",    //  5  D  / 4
  "--note-alt",    //  6  D# / d5
  "--note-third",  //  7  E  / 5
  "--note-fifth",  //  8  F  / b6
  "--note-alt",    //  9  F# / 6
  "--note-fifth",  // 10  G  / b7
  "--note-alt",    // 11  G# / 7
] as const;

/** Retained for enumeration; values are now CSS custom property names, not hex. */
export const CHROMATIC_PALETTE: readonly string[] = PALETTE_TIER;

/** Fallback color for unknown notes/intervals or when CSS vars are unavailable. */
export const PALETTE_DEFAULT = "#9AABB8";

// ---------------------------------------------------------------------------
// CSS var resolution
// ---------------------------------------------------------------------------

let _resolverEl: HTMLElement | null = null;

function getResolverEl(): HTMLElement {
  if (!_resolverEl || !document.body?.contains(_resolverEl)) {
    _resolverEl = document.createElement("span");
    _resolverEl.style.display = "none";
    document.body.appendChild(_resolverEl);
  }
  return _resolverEl;
}

/**
 * Resolves a CSS custom property to a concrete colour string (rgb format)
 * by applying it via getComputedStyle on a hidden sentinel element.
 */
function resolveThemeColor(cssVar: string): string {
  try {
    const el = getResolverEl();
    el.style.color = `var(${cssVar})`;
    const resolved = getComputedStyle(el).color;
    return resolved || PALETTE_DEFAULT;
  } catch {
    return PALETTE_DEFAULT;
  }
}

// ---------------------------------------------------------------------------
// Note → palette index
// ---------------------------------------------------------------------------

/** Maps every chromatic note name (sharp and flat) to a palette index. */
export const NOTE_PALETTE_INDEX: Readonly<Record<string, number>> = {
  A:    0,
  "A#": 1,
  Bb:   1,
  B:    2,
  C:    3,
  "C#": 4,
  Db:   4,
  D:    5,
  "D#": 6,
  Eb:   6,
  E:    7,
  F:    8,
  "F#": 9,
  Gb:   9,
  G:    10,
  "G#": 11,
  Ab:   11,
};

// ---------------------------------------------------------------------------
// Interval → palette index
// ---------------------------------------------------------------------------

/**
 * Maps every interval label to a palette index.
 * Enharmonic intervals (d5 / #4, b6 / #5) share one palette slot.
 */
export const INTERVAL_PALETTE_INDEX: Readonly<Record<string, number>> = {
  R:    0,
  b2:   1,
  "2":  2,
  b3:   4,
  "3":  4,
  "4":  5,
  d5:   6,
  "#4": 6,
  "5":  7,
  b6:   8,
  "#5": 8,
  "6":  9,
  b7:   10,
  "7":  11,
};

// ---------------------------------------------------------------------------
// Convenience helpers
// ---------------------------------------------------------------------------

/** Returns the theme colour for a note name, or PALETTE_DEFAULT. */
export function getNoteColor(noteName: string): string {
  const idx = NOTE_PALETTE_INDEX[noteName];
  return resolveThemeColor(idx !== undefined ? PALETTE_TIER[idx] : "--note-alt");
}

/** Returns the theme colour for an interval label, or PALETTE_DEFAULT. */
export function getIntervalColor(intervalLabel: string): string {
  const idx = INTERVAL_PALETTE_INDEX[intervalLabel];
  return resolveThemeColor(idx !== undefined ? PALETTE_TIER[idx] : "--note-alt");
}
