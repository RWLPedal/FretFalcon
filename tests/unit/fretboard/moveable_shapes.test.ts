import { describe, it, expect } from 'vitest'
import { getMoveableShapes, guitar_moveable_chord_library } from '../../../ts/fretboard/moveable_shapes'
import { Chord, ChordType, chordsAreEquivalent, chord_library, ukulele_chord_library } from '../../../ts/fretboard/chords'
import { STANDARD_TUNING, UKULELE_GCEA_TUNING, InstrumentName } from '../../../ts/fretboard/fretboard'
import { NoteName } from '../../../ts/fretboard/music_types'

// ---------------------------------------------------------------------------
// getMoveableShapes — guitar
// ---------------------------------------------------------------------------
describe('getMoveableShapes guitar', () => {
  it('E-Shape Major at E (baseFret=0) produces correct absolute frets and barre', () => {
    const shapes = getMoveableShapes(InstrumentName.Guitar, 'E', STANDARD_TUNING, ChordType.MAJOR)
    const shape = shapes.find(s => s.shapeName === 'E-Shape')!
    expect(shape).toBeDefined()
    expect(shape.strings).toEqual([0, 2, 2, 1, 0, 0])
    expect(shape.barre).toEqual([{ fret: 0, stringStart: 0, stringEnd: 5 }])
    expect(shape.rootStringIndex).toBe(0)
    expect(shape.rootKey).toBe(NoteName.E)
  })

  it('E-Shape Major at A (baseFret=5) transposes correctly', () => {
    const shapes = getMoveableShapes(InstrumentName.Guitar, 'A', STANDARD_TUNING, ChordType.MAJOR)
    const shape = shapes.find(s => s.shapeName === 'E-Shape')!
    expect(shape).toBeDefined()
    expect(shape.strings).toEqual([5, 7, 7, 6, 5, 5])
    expect(shape.barre).toEqual([{ fret: 5, stringStart: 0, stringEnd: 5 }])
    expect(shape.rootKey).toBe(NoteName.A)
  })

  it('E-Shape Minor at E (baseFret=0) produces correct frets', () => {
    const shapes = getMoveableShapes(InstrumentName.Guitar, 'Em', STANDARD_TUNING, ChordType.MINOR)
    const shape = shapes.find(s => s.shapeName === 'E-Shape')!
    expect(shape).toBeDefined()
    expect(shape.strings).toEqual([0, 2, 2, 0, 0, 0])
  })

  it('A-Shape Minor at A (baseFret=0) matches open Am chord strings', () => {
    const shapes = getMoveableShapes(InstrumentName.Guitar, 'Am', STANDARD_TUNING, ChordType.MINOR)
    const shape = shapes.find(s => s.shapeName === 'A-Shape')!
    expect(shape).toBeDefined()
    expect(shape.strings).toEqual([-1, 0, 2, 2, 1, 0])
    expect(shape.barre).toEqual([{ fret: 0, stringStart: 1, stringEnd: 5 }])
    expect(shape.rootStringIndex).toBe(1)
  })

  it('A-Shape Minor at B (baseFret=2) transposes correctly', () => {
    const shapes = getMoveableShapes(InstrumentName.Guitar, 'Bm', STANDARD_TUNING, ChordType.MINOR)
    const shape = shapes.find(s => s.shapeName === 'A-Shape')!
    expect(shape).toBeDefined()
    expect(shape.strings).toEqual([-1, 2, 4, 4, 3, 2])
    expect(shape.barre).toEqual([{ fret: 2, stringStart: 1, stringEnd: 5 }])
  })

  it('results are sorted by root fret ascending', () => {
    const shapes = getMoveableShapes(InstrumentName.Guitar, 'F', STANDARD_TUNING, ChordType.MAJOR)
    const rootFrets = shapes.map(s => s.strings[s.rootStringIndex!])
    expect(rootFrets).toEqual([...rootFrets].sort((a, b) => a - b))
  })

  it('sets shapeName on result chords', () => {
    const shapes = getMoveableShapes(InstrumentName.Guitar, 'C', STANDARD_TUNING, ChordType.MAJOR)
    expect(shapes.every(s => typeof s.shapeName === 'string' && s.shapeName.length > 0)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// getMoveableShapes — ukulele
// ---------------------------------------------------------------------------
describe('getMoveableShapes ukulele', () => {
  it('C-Shape Major at C (baseFret=0) produces correct frets and barre', () => {
    const shapes = getMoveableShapes(InstrumentName.Ukulele, 'C', UKULELE_GCEA_TUNING, ChordType.MAJOR)
    const shape = shapes.find(s => s.shapeName === 'C-Shape')!
    expect(shape).toBeDefined()
    expect(shape.strings).toEqual([0, 0, 0, 3])
    expect(shape.barre).toEqual([{ fret: 0, stringStart: 0, stringEnd: 3 }])
    expect(shape.rootStringIndex).toBe(1)
  })

  it('A Minor Shape at A (baseFret=0) produces correct frets', () => {
    const shapes = getMoveableShapes(InstrumentName.Ukulele, 'Am', UKULELE_GCEA_TUNING, ChordType.MINOR)
    const shape = shapes.find(s => s.shapeName === 'A Minor Shape')!
    expect(shape).toBeDefined()
    expect(shape.strings).toEqual([2, 0, 0, 0])
  })

  it('A-Shape Major at A (baseFret=0) produces correct frets', () => {
    const shapes = getMoveableShapes(InstrumentName.Ukulele, 'A', UKULELE_GCEA_TUNING, ChordType.MAJOR)
    const shape = shapes.find(s => s.shapeName === 'A-Shape')!
    expect(shape).toBeDefined()
    // A-Shape template: stringOffsets=[2,1,0,0], rootStringIndex=3, openNote=A(0)
    // baseFret = (0 - 0 + 24) % 12 = 0 → strings=[2,1,0,0]
    expect(shape.strings).toEqual([2, 1, 0, 0])
  })
})

// ---------------------------------------------------------------------------
// chordsAreEquivalent
// ---------------------------------------------------------------------------
describe('chordsAreEquivalent', () => {
  it('guitar open Am equals A-Shape moveable Am at baseFret=0', () => {
    const openAm = chord_library.A_MINOR
    const moveableShapes = getMoveableShapes(InstrumentName.Guitar, 'Am', STANDARD_TUNING, ChordType.MINOR)
    const aShapeAm = moveableShapes.find(s => s.shapeName === 'A-Shape')!
    expect(chordsAreEquivalent(openAm, aShapeAm)).toBe(true)
  })

  it('guitar open Em equals E-Shape moveable Em at baseFret=0', () => {
    const openEm = chord_library.E_MINOR
    const moveableShapes = getMoveableShapes(InstrumentName.Guitar, 'Em', STANDARD_TUNING, ChordType.MINOR)
    const eShapeEm = moveableShapes.find(s => s.shapeName === 'E-Shape')!
    expect(chordsAreEquivalent(openEm, eShapeEm)).toBe(true)
  })

  it('open Am does not equal A-Shape Am at baseFret=2', () => {
    const openAm = chord_library.A_MINOR
    const moveableShapes = getMoveableShapes(InstrumentName.Guitar, 'Bm', STANDARD_TUNING, ChordType.MINOR)
    const aShapeBm = moveableShapes.find(s => s.shapeName === 'A-Shape')!
    expect(chordsAreEquivalent(openAm, aShapeBm)).toBe(false)
  })

  it('chords with different string counts are not equivalent', () => {
    const guitar = chord_library.A_MINOR  // 6 strings
    const uku = ukulele_chord_library.A_MINOR  // 4 strings
    expect(chordsAreEquivalent(guitar, uku)).toBe(false)
  })

  it('a chord is equivalent to itself', () => {
    const chord = chord_library.E_MAJOR
    expect(chordsAreEquivalent(chord, chord)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Chord.template() openRootKey
// ---------------------------------------------------------------------------
describe('Chord.template openRootKey', () => {
  it('guitar E-Shape template stores E as rootKey', () => {
    const eShape = guitar_moveable_chord_library.find(t => t.shapeName === 'E-Shape' && t.chordType === ChordType.MAJOR)
    expect(eShape?.rootKey).toBe(NoteName.E)
  })

  it('guitar A-Shape template stores A as rootKey', () => {
    const aShape = guitar_moveable_chord_library.find(t => t.shapeName === 'A-Shape' && t.chordType === ChordType.MAJOR)
    expect(aShape?.rootKey).toBe(NoteName.A)
  })
})
