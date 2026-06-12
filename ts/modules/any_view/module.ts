import { ViewModule, ViewContext, viewId } from '../module_types';
import { NavSection } from '../../core/ids';
import { AnyFloatingView } from '../../views/any_floating_view';

const module: ViewModule = {
  id: viewId('any_floating_view'),
  panel: {
    displayName: 'Any',
    icon: 'smart_display',
    defaultSize: { width: 420, height: 550 },
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
