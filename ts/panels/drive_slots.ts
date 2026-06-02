// ts/panels/drive_slots.ts
// Concrete drive source/target registrations. Import this file once at app startup
// (reference_main.ts) to wire all signal translations.

import { registerDriveSource, registerDriveTarget } from './drive_registry';
import { SignalKind, SignalState, ChordSignal, KeySignal, GrooveSignal, DriveSignal, FeatureSignal, StrumSignal } from './link_types';
import { KeyType, DiatonicMode, ChordQuality } from '../fretboard/music_types';
import { scales } from '../fretboard/scales';

// Maps DiatonicMode values to the scale display names used by ScaleFeature config.
// scales[mode].name gives the canonical name (e.g. "Minor" for NATURAL_MINOR).
function scaleNameForKey(scaleKey: string): string {
  const scale = (scales as any)[scaleKey];
  return scale?.name ?? 'Major';
}

// Returns true when the tonic of a mode is minor- or diminished-quality.
function tonicIsMinor(scaleKey: string): boolean {
  const scale = (scales as any)[scaleKey];
  if (!scale || typeof scale.getChordQualityAt !== 'function') return false;
  const q: ChordQuality = scale.getChordQualityAt(0);
  return q === ChordQuality.Minor || q === ChordQuality.Diminished;
}

// Derives KeyType (major/minor) from a chord library key suffix (e.g. "G_MAJ" → Major).
function keyTypeFromChordKey(chordKey: string | null): KeyType {
  if (!chordKey) return KeyType.Major;
  const suffix = chordKey.split('_')[1] ?? '';
  return (suffix === 'MAJ' || suffix === 'MAJ7' || suffix === 'DOM7')
    ? KeyType.Major : KeyType.Minor;
}

// Maps scale display names (as stored in ScaleFeature config) to DiatonicMode values.
const SCALE_NAME_TO_MODE: Record<string, DiatonicMode> = {
  'Major':         DiatonicMode.Ionian,
  'Dorian':        DiatonicMode.Dorian,
  'Phrygian':      DiatonicMode.Phrygian,
  'Lydian':        DiatonicMode.Lydian,
  'Mixolydian':    DiatonicMode.Mixolydian,
  'Minor':         DiatonicMode.Aeolian,
  'Natural Minor': DiatonicMode.Aeolian,
  'Locrian':       DiatonicMode.Locrian,
};

// ─── BackingTrackView as source ───────────────────────────────────────────────
// The BackingTrackView dispatches 'backing-track-tick' with:
//   { currentMeasure, currentChordDeg, currentRoman, chordKey, progRootNote, progMode, bpm }

registerDriveSource({
  viewId: 'drum_machine',
  emittedKinds: [SignalKind.Chord, SignalKind.Key, SignalKind.Groove, SignalKind.Play],
  emitsNextSignals: true,
  extractSignals(detail: any): DriveSignal[] {
    const roman: string | null = detail?.currentRoman ?? null;
    const root: string         = detail?.progRootNote ?? 'C';
    const progMode: DiatonicMode = detail?.progMode ?? DiatonicMode.Ionian;
    const chordKey: string | null = detail?.chordKey ?? null;

    const chordRoot    = chordKey ? (chordKey.split('_')[0] ?? root) : root;
    const chordKeyType = keyTypeFromChordKey(chordKey);

    const chordSignal: ChordSignal = {
      kind: SignalKind.Chord,
      state: SignalState.Current,
      chordKey,
      rootNote: chordRoot,
      keyType: chordKeyType,
      roman,
    };
    const keySignal: KeySignal = {
      kind: SignalKind.Key,
      rootNote: root,
      scaleKey: progMode,
    };
    const signals: DriveSignal[] = [chordSignal, keySignal];
    if (typeof detail?.bpm === 'number') {
      const grooveSignal: GrooveSignal = {
        kind: SignalKind.Groove,
        bpm: detail.bpm,
        timeSig: detail?.timeSig ?? { beats: 4, division: 4 },
        swing: detail?.swing ?? 0,
        beat: typeof detail?.beat === 'number' ? detail.beat : undefined,
      };
      signals.push(grooveSignal);
    }
    // Next-measure chord signal (if available)
    const nextChordKey: string | null = detail?.nextChordKey ?? null;
    const nextRootNote: string | null = detail?.nextRootNote ?? null;
    const nextRoman: string | null    = detail?.nextRoman ?? null;
    if (nextChordKey !== null || nextRootNote !== null) {
      const nextChordSignal: ChordSignal = {
        kind: SignalKind.Chord,
        state: SignalState.Next,
        chordKey: nextChordKey,
        rootNote: nextRootNote ?? root,
        keyType: keyTypeFromChordKey(nextChordKey),
        roman: nextRoman,
      };
      signals.push(nextChordSignal);
    }
    return signals;
  },
});

// ─── MultiLayerFretboard as source ──────────────────────────────────────────
// When the fretboard's config changes, emit one ChordSignal per chord layer.

function extractMultiFretSignals(detail: any): ChordSignal[] {
  const config: string[] = detail?.config ?? [];
  const signals: ChordSignal[] = [];
  for (const layerStr of config) {
    const parts = layerStr.split('|');
    if (parts[0] === 'chord' && parts.length >= 3) {
      const chordKey = parts[1] || null;
      signals.push({
        kind: SignalKind.Chord,
        chordKey,
        rootNote: chordKey?.split('_')[0] ?? '',
        keyType: chordKey?.endsWith('MIN') || chordKey?.endsWith('MIN7') ? KeyType.Minor : KeyType.Major,
        roman: null,
      });
    }
  }
  return signals;
}

registerDriveSource({
  viewId: 'configurable_instrument_feature',
  featureTypeName: 'MultiLayerFretboard',
  emittedKinds: [SignalKind.Chord],
  extractSignals: extractMultiFretSignals,
});

registerDriveSource({
  viewId: 'instrument_multifret',
  featureTypeName: 'MultiLayerFretboard',
  emittedKinds: [SignalKind.Chord],
  extractSignals: extractMultiFretSignals,
});

// ─── ScaleFeature as source ──────────────────────────────────────────────────
// Emits ChordSignal (for drone/chord targets) and KeySignal (for mode-aware targets).

function extractScaleSignals(detail: any): DriveSignal[] {
  const config: string[] = detail?.config ?? [];
  const rootNote: string = config[1] ?? 'C';
  const scaleName: string = config[0] ?? 'Major';
  const scaleKey: DiatonicMode = SCALE_NAME_TO_MODE[scaleName] ?? DiatonicMode.Ionian;
  const keyType: KeyType = tonicIsMinor(scaleKey) ? KeyType.Minor : KeyType.Major;
  return [
    { kind: SignalKind.Chord, chordKey: null, rootNote, keyType, roman: null },
    { kind: SignalKind.Key, rootNote, scaleKey },
  ];
}

registerDriveSource({
  viewId: 'configurable_instrument_feature',
  featureTypeName: 'Scale',
  emittedKinds: [SignalKind.Chord, SignalKind.Key],
  extractSignals: extractScaleSignals,
});

registerDriveSource({
  viewId: 'instrument_scale',
  featureTypeName: 'Scale',
  emittedKinds: [SignalKind.Chord, SignalKind.Key],
  extractSignals: extractScaleSignals,
});

// ─── ChordFeature as target ───────────────────────────────────────────────────

registerDriveTarget({
  featureTypeName: 'Chord',
  argName: 'Root',
  label: 'Root note (from linked source)',
  acceptedKinds: [SignalKind.Chord],
  resolveValue(signal: DriveSignal): string | null {
    if (signal.kind !== SignalKind.Chord) return null;
    return signal.rootNote || null;
  },
});

registerDriveTarget({
  featureTypeName: 'Chord',
  argName: 'Type',
  label: 'Chord type (from linked source)',
  acceptedKinds: [SignalKind.Chord],
  resolveValue(signal: DriveSignal): string | null {
    if (signal.kind !== SignalKind.Chord) return null;
    if (signal.chordKey) {
      const sep = signal.chordKey.indexOf('_');
      if (sep !== -1) {
        const suffix = signal.chordKey.slice(sep + 1);
        const suffixMap: Record<string, string> = {
          MAJ: 'Major', MIN: 'Minor', DIM: 'Dim', DOM7: '7', MAJ7: 'Maj7', MIN7: 'Min7',
        };
        const resolved = suffixMap[suffix];
        if (resolved) return resolved;
      }
    }
    return signal.keyType === 'Major' ? 'Major' : 'Minor';
  },
});

// ─── MultiLayerFretboard as target ──────────────────────────────────────────

registerDriveTarget({
  featureTypeName: 'MultiLayerFretboard',
  argName: 'Layers',
  label: 'Driven layer (from linked source)',
  acceptedKinds: [SignalKind.Chord, SignalKind.Key],
  resolveValue(_signal: DriveSignal): string | null {
    return null;
  },
});

// ─── ScaleFeature as target ───────────────────────────────────────────────────
// KeySignal maps scaleKey → scale display name; ChordSignal falls back to Major/Minor.

registerDriveTarget({
  featureTypeName: 'Scale',
  argName: 'ScaleName',
  label: 'Scale name (from linked source)',
  acceptedKinds: [SignalKind.Key, SignalKind.Chord],
  resolveValue(signal: DriveSignal): string | null {
    if (signal.kind === SignalKind.Key) return scaleNameForKey(signal.scaleKey);
    if (signal.kind === SignalKind.Chord) {
      return signal.keyType === KeyType.Major ? 'Major' : 'Natural Minor';
    }
    return null;
  },
});

registerDriveTarget({
  featureTypeName: 'Scale',
  argName: 'Root Note',
  label: 'Root note (from linked source)',
  acceptedKinds: [SignalKind.Key, SignalKind.Chord],
  resolveValue(signal: DriveSignal): string | null {
    if (signal.kind !== SignalKind.Chord && signal.kind !== SignalKind.Key) return null;
    return signal.rootNote;
  },
});

// ─── TriadFeature as target ───────────────────────────────────────────────────

registerDriveTarget({
  featureTypeName: 'Triad Shapes',
  argName: 'Root Note',
  label: 'Root note (from linked source)',
  acceptedKinds: [SignalKind.Chord, SignalKind.Key],
  resolveValue(signal: DriveSignal): string | null {
    if (signal.kind !== SignalKind.Chord && signal.kind !== SignalKind.Key) return null;
    return signal.rootNote || null;
  },
});

registerDriveTarget({
  featureTypeName: 'Triad Shapes',
  argName: 'Qualities',
  label: 'Quality (from linked key source)',
  acceptedKinds: [SignalKind.Key, SignalKind.Chord],
  transparent: true,
  resolveValue(signal: DriveSignal): string | null {
    if (signal.kind === SignalKind.Key) return tonicIsMinor(signal.scaleKey) ? 'Minor' : 'Major';
    if (signal.kind === SignalKind.Chord) return signal.keyType === KeyType.Major ? 'Major' : 'Minor';
    return null;
  },
});

// ─── ChordProgressionFeature as target ───────────────────────────────────────
// Only KeySignals drive config rebuilds; ChordSignals flow through to the feature's
// own chordSignalHandler for active-chord highlighting without triggering a rebuild.
// Accepting ChordSignals here caused the feature to rebuild on every chord change
// (using the chord's own root, not the progression root), breaking non-tonic highlights.

registerDriveTarget({
  featureTypeName: 'Chord Progression',
  argName: 'Root Note',
  label: 'Root note (from linked source)',
  acceptedKinds: [SignalKind.Key],
  resolveValue(signal: DriveSignal): string | null {
    if (signal.kind !== SignalKind.Key) return null;
    return signal.rootNote || null;
  },
});

registerDriveTarget({
  featureTypeName: 'Chord Progression',
  argName: 'Mode',
  label: 'Mode (from linked source)',
  acceptedKinds: [SignalKind.Key],
  resolveValue(signal: DriveSignal): string | null {
    if (signal.kind !== SignalKind.Key) return null;
    return signal.scaleKey;
  },
});

// ─── NotesFeature as target ───────────────────────────────────────────────────

registerDriveTarget({
  featureTypeName: 'Notes',
  argName: 'Root Note',
  label: 'Root note (from linked source)',
  acceptedKinds: [SignalKind.Chord, SignalKind.Key],
  resolveValue(signal: DriveSignal): string | null {
    if (signal.kind !== SignalKind.Chord && signal.kind !== SignalKind.Key) return null;
    return signal.rootNote || null;
  },
});

// ─── CagedFeature as target ───────────────────────────────────────────────────

registerDriveTarget({
  featureTypeName: 'CAGED',
  argName: 'Root Note',
  label: 'Root note (from linked source)',
  acceptedKinds: [SignalKind.Chord, SignalKind.Key],
  resolveValue(signal: DriveSignal): string | null {
    if (signal.kind !== SignalKind.Chord && signal.kind !== SignalKind.Key) return null;
    return signal.rootNote || null;
  },
});

registerDriveTarget({
  featureTypeName: 'CAGED',
  argName: 'Scale Type',
  label: 'Scale type (from linked key source)',
  acceptedKinds: [SignalKind.Key],
  resolveValue(signal: DriveSignal): string | null {
    if (signal.kind !== SignalKind.Key) return null;
    return tonicIsMinor(signal.scaleKey) ? 'Minor' : 'Major';
  },
});

// ─── Metronome as groove source ───────────────────────────────────────────────

registerDriveSource({
  viewId: 'instrument_floating_metronome',
  emittedKinds: [SignalKind.Groove, SignalKind.Play],
  extractSignals(detail: any): DriveSignal[] {
    if (typeof detail?.bpm !== 'number') return [];
    const grooveSignal: GrooveSignal = {
      kind: SignalKind.Groove,
      bpm: detail.bpm,
      timeSig: detail?.timeSig ?? { beats: 4, division: 4 },
      swing: detail?.swing ?? 0,
      beat: typeof detail?.beat === 'number' ? detail.beat : undefined,
    };
    return [grooveSignal];
  },
});

// ─── DroneView as source ──────────────────────────────────────────────────────

registerDriveSource({
  viewId: 'drone_view',
  emittedKinds: [SignalKind.Play],
  extractSignals(_detail: any): DriveSignal[] { return []; },
});

// ─── DroneView as target ──────────────────────────────────────────────────────

registerDriveTarget({
  featureTypeName: 'Drone',
  viewId: 'drone_view',
  argName: 'Note',
  label: 'Root note (from linked source)',
  acceptedKinds: [SignalKind.Chord],
  resolveValue(_signal: DriveSignal): string | null {
    return null;
  },
});

registerDriveTarget({
  featureTypeName: 'Drone',
  viewId: 'drone_view',
  argName: 'Play',
  label: 'Play/stop (from linked source)',
  acceptedKinds: [SignalKind.Play],
  resolveValue(_signal: DriveSignal): string | null { return null; },
});

registerDriveTarget({
  featureTypeName: 'Drone',
  viewId: 'drone_view',
  argName: 'Strum',
  label: 'Strum rhythm (from linked source)',
  acceptedKinds: [SignalKind.Strum],
  resolveValue(_signal: DriveSignal): string | null { return null; },
});

// ─── BackingTrackView as groove/play target ───────────────────────────────────

registerDriveTarget({
  featureTypeName: 'BackingTrack',
  viewId: 'drum_machine',
  argName: 'BPM',
  label: 'BPM (from linked groove source)',
  acceptedKinds: [SignalKind.Groove],
  resolveValue(_signal: DriveSignal): string | null {
    return null;
  },
});

registerDriveTarget({
  featureTypeName: 'BackingTrack',
  viewId: 'drum_machine',
  argName: 'Play',
  label: 'Play/stop (from linked source)',
  acceptedKinds: [SignalKind.Play],
  resolveValue(_signal: DriveSignal): string | null { return null; },
});

registerDriveTarget({
  featureTypeName: 'BackingTrack',
  viewId: 'drum_machine',
  argName: 'Strum',
  label: 'Strum rhythm (from linked source)',
  acceptedKinds: [SignalKind.Strum],
  resolveValue(_signal: DriveSignal): string | null { return null; },
});

// ─── MetronomeView as groove/play target ─────────────────────────────────────

registerDriveTarget({
  featureTypeName: 'Metronome',
  viewId: 'instrument_floating_metronome',
  argName: 'BPM',
  label: 'BPM (from linked groove source)',
  acceptedKinds: [SignalKind.Groove],
  resolveValue(_signal: DriveSignal): string | null {
    return null;
  },
});

registerDriveTarget({
  featureTypeName: 'Metronome',
  viewId: 'instrument_floating_metronome',
  argName: 'Play',
  label: 'Play/stop (from linked source)',
  acceptedKinds: [SignalKind.Play],
  resolveValue(_signal: DriveSignal): string | null { return null; },
});

// ─── StrumView as groove + strum source ──────────────────────────────────────
// The StrumView dispatches 'metronome-tempo-changed' on BPM/timeSig config changes
// (picked up by the existing link_manager listener) and 'strum-tick' on each step
// (picked up by the strum-tick listener added below).

registerDriveSource({
  viewId: 'strum_view',
  emittedKinds: [SignalKind.Groove, SignalKind.Strum, SignalKind.Play],
  extractSignals(detail: any): DriveSignal[] {
    if (typeof detail?.bpm !== 'number') return [];
    const grooveSignal: GrooveSignal = {
      kind: SignalKind.Groove,
      bpm: detail.bpm,
      timeSig: detail?.timeSig ?? { beats: 4, division: 4 },
      swing: detail?.swing ?? 0,
      beat: typeof detail?.beat === 'number' ? detail.beat : undefined,
    };
    return [grooveSignal];
  },
});

// ─── StrumView as groove target ───────────────────────────────────────────────

registerDriveTarget({
  featureTypeName: 'Strum',
  viewId: 'strum_view',
  argName: 'BPM',
  label: 'BPM (from linked groove source)',
  acceptedKinds: [SignalKind.Groove],
  resolveValue(_signal: DriveSignal): string | null {
    return null;
  },
});

registerDriveTarget({
  featureTypeName: 'Strum',
  viewId: 'strum_view',
  argName: 'Play',
  label: 'Play/stop (from linked source)',
  acceptedKinds: [SignalKind.Play],
  resolveValue(_signal: DriveSignal): string | null {
    return null;
  },
});

// ─── TimerView as play source/target ─────────────────────────────────────────

registerDriveSource({
  viewId: 'floating_timer',
  emittedKinds: [SignalKind.Play],
  extractSignals(_detail: any): DriveSignal[] { return []; },
});

registerDriveTarget({
  featureTypeName: 'Timer',
  viewId: 'floating_timer',
  argName: 'Play',
  label: 'Play/stop (from linked source)',
  acceptedKinds: [SignalKind.Play],
  resolveValue(_signal: DriveSignal): string | null { return null; },
});

// ─── ScheduleFloatingView as source ───────────────────────────────────────────

registerDriveSource({
  viewId: 'schedule_floating_view',
  emittedKinds: [SignalKind.Feature],
  emitsNextSignals: true,
  extractSignals(detail: any): DriveSignal[] {
    const signal: FeatureSignal = {
      kind: SignalKind.Feature,
      state: detail?.state,   // preserves Current / Next set by ScheduleDisplayAdapter
      categoryName: detail?.categoryName ?? '',
      featureTypeName: detail?.featureTypeName ?? null,
      config: Array.isArray(detail?.config) ? [...detail.config] : [],
    };
    return [signal];
  },
});

// ─── AnyFeature as target ─────────────────────────────────────────────────────
// AnyFeature renders inside a ConfigurableFeatureView and handles FeatureSignals
// directly via its own drive-signal listener. The slot declaration here is only
// for arrow-tooltip display (◈ icon); resolveValue always returns null so
// ConfigurableFeatureView does not try to drive the State arg via the config system.

registerDriveTarget({
  featureTypeName: 'AnyFeature',
  viewId: 'any_feature',
  argName: '_feature',     // non-existent arg — keeps ConfigurableFeatureView from injecting "Driven"
  label: 'Feature',
  acceptedKinds: [SignalKind.Feature],
  resolveValue(_signal: DriveSignal): string | null { return null; },
});

// ─── GlobalKeyView as source ──────────────────────────────────────────────────
// Dispatches 'cof-key-selected' on mount and on every root/mode change.
// Broadcasts to ALL panels via LinkManager's global-source mechanism.

registerDriveSource({
  viewId: 'global_key',
  emittedKinds: [SignalKind.Key, SignalKind.Chord],
  extractSignals(detail: any): DriveSignal[] {
    const rootNote: string = detail?.root ?? 'C';
    const scaleKey: DiatonicMode = detail?.mode ?? DiatonicMode.Ionian;
    const keySignal: KeySignal = { kind: SignalKind.Key, rootNote, scaleKey };
    const chordSignal: ChordSignal = {
      kind: SignalKind.Chord,
      chordKey: null,
      rootNote,
      keyType: tonicIsMinor(scaleKey) ? KeyType.Minor : KeyType.Major,
      roman: null,
    };
    return [keySignal, chordSignal];
  },
});

// ─── CircleOfFifthsView as source ─────────────────────────────────────────────
// Dispatches 'cof-key-selected' when the user clicks a key wedge or chord chip.
// Signal 0 = KeySignal (always); Signal 1 = ChordSignal (always, chordKey null when no chord selected).

registerDriveSource({
  viewId: 'circle_of_fifths',
  emittedKinds: [SignalKind.Key, SignalKind.Chord],
  extractSignals(detail: any): DriveSignal[] {
    const keySignal: KeySignal = {
      kind:      SignalKind.Key,
      rootNote:  detail?.root ?? 'C',
      scaleKey:  detail?.mode ?? DiatonicMode.Ionian,
    };
    const chordSignal: ChordSignal = {
      kind:      SignalKind.Chord,
      chordKey:  detail?.chordKey ?? null,
      rootNote:  detail?.chordRoot ?? detail?.root ?? 'C',
      keyType:   detail?.keyType ?? KeyType.Major,
      roman:     detail?.roman ?? null,
    };
    return [keySignal, chordSignal];
  },
});

// ─── NearbyTriadsFeature as target ────────────────────────────────────────────
// Root Note and Mode are driven via config recreation (same as Scale/ChordProgression).
// Only KeySignals drive config rebuilds; ChordSignals flow through to the feature's
// own keySignalHandler for active-chord highlighting without triggering a rebuild.
// Accepting ChordSignals here caused the feature to rebuild on every chord change
// (using the chord's root, not the prog root), wiping highlights on non-tonic chords.

registerDriveTarget({
  featureTypeName: 'Nearby Triads',
  argName: 'Root Note',
  label: 'Root note (from linked source)',
  acceptedKinds: [SignalKind.Key],
  resolveValue(signal: DriveSignal): string | null {
    if (signal.kind !== SignalKind.Key) return null;
    return signal.rootNote || null;
  },
});

registerDriveTarget({
  featureTypeName: 'Nearby Triads',
  argName: 'Mode',
  label: 'Mode (from linked source)',
  acceptedKinds: [SignalKind.Key],
  resolveValue(signal: DriveSignal): string | null {
    if (signal.kind !== SignalKind.Key) return null;
    return signal.scaleKey;
  },
});

// ─── ArpeggioFeature as target ────────────────────────────────────────────────

registerDriveTarget({
  featureTypeName: 'Arpeggio',
  argName: 'Root Note',
  label: 'Root note (from linked source)',
  acceptedKinds: [SignalKind.Chord],
  resolveValue(signal: DriveSignal): string | null {
    if (signal.kind !== SignalKind.Chord) return null;
    return signal.rootNote || null;
  },
});

registerDriveTarget({
  featureTypeName: 'Arpeggio',
  argName: 'Quality',
  label: 'Quality (from linked source)',
  acceptedKinds: [SignalKind.Chord],
  resolveValue(signal: DriveSignal): string | null {
    if (signal.kind !== SignalKind.Chord || !signal.chordKey) return null;
    const suffix = signal.chordKey.slice(signal.chordKey.indexOf('_') + 1);
    const suffixMap: Record<string, string> = {
      MAJ: 'Major', MIN: 'Minor', DOM7: 'Dom 7',
      MAJ7: 'Maj 7', MIN7: 'Min 7', DIM: 'Dim', AUG: 'Aug',
    };
    return suffixMap[suffix] ?? null;
  },
});

// ─── CircleOfFifthsView as target ─────────────────────────────────────────────
// The view handles drive-signal directly; resolveValue is unused but required
// so the view appears as a valid link target with the correct accepted kinds.

registerDriveTarget({
  featureTypeName: 'CircleOfFifths',
  viewId: 'circle_of_fifths',
  argName: '_key',
  label: 'Key (from linked source)',
  acceptedKinds: [SignalKind.Key, SignalKind.Chord],
  resolveValue(_signal: DriveSignal): string | null { return null; },
});
