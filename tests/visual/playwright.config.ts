// tests/visual/playwright.config.ts
// Visual/structural harness for the built app. This config runs against the
// single-file target (dist/index.html); playwright.hosted.config.ts runs the same
// specs, against the same goldens, on the hosted target (dist-hosted/).
//   npm run smoke        — structural invariants only (fast, no goldens)
//   npm run smoke:hosted — the same, on the hosted target
//   npm run vr           — full run incl. screenshot diffs
//   npm run vr:hosted    — the same, on the hosted target
//   npm run vr:update    — refresh golden screenshots after an intended visual change
import { defineConfig, devices } from "@playwright/test";

/** Build targets and the port tests/visual/serve.mjs serves each one on. */
const TARGETS = {
  single: { port: 4173, serveArg: "" },
  hosted: { port: 4174, serveArg: " hosted" },
} as const;

// Viewport matrix. "short-wide" deliberately drives the grid cell to its px floor
// (the historical "panels render too small" case); tablet/phone exercise the
// TabbedLayout mobile path (TABBED_MEDIA_QUERY in ts/panels/layout/layout_mode.ts).
export const VIEWPORTS = {
  desktop: { width: 1920, height: 1080 },
  laptop: { width: 1366, height: 768 },
  "short-wide": { width: 1600, height: 560 },
  tablet: { width: 768, height: 1024 },
  phone: { width: 375, height: 812 },
  // Structural-only additions (no goldens — see GOLDEN_PROJECTS):
  "phone-small": { width: 320, height: 568 }, // worst-case narrow: tab bar + onboarding stress
  // A phone on its side: wider than the 768px breakpoint, so only the height half of
  // TABBED_MEDIA_QUERY (≤480px) keeps it on the tabbed layout.
  "phone-landscape": { width: 844, height: 390 },
  "tablet-large": { width: 1024, height: 1366 }, // portrait iPad-Pro class, ABOVE the 768 breakpoint
  ultrawide: { width: 2560, height: 1080 }, // MAX_CELL_PX clamp territory
} as const;

/** Projects that keep committed golden screenshots. New viewports are structural-only:
 *  screens.spec.ts skips everything else, so the golden set never grows by accident. */
export const GOLDEN_PROJECTS = ["desktop", "laptop", "short-wide", "tablet", "phone"];

export const makeConfig = (target: keyof typeof TARGETS) => defineConfig({
  testDir: "./specs",
  outputDir: "./.results",
  snapshotPathTemplate: "{testDir}/../__screenshots__/{projectName}/{arg}{ext}",
  fullyParallel: true,
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.001, animations: "disabled" },
  },
  reporter: [["list"], ["html", { outputFolder: "./.report", open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${TARGETS[target].port}`,
    deviceScaleFactor: 1,
    // The hosted build registers a service worker (offline support). A page it controls
    // bypasses page.route(), which is how every spec gets its vendored fonts — so it is
    // blocked here, and install.spec.ts allows it for the tests that are about it.
    serviceWorkers: "block",
    launchOptions: {
      args: ["--hide-scrollbars", "--force-color-profile=srgb", "--disable-lcd-text"],
    },
  },
  webServer: {
    command: `node tests/visual/serve.mjs${TARGETS[target].serveArg}`,
    url: `http://127.0.0.1:${TARGETS[target].port}`,
    reuseExistingServer: true,
    cwd: "../..",
  },
  projects: [
    ...Object.entries(VIEWPORTS).map(([name, viewport]) => ({
      name,
      use: { viewport },
    })),
    {
      // Real mobile emulation on the installed Chromium: touch events, mobile UA,
      // isMobile viewport behavior. deviceScaleFactor pinned to 1 like every other
      // project so any screenshots stay comparable. Structural-only (no goldens).
      name: "phone-touch",
      use: { ...devices["Pixel 7"], deviceScaleFactor: 1 },
    },
  ],
});

export default makeConfig("single");
