import { describe, it, expect } from 'vitest'
import { computeChordStartFret } from '../../../ts/fretboard/diagram/chord_framing'
import type { BarreSpec } from '../../../ts/music/chords'

const FRET_COUNT = 5
const sf = (strings: number[], barre?: BarreSpec[]) =>
  computeChordStartFret(strings, barre, FRET_COUNT)

describe('computeChordStartFret', () => {
  it('shows the nut for open/low shapes', () => {
    expect(sf([-1, 0, 2, 2, 2, 0])).toBe(0) // open A
    expect(sf([0, 2, 2, 1, 0, 0])).toBe(0) // open E
  })

  it('anchors on the barre fret when barred up the neck', () => {
    // A-shape minor7 for G: barre at fret 10.
    expect(sf([-1, 10, 12, 12, 11, 10], [{ fret: 10, stringStart: 1, stringEnd: 5 }])).toBe(9)
  })

  it('keeps a near-nut barre at the nut', () => {
    expect(sf([0, 2, 2, 1, 0, 0], [{ fret: 0, stringStart: 0, stringEnd: 5 }])).toBe(0)
  })

  it('frames a barre-less shape sitting entirely above the window (regression)', () => {
    // A-shape diminished for G at frets 10-12, no barre. Previously the minFret
    // sentinel clamped this to fret 5, hiding everything but the root.
    expect(sf([-1, 10, 11, 12, 11, -1])).toBe(9)
  })

  it('shifts a barre-less shape that spills past the nut window', () => {
    // D-shape major for B (frets 9-12), no barre.
    expect(sf([-1, -1, 9, 11, 12, 11])).toBe(8)
  })

  it('never returns a negative start fret', () => {
    expect(sf([-1, -1, 1, 1, 1, 6])).toBeGreaterThanOrEqual(0)
  })
})
