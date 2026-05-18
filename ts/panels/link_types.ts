// ts/floating_views/link_types.ts

import { KeyType } from '../instrument/music_types';
export { KeyType } from '../instrument/music_types';

export type HandleSide = 'top' | 'bottom' | 'left' | 'right';

export interface LinkRecord {
  id: string;
  sourceInstanceId: string;
  sourceHandle: HandleSide;
  targetInstanceId: string;
  targetHandle: HandleSide;
}

// ─── Signal kinds ─────────────────────────────────────────────────────────────
// Extend this enum to add new signal categories.
export enum SignalKind {
  Chord   = 'Chord',
  Key     = 'Key',
  Tempo   = 'Tempo',
  Feature = 'Feature',
}

// A generic chord signal — different targets interpret it differently:
//   MultiSelectFretboard: drives a "Driven" layer's chord tones or scale root note
//   ChordFeature:         drives the displayed chord diagram
// The signal carries enough context for any consumer to use whatever it needs.
export interface ChordSignal {
  kind: SignalKind.Chord;
  chordKey: string | null;       // absolute chord_tones_library key e.g. "C_MAJ"
  rootNote: string;              // resolved chord root note e.g. "F"
  keyType: KeyType;              // whether this chord is major or minor
  roman: string | null;          // roman numeral in source's key e.g. "IV", or null for rest
}

// A key signal — carries the progression key (root + modality).
//   ScaleFeature:         drives ScaleName and Root Note
//   MultiSelectFretboard: drives a "driven|scale" layer
export interface KeySignal {
  kind: SignalKind.Key;
  rootNote: string;              // e.g. "C"
  keyType: KeyType;              // e.g. "Major"
}

// A tempo signal — carries a BPM value from a metronome or backing track source.
export interface TempoSignal {
  kind: SignalKind.Tempo;
  bpm: number;
}

// A feature signal — carries a schedule interval's feature identity and config.
//   AnyFloatingView: renders the specified feature type with the given config.
//   featureTypeName null = rest interval (no feature to display).
export interface FeatureSignal {
  kind: SignalKind.Feature;
  categoryName: string;
  featureTypeName: string | null;
  config: ReadonlyArray<string>;
}

export type DriveSignal = ChordSignal | KeySignal | TempoSignal | FeatureSignal;
