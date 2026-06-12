// The Legend module is the canonical "acid test" extension.
// It demonstrates: a self-contained ViewModule with no drive wiring,
// refreshOnInstrumentChange, and a nav entry.
// See docs/EXTENDING.md for a guided walkthrough.

import { ViewModule, ViewContext, viewId } from '../module_types';
import { NavSection } from '../../core/ids';
import { Visibility } from '../module_types';
import { LegendView } from '../../fretboard/views/legend_view';
import { View } from '../../core/view';

const LEGEND_ID = viewId('instrument_color_legend');

const module: ViewModule = {
  id: LEGEND_ID,
  panel: {
    displayName: 'Legend',
    icon: 'palette',
    defaultSize: { width: 180, height: undefined as any },
    refreshOnInstrumentChange: true,
  },
  nav: {
    section: NavSection.Utilities,
    label: 'Legend',
    visibility: Visibility.Desktop,
  },
  createView(ctx: ViewContext): View {
    return new LegendView(ctx.appSettings);
  },
};

export default module;
