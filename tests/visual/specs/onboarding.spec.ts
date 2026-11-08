// tests/visual/specs/onboarding.spec.ts
// Onboarding teardown hygiene. The tour dims the page with .onb-spot's box-shadow
// while .onb-block — a TRANSPARENT position:fixed inset:0 pointer-events:all layer —
// eats every click (style/onboarding.css). If teardown ever fails to remove it, the
// app looks fine but is completely unresponsive. These are the hard assertions.
//
// The tabbed (mobile) layout has its own welcome copy and its own tour, pointing at
// its shell (tab strip, +, link, top-bar actions, menu) and leaving the open tabs
// alone. Those run on every mobile project: the welcome card and every tip must fit
// the screen, down to a 320px phone.
import { test, expect, Page } from "@playwright/test";
import { prepPage, settle, settleLayout } from "../helpers/inject";

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
  });
  return errors;
}

const blockCount = (page: Page) =>
  page.evaluate(() => document.querySelectorAll(".onb-block").length);

/** The app is interactive again when a bridge spawn succeeds and renders. */
async function assertInteractive(page: Page): Promise<void> {
  const id = await page.evaluate(() => (window as any).__ff.spawn("instrument_scale"));
  expect(id, "spawn failed after onboarding closed").toBeTruthy();
  await settle(page);
  await page.evaluate((iid) => (window as any).__ff.close(iid), id);
}

test.describe("welcome + tour teardown (desktop)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "teardown suite runs on desktop");
  });

  test('"Explore on my own" closes the welcome with nothing left behind', async ({ page }) => {
    const errors = collectErrors(page);
    await prepPage(page);
    await page.goto("/?layout=empty&tutorial=true&fftest");
    await settleLayout(page);

    await expect(page.locator(".onb-scrim")).toBeVisible();
    await page.locator(".onb-btn-ghost").click();

    await expect(page.locator(".onb-scrim")).toHaveCount(0);
    expect(await blockCount(page), "invisible .onb-block click-blocker left behind").toBe(0);
    await assertInteractive(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("skipping mid-tour tears down the overlay completely", async ({ page }) => {
    const errors = collectErrors(page);
    await prepPage(page);
    await page.goto("/?layout=empty&tutorial=true&fftest");
    await settleLayout(page);

    await page.locator(".onb-btn-primary").click(); // start the tour
    await settleLayout(page); // it closes all views and spawns its own
    await expect(page.locator(".onb-skip-btn")).toBeVisible();
    expect(await blockCount(page), "tour did not raise its click-blocker").toBeGreaterThan(0);

    await page.locator(".onb-skip-btn").click();
    expect(await blockCount(page), "invisible .onb-block click-blocker left behind").toBe(0);
    await expect(page.locator(".onb-tip")).toHaveCount(0);
    await assertInteractive(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("completing the tour tears down the overlay completely", async ({ page }) => {
    const errors = collectErrors(page);
    await prepPage(page);
    await page.goto("/?layout=empty&tutorial=true&fftest");
    await settleLayout(page);

    await page.locator(".onb-btn-primary").click();
    await settleLayout(page);

    // Advance until the last step's next-click tears the tour down (defensive cap).
    for (let step = 0; step < 12; step++) {
      const next = page.locator(".onb-next-btn");
      if ((await next.count()) === 0) break;
      await next.click();
      await settle(page);
    }
    expect(await blockCount(page), "tour completed but .onb-block remains").toBe(0);
    await assertInteractive(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});

test.describe("tour fits small viewports", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "short-wide", "the shortest desktop viewport");
  });

  test("every tour step's tip stays within the viewport", async ({ page }) => {
    await prepPage(page);
    await page.goto("/?layout=empty&tutorial=true&fftest");
    await settleLayout(page);
    await page.locator(".onb-btn-primary").click();
    await settleLayout(page);

    await walkTour(page, async (step) => expectInViewport(page, ".onb-tip", `step ${step}: tip`));
    expect(await blockCount(page), "tour completed but .onb-block remains").toBe(0);
  });
});

// ─── Mobile ───────────────────────────────────────────────────────────────────

const MOBILE_PROJECTS = ["tablet", "phone", "phone-small", "phone-touch", "phone-landscape"];

/** Assert an element lies wholly inside the viewport. */
async function expectInViewport(page: Page, selector: string, what: string): Promise<void> {
  const box = await page.locator(selector).boundingBox();
  expect(box, `${what}: not on the page`).toBeTruthy();
  const vp = page.viewportSize()!;
  expect.soft(box!.x, `${what} off the left edge`).toBeGreaterThanOrEqual(0);
  expect.soft(box!.y, `${what} off the top edge`).toBeGreaterThanOrEqual(0);
  expect.soft(box!.x + box!.width, `${what} off the right edge`).toBeLessThanOrEqual(vp.width);
  expect.soft(box!.y + box!.height, `${what} off the bottom edge`).toBeLessThanOrEqual(vp.height);
}

/** Click Next through the tour, calling `onStep` at each; returns the step labels. */
async function walkTour(
  page: Page,
  onStep: (step: number) => Promise<void>,
): Promise<string[]> {
  const labels: string[] = [];
  for (let step = 0; step < 12; step++) {
    const next = page.locator(".onb-next-btn");
    if ((await next.count()) === 0) break;
    // The tip glides to each target; measure it where it comes to rest.
    await settle(page);
    labels.push((await page.locator(".onb-step-label").textContent()) ?? "");
    await onStep(step);
    await next.click();
  }
  return labels;
}

const tabOrder = (page: Page) =>
  page.evaluate(() => (window as any).__ff.tabs()?.order as string[] | undefined);

test.describe("welcome + tour (mobile)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!MOBILE_PROJECTS.includes(testInfo.project.name), "mobile projects only");
  });

  test("the welcome card fits the screen and speaks of tabs, not panels", async ({ page }) => {
    const errors = collectErrors(page);
    await prepPage(page);
    await page.goto("/?layout=mobile_starter&tutorial=true&fftest");
    await settleLayout(page);

    await expect(page.locator(".onb-scrim")).toBeVisible();
    await expectInViewport(page, ".onb-card", "welcome card");
    // The lockup is not cut off by the card (it is wider than a phone at full size).
    const brand = await page.evaluate(() => {
      const name = document.querySelector(".onb-brand .brand-name")!.getBoundingClientRect();
      const card = document.querySelector(".onb-card")!.getBoundingClientRect();
      return { right: name.right, cardRight: card.right };
    });
    expect(brand.right, "wordmark runs out of the card").toBeLessThanOrEqual(brand.cardRight - 8);

    await expect(page.locator(".onb-feats")).toContainText("One tool per tab");
    await expect(page.locator(".onb-feats")).not.toContainText("Drag it");

    // Every action is reachable (the card scrolls on a short screen) and finger-sized.
    for (const sel of [".onb-btn-primary", ".onb-btn-ghost"]) {
      const btn = page.locator(sel);
      await btn.scrollIntoViewIfNeeded();
      await expectInViewport(page, sel, sel);
      expect((await btn.boundingBox())!.height, `${sel} under 44px`).toBeGreaterThanOrEqual(44);
    }

    await page.locator(".onb-btn-ghost").click();
    await expect(page.locator(".onb-scrim")).toHaveCount(0);
    expect(await blockCount(page)).toBe(0);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("the tour points at the mobile shell, keeps every tip on screen, and leaves the tabs alone", async ({ page }) => {
    const errors = collectErrors(page);
    await prepPage(page);
    await page.goto("/?layout=mobile_starter&tutorial=true&fftest");
    await settleLayout(page);
    const before = await tabOrder(page);
    expect(before!.length).toBe(3);

    await page.locator(".onb-btn-primary").click();
    await expect(page.locator(".onb-skip-btn")).toBeVisible();
    expect(await blockCount(page), "tour did not raise its click-blocker").toBeGreaterThan(0);

    const labels = await walkTour(page, async (step) => {
      await expectInViewport(page, ".onb-tip", `step ${step}: tip`);
      // The spotlight is on something real: a target inside the screen, not the
      // "nothing to point at" placeholder in the middle of it.
      const spot = (await page.locator(".onb-spot").boundingBox())!;
      const vp = page.viewportSize()!;
      expect.soft(spot.x + spot.width, `step ${step}: spotlight off screen`).toBeLessThanOrEqual(vp.width);
      expect.soft(spot.y + spot.height, `step ${step}: spotlight off screen`).toBeLessThanOrEqual(vp.height);
      // The tip never covers what it points at.
      const tip = (await page.locator(".onb-tip").boundingBox())!;
      const overlapX = Math.min(tip.x + tip.width, spot.x + spot.width) - Math.max(tip.x, spot.x);
      const overlapY = Math.min(tip.y + tip.height, spot.y + spot.height) - Math.max(tip.y, spot.y);
      expect.soft(overlapX > 0 && overlapY > 0, `step ${step}: tip covers its target`).toBe(false);
    });
    // The starter has a linked pair, so the link step is included.
    expect(labels.map((l) => l.toLowerCase())).toEqual(["tabs", "add", "link", "this tab", "menu"]);

    expect(await blockCount(page), "tour completed but .onb-block remains").toBe(0);
    await expect(page.locator(".onb-tip")).toHaveCount(0);
    expect(await tabOrder(page), "the tour changed the open tabs").toEqual(before);
    await assertInteractive(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("the menu offers the tour; with nothing open it starts from the starter tabs", async ({ page }) => {
    const errors = collectErrors(page);
    await prepPage(page);
    await page.goto("/?layout=empty&fftest");
    await settleLayout(page);
    expect(await tabOrder(page)).toEqual([]);

    await page.locator(".tabbed-menu-btn").click();
    await page.locator(".tabbed-sheet-item", { hasText: "Take the tour" }).click();
    await expect(page.locator(".onb-scrim")).toBeVisible();
    await page.locator(".onb-btn-primary").click();
    await expect(page.locator(".onb-skip-btn")).toBeVisible();

    // An empty screen has nothing to point at, so the tour opens the starter set.
    expect((await tabOrder(page))!.length).toBeGreaterThanOrEqual(3);
    await expect(page.locator(".onb-step-label")).toHaveText(/tabs/i);

    await page.locator(".onb-skip-btn").click();
    expect(await blockCount(page), "invisible .onb-block click-blocker left behind").toBe(0);
    await assertInteractive(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("a first visit's hint leads to the tour", async ({ page }) => {
    await prepPage(page);
    await page.goto("/?fftest"); // no saved state, no ?layout: a brand-new visitor
    await settleLayout(page);

    const hint = page.locator(".tabbed-toast");
    await expect(hint).toContainText("tour");
    await hint.click();
    await expect(hint).toBeHidden();
    await expect(page.locator(".onb-scrim")).toBeVisible();
    await expectInViewport(page, ".onb-card", "welcome card");
  });
});
