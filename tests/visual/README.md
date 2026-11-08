# Visual / structural harness

Playwright-driven regression tests for the built app. The same specs run against
both build targets: the single-file `dist/index.html` (`playwright.config.ts`) and
the hosted `dist-hosted/` (`playwright.hosted.config.ts`). The targets share one set
of goldens, so a screenshot that passes on one and fails on the other means the two
builds have diverged. Two layers:

- **Structural (most specs)** — no screenshots, never needs updating. The cheap layer
  that catches "panel too small / overlapping / lost on someone's screen" and
  per-platform exceptions. Run it before committing (`npm run smoke`).
  - `specs/structural.spec.ts` — spawns every registered panel on every viewport:
    no spawn exception, no console/page errors; desktop asserts rendered size ≥ the
    declared `PanelSizing.min`, mobile asserts a tab is created, exactly one tab
    panel is visible, and nothing overflows sideways. Every bundled starter layout
    restores clean on every viewport (desktop: no overlap/overflow; mobile: every
    instance becomes a tab). Nearby Triads' one-board-per-chord display fits its
    floating panel in the voice-leading layout (a floating panel clips, it does not
    scroll).
  - `specs/breakpoint.spec.ts` — the desktop↔mobile strategy switch (narrow ≤768px
    OR short ≤480px, see `TABBED_MEDIA_QUERY`): two full round trips lose no panels,
    leak no `.is-scrollable`, and the JS (`matchMedia`) and CSS (`<html data-layout>`)
    sides flip together at exactly 768/769px, and a 844×390 phone-on-its-side stays
    tabbed while 844×481 does not. Also the saved state a
    reload reads back: panel positions and links survive a detour through the tabbed
    layout, links survive a plain reload, and the Global Key panel is kept (dormant)
    rather than deleted by a mobile load.
  - `specs/resize.spec.ts` — desktop resize gauntlet (fit-aware cell, scroll-instead-
    of-shrink both directions, reconcile stability, lossless moderate round trip),
    sidebar collapse/expand, and the ultrawide fit-model check.
  - `specs/mobile.spec.ts` — tabbed-layout behaviour on the mobile projects: the
    first-run starter tabs, tab bar usability with many tabs at 320px (active tab
    and + button stay on screen), the top-bar panel actions (options, rotate, close),
    fit-to-pane fretboards in both orientations (Triad Shapes' several boards lie
    across the screen), compact options, touch-target sizes, the add and menu sheets
    (nav filtering: no desktop-only panels, no Global Key, nothing the instrument
    can't use), link connectors, the tablet's two panes (active tab + neighbour, and
    the draggable divider between them), the Circle of Fifths fitting its pane, a
    panel still waiting on its linked source being fitted all the same, Nearby Triads (its several boards lie across the
    screen and fit it with their voicing controls; its display can be changed while
    the linked source is silent; its chord wizard and one-board display fit too),
    and real touch on the `phone-touch` project — taps, a swipe between tabs, one
    long-press tab drag and one strip swipe, driven with raw CDP touch points. Other
    reorder checks go through the bridge (`__ff.reorderTabs`).
  - `specs/practice.spec.ts` — the practice tools (Metronome, Timer, Strum, Backing
    Track, Schedule) on the mobile projects: each fills its panel, nothing runs past
    the edge of the screen, no form control is under 16px (iOS zooms on focus), the
    strum grid wraps whole beats, the schedule's list and inspector take turns, the
    upright Backing Track grid can change a track's sound, and (on `phone-touch`) a
    finger reorders schedule rows by their handle and a tap renames the schedule. One
    test widens the viewport to confirm none of it reaches the floating layout. Also
    the screen wake lock: held while anything plays (one lock for several tools),
    released when the last stops or its panel is closed — against a counting
    stand-in for `navigator.wakeLock`.
    Harness gotcha: after a raw CDP touch sequence Chromium drops the click of the
    NEXT emulated `tap()`, anywhere on the page — do taps first, raw touches last.
  - `specs/onboarding.spec.ts` — teardown hygiene: skipping or completing the tour
    must leave zero `.onb-block` (the invisible full-viewport click-blocker) behind.
    On the mobile projects: the welcome card and every tip of the mobile tour fit
    the screen (down to 320px), the tour leaves the open tabs alone, and the menu
    entry and the first-visit hint both lead to it.
  - `specs/install.spec.ts` — the app on a phone's home screen. Hosted target: the
    page links a web manifest whose icons load and are the sizes they claim, and a
    visited page opens again with the network off (its service worker kept the page
    and every file it loads; the test marks the cached page so an offline load cannot
    be mistaken for one that reached the server). Single-file target: nothing to
    install. Both: the browser-chrome tint follows the theme; on the mobile projects
    the shell keeps its controls clear of a notch and a home indicator (insets
    emulated over CDP, `Emulation.setSafeAreaInsetsOverride`), and the page asks for
    the touch behaviour an app needs (`touch-action`, `overscroll-behavior`,
    `text-size-adjust`). Service workers are **blocked** for every other spec
    (`serviceWorkers: "block"` in the config): a page one controls bypasses
    `page.route()`, which is how the specs get their vendored fonts.
- **Screenshot (`specs/screens.spec.ts`)** — golden-image diffs of the starter layouts
  across a bounded theme × viewport matrix. Catches theme/color/rendering regressions
  the structural layer can't express. Goldens live in `__screenshots__/` and are
  committed.

## Viewport projects

`playwright.config.ts` defines one project per viewport. `GOLDEN_PROJECTS`
(desktop, laptop, short-wide, tablet, phone) are the only ones that keep committed
screenshots — `screens.spec.ts` skips everything else, so **new viewports never grow
the golden set**. The structural-only projects: `phone-small` 320×568 (worst-case
narrow), `phone-landscape` 844×390 (a phone on its side: wider than 768px, kept on
the tabbed layout by its height), `tablet-large` 1024×1366 (portrait tablet ABOVE the mobile breakpoint —
exercises the MIN_CELL_PX floor with the sidebar visible), `ultrawide` 2560×1080,
and `phone-touch` (Pixel 7 device emulation: touch events + mobile UA on Chromium).

## Commands (run from repo root)

| Command | What it does |
|---|---|
| `npm run smoke` | Build + all structural specs on all projects. No goldens. Pre-commit check. |
| `npm run smoke:hosted` | The same, against the hosted build target. |
| `npm run vr` | Build + full suite incl. screenshot diffs. Pre-release check. |
| `npm run vr:hosted` | The same, against the hosted build target (same goldens). |
| `npm run vr:update` | Regenerate goldens after an *intended* visual change, then commit them. |
| `npm run vr:ui` | Playwright UI mode for debugging (no build). |
| `npm run check` | Typecheck app + tests, then the vitest unit suite. |
| `npm run test:all` | `check`, then build both targets and run the structural specs on each. |

Update flow for an intended visual change: run `npm run vr`, eyeball the HTML report
diff (`tests/visual/.report/`), then `npm run vr:update` and commit the new goldens.

## How it works

- **Server**: `serve.mjs` serves `dist/` on port 4173, or `dist-hosted/` on 4174
  when started with `hosted` (Playwright starts it). Testing the built artifacts
  also regression-tests `build_html.js`'s assembly of each target.
- **Test bridge**: `ts/test_bridge.ts` exposes `window.__ff` only when `?fftest` is
  in the URL — zero effect on the shipped app otherwise. Read side: `listViews`,
  `report` (per-panel rects + declared minimums at the live cell), `featureCensus`,
  `strategy` (floating|tabbed), `tabs`, `areaFlags` (`is-scrollable`), `gridInfo`
  (cell/originX/cols), `layoutEpoch` (monotonic layout-pass counter). Write side:
  `spawn`, `close`, `activateTab`.
- **Waiting discipline**: never use a bare `waitForTimeout` to outwait the app's
  resize debounces (PanelHost 100ms + FloatingLayout 100ms + grid repaint 150ms).
  Use `settleLayout(page)` from `helpers/inject.ts`: it polls `layoutEpoch` +
  `report()` until two samples ≥250ms apart agree, so specs wait exactly as long as
  the layout actually moves.
- **Fixtures**: starter layouts are loaded via the app's own `?layout=<key>` param
  (keys from `ts/screen_config/default_configs.ts`), so they migrate with the schema.
- **Determinism**: Google Fonts + Material Icons are vendored under `assets/fonts/`
  and served locally (`helpers/inject.ts` routes the CDN hosts); animations are frozen;
  `deviceScaleFactor: 1` (also pinned on the emulated `phone-touch` device). Regenerate
  fonts only if `index.html`'s font list changes: `node tests/visual/tools/vendor_fonts.mjs`.

Goldens must be regenerated after a Playwright/Chromium version bump (rasterization can
shift): `npm run vr:update`.
