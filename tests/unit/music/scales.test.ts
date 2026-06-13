import { describe, it, expect } from 'vitest'
import { Scale, scales } from '../../../ts/music/scales'
import { ChordQuality } from '../../../ts/music/music_types'

// ─── Scale.getChordQualityAt ──────────────────────────────────────────────────

describe('Scale.getChordQualityAt — C major diatonic triads', () => {
  // Expected qualities: I=Maj, ii=Min, iii=Min, IV=Maj, V=Maj, vi=Min, vii°=Dim
  const expected: ChordQuality[] = [
    ChordQuality.Major,
    ChordQuality.Minor,
    ChordQuality.Minor,
    ChordQuality.Major,
    ChordQuality.Major,
    ChordQuality.Minor,
    ChordQuality.Diminished,
  ]

  expected.forEach((quality, i) => {
    it(`degree ${i + 1} is ${quality}`, () => {
      expect(scales.MAJOR.getChordQualityAt(i)).toBe(quality)
    })
  })
})

describe('Scale.getChordQualityAt — natural minor diatonic triads', () => {
  // Expected: i=Min, ii°=Dim, III=Maj, iv=Min, v=Min, VI=Maj, VII=Maj
  const expected: ChordQuality[] = [
    ChordQuality.Minor,
    ChordQuality.Diminished,
    ChordQuality.Major,
    ChordQuality.Minor,
    ChordQuality.Minor,
    ChordQuality.Major,
    ChordQuality.Major,
  ]

  expected.forEach((quality, i) => {
    it(`degree ${i + 1} is ${quality}`, () => {
      expect(scales.NATURAL_MINOR.getChordQualityAt(i)).toBe(quality)
    })
  })
})

describe('Scale.getChordQualityAt — throws for non-7-note scales', () => {
  it('throws on pentatonic (5 notes)', () => {
    expect(() => scales.MAJOR_PENTATONIC.getChordQualityAt(0)).toThrow()
  })
  it('throws on blues (6 notes)', () => {
    expect(() => scales.MINOR_BLUES.getChordQualityAt(0)).toThrow()
  })
})

// ─── Scale.getRomanNumeralAt ──────────────────────────────────────────────────

describe('Scale.getRomanNumeralAt — major scale', () => {
  it('uppercase for major chords', () => {
    expect(scales.MAJOR.getRomanNumeralAt(0)).toBe('I')
    expect(scales.MAJOR.getRomanNumeralAt(3)).toBe('IV')
    expect(scales.MAJOR.getRomanNumeralAt(4)).toBe('V')
  })

  it('lowercase for minor chords', () => {
    expect(scales.MAJOR.getRomanNumeralAt(1)).toBe('ii')
    expect(scales.MAJOR.getRomanNumeralAt(2)).toBe('iii')
    expect(scales.MAJOR.getRomanNumeralAt(5)).toBe('vi')
  })

  it('lowercase + ° for diminished', () => {
    expect(scales.MAJOR.getRomanNumeralAt(6)).toBe('vii°')
  })
})

// ─── Scale.generateRomanEntries ───────────────────────────────────────────────

describe('Scale.generateRomanEntries', () => {
  it('returns 7 entries when include7ths is false', () => {
    const entries = scales.MAJOR.generateRomanEntries(false)
    expect(entries).toHaveLength(7)
  })

  it('returns more than 7 entries when include7ths is true (default)', () => {
    const entries = scales.MAJOR.generateRomanEntries()
    expect(entries.length).toBeGreaterThan(7)
  })

  it('every entry has required fields', () => {
    const entries = scales.MAJOR.generateRomanEntries(false)
    for (const entry of entries) {
      expect(typeof entry.roman).toBe('string')
      expect(typeof entry.degree).toBe('number')
      expect(typeof entry.suffix).toBe('string')
      expect(typeof entry.degreeIndex).toBe('number')
      expect(Object.values(ChordQuality)).toContain(entry.quality)
    }
  })

  it('degreeIndex values are 0–6 in order', () => {
    const entries = scales.MAJOR.generateRomanEntries(false)
    entries.forEach((e, i) => expect(e.degreeIndex).toBe(i))
  })

  it('first entry root degree is 0 for any scale', () => {
    for (const scale of Object.values(scales)) {
      if (scale.degrees.length === 7) {
        expect(scale.generateRomanEntries(false)[0].degree).toBe(0)
      }
    }
  })
})

// ─── Scale definitions sanity checks ─────────────────────────────────────────

describe('built-in scale definitions', () => {
  it('major scale has correct intervals', () => {
    expect(scales.MAJOR.degrees).toEqual([0, 2, 4, 5, 7, 9, 11])
  })

  it('natural minor scale has correct intervals', () => {
    expect(scales.NATURAL_MINOR.degrees).toEqual([0, 2, 3, 5, 7, 8, 10])
  })

  it('all 7-note scales start with degree 0', () => {
    for (const scale of Object.values(scales)) {
      expect(scale.degrees[0]).toBe(0)
    }
  })

  it('all scale degrees are in ascending order', () => {
    for (const scale of Object.values(scales)) {
      for (let i = 1; i < scale.degrees.length; i++) {
        expect(scale.degrees[i]).toBeGreaterThan(scale.degrees[i - 1])
      }
    }
  })

  it('all scale degrees are within 0–11', () => {
    for (const scale of Object.values(scales)) {
      for (const degree of scale.degrees) {
        expect(degree).toBeGreaterThanOrEqual(0)
        expect(degree).toBeLessThanOrEqual(11)
      }
    }
  })
})

// ─── Double Harmonic Major ────────────────────────────────────────────────────

describe('Double Harmonic Major', () => {
  it('has correct intervals', () => {
    expect(scales.DOUBLE_HARMONIC_MAJOR.degrees).toEqual([0, 1, 4, 5, 7, 8, 11])
  })

  // Hungarian Minor is mode 4 of Double Harmonic Major.
  it('mode 4 equals Hungarian Minor', () => {
    const src = scales.DOUBLE_HARMONIC_MAJOR.degrees
    const mode4Root = src[3] // semitone 5
    const mode4 = [...src.slice(3), ...src.slice(0, 3)].map(d => (d - mode4Root + 12) % 12).sort((a, b) => a - b)
    expect(mode4).toEqual(scales.HUNGARIAN_MINOR.degrees)
  })
})

// ─── Harmonic Minor ───────────────────────────────────────────────────────────

describe('Harmonic Minor', () => {
  // Phrygian Dominant is mode 5 of Harmonic Minor.
  it('mode 5 equals Phrygian Dominant', () => {
    const src = scales.HARMONIC_MINOR.degrees
    const mode5Root = src[4] // semitone 7
    const mode5 = [...src.slice(4), ...src.slice(0, 4)].map(d => (d - mode5Root + 12) % 12).sort((a, b) => a - b)
    expect(mode5).toEqual(scales.PHRYGIAN_DOMINANT.degrees)
  })
})
