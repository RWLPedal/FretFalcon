import { ViewModule, ViewContext, viewId } from '../module_types';
import { NavSection } from '../../core/ids';
import { CapoView } from './capo_view';
import { InstrumentName } from '../../fretboard/fretboard';

const CAPO_ID = viewId('capo_view');

const module: ViewModule = {
  id: CAPO_ID,
  panel: {
    displayName: 'Capo',
    icon: 'adjust',
    defaultSize: { width: 240, height: 350 },
  },
  nav: {
    section: NavSection.Fretboard,
    label: 'Capo',
    requiredInstruments: [
      InstrumentName.Guitar,
      InstrumentName.Ukulele,
      InstrumentName.Mandolin,
      InstrumentName.Mandola,
      InstrumentName.TenorBanjo,
      InstrumentName.Charango,
    ],
  },
  createView(ctx: ViewContext) {
    return new CapoView(ctx.appSettings);
  },
};

export default module;
