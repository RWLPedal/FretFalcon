// ts/modules/module_types.ts
// THE extension contract. Every view module implements ViewModule and default-exports it.
// Adding a view = add ts/modules/<name>/module.ts, run build — no other file edits needed.

import { View } from '../core/view';
import { AppSettings } from '../settings';
import { ViewId, NavSectionId, viewId as _viewId } from '../core/ids';
import { DriveSourceDescriptor, DriveTargetSlot } from '../panels/drive_registry';
import { FeaturePanelController } from './feature_panel/feature_panel_controller';

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

// ─── Orientation sizing ─────────────────────────────────────────────────────────

/** Per-orientation size overrides. Currently only `horizontal` (the rotated layout)
 *  is overridable; vertical uses the flat defaultSize/minSize/maxSize. */
export interface OrientationSizes {
  horizontal?: {
    defaultSize?: { width: number; height?: number };
    minSize?: { width: number; height: number };
    maxSize?: { width: number; height: number };
  };
}

// ─── ViewModule ───────────────────────────────────────────────────────────────

export interface ViewModule<S = unknown> {
  id: ViewId;

  panel: {
    displayName: string;
    icon: string;
    /** Initial panel size; omit height to let the panel auto-size vertically. */
    defaultSize?: { width: number; height?: number };
    minSize?: { width: number; height: number };
    maxSize?: { width: number; height: number };
    /** Optional per-orientation size overrides. The flat defaultSize/minSize/maxSize
     *  describe the vertical (default) orientation; `orientationSizes.horizontal`
     *  overrides them when the panel is rotated to horizontal. Each field falls back
     *  to its vertical value when omitted. */
    orientationSizes?: OrientationSizes;
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
// featurePanelModule() and default-exports the result.

export interface FeaturePanelModuleOpts {
  id: ViewId;
  displayName: string;
  icon: string;
  featureTypeName: string;
  defaultSize?: { width: number; height?: number };
  minSize?: { width: number; height: number };
  maxSize?: { width: number; height: number };
  orientationSizes?: OrientationSizes;
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
      maxSize: opts.maxSize,
      orientationSizes: opts.orientationSizes,
      showInMenu: opts.showInMenu ?? false,
      refreshOnInstrumentChange: true,
      capabilities: { rotate: true, zoom: true, configToggle: true },
      featureTypeName: opts.featureTypeName,
    },
    nav: opts.nav,
    drive: opts.drive,
    createView(ctx: ViewContext, state?: unknown): View {
      return new FeaturePanelController(
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
