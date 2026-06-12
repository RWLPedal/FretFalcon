// ts/modules/module_types.ts
// THE extension contract. Every view module implements ViewModule and default-exports it.
// Adding a view = add ts/modules/<name>/module.ts, run build — no other file edits needed.

import { View } from '../core/view';
import { AppSettings } from '../settings';
import { ViewId, NavSectionId, viewId as _viewId } from '../core/ids';
import { DriveSourceDescriptor, DriveTargetSlot } from '../panels/drive_registry';
import { ConfigurableFeatureView } from '../views/configurable_feature_view'; // privileged import

export { viewId } from '../core/ids';

// ─── Visibility ───────────────────────────────────────────────────────────────
// Controls which form factor a nav button appears in.

export enum Visibility {
  Desktop = 'desktop',
  Mobile  = 'mobile',
  Both    = 'both',
}

// ─── ViewContext ──────────────────────────────────────────────────────────────

export interface ViewContext {
  appSettings: AppSettings;
  // Phase 5 will add: constraints, sink registration handle
}

// ─── ViewModule ───────────────────────────────────────────────────────────────

export interface ViewModule<S = unknown> {
  id: ViewId;

  panel: {
    displayName: string;
    icon: string;
    defaultSize?: { width: number; height: number };
    minSize?: { width: number; height: number };
    singleton?: boolean;
    /** When false, excluded from spawnable-panel picker menus. Defaults to true. */
    showInMenu?: boolean;
    /** When true, the panel is recreated on instrument/settings change. */
    refreshOnInstrumentChange?: boolean;
    capabilities?: {
      rotate?: boolean;
      zoom?: boolean;
      configToggle?: boolean;
    };
    defaultConfigCollapsed?: boolean;
    /** For feature-panel views, the drive-registry featureTypeName. */
    featureTypeName?: string;
  };

  /** When present, a button appears in the given sidebar nav section. */
  nav?: {
    section: NavSectionId;
    label: string;
    visibility?: Visibility;
    requiredInstruments?: readonly string[];
  };

  drive?: {
    sources?: DriveSourceDescriptor[];
    targets?: DriveTargetSlot[];
    /** When true, this panel broadcasts signals to all other panels (Global Key behaviour). */
    broadcast?: boolean;
  };

  state?: {
    decode(raw: unknown): S | null;
  };

  createView(ctx: ViewContext, state?: S): View;
}

// ─── featurePanelModule ───────────────────────────────────────────────────────
// Helper used by the 9+ instrument feature modules. Each feature module calls
// featurePanelModule() and default-exports the result — this is an "ordinary"
// extension pattern despite internally using the privileged ConfigurableFeatureView.

export interface FeaturePanelModuleOpts {
  id: ViewId;
  displayName: string;
  icon: string;
  featureTypeName: string;
  defaultSize?: { width: number; height: number };
  minSize?: { width: number; height: number };
  showInMenu?: boolean;
  nav?: ViewModule['nav'];
  drive?: ViewModule['drive'];
}

export function featurePanelModule(opts: FeaturePanelModuleOpts): ViewModule {
  return {
    id: opts.id,
    panel: {
      displayName: opts.displayName,
      icon: opts.icon,
      defaultSize: opts.defaultSize,
      minSize: opts.minSize,
      showInMenu: opts.showInMenu ?? false,
      refreshOnInstrumentChange: true,
      capabilities: { rotate: true, zoom: true, configToggle: true },
      featureTypeName: opts.featureTypeName,
    },
    nav: opts.nav,
    drive: opts.drive,
    createView(ctx: ViewContext, state?: unknown): View {
      return new ConfigurableFeatureView(
        {
          ...(state as any),
          categoryName: 'Instrument',
          featureTypeName: opts.featureTypeName,
        },
        ctx.appSettings,
      );
    },
  };
}
