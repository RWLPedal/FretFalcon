import { describe, it, expect } from 'vitest'
import {
  guitar_moveable_chord_library,
  mandolin_moveable_chord_library,
  ukulele_moveable_chord_library,
  charango_moveable_chord_library,
} from '../../../ts/music/moveable_shapes'
import { Chord, ChordType, CHORD_TYPE_INTERVALS } from '../../../ts/music/chords'
import { getKeyIndex } from '../../../ts/fretboard/fretboard_utils'
import {
  STANDARD_TUNING,
  GDAE_TUNING,
  CGDA_TUNING,
  UKULELE_GCEA_TUNING,
  CHARANGO_GCEAE_TUNING,
  Tuning,
} from '../../../ts/fretboard/instruments'

// Each moveable template is defined at base fret 0, so its `strings` array is the
// absolute fret on the library's native tuning. We can therefore validate the
// produced notes directly: take the root from the note on `rootStringIndex`, then
// assert every sounding note is a chord tone of the declared quality, and that the
// declared `rootKey` (openRootKey) agrees with the note on `rootStringIndex`.

const PC = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#']

/** Chord-tone pitch classes (mod 12) relative to the root for a quality. */
function expectedIntervals(type: ChordType): Set<number> {
  return new Set(CHORD_TYPE_INTERVALS[type].map((i) => i % 12))
}

function soundingPitchClasses(t: Chord, tuning: Tuning): number[] {
  return t.strings
    .map((fret, i) => (fret < 0 ? -1 : (tuning.notes[i] + fret) % 12))
    .filter((pc) => pc >= 0)
}

function rootPitchClass(t: Chord, tuning: Tuning): number {
  const rsi = t.rootStringIndex!
  return (tuning.notes[rsi] + t.strings[rsi]) % 12
}

interface LibCase {
  name: string
  lib: Chord[]
  tuning: Tuning
  /** Whether `rootKey` labels were authored for this tuning (skip for reused libs). */
  checkRootLabel: boolean
}

const CASES: LibCase[] = [
  { name: 'Guitar (EADGBE)', lib: guitar_moveable_chord_library, tuning: STANDARD_TUNING, checkRootLabel: true },
  { name: 'Mandolin (GDAE)', lib: mandolin_moveable_chord_library, tuning: GDAE_TUNING, checkRootLabel: true },
  // Mandola/Tenor reuse the mandolin library on CGDA; rootKey labels are GDAE-relative
  // so only the (tuning-independent) chord-tone geometry is checked here.
  { name: 'Mandola/Tenor (CGDA)', lib: mandolin_moveable_chord_library, tuning: CGDA_TUNING, checkRootLabel: false },
  { name: 'Ukulele (GCEA)', lib: ukulele_moveable_chord_library, tuning: UKULELE_GCEA_TUNING, checkRootLabel: true },
  { name: 'Charango (GCEAE)', lib: charango_moveable_chord_library, tuning: CHARANGO_GCEAE_TUNING, checkRootLabel: true },
]

describe('moveable shape validity', () => {
  for (const { name, lib, tuning, checkRootLabel } of CASES) {
    describe(name, () => {
      lib.forEach((t, idx) => {
        const tag = `${t.shapeName}${t.voicing ? '/' + t.voicing : ''} ${t.chordType} [#${idx}]`

        it(`${tag}: every note is a chord tone of its quality`, () => {
          const root = rootPitchClass(t, tuning)
          const exp = expectedIntervals(t.chordType)
          const notes = soundingPitchClasses(t, tuning)
          const foreign = notes
            .map((pc) => ((pc - root) % 12 + 12) % 12)
            .filter((iv) => !exp.has(iv))
          const noteNames = notes.map((pc) => PC[pc]).join(' ')
          expect(foreign, `${tag} root=${PC[root]} notes=[${noteNames}] foreign intervals`).toEqual([])
        })

        it(`${tag}: contains the root and the quality-defining 3rd`, () => {
          const root = rootPitchClass(t, tuning)
          const intervals = new Set(
            soundingPitchClasses(t, tuning).map((pc) => ((pc - root) % 12 + 12) % 12),
          )
          // root must always be present
          expect(intervals.has(0), `${tag} missing root`).toBe(true)
          // the defining 3rd (or 2/4 for sus) must be present so the quality is unambiguous
          for (const iv of CHORD_TYPE_INTERVALS[t.chordType]) {
            const m = iv % 12
            if (m === 0 || m === 7) continue // root and (optional) 5th
            expect(intervals.has(m), `${tag} missing interval ${iv}`).toBe(true)
          }
        })

        if (checkRootLabel) {
          it(`${tag}: rootStringIndex + rootKey agree with the fretted root`, () => {
            const root = rootPitchClass(t, tuning)
            expect(getKeyIndex(String(t.rootKey)), `${tag} rootKey=${t.rootKey} should be ${PC[root]}`).toBe(root)
          })
        }
      })
    })
  }
})
