import { ViewModule, ViewContext, viewId } from '../module_types';
import { CORE_VIEW_IDS } from '../../core/ids';
import { FeaturePanelController } from './feature_panel_controller';

const module: ViewModule = {
  id: CORE_VIEW_IDS.ConfigurableFeature,
  panel: {
    displayName: 'Configurable Feature',
    icon: 'tune',
    defaultSize: { width: 420, height: 550 },
    showInMenu: false,
    refreshOnInstrumentChange: true,
    capabilities: { rotate: true, zoom: true, configToggle: true },
  },
  createView(ctx: ViewContext, state?: unknown) {
    return new FeaturePanelController(
      { categoryName: 'Instrument', ...(state as any) },
      ctx.appSettings,
    );
  },
};

export default module;
