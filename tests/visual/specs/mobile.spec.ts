// tests/visual/specs/mobile.spec.ts
// Tabbed (mobile) layout behaviour on the mobile projects: the first-run starter, the
// tab bar (many tabs, activation, links, reorder), the top-bar panel actions, the
// bottom sheets (add a tool, menu), touch-target sizes, fit-to-screen fretboards, and
// what a mobile session leaves in the saved state. phone-touch additionally drives
// tabs with real tap events (Pixel 7 emulation: touch + mobile UA); phone-landscape is
// a phone on its side (wider than the 768px breakpoint, kept tabbed by its height).
// The tablet project is the one screen with room for TWO panes: wherever a test says
// "on screen", it means the active tab plus, there, its neighbour.
//
// The long-press tab drag is driven once, on phone-touch, with raw touch points over
// CDP (the only input that exercises native panning alongside it). Everything else
// about reordering goes through the bridge (__ff.reorderTabs).
import { test, expect, Page } from "@playwright/test";
import { prepPage, settle, settleLayout } from "../helpers/inject";
// Pure rules (no DOM): the same functions the app decides panes with.
import { tabbedPanes, tabbedPaneSize } from "../../../ts/panels/layout/layout_mode";

const MOBILE_PROJECTS = ["tablet", "phone", "phone-small", "phone-touch", "phone-landscape"];

test.beforeEach(({}, testInfo) => {
  test.skip(!MOBILE_PROJECTS.includes(testInfo.project.name), "mobile projects only");
});

interface ViewInfo {
  viewId: string;
  singleton: boolean;
  showInMenu: boolean;
  desktopOnly: boolean;
  mobileOnly: boolean;
}

interface SavedState {
  instances: Record<string, { viewId: string; orientationOverride?: string; tabbedOrientation?: string }>;
  links: Array<{ sourceInstanceId: string; targetInstanceId: string }>;
  layout: {
    floating?: { perInstance: Record<string, unknown> };
    tabbed?: { order: string[]; activeId?: string; split?: number };
  };
}

const tabsState = (page: Page) =>
  page.evaluate(
    () =>
      (window as any).__ff.tabs() as {
        order: string[];
        activeId: string | null;
        visible: string[];
      } | null,
  );

/** How many panels this project's screen shows at once (2 on the tablet). */
const paneCapacity = (page: Page) => {
  const vp = page.viewportSize()!;
  return tabbedPanes(vp.width, vp.height).count;
};

/** The auto-save slot, as the next page load will read it. */
const savedState = (page: Page) =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem("floatingViewStates_reference")!).payload,
  ) as Promise<SavedState>;

const visibleTabPanelIds = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".tabbed-panel")]
      .filter((p) => p.style.display !== "none" && p.offsetParent !== null)
      .map((p) => p.dataset.instanceId ?? "?"),
  );

/** Rendered size of the first canvas in the active tab's panel. */
const activeCanvasSize = (page: Page) =>
  page.evaluate(() => {
    const activeId = (window as any).__ff.tabs()?.activeId;
    const panel = [...document.querySelectorAll<HTMLElement>(".tabbed-panel")].find(
      (p) => p.dataset.instanceId === activeId,
    );
    const canvas = panel?.querySelector("canvas");
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    return { w: r.width, h: r.height, left: r.left, right: r.right };
  });

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
  });
  return errors;
}

/** Spawn up to `n` mobile-eligible panels and return their instance ids. */
async function spawnPanels(page: Page, n: number): Promise<string[]> {
  const views = (await page.evaluate(() => (window as any).__ff.listViews())) as ViewInfo[];
  const eligible = views.filter((v) => !v.desktopOnly && v.showInMenu).slice(0, n);
  const ids: string[] = [];
  for (const v of eligible) {
    const id = (await page.evaluate(
      (vid) => (window as any).__ff.spawn(vid),
      v.viewId,
    )) as string | null;
    if (id) ids.push(id);
    await settle(page);
  }
  return ids;
}

async function open(page: Page, query: string): Promise<void> {
  await prepPage(page);
  await page.goto(`/?${query}`);
  await settleLayout(page);
}

// ─── First run ────────────────────────────────────────────────────────────────

test("a first visit opens the starter tabs with a hint, once", async ({ page }) => {
  const errors = collectErrors(page);
  // No ?layout and empty storage: this is what a brand-new phone visitor gets.
  await open(page, "fftest");

  const tabs = (await tabsState(page))!;
  expect(tabs.order.length, "first run left the screen empty").toBeGreaterThanOrEqual(3);
  expect(tabs.activeId, "first run has no active tab").toBeTruthy();
  await expect(page.locator(".tabbed-toast"), "first-run hint missing").toContainText("Tap +");

  // The starter is saved like any other state, links included.
  const saved = await savedState(page);
  expect(Object.keys(saved.instances).length).toBe(tabs.order.length);
  expect(saved.links.length, "starter link not saved").toBe(1);

  // Second visit: same tabs, restored from the save — and no hint this time.
  await page.goto("/?fftest");
  await settleLayout(page);
  expect((await tabsState(page))!.order).toEqual(tabs.order);
  await expect(page.locator(".tabbed-toast")).toBeHidden();

  expect(errors, errors.join("\n")).toEqual([]);
});

test("closing every tab shows an empty state that can add a tool", async ({ page }) => {
  await open(page, "layout=empty&fftest");

  const empty = page.locator(".tabbed-empty-state");
  await expect(empty, "empty state missing with no tabs").toBeVisible();
  await empty.locator(".tabbed-empty-add").click();
  await expect(page.locator(".tabbed-sheet")).toBeVisible();
  await page.locator(".tabbed-sheet-item").first().click();
  await settleLayout(page);

  expect((await tabsState(page))!.order.length).toBe(1);
  await expect(empty).toBeHidden();
});

// ─── Tab bar ──────────────────────────────────────────────────────────────────

test("tab bar stays usable with 8 panels open", async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, "layout=empty&fftest");

  const ids = await spawnPanels(page, 8);
  expect(ids.length, "could not spawn 8 mobile panels").toBe(8);
  await settleLayout(page);

  const tabs = (await tabsState(page))!;
  expect(tabs.order.slice().sort()).toEqual(ids.slice().sort());

  // The bar itself stays within the viewport; its tab strip scrolls internally, so
  // it must never widen the page.
  const vw = page.viewportSize()!.width;
  const bar = await page.locator(".tabbed-tab-bar").boundingBox();
  expect(bar, "tab bar missing").toBeTruthy();
  expect(bar!.width, "tab bar wider than the viewport").toBeLessThanOrEqual(vw + 1);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "page overflows horizontally with 8 tabs").toBeLessThanOrEqual(0);

  // The add button is pinned outside the scrolling strip: always on screen.
  const add = (await page.locator(".tabbed-add-btn").boundingBox())!;
  expect(add.x, "add button scrolled off the left").toBeGreaterThanOrEqual(0);
  expect(add.x + add.width, "add button scrolled off the right").toBeLessThanOrEqual(vw + 1);

  // Whichever tab is active is scrolled into view — first, last and middle.
  for (const id of [ids[0], ids[7], ids[3]]) {
    await page.evaluate((iid) => (window as any).__ff.activateTab(iid), id);
    await settle(page);
    const tab = (await page.locator(`.tabbed-tab[data-instance-id="${id}"]`).boundingBox())!;
    expect(tab.x, `active tab ${id} is off the left of the strip`).toBeGreaterThanOrEqual(0);
    expect(tab.x + tab.width, `active tab ${id} is hidden behind the add button`).toBeLessThanOrEqual(
      add.x + 1,
    );
  }

  expect(errors, errors.join("\n")).toEqual([]);
});

test("activating a tab puts it on screen: alone on a phone, beside a neighbour on a tablet", async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, "layout=empty&fftest");
  const capacity = paneCapacity(page);

  const ids = await spawnPanels(page, 4);
  expect(ids.length).toBe(4);

  for (const id of ids) {
    await page.evaluate((iid) => (window as any).__ff.activateTab(iid), id);
    await settle(page);
    const shown = await visibleTabPanelIds(page);
    const state = (await tabsState(page))!;
    expect(state.activeId).toBe(id);
    expect(shown, `activateTab(${id}) did not show it: [${shown}]`).toContain(id);
    expect(shown.length, `activateTab(${id}) left on screen: [${shown}]`).toBe(capacity);
    expect([...shown].sort(), "the DOM and the layout disagree about what is on screen").toEqual(
      [...state.visible].sort(),
    );
    if (capacity === 2) {
      const [a, b] = state.visible.map((v) => state.order.indexOf(v));
      expect(b - a, `panes are not neighbouring tabs, in tab order: [${state.visible}]`).toBe(1);
    }
  }

  expect(errors, errors.join("\n")).toEqual([]);
});

test("tabs respond to real taps (touch emulation)", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone-touch", "touch project only");
  const errors = collectErrors(page);
  await open(page, "layout=empty&fftest");

  const ids = await spawnPanels(page, 3);
  expect(ids.length).toBe(3);

  // Tap the first tab (spawning leaves the last one active).
  const firstTab = page.locator(`.tabbed-tab[data-instance-id="${ids[0]}"]`);
  await firstTab.tap();
  await settle(page);
  expect((await tabsState(page))!.activeId, "tap did not activate the tab").toBe(ids[0]);
  expect(await visibleTabPanelIds(page)).toEqual([ids[0]]);

  // A sideways swipe across the panel turns to the next tab, and back again. Raw
  // touch points through CDP, as a finger would produce them.
  const cdp = await page.context().newCDPSession(page);
  const swipe = async (fromX: number, toX: number, y: number) => {
    const point = (x: number) => [{ x, y, id: 1 }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(fromX) });
    for (let i = 1; i <= 6; i++) {
      const x = fromX + ((toX - fromX) * i) / 6;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(x) });
      await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  const vp = page.viewportSize()!;
  const midY = vp.height / 2;
  const activeTab = async () => (await tabsState(page))!.activeId;

  await swipe(vp.width - 60, 60, midY); // finger moves left: the next tab
  await expect.poll(activeTab, { message: "swipe left did not bring the next tab" }).toBe(ids[1]);
  expect(await visibleTabPanelIds(page)).toEqual([ids[1]]);

  await swipe(60, vp.width - 60, midY); // finger moves right: back
  await expect.poll(activeTab, { message: "swipe right did not go back" }).toBe(ids[0]);

  await swipe(60, vp.width - 60, midY); // already the first tab: nothing before it
  await page.waitForTimeout(150);
  expect(await activeTab(), "swiping past the first tab went somewhere").toBe(ids[0]);

  // A vertical drag is a scroll, not a swipe.
  const point = (y: number) => [{ x: vp.width / 2, y, id: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(midY + 120) });
  for (let i = 1; i <= 6; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(midY + 120 - i * 40) });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(150);
  expect(await activeTab(), "a vertical drag switched tabs").toBe(ids[0]);

  expect(errors, errors.join("\n")).toEqual([]);
});

test("long-press drag reorders tabs; a quick swipe scrolls the strip (real touch)", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone-touch", "touch project only");
  const errors = collectErrors(page);
  // Raw touch points through CDP: this goes through Chromium's real touch pipeline
  // (native panning, pointercancel), which is what the drag has to coexist with.
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", x: number, y: number) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }],
    });
  const stripScroll = () =>
    page.evaluate(() => document.querySelector(".tabbed-tab-strip")!.scrollLeft);
  const tabBox = async (id: string) =>
    (await page.locator(`.tabbed-tab[data-instance-id="${id}"]`).boundingBox())!;

  await open(page, "layout=reference&fftest");
  const before = (await tabsState(page))!;
  const dragged = before.activeId!; // the active tab is always on screen
  const index = before.order.indexOf(dragged);
  expect(index, "need a tab to the left of the active one").toBeGreaterThan(0);
  const neighbour = before.order[index - 1];

  // Hold the active tab past the long-press delay, then drag it left past its neighbour.
  const from = await tabBox(dragged);
  const to = await tabBox(neighbour);
  const startX = from.x + from.width / 2;
  const y = from.y + from.height / 2;
  const endX = to.x + 4;
  const scrollBefore = await stripScroll();

  await touch("touchStart", startX, y);
  await expect(page.locator(".tabbed-tab-ghost"), "long press did not start a drag").toBeVisible();
  for (let i = 1; i <= 8; i++) {
    await touch("touchMove", startX + ((endX - startX) * i) / 8, y);
    await page.waitForTimeout(20);
  }
  // The strip must not pan underneath an active drag.
  expect(await stripScroll(), "strip scrolled during the drag").toBe(scrollBefore);
  await touch("touchEnd", endX, y);
  await expect(page.locator(".tabbed-tab-ghost")).toHaveCount(0);

  const expected = before.order.slice();
  expected.splice(index, 1);
  expected.splice(index - 1, 0, dragged);
  await expect.poll(async () => (await tabsState(page))!.order).toEqual(expected);
  const after = (await tabsState(page))!;
  expect(after.activeId, "finishing a drag switched tabs").toBe(before.activeId);
  expect((await savedState(page)).links.length, "drag-reorder deleted links").toBe(3);
  expect((await savedState(page)).layout.tabbed?.order, "new order not saved").toEqual(expected);

  // Without the long press, the same gesture is a scroll: with enough tabs to
  // overflow, a quick swipe pans the strip and reorders nothing.
  await page.goto("/?layout=empty&fftest");
  await settleLayout(page);
  const ids = await spawnPanels(page, 8);
  expect(ids.length).toBe(8);
  await settleLayout(page);
  const order = (await tabsState(page))!.order;
  const strip = (await page.locator(".tabbed-tab-strip").boundingBox())!;
  const swipeY = strip.y + strip.height / 2;
  const scrollStart = await stripScroll();
  expect(scrollStart, "strip should be scrolled to the active (last) tab").toBeGreaterThan(0);

  await touch("touchStart", strip.x + 60, swipeY);
  for (let i = 1; i <= 8; i++) {
    await touch("touchMove", strip.x + 60 + i * 20, swipeY);
    await page.waitForTimeout(16);
  }
  await touch("touchEnd", strip.x + 220, swipeY);

  await expect.poll(stripScroll, { message: "swipe did not scroll the strip" }).toBeLessThan(scrollStart);
  expect((await tabsState(page))!.order, "a swipe reordered tabs").toEqual(order);

  expect(errors, errors.join("\n")).toEqual([]);
});

// ─── Top-bar panel actions ────────────────────────────────────────────────────

test("the close action closes the active tab and reveals its neighbour", async ({ page }) => {
  await open(page, "layout=mobile_starter&fftest");
  const before = (await tabsState(page))!;
  expect(before.order.length).toBe(3);

  // Close the middle tab: the tab that slides into its place becomes active.
  await page.evaluate((iid) => (window as any).__ff.activateTab(iid), before.order[1]);
  await settle(page);
  await page.locator(".tabbed-close-btn").click();
  await settleLayout(page);

  const after = (await tabsState(page))!;
  expect(after.order).toEqual([before.order[0], before.order[2]]);
  expect(after.activeId, "closing a tab did not reveal its neighbour").toBe(before.order[2]);
  const shown = await visibleTabPanelIds(page);
  expect(shown).toContain(before.order[2]);
  // Two tabs are left: a tablet shows both, a phone the revealed one.
  expect(shown.length).toBe(paneCapacity(page));
});

test("panel options stay compact: one swipeable row per button group", async ({ page }) => {
  await open(page, "layout=mobile_starter&fftest");
  const scaleId = (await tabsState(page))!.order[0];
  await page.evaluate((iid) => (window as any).__ff.activateTab(iid), scaleId);
  await settleLayout(page);

  const m = await page.evaluate(() => {
    const panel = [...document.querySelectorAll<HTMLElement>(".tabbed-panel")].find(
      (p) => p.style.display !== "none",
    )!;
    const options = panel.querySelector<HTMLElement>(".config-compact")!;
    const group = options.querySelector<HTMLElement>(".toggle-buttons-wrap")!;
    const tops = [...group.querySelectorAll<HTMLElement>("button")]
      .filter((b) => b.offsetParent)
      .map((b) => Math.round(b.getBoundingClientRect().top));
    return {
      optionsHeight: options.offsetHeight,
      areaHeight: panel.clientHeight,
      buttonRows: new Set(tops).size,
      buttonCount: tops.length,
      groupOverflow: group.scrollWidth - group.clientWidth,
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  // The Scale panel's twelve note buttons used to wrap onto two or three rows.
  expect(m.buttonCount).toBe(12);
  expect(m.buttonRows, "note buttons wrapped onto several rows").toBe(1);
  expect(m.pageOverflow, "the button row widened the page instead of scrolling").toBeLessThanOrEqual(0);
  // Two rows of controls with their captions: well under a fifth of a phone screen.
  expect(m.optionsHeight, "options block too tall").toBeLessThanOrEqual(120);
});

test("hiding a panel's options gives the fretboard the room", async ({ page }) => {
  await open(page, "layout=mobile_starter&fftest");
  const scaleId = (await tabsState(page))!.order[0];
  await page.evaluate((iid) => (window as any).__ff.activateTab(iid), scaleId);
  await settleLayout(page);

  const vp = page.viewportSize()!;
  const withOptions = (await activeCanvasSize(page))!;
  const toggle = page.getByRole("button", { name: "Hide options" });
  await expect(toggle, "no options toggle for a configurable panel").toBeVisible();
  await toggle.click();
  await expect(page.getByRole("button", { name: "Show options" })).toBeVisible();

  const area = async () => {
    const c = (await activeCanvasSize(page))!;
    return c.w * c.h;
  };
  // A board lying across its pane and already as wide as it (the tablet's half-screen
  // panes) has nothing to gain from more height: it must simply not lose any.
  const widthBound = withOptions.w > withOptions.h && withOptions.w >= vp.width - 32;
  if (widthBound) {
    await settleLayout(page);
    expect(await area(), "fretboard shrank after hiding the options").toBeGreaterThanOrEqual(
      withOptions.w * withOptions.h * 0.99,
    );
    return;
  }
  // Otherwise the fretboard re-fits into the space the options gave up (area, not one
  // axis: which axis grows depends on the fretboard's orientation).
  await expect
    .poll(area, { message: "fretboard did not grow after hiding the options" })
    .toBeGreaterThan(withOptions.w * withOptions.h * 1.1);
});

// ─── Fit to screen ────────────────────────────────────────────────────────────

test("a fretboard runs along the long axis of its pane and fits inside it", async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, "layout=mobile_starter&fftest");
  const scaleId = (await tabsState(page))!.order[0];
  await page.evaluate((iid) => (window as any).__ff.activateTab(iid), scaleId);
  await settleLayout(page);

  const vp = page.viewportSize()!;
  const canvas = (await activeCanvasSize(page))!;
  expect(canvas, "scale panel rendered no canvas").toBeTruthy();
  // The pane is the whole screen on a phone, half of it on the tablet (which makes
  // an upright tablet's panes wider than tall).
  const pane = tabbedPaneSize(vp.width, vp.height);
  if (pane.height > pane.width) {
    expect(canvas.h, "tall pane: fretboard should be vertical").toBeGreaterThan(canvas.w);
  } else {
    expect(canvas.w, "wide pane: fretboard should be horizontal").toBeGreaterThan(canvas.h);
  }
  // Fit, not clipped: the canvas stays inside the screen with a gutter either side.
  expect(canvas.left, "fretboard touches the left edge").toBeGreaterThanOrEqual(8);
  expect(canvas.right, "fretboard runs off the right edge").toBeLessThanOrEqual(vp.width - 8);

  // The panel has nothing to scroll: the fretboard was sized to the room it has.
  const scrollSlack = await page.evaluate(() => {
    const activeId = (window as any).__ff.tabs().activeId;
    const content = [...document.querySelectorAll<HTMLElement>(".tabbed-panel")]
      .find((p) => p.dataset.instanceId === activeId)!
      .querySelector<HTMLElement>(".tabbed-panel-content")!;
    return {
      x: content.scrollWidth - content.clientWidth,
      y: content.scrollHeight - content.clientHeight,
    };
  });
  expect(scrollSlack.x, "scale panel scrolls sideways").toBeLessThanOrEqual(0);
  expect(scrollSlack.y, "scale panel scrolls vertically").toBeLessThanOrEqual(0);

  expect(errors, errors.join("\n")).toEqual([]);
});

test("rotate flips the active fretboard and is remembered for mobile only", async ({ page }) => {
  await open(page, "layout=mobile_starter&fftest");
  const scaleId = (await tabsState(page))!.order[0];
  await page.evaluate((iid) => (window as any).__ff.activateTab(iid), scaleId);
  await settleLayout(page);

  const before = (await activeCanvasSize(page))!;
  await page.getByRole("button", { name: "Rotate fretboard" }).click();
  await expect
    .poll(async () => {
      const c = (await activeCanvasSize(page))!;
      return c.w > c.h;
    }, { message: "rotate did not flip the fretboard" })
    .toBe(!(before.w > before.h));

  // Stored as the tabbed orientation — the desktop override is untouched, so the
  // same layout opened on a desktop keeps its own orientation.
  const saved = await savedState(page);
  expect(saved.instances[scaleId].tabbedOrientation).toBeTruthy();
  expect(saved.instances[scaleId].orientationOverride).toBeUndefined();

  // And it survives a reload.
  await page.goto("/?fftest");
  await settleLayout(page);
  await page.evaluate((iid) => (window as any).__ff.activateTab(iid), scaleId);
  await settleLayout(page);
  const after = (await activeCanvasSize(page))!;
  expect(after.w > after.h, "rotation lost on reload").toBe(!(before.w > before.h));
});

test("Fretboard Notes fits the screen instead of overflowing sideways", async ({ page }) => {
  await open(page, "layout=empty&fftest");
  const id = await page.evaluate(() => (window as any).__ff.spawn("instrument_notes_reference"));
  expect(id).toBeTruthy();
  await settleLayout(page);

  const vp = page.viewportSize()!;
  const canvas = (await activeCanvasSize(page))!;
  expect(canvas.left, "notes fretboard off the left edge").toBeGreaterThanOrEqual(0);
  expect(canvas.right, "notes fretboard overflows the right edge").toBeLessThanOrEqual(vp.width);
});

// ─── Touch targets ────────────────────────────────────────────────────────────

test("shell controls are finger-sized", async ({ page }) => {
  await open(page, "layout=mobile_starter&fftest");
  const scaleId = (await tabsState(page))!.order[0];
  await page.evaluate((iid) => (window as any).__ff.activateTab(iid), scaleId);
  await settleLayout(page);

  /** Smallest [width, height] among the visible matches, plus how many matched. */
  const smallest = (selector: string) =>
    page.evaluate((sel) => {
      const els = [...document.querySelectorAll<HTMLElement>(sel)].filter((e) => e.offsetParent);
      const rects = els.map((e) => e.getBoundingClientRect());
      return {
        count: els.length,
        w: Math.min(...rects.map((r) => r.width)),
        h: Math.min(...rects.map((r) => r.height)),
      };
    }, selector);

  const expectAtLeast = async (selector: string, minW: number, minH: number) => {
    const s = await smallest(selector);
    expect(s.count, `no visible ${selector}`).toBeGreaterThan(0);
    expect(s.w, `${selector} narrower than ${minW}px`).toBeGreaterThanOrEqual(minW);
    expect(s.h, `${selector} shorter than ${minH}px`).toBeGreaterThanOrEqual(minH);
  };

  await expectAtLeast(".tabbed-top-bar-btn", 44, 44);
  await expectAtLeast(".tabbed-tab", 44, 44);
  await expectAtLeast(".tabbed-add-btn", 44, 44);
  // A connector sits between two tabs, so it is narrow — but full height.
  await expectAtLeast(".tabbed-link-connector", 28, 44);
  // Panel options are deliberately a notch smaller than the shell (36px): they sit
  // above the fretboard and every pixel they take comes off it.
  await expectAtLeast(".tabbed-panel-content .config-compact select", 44, 36);
  await expectAtLeast(".tabbed-panel-content .config-compact .config-toggle-btn", 36, 36);

  // A select under 16px makes iOS Safari zoom the page when it is focused.
  const selectFont = await page.evaluate(() =>
    parseFloat(
      getComputedStyle(document.querySelector(".tabbed-panel-content .config-compact select")!)
        .fontSize,
    ),
  );
  expect(selectFont, "config select font below 16px (iOS focus zoom)").toBeGreaterThanOrEqual(16);

  await page.locator(".tabbed-add-btn").click();
  await expectAtLeast(".tabbed-sheet-item", 44, 44);
  await expectAtLeast(".tabbed-sheet-close", 44, 44);
});

// ─── Sheets ───────────────────────────────────────────────────────────────────

test("the add sheet lists mobile-visible tools, spawns one, and closes on Escape", async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, "layout=empty&fftest");

  await page.locator(".tabbed-add-btn").click();
  const sheet = page.locator(".tabbed-sheet");
  await expect(sheet, "add sheet did not open").toBeVisible();
  await expect(sheet).toHaveAttribute("role", "dialog");

  const labels = await sheet.locator(".tabbed-sheet-item").allInnerTexts();
  expect(labels.length, "add sheet lists too few tools").toBeGreaterThanOrEqual(5);
  // Desktop-only entries and the broadcast Global Key are not offered on mobile.
  const flat = labels.join("\n");
  expect(flat, "Global Key must not be offered on mobile").not.toContain("Global Key");
  expect(flat, "desktop-only Drone offered on mobile").not.toContain("Drone");
  expect(flat, "desktop-only Legend offered on mobile").not.toContain("Legend");

  await page.keyboard.press("Escape");
  await expect(sheet, "Escape did not close the sheet").toBeHidden();

  // Spawn one via a real click: a tab must appear and the sheet must close.
  await page.locator(".tabbed-add-btn").click();
  await sheet.locator(".tabbed-sheet-item").first().click();
  await settleLayout(page);
  await expect(sheet).toBeHidden();
  expect((await tabsState(page))!.order.length, "add-sheet click spawned no tab").toBe(1);

  expect(errors, errors.join("\n")).toEqual([]);
});

test("the add sheet only offers tools the current instrument supports", async ({ page }) => {
  await prepPage(page);
  // Bass: the guitar-shaped tools (Chords, CAGED, Triads) are instrument-gated.
  await page.addInitScript(() => {
    const KEY = "categoryTimerAppSettings";
    const settings = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    settings.instrumentSettings = { ...(settings.instrumentSettings ?? {}), instrument: "Bass" };
    localStorage.setItem(KEY, JSON.stringify(settings));
  });
  await page.goto("/?layout=empty&fftest");
  await settleLayout(page);

  await page.locator(".tabbed-add-btn").click();
  const labels = await page.locator(".tabbed-sheet .tabbed-sheet-item").allInnerTexts();
  const names = labels.map((l) => l.replace(/^\S+\s+/, "").trim());
  expect(names, "bass still offered Scales").toContain("Scales");
  expect(names, "guitar-only Chords offered on bass").not.toContain("Chords");
  expect(names, "guitar-only CAGED offered on bass").not.toContain("CAGED");
});

test("the menu loads a starter layout", async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, "layout=empty&fftest");

  await page.locator(".tabbed-menu-btn").click();
  const sheet = page.locator(".tabbed-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.locator(".tabbed-sheet-item", { hasText: "Settings" })).toBeVisible();

  await sheet.locator(".tabbed-sheet-item", { hasText: "Reference" }).click();
  await settleLayout(page);
  await expect(sheet).toBeHidden();
  expect((await tabsState(page))!.order.length, "Reference starter did not load").toBe(4);

  expect(errors, errors.join("\n")).toEqual([]);
});

// ─── Links ────────────────────────────────────────────────────────────────────

test("a connector links and unlinks neighbouring tabs, and says so", async ({ page }) => {
  await open(page, "layout=mobile_starter&fftest");
  expect((await savedState(page)).links.length).toBe(1);

  const connector = page.locator(".tabbed-link-connector");
  await expect(connector, "linked neighbours show no connector").toHaveCount(1);
  await expect(connector).toHaveClass(/is-linked/);

  await connector.click();
  await expect(page.locator(".tabbed-toast")).toContainText("no longer follows");
  await expect(page.locator(".tabbed-link-connector")).not.toHaveClass(/is-linked/);
  expect((await savedState(page)).links.length, "unlink not saved").toBe(0);

  await page.locator(".tabbed-link-connector").click();
  await expect(page.locator(".tabbed-toast")).toContainText("now follows");
  await expect(page.locator(".tabbed-link-connector")).toHaveClass(/is-linked/);
  expect((await savedState(page)).links.length, "link not saved").toBe(1);
});

test("reordering tabs never deletes links", async ({ page }) => {
  // Reference has three links fanning out from the Scale panel; whatever the tab
  // order, at most two of them can be between neighbours.
  await open(page, "layout=reference&fftest");
  const before = await savedState(page);
  expect(before.links.length).toBe(3);

  const order = (await tabsState(page))!.order;
  const reversed = order.slice().reverse();
  await page.evaluate((o) => (window as any).__ff.reorderTabs(o), reversed);
  await settleLayout(page);

  expect((await tabsState(page))!.order).toEqual(reversed);
  const after = await savedState(page);
  expect(after.layout.tabbed?.order, "new order not saved").toEqual(reversed);
  expect(after.links.length, "reorder deleted links").toBe(3);

  // The link the connectors cannot show is still visible: as a badge on its tab,
  // and through the Links action when that tab is active.
  const badged = page.locator(".tabbed-tab.has-distant-link");
  await expect(badged, "no badge for a link between non-neighbours").not.toHaveCount(0);
  const badgedId = await badged.first().getAttribute("data-instance-id");
  await page.evaluate((iid) => (window as any).__ff.activateTab(iid), badgedId);
  await settle(page);
  await page.getByRole("button", { name: "Links", exact: true }).click();
  await expect(page.locator(".tabbed-sheet .tabbed-sheet-item").first()).toContainText(
    "Stop following",
  );
});

// ─── Saved state ──────────────────────────────────────────────────────────────

test("a mobile session keeps the layout's desktop geometry in the saved state", async ({ page }) => {
  await open(page, "layout=reference&fftest");

  const saved = await savedState(page);
  const ids = Object.keys(saved.instances).sort();
  expect(saved.layout.tabbed?.order.slice().sort(), "tab order not saved").toEqual(ids);
  expect(
    Object.keys(saved.layout.floating?.perInstance ?? {}).sort(),
    "floating geometry dropped from a save made in the tabbed layout",
  ).toEqual(ids);
});

// ─── Several fretboards in one panel ──────────────────────────────────────────

test("Triad Shapes lays its fretboards across the screen, stacked, not upright side by side", async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, "layout=empty&fftest");
  const id = await page.evaluate(() => (window as any).__ff.spawn("instrument_triad"));
  expect(id).toBeTruthy();
  await settleLayout(page);

  const boards = () =>
    page.evaluate(() =>
      [...document.querySelectorAll(".triad-quality-row canvas")].map((c) => {
        const r = c.getBoundingClientRect();
        return { w: r.width, h: r.height, left: r.left, right: r.right };
      }),
    );
  const vp = page.viewportSize()!;

  // One board per string set. Whichever way the screen is held they lie across it:
  // upright boards on an upright phone are each a fraction of its width.
  const across = await boards();
  expect(across.length, "no triad fretboards drawn").toBeGreaterThanOrEqual(3);
  for (const b of across) {
    expect(b.w, "a triad fretboard is upright by default").toBeGreaterThan(b.h);
    expect(b.left).toBeGreaterThanOrEqual(0);
    expect(b.right, "a triad fretboard runs off the screen").toBeLessThanOrEqual(vp.width);
  }
  if (vp.height > vp.width) {
    // Upright screen: each board gets most of the width (all of it, unless a short
    // screen — phone-small — runs out of height for four of them first).
    expect(across[0].w / vp.width, "stacked boards should span the screen").toBeGreaterThan(0.6);
  }
  // Nothing was chosen by the user, so nothing is saved: this is the default.
  expect((await savedState(page)).instances[id as string].tabbedOrientation).toBeUndefined();

  // Rotate still flips it — and on an upright phone that is the smaller option.
  await page.getByRole("button", { name: "Rotate fretboard" }).click();
  await expect
    .poll(async () => (await boards()).every((b) => b.h > b.w), { message: "rotate did not stand the boards up" })
    .toBe(true);
  const upright = await boards();
  // On a phone of ordinary height, that is — on the very short phone-small the two
  // come out within a few percent of each other, so nothing is asserted there.
  if (vp.height > vp.width && vp.width < 500 && vp.height >= 700) {
    const longSide = (b: { w: number; h: number }) => Math.max(b.w, b.h);
    expect(longSide(across[0]), "the default should be the larger of the two").toBeGreaterThan(
      longSide(upright[0]) * 1.3,
    );
  }
  expect((await savedState(page)).instances[id as string].tabbedOrientation).toBe("vertical");

  expect(errors, errors.join("\n")).toEqual([]);
});

// ─── Two panes on a tablet ────────────────────────────────────────────────────

test("a tablet shows the active tab and its neighbour; a phone shows one", async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, "layout=mobile_starter&fftest");
  const capacity = paneCapacity(page);
  const vp = page.viewportSize()!;
  const state = (await tabsState(page))!;
  expect(state.order.length).toBe(3);
  const [first, second, third] = state.order;

  await page.evaluate((iid) => (window as any).__ff.activateTab(iid), first);
  await settleLayout(page);

  const paneRects = () =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".tabbed-panel")]
        .filter((p) => p.style.display !== "none")
        .map((p) => {
          const r = p.getBoundingClientRect();
          return { id: p.dataset.instanceId!, top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height };
        })
        .sort((a, b) => a.top - b.top || a.left - b.left),
    );

  if (capacity === 1) {
    expect((await tabsState(page))!.visible).toEqual([first]);
    const [only] = await paneRects();
    expect(only.w).toBe(vp.width);
    return;
  }

  // The starter's first two tabs are a linked pair (a scale and the chords that
  // follow its key): the tablet shows them together, in tab order, without overlap.
  expect((await tabsState(page))!.visible).toEqual([first, second]);
  let panes = await paneRects();
  expect(panes.map((p) => p.id)).toEqual([first, second]);
  expect(panes[0].bottom, "panes overlap").toBeLessThanOrEqual(panes[1].top + 1);
  for (const p of panes) {
    expect(p.w, "a pane is not full width").toBe(vp.width);
    expect(p.h / vp.height, "a pane is not about half the screen").toBeGreaterThan(0.38);
  }
  // Each pane's content fits its own pane: nothing scrolls, nothing is clipped.
  const slack = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".tabbed-panel")]
      .filter((p) => p.style.display !== "none")
      .map((p) => {
        const c = p.querySelector<HTMLElement>(".tabbed-panel-content")!;
        return { x: c.scrollWidth - c.clientWidth, y: c.scrollHeight - c.clientHeight };
      }),
  );
  for (const s of slack) {
    expect(s.x, "a pane scrolls sideways").toBeLessThanOrEqual(0);
    expect(s.y, "a pane scrolls vertically").toBeLessThanOrEqual(0);
  }

  // The top bar belongs to the active pane; touching the other pane makes it active
  // without changing what is on screen.
  await expect(page.locator(".tabbed-panel.is-active")).toHaveAttribute("data-instance-id", first);
  await page.locator(`.tabbed-panel[data-instance-id="${second}"]`).click({ position: { x: 40, y: 40 } });
  await expect.poll(async () => (await tabsState(page))!.activeId).toBe(second);
  expect((await tabsState(page))!.visible, "touching a pane changed the panes").toEqual([first, second]);
  await expect(page.locator(".tabbed-close-btn")).toHaveAttribute("aria-label", /^Close /);
  await expect(page.locator(`.tabbed-tab[data-instance-id="${first}"]`)).toHaveClass(/is-visible/);

  // A tab that is not on screen brings its own neighbour: the last tab pairs with
  // the one before it.
  await page.locator(`.tabbed-tab[data-instance-id="${third}"]`).click();
  await expect.poll(async () => (await tabsState(page))!.visible).toEqual([second, third]);
  expect((await tabsState(page))!.activeId).toBe(third);
  panes = await paneRects();
  expect(panes.map((p) => p.id)).toEqual([second, third]);

  // Closing down to one tab hands it the whole screen.
  await page.evaluate(([a, b]) => { (window as any).__ff.close(a); (window as any).__ff.close(b); }, [second, third]);
  await settleLayout(page);
  expect((await tabsState(page))!.visible).toEqual([first]);
  const [alone] = await paneRects();
  expect(alone.h / vp.height, "a lone tab did not get the whole screen").toBeGreaterThan(0.8);

  expect(errors, errors.join("\n")).toEqual([]);
});

// ─── Settings ─────────────────────────────────────────────────────────────────

test("settings does not offer the workspace grid, which a tab has no use for", async ({ page }) => {
  await open(page, "layout=mobile_starter&fftest");
  await page.locator(".tabbed-menu-btn").click();
  await page.locator(".tabbed-sheet-item", { hasText: "Settings" }).click();

  // The dialog is open (its theme row is there) but the grid switch is not offered.
  await expect(page.locator('.settings-row[data-row-key="theme"]')).toBeVisible();
  await expect(page.locator('.settings-row[data-row-key="show-grid"]')).toBeHidden();
});

test("the divider between a tablet's two panes can be dragged, and remembers where it was left", async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, "layout=mobile_starter&fftest");
  const divider = page.locator(".tabbed-pane-divider");
  if (paneCapacity(page) === 1) {
    await expect(divider, "a phone has one pane and nothing to divide").toBeHidden();
    return;
  }
  const first = (await tabsState(page))!.order[0];
  await page.evaluate((iid) => (window as any).__ff.activateTab(iid), first);
  await settleLayout(page);

  const paneHeights = () =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".tabbed-panel")]
        .filter((p) => p.style.display !== "none")
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
        .map((p) => p.getBoundingClientRect().height),
    );
  const paneSlack = () =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".tabbed-panel")]
        .filter((p) => p.style.display !== "none")
        .map((p) => {
          const c = p.querySelector<HTMLElement>(".tabbed-panel-content")!;
          return Math.max(c.scrollWidth - c.clientWidth, c.scrollHeight - c.clientHeight);
        }),
    );

  await expect(divider).toBeVisible();
  const [evenTop, evenBottom] = await paneHeights();
  expect(Math.abs(evenTop - evenBottom), "panes do not start even").toBeLessThanOrEqual(2);
  expect((await savedState(page)).layout.tabbed?.split, "an even split is not worth saving").toBeUndefined();

  // Drag the divider down: the first pane grows, the second gives up the same room.
  const box = (await divider.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 60, { steps: 4 });
  await page.mouse.move(x, y + 110, { steps: 4 });
  await page.mouse.up();
  await settleLayout(page);

  const [top, bottom] = await paneHeights();
  expect(top - evenTop, "the first pane did not grow by the drag").toBeGreaterThan(90);
  expect(evenBottom - bottom, "the second pane did not shrink by the drag").toBeGreaterThan(90);
  // Each pane's content was re-fitted to its new size: still nothing to scroll.
  for (const slack of await paneSlack()) expect(slack, "a pane's content no longer fits it").toBeLessThanOrEqual(0);

  const split = (await savedState(page)).layout.tabbed?.split;
  expect(split, "the split was not saved").toBeGreaterThan(0.55);
  expect(split).toBeLessThanOrEqual(0.7);

  // It comes back after a reload.
  await page.goto("/?fftest");
  await settleLayout(page);
  const [reTop, reBottom] = await paneHeights();
  expect(Math.abs(reTop - top), "the split was not restored").toBeLessThanOrEqual(2);
  expect(Math.abs(reBottom - bottom)).toBeLessThanOrEqual(2);

  // It stops before either pane becomes too small to use…
  const again = (await divider.boundingBox())!;
  await page.mouse.move(again.x + again.width / 2, again.y + again.height / 2);
  await page.mouse.down();
  await page.mouse.move(again.x + again.width / 2, 40, { steps: 6 }); // all the way to the top
  await page.mouse.up();
  await settleLayout(page);
  const [minTop, maxBottom] = await paneHeights();
  expect(minTop / (minTop + maxBottom), "the first pane was dragged below its minimum").toBeGreaterThan(0.28);

  // …and the keyboard moves it too.
  await divider.focus();
  await page.keyboard.press("ArrowDown");
  await settleLayout(page);
  expect((await paneHeights())[0], "ArrowDown did not move the divider").toBeGreaterThan(minTop + 20);

  expect(errors, errors.join("\n")).toEqual([]);
});

// ─── A panel that draws to fit ────────────────────────────────────────────────

test("the Circle of Fifths fits its pane, wheel and chords together", async ({ page }) => {
  // The wheel takes the height its key label and chord row leave. On a phone held
  // sideways that is not much, and it used to be drawn a panel-padding too tall.
  const errors = collectErrors(page);
  await open(page, "layout=empty&fftest");
  const id = await page.evaluate(() => (window as any).__ff.spawn("circle_of_fifths"));
  expect(id).toBeTruthy();
  await settleLayout(page);

  const fit = await page.evaluate(() => {
    const content = document.querySelector<HTMLElement>(".tabbed-panel .tabbed-panel-content")!;
    const wheel = content.querySelector(".cof-svg")!.getBoundingClientRect();
    const chords = content.querySelector(".cof-progression")!.getBoundingClientRect();
    const area = content.getBoundingClientRect();
    return {
      scrollY: content.scrollHeight - content.clientHeight,
      wheel: { w: wheel.width, h: wheel.height },
      chordsBelow: area.bottom - chords.bottom,
    };
  });
  expect(fit.scrollY, "the pane scrolls").toBeLessThanOrEqual(1);
  expect(fit.chordsBelow, "the chord row is cut off").toBeGreaterThanOrEqual(0);
  expect(fit.wheel.w, "the wheel was not drawn").toBeGreaterThanOrEqual(60);
  expect(fit.wheel.w).toBeCloseTo(fit.wheel.h, 0);

  expect(errors, errors.join("\n")).toEqual([]);
});

// ─── A panel waiting on its source ────────────────────────────────────────────

test("a panel whose settings are still waiting on a linked source is fitted to the screen all the same", async ({ page }) => {
  // Nearby Triads in this layout follows the Backing Track, which says nothing until
  // it is played. Its fretboards must still be sized to the pane they are in — not
  // left at the unconstrained size of their first render.
  const errors = collectErrors(page);
  await open(page, "layout=voice_leading&fftest");
  const id = await page.evaluate(
    () => ((window as any).__ff.report() as Array<{ id: string; viewId: string }>)
      .find((r) => r.viewId === "instrument_nearby_triads")?.id,
  );
  expect(id, "the layout no longer has a Nearby Triads panel").toBeTruthy();
  await page.evaluate((iid) => (window as any).__ff.activateTab(iid), id);
  await settleLayout(page);

  const fit = await page.evaluate((iid) => {
    const panel = document.querySelector<HTMLElement>(`.tabbed-panel[data-instance-id="${iid}"]`)!;
    const content = panel.querySelector<HTMLElement>(".tabbed-panel-content")!;
    const area = content.getBoundingClientRect();
    return {
      paneH: area.height,
      boards: [...panel.querySelectorAll("canvas")].map((c) => {
        const r = c.getBoundingClientRect();
        return { w: r.width, h: r.height, left: r.left, right: r.right };
      }),
      areaLeft: area.left,
      areaRight: area.right,
      scrollY: content.scrollHeight - content.clientHeight,
    };
  }, id);

  expect(fit.boards.length, "no fretboards drawn").toBeGreaterThanOrEqual(2);
  for (const b of fit.boards) {
    expect(b.w, "a fretboard was not drawn").toBeGreaterThan(20);
    expect(b.left).toBeGreaterThanOrEqual(fit.areaLeft - 1);
    expect(b.right, "a fretboard runs off the pane").toBeLessThanOrEqual(fit.areaRight + 1);
    expect(b.h, "a fretboard is taller than the pane it is in").toBeLessThan(fit.paneH);
  }
  // All the boards are in view together, with nothing to scroll to. (Not on
  // phone-small with the options showing: they leave 230px for four boards, less
  // than the boards' own labels and controls need. Hiding them is checked below.)
  const vp = page.viewportSize()!;
  if (Math.max(vp.width, vp.height) >= 700) {
    expect(fit.scrollY, "the boards were not sized to fit the pane").toBeLessThanOrEqual(1);
  }

  expect(errors, errors.join("\n")).toEqual([]);
});

// ─── Nearby Triads ────────────────────────────────────────────────────────────
// The one fretboard panel with two displays: Compact draws one board, Reference one
// per chord. Each surrounds its boards with different controls (a legend, a wizard's
// tabs and buttons, per-chord voicing arrows, a Driven Mode button when linked), and
// whatever those take must come off the boards, not push them out of the pane.

/** The Nearby Triads panel the voice-leading layout opens, brought to the front. */
async function openVoiceLeadingTriads(page: Page): Promise<string> {
  await open(page, "layout=voice_leading&fftest");
  const id = await page.evaluate(
    () => ((window as any).__ff.report() as Array<{ id: string; viewId: string }>)
      .find((r) => r.viewId === "instrument_nearby_triads")?.id,
  );
  expect(id, "the layout no longer has a Nearby Triads panel").toBeTruthy();
  await page.evaluate((iid) => (window as any).__ff.activateTab(iid), id);
  await settleLayout(page);
  return id as string;
}

/** What a Nearby Triads panel has drawn, and how far its pane would have to scroll. */
const triadsPanel = (page: Page, id: string) =>
  page.evaluate((iid) => {
    const panel = document.querySelector<HTMLElement>(`.tabbed-panel[data-instance-id="${iid}"]`)!;
    const content = panel.querySelector<HTMLElement>(".tabbed-panel-content")!;
    const area = content.getBoundingClientRect();
    return {
      boards: [...panel.querySelectorAll("canvas")].map((c) => {
        const r = c.getBoundingClientRect();
        return { w: r.width, h: r.height, left: r.left - area.left, right: area.right - r.right };
      }),
      scrollY: content.scrollHeight - content.clientHeight,
      scrollX: content.scrollWidth - content.clientWidth,
    };
  }, id);

test("Nearby Triads' one-board-per-chord display lies across the screen and fits it", async ({ page }) => {
  const errors = collectErrors(page);
  const id = await openVoiceLeadingTriads(page);
  const panel = page.locator(`.tabbed-panel[data-instance-id="${id}"]`);
  const vp = page.viewportSize()!;

  // The layout links it to the Backing Track, so it offers Driven Mode — and keeps
  // offering it after the panel has been re-fitted (the button used to vanish).
  await expect(panel.getByRole("button", { name: "Driven Mode" })).toBeVisible();

  // Options hidden — how it is used once set up — everything is on screen at once,
  // on every phone, with the boards lying across it like Triad Shapes'.
  await page.getByRole("button", { name: "Hide options" }).click();
  await settleLayout(page);
  // Hidden options take no room at all — not even their padding, which used to stay
  // behind with a sliver of the labels showing in it.
  const optionsRoom = await panel.locator(".config-compact").evaluate((el) => {
    const style = getComputedStyle(el);
    return (el as HTMLElement).offsetHeight + parseFloat(style.marginBottom);
  });
  expect(optionsRoom, "hidden options still take room").toBe(0);
  const across = await triadsPanel(page, id);
  expect(across.boards.length, "one board per chord").toBe(4);
  for (const b of across.boards) {
    expect(b.w, "a board is upright; several upright boards are each a sliver").toBeGreaterThan(b.h);
    expect(b.left, "a board runs off the pane").toBeGreaterThanOrEqual(-1);
    expect(b.right, "a board runs off the pane").toBeGreaterThanOrEqual(-1);
  }
  expect(across.scrollY, "the boards do not fit the pane").toBeLessThanOrEqual(1);
  expect(across.scrollX, "the boards are wider than the pane").toBeLessThanOrEqual(1);
  if (vp.width < 500 && vp.height >= 700) {
    // An upright phone of ordinary height: one board per row, most of the width.
    expect(across.boards[0].w / vp.width, "stacked boards should span the screen").toBeGreaterThan(0.6);
  }

  // Each chord's voicing controls are a finger wide, and none hangs out of its slot.
  const controls = await panel.getByRole("button", { name: /voicing/i }).evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height };
    }),
  );
  expect(controls.length, "three voicing buttons per chord").toBe(12);
  for (const c of controls) {
    expect(Math.min(c.w, c.h), "a voicing button is too small to tap").toBeGreaterThanOrEqual(24);
  }

  // Rotate is still the user's to choose, and still fits.
  await page.getByRole("button", { name: "Rotate fretboard" }).click();
  await expect
    .poll(async () => (await triadsPanel(page, id)).boards.every((b) => b.h > b.w), {
      message: "rotate did not stand the boards up",
    })
    .toBe(true);
  await settleLayout(page);
  const upright = await triadsPanel(page, id);
  expect(upright.scrollY, "the upright boards do not fit the pane").toBeLessThanOrEqual(1);
  expect(upright.scrollX, "the upright boards are wider than the pane").toBeLessThanOrEqual(1);
  if (vp.height > vp.width && vp.width < 500 && vp.height >= 700) {
    const longSide = (b: { w: number; h: number }) => Math.max(b.w, b.h);
    expect(longSide(across.boards[0]), "the default should be the larger of the two").toBeGreaterThan(
      longSide(upright.boards[0]) * 1.1,
    );
  }

  expect(errors, errors.join("\n")).toEqual([]);
});

test("Nearby Triads' display can be changed while its linked source is still silent", async ({ page }) => {
  // Root note and mode follow the Backing Track here, which has not played. The
  // panel's other settings must not be frozen until it does.
  const errors = collectErrors(page);
  const id = await openVoiceLeadingTriads(page);
  const panel = page.locator(`.tabbed-panel[data-instance-id="${id}"]`);
  const display = panel.locator("select").filter({ has: page.locator('option[value="reference"]') });
  await expect(display).toHaveValue("reference");
  expect((await triadsPanel(page, id)).boards.length).toBe(4);

  // Compact, with no voicings chosen yet, opens on the chord wizard: no boards.
  await display.selectOption("compact");
  await expect(panel.locator('input[placeholder*="Am"]')).toBeVisible();
  expect((await triadsPanel(page, id)).boards.length, "the display did not change").toBe(0);

  // …and back: four boards again, lying across the screen (the rule follows the display).
  await display.selectOption("reference");
  await expect.poll(async () => (await triadsPanel(page, id)).boards.length).toBe(4);
  await settleLayout(page);
  for (const b of (await triadsPanel(page, id)).boards) {
    expect(b.w, "back in Reference, the boards should lie across again").toBeGreaterThan(b.h);
  }
  // The panel's own choice of orientation, not the user's: nothing is saved for it.
  expect((await savedState(page)).instances[id].tabbedOrientation).toBeUndefined();

  expect(errors, errors.join("\n")).toEqual([]);
});

test("Nearby Triads' chord wizard and its one-board display fit the pane", async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, "layout=empty&fftest");
  const id = (await page.evaluate(() => (window as any).__ff.spawn("instrument_nearby_triads"))) as string;
  expect(id).toBeTruthy();
  await settleLayout(page);
  const panel = page.locator(`.tabbed-panel[data-instance-id="${id}"]`);
  const vp = page.viewportSize()!;

  // Step one: name the chords.
  await panel.locator('input[placeholder*="Am"]').click();
  for (const chord of ["I", "IV", "V", "vi"]) {
    await page.keyboard.type(chord);
    await page.keyboard.press("Enter");
  }
  await panel.getByRole("button", { name: /Apply/ }).click();

  // Step two: pick voicings on one board, under a row of chord tabs and over the
  // wizard's own buttons — all of it in view.
  await expect(panel.getByRole("button", { name: /Edit chords$/ })).toBeVisible();
  await settleLayout(page);
  const picking = await triadsPanel(page, id);
  expect(picking.boards.length, "the voicing board").toBe(1);
  expect(picking.scrollY, "the wizard does not fit the pane").toBeLessThanOrEqual(1);
  expect(picking.boards[0].w, "the voicing board was not drawn").toBeGreaterThan(40);

  // Applied: one board with every chord on it and a legend beneath.
  await panel.getByRole("button", { name: /Apply/ }).click();
  await expect(panel.getByRole("button", { name: /Edit chords & voicings/ })).toBeVisible();
  await settleLayout(page);
  const applied = await triadsPanel(page, id);
  expect(applied.boards.length).toBe(1);
  expect(applied.scrollY, "the board and its legend do not fit the pane").toBeLessThanOrEqual(1);
  expect(applied.scrollX).toBeLessThanOrEqual(1);
  // With less around it than the wizard had, the board is bigger, not left small.
  const longSide = (b: { w: number; h: number }) => Math.max(b.w, b.h);
  expect(longSide(applied.boards[0])).toBeGreaterThanOrEqual(longSide(picking.boards[0]));
  // One board runs along the screen's long axis, as every single fretboard does.
  // (Not the tablet: its panes are wider than tall on an upright screen.)
  if (vp.width < 500) {
    expect(applied.boards[0].h, "a single board should stand upright on an upright phone").toBeGreaterThan(
      applied.boards[0].w,
    );
  }

  expect(errors, errors.join("\n")).toEqual([]);
});
