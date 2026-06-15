import { ViewModule, ViewContext, viewId } from '../module_types';
import { CORE_VIEW_IDS } from '../../core/ids';
import { FEATURE_PANEL_SIZE } from '../../panels/panel_sizing';
import { FeaturePanelController } from './feature_panel_controller';

const module: ViewModule = {
  id: CORE_VIEW_IDS.ConfigurableFeature,
  panel: {
    displayName: 'Configurable Feature',
    icon: 'tune',
    size: FEATURE_PANEL_SIZE.size,
    sizeHorizontal: FEATURE_PANEL_SIZE.sizeHorizontal,
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
