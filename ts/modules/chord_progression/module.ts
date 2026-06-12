import { featurePanelModule, viewId } from '../module_types';
import { NavSection } from '../../core/ids';
import { ChordProgressionFeature } from '../../fretboard/features/chord_progression_feature';
import { SignalKind } from '../../panels/link_types';

export default featurePanelModule({
  id: viewId('instrument_chord_progression'),
  displayName: 'Chord Progression',
  icon: 'arrow_forward',
  featureTypeName: ChordProgressionFeature.typeName,
  defaultSize: { width: 420, height: 600 },
  showInMenu: true,
  nav: {
    section: NavSection.Fretboard,
    label: 'Progression',
    requiredInstruments: ['Guitar', 'Ukulele', 'Mandolin', 'Mandola', 'Charango'],
  },
  drive: {
    targets: [
      {
        featureTypeName: ChordProgressionFeature.typeName,
        argName: 'Root Note',
        label: 'Root note (from linked source)',
        acceptedKinds: [SignalKind.Key],
        resolveValue(signal) {
          if (signal.kind !== SignalKind.Key) return null;
          return signal.rootNote || null;
        },
      },
      {
        featureTypeName: ChordProgressionFeature.typeName,
        argName: 'Mode',
        label: 'Mode (from linked source)',
        acceptedKinds: [SignalKind.Key],
        resolveValue(signal) {
          if (signal.kind !== SignalKind.Key) return null;
          return signal.scaleKey;
        },
      },
    ],
  },
});
