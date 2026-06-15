// tests/unit/fretboard/capo.test.ts
// Unit tests for the capo transform helpers (DOM-free).

import { describe, it, expect } from 'vitest';
import { Chord, ChordType, getChordLibraryForInstrument } from '../../../ts/music/chords';
import { NoteName } from '../../../ts/music/music_types';
import { InstrumentName, STANDARD_TUNING } from '../../../ts/fretboard/instruments';
import { applyCapoToChord, capoChordTitle, capoBarre, capoIsActive, capoVoicing } from '../../../ts/fretboard/capo';

// An open A major shape: low E muted, A open, D/G/B at fret 2, high E open.
function openAMajor(): Chord {
  return new Chord('A', [-1, 0, 2, 2, 2, 0], [0, 0, 1, 2, 3, 0], undefined, ChordType.MAJOR, NoteName.A);
}

describe('capoIsActive', () => {
  it('is false for 0 / undefined and true for a positive fret', () => {
    expect(capoIsActive(0)).toBe(false);
    expect(capoIsActive(undefined)).toBe(false);
    expect(capoIsActive(2)).toBe(true);
  });
});

describe('applyCapoToChord', () => {
  it('is a no-op (same reference) when capoFret is 0', () => {
    const chord = openAMajor();
    expect(applyCapoToChord(chord, 0)).toBe(chord);
  });

  it('shifts every fretted/open position up by the capo fret, leaving mutes alone', () => {
    const capoed = applyCapoToChord(openAMajor(), 2);
    expect(capoed.strings).toEqual([-1, 2, 4, 4, 4, 2]);
  });

  it('transposes the name and rootKey up by the capo fret (A + 2 → B)', () => {
    const capoed = applyCapoToChord(openAMajor(), 2);
    expect(capoed.name).toBe('B');
    expect(capoed.rootKey).toBe('B');
    expect(capoed.chordType).toBe(ChordType.MAJOR);
  });

  it('preserves the suffix when transposing (Am + 2 → Bm)', () => {
    const am = new Chord('Am', [-1, 0, 2, 2, 1, 0], [0, 0, 2, 3, 1, 0], undefined, ChordType.MINOR, NoteName.A);
    expect(applyCapoToChord(am, 2).name).toBe('Bm');
  });

  it('adds a capo barre at the capo fret across the played (non-muted) strings', () => {
    const capoed = applyCapoToChord(openAMajor(), 2);
    expect(capoed.barre).toBeDefined();
    const capo = capoed.barre![0];
    expect(capo.fret).toBe(2);
    expect(capo.stringStart).toBe(1); // index 0 is muted
    expect(capo.stringEnd).toBe(5);
  });

  it('shifts an existing barre up and keeps it alongside the capo barre', () => {
    // A barre F major shape at fret 1 across all 6 strings.
    const f = new Chord('F', [1, 3, 3, 2, 1, 1], [1, 3, 4, 2, 1, 1], [{ fret: 1, stringStart: 0, stringEnd: 5 }], ChordType.MAJOR, NoteName.F);
    const capoed = applyCapoToChord(f, 2);
    const frets = capoed.barre!.map((b) => b.fret).sort((a, b) => a - b);
    expect(frets).toEqual([2, 3]); // capo barre at 2, original barre shifted 1 → 3
  });
});

describe('capoChordTitle', () => {
  it('formats as "<chord> (capo N · <shape>)"', () => {
    // A C-major chord voiced as a G shape on a capo at fret 5.
    const cChord = new Chord('C', [-1, 3, 2, 0, 1, 0], [0, 3, 2, 0, 1, 0], undefined, ChordType.MAJOR, NoteName.C);
    expect(capoChordTitle(cChord, 5, 'G shape')).toBe('C Major (capo 5 · G shape)');
  });
});

describe('capoBarre', () => {
  it('spans all strings at the capo fret', () => {
    const bar = capoBarre(4, { stringCount: 6 } as any);
    expect(bar).toEqual({ fret: 4, stringStart: 0, stringEnd: 5 });
  });
});

describe('capoVoicing', () => {
  const ctx = {
    library: getChordLibraryForInstrument(InstrumentName.Guitar),
    instrument: InstrumentName.Guitar,
    tuning: STANDARD_TUNING,
  };

  it('keeps the sounding chord and voices C at capo 5 as a clean G shape on the capo', () => {
    const { chord, shapeLabel } = capoVoicing('C', ChordType.MAJOR, 'C', 5, ctx);
    expect(chord.name).toBe('C');           // labelled with the sounding chord
    expect(shapeLabel).toBe('G shape');     // C − 5 semitones = G open shape
    // a single capo bar at fret 5, no stacked barre
    expect(chord.barre).toHaveLength(1);
    expect(chord.barre![0].fret).toBe(5);
    // everything is fretted at/above the capo
    const fretted = chord.strings.filter((f) => f > 0);
    expect(Math.min(...fretted)).toBeGreaterThanOrEqual(5);
  });

  it('always labels with the requested chord and never voices below the capo', () => {
    for (const [root, capo] of [['F', 4], ['A', 7], ['D', 2]] as const) {
      const { chord } = capoVoicing(root, ChordType.MAJOR, root, capo, ctx);
      expect(chord.name).toBe(root);
      const fretted = chord.strings.filter((f) => f > 0);
      if (fretted.length) expect(Math.min(...fretted)).toBeGreaterThanOrEqual(capo);
    }
  });
});
