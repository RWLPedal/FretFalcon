import { describe, it, expect } from 'vitest'
import {
  buildChordFamily,
  buildChordVoicings,
  describeAlteration,
  chordMovesCount,
} from '../../../ts/music/chord_family'
import { getMoveableShapes } from '../../../ts/music/moveable_shapes'
import { ChordType } from '../../../ts/music/chords'
import { STANDARD_TUNING, UKULELE_GCEA_TUNING, GDAE_TUNING, CGDA_TUNING, CHARANGO_GCEAE_TUNING, BASS_EADG_TUNING, InstrumentName } from '../../../ts/fretboard/instruments'

const aShape = (root: string, type: ChordType) =>
  getMoveableShapes(InstrumentName.Guitar, `${root} ${type}`, STANDARD_TUNING, type)
    .find(s => s.shapeName === 'A-Shape')!

describe('describeAlteration (A-Shape, root A)', () => {
  const major = aShape('A', ChordType.MAJOR)

  it('major → minor: lower the 3rd one fret → ♭3 (1 move)', () => {
    const { hint, moves } = describeAlteration(major, aShape('A', ChordType.MINOR), 'A', STANDARD_TUNING)
    expect(moves).toBe(1)
    expect(hint.toLowerCase()).toContain('3rd')
    expect(hint).toContain('♭3')
  })

  it('major → dom7: drops the root to ♭7 (1 move)', () => {
    const { hint, moves } = describeAlteration(major, aShape('A', ChordType.DOM7), 'A', STANDARD_TUNING)
    expect(moves).toBe(1)
    expect(hint).toContain('♭7')
  })

  it('major → min7: two moves (♭3 and ♭7)', () => {
    const { hint, moves } = describeAlteration(major, aShape('A', ChordType.MIN7), 'A', STANDARD_TUNING)
    expect(moves).toBe(2)
    expect(hint).toContain('♭3')
    expect(hint).toContain('♭7')
  })

  it('major → sus4: raise the 3rd one fret → 4 (1 move)', () => {
    const { hint, moves } = describeAlteration(major, aShape('A', ChordType.SUS4), 'A', STANDARD_TUNING)
    expect(moves).toBe(1)
    expect(hint.toLowerCase()).toContain('raise')
    expect(hint).toContain('4')
  })

  it('identical voicings report no change', () => {
    const { moves } = describeAlteration(major, aShape('A', ChordType.MAJOR), 'A', STANDARD_TUNING)
    expect(moves).toBe(0)
  })
})

describe('chordMovesCount', () => {
  it('counts changed strings', () => {
    expect(chordMovesCount(aShape('A', ChordType.MAJOR), aShape('A', ChordType.MIN7))).toBe(2)
    expect(chordMovesCount(aShape('A', ChordType.MAJOR), aShape('A', ChordType.MINOR))).toBe(1)
  })
})

describe('buildChordFamily', () => {
  it('anchors root A on the A-Shape with major as the anchor', () => {
    const fam = buildChordFamily(InstrumentName.Guitar, 'A', STANDARD_TUNING)!
    expect(fam).toBeTruthy()
    expect(fam.shapeName).toBe('A-Shape')
    const anchor = fam.members.find(m => m.isAnchor)!
    expect(anchor.type).toBe(ChordType.MAJOR)
    // The nut barre is stripped so the anchor renders as an open-position shape.
    expect(anchor.chord.barre ?? []).toHaveLength(0)
  })

  it('includes minor/dom7/min7 siblings with hints', () => {
    const fam = buildChordFamily(InstrumentName.Guitar, 'A', STANDARD_TUNING)!
    const types = fam.members.map(m => m.type)
    expect(types).toContain(ChordType.MINOR)
    expect(types).toContain(ChordType.DOM7)
    expect(types).toContain(ChordType.MIN7)
    const min = fam.members.find(m => m.type === ChordType.MINOR)!
    expect(min.isAnchor).toBe(false)
    expect(min.hint && min.hint.length).toBeGreaterThan(0)
    expect(min.moves).toBe(1)
  })

  it('anchors root G on the E-Shape (no open G-shape in the moveable library)', () => {
    const fam = buildChordFamily(InstrumentName.Guitar, 'G', STANDARD_TUNING)!
    expect(fam.shapeName).toBe('E-Shape')
    expect(fam.members.find(m => m.isAnchor)!.type).toBe(ChordType.MAJOR)
  })

  it('returns null for an unknown root', () => {
    expect(buildChordFamily(InstrumentName.Guitar, 'H', STANDARD_TUNING)).toBeNull()
  })
})

describe('new CAGED shape templates (transpose)', () => {
  const shape = (root: string, type: ChordType, voicing: string) =>
    getMoveableShapes(InstrumentName.Guitar, `${root} ${type}`, STANDARD_TUNING, type)
      .find(s => s.voicing === voicing)!

  it('C-Shape major mutes the outer two strings (R-3-5-R)', () => {
    // Home position (root C) is the open C shape without the high e.
    expect(shape('C', ChordType.MAJOR, 'C').strings).toEqual([-1, 3, 2, 0, 1, -1])
    // Root D transposes up two frets.
    expect(shape('D', ChordType.MAJOR, 'C').strings).toEqual([-1, 5, 4, 2, 3, -1])
  })

  it('D-Shape major plays the top four strings', () => {
    expect(shape('D', ChordType.MAJOR, 'D').strings).toEqual([-1, -1, 0, 2, 3, 2])
    expect(shape('E', ChordType.MAJOR, 'D').strings).toEqual([-1, -1, 2, 4, 5, 4])
  })
})

describe('buildChordVoicings (guitar)', () => {
  it('returns CAGED voicings ordered C, A, E, D — each anchored on its major', () => {
    const voicings = buildChordVoicings(InstrumentName.Guitar, 'A', STANDARD_TUNING)
    expect(voicings.map(v => v.voicingId)).toEqual(['C', 'A', 'E', 'D'])
    for (const v of voicings) {
      const anchor = v.members.find(m => m.isAnchor)
      expect(anchor?.type).toBe(ChordType.MAJOR)
    }
  })

  it('flags the lowest-fret major as the default (A-Shape for root A, E-Shape for root G)', () => {
    const aDefault = buildChordVoicings(InstrumentName.Guitar, 'A', STANDARD_TUNING)
      .find(v => v.isDefault)!
    expect(aDefault.voicingId).toBe('A')
    const gDefault = buildChordVoicings(InstrumentName.Guitar, 'G', STANDARD_TUNING)
      .find(v => v.isDefault)!
    expect(gDefault.voicingId).toBe('E')
  })

  it('the C voicing is major-only while the D voicing has a fuller family', () => {
    const voicings = buildChordVoicings(InstrumentName.Guitar, 'A', STANDARD_TUNING)
    const c = voicings.find(v => v.voicingId === 'C')!
    const d = voicings.find(v => v.voicingId === 'D')!
    expect(c.members.map(m => m.type)).toEqual([ChordType.MAJOR])
    expect(d.members.map(m => m.type)).toContain(ChordType.MINOR)
    expect(d.members.map(m => m.type)).toContain(ChordType.MIN7)
  })

  it('returns [] for instruments without voicing-tagged shapes', () => {
    // Bass has no moveable-shape library at all, so it falls back to buildChordFamily.
    expect(buildChordVoicings(InstrumentName.Bass, 'A', BASS_EADG_TUNING)).toEqual([])
  })

  it('returns [] for an unknown root', () => {
    expect(buildChordVoicings(InstrumentName.Guitar, 'H', STANDARD_TUNING)).toEqual([])
  })
})

describe('buildChordVoicings (ukulele CAGFD)', () => {
  const ukeShape = (root: string, type: ChordType, voicing: string) =>
    getMoveableShapes(InstrumentName.Ukulele, `${root} ${type}`, UKULELE_GCEA_TUNING, type)
      .find(s => s.voicing === voicing)!

  it('returns the five CAGFD voicings ordered C, A, G, F, D — each anchored on its major', () => {
    const voicings = buildChordVoicings(InstrumentName.Ukulele, 'C', UKULELE_GCEA_TUNING)
    expect(voicings.map(v => v.voicingId)).toEqual(['C', 'A', 'G', 'F', 'D'])
    for (const v of voicings) {
      expect(v.members.find(m => m.isAnchor)?.type).toBe(ChordType.MAJOR)
    }
  })

  it('flags the lowest-fret major as the default (C-Shape for root C, G-Shape for root G)', () => {
    expect(buildChordVoicings(InstrumentName.Ukulele, 'C', UKULELE_GCEA_TUNING).find(v => v.isDefault)!.voicingId).toBe('C')
    expect(buildChordVoicings(InstrumentName.Ukulele, 'G', UKULELE_GCEA_TUNING).find(v => v.isDefault)!.voicingId).toBe('G')
  })

  it('the A/G/D voicings carry full families while C/F are major-anchored', () => {
    const voicings = buildChordVoicings(InstrumentName.Ukulele, 'C', UKULELE_GCEA_TUNING)
    const types = (id: string) => voicings.find(v => v.voicingId === id)!.members.map(m => m.type)
    for (const id of ['A', 'G', 'D']) {
      expect(types(id)).toContain(ChordType.MINOR)
      expect(types(id)).toContain(ChordType.MIN7)
    }
    expect(types('C')).toEqual([ChordType.MAJOR, ChordType.DOM7, ChordType.MAJ7])
    expect(types('F')).toEqual([ChordType.MAJOR, ChordType.DOM7, ChordType.MAJ7])
  })

  it('A-Shape major → minor is a one-fret move on the 3rd → ♭3', () => {
    const { hint, moves } = describeAlteration(
      ukeShape('A', ChordType.MAJOR, 'A'),
      ukeShape('A', ChordType.MINOR, 'A'),
      'A',
      UKULELE_GCEA_TUNING,
    )
    expect(moves).toBe(1)
    expect(hint.toLowerCase()).toContain('3rd')
    expect(hint).toContain('♭3')
  })
})

describe('buildChordVoicings (charango — Formas)', () => {
  const charangoShape = (root: string, type: ChordType, voicing: string) =>
    getMoveableShapes(InstrumentName.Charango, `${root} ${type}`, CHARANGO_GCEAE_TUNING, type)
      .find(s => s.voicing === voicing)!

  it('returns the five Formas ordered do, la, sol, fa, re — each anchored on its major', () => {
    const voicings = buildChordVoicings(InstrumentName.Charango, 'C', CHARANGO_GCEAE_TUNING)
    expect(voicings.map(v => v.voicingId)).toEqual(['do', 'la', 'sol', 'fa', 're'])
    for (const v of voicings) {
      expect(v.members.find(m => m.isAnchor)?.type).toBe(ChordType.MAJOR)
    }
  })

  it('labels the voicings with traditional "Forma de <nota>" names', () => {
    const voicings = buildChordVoicings(InstrumentName.Charango, 'C', CHARANGO_GCEAE_TUNING)
    const name = (id: string) => voicings.find(v => v.voicingId === id)!.shapeName
    expect(name('do')).toBe('Forma de Do')
    expect(name('la')).toBe('Forma de La')
    expect(name('sol')).toBe('Forma de Sol')
    expect(name('fa')).toBe('Forma de Fa')
    expect(name('re')).toBe('Forma de Re')
  })

  it('flags the lowest-fret major as the default (Forma de Do for C, Forma de La for A)', () => {
    expect(buildChordVoicings(InstrumentName.Charango, 'C', CHARANGO_GCEAE_TUNING).find(v => v.isDefault)!.voicingId).toBe('do')
    expect(buildChordVoicings(InstrumentName.Charango, 'A', CHARANGO_GCEAE_TUNING).find(v => v.isDefault)!.voicingId).toBe('la')
  })

  it('the la/sol/re Formas carry full families while do/fa are major-anchored', () => {
    const voicings = buildChordVoicings(InstrumentName.Charango, 'C', CHARANGO_GCEAE_TUNING)
    const types = (id: string) => voicings.find(v => v.voicingId === id)!.members.map(m => m.type)
    for (const id of ['la', 'sol', 're']) {
      expect(types(id)).toContain(ChordType.MINOR)
      expect(types(id)).toContain(ChordType.MIN7)
    }
    expect(types('do')).toEqual([ChordType.MAJOR, ChordType.DOM7, ChordType.MAJ7])
    expect(types('fa')).toEqual([ChordType.MAJOR, ChordType.DOM7, ChordType.MAJ7])
  })

  it('doubles the 1st course onto the open 3rd on the low Forma de La (A major)', () => {
    // Traditional "play the 1st course at the same fret as the 3rd" rule: on the low
    // shapes the 3rd course is open, so the barre extends across all five courses.
    expect(charangoShape('A', ChordType.MAJOR, 'la').strings).toEqual([2, 1, 0, 0, 0])
  })

  it('mutes the 1st course on the higher Forma de Sol (G major)', () => {
    expect(charangoShape('G', ChordType.MAJOR, 'sol').strings[4]).toBe(-1)
  })

  it('Forma de La major → minor lowers the 3rd one fret → ♭3 (1 move)', () => {
    const { hint, moves } = describeAlteration(
      charangoShape('A', ChordType.MAJOR, 'la'),
      charangoShape('A', ChordType.MINOR, 'la'),
      'A',
      CHARANGO_GCEAE_TUNING,
    )
    expect(moves).toBe(1)
    expect(hint.toLowerCase()).toContain('3rd')
    expect(hint).toContain('♭3')
  })

  it('Forma de La major → dom7 lowers the root → ♭7 (1 move)', () => {
    const { hint, moves } = describeAlteration(
      charangoShape('A', ChordType.MAJOR, 'la'),
      charangoShape('A', ChordType.DOM7, 'la'),
      'A',
      CHARANGO_GCEAE_TUNING,
    )
    expect(moves).toBe(1)
    expect(hint).toContain('♭7')
  })
})

describe('buildChordVoicings (fifths tuning — mandolin / mandola)', () => {
  const mandoShape = (root: string, type: ChordType, voicing: string) =>
    getMoveableShapes(InstrumentName.Mandolin, `${root} ${type}`, GDAE_TUNING, type)
      .find(s => s.voicing === voicing)!

  it('returns the three inversion voicings (root, 1st, 2nd), each anchored on its major', () => {
    const voicings = buildChordVoicings(InstrumentName.Mandolin, 'G', GDAE_TUNING)
    expect(voicings.map(v => v.voicingId)).toEqual(['root', 'inv1', 'inv2'])
    for (const v of voicings) {
      expect(v.members.find(m => m.isAnchor)?.type).toBe(ChordType.MAJOR)
    }
  })

  it('labels the voicings by inversion (distinct from guitar/ukulele CAGED letters)', () => {
    const voicings = buildChordVoicings(InstrumentName.Mandolin, 'G', GDAE_TUNING)
    expect(voicings.find(v => v.voicingId === 'root')!.shapeName).toBe('Root position')
    expect(voicings.find(v => v.voicingId === 'inv1')!.shapeName).toBe('1st inversion')
    expect(voicings.find(v => v.voicingId === 'inv2')!.shapeName).toBe('2nd inversion')
  })

  it('flags the lowest-fret major (root position) as the default', () => {
    expect(buildChordVoicings(InstrumentName.Mandolin, 'G', GDAE_TUNING).find(v => v.isDefault)!.voicingId).toBe('root')
  })

  it('all three voicings carry full families (minor + min7)', () => {
    const voicings = buildChordVoicings(InstrumentName.Mandolin, 'G', GDAE_TUNING)
    for (const v of voicings) {
      expect(v.members.map(m => m.type)).toContain(ChordType.MINOR)
      expect(v.members.map(m => m.type)).toContain(ChordType.MIN7)
    }
  })

  it('the 1st-inversion major puts the 3rd in the bass (B for G major)', () => {
    // GDAE: lowest course is G (string 0). Root G first inversion → frets 4-5-5-3,
    // bass note B = the major 3rd.
    const maj = mandoShape('G', ChordType.MAJOR, 'inv1')
    expect(maj.strings).toEqual([4, 5, 5, 3])
    const bassPc = (GDAE_TUNING.notes[0] + maj.strings[0]) % 12 // string 0, fret 4
    const B = 2 // pitch class of B (A=0)
    expect(bassPc).toBe(B)
  })

  it('the untagged 3-string "Jethro" triad is not offered as a voicing', () => {
    const ids = buildChordVoicings(InstrumentName.Mandolin, 'G', GDAE_TUNING).map(v => v.voicingId)
    expect(ids).not.toContain('Jethro')
    expect(ids).toHaveLength(3)
  })

  it('mandola (CGDA) shares the same shape library and voicing set', () => {
    const voicings = buildChordVoicings(InstrumentName.Mandola, 'C', CGDA_TUNING)
    expect(voicings.map(v => v.voicingId)).toEqual(['root', 'inv1', 'inv2'])
    expect(voicings.find(v => v.isDefault)!.voicingId).toBe('root')
  })

  it('root-position major → minor lowers the 3rd one fret → ♭3 (1 move)', () => {
    const { hint, moves } = describeAlteration(
      mandoShape('G', ChordType.MAJOR, 'root'),
      mandoShape('G', ChordType.MINOR, 'root'),
      'G',
      GDAE_TUNING,
    )
    expect(moves).toBe(1)
    expect(hint.toLowerCase()).toContain('3rd')
    expect(hint).toContain('♭3')
  })

  it('1st-inversion major → minor lowers the 3rd one fret → ♭3 (1 move)', () => {
    const { hint, moves } = describeAlteration(
      mandoShape('G', ChordType.MAJOR, 'inv1'),
      mandoShape('G', ChordType.MINOR, 'inv1'),
      'G',
      GDAE_TUNING,
    )
    expect(moves).toBe(1)
    expect(hint.toLowerCase()).toContain('3rd')
    expect(hint).toContain('♭3')
  })

  it('1st-inversion major → dom7 lowers the root → ♭7 (1 move)', () => {
    const { hint, moves } = describeAlteration(
      mandoShape('G', ChordType.MAJOR, 'inv1'),
      mandoShape('G', ChordType.DOM7, 'inv1'),
      'G',
      GDAE_TUNING,
    )
    expect(moves).toBe(1)
    expect(hint).toContain('♭7')
  })
})
