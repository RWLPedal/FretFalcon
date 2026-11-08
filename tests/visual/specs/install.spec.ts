// tests/visual/specs/install.spec.ts
// FretFalcon as an app on a phone's home screen: what the page declares so that it can
// be installed (hosted target only — a file opened from disk cannot be), that the
// installed app then opens with no network, and that on a phone whose screen has a
// notch and a home indicator the shell keeps its controls clear of both.
import { test, expect, Page } from "@playwright/test";
import { prepPage, settleLayout } from "../helpers/inject";

const MOBILE_PROJECTS = ["tablet", "phone", "phone-small", "phone-touch", "phone-landscape"];

/** Which build this run is pointed at (see TARGETS in playwright.config.ts). */
const isHosted = (page: Page) =>
  page.evaluate(() =>
    (document.querySelector<HTMLMetaElement>('meta[name="ff-build"]')?.content ?? "").startsWith("hosted"),
  );

async function open(page: Page, query = "layout=empty&fftest"): Promise<void> {
  await prepPage(page);
  await page.goto(`/?${query}`);
  await settleLayout(page);
}

// ─── What the page declares ───────────────────────────────────────────────────

test.describe("installing", () => {
  // Nothing here depends on the screen: one narrow and one wide project is plenty.
  test.beforeEach(({}, testInfo) => {
    test.skip(!["phone", "desktop"].includes(testInfo.project.name), "phone and desktop only");
  });

  test("the hosted page names an app, with icons of the sizes it claims", async ({ page }) => {
    await open(page);
    test.skip(!(await isHosted(page)), "hosted target only");

    const manifest = await page.evaluate(async () => {
      const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
      if (!link) return null;
      const response = await fetch(link.href);
      const json = await response.json();
      const sizeOf = async (url: string) => {
        const r = await fetch(url);
        if (!r.ok) return { status: r.status, type: "", w: 0, h: 0 };
        const bitmap = await createImageBitmap(await r.blob());
        return { status: r.status, type: r.headers.get("content-type") ?? "", w: bitmap.width, h: bitmap.height };
      };
      return {
        contentType: response.headers.get("content-type"),
        json,
        // Everything in a manifest is relative to the manifest, not to the page.
        startUrl: new URL(json.start_url, link.href).href,
        scope: new URL(json.scope, link.href).href,
        icons: await Promise.all(
          (json.icons as Array<{ src: string; sizes: string; purpose: string }>).map(async (icon) => ({
            ...icon,
            actual: await sizeOf(new URL(icon.src, link.href).href),
          })),
        ),
        touchIcon: await sizeOf(document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')!.href),
        root: new URL("./", location.href).href,
      };
    });

    expect(manifest, "the page links no web manifest").not.toBeNull();
    expect(manifest!.contentType).toContain("manifest+json");
    expect(manifest!.json.name).toBe("FretFalcon");
    expect(manifest!.json.display).toBe("standalone");
    // The app it installs is this page, wherever the manifest file itself lives.
    expect(manifest!.startUrl).toBe(manifest!.root);
    expect(manifest!.scope).toBe(manifest!.root);

    // Android asks for 192 and 512; a maskable one lets it crop to its own shape.
    const sizes = manifest!.icons.map((i) => `${i.sizes} ${i.purpose}`);
    expect(sizes).toEqual(expect.arrayContaining(["192x192 any", "512x512 any", "512x512 maskable"]));
    for (const icon of manifest!.icons) {
      expect(icon.actual.status, `${icon.src} did not load`).toBe(200);
      expect(icon.actual.type).toBe("image/png");
      expect(`${icon.actual.w}x${icon.actual.h}`, `${icon.src} is not the size it claims`).toBe(icon.sizes);
    }
    // iOS takes its icon from the page instead.
    expect(manifest!.touchIcon).toMatchObject({ status: 200, w: 180, h: 180 });
  });

  test("the single file offers nothing to install", async ({ page }) => {
    await open(page);
    test.skip(await isHosted(page), "single-file target only");
    expect(await page.locator('link[rel="manifest"]').count()).toBe(0);
    expect(await page.locator('link[rel="apple-touch-icon"]').count()).toBe(0);
  });

  test("the browser's chrome is tinted with the live theme", async ({ page }) => {
    const colour = () => page.locator('meta[name="theme-color"]').getAttribute("content");
    await prepPage(page, { theme: "neon" });
    await page.goto("/?layout=empty&fftest");
    await settleLayout(page);
    expect(await page.locator('meta[name="theme-color"]').count(), "one tint, not one per colour scheme").toBe(1);
    const background = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--bg").trim(),
    );
    expect(background).toMatch(/^#[0-9a-f]{6}$/i);
    expect(await colour(), "the tint should be the dark theme's background").toBe(background);
  });
});

// ─── Offline ──────────────────────────────────────────────────────────────────

test.describe("offline", () => {
  // Every other test runs with service workers blocked (playwright.config.ts), so
  // that fonts and screenshots stay deterministic. These are about the worker.
  test.use({ serviceWorkers: "allow" });
  test.beforeEach(({}, testInfo) => {
    test.skip(!["phone", "desktop"].includes(testInfo.project.name), "phone and desktop only");
  });

  /** Load the page and wait until its service worker is the one answering for it. */
  async function visitUntilControlled(page: Page): Promise<boolean> {
    await page.goto("/?layout=empty&fftest");
    if (!(await isHosted(page))) return false;
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (navigator.serviceWorker.controller) return;
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }),
      );
    });
    return true;
  }

  test("a visited page opens again with no network", async ({ page, context }) => {
    test.skip(!(await visitUntilControlled(page)), "hosted target only");

    // The worker has kept the page and every file the page loads.
    const kept = await page.evaluate(async () => {
      const name = (await caches.keys()).find((n) => n.startsWith("ff-app-"));
      if (!name) return null;
      const urls = (await (await caches.open(name)).keys()).map((r) => r.url);
      const loaded = [
        ...[...document.querySelectorAll<HTMLScriptElement>("script[src]")].map((s) => s.src),
        ...[...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"], link[rel="icon"], link[rel="manifest"]')]
          .map((l) => l.href),
      ].filter((u) => u.startsWith(location.origin));
      return { urls, loaded, root: new URL("./", location.href).href };
    });
    expect(kept, "the worker made no cache").not.toBeNull();
    expect(kept!.urls).toContain(kept!.root);
    expect(kept!.loaded.length).toBeGreaterThanOrEqual(3);
    for (const url of kept!.loaded) expect(kept!.urls, `${url} was not kept`).toContain(url);

    // Mark the kept page, so that an offline load can be told from one that somehow
    // still reached the server.
    await page.evaluate(async () => {
      const name = (await caches.keys()).find((n) => n.startsWith("ff-app-"))!;
      const cache = await caches.open(name);
      const root = new URL("./", location.href).href;
      const html = await (await cache.match(root))!.text();
      await cache.put(
        root,
        new Response(html.replace("</head>", '<meta name="ff-from-cache" content="yes"></head>'), {
          headers: { "Content-Type": "text/html" },
        }),
      );
    });

    await context.setOffline(true);
    // A different query string than was visited: it is the same page.
    await page.goto("/?layout=empty&fftest&again");
    await expect(page.locator('meta[name="ff-from-cache"]'), "the page did not come from the cache").toHaveCount(1);
    // …and it is the whole app, running: the bundle and stylesheet came with it.
    await expect.poll(() => page.evaluate(() => typeof (window as any).__ff?.strategy)).toBe("function");
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim()))
      .not.toBe("");

    // Back online, the network wins again: a deploy is never hidden by the cache.
    await context.setOffline(false);
    await page.goto("/?layout=empty&fftest");
    await expect(page.locator('meta[name="ff-from-cache"]')).toHaveCount(0);
  });

  test("the worker leaves the rest of the site alone", async ({ page, context }) => {
    test.skip(!(await visitUntilControlled(page)), "hosted target only");
    await context.setOffline(true);
    // Not the app's page, and not under assets/: nothing is answered from a cache.
    const results = await page.evaluate(() =>
      Promise.all(
        ["robots.txt", "download/fretfalcon.html", "images/screenshot-main.png"].map((path) =>
          fetch(path, { cache: "no-store" }).then(
            () => "answered",
            () => "failed",
          ),
        ),
      ),
    );
    expect(results).toEqual(["failed", "failed", "failed"]);
  });
});

// ─── Notch and home indicator ─────────────────────────────────────────────────

test.describe("safe areas", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!MOBILE_PROJECTS.includes(testInfo.project.name), "mobile projects only");
  });

  test("the shell keeps its controls clear of the notch and the home indicator", async ({ page }) => {
    // What an iPhone reports, upright or on its side. The page is installed, so there
    // are no browser bars: it has the whole screen and must make its own room.
    const vp = page.viewportSize()!;
    const insets =
      vp.height > vp.width ? { top: 47, bottom: 34, left: 0, right: 0 } : { top: 0, bottom: 21, left: 47, right: 47 };
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setSafeAreaInsetsOverride" as any, { insets } as any);
    await open(page, "fftest");

    const safe = {
      top: insets.top,
      bottom: vp.height - insets.bottom,
      left: insets.left,
      right: vp.width - insets.right,
    };
    const shell = await page.evaluate(() => {
      const rect = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
      };
      const all = (selector: string) => [...document.querySelectorAll(selector)].map(rect);
      const active = [...document.querySelectorAll<HTMLElement>(".tabbed-panel")].filter(
        (p) => p.style.display !== "none",
      );
      return {
        topBar: rect(document.querySelector(".tabbed-top-bar")!),
        tabBar: rect(document.querySelector(".tabbed-tab-bar")!),
        topButtons: all(".tabbed-top-bar-btn"),
        tabs: all(".tabbed-tab, .tabbed-add-btn .material-icons"),
        panels: active.map(rect),
        scroll: {
          x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
        },
      };
    });

    // The bars' backgrounds still run to the glass…
    expect(shell.topBar.top).toBe(0);
    expect(Math.round(shell.tabBar.bottom)).toBe(vp.height);
    // …while everything to press is inside the safe area.
    expect(shell.topButtons.length).toBeGreaterThan(0);
    for (const b of shell.topButtons) {
      expect(b.top, "a top-bar button is under the notch").toBeGreaterThanOrEqual(safe.top);
      expect(b.left, "a top-bar button is under the notch").toBeGreaterThanOrEqual(safe.left);
      expect(b.right).toBeLessThanOrEqual(safe.right);
    }
    expect(shell.tabs.length).toBeGreaterThan(0);
    for (const t of shell.tabs) {
      expect(t.bottom, "a tab is under the home indicator").toBeLessThanOrEqual(safe.bottom);
      expect(t.left).toBeGreaterThanOrEqual(safe.left - 1);
    }
    // The panels sit between the bars, inside the safe area on the sides.
    expect(shell.panels.length).toBeGreaterThan(0);
    for (const p of shell.panels) {
      expect(p.top).toBeGreaterThanOrEqual(shell.topBar.bottom - 1);
      expect(p.bottom).toBeLessThanOrEqual(shell.tabBar.top + 1);
      expect(p.left, "a panel runs under the notch").toBeGreaterThanOrEqual(safe.left);
      expect(p.right).toBeLessThanOrEqual(safe.right);
    }
    expect(shell.scroll, "the page itself scrolls").toEqual({ x: 0, y: 0 });

    // A sheet rising from the bottom keeps its last row above the home indicator.
    await page.locator(".tabbed-add-btn").click();
    const sheet = page.locator(".tabbed-sheet:not([hidden])");
    await expect(sheet).toBeVisible();
    const lastItem = await sheet.locator(".tabbed-sheet-item").last().evaluate((el) => {
      el.scrollIntoView({ block: "end" });
      const r = el.getBoundingClientRect();
      return { bottom: r.bottom, left: r.left, right: r.right };
    });
    expect(lastItem.bottom, "the sheet's last row is under the home indicator").toBeLessThanOrEqual(safe.bottom + 1);
    expect(lastItem.left).toBeGreaterThanOrEqual(safe.left);
    expect(lastItem.right).toBeLessThanOrEqual(safe.right);
  });
});

// ─── Under a finger ───────────────────────────────────────────────────────────

test.describe("touch manners", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!MOBILE_PROJECTS.includes(testInfo.project.name), "mobile projects only");
  });

  // None of these can be seen misbehaving in emulated Chromium — they are iOS Safari's
  // habits — so what is checked is that the page asks for the right thing.
  test("the tabbed page opts out of the browser gestures that fight an app", async ({ page }) => {
    await open(page, "fftest");
    const asked = await page.evaluate(() => {
      const html = getComputedStyle(document.documentElement);
      const body = getComputedStyle(document.body);
      return {
        // Two quick taps (a tempo stepper) are not a double-tap zoom.
        touchAction: body.touchAction,
        // Dragging on a page that does not scroll does not rubber-band the whole app.
        overscroll: [html.overscrollBehaviorY, body.overscrollBehaviorY],
        // Text is not enlarged when the phone is turned on its side.
        textSizeAdjust: html.getPropertyValue("text-size-adjust") || html.getPropertyValue("-webkit-text-size-adjust"),
        // The page fills a notched screen (and pads itself: see "safe areas").
        viewport: document.querySelector<HTMLMetaElement>('meta[name="viewport"]')!.content,
      };
    });
    expect(asked.touchAction).toBe("manipulation");
    expect(asked.overscroll).toEqual(["none", "none"]);
    expect(asked.textSizeAdjust).toBe("100%");
    expect(asked.viewport).toContain("viewport-fit=cover");
    // Pinch-zoom is left alone: nothing forbids scaling.
    expect(asked.viewport).not.toMatch(/user-scalable\s*=\s*no|maximum-scale/);
  });
});
