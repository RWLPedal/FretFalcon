// ts/fretboard/diagram/chord_framing.ts
// Pure helper (no DOM) for deciding which fret a chord diagram's window starts at.
// Shared by the family grid cards (ChordDiagramView) and the interactive lever-rail
// so their framing can't drift apart.

import type { BarreSpec } from "../../music/chords";

/**
 * The fret a chord diagram should start at (0 = show the nut). A barre anchors the
 * window (started one fret below the barre, unless it's at/near the nut); otherwise a
 * shape that doesn't fit the nut window is shifted to start just below its lowest
 * fretted note.
 *
 * `minFret` starts at Infinity (not `fretCount + 1`) so a barre-less shape sitting
 * entirely above the window still captures its true lowest fret instead of clamping
 * to the window size — the bug that made high-position barre-less voicings (e.g. the
 * A-shape diminished up the neck) render with only the root in view.
 */
export function computeChordStartFret(
  strings: number[],
  barre: BarreSpec[] | undefined,
  fretCount: number,
): number {
  let minFret = Infinity;
  let maxFret = 0;
  for (const fret of strings) {
    if (fret > 0) {
      minFret = Math.min(minFret, fret);
      maxFret = Math.max(maxFret, fret);
    }
  }
  if (barre && barre.length > 0) {
    const barreMinFret = Math.min(...barre.map((b) => b.fret));
    return barreMinFret > 2 ? barreMinFret - 1 : 0;
  }
  if (maxFret > fretCount || maxFret - minFret >= fretCount) {
    return Math.max(0, minFret - 1);
  }
  return 0;
}
