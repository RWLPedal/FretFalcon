import { ViewModule, ViewContext, viewId } from '../module_types';
import { NavSection } from '../../core/ids';
import { createScheduleEditorView } from '../../schedule/api';
import { SignalKind, FeatureSignal, SignalState } from '../../panels/link_types';

const SCHEDULE_ID = viewId('schedule_floating_view');

const module: ViewModule = {
  id: SCHEDULE_ID,
  panel: {
    displayName: 'Schedule',
    icon: 'event_note',
    size: { default: { cols: 56, rows: 50 }, min: { cols: 38, rows: 38 } },
    showInMenu: false,
  },
  nav: {
    section: NavSection.Schedule,
    label: 'Schedule Editor',
  },
  drive: {
    sources: [
      {
        viewId: SCHEDULE_ID,
        emittedKinds: [SignalKind.Feature],
        emitsNextSignals: true,
        extractSignals(detail: any) {
          const signal: FeatureSignal = {
            kind: SignalKind.Feature,
            state: detail?.state as SignalState,
            categoryName: detail?.categoryName ?? '',
            featureTypeName: detail?.featureTypeName ?? null,
            config: Array.isArray(detail?.config) ? [...detail.config] : [],
          };
          return [signal];
        },
      },
    ],
  },
  createView(ctx: ViewContext, state?: unknown) {
    return createScheduleEditorView(state, ctx.appSettings);
  },
};

export default module;
