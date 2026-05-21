// ts/panels/link_types.ts

import { KeyType } from '../fretboard/music_types';
export { KeyType, DiatonicMode } from '../fretboard/music_types';

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
  Chord     = 'Chord',
  Key       = 'Key',
  Groove    = 'Groove',
  Feature   = 'Feature',
  Play = 'Play',
}

export const SIGNAL_KIND_ICON: Record<SignalKind, string> = {
  [SignalKind.Chord]:     '♫',
  [SignalKind.Key]:       '♭',
  [SignalKind.Groove]:    '♩',
  [SignalKind.Feature]:   '◈',
  [SignalKind.Play]: '▶',
};

// ─── Signal state ─────────────────────────────────────────────────────────────
// Signals may represent either the currently-active state or the upcoming one.
// Absence of state implies Current (backward-compatible).
export enum SignalState {
  Current = 'current',
  Next    = 'next',
}

// Base type shared by all signal interfaces.
interface BaseSignal {
  state?: SignalState;
}

// ─── Signal types ─────────────────────────────────────────────────────────────

// A generic chord signal — different targets interpret it differently:
//   MultiLayerFretboard: drives a "Driven" layer's chord tones or scale root note
//   ChordFeature:         drives the displayed chord diagram
// The signal carries enough context for any consumer to use whatever it needs.
export interface ChordSignal extends BaseSignal {
  kind: SignalKind.Chord;
  chordKey: string | null;       // absolute chord_tones_library key e.g. "C_MAJ"
  rootNote: string;              // resolved chord root note e.g. "F"
  keyType: KeyType;              // whether this chord is major or minor
  roman: string | null;          // roman numeral in source's key e.g. "IV", or null for rest
}

// A key signal — carries the progression key (root + scale/mode).
//   ScaleFeature:         drives ScaleName and Root Note
//   MultiLayerFretboard: drives a "driven|scale" layer
export interface KeySignal extends BaseSignal {
  kind: SignalKind.Key;
  rootNote: string;              // e.g. "C"
  scaleKey: string;              // DiatonicMode value, e.g. "MAJOR", "DORIAN", "NATURAL_MINOR"
}

// A groove signal — carries timing context from a metronome or backing track source.
// beat: 0-indexed beat within the current measure, present on every playback tick.
// Driven (target) views that receive a beat tick fire their audio/animations immediately
// and suspend their own timer for the duration of the link.
export interface GrooveSignal extends BaseSignal {
  kind: SignalKind.Groove;
  bpm: number;
  timeSig: { beats: number; division: number };
  swing: number;   // 0.0–1.0; 0 = straight
  beat?: number;   // 0-indexed beat in measure; present during playback ticks
}

// A feature signal — carries a schedule interval's feature identity and config.
//   AnyFeature: renders the specified feature type with the given config.
//   featureTypeName null = rest interval (no feature to display).
export interface FeatureSignal extends BaseSignal {
  kind: SignalKind.Feature;
  categoryName: string;
  featureTypeName: string | null;
  config: ReadonlyArray<string>;
}

// A transport signal — carries play/stop state from a source to linked views.
// Not cached by LinkManager: newly-linked targets should not inherit stale state.
export interface PlaySignal extends BaseSignal {
  kind: SignalKind.Play;
  playing: boolean;
}

export type DriveSignal = ChordSignal | KeySignal | GrooveSignal | FeatureSignal | PlaySignal;
