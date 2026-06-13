// tests/unit/core/config_codec.test.ts
// Round-trip and preset-string assertions for legacyCodec.
// These guard the schedule boundary: wrong positional order silently mis-drives saved schedules.

import { describe, it, expect } from 'vitest';
import { legacyCodec } from '../../../ts/core/config/codec';
import { stringCodec, enumCodec, stringArrayCodec } from '../../../ts/core/config/codecs';
import type { ConfigSpec, DrivenConfig } from '../../../ts/core/config/spec';

// ─── Simple helpers ───────────────────────────────────────────────────────────

function literal<T>(value: T): { mode: 'literal'; value: T } {
  return { mode: 'literal', value };
}
const driven =    { mode: 'driven'     } as const;
const drivenNext = { mode: 'drivenNext' } as const;

// ─── Chord (Root, Type) ───────────────────────────────────────────────────────

interface ChordConfig { root: string; type: string; }

const chordSpec: ConfigSpec<ChordConfig> = {
  root: { label: 'Root', codec: stringCodec, ui: { kind: 'select', options: [] }, defaultValue: 'G' },
  type: { label: 'Type', codec: stringCodec, ui: { kind: 'select', options: [] }, defaultValue: 'Major' },
};
const chordCodec = legacyCodec(chordSpec, ['root', 'type']);

describe('legacyCodec — Chord', () => {
  it('encodes literal values', () => {
    const dc: DrivenConfig<ChordConfig> = { root: literal('G'), type: literal('Major') };
    expect(chordCodec.encode(dc)).toEqual(['G', 'Major']);
  });

  it('encodes driven sentinels (preset: ["driven","driven"])', () => {
    const dc: DrivenConfig<ChordConfig> = { root: driven, type: driven };
    expect(chordCodec.encode(dc)).toEqual(['driven', 'driven']);
  });

  it('encodes driven_next sentinels (preset: ["driven_next","driven_next"])', () => {
    const dc: DrivenConfig<ChordConfig> = { root: drivenNext, type: drivenNext };
    expect(chordCodec.encode(dc)).toEqual(['driven_next', 'driven_next']);
  });

  it('decodes literal preset ["G","Major"]', () => {
    const dc = chordCodec.decode(['G', 'Major']);
    expect(dc.root).toEqual(literal('G'));
    expect(dc.type).toEqual(literal('Major'));
  });

  it('decodes driven preset ["driven","driven"]', () => {
    const dc = chordCodec.decode(['driven', 'driven']);
    expect(dc.root).toEqual(driven);
    expect(dc.type).toEqual(driven);
  });

  it('decodes driven_next preset ["driven_next","driven_next"]', () => {
    const dc = chordCodec.decode(['driven_next', 'driven_next']);
    expect(dc.root).toEqual(drivenNext);
    expect(dc.type).toEqual(drivenNext);
  });

  it('round-trips literal', () => {
    const dc: DrivenConfig<ChordConfig> = { root: literal('Bb'), type: literal('Minor') };
    expect(chordCodec.decode(chordCodec.encode(dc))).toEqual(dc);
  });

  it('round-trips driven', () => {
    const dc: DrivenConfig<ChordConfig> = { root: driven, type: literal('Major') };
    expect(chordCodec.decode(chordCodec.encode(dc))).toEqual(dc);
  });

  it('falls back to defaultValue for short raw array', () => {
    const dc = chordCodec.decode([]);
    expect(dc.root).toEqual(literal('G'));
    expect(dc.type).toEqual(literal('Major'));
  });
});

// ─── Scale (ScaleName, RootNote, variadic HighlightNotes) ────────────────────

interface ScaleConfig { scaleName: string; rootNote: string; highlightNotes: string[]; }

const scaleSpec: ConfigSpec<ScaleConfig> = {
  scaleName:      { label: 'ScaleName',       codec: stringCodec,      ui: { kind: 'select', options: [] }, defaultValue: 'Major' },
  rootNote:       { label: 'Root Note',        codec: stringCodec,      ui: { kind: 'select', options: [] }, defaultValue: 'G' },
  highlightNotes: { label: 'Highlight Notes',  codec: stringArrayCodec, ui: { kind: 'toggleButtons' },       defaultValue: [] },
};
const scaleCodec = legacyCodec(scaleSpec, ['scaleName', 'rootNote', 'highlightNotes'], 'highlightNotes');

describe('legacyCodec — Scale', () => {
  it('encodes preset ["Major","G"] (no highlights)', () => {
    const dc: DrivenConfig<ScaleConfig> = {
      scaleName: literal('Major'), rootNote: literal('G'), highlightNotes: literal([]),
    };
    expect(scaleCodec.encode(dc)).toEqual(['Major', 'G']);
  });

  it('encodes with highlight notes', () => {
    const dc: DrivenConfig<ScaleConfig> = {
      scaleName: literal('Major'), rootNote: literal('G'), highlightNotes: literal(['A', 'B']),
    };
    expect(scaleCodec.encode(dc)).toEqual(['Major', 'G', 'A', 'B']);
  });

  it('decodes preset ["Major","G"]', () => {
    const dc = scaleCodec.decode(['Major', 'G']);
    expect(dc.scaleName).toEqual(literal('Major'));
    expect(dc.rootNote).toEqual(literal('G'));
    expect(dc.highlightNotes).toEqual(literal([]));
  });

  it('decodes highlight notes', () => {
    const dc = scaleCodec.decode(['Major', 'G', 'A', 'B']);
    expect(dc.highlightNotes).toEqual(literal(['A', 'B']));
  });

  it('round-trips literal', () => {
    const dc: DrivenConfig<ScaleConfig> = {
      scaleName: literal('Pentatonic Minor'), rootNote: literal('A'), highlightNotes: literal(['A', 'C', 'E']),
    };
    expect(scaleCodec.decode(scaleCodec.encode(dc))).toEqual(dc);
  });
});

// ─── Triad Shapes (RootNote, Mode) ───────────────────────────────────────────

interface TriadConfig { rootNote: string; mode: string; }

const triadSpec: ConfigSpec<TriadConfig> = {
  rootNote: { label: 'Root Note', codec: stringCodec, ui: { kind: 'select', options: [] }, defaultValue: 'G' },
  mode:     { label: 'Mode',      codec: stringCodec, ui: { kind: 'select', options: [] }, defaultValue: 'Major' },
};
const triadCodec = legacyCodec(triadSpec, ['rootNote', 'mode']);

describe('legacyCodec — Triad Shapes', () => {
  it('encodes/decodes preset ["G","Major"]', () => {
    const dc: DrivenConfig<TriadConfig> = { rootNote: literal('G'), mode: literal('Major') };
    expect(triadCodec.encode(dc)).toEqual(['G', 'Major']);
    expect(triadCodec.decode(['G', 'Major'])).toEqual(dc);
  });

  it('round-trips', () => {
    const dc: DrivenConfig<TriadConfig> = { rootNote: literal('F#'), mode: literal('Minor') };
    expect(triadCodec.decode(triadCodec.encode(dc))).toEqual(dc);
  });
});

// ─── Chord Progression (RootNote, Mode, variadic chords) ─────────────────────

interface ChordProgConfig { rootNote: string; mode: string; chords: string[]; }

const chordProgSpec: ConfigSpec<ChordProgConfig> = {
  rootNote: { label: 'Root Note', codec: stringCodec,      ui: { kind: 'select', options: [] }, defaultValue: 'G' },
  mode:     { label: 'Mode',      codec: stringCodec,      ui: { kind: 'select', options: [] }, defaultValue: 'MAJOR' },
  chords:   { label: 'Chords',    codec: stringArrayCodec, ui: { kind: 'toggleButtons' },        defaultValue: [] },
};
const chordProgCodec = legacyCodec(chordProgSpec, ['rootNote', 'mode', 'chords'], 'chords');

describe('legacyCodec — Chord Progression', () => {
  it('encodes/decodes preset ["G","MAJOR","0","3","4"]', () => {
    const dc: DrivenConfig<ChordProgConfig> = {
      rootNote: literal('G'), mode: literal('MAJOR'), chords: literal(['0', '3', '4']),
    };
    expect(chordProgCodec.encode(dc)).toEqual(['G', 'MAJOR', '0', '3', '4']);
    const decoded = chordProgCodec.decode(['G', 'MAJOR', '0', '3', '4']);
    expect(decoded).toEqual(dc);
  });

  it('round-trips with empty chords', () => {
    const dc: DrivenConfig<ChordProgConfig> = {
      rootNote: literal('A'), mode: literal('MINOR'), chords: literal([]),
    };
    expect(chordProgCodec.decode(chordProgCodec.encode(dc))).toEqual(dc);
  });
});

// ─── MultiLayerFretboard (variadic layers) ───────────────────────────────────
// Each layer string is a pipe-delimited string; the codec treats layers as opaque strings.

interface MultiFretConfig { layers: string[]; }

const multiFretSpec: ConfigSpec<MultiFretConfig> = {
  layers: { label: 'Layers', codec: stringArrayCodec, ui: { kind: 'custom', render: () => ({ getValue: () => [], setValue: () => {} }) }, defaultValue: [] },
};
const multiFretCodec = legacyCodec(multiFretSpec, ['layers'], 'layers');

describe('legacyCodec — MultiLayerFretboard', () => {
  const presetLayers = [
    'chord|driven|var(--dm-palette-2)|none',
    'chord|driven_next|none|var(--dm-palette-4)',
    'scale|driven|driven|var(--dm-palette-3)|none',
  ];

  it('encodes preset layer strings verbatim', () => {
    const dc: DrivenConfig<MultiFretConfig> = { layers: literal(presetLayers) };
    expect(multiFretCodec.encode(dc)).toEqual(presetLayers);
  });

  it('decodes preset layer strings', () => {
    const dc = multiFretCodec.decode(presetLayers);
    expect(dc.layers).toEqual(literal(presetLayers));
  });

  it('round-trips', () => {
    const dc: DrivenConfig<MultiFretConfig> = { layers: literal(presetLayers) };
    expect(multiFretCodec.decode(multiFretCodec.encode(dc))).toEqual(dc);
  });
});

// ─── resolveConfig integration ────────────────────────────────────────────────

import { resolveConfig } from '../../../ts/core/config/resolve';
import { emptyDrivenState } from '../../../ts/core/config/spec';

describe('resolveConfig', () => {
  it('resolves all-literal config', () => {
    const dc: DrivenConfig<ChordConfig> = { root: literal('G'), type: literal('Major') };
    expect(resolveConfig(dc, emptyDrivenState())).toEqual({ root: 'G', type: 'Major' });
  });

  it('returns null when driven field has no cached value', () => {
    const dc: DrivenConfig<ChordConfig> = { root: driven, type: literal('Major') };
    expect(resolveConfig(dc, emptyDrivenState())).toBeNull();
  });

  it('resolves driven field from current cache', () => {
    const dc: DrivenConfig<ChordConfig> = { root: driven, type: literal('Major') };
    const state = emptyDrivenState();
    state.current.set('root', 'Am');
    expect(resolveConfig(dc, state)).toEqual({ root: 'Am', type: 'Major' });
  });

  it('resolves drivenNext field from next cache', () => {
    const dc: DrivenConfig<ChordConfig> = { root: drivenNext, type: literal('Major') };
    const state = emptyDrivenState();
    state.next.set('root', 'Dm');
    expect(resolveConfig(dc, state)).toEqual({ root: 'Dm', type: 'Major' });
  });
});
