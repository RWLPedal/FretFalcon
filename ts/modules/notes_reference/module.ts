import { ViewModule, ViewContext, viewId } from '../module_types';
import { NotesFeature } from '../../fretboard/features/notes_feature';
import { Feature } from '../../feature';
import { onEvent } from '../../core/events';

/** Height the fretboard is built at until the layout reports the panel's real size. */
const INITIAL_MAX_HEIGHT = 650;

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
    let feature: Feature = new NotesFeature([], ctx.appSettings, null, INITIAL_MAX_HEIGHT);
    let unlisten: (() => void) | null = null;

    const renderInto = (container: HTMLElement) => {
      feature.render(container);
      feature.views?.forEach((v) => v.render(container));
    };

    return {
      render(container: HTMLElement) {
        renderInto(container);
        // Re-fit the fretboard whenever the layout reports the room it has. The
        // tabbed (mobile) layout depends on this: there the panel is the screen.
        unlisten = onEvent(container, 'wrapper-user-resized', ({ width, height }) => {
          if (width <= 0 || height <= 0) return;
          const style = getComputedStyle(container);
          const padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
          const padY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
          feature.destroy?.();
          feature = new NotesFeature(
            [],
            ctx.appSettings,
            null,
            Math.max(50, height - padY),
            Math.max(50, width - padX),
          );
          renderInto(container);
        });
      },
      start: () => feature.start?.(),
      stop: () => feature.stop?.(),
      destroy: () => {
        unlisten?.();
        feature.destroy?.();
      },
    };
  },
};

export default module;
