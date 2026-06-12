import { featurePanelModule, viewId } from '../module_types';
import { NavSection } from '../../core/ids';
import { NotesFeature } from '../../fretboard/features/notes_feature';
import { SignalKind } from '../../panels/link_types';

const NOTES_ID = viewId('instrument_notes');

export default featurePanelModule({
  id: NOTES_ID,
  displayName: 'Notes',
  icon: 'music_note',
  featureTypeName: NotesFeature.typeName,
  defaultSize: { width: 420, height: 550 },
  nav: {
    section: NavSection.Fretboard,
    label: 'Notes',
  },
  drive: {
    targets: [
      {
        featureTypeName: NotesFeature.typeName,
        argName: 'Root Note',
        label: 'Root note (from linked source)',
        acceptedKinds: [SignalKind.Chord, SignalKind.Key],
        resolveValue(signal) {
          if (signal.kind !== SignalKind.Chord && signal.kind !== SignalKind.Key) return null;
          return signal.rootNote || null;
        },
      },
    ],
  },
});
