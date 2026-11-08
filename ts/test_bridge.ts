// ts/test_bridge.ts
// Read-only hooks for the Playwright visual/structural harness (tests/visual/).
// Initialized only when ?fftest is in the URL; zero effect otherwise.
//
// The harness uses window.__ff to enumerate every registered panel, spawn each
// one, and read back rendered vs. declared-minimum sizes — so "panel too small",
// per-panel spawn exceptions, and overlap/overflow regressions are caught by
// `npm run smoke` instead of manual eyeballing.

import { FloatingViewManager } from "./panels/panel_host";
import { getAvailableFloatingViews, getFloatingViewDescriptor } from "./panels/panel_registry";
import { resolveSizing, Orientation } from "./panels/panel_sizing";
import { getNavEntries, Visibility } from "./reference_page/nav_registry";
import { loadSettings } from "./settings";
import { instrumentCategory } from "./fretboard/fretboard_category";
import { getAllFeatureSpecs } from "./core/config/feature_spec_registry";

interface PanelReport {
  id: string;
  viewId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Declared minimum (at the app's global orientation) in px against the live cell;
   *  null when the panel declares none for that orientation. */
  minW: number | null;
  minH: number | null;
  cell: number;
}

export function initTestBridge(manager: FloatingViewManager): void {
  if (!location.search.includes("fftest")) return;

  // Freshly spawned panels take the global fretboard orientation (panel_host
  // _createPanel); per-instance overrides only exist after a user rotate, which
  // the harness doesn't do — so this mirrors the effective spawn orientation.
  const globalOrientation = (): Orientation =>
    loadSettings().instrumentSettings.orientation ?? "horizontal";

  const report = (): PanelReport[] => {
    const cell = manager.getGridGeometry().cell;
    const orientation = globalOrientation();
    return manager.getOpenInstanceIds().map((id) => {
      const el = manager.getWrapperElement(id);
      const viewId = manager.getViewId(id);
      const desc = viewId ? getFloatingViewDescriptor(viewId) : undefined;
      const min = resolveSizing(desc, orientation)?.min;
      const rect = el?.getBoundingClientRect();
      return {
        id,
        viewId: (viewId as string) ?? "?",
        x: rect?.x ?? 0,
        y: rect?.y ?? 0,
        w: el?.offsetWidth ?? 0,
        h: el?.offsetHeight ?? 0,
        minW: min ? min.cols * cell : null,
        minH: min?.rows ? min.rows * cell : null,
        cell,
      };
    });
  };

  (window as unknown as Record<string, unknown>).__ff = {
    listViews: () => {
      const navVisibility = new Map(getNavEntries().map((e) => [e.viewId as string, e.visibility]));
      return getAvailableFloatingViews().map((d) => ({
        viewId: d.viewId as string,
        singleton: !!d.singleton,
        featureTypeName: d.featureTypeName ?? null,
        showInMenu: d.showInMenu !== false,
        desktopOnly: navVisibility.get(d.viewId as string) === Visibility.Desktop,
        mobileOnly: navVisibility.get(d.viewId as string) === Visibility.Mobile,
      }));
    },
    // Mirror of sidebar_view's handleFeatureClick: feature panels get their
    // featureTypeName as initial view state.
    spawn: (viewId: string) => {
      const desc = getFloatingViewDescriptor(viewId);
      const viewState = desc?.featureTypeName
        ? { featureTypeName: desc.featureTypeName }
        : undefined;
      return manager.spawnView(viewId, viewState ? { viewState } : undefined);
    },
    close: (instanceId: string) => manager.destroyView(instanceId),
    report,
    // Feature-registry census — verifies the auto-discovery manifest found everything.
    featureCensus: () => ({
      descriptors: [...instrumentCategory.getFeatureTypes().keys()].sort(),
      specs: [...getAllFeatureSpecs().keys()].sort(),
    }),

    // ── Device/layout observability (all read-only except activateTab) ────────

    /** Which layout strategy is live — the JS side of the 768px breakpoint. */
    strategy: () => manager.getStrategyKind(),
    /** Tab order + active tab on mobile; null when floating. */
    tabs: () => manager.getTabbedState(),
    /** Deterministic tab switching for mobile specs (avoids synthesizing taps). */
    activateTab: (instanceId: string) => manager.activateTab(instanceId),
    /** Deterministic tab reorder (the long-press drag is too flaky to synthesize). */
    reorderTabs: (order: string[]) => manager.reorderTabs(order),
    /** Workspace-area state flags (`is-scrollable` = scroll-instead-of-shrink). */
    areaFlags: () => {
      const area = document.getElementById("floating-view-area");
      return { scrollable: !!area?.classList.contains("is-scrollable") };
    },
    /** Live fit-aware grid geometry. */
    gridInfo: () => {
      const g = manager.getGridGeometry();
      return { cell: g.cell, originX: g.originX, cols: g.cols };
    },
    /** Monotonic layout-pass counter — poll until stable instead of sleeping. */
    layoutEpoch: () => manager.getLayoutEpoch(),
  };
}
