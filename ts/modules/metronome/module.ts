import { ViewModule, ViewContext, viewId } from '../module_types';
import { NavSection } from '../../core/ids';
import { MetronomeView } from '../../fretboard/views/metronome_view';
import { AudioController } from '../../audio_controller';
import { SignalKind, GrooveSignal } from '../../panels/link_types';

const METRONOME_ID = viewId('instrument_floating_metronome');

const module: ViewModule = {
  id: METRONOME_ID,
  panel: {
    displayName: 'Metronome',
    icon: 'timer',
    defaultSize: { width: 280, height: 120 },
    refreshOnInstrumentChange: true,
  },
  nav: {
    section: NavSection.PracticeTools,
    label: 'Metronome',
  },
  drive: {
    sources: [
      {
        viewId: METRONOME_ID,
        emittedKinds: [SignalKind.Groove, SignalKind.Play],
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
        featureTypeName: 'Metronome',
        viewId: METRONOME_ID,
        argName: 'BPM',
        label: 'BPM (from linked groove source)',
        acceptedKinds: [SignalKind.Groove],
        resolveValue: () => null,
      },
      {
        featureTypeName: 'Metronome',
        viewId: METRONOME_ID,
        argName: 'Play',
        label: 'Play/stop (from linked source)',
        acceptedKinds: [SignalKind.Play],
        resolveValue: () => null,
      },
    ],
  },
  createView(_ctx: ViewContext) {
    const audioController = new AudioController(
      document.querySelector('#intro-end-sound') as HTMLAudioElement,
      document.querySelector('#interval-end-sound') as HTMLAudioElement,
      document.querySelector('#metronome-sound') as HTMLAudioElement,
      document.querySelector('#metronome-accent-sound') as HTMLAudioElement,
    );
    return new MetronomeView(120, audioController);
  },
};

export default module;
