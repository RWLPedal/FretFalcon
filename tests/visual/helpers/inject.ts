// tests/visual/helpers/inject.ts
// Pre-navigation state injection: app settings (theme) via localStorage, plus the
// determinism measures every spec needs (local fonts, killed animations).
import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

const FONTS_DIR = path.join(__dirname, "../assets/fonts");

export type ThemeName = "warm" | "moss" | "sherbet" | "sigil" | "neon";

/** Set app settings before any app script runs. Matches ts/settings.ts merge-over-defaults. */
export async function injectSettings(page: Page, opts: { theme?: ThemeName; showGrid?: boolean } = {}): Promise<void> {
  await page.addInitScript((o) => {
    const KEY = "categoryTimerAppSettings";
    const settings = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    if (o.theme) settings.theme = o.theme;
    if (o.showGrid !== undefined) settings.showGrid = o.showGrid;
    localStorage.setItem(KEY, JSON.stringify(settings));
  }, opts);
}

/**
 * Serve the vendored Google Fonts instead of the CDN: byte-stable text rendering,
 * works offline, and Material Icons render as glyphs (not ligature words).
 * Vendored files are produced once by tools/vendor_fonts.mjs.
 */
export async function useLocalFonts(page: Page): Promise<void> {
  await page.route("https://fonts.googleapis.com/**", (route) => {
    const cssName = route.request().url().includes("icon?family=Material+Icons")
      ? "material-icons.css"
      : "families.css";
    route.fulfill({
      contentType: "text/css",
      body: fs.readFileSync(path.join(FONTS_DIR, cssName), "utf8"),
    });
  });
  await page.route("https://fonts.gstatic.com/**", (route) => {
    const file = path.join(FONTS_DIR, path.basename(new URL(route.request().url()).pathname));
    if (fs.existsSync(file)) {
      route.fulfill({ contentType: "font/woff2", body: fs.readFileSync(file) });
    } else {
      route.abort();
    }
  });
}

/** Kill transitions/animations/caret so screenshots are stable. */
export async function freezeMotion(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent =
      "*,*::before,*::after{transition:none!important;animation:none!important} html{caret-color:transparent!important}";
    document.addEventListener("DOMContentLoaded", () => document.head.appendChild(style));
  });
}

/** Standard pre-navigation setup used by every spec. */
export async function prepPage(page: Page, opts: { theme?: ThemeName } = {}): Promise<void> {
  await useLocalFonts(page);
  await freezeMotion(page);
  await injectSettings(page, opts);
}

/** Wait until the app has painted: fonts loaded plus two animation frames. */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}

/**
 * Wait until the LAYOUT has stopped moving. The app debounces geometry work behind
 * three independent timers (PanelHost window-resize 100ms, FloatingLayout sidebar
 * relayout 100ms, reference page grid repaint 150ms), so after a viewport change or
 * strategy switch the panels keep shifting for a few hundred ms. Rather than sleeping
 * a guessed duration, poll the test bridge until two samples ≥250ms apart agree on
 * both the layout epoch and every panel's reported rect. Requires ?fftest.
 */
export async function settleLayout(page: Page, timeoutMs = 5000): Promise<void> {
  await settle(page);
  const sample = () =>
    page.evaluate(() => {
      const ff = (window as any).__ff;
      return `${ff.layoutEpoch()}|${JSON.stringify(ff.report())}`;
    });
  const deadline = Date.now() + timeoutMs;
  let prev = await sample();
  while (Date.now() < deadline) {
    await page.waitForTimeout(250); // poll interval, not a correctness sleep
    const cur = await sample();
    if (cur === prev) return;
    prev = cur;
  }
  throw new Error(`settleLayout: layout still changing after ${timeoutMs}ms`);
}
