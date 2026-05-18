/**
 * Guitar color helpers.
 *
 * getNoteColor / getIntervalColor resolve the active theme's CSS custom
 * properties at call time. NOTE_COLORS and INTERVAL_COLORS are Proxy objects
 * that do the same thing on property access, so canvas consumers that read
 * NOTE_COLORS[noteName] always get a current, theme-correct colour string.
 */

import {
  NOTE_PALETTE_INDEX,
  INTERVAL_PALETTE_INDEX,
  PALETTE_DEFAULT,
  getNoteColor,
  getIntervalColor,
} from "./color_palette";

export {
  CHROMATIC_PALETTE,
  getNoteColor,
  getIntervalColor,
} from "./color_palette";

// ---------------------------------------------------------------------------
// Dynamic colour maps
// ---------------------------------------------------------------------------

const NOTE_COLOR_KEYS = [...Object.keys(NOTE_PALETTE_INDEX), "DEFAULT"];
const INTERVAL_COLOR_KEYS = [...Object.keys(INTERVAL_PALETTE_INDEX), "DEFAULT"];

function makeColorProxy(
  resolve: (key: string) => string,
  keys: string[]
): { [key: string]: string } {
  return new Proxy({} as { [key: string]: string }, {
    get(_t, key: string | symbol) {
      if (typeof key === "symbol") return undefined;
      return resolve(key);
    },
    has(_t, key) {
      if (typeof key === "symbol") return false;
      return keys.includes(key);
    },
    ownKeys() {
      return keys;
    },
    getOwnPropertyDescriptor(_t, key) {
      if (keys.includes(String(key))) {
        return { configurable: true, enumerable: true, writable: false, value: undefined };
      }
      return undefined;
    },
  });
}

export const NOTE_COLORS: { [noteName: string]: string } = makeColorProxy(
  getNoteColor,
  NOTE_COLOR_KEYS
);

export const INTERVAL_COLORS: { [intervalLabel: string]: string } = makeColorProxy(
  getIntervalColor,
  INTERVAL_COLOR_KEYS
);

// ---------------------------------------------------------------------------
// Color scheme type and dispatcher
// ---------------------------------------------------------------------------

export type FretboardColorScheme = "simplified" | "note" | "interval";

/**
 * Returns the appropriate color for a note based on the active scheme.
 */
export function getColor(
  scheme: FretboardColorScheme,
  noteName: string,
  intervalLabel: string
): string {
  switch (scheme) {
    case "note":
      return getNoteColor(noteName);
    case "simplified":
      return intervalLabel === "R" ? getIntervalColor("R") : PALETTE_DEFAULT;
    case "interval":
    default:
      return getIntervalColor(intervalLabel);
  }
}
