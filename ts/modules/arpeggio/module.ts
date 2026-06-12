import { featurePanelModule, viewId } from '../module_types';
import { NavSection } from '../../core/ids';
import { ArpeggioFeature } from '../../fretboard/features/arpeggio_feature';
import { SignalKind } from '../../panels/link_types';

export default featurePanelModule({
  id: viewId('instrument_arpeggio'),
  displayName: 'Arpeggio',
  icon: 'linear_scale',
  featureTypeName: ArpeggioFeature.typeName,
  defaultSize: { width: 420, height: 550 },
  nav: {
    section: NavSection.Fretboard,
    label: 'Arpeggio',
  },
  drive: {
    targets: [
      {
        featureTypeName: ArpeggioFeature.typeName,
        argName: 'Root Note',
        label: 'Root note (from linked source)',
        acceptedKinds: [SignalKind.Chord],
        resolveValue(signal) {
          if (signal.kind !== SignalKind.Chord) return null;
          return signal.rootNote || null;
        },
      },
      {
        featureTypeName: ArpeggioFeature.typeName,
        argName: 'Quality',
        label: 'Quality (from linked source)',
        acceptedKinds: [SignalKind.Chord],
        resolveValue(signal) {
          if (signal.kind !== SignalKind.Chord || !signal.chordKey) return null;
          const suffix = signal.chordKey.slice(signal.chordKey.indexOf('_') + 1);
          const suffixMap: Record<string, string> = {
            MAJ: 'Major', MIN: 'Minor', DOM7: 'Dom 7',
            MAJ7: 'Maj 7', MIN7: 'Min 7', DIM: 'Dim', AUG: 'Aug',
          };
          return suffixMap[suffix] ?? null;
        },
      },
    ],
  },
});
