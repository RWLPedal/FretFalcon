// ts/panels/link_types.ts

import { KeyType } from '../music/music_types';
export { KeyType, DiatonicMode } from '../music/music_types';

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
  Play      = 'Play',
  Strum     = 'Strum',
  Capo      = 'Capo',
}

export const SIGNAL_KIND_ICON: Record<SignalKind, string> = {
  [SignalKind.Chord]:     '♫',
  [SignalKind.Key]:       '♭',
  [SignalKind.Groove]:    '♩',
  [SignalKind.Feature]:   '◈',
  [SignalKind.Play]:      '▶',
  [SignalKind.Strum]:     '♾',
  [SignalKind.Capo]:      '⇪',
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

// Strum action string union — mirrors StrokeAction enum values in strum_types.ts.
export type StrumAction = 'rest' | 'stroke' | 'accent' | 'chuck' | 'air';

// A per-step strum signal emitted by StrumView on each tick.
// Carries the stroke action, direction, and timing context so consumers can produce
// direction-appropriate audio (warm pluck on down, bright on up, muted on chuck).
// Not cached by LinkManager: real-time per-step, like groove beat ticks.
export interface StrumSignal extends BaseSignal {
  kind: SignalKind.Strum;
  action: StrumAction;
  direction: 'down' | 'up';
  bpm: number;
  timeSig: { beats: number; division: number };
  step: number;       // 0-indexed step within the pattern
  totalSteps: number;
}

// A capo signal — carries a capo fret position (0 = no capo) from a Capo source.
// Different fretboard targets interpret it differently:
//   Chord / ChordProgression: transpose the displayed chord(s) up by `fret` and draw a capo barre.
//   Scale / Arpeggio / Triad / MultiLayerFretboard: hide notes below `fret` and draw a capo barre (no transposition).
export interface CapoSignal extends BaseSignal {
  kind: SignalKind.Capo;
  fret: number;                  // 0-indexed capo fret; 0 = no capo
}

export type DriveSignal = ChordSignal | KeySignal | GrooveSignal | FeatureSignal | PlaySignal | StrumSignal | CapoSignal;

// ─── SignalSink ───────────────────────────────────────────────────────────────
// Views that implement this interface receive drive signals via direct method
// calls from LinkManager instead of DOM events. Register via
// FloatingViewManager.registerSink(instanceId, sink).

export interface SignalSink {
  receiveSignals(
    signals: DriveSignal[],
    meta: { sourceInstanceId: string; linkId: string | null },
  ): void;
  setLinkStatus?(status: {
    hasIncomingLinks: boolean;
    hasNextSignals?: boolean;
    /**
     * The SignalKinds actually carried by incoming links (union of linked sources'
     * emittedKinds). Targets use this to only auto-follow drivable fields that a link
     * really drives — e.g. a Capo-only link must not flip a Root/Mode field to "driven".
     */
    incomingKinds?: SignalKind[];
  }): void;
}

