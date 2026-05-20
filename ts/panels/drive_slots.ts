// ts/panels/drive_slots.ts
// Concrete drive source/target registrations. Import this file once at app startup
// (reference_main.ts) to wire all signal translations.

import { registerDriveSource, registerDriveTarget } from './drive_registry';
import { SignalKind, ChordSignal, KeySignal, GrooveSignal, DriveSignal, FeatureSignal } from './link_types';
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
  extractSignals(detail: any): DriveSignal[] {
    const roman: string | null = detail?.currentRoman ?? null;
    const root: string         = detail?.progRootNote ?? 'C';
    const progMode: DiatonicMode = detail?.progMode ?? DiatonicMode.Ionian;
    const chordKey: string | null = detail?.chordKey ?? null;

    const chordRoot    = chordKey ? (chordKey.split('_')[0] ?? root) : root;
    const chordKeyType = keyTypeFromChordKey(chordKey);

    const chordSignal: ChordSignal = {
      kind: SignalKind.Chord,
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
    return signals;
  },
});

// ─── MultiLayerFretboard as source ──────────────────────────────────────────
// When the fretboard's config changes, emit one ChordSignal per chord layer.

registerDriveSource({
  viewId: 'configurable_instrument_feature',
  featureTypeName: 'MultiLayerFretboard',
  emittedKinds: [SignalKind.Chord],
  extractSignals(detail: any): ChordSignal[] {
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
  },
});

// ─── ScaleFeature as source ──────────────────────────────────────────────────
// Emits ChordSignal (for drone/chord targets) and KeySignal (for mode-aware targets).

registerDriveSource({
  viewId: 'configurable_instrument_feature',
  featureTypeName: 'Scale',
  emittedKinds: [SignalKind.Chord, SignalKind.Key],
  extractSignals(detail: any): DriveSignal[] {
    const config: string[] = detail?.config ?? [];
    const rootNote: string = config[1] ?? 'C';
    const scaleName: string = config[0] ?? 'Major';
    const scaleKey: DiatonicMode = SCALE_NAME_TO_MODE[scaleName] ?? DiatonicMode.Ionian;
    const keyType: KeyType = tonicIsMinor(scaleKey) ? KeyType.Minor : KeyType.Major;
    return [
      { kind: SignalKind.Chord, chordKey: null, rootNote, keyType, roman: null },
      { kind: SignalKind.Key, rootNote, scaleKey },
    ];
  },
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
          MAJ: 'Major', MIN: 'Minor', DOM7: '7', MAJ7: 'Maj7', MIN7: 'Min7',
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
// KeySignal drives Root Note and Mode; ChordSignal drives Root Note only.

registerDriveTarget({
  featureTypeName: 'Chord Progression',
  argName: 'Root Note',
  label: 'Root note (from linked source)',
  acceptedKinds: [SignalKind.Key, SignalKind.Chord],
  resolveValue(signal: DriveSignal): string | null {
    if (signal.kind !== SignalKind.Key && signal.kind !== SignalKind.Chord) return null;
    return signal.rootNote || null;
  },
});

registerDriveTarget({
  featureTypeName: 'Chord Progression',
  argName: 'Mode',
  label: 'Mode (from linked source)',
  acceptedKinds: [SignalKind.Key, SignalKind.Chord],
  resolveValue(signal: DriveSignal): string | null {
    if (signal.kind === SignalKind.Key) return signal.scaleKey;
    if (signal.kind === SignalKind.Chord) {
      return signal.keyType === KeyType.Major ? DiatonicMode.Ionian : DiatonicMode.Aeolian;
    }
    return null;
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

// ─── StrumView as groove source ──────────────────────────────────────────────
// The StrumView dispatches 'metronome-tempo-changed' on BPM/timeSig config changes,
// which is picked up by the existing link_manager listener.

registerDriveSource({
  viewId: 'strum_view',
  emittedKinds: [SignalKind.Groove],
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
  extractSignals(detail: any): DriveSignal[] {
    const signal: FeatureSignal = {
      kind: SignalKind.Feature,
      categoryName: detail?.categoryName ?? '',
      featureTypeName: detail?.featureTypeName ?? null,
      config: Array.isArray(detail?.config) ? [...detail.config] : [],
    };
    return [signal];
  },
});

// ─── AnyFloatingView as target ────────────────────────────────────────────────

registerDriveTarget({
  featureTypeName: 'Any',
  viewId: 'any_floating_view',
  argName: 'Feature',
  label: 'Feature from linked schedule',
  acceptedKinds: [SignalKind.Feature],
  resolveValue(_signal: DriveSignal): string | null {
    return null;
  },
});
