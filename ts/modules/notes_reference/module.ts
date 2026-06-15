import { ViewModule, ViewContext, viewId } from '../module_types';
import { NotesFeature } from '../../fretboard/features/notes_feature';

const module: ViewModule = {
  id: viewId('instrument_notes_reference'),
  panel: {
    displayName: 'Fretboard Notes',
    icon: 'music_note',
    size: { default: { cols: 21, rows: 34 } },
    sizeHorizontal: { default: { cols: 40, rows: 18 } },
    showInMenu: true,
    refreshOnInstrumentChange: true,
    capabilities: { rotate: true, zoom: true },
  },
  createView(ctx: ViewContext) {
    const feature = NotesFeature.createFeature(
      ['None'],
      ctx.appSettings,
      650,
      'Instrument',
    );
    return {
      render(container: HTMLElement) {
        feature.render(container);
        if (feature.views) {
          feature.views.forEach((v) => v.render(container));
        }
      },
      start: () => feature.start?.(),
      stop: () => feature.stop?.(),
      destroy: () => feature.destroy?.(),
    };
  },
};

export default module;
