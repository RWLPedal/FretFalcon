// tests/visual/specs/structural.spec.ts
// The pixel-free invariant layer. Never needs golden updates; runs on every viewport.
//   1. Spawn EVERY registered panel one at a time: no exceptions; on desktop the
//      rendered size >= declared PanelSizing.min at the live cell; on mobile the
//      panel gets a tab and exactly one tab panel stays visible.
//   2. For each bundled starter layout: desktop restores with no overlap and no
//      horizontal overflow; mobile restores every instance as a tab, still with no
//      horizontal overflow. No exceptions either way.
import { test, expect, Page } from "@playwright/test";
import { prepPage, settle, settleLayout } from "../helpers/inject";
import { tabbedPanes } from "../../../ts/panels/layout/layout_mode";

// Every bundled starter layout, exercised via the app's own ?layout= param
// (keys from ts/screen_config/default_configs.ts DEFAULT_CONFIGS).
const LAYOUT_FIXTURES = [
  "reference",
  "backing",
  "voice_leading",
  "practice_beginner",
  "practice_advanced",
  "harmony_explorer",
  "strumming",
  "mobile_starter",
];

interface PanelReport {
  id: string;
  viewId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW: number | null;
  minH: number | null;
  cell: number;
}

interface ViewInfo {
  viewId: string;
  singleton: boolean;
  showInMenu: boolean;
  desktopOnly: boolean;
  mobileOnly: boolean;
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
  });
  return errors;
}

/** Mirrors TABBED_MEDIA_QUERY (ts/panels/layout/layout_mode.ts): narrow OR short. */
const isMobile = (page: Page) => {
  const vp = page.viewportSize();
  return (vp?.width ?? 9999) <= 768 || (vp?.height ?? 9999) <= 480;
};

/** Count of .tabbed-panel elements currently visible (mobile: must always be ≤ 1). */
/** How many panels the tabbed layout shows at once on this screen (2 on the tablet). */
const paneCapacity = (page: Page) => {
  const vp = page.viewportSize()!;
  return tabbedPanes(vp.width, vp.height).count;
};

const visibleTabPanels = (page: Page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll<HTMLElement>(".tabbed-panel")].filter(
        (p) => p.style.display !== "none" && p.offsetParent !== null,
      ).length,
  );

const horizontalOverflow = (page: Page) =>
  page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );

test("every registered panel spawns without errors and meets its minimum size", async ({ page }) => {
  const errors = collectErrors(page);
  await prepPage(page);
  await page.goto("/?layout=empty&fftest");
  await settle(page);

  const mobile = isMobile(page);
  const views = (await page.evaluate(() => (window as any).__ff.listViews())) as ViewInfo[];
  expect(views.length).toBeGreaterThan(10);

  for (const v of views) {
    // Mirror the nav: don't spawn desktop-only panels on mobile or vice versa.
    if ((mobile && v.desktopOnly) || (!mobile && v.mobileOnly)) continue;

    const id = (await page.evaluate((vid) => (window as any).__ff.spawn(vid), v.viewId)) as string | null;
    expect(id, `spawn returned null for ${v.viewId}`).toBeTruthy();
    await settle(page);

    if (!mobile) {
      const reports = (await page.evaluate(() => (window as any).__ff.report())) as PanelReport[];
      const r = reports.find((p) => p.id === id);
      expect(r, `no report for ${v.viewId}`).toBeTruthy();
      if (r?.minW !== null && r?.minW !== undefined) {
        expect
          .soft(r.w, `${v.viewId}: rendered width ${r.w}px < declared min ${r.minW}px (cell ${r.cell}px)`)
          .toBeGreaterThanOrEqual(r.minW - 1);
      }
      if (r?.minH !== null && r?.minH !== undefined) {
        expect
          .soft(r.h, `${v.viewId}: rendered height ${r.h}px < declared min ${r.minH}px (cell ${r.cell}px)`)
          .toBeGreaterThanOrEqual(r.minH - 1);
      }
    } else {
      // Mobile: the spawn must land as a tab, no more tab panels may be on screen
      // than the screen has panes, and nothing may push the page wider than the viewport.
      const tabs = (await page.evaluate(() => (window as any).__ff.tabs())) as {
        order: string[];
        activeId: string | null;
      } | null;
      expect(tabs, `${v.viewId}: tabbed strategy not live on a mobile viewport`).toBeTruthy();
      expect.soft(tabs!.order, `${v.viewId}: no tab created for spawn`).toContain(id);
      expect
        .soft(await visibleTabPanels(page), `${v.viewId}: more tab panels on screen than panes`)
        .toBeLessThanOrEqual(paneCapacity(page));
      expect
        .soft(await horizontalOverflow(page), `${v.viewId}: horizontal overflow on mobile`)
        .toBeLessThanOrEqual(0);
    }

    await page.evaluate((iid) => (window as any).__ff.close(iid), id);
  }

  expect(errors, errors.join("\n")).toEqual([]);
});

for (const fixture of LAYOUT_FIXTURES) {
  test(`starter layout "${fixture}": restores clean — no overlap, no horizontal overflow`, async ({ page }) => {
    const errors = collectErrors(page);
    await prepPage(page);
    await page.goto(`/?layout=${fixture}&fftest`);
    await settle(page);

    if (isMobile(page)) {
      // Mobile: the same config restores into the tabbed strategy. Every instance
      // becomes a tab (no starter layout bundles the mobile-suppressed Global Key),
      // exactly one tab panel is visible, and nothing overflows sideways.
      const strategy = await page.evaluate(() => (window as any).__ff.strategy());
      expect(strategy, `"${fixture}" restored into ${strategy} on a mobile viewport`).toBe("tabbed");

      const tabs = (await page.evaluate(() => (window as any).__ff.tabs())) as {
        order: string[];
        activeId: string | null;
      };
      const reports = (await page.evaluate(() => (window as any).__ff.report())) as PanelReport[];
      expect(reports.length, `layout ${fixture} restored no panels`).toBeGreaterThan(0);
      expect(
        tabs.order.slice().sort(),
        `"${fixture}": open instances and tabs disagree`,
      ).toEqual(reports.map((r) => r.id).sort());
      expect(tabs.activeId, `"${fixture}": no active tab after restore`).toBeTruthy();
      expect
        .soft(await visibleTabPanels(page), `"${fixture}": more tab panels on screen than panes`)
        .toBeLessThanOrEqual(paneCapacity(page));
      expect
        .soft(await horizontalOverflow(page), `horizontal overflow in "${fixture}"`)
        .toBeLessThanOrEqual(0);
      expect(errors, errors.join("\n")).toEqual([]);
      return;
    }

    const reports = (await page.evaluate(() => (window as any).__ff.report())) as PanelReport[];
    expect(reports.length, `layout ${fixture} restored no panels`).toBeGreaterThan(0);

    for (let i = 0; i < reports.length; i++) {
      for (let j = i + 1; j < reports.length; j++) {
        const a = reports[i];
        const b = reports[j];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        const overlap = Math.max(0, ox) * Math.max(0, oy);
        expect
          .soft(overlap, `${a.viewId} overlaps ${b.viewId} by ${overlap}px² in "${fixture}"`)
          .toBeLessThanOrEqual(1);
      }
    }

    expect
      .soft(await horizontalOverflow(page), `horizontal overflow in "${fixture}"`)
      .toBeLessThanOrEqual(0);

    expect(errors, errors.join("\n")).toEqual([]);
  });
}

// Runtime guard for the feature auto-discovery manifest (feature_manifest.ts,
// require.context): confirms webpack actually wired every features/*_feature.ts into
// the category, and that every migrated spec's typeName has a matching descriptor.
// The feature_manifest architecture test guards the source; this guards the wiring.
test("feature manifest discovered every feature at runtime", async ({ page }) => {
  await prepPage(page);
  await page.goto("/?fftest");
  await settle(page);
  const census = (await page.evaluate(() => (window as any).__ff.featureCensus())) as {
    descriptors: string[];
    specs: string[];
  };
  expect(census.descriptors.length, "no feature descriptors discovered").toBeGreaterThanOrEqual(10);
  expect(census.specs.length, "no feature specs registered").toBeGreaterThanOrEqual(9);
  for (const spec of census.specs) {
    expect(census.descriptors, `spec "${spec}" has no matching descriptor`).toContain(spec);
  }
});

// The panel the user specifically worries about: nearby triads renders multiple
// fretboard diagrams and is the first casualty when the grid cell hits its floor.
test("nearby triads panel stays legible", async ({ page }) => {
  test.skip(isMobile(page), "min-size is a floating-layout concern");
  await prepPage(page);
  await page.goto("/?layout=empty&fftest");
  await settle(page);

  const id = await page.evaluate(() => (window as any).__ff.spawn("instrument_nearby_triads"));
  expect(id, "nearby_triads failed to spawn").toBeTruthy();
  await settle(page);

  const reports = (await page.evaluate(() => (window as any).__ff.report())) as PanelReport[];
  const r = reports.find((p) => p.id === id)!;
  // Spawns at the global (horizontal) orientation: default 52×30 cells. Legibility
  // target = that footprint at MIN_CELL_PX=12; below that the multi-diagram content
  // is unusable. Hard assertions — MIN_CELL_PX guarantees this on every viewport.
  expect(r.w, `nearby_triads width ${r.w}px (cell ${r.cell}px)`).toBeGreaterThanOrEqual(52 * 12 - 1);
  expect(r.h, `nearby_triads height ${r.h}px (cell ${r.cell}px)`).toBeGreaterThanOrEqual(30 * 12 - 1);
});

// Its Reference display draws one board per chord, each under a label and over a row
// of voicing controls. A floating panel clips what does not fit (it has no scrollbar),
// so the boards must be planned around those, not have them pushed out of the panel.
test("nearby triads' boards fit their panel in the voice-leading layout", async ({ page }) => {
  test.skip(isMobile(page), "the tabbed layout has its own check in mobile.spec.ts");
  await prepPage(page);
  await page.goto("/?layout=voice_leading&fftest");
  await settleLayout(page);

  const fit = await page.evaluate(() => {
    const ff = (window as any).__ff;
    const id = (ff.report() as Array<{ id: string; viewId: string }>)
      .find((r) => r.viewId === "instrument_nearby_triads")?.id;
    const wrapper = id ? document.querySelector<HTMLElement>(`.floating-view-wrapper[data-instance-id="${id}"]`) : null;
    const content = wrapper?.querySelector<HTMLElement>(".floating-view-content");
    if (!content) return null;
    const area = content.getBoundingClientRect();
    return {
      clipped: content.scrollHeight - content.clientHeight,
      boards: [...content.querySelectorAll("canvas")].map((c) => {
        const r = c.getBoundingClientRect();
        return { w: r.width, bottom: area.bottom - r.bottom, right: area.right - r.right };
      }),
      drivenMode: [...content.querySelectorAll("button")].some(
        (b) => b.textContent === "Driven Mode" && b.offsetParent !== null,
      ),
    };
  });
  expect(fit, "the layout no longer has a Nearby Triads panel").not.toBeNull();
  expect(fit!.boards.length, "one board per chord").toBe(4);
  for (const b of fit!.boards) {
    expect(b.w, "a board was not drawn").toBeGreaterThan(40);
    expect(b.bottom, "a board is cut off by the bottom of its panel").toBeGreaterThanOrEqual(0);
    expect(b.right, "a board is cut off by the side of its panel").toBeGreaterThanOrEqual(0);
  }
  expect(fit!.clipped, "the panel's content is taller than the panel").toBeLessThanOrEqual(1);
  // Linked to the Backing Track here, so Driven Mode is on offer.
  expect(fit!.drivenMode, "the Driven Mode button is missing").toBe(true);
});
