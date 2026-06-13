import { featurePanelModule, viewId } from '../module_types';
import { NavSection } from '../../core/ids';
import { TriadFeature } from '../../fretboard/features/triad_feature';
import { SignalKind, KeyType } from '../../panels/link_types';
import { ChordQuality } from '../../music/music_types';
import { scales } from '../../music/scales';

function tonicIsMinor(scaleKey: string): boolean {
  const scale = (scales as any)[scaleKey];
  if (!scale || typeof scale.getChordQualityAt !== 'function') return false;
  const q: ChordQuality = scale.getChordQualityAt(0);
  return q === ChordQuality.Minor || q === ChordQuality.Diminished;
}

export default featurePanelModule({
  id: viewId('instrument_triad'),
  displayName: 'Triad Shapes',
  icon: 'change_history',
  featureTypeName: TriadFeature.typeName,
  defaultSize: { width: 415, height: 685 },
  nav: {
    section: NavSection.Fretboard,
    label: 'Triads',
    requiredInstruments: ['Guitar', '7-String Guitar', '8-String Guitar'],
  },
  drive: {
    targets: [
      {
        featureTypeName: TriadFeature.typeName,
        argName: 'Root Note',
        label: 'Root note (from linked source)',
        acceptedKinds: [SignalKind.Chord, SignalKind.Key],
        resolveValue(signal) {
          if (signal.kind !== SignalKind.Chord && signal.kind !== SignalKind.Key) return null;
          return signal.rootNote || null;
        },
      },
      {
        featureTypeName: TriadFeature.typeName,
        argName: 'Qualities',
        label: 'Quality (from linked key source)',
        acceptedKinds: [SignalKind.Key, SignalKind.Chord],
        transparent: true,
        resolveValue(signal) {
          if (signal.kind === SignalKind.Key) return tonicIsMinor(signal.scaleKey) ? 'Minor' : 'Major';
          if (signal.kind === SignalKind.Chord) return signal.keyType === KeyType.Major ? 'Major' : 'Minor';
          return null;
        },
      },
    ],
  },
});

