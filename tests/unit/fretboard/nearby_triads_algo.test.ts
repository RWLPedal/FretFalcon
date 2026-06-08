import { describe, it, expect } from 'vitest'
import {
  parseChordKey,
  transitionCost,
  rankVoicingsByTransitionCost,
  TriadVoicing,
} from '../../../ts/fretboard/nearby_triads_algo'

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeVoicing(
  stringGroup: [number, number, number],
  frets: [number, number, number],
): TriadVoicing {
  return {
    chordKey: 'C_MAJ',
    stringGroup,
    frets,
    notes: [],
    intervalLabels: [],
    inversion: 'Root',
    quality: 'Major',
  }
}

// ─── parseChordKey ────────────────────────────────────────────────────────────

describe('parseChordKey', () => {
  it('C_MAJ → {rootNote: C, quality: Major}', () => {
    expect(parseChordKey('C_MAJ')).toEqual({ rootNote: 'C', quality: 'Major' })
  })
  it('F#_MIN → Minor', () => {
    expect(parseChordKey('F#_MIN')).toEqual({ rootNote: 'F#', quality: 'Minor' })
  })
  it('Eb_DIM → Diminished', () => {
    expect(parseChordKey('Eb_DIM')).toEqual({ rootNote: 'Eb', quality: 'Diminished' })
  })
  it('G_AUG → Augmented', () => {
    expect(parseChordKey('G_AUG')).toEqual({ rootNote: 'G', quality: 'Augmented' })
  })

  it('7th suffixes collapse to triad quality: G_DOM7 → Major', () => {
    expect(parseChordKey('G_DOM7')).toEqual({ rootNote: 'G', quality: 'Major' })
  })
  it('7th suffixes collapse to triad quality: D_MIN7 → Minor', () => {
    expect(parseChordKey('D_MIN7')).toEqual({ rootNote: 'D', quality: 'Minor' })
  })
  it('7th suffixes collapse to triad quality: B_DIM7 → Diminished', () => {
    expect(parseChordKey('B_DIM7')).toEqual({ rootNote: 'B', quality: 'Diminished' })
  })
  it('7th suffixes collapse to triad quality: A_MAJ7 → Major', () => {
    expect(parseChordKey('A_MAJ7')).toEqual({ rootNote: 'A', quality: 'Major' })
  })

  it('unknown suffix returns null', () => {
    expect(parseChordKey('C_UNKNOWN')).toBeNull()
  })
  it('no underscore returns null', () => {
    expect(parseChordKey('CMAJ')).toBeNull()
  })
  it('empty string returns null', () => {
    expect(parseChordKey('')).toBeNull()
  })
})

// ─── transitionCost ───────────────────────────────────────────────────────────

describe('transitionCost', () => {
  it('identical voicings → 0', () => {
    const v = makeVoicing([0, 1, 2], [5, 5, 5])
    expect(transitionCost(v, v)).toBe(0)
  })

  it('2-fret move on all same strings → 6 (3 × d=2)', () => {
    const from = makeVoicing([0, 1, 2], [5, 5, 5])
    const to   = makeVoicing([0, 1, 2], [7, 7, 7])
    // Same-string d=2 (≤3): cost = 2 each → total 6; cross-string permutations are more expensive
    expect(transitionCost(from, to)).toBe(6)
  })

  it('3-fret move on all same strings → 9 (3 × d=3, at threshold)', () => {
    const from = makeVoicing([0, 1, 2], [0, 0, 0])
    const to   = makeVoicing([0, 1, 2], [3, 3, 3])
    expect(transitionCost(from, to)).toBe(9)
  })

  it('permutation optimisation: same notes on swapped string groups → 0', () => {
    // Each finger can find its own fret on the same string via permutation [2,1,0]
    const from = makeVoicing([0, 2, 4], [3, 3, 3])
    const to   = makeVoicing([4, 2, 0], [3, 3, 3])
    expect(transitionCost(from, to)).toBe(0)
  })

  it('cost is symmetric', () => {
    const v1 = makeVoicing([0, 1, 2], [2, 4, 6])
    const v2 = makeVoicing([0, 1, 2], [5, 5, 5])
    expect(transitionCost(v1, v2)).toBe(transitionCost(v2, v1))
  })
})

// ─── rankVoicingsByTransitionCost ─────────────────────────────────────────────

describe('rankVoicingsByTransitionCost — null from, no targetFret', () => {
  it('orders by neck position (lowest fret first)', () => {
    const v1 = makeVoicing([0, 1, 2], [5, 5, 5])  // neck pos 5
    const v2 = makeVoicing([0, 1, 2], [2, 2, 2])  // neck pos 2
    const v3 = makeVoicing([0, 1, 2], [8, 8, 8])  // neck pos 8
    const ranked = rankVoicingsByTransitionCost(null, [v1, v2, v3])
    expect(ranked[0].voicing).toBe(v2)
    expect(ranked[1].voicing).toBe(v1)
    expect(ranked[2].voicing).toBe(v3)
  })

  it('all costs are 0 when no from voicing and no target', () => {
    const v1 = makeVoicing([0, 1, 2], [3, 3, 3])
    const v2 = makeVoicing([0, 1, 2], [7, 7, 7])
    const ranked = rankVoicingsByTransitionCost(null, [v1, v2])
    expect(ranked.every(r => r.cost === 0)).toBe(true)
  })
})

describe('rankVoicingsByTransitionCost — null from, with targetFret', () => {
  it('orders by distance to target fret', () => {
    const v1 = makeVoicing([0, 1, 2], [5, 5, 5])  // avg distance to fret 6: 3 × 0.5 = 1.5
    const v2 = makeVoicing([0, 1, 2], [2, 2, 2])  // avg distance to fret 6: 3 × 2 = 6
    const v3 = makeVoicing([0, 1, 2], [8, 8, 8])  // avg distance to fret 6: 3 × 1 = 3
    const ranked = rankVoicingsByTransitionCost(null, [v1, v2, v3], 6)
    expect(ranked[0].voicing).toBe(v1)
    expect(ranked[1].voicing).toBe(v3)
    expect(ranked[2].voicing).toBe(v2)
  })
})

describe('rankVoicingsByTransitionCost — with from voicing', () => {
  it('orders by transition cost from current position', () => {
    const from = makeVoicing([0, 1, 2], [5, 5, 5])
    const near = makeVoicing([0, 1, 2], [7, 7, 7])  // 2-fret move, cost=6
    const far  = makeVoicing([0, 1, 2], [0, 0, 0])  // 5-fret move → penalty
    const ranked = rankVoicingsByTransitionCost(from, [far, near])
    expect(ranked[0].voicing).toBe(near)
    expect(ranked[0].cost).toBe(6)
  })

  it('same position as from has cost 0', () => {
    const from = makeVoicing([0, 1, 2], [5, 5, 5])
    const same = makeVoicing([0, 1, 2], [5, 5, 5])
    const ranked = rankVoicingsByTransitionCost(from, [same])
    expect(ranked[0].cost).toBe(0)
  })

  it('returns empty array for empty candidates', () => {
    const from = makeVoicing([0, 1, 2], [5, 5, 5])
    expect(rankVoicingsByTransitionCost(from, [])).toEqual([])
  })
})
