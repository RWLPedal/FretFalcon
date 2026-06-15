import { ViewModule, ViewContext, viewId } from '../module_types';
import { NavSection } from '../../core/ids';
import { FEATURE_PANEL_SIZE } from '../../panels/panel_sizing';
import { AnyFloatingView } from './any_floating_view';

const module: ViewModule = {
  id: viewId('any_floating_view'),
  panel: {
    displayName: 'Any',
    icon: 'smart_display',
    size: FEATURE_PANEL_SIZE.size,
    sizeHorizontal: FEATURE_PANEL_SIZE.sizeHorizontal,
    showInMenu: false,
  },
  nav: {
    section: NavSection.Schedule,
    label: 'Any',
  },
  createView(ctx: ViewContext, state?: unknown) {
    return new AnyFloatingView(state, ctx.appSettings);
  },
};

export default module;
