import { describe, it, expect } from 'vitest'
import { getChordInKey } from '../../../ts/music/progressions'
import { ChordQuality, DiatonicMode } from '../../../ts/music/music_types'

// Pass an empty chord library so tests only assert on chordName and quality,
// not on the organic chord_library key format (which is fragile).
const EMPTY_LIB = {}

// A-indexed note indices (0=A, 3=C, 5=D, 7=E, 8=F, 9=F#, 10=G)
const C = 3
const D = 5
const A = 0

// ─── C Major diatonic triads ──────────────────────────────────────────────────

describe('getChordInKey — C Ionian triads', () => {
  it.each([
    ['I',    'C',    ChordQuality.Major],
    ['ii',   'Dm',   ChordQuality.Minor],
    ['iii',  'Em',   ChordQuality.Minor],
    ['IV',   'F',    ChordQuality.Major],
    ['V',    'G',    ChordQuality.Major],
    ['vi',   'Am',   ChordQuality.Minor],
    ['vii°', 'Bdim', ChordQuality.Diminished],
  ])('%s → chordName %s, quality %s', (roman, name, quality) => {
    const result = getChordInKey(C, roman, DiatonicMode.Ionian, EMPTY_LIB)
    expect(result.chordName).toBe(name)
    expect(result.quality).toBe(quality)
  })
})

// ─── 7th chords ───────────────────────────────────────────────────────────────

describe('getChordInKey — C Ionian 7th chords', () => {
  it('V7 → G7, Dominant7th', () => {
    const result = getChordInKey(C, 'V7', DiatonicMode.Ionian, EMPTY_LIB)
    expect(result.chordName).toBe('G7')
    expect(result.quality).toBe(ChordQuality.Dominant7th)
  })
  it('Imaj7 → Cmaj7, Major7th', () => {
    const result = getChordInKey(C, 'Imaj7', DiatonicMode.Ionian, EMPTY_LIB)
    expect(result.chordName).toBe('Cmaj7')
    expect(result.quality).toBe(ChordQuality.Major7th)
  })
  it('ii7 → Dm7, Minor7th', () => {
    const result = getChordInKey(C, 'ii7', DiatonicMode.Ionian, EMPTY_LIB)
    expect(result.chordName).toBe('Dm7')
    expect(result.quality).toBe(ChordQuality.Minor7th)
  })
})

// ─── Mode variants ────────────────────────────────────────────────────────────

describe('getChordInKey — A Aeolian (natural minor)', () => {
  it('i → Am, Minor', () => {
    const result = getChordInKey(A, 'i', DiatonicMode.Aeolian, EMPTY_LIB)
    expect(result.chordName).toBe('Am')
    expect(result.quality).toBe(ChordQuality.Minor)
  })
  it('III → C, Major (relative major chord)', () => {
    const result = getChordInKey(A, 'III', DiatonicMode.Aeolian, EMPTY_LIB)
    expect(result.chordName).toBe('C')
    expect(result.quality).toBe(ChordQuality.Major)
  })
  it('v → Em, Minor', () => {
    const result = getChordInKey(A, 'v', DiatonicMode.Aeolian, EMPTY_LIB)
    expect(result.chordName).toBe('Em')
    expect(result.quality).toBe(ChordQuality.Minor)
  })
})

describe('getChordInKey — D Dorian', () => {
  it('i → Dm, Minor', () => {
    const result = getChordInKey(D, 'i', DiatonicMode.Dorian, EMPTY_LIB)
    expect(result.chordName).toBe('Dm')
    expect(result.quality).toBe(ChordQuality.Minor)
  })
  it('IV → G, Major (characteristic Dorian major IV)', () => {
    const result = getChordInKey(D, 'IV', DiatonicMode.Dorian, EMPTY_LIB)
    expect(result.chordName).toBe('G')
    expect(result.quality).toBe(ChordQuality.Major)
  })
})

// ─── Error cases ──────────────────────────────────────────────────────────────

describe('getChordInKey — invalid input', () => {
  it('unrecognised roman numeral → Unknown quality, null chordKey', () => {
    const result = getChordInKey(C, 'VIII', DiatonicMode.Ionian, EMPTY_LIB)
    expect(result.quality).toBe(ChordQuality.Unknown)
    expect(result.chordKey).toBeNull()
    expect(result.chordName).toBe('VIII?')
  })
})

// ─── chordKey: null when library is empty ─────────────────────────────────────

describe('getChordInKey — chordKey is null with empty library', () => {
  it('chordName and quality are correct even when chordKey cannot be resolved', () => {
    const result = getChordInKey(C, 'I', DiatonicMode.Ionian, EMPTY_LIB)
    expect(result.chordName).toBe('C')
    expect(result.quality).toBe(ChordQuality.Major)
    expect(result.chordKey).toBeNull()
  })
})
