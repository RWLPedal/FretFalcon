// tests/visual/specs/resize.spec.ts
// Desktop resize behaviour: the fit-aware cell, scroll-instead-of-shrink, reconcile
// stability, and the sidebar-collapse relayout (the second resize authority — a
// ResizeObserver on the sidebar, independent of window resize events).
//
// Runs on the desktop project only (it drives the viewport itself); the ultrawide
// cell-clamp check runs on the ultrawide project.
import { test, expect, Page } from "@playwright/test";
import { prepPage, settleLayout } from "../helpers/inject";
import {
  DESIGN_ROWS,
  MIN_CELL_PX,
  MAX_CELL_PX,
  fitGridGeometry,
} from "../../../ts/panels/grid_constants";

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

const report = (page: Page) =>
  page.evaluate(() => (window as any).__ff.report() as unknown) as Promise<PanelReport[]>;
const gridInfo = (page: Page) =>
  page.evaluate(
    () => (window as any).__ff.gridInfo() as { cell: number; originX: number; cols: number },
  );
const scrollableFlag = (page: Page) =>
  page.evaluate(() => (window as any).__ff.areaFlags().scrollable as boolean);
const areaClientHeight = (page: Page) =>
  page.evaluate(() => document.getElementById("floating-view-area")!.clientHeight);

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
  });
  return errors;
}

async function assertCleanLayout(page: Page, label: string): Promise<void> {
  const reports = await report(page);
  const g = await gridInfo(page);

  expect(g.cell, `${label}: cell below floor`).toBeGreaterThanOrEqual(MIN_CELL_PX);
  expect(g.cell, `${label}: cell above ceiling`).toBeLessThanOrEqual(MAX_CELL_PX);

  for (let i = 0; i < reports.length; i++) {
    for (let j = i + 1; j < reports.length; j++) {
      const a = reports[i];
      const b = reports[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      const overlap = Math.max(0, ox) * Math.max(0, oy);
      expect
        .soft(overlap, `${label}: ${a.viewId} overlaps ${b.viewId} by ${overlap}px²`)
        .toBeLessThanOrEqual(1);
    }
  }
  for (const r of reports) {
    if (r.minW !== null)
      expect.soft(r.w, `${label}: ${r.viewId} below min width`).toBeGreaterThanOrEqual(r.minW - 1);
    if (r.minH !== null)
      expect.soft(r.h, `${label}: ${r.viewId} below min height`).toBeGreaterThanOrEqual(r.minH - 1);
  }

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect.soft(overflow, `${label}: horizontal overflow`).toBeLessThanOrEqual(0);

  // Scroll-instead-of-shrink, both directions: the area scrolls exactly when the
  // design space no longer fits its height (floating_layout._applyScrollMode).
  const designHeight = DESIGN_ROWS * g.cell;
  const areaH = await areaClientHeight(page);
  const scrollable = await scrollableFlag(page);
  expect(
    scrollable,
    `${label}: is-scrollable=${scrollable} but designHeight=${designHeight} vs areaHeight=${areaH}`,
  ).toBe(designHeight > areaH + 0.5);
}

test("resize gauntlet: layout stays clean at every stop", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "resize spec drives its own viewport");
  const errors = collectErrors(page);
  await prepPage(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/?layout=practice_advanced&fftest");
  await settleLayout(page);
  await assertCleanLayout(page, "initial 1920×1080");

  const stops: Array<[number, number]> = [
    [1366, 768],
    [1600, 560], // MIN_CELL_PX floor + scroll mode
    [1280, 1024],
    [1920, 1080], // back where we started
  ];
  for (const [w, h] of stops) {
    await page.setViewportSize({ width: w, height: h });
    await settleLayout(page);
    await assertCleanLayout(page, `${w}×${h}`);
  }

  expect(errors, errors.join("\n")).toEqual([]);
});

test("moderate resize round trip restores the original geometry", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "resize spec drives its own viewport");
  await prepPage(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/?layout=reference&fftest");
  await settleLayout(page);
  const before = await report(page);
  const cellBefore = (await gridInfo(page)).cell;

  await page.setViewportSize({ width: 1366, height: 900 });
  await settleLayout(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await settleLayout(page);

  // Canonical rects are re-derived from grid coordinates each pass (no px→cell→px
  // round-tripping), so a resize that never triggered reconcile is lossless.
  expect((await gridInfo(page)).cell, "cell did not return to initial").toBe(cellBefore);
  const after = await report(page);
  expect(after.length).toBe(before.length);
  for (const b of before) {
    const a = after.find((r) => r.id === b.id)!;
    expect(a, `panel ${b.viewId} missing after round trip`).toBeTruthy();
    expect(Math.abs(a.x - b.x), `${b.viewId} drifted in x`).toBeLessThanOrEqual(1);
    expect(Math.abs(a.y - b.y), `${b.viewId} drifted in y`).toBeLessThanOrEqual(1);
    expect(Math.abs(a.w - b.w), `${b.viewId} drifted in width`).toBeLessThanOrEqual(1);
    expect(Math.abs(a.h - b.h), `${b.viewId} drifted in height`).toBeLessThanOrEqual(1);
  }
});

test("sidebar collapse/expand re-fits the grid (the ResizeObserver authority)", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "resize spec drives its own viewport");
  const errors = collectErrors(page);
  await prepPage(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/?layout=reference&fftest");
  await settleLayout(page);

  const before = await gridInfo(page);
  expect(before.originX, "sidebar should occupy the origin initially").toBeGreaterThan(0);

  await page.click("#sidebar-collapse-btn");
  await settleLayout(page);
  const collapsed = await gridInfo(page);
  expect(collapsed.originX, "collapse did not move the grid origin").toBeLessThan(before.originX);
  await assertCleanLayout(page, "sidebar collapsed");

  await page.click("#sidebar-collapse-btn");
  await settleLayout(page);
  const expanded = await gridInfo(page);
  expect(expanded.originX, "expand did not restore the grid origin").toBe(before.originX);
  expect(expanded.cell, "expand did not restore the cell").toBe(before.cell);
  await assertCleanLayout(page, "sidebar expanded");

  expect(errors, errors.join("\n")).toEqual([]);
});

test("ultrawide: the cell follows the fit model and content stays left-anchored", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "ultrawide", "runs on the ultrawide project");
  await prepPage(page);
  await page.goto("/?layout=reference&fftest");
  await settleLayout(page);

  const g = await gridInfo(page);
  // 2560×1080 is height-bound (1080/61 → 17): the live cell must equal the pure
  // fitGridGeometry model for the live area box. (The MAX_CELL_PX=22 clamp itself
  // needs a ≥1342px-tall viewport and is pinned in grid_geometry.test.ts.)
  const area = await page.evaluate(() => {
    const el = document.getElementById("floating-view-area")!;
    return { w: el.clientWidth, h: el.clientHeight };
  });
  const expected = fitGridGeometry(area.w, g.originX, area.h, DESIGN_ROWS).cell;
  expect(g.cell, `live cell disagrees with the fit model at ${area.w}×${area.h}`).toBe(expected);
  // Left-anchored: grid col 0 sits at the sidebar edge, not centered/stretched.
  const sidebarWidth = await page.evaluate(
    () => document.querySelector<HTMLElement>(".side-bar-container")?.offsetWidth ?? 0,
  );
  expect(Math.abs(g.originX - sidebarWidth)).toBeLessThanOrEqual(1);
  await assertCleanLayout(page, "ultrawide");
});
