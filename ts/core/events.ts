// ts/core/events.ts
// Typed CustomEvent helpers.  All custom events in the app are catalogued here.
//
// Usage:
//   emitEvent(el, 'groove-tick', { bpm: 120, timeSig: {beats:4,division:4}, swing: 0, beat: 0 });
//   const unlisten = onEvent(el, 'groove-tick', (detail) => { ... });

import { DriveSignal, FeatureSignal, StrumAction, DiatonicMode, KeyType, SignalKind } from '../panels/link_types';

// ─── Per-view state shapes ────────────────────────────────────────────────────
// feature-state-changed carries whatever the emitting view persists as its
// view-state blob.  Different views emit different shapes; we use a
// discriminated union at the module level and let consumers narrow as needed.

export interface FeatureStateChangedDetail {
  // ConfigurableFeatureView — config-collapsed save
  configCollapsed?: boolean;
  // ConfigurableFeatureView — feature change (links)
  featureTypeName?: string;
  config?: ReadonlyArray<string>;
  // TimerView
  duration?: number;
  focusSeconds?: number;
  restSeconds?: number;
  rounds?: number;
  countIn?: 0 | 3 | 5;
  chime?: boolean;
  // StrumView (carries _v:1 sentinel)
  _v?: 1;
  // DroneView
  note?: string;
  octave?: number;
  chordMode?: string;
  envelope?: string;
  // GlobalKeyView
  rootNote?: string;
  scaleKey?: string;
  // CircleOfFifthsView (DiatonicMode) — also reused by TimerView ('simple' | 'intervals' | 'stopwatch')
  root?: string;
  mode?: DiatonicMode | "simple" | "intervals" | "stopwatch";
  // BackingTrackView / ScheduleFloatingView — open-ended blobs
  [key: string]: unknown;
}

// ─── AppEventMap ─────────────────────────────────────────────────────────────

export interface AppEventMap {
  // ── Transport / timing ──────────────────────────────────────────────────────

  'backing-track-tick': {
    currentMeasure: number;
    currentChordDeg: number | null;
    currentRoman: string | null;
    chordKey: string | null;
    progRootNote: string;
    progMode: string;
    bpm: number;
    timeSig: { beats: number; division: number };
    swing: number;
    beat: number;
    nextChordKey: string | null;
    nextRootNote: string | null;
    nextRoman: string | null;
  };

  'groove-tick': {
    bpm: number;
    timeSig: { beats: number; division: number };
    swing: number;
    beat: number;
  };

  'metronome-tempo-changed': {
    bpm: number;
    timeSig: { beats: number; division: number };
    swing: number;
  };

  'strum-tick': {
    action: StrumAction;
    direction: 'down' | 'up';
    bpm: number;
    timeSig: { beats: number; division: number };
    step: number;
    totalSteps: number;
  };

  'transport-changed': {
    playing: boolean;
  };

  // ── Key / chord selection ───────────────────────────────────────────────────

  'cof-key-selected': {
    root: string;
    mode: DiatonicMode;
    chordKey?: string | null;
    chordRoot?: string | null;
    roman?: string | null;
    keyType?: KeyType | null;
  };

  'nt-chord-keys-update': {
    chordKeys: string[];
  };

  /** Emitted by the Capo view when its capo fret changes (0 = no capo). */
  'capo-changed': {
    fret: number;
  };

  // ── Feature state ───────────────────────────────────────────────────────────

  'feature-state-changed': FeatureStateChangedDetail;

  'feature-title-changed': {
    title: string;
  };

  // ── Link system ─────────────────────────────────────────────────────────────

  'drive-signal': {
    signal: DriveSignal;
    linkId: string;
  };

  'feature-signal-relay': {
    featureTypeName: string;
    signal: DriveSignal;
  };

  'schedule-feature-changed': FeatureSignal;

  'link-status-changed': {
    hasIncomingLinks: boolean;
    hasNextSignals?: boolean;
    /** Union of SignalKinds carried by the incoming links. Lets a target react to
     *  the *kind* of drive it has (e.g. a Drone arming for strum articulation)
     *  before any signal actually arrives. */
    incomingKinds?: SignalKind[];
  };

  // ── UI sizing ───────────────────────────────────────────────────────────────

  'wrapper-user-resized': {
    width: number;
    height: number;
  };

  'config-collapse-changed': {
    collapsed: boolean;
    isInitial: boolean;
    delta?: number;
  };

  /** Fires with empty detail when a feature first renders into a previously empty wrapper. */
  'feature-auto-size': Record<string, never>;

  /** Fires with empty detail to request the feature config panel toggle. */
  'config-visibility-toggle': Record<string, never>;

  // ── Schedule editor internal ─────────────────────────────────────────────────
  'group-add-interval': {
    groupEl: HTMLElement;
  };
}

// ─── Typed helpers ────────────────────────────────────────────────────────────

/**
 * Dispatch a typed CustomEvent.  The caller provides the fully-typed detail;
 * no cast required at the call site.
 */
export function emitEvent<K extends keyof AppEventMap>(
  target: EventTarget,
  type: K,
  detail: AppEventMap[K],
  opts: { bubbles?: boolean } = {}
): void {
  target.dispatchEvent(
    new CustomEvent(type, { bubbles: opts.bubbles ?? true, detail })
  );
}

/**
 * Register a typed listener for a custom event.
 * Returns an unsubscribe function that removes the listener.
 */
export function onEvent<K extends keyof AppEventMap>(
  target: EventTarget,
  type: K,
  fn: (detail: AppEventMap[K], ev: CustomEvent<AppEventMap[K]>) => void
): () => void {
  const handler = (ev: Event) => {
    fn((ev as CustomEvent<AppEventMap[K]>).detail, ev as CustomEvent<AppEventMap[K]>);
  };
  target.addEventListener(type, handler);
  return () => target.removeEventListener(type, handler);
}
