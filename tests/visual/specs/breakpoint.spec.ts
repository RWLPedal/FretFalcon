// tests/visual/specs/breakpoint.spec.ts
// The desktop↔mobile strategy switch — the highest-risk device path. PanelHost
// listens to matchMedia(TABBED_MEDIA_QUERY) — narrow (≤768px) OR short (≤480px) — and
// on a crossing DESTROYS every panel chrome, unmounts the strategy, remounts the other
// one, and re-applies the saved layout (_switchStrategy). CSS follows through
// <html data-layout>, which PanelHost stamps. These tests drive page.setViewportSize
// across the boundary and assert nothing is lost, leaked, or left disagreeing between
// the JS and CSS sides — in the live page AND in the saved state a reload reads back.
//
// Runs on the desktop project only: the spec owns the viewport itself, so running it
// per-viewport-project would just duplicate it under misleading names.
import { test, expect, Page } from "@playwright/test";
import { prepPage, settleLayout } from "../helpers/inject";

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "breakpoint spec drives its own viewport");
});

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

const strategy = (page: Page) =>
  page.evaluate(() => (window as any).__ff.strategy() as string);
const tabsState = (page: Page) =>
  page.evaluate(
    () => (window as any).__ff.tabs() as { order: string[]; activeId: string | null } | null,
  );
const report = (page: Page) =>
  page.evaluate(() => (window as any).__ff.report() as unknown) as Promise<PanelReport[]>;
const instanceIds = async (page: Page) => (await report(page)).map((r) => r.id).sort();

interface SavedState {
  instances: Record<string, { viewId: string }>;
  links: unknown[];
  layout: {
    floating?: { perInstance: Record<string, unknown> };
    tabbed?: { order: string[] };
  };
}
/** The auto-save slot, as the next page load will read it. */
const savedState = (page: Page) =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem("floatingViewStates_reference")!).payload,
  ) as Promise<SavedState>;
const scrollableFlag = (page: Page) =>
  page.evaluate(() => (window as any).__ff.areaFlags().scrollable as boolean);

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
  });
  return errors;
}

/** The CSS side of the breakpoint: mobile.css hides the sidebar at ≤768px. */
const sidebarDisplay = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector(".side-bar-container");
    return el ? getComputedStyle(el).display : "(missing)";
  });

test("reference layout survives two full desktop→mobile→desktop cycles", async ({ page }) => {
  const errors = collectErrors(page);
  await prepPage(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/?layout=reference&fftest");
  await settleLayout(page);

  expect(await strategy(page)).toBe("floating");
  const originalIds = await instanceIds(page);
  expect(originalIds.length).toBeGreaterThan(0);

  // Two full cycles: ghost-rect and listener leaks only show on the second pass.
  for (let cycle = 1; cycle <= 2; cycle++) {
    // → mobile
    await page.setViewportSize({ width: 768, height: 768 });
    await settleLayout(page);
    expect(await strategy(page), `cycle ${cycle}: JS strategy at 768px`).toBe("tabbed");
    expect(await instanceIds(page), `cycle ${cycle}: instances lost going mobile`).toEqual(
      originalIds,
    );
    const tabs = (await tabsState(page))!;
    expect(tabs.order.slice().sort(), `cycle ${cycle}: tabs ≠ instances`).toEqual(originalIds);
    await expect(page.locator(".tabbed-tab-bar"), `cycle ${cycle}: tab bar missing`).toBeVisible();
    // FloatingLayout.unmount must remove is-scrollable — a leak strands mobile in a
    // phantom scroll state (documented gotcha in floating_layout.ts).
    expect(await scrollableFlag(page), `cycle ${cycle}: .is-scrollable leaked into tabbed`).toBe(
      false,
    );

    // → back to desktop
    await page.setViewportSize({ width: 1024, height: 768 });
    await settleLayout(page);
    expect(await strategy(page), `cycle ${cycle}: JS strategy at 1024px`).toBe("floating");
    expect(await instanceIds(page), `cycle ${cycle}: instances lost going desktop`).toEqual(
      originalIds,
    );

    // Panels re-fit cleanly: no overlap, no right overflow, every panel ≥ min.
    const reports = await report(page);
    for (let i = 0; i < reports.length; i++) {
      for (let j = i + 1; j < reports.length; j++) {
        const a = reports[i];
        const b = reports[j];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        const overlap = Math.max(0, ox) * Math.max(0, oy);
        expect
          .soft(overlap, `cycle ${cycle}: ${a.viewId} overlaps ${b.viewId} by ${overlap}px²`)
          .toBeLessThanOrEqual(1);
      }
    }
    for (const r of reports) {
      if (r.minW !== null)
        expect.soft(r.w, `cycle ${cycle}: ${r.viewId} below min width`).toBeGreaterThanOrEqual(r.minW - 1);
      if (r.minH !== null)
        expect.soft(r.h, `cycle ${cycle}: ${r.viewId} below min height`).toBeGreaterThanOrEqual(r.minH - 1);
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect.soft(overflow, `cycle ${cycle}: horizontal overflow after return`).toBeLessThanOrEqual(0);
  }

  expect(errors, errors.join("\n")).toEqual([]);
});

test("JS strategy and CSS media query flip together at exactly 768/769px", async ({ page }) => {
  await prepPage(page);
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto("/?layout=reference&fftest");
  await settleLayout(page);

  // 769px: one px above the boundary — both sides must say desktop.
  await page.setViewportSize({ width: 769, height: 800 });
  await settleLayout(page);
  expect(await strategy(page), "JS at 769px").toBe("floating");
  expect(await sidebarDisplay(page), "CSS at 769px (sidebar hidden too early)").not.toBe("none");
  await expect(page.locator(".tabbed-tab-bar")).toHaveCount(0);

  // 768px: the boundary itself — matchMedia (max-width: 768px) matches, CSS must too.
  await page.setViewportSize({ width: 768, height: 800 });
  await settleLayout(page);
  expect(await strategy(page), "JS at 768px").toBe("tabbed");
  expect(await sidebarDisplay(page), "CSS at 768px (sidebar still shown)").toBe("none");
  await expect(page.locator(".tabbed-tab-bar")).toBeVisible();

  // And back up: no sticky state in either direction.
  await page.setViewportSize({ width: 769, height: 800 });
  await settleLayout(page);
  expect(await strategy(page), "JS back at 769px").toBe("floating");
  expect(await sidebarDisplay(page), "CSS back at 769px").not.toBe("none");
});

test("a short viewport (phone on its side) gets the tabbed layout; a short-ish desktop does not", async ({ page }) => {
  await prepPage(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/?layout=reference&fftest");
  await settleLayout(page);

  // Wider than 768px, but only 390px tall: still a phone.
  expect(await strategy(page), "JS at 844×390").toBe("tabbed");
  expect(await sidebarDisplay(page), "CSS at 844×390 (sidebar shown on a phone)").toBe("none");

  // Turning it upright stays tabbed — no strategy switch, just a re-fit.
  await page.setViewportSize({ width: 390, height: 844 });
  await settleLayout(page);
  expect(await strategy(page), "JS at 390×844").toBe("tabbed");

  // The height rule stops at 480px: a merely short desktop window keeps the workspace.
  await page.setViewportSize({ width: 844, height: 481 });
  await settleLayout(page);
  expect(await strategy(page), "JS at 844×481").toBe("floating");
  expect(await sidebarDisplay(page), "CSS at 844×481").not.toBe("none");
});

test("panel positions and links survive a detour through the tabbed layout", async ({ page }) => {
  const errors = collectErrors(page);
  await prepPage(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?layout=reference&fftest");
  await settleLayout(page);

  const original = await savedState(page);
  const originalRects = original.layout.floating!.perInstance;
  expect(Object.keys(originalRects).length).toBe(4);
  expect(original.links.length).toBe(3);
  const originalReport = await report(page);

  // Narrow the window (e.g. snapped to half a laptop screen) and RELOAD there, so
  // the state is saved and restored by the tabbed layout — the path that used to
  // drop the floating geometry.
  await page.setViewportSize({ width: 700, height: 800 });
  await settleLayout(page);
  expect(await strategy(page)).toBe("tabbed");
  await page.goto("/?fftest");
  await settleLayout(page);
  expect(await strategy(page)).toBe("tabbed");

  const whileTabbed = await savedState(page);
  expect(whileTabbed.layout.floating?.perInstance, "floating geometry lost while tabbed").toEqual(
    originalRects,
  );
  expect(whileTabbed.links.length, "links lost while tabbed").toBe(3);

  // Back to a desktop width, reloading again: every panel is where it was authored.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?fftest");
  await settleLayout(page);
  expect(await strategy(page)).toBe("floating");

  const back = await savedState(page);
  expect(back.layout.floating?.perInstance, "panel rects changed by the detour").toEqual(
    originalRects,
  );
  expect(back.links.length, "links lost by the detour").toBe(3);
  const backReport = await report(page);
  for (const o of originalReport) {
    const b = backReport.find((r) => r.id === o.id)!;
    expect(b, `${o.viewId} lost`).toBeTruthy();
    expect(Math.abs(b.x - o.x), `${o.viewId} moved horizontally`).toBeLessThanOrEqual(1);
    expect(Math.abs(b.y - o.y), `${o.viewId} moved vertically`).toBeLessThanOrEqual(1);
  }

  expect(errors, errors.join("\n")).toEqual([]);
});

test("an in-session switch returns panels to their places, not a re-pack", async ({ page }) => {
  await prepPage(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?layout=reference&fftest");
  await settleLayout(page);
  const originalReport = await report(page);

  await page.setViewportSize({ width: 700, height: 800 });
  await settleLayout(page);
  expect(await strategy(page)).toBe("tabbed");
  await page.setViewportSize({ width: 1280, height: 800 });
  await settleLayout(page);
  expect(await strategy(page)).toBe("floating");

  const backReport = await report(page);
  for (const o of originalReport) {
    const b = backReport.find((r) => r.id === o.id)!;
    expect(Math.abs(b.x - o.x), `${o.viewId} moved horizontally`).toBeLessThanOrEqual(1);
    expect(Math.abs(b.y - o.y), `${o.viewId} moved vertically`).toBeLessThanOrEqual(1);
  }
});

test("links survive a plain reload", async ({ page }) => {
  // Regression: restore used to save once per panel BEFORE the links were
  // registered, overwriting the auto-save with links: []. Nothing re-saved
  // afterwards, so the next reload came up with no links at all.
  await prepPage(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?layout=reference&fftest");
  await settleLayout(page);
  expect((await savedState(page)).links.length, "links missing right after load").toBe(3);

  for (const pass of [1, 2]) {
    await page.goto("/?fftest");
    await settleLayout(page);
    expect((await savedState(page)).links.length, `links lost on reload ${pass}`).toBe(3);
  }
});

test("tab titles and link connectors survive a desktop→mobile switch", async ({ page }) => {
  await prepPage(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?layout=reference&fftest");
  await settleLayout(page);

  await page.setViewportSize({ width: 700, height: 800 });
  await settleLayout(page);
  expect(await strategy(page)).toBe("tabbed");

  // Titles carry over from the floating chrome instead of resetting to the generic
  // panel name ("Scale"), and keep tracking the panel afterwards.
  const titles = await page.locator(".tabbed-tab-title").allInnerTexts();
  expect(titles, "tab titles reset to generic names by the switch").toContain("G Major");
  expect(titles).not.toContain("Scale");

  // The Scale panel drives its neighbours: the connectors must be drawn.
  await expect(
    page.locator(".tabbed-link-connector.is-linked"),
    "no link connectors after the switch",
  ).not.toHaveCount(0);
});

test("the Global Key panel is kept, not deleted, by a visit to the tabbed layout", async ({ page }) => {
  const errors = collectErrors(page);
  await prepPage(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?layout=empty&fftest");
  await settleLayout(page);

  const keyId = await page.evaluate(() => (window as any).__ff.spawn("global_key"));
  const scaleId = await page.evaluate(() => (window as any).__ff.spawn("instrument_scale"));
  expect(keyId && scaleId).toBeTruthy();
  await settleLayout(page);

  // Reload at a mobile width: Global Key has no tab there …
  await page.setViewportSize({ width: 700, height: 800 });
  await page.goto("/?fftest");
  await settleLayout(page);
  expect((await tabsState(page))!.order, "Global Key got a tab on mobile").toEqual([scaleId]);
  // … but it is still in the saved state,
  expect(
    Object.values((await savedState(page)).instances).map((i) => i.viewId).sort(),
    "Global Key dropped from the saved state by a mobile load",
  ).toEqual(["global_key", "instrument_scale"]);

  // and a panel opened meanwhile does not take over its instance id.
  const timerId = await page.evaluate(() => (window as any).__ff.spawn("floating_timer"));
  expect(timerId, "new panel reused the dormant panel's id").not.toBe(keyId);
  await settleLayout(page);

  // … and comes back when the layout is floating again — live, or after a reload.
  await page.setViewportSize({ width: 1280, height: 800 });
  await settleLayout(page);
  expect((await report(page)).map((r) => r.viewId).sort(), "Global Key missing after switch").toEqual(
    ["floating_timer", "global_key", "instrument_scale"],
  );
  await page.goto("/?fftest");
  await settleLayout(page);
  expect((await report(page)).map((r) => r.viewId).sort(), "Global Key missing after reload").toEqual(
    ["floating_timer", "global_key", "instrument_scale"],
  );

  expect(errors, errors.join("\n")).toEqual([]);
});

test("a panel spawned mid-session survives the round trip with a sane rect", async ({ page }) => {
  const errors = collectErrors(page);
  await prepPage(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/?layout=empty&fftest");
  await settleLayout(page);

  const id = await page.evaluate(() => (window as any).__ff.spawn("instrument_scale"));
  expect(id).toBeTruthy();
  await settleLayout(page);

  await page.setViewportSize({ width: 768, height: 768 });
  await settleLayout(page);
  expect((await tabsState(page))!.order).toContain(id);

  await page.setViewportSize({ width: 1024, height: 768 });
  await settleLayout(page);
  const reports = await report(page);
  const r = reports.find((p) => p.id === id);
  expect(r, "panel lost in the round trip").toBeTruthy();
  // Sane rect: on-screen, non-degenerate.
  expect(r!.w).toBeGreaterThan(50);
  expect(r!.h).toBeGreaterThan(50);
  expect(r!.x).toBeGreaterThanOrEqual(0);
  expect(r!.y).toBeGreaterThanOrEqual(0);
  const vw = page.viewportSize()!.width;
  expect(r!.x + r!.w, "panel off the right edge after round trip").toBeLessThanOrEqual(vw + 1);

  expect(errors, errors.join("\n")).toEqual([]);
});
