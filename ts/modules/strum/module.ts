import { ViewModule, ViewContext, viewId } from '../module_types';
import { NavSection } from '../../core/ids';
import { StrumView, StrumViewState } from './strum_view';
import { AudioController } from '../../audio_controller';
import { SignalKind, GrooveSignal } from '../../panels/link_types';

const STRUM_ID = viewId('strum_view');

const module: ViewModule = {
  id: STRUM_ID,
  panel: {
    displayName: 'Strum',
    icon: 'music_note',
    defaultSize: { width: 520, height: 160 },
  },
  nav: {
    section: NavSection.PracticeTools,
    label: 'Strum',
  },
  drive: {
    sources: [
      {
        viewId: STRUM_ID,
        emittedKinds: [SignalKind.Groove, SignalKind.Strum, SignalKind.Play],
        extractSignals(detail: any) {
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
      },
    ],
    targets: [
      {
        featureTypeName: 'Strum',
        viewId: STRUM_ID,
        argName: 'BPM',
        label: 'BPM (from linked groove source)',
        acceptedKinds: [SignalKind.Groove],
        resolveValue: () => null,
      },
      {
        featureTypeName: 'Strum',
        viewId: STRUM_ID,
        argName: 'Play',
        label: 'Play/stop (from linked source)',
        acceptedKinds: [SignalKind.Play],
        resolveValue: () => null,
      },
    ],
  },
  createView(_ctx: ViewContext, state?: unknown) {
    const audioController = new AudioController(
      document.querySelector('#intro-end-sound') as HTMLAudioElement,
      document.querySelector('#interval-end-sound') as HTMLAudioElement,
      document.querySelector('#metronome-sound') as HTMLAudioElement,
      document.querySelector('#metronome-accent-sound') as HTMLAudioElement,
    );
    return new StrumView(state as Partial<StrumViewState> | undefined, audioController);
  },
};

export default module;
