// tests/visual/specs/practice.spec.ts
// The practice tools (Metronome, Timer, Strum, Backing Track, Schedule) in the tabbed
// (mobile) layout. They are read from a music stand, so each must FILL the screen and
// clip nothing: no grid cut off at the edge, no column pushed out of view, nothing
// floating in a corner of an empty panel. And no form control under 16px, which makes
// iOS Safari zoom the page when it is focused.
import { test, expect, Page } from "@playwright/test";
import { prepPage, settleLayout } from "../helpers/inject";

const MOBILE_PROJECTS = ["tablet", "phone", "phone-small", "phone-touch", "phone-landscape"];

test.beforeEach(({}, testInfo) => {
  test.skip(!MOBILE_PROJECTS.includes(testInfo.project.name), "mobile projects only");
});

const METRONOME = "instrument_floating_metronome";
const TIMER = "floating_timer";
const STRUM = "strum_view";
const BACKING_TRACK = "drum_machine";
const SCHEDULE = "schedule_floating_view";

/** Each tool and the element that should take up the panel. */
const TOOLS: Array<{ viewId: string; root: string }> = [
  { viewId: METRONOME, root: ".metronome-view" },
  { viewId: TIMER, root: ".timer-view" },
  { viewId: STRUM, root: ".sv-root" },
  { viewId: BACKING_TRACK, root: ".drum-machine-view" },
  { viewId: SCHEDULE, root: ".editor-root" },
];

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
  });
  return errors;
}

/** Open an empty workspace and spawn one tool as the only (active) tab. */
async function openTool(page: Page, viewId: string): Promise<string> {
  await prepPage(page);
  await page.goto("/?layout=empty&fftest");
  await settleLayout(page);
  const id = (await page.evaluate((v) => (window as any).__ff.spawn(v), viewId)) as string | null;
  expect(id, `${viewId} did not spawn`).toBeTruthy();
  await settleLayout(page);
  return id!;
}

interface PanelAudit {
  /** Visible descendants reaching past the left or right edge of the panel. */
  clipped: string[];
  /** Focusable text controls whose font is under 16px. */
  smallFonts: string[];
  /** Sideways overflow of the panel's scroll area. */
  scrollX: number;
  /** Share of the panel's height / width the tool's root element covers. */
  fillH: number;
  fillW: number;
}

/** Measure the active tab's panel. */
const auditPanel = (page: Page, rootSelector: string) =>
  page.evaluate((rootSel): PanelAudit => {
    const panel = [...document.querySelectorAll<HTMLElement>(".tabbed-panel")].find(
      (p) => p.style.display !== "none",
    )!;
    const content = panel.querySelector<HTMLElement>(".tabbed-panel-content")!;
    const area = content.getBoundingClientRect();
    const describe = (el: Element) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]}`;

    const clipped: string[] = [];
    for (const el of content.querySelectorAll<HTMLElement>("*")) {
      if (!el.offsetParent) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      if (r.right > area.right + 1 || r.left < area.left - 1) {
        clipped.push(`${describe(el)} [${Math.round(r.left)}–${Math.round(r.right)}]`);
      }
    }

    const smallFonts: string[] = [];
    for (const el of content.querySelectorAll<HTMLElement>(
      'select, textarea, input, [contenteditable="true"]',
    )) {
      if (!el.offsetParent) continue;
      const type = (el as HTMLInputElement).type;
      if (["range", "checkbox", "radio", "color", "file"].includes(type)) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size < 16) smallFonts.push(`${describe(el)} ${size}px`);
    }

    const root = content.matches(rootSel) ? content : content.querySelector<HTMLElement>(rootSel)!;
    const rr = root.getBoundingClientRect();
    const style = getComputedStyle(content);
    const innerH = content.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const innerW = content.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    return {
      clipped,
      smallFonts,
      scrollX: content.scrollWidth - content.clientWidth,
      fillH: rr.height / innerH,
      fillW: rr.width / innerW,
    };
  }, rootSelector);

/** Click through the DOM: these checks are about layout, not hit-testing. */
const click = (page: Page, selector: string) =>
  page.evaluate((sel) => document.querySelector<HTMLElement>(sel)!.click(), selector);

const rectOf = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const r = document.querySelector(sel)!.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height };
  }, selector);

// ─── Every tool: fills the panel, clips nothing, zooms nothing ────────────────

for (const { viewId, root } of TOOLS) {
  test(`${viewId} fills the screen and clips nothing`, async ({ page }) => {
    const errors = collectErrors(page);
    await openTool(page, viewId);

    const a = await auditPanel(page, root);
    expect(a.clipped, "content runs past the edge of the screen").toEqual([]);
    expect(a.scrollX, "panel scrolls sideways").toBeLessThanOrEqual(0);
    expect(a.smallFonts, "form control under 16px (iOS zooms on focus)").toEqual([]);
    expect(a.fillW, `${root} does not span the panel`).toBeGreaterThan(0.97);
    expect(a.fillH, `${root} floats in an empty panel`).toBeGreaterThan(0.97);

    expect(errors, errors.join("\n")).toEqual([]);
  });
}

// ─── Metronome ────────────────────────────────────────────────────────────────

test("metronome: the beat pads take the height the controls leave", async ({ page }) => {
  await openTool(page, METRONOME);
  const vp = page.viewportSize()!;

  const beats = await rectOf(page, ".metronome-beats-container");
  const smallestPad = await page.evaluate(() =>
    Math.min(
      ...[...document.querySelectorAll(".metronome-beat")].flatMap((b) => {
        const r = b.getBoundingClientRect();
        return [r.width, r.height];
      }),
    ),
  );
  // The 20px dots of the floating panel would be lost on a stand.
  expect(smallestPad, "beat pads are still dot-sized").toBeGreaterThanOrEqual(28);
  expect(beats.h / vp.height, "beats do not use the free height").toBeGreaterThan(0.3);

  const play = await rectOf(page, ".metronome-view .play-pause-btn");
  expect(Math.min(play.w, play.h), "play button under 44px").toBeGreaterThanOrEqual(44);
});

test("metronome: every time signature keeps all its beats on screen", async ({ page }) => {
  await openTool(page, METRONOME);
  const options = await page.locator(".metronome-time-signature-selector option").allTextContents();
  expect(options.length).toBeGreaterThan(3);

  for (const sig of options) {
    await page.locator(".metronome-time-signature-selector").selectOption(sig);
    const a = await auditPanel(page, ".metronome-view");
    expect(a.clipped, `${sig}: beats run off the screen`).toEqual([]);
    const pads = await page.evaluate(() => {
      const box = document.querySelector(".metronome-beats-container")!.getBoundingClientRect();
      return [...document.querySelectorAll(".metronome-beat")].map((b) => {
        const r = b.getBoundingClientRect();
        return r.width >= 20 && r.height >= 20 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1;
      });
    });
    expect(pads.length, `${sig}: no beats drawn`).toBeGreaterThan(1);
    expect(pads.every(Boolean), `${sig}: a beat pad is squashed or outside its grid`).toBe(true);
  }
});

// ─── Timer ────────────────────────────────────────────────────────────────────

test("timer: the time is sized to the screen, and stays on one line", async ({ page }) => {
  await openTool(page, TIMER);
  const vp = page.viewportSize()!;
  const portrait = vp.height > vp.width;

  const display = await rectOf(page, ".timer-display");
  // M:SS spans most of a portrait screen; on its side it shares the row with the transport.
  expect(display.w / vp.width, "time is not screen-sized").toBeGreaterThan(portrait ? 0.55 : 0.3);
  expect(display.right, "time runs off the screen").toBeLessThanOrEqual(vp.width);

  const start = await rectOf(page, ".timer-start-pause");
  expect(Math.min(start.w, start.h), "start button under 44px").toBeGreaterThanOrEqual(44);

  // H:MM:SS is longer than M:SS and must not overflow at the same size.
  await page.evaluate(() => {
    const d = document.querySelector<HTMLElement>(".timer-display")!;
    d.textContent = "1:00:00";
    d.classList.add("timer-display--long");
  });
  const long = await rectOf(page, ".timer-display");
  expect(long.right, "an hours reading runs off the screen").toBeLessThanOrEqual(vp.width);
  expect(long.left, "an hours reading runs off the screen").toBeGreaterThanOrEqual(0);
});

test("timer: settings open under the face without clipping", async ({ page }) => {
  await openTool(page, TIMER);
  await click(page, ".timer-settings-btn");
  await expect(page.locator(".timer-config")).toBeVisible();

  // Intervals has the most controls (mode, cycle steppers, count-in, chime).
  await page.locator(".timer-seg-group .config-toggle-btn", { hasText: "Intervals" }).first().click();
  await expect(page.locator(".timer-steppers")).toBeVisible();

  const a = await auditPanel(page, ".timer-view");
  expect(a.clipped, "timer settings run off the screen").toEqual([]);
  expect(a.scrollX).toBeLessThanOrEqual(0);

  const smallest = await page.evaluate(() =>
    Math.min(
      ...[...document.querySelectorAll(".timer-config .config-toggle-btn")].map(
        (b) => b.getBoundingClientRect().height,
      ),
    ),
  );
  expect(smallest, "timer settings buttons under 36px").toBeGreaterThanOrEqual(36);
});

// ─── Strum ────────────────────────────────────────────────────────────────────

test("strum: every slot of the bar is on screen, in eighths and sixteenths", async ({ page }) => {
  await openTool(page, STRUM);
  const vp = page.viewportSize()!;

  const slots = () =>
    page.evaluate(() =>
      [...document.querySelectorAll(".sv-slot")].map((s) => {
        const r = s.getBoundingClientRect();
        return { left: r.left, right: r.right, top: Math.round(r.top), w: r.width, h: r.height };
      }),
    );

  const check = async (label: string, expected: number) => {
    const all = await slots();
    expect(all.length, `${label}: wrong slot count`).toBe(expected);
    for (const s of all) {
      expect(s.left, `${label}: slot off the left edge`).toBeGreaterThanOrEqual(0);
      expect(s.right, `${label}: slot cut off at the right edge`).toBeLessThanOrEqual(vp.width);
      expect(s.w, `${label}: slot too narrow to tap`).toBeGreaterThanOrEqual(30);
      expect(s.h, `${label}: slot too short to tap`).toBeGreaterThanOrEqual(44);
    }
    return new Set(all.map((s) => s.top)).size;
  };

  // 4/4 in eighths: 8 slots.
  await check("eighths", 8);

  // 4/4 in sixteenths: 16 slots. A phone held upright cannot fit them in one row at a
  // tappable width, so whole beats wrap onto a second row.
  await click(page, ".sv-subdiv-btn");
  const rows = await check("sixteenths", 16);
  if (vp.width < 500) expect(rows, "sixteenths were squeezed into one row").toBeGreaterThan(1);

  // Every row starts on a beat: the first label of each .sv-beat is a beat number.
  const firstLabels = await page.evaluate(() =>
    [...document.querySelectorAll(".sv-beat")].map(
      (b) => b.querySelector(".sv-beat-label")!.textContent,
    ),
  );
  expect(firstLabels).toEqual(["1", "2", "3", "4"]);

  const a = await auditPanel(page, ".sv-root");
  expect(a.clipped).toEqual([]);
});

test("strum: tapping a slot still cycles it, and the pattern survives a reload", async ({ page }) => {
  await openTool(page, STRUM);
  const first = page.locator(".sv-slot").first();
  await expect(first).toHaveClass(/sv-slot--rest/);
  await first.click();
  await expect(first).toHaveClass(/sv-slot--stroke/);

  await page.goto("/?fftest");
  await settleLayout(page);
  await expect(page.locator(".sv-slot").first()).toHaveClass(/sv-slot--stroke/);
});

// ─── Backing Track ────────────────────────────────────────────────────────────

test("backing track: the step grid spans the screen with tappable cells", async ({ page }) => {
  await openTool(page, BACKING_TRACK);
  const vp = page.viewportSize()!;

  const grid = await rectOf(page, ".dm-grid");
  expect(grid.w / vp.width, "step grid does not span the screen").toBeGreaterThan(0.85);

  const cells = await page.evaluate(() =>
    [...document.querySelectorAll(".dm-v-cell, .dm-cell")].map((c) => {
      const r = c.getBoundingClientRect();
      return { w: r.width, h: r.height, left: r.left, right: r.right };
    }),
  );
  expect(cells.length, "no step cells").toBeGreaterThan(16);
  for (const c of cells) {
    expect(c.left).toBeGreaterThanOrEqual(0);
    expect(c.right, "step cell cut off at the right edge").toBeLessThanOrEqual(vp.width);
    expect(c.w, "step cell narrower than the old 24px").toBeGreaterThan(24);
    expect(c.h, "step cell shorter than the old 24px").toBeGreaterThan(24);
  }

  // The chord cells line up with the step rows/columns for every bar count.
  for (const bars of ["8", "12", "4"]) {
    await page.locator(".dm-bars-btn", { hasText: new RegExp(`^${bars}$`) }).click();
    const chords = await page.evaluate(() =>
      [...document.querySelectorAll(".dm-v-measure-cell, .dm-measure-cell")].map((c) => {
        const r = c.getBoundingClientRect();
        return { w: r.width, h: r.height, right: r.right };
      }),
    );
    expect(chords.length, `${bars} bars: wrong chord cell count`).toBe(Number(bars));
    for (const c of chords) {
      expect(Math.min(c.w, c.h), `${bars} bars: a chord cell collapsed`).toBeGreaterThan(12);
      expect(c.right, `${bars} bars: chord cell off screen`).toBeLessThanOrEqual(vp.width);
    }
    const a = await auditPanel(page, ".drum-machine-view");
    expect(a.clipped, `${bars} bars: grid runs off the screen`).toEqual([]);
  }
});

test("backing track: tapping a step toggles it", async ({ page }) => {
  await openTool(page, BACKING_TRACK);
  const cell = page.locator(".dm-v-cell, .dm-cell").first();
  await expect(cell).not.toHaveClass(/dm-cell-filled/);
  await cell.click();
  await expect(cell).toHaveClass(/dm-cell-filled/);
});

// ─── Schedule ─────────────────────────────────────────────────────────────────

test("schedule editor: the list and the inspector take turns", async ({ page }) => {
  const errors = collectErrors(page);
  await openTool(page, SCHEDULE);
  const vp = page.viewportSize()!;

  // List first: full width, the inspector out of the way.
  const list = await rectOf(page, ".editor-sidebar");
  expect(list.w / vp.width, "interval list is not full width").toBeGreaterThan(0.9);
  await expect(page.locator(".editor-inspector")).toBeHidden();
  const row = page.locator(".sidebar-interval-row").first();
  expect((await row.boundingBox())!.height, "interval row under 44px").toBeGreaterThanOrEqual(44);

  // Tap a row: its inspector takes the panel, with a way back.
  await row.locator(".interval-text-col").click();
  await expect(page.locator(".editor-inspector")).toBeVisible();
  await expect(page.locator(".editor-sidebar")).toBeHidden();
  const inspector = await rectOf(page, ".editor-inspector");
  expect(inspector.w / vp.width, "inspector is not full width").toBeGreaterThan(0.9);

  // Give the interval a view so the inspector shows its argument controls too.
  await page.locator(".inspector-feature-select").selectOption("Scale");
  await page.locator(".inspector-task-input").fill("Major scale, slowly");
  const a = await auditPanel(page, ".editor-root");
  expect(a.clipped, "inspector runs off the screen").toEqual([]);
  expect(a.smallFonts, "inspector control under 16px (iOS zooms on focus)").toEqual([]);

  // Back: the list returns, showing the edit.
  await page.locator(".inspector-back-btn").click();
  await expect(page.locator(".editor-sidebar")).toBeVisible();
  await expect(page.locator(".editor-inspector")).toBeHidden();
  await expect(page.locator(".interval-task-name").first()).toHaveText("Major scale, slowly");

  // A group opens its own inspector the same way.
  await page.locator(".editor-footer .editor-btn", { hasText: "Group" }).click();
  await page.locator(".sidebar-group-row .group-name").click();
  await expect(page.locator(".inspector-group-name-input")).toBeVisible();
  const g = await auditPanel(page, ".editor-root");
  expect(g.clipped, "group inspector runs off the screen").toEqual([]);
  expect(g.smallFonts).toEqual([]);

  expect(errors, errors.join("\n")).toEqual([]);
});

test("schedule playback: the interval time is sized for the stand", async ({ page }) => {
  await openTool(page, SCHEDULE);
  const vp = page.viewportSize()!;
  await click(page, ".editor-footer .btn-apply");
  await expect(page.locator(".schedule-playback-view")).toBeVisible();

  const time = await rectOf(page, ".playback-time-display");
  expect(time.h, "playback time is still panel-sized").toBeGreaterThan(Math.min(vp.width, vp.height) * 0.15);
  expect(time.right).toBeLessThanOrEqual(vp.width);

  const pause = await rectOf(page, ".playback-pause-btn");
  expect(Math.min(pause.w, pause.h), "play button under 44px").toBeGreaterThanOrEqual(44);
  const smallestCtrl = await page.evaluate(() =>
    Math.min(
      ...[...document.querySelectorAll(".playback-ctrl-btn")].flatMap((b) => {
        const r = b.getBoundingClientRect();
        return [r.height];
      }),
    ),
  );
  expect(smallestCtrl, "a playback control is under 40px tall").toBeGreaterThanOrEqual(40);

  const a = await auditPanel(page, ".sfv-play-section");
  expect(a.clipped, "playback runs off the screen").toEqual([]);
});

// ─── Desktop is untouched ─────────────────────────────────────────────────────

test.describe("floating layout", () => {
  // One mobile project is enough: the test widens the viewport itself, so that the
  // same page (and stylesheet) is seen on both sides of the breakpoint.
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "phone", "runs once, on the phone project");
  });

  test("mobile-only rules do not reach a wide screen", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await prepPage(page);
    await page.goto("/?layout=empty&fftest");
    await settleLayout(page);
    expect(await page.evaluate(() => (window as any).__ff.strategy())).toBe("floating");

    await page.evaluate((v) => (window as any).__ff.spawn(v), SCHEDULE);
    await page.evaluate((v) => (window as any).__ff.spawn(v), STRUM);
    await settleLayout(page);

    // Schedule: list and inspector side by side, no back button.
    await expect(page.locator(".editor-sidebar")).toBeVisible();
    await expect(page.locator(".editor-inspector")).toBeVisible();
    await expect(page.locator(".inspector-back-btn")).toBeHidden();
    await page.locator(".sidebar-interval-row .interval-text-col").first().click();
    await expect(page.locator(".editor-sidebar")).toBeVisible();

    // Strum: one fixed-width row of slots, as before.
    const tops = await page.evaluate(() => [
      ...new Set([...document.querySelectorAll(".sv-slot")].map((s) => Math.round(s.getBoundingClientRect().top))),
    ]);
    expect(tops.length, "desktop strum grid wrapped").toBe(1);
    const gridW = await page.evaluate(() => document.querySelector(".sv-grid")!.getBoundingClientRect().width);
    // 416px when the panel has the room; never wider (and never wider than its panel).
    expect(gridW).toBeLessThanOrEqual(416);
    expect(gridW).toBeGreaterThan(300);
  });
});

// ─── Touch: the gestures a mouse gets for free ────────────────────────────────

test("schedule: a tap renames the schedule; a finger drags a row by its handle to reorder", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone-touch", "touch project only");
  const errors = collectErrors(page);
  await openTool(page, SCHEDULE);

  // The schedule's name: one tap makes it editable (no double-click on a touch screen).
  // (Checked before the drag below: after a raw CDP touch sequence Chromium drops the
  // click of the next emulated tap, wherever on the page either of them was.)
  const name = page.locator(".schedule-name-display");
  await name.tap();
  await expect(name).toHaveAttribute("contenteditable", "true");
  await page.keyboard.type("Warm-up");
  await page.keyboard.press("Enter");
  await expect(name).toHaveAttribute("contenteditable", "false");
  await expect(name).toHaveText("Warm-up");

  // Three intervals, named so their order can be read back.
  const nameInterval = async (name: string) => {
    await page.locator(".inspector-task-input").fill(name);
    await page.locator(".inspector-back-btn").tap();
  };
  await page.locator(".sidebar-interval-row .interval-text-col").first().tap();
  await nameInterval("Alpha");
  for (const name of ["Bravo", "Charlie"]) {
    await page.locator(".editor-footer .editor-btn", { hasText: "Interval" }).tap();
    await nameInterval(name);
  }
  const order = () => page.locator(".interval-task-name").allTextContents();
  expect(await order()).toEqual(["Alpha", "Bravo", "Charlie"]);

  // Raw touch points through CDP: a real finger, with the browser's own scrolling
  // and long-press handling in play.
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", x: number, y: number) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }],
    });
  const handle = (await page.locator(".sidebar-interval-row .drag-handle").nth(2).boundingBox())!;
  expect(Math.min(handle.width, handle.height), "drag handle too small to take hold of").toBeGreaterThanOrEqual(30);
  const first = (await page.locator(".sidebar-interval-row").first().boundingBox())!;
  const x = handle.x + handle.width / 2;
  const fromY = handle.y + handle.height / 2;
  const toY = first.y + 4; // above the middle of the first row: before it

  await touch("touchStart", x, fromY);
  for (let i = 1; i <= 8; i++) {
    await touch("touchMove", x, fromY + ((toY - fromY) * i) / 8);
    await page.waitForTimeout(16);
  }
  await expect(page.locator(".sidebar-interval-row.dragging"), "the row was not picked up").toHaveCount(1);
  await touch("touchEnd", x, toY);

  await expect.poll(order, { message: "the drag did not reorder the rows" }).toEqual(["Charlie", "Alpha", "Bravo"]);
  await expect(page.locator(".sidebar-interval-row.dragging")).toHaveCount(0);
  // Dropping a row is not tapping it: the list is still what is on screen.
  await expect(page.locator(".editor-sidebar")).toBeVisible();
  await expect(page.locator(".editor-inspector")).toBeHidden();
  await expect(name, "reordering lost the schedule's name").toHaveText("Warm-up");

  expect(errors, errors.join("\n")).toEqual([]);
});

test("backing track: a track's sound can be changed in the upright grid", async ({ page }) => {
  await openTool(page, BACKING_TRACK);
  const pickers = page.locator(".dm-v-track-select");
  test.skip((await pickers.count()) === 0, "this screen is wide enough for the horizontal grid, which has dropdowns");

  const header = page.locator(".dm-v-track-hdr").first();
  const box = (await header.boundingBox())!;
  expect(box.height, "sound picker under 34px tall").toBeGreaterThanOrEqual(34);
  const code = header.locator(".dm-v-track-code");
  await expect(code).toHaveText("Ki"); // Kick

  // The picker covers the header, so a tap anywhere on it opens the system's list.
  const pickerBox = (await pickers.first().boundingBox())!;
  expect(pickerBox.width).toBeGreaterThanOrEqual(box.width - 2);
  await pickers.first().selectOption("tom");
  await expect(code).toHaveText("To");

  // The track now paints with the new sound…
  const cell = page.locator(".dm-v-cell").first();
  await cell.click();
  await expect(cell).toHaveAttribute("title", "Tom");

  // …and the choice is part of the saved state.
  const saved = await page.evaluate(() => {
    const payload = JSON.parse(localStorage.getItem("floatingViewStates_reference")!).payload;
    return (Object.values(payload.instances)[0] as any).viewState.trackSounds as string[];
  });
  expect(saved[0]).toBe("tom");
});

// ─── The screen stays on while something is playing ───────────────────────────

/** Swap the browser's Wake Lock API for one that keeps count. Before navigation. */
async function countWakeLocks(page: Page): Promise<() => Promise<{ requests: number; active: number }>> {
  await page.addInitScript(() => {
    const log = { requests: 0, active: 0 };
    (window as any).__wake = log;
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: {
        request: async () => {
          log.requests++;
          log.active++;
          const lock = new EventTarget() as EventTarget & { release: () => Promise<void> };
          lock.release = async () => {
            log.active--;
            lock.dispatchEvent(new Event("release"));
          };
          return lock;
        },
      },
    });
  });
  return () => page.evaluate(() => ({ ...(window as any).__wake }));
}

test("screen: kept awake while the metronome and timer run, released when both stop", async ({ page }) => {
  const errors = collectErrors(page);
  const wake = await countWakeLocks(page);
  const metronomeId = await openTool(page, METRONOME);
  const timerId = (await page.evaluate((v) => (window as any).__ff.spawn(v), TIMER)) as string;
  await settleLayout(page);
  expect((await wake()).requests, "nothing is playing yet").toBe(0);

  const press = (instanceId: string, selector: string) =>
    page.evaluate(
      ([iid, sel]) =>
        document.querySelector<HTMLElement>(`.tabbed-panel[data-instance-id="${iid}"] ${sel}`)!.click(),
      [instanceId, selector],
    );

  await press(metronomeId, ".play-pause-btn");
  await expect.poll(async () => (await wake()).active, { message: "starting the metronome" }).toBe(1);

  // A second tool playing shares the one lock…
  await press(timerId, ".timer-start-pause");
  await page.waitForTimeout(50);
  expect(await wake()).toEqual({ requests: 1, active: 1 });

  // …which outlives the first to stop…
  await press(metronomeId, ".play-pause-btn");
  await page.waitForTimeout(50);
  expect((await wake()).active, "the timer is still running").toBe(1);

  // …and goes when the last one does.
  await press(timerId, ".timer-start-pause");
  await expect.poll(async () => (await wake()).active, { message: "everything has stopped" }).toBe(0);

  expect(errors, errors.join("\n")).toEqual([]);
});

test("screen: closing a tool that is still playing lets the screen sleep again", async ({ page }) => {
  const wake = await countWakeLocks(page);
  const id = await openTool(page, BACKING_TRACK);
  await click(page, ".dm-play-btn");
  await expect.poll(async () => (await wake()).active, { message: "the backing track is playing" }).toBe(1);

  await page.evaluate((iid) => (window as any).__ff.close(iid), id);
  await expect.poll(async () => (await wake()).active, { message: "its panel was closed" }).toBe(0);
});

test("screen: kept awake through a running schedule, released when it is paused", async ({ page }) => {
  const wake = await countWakeLocks(page);
  await openTool(page, SCHEDULE);
  await click(page, ".editor-footer .btn-apply");
  await expect(page.locator(".schedule-playback-view")).toBeVisible();

  const playing = () => page.locator(".playback-pause-btn--playing").count();
  if ((await playing()) === 0) await click(page, ".playback-pause-btn");
  await expect.poll(playing).toBe(1);
  await expect.poll(async () => (await wake()).active, { message: "the schedule is running" }).toBe(1);

  await click(page, ".playback-pause-btn");
  await expect.poll(async () => (await wake()).active, { message: "the schedule is paused" }).toBe(0);
});
