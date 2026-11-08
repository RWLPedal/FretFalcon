// ts/modules/strum/strum_layout.ts
// Pure layout maths for the strum grid (no DOM), so it can be unit-tested.

/** Narrowest a slot may get before the grid wraps onto another row of beats. */
export const MIN_SLOT_PX = 32;
/** px between beats — keep in sync with .sv-grid's column gap (views.css, mobile.css). */
export const BEAT_GAP = 8;

/**
 * How many beats share a row when the grid is `width` px wide: as many as keep every
 * slot at least MIN_SLOT_PX wide, then evened out so the rows are the same length
 * (6/8 in sixteenths wraps 3 + 3, not 4 + 2).
 */
export function beatsPerRow(width: number, beats: number, slotsInBeat: number): number {
  if (beats <= 0) return 1;
  if (width <= 0) return beats;
  const beatMin = slotsInBeat * MIN_SLOT_PX;
  const fit = Math.max(1, Math.floor((width + BEAT_GAP) / (beatMin + BEAT_GAP)));
  const rows = Math.ceil(beats / Math.min(fit, beats));
  return Math.ceil(beats / rows);
}
