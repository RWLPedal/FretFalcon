import { describe, it, expect } from 'vitest'
import {
  getKeyIndex,
  getChordTones,
  getIntervalLabel,
  chordToneIntervalLabel,
  getNotesInScale,
  NOTE_NAMES_FROM_A,
} from '../../../ts/fretboard/fretboard_utils'
import { scales } from '../../../ts/music/scales'
import { ChordType } from '../../../ts/music/chords'
import { NoteName } from '../../../ts/music/music_types'

// A-indexed semitone positions (0=A, 3=C, 7=E, etc.)
describe('getKeyIndex', () => {
  it('returns correct index for natural notes', () => {
    expect(getKeyIndex('A')).toBe(0)
    expect(getKeyIndex('B')).toBe(2)
    expect(getKeyIndex('C')).toBe(3)
    expect(getKeyIndex('D')).toBe(5)
    expect(getKeyIndex('E')).toBe(7)
    expect(getKeyIndex('F')).toBe(8)
    expect(getKeyIndex('G')).toBe(10)
  })

  it('returns correct index for sharps', () => {
    expect(getKeyIndex('A#')).toBe(1)
    expect(getKeyIndex('C#')).toBe(4)
    expect(getKeyIndex('D#')).toBe(6)
    expect(getKeyIndex('F#')).toBe(9)
    expect(getKeyIndex('G#')).toBe(11)
  })

  it('treats enharmonic flats as equal to their sharp equivalents', () => {
    expect(getKeyIndex('Bb')).toBe(getKeyIndex('A#'))
    expect(getKeyIndex('Db')).toBe(getKeyIndex('C#'))
    expect(getKeyIndex('Eb')).toBe(getKeyIndex('D#'))
    expect(getKeyIndex('Gb')).toBe(getKeyIndex('F#'))
    expect(getKeyIndex('Ab')).toBe(getKeyIndex('G#'))
  })

  it('returns -1 for unknown or empty note names', () => {
    expect(getKeyIndex('')).toBe(-1)
    expect(getKeyIndex('X')).toBe(-1)
    expect(getKeyIndex('Cb')).toBe(-1)
  })

  it('trims whitespace before lookup', () => {
    expect(getKeyIndex(' C ')).toBe(3)
  })
})

describe('getIntervalLabel', () => {
  it('labels common intervals correctly', () => {
    expect(getIntervalLabel(0)).toBe('R')
    expect(getIntervalLabel(3)).toBe('b3')
    expect(getIntervalLabel(4)).toBe('3')
    expect(getIntervalLabel(7)).toBe('5')
    expect(getIntervalLabel(10)).toBe('b7')
    expect(getIntervalLabel(11)).toBe('7')
  })

  it('handles all 12 semitone slots without returning undefined', () => {
    for (let i = 0; i < 12; i++) {
      const label = getIntervalLabel(i)
      expect(typeof label).toBe('string')
      expect(label.length).toBeGreaterThan(0)
    }
  })

  it('wraps values >= 12 via modulo', () => {
    expect(getIntervalLabel(12)).toBe(getIntervalLabel(0))
    expect(getIntervalLabel(15)).toBe(getIntervalLabel(3))
  })
})

describe('chordToneIntervalLabel', () => {
  it('reads pitch class 2 as a 9th in extension chords, not a 2nd', () => {
    expect(chordToneIntervalLabel(2, ChordType.ADD9)).toBe('9')
    expect(chordToneIntervalLabel(2, ChordType.MINOR_ADD9)).toBe('9')
    expect(chordToneIntervalLabel(2, ChordType.MAJ9)).toBe('9')
    expect(chordToneIntervalLabel(2, ChordType.MIN9)).toBe('9')
  })

  it('keeps pitch class 2 as a real 2nd where the chord intends one', () => {
    expect(chordToneIntervalLabel(2, ChordType.SUS2)).toBe('2')
  })

  it('falls back to the plain label when the pitch class is not part of the chord', () => {
    expect(chordToneIntervalLabel(2, ChordType.MAJOR)).toBe('2')
    expect(chordToneIntervalLabel(2, ChordType.MINOR)).toBe('2')
  })

  it('leaves chord tones inside the octave unchanged', () => {
    expect(chordToneIntervalLabel(0, ChordType.ADD9)).toBe('R')
    expect(chordToneIntervalLabel(4, ChordType.ADD9)).toBe('3')
    expect(chordToneIntervalLabel(7, ChordType.ADD9)).toBe('5')
    expect(chordToneIntervalLabel(3, ChordType.MINOR_ADD9)).toBe('b3')
  })

  it('accepts a raw compound interval (14) the same as its pitch class (2)', () => {
    expect(chordToneIntervalLabel(14, ChordType.ADD9)).toBe('9')
  })
})

describe('getChordTones', () => {
  it('returns an empty array for undefined/empty input', () => {
    expect(getChordTones(undefined)).toEqual([])
    expect(getChordTones('')).toEqual([])
  })

  it('parses a single group of notes', () => {
    expect(getChordTones('C-E-G')).toEqual([['C', 'E', 'G']])
  })

  it('parses multiple pipe-separated groups', () => {
    expect(getChordTones('C-E-G|C-F-A')).toEqual([['C', 'E', 'G'], ['C', 'F', 'A']])
  })

  it('trims whitespace around individual note names', () => {
    const result = getChordTones(' C - E - G ')
    expect(result[0]).toContain('C')
    expect(result[0]).toContain('E')
    expect(result[0]).toContain('G')
  })
})

describe('getNotesInScale', () => {
  it('produces C major notes from C root (A-indexed: 3)', () => {
    const cIndex = getKeyIndex('C') // 3
    const notes = getNotesInScale(scales.MAJOR, cIndex)
    expect(notes).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B'])
  })

  it('produces A natural minor notes from A root (index: 0)', () => {
    const aIndex = getKeyIndex('A') // 0
    const notes = getNotesInScale(scales.NATURAL_MINOR, aIndex)
    expect(notes).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G'])
  })

  it('produces G major notes from G root (index: 10)', () => {
    const gIndex = getKeyIndex('G') // 10
    const notes = getNotesInScale(scales.MAJOR, gIndex)
    expect(notes).toContain('G')
    expect(notes).toContain('A')
    expect(notes).toContain('B')
    expect(notes).toContain('C')
    expect(notes).toContain('D')
    expect(notes).toContain('E')
    expect(notes).toHaveLength(7)
  })

  it('returns 5 notes for pentatonic scales', () => {
    const notes = getNotesInScale(scales.MAJOR_PENTATONIC, getKeyIndex('C'))
    expect(notes).toHaveLength(5)
  })

  it('returns an empty array for an out-of-range root index', () => {
    expect(getNotesInScale(scales.MAJOR, -1)).toEqual([])
    expect(getNotesInScale(scales.MAJOR, 12)).toEqual([])
  })

  it('root note is always the first note returned', () => {
    for (const [noteName, idx] of [['A', 0], ['C', 3], ['E', 7]] as [string, number][]) {
      const notes = getNotesInScale(scales.MAJOR, idx)
      expect(notes[0]).toBe(noteName)
    }
  })
})

describe('NOTE_NAMES_FROM_A', () => {
  it('has exactly 12 entries', () => {
    expect(NOTE_NAMES_FROM_A).toHaveLength(12)
  })

  it('starts with A and follows chromatic order', () => {
    expect(NOTE_NAMES_FROM_A[0]).toBe(NoteName.A)
    expect(NOTE_NAMES_FROM_A[3]).toBe(NoteName.C)
    expect(NOTE_NAMES_FROM_A[7]).toBe(NoteName.E)
  })
})
