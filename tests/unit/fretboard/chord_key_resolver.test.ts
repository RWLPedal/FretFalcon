import { describe, it, expect } from 'vitest'
import {
  resolveAbsoluteChordKey,
  resolveChordRootNote,
  getRomansForMode,
  isMajorChordQuality,
} from '../../../ts/fretboard/chord_key_resolver'
import { ChordQuality, DiatonicMode } from '../../../ts/fretboard/music_types'

// ─── resolveAbsoluteChordKey ──────────────────────────────────────────────────

describe('resolveAbsoluteChordKey — C Ionian', () => {
  it('I → C_MAJ', () => {
    expect(resolveAbsoluteChordKey('I', 'C', DiatonicMode.Ionian)).toBe('C_MAJ')
  })
  it('ii → D_MIN', () => {
    expect(resolveAbsoluteChordKey('ii', 'C', DiatonicMode.Ionian)).toBe('D_MIN')
  })
  it('IV → F_MAJ', () => {
    expect(resolveAbsoluteChordKey('IV', 'C', DiatonicMode.Ionian)).toBe('F_MAJ')
  })
  it('V → G_MAJ', () => {
    expect(resolveAbsoluteChordKey('V', 'C', DiatonicMode.Ionian)).toBe('G_MAJ')
  })
  it('vi → A_MIN', () => {
    expect(resolveAbsoluteChordKey('vi', 'C', DiatonicMode.Ionian)).toBe('A_MIN')
  })
  it('vii° → B_DIM', () => {
    expect(resolveAbsoluteChordKey('vii°', 'C', DiatonicMode.Ionian)).toBe('B_DIM')
  })
})

describe('resolveAbsoluteChordKey — transposition across keys', () => {
  it('I in G → G_MAJ', () => {
    expect(resolveAbsoluteChordKey('I', 'G', DiatonicMode.Ionian)).toBe('G_MAJ')
  })
  it('IV in G → C_MAJ', () => {
    expect(resolveAbsoluteChordKey('IV', 'G', DiatonicMode.Ionian)).toBe('C_MAJ')
  })
  it('V in D → A_MAJ', () => {
    expect(resolveAbsoluteChordKey('V', 'D', DiatonicMode.Ionian)).toBe('A_MAJ')
  })
  it('I in Bb → Bb_MAJ', () => {
    expect(resolveAbsoluteChordKey('I', 'Bb', DiatonicMode.Ionian)).toBe('Bb_MAJ')
  })
  it('ii in Ab wraps to Bb_MIN (chromatic wraparound)', () => {
    // Ab is index 11; major scale degree 1 = +2 semitones; (11+2)%12 = 1 → Bb
    expect(resolveAbsoluteChordKey('ii', 'Ab', DiatonicMode.Ionian)).toBe('Bb_MIN')
  })
  it('7th chord suffix preserved: V7 in C → G_DOM7', () => {
    expect(resolveAbsoluteChordKey('V7', 'C', DiatonicMode.Ionian)).toBe('G_DOM7')
  })
  it('7th chord suffix preserved: Imaj7 in C → C_MAJ7', () => {
    expect(resolveAbsoluteChordKey('Imaj7', 'C', DiatonicMode.Ionian)).toBe('C_MAJ7')
  })
})

describe('resolveAbsoluteChordKey — mode variants', () => {
  it('i in A Aeolian → A_MIN', () => {
    expect(resolveAbsoluteChordKey('i', 'A', DiatonicMode.Aeolian)).toBe('A_MIN')
  })
  it('III in A Aeolian → C_MAJ (relative major)', () => {
    expect(resolveAbsoluteChordKey('III', 'A', DiatonicMode.Aeolian)).toBe('C_MAJ')
  })
  it('i in D Dorian → D_MIN', () => {
    expect(resolveAbsoluteChordKey('i', 'D', DiatonicMode.Dorian)).toBe('D_MIN')
  })
})

describe('resolveAbsoluteChordKey — null cases', () => {
  it('unrecognised roman returns null', () => {
    expect(resolveAbsoluteChordKey('VIII', 'C', DiatonicMode.Ionian)).toBeNull()
  })
  it('empty roman returns null', () => {
    expect(resolveAbsoluteChordKey('', 'C', DiatonicMode.Ionian)).toBeNull()
  })
  it('unrecognised root note returns null', () => {
    expect(resolveAbsoluteChordKey('I', 'X', DiatonicMode.Ionian)).toBeNull()
  })
})

// ─── resolveChordRootNote ─────────────────────────────────────────────────────

describe('resolveChordRootNote', () => {
  it('IV in C → F', () => {
    expect(resolveChordRootNote('IV', 'C', DiatonicMode.Ionian)).toBe('F')
  })
  it('V in G → D', () => {
    expect(resolveChordRootNote('V', 'G', DiatonicMode.Ionian)).toBe('D')
  })
  it('I in A → A', () => {
    expect(resolveChordRootNote('I', 'A', DiatonicMode.Ionian)).toBe('A')
  })
  it('i in A Aeolian → A', () => {
    expect(resolveChordRootNote('i', 'A', DiatonicMode.Aeolian)).toBe('A')
  })
  it('ii in Ab wraps to Bb', () => {
    expect(resolveChordRootNote('ii', 'Ab', DiatonicMode.Ionian)).toBe('Bb')
  })
  it('unknown roman returns null', () => {
    expect(resolveChordRootNote('IX', 'C', DiatonicMode.Ionian)).toBeNull()
  })
  it('unrecognised root returns null', () => {
    expect(resolveChordRootNote('I', 'Z', DiatonicMode.Ionian)).toBeNull()
  })
})

// ─── getRomansForMode ─────────────────────────────────────────────────────────

describe('getRomansForMode', () => {
  it('returns 14 entries (7 triads + 7 sevenths) for Ionian', () => {
    expect(getRomansForMode(DiatonicMode.Ionian)).toHaveLength(14)
  })

  it('Ionian triad romans are I ii iii IV V vi vii°', () => {
    const romans = getRomansForMode(DiatonicMode.Ionian).map(r => r.roman)
    expect(romans).toContain('I')
    expect(romans).toContain('ii')
    expect(romans).toContain('iii')
    expect(romans).toContain('IV')
    expect(romans).toContain('V')
    expect(romans).toContain('vi')
    expect(romans).toContain('vii°')
  })

  it('Ionian seventh chord romans include Imaj7 and V7', () => {
    const romans = getRomansForMode(DiatonicMode.Ionian).map(r => r.roman)
    expect(romans).toContain('Imaj7')
    expect(romans).toContain('V7')
  })

  it('all entries have degree in range 0–11', () => {
    for (const mode of [DiatonicMode.Ionian, DiatonicMode.Aeolian, DiatonicMode.Dorian]) {
      for (const entry of getRomansForMode(mode)) {
        expect(entry.degree).toBeGreaterThanOrEqual(0)
        expect(entry.degree).toBeLessThanOrEqual(11)
      }
    }
  })

  it('Aeolian first triad roman is i (minor)', () => {
    const first = getRomansForMode(DiatonicMode.Aeolian)[0]
    expect(first.roman).toBe('i')
    expect(first.quality).toBe(ChordQuality.Minor)
  })
})

// ─── isMajorChordQuality ──────────────────────────────────────────────────────

describe('isMajorChordQuality', () => {
  it.each([
    [ChordQuality.Major, true],
    [ChordQuality.Major7th, true],
    [ChordQuality.Dominant7th, true],
    [ChordQuality.Minor, false],
    [ChordQuality.Minor7th, false],
    [ChordQuality.Diminished, false],
    [ChordQuality.Augmented, false],
    [ChordQuality.Unknown, false],
  ])('%s → %s', (quality, expected) => {
    expect(isMajorChordQuality(quality)).toBe(expected)
  })
})
