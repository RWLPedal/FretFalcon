import { ViewModule, ViewContext, viewId, Visibility } from '../module_types';
import { NavSection } from '../../core/ids';
import { DroneView } from './drone_view';
import { SignalKind } from '../../panels/link_types';

const DRONE_ID = viewId('drone_view');

const module: ViewModule = {
  id: DRONE_ID,
  panel: {
    displayName: 'Drone',
    icon: 'graphic_eq',
    size: { default: { cols: 20, rows: 5 }, min: { cols: 19, rows: 5 }, max: { cols: 30, rows: 9 } },
  },
  nav: {
    section: NavSection.PracticeTools,
    label: 'Drone',
    visibility: Visibility.Desktop,
  },
  drive: {
    sources: [
      {
        viewId: DRONE_ID,
        emittedKinds: [SignalKind.Play],
        extractSignals: () => [],
      },
    ],
    targets: [
      {
        featureTypeName: 'Drone',
        viewId: DRONE_ID,
        argName: 'Note',
        label: 'Root note (from linked source)',
        acceptedKinds: [SignalKind.Chord],
        resolveValue: () => null,
      },
      {
        featureTypeName: 'Drone',
        viewId: DRONE_ID,
        argName: 'Play',
        label: 'Play/stop (from linked source)',
        acceptedKinds: [SignalKind.Play],
        resolveValue: () => null,
      },
      {
        featureTypeName: 'Drone',
        viewId: DRONE_ID,
        argName: 'Strum',
        label: 'Strum rhythm (from linked source)',
        acceptedKinds: [SignalKind.Strum],
        resolveValue: () => null,
      },
    ],
  },
  createView(_ctx: ViewContext, state?: unknown) {
    return new DroneView(state);
  },
};

export default module;
