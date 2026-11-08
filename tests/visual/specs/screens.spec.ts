// tests/visual/specs/screens.spec.ts
// Golden-screenshot layer. Bounded matrix to keep goldens reviewable:
//   - each starter layout × {warm, neon} on every viewport
//   - the reference layout × all five themes on laptop only (theme regression pass)
// Update flow: eyeball the HTML report diff, then `npm run vr:update` + commit.
import { test, expect } from "@playwright/test";
import { prepPage, settle, ThemeName } from "../helpers/inject";
import { GOLDEN_PROJECTS } from "../playwright.config";

// Golden containment: structural-only projects (phone-small, tablet-large, ultrawide,
// phone-touch, …) never grow the committed screenshot set.
test.beforeEach(({}, testInfo) => {
  test.skip(
    !GOLDEN_PROJECTS.includes(testInfo.project.name),
    "goldens are limited to GOLDEN_PROJECTS",
  );
});

const LAYOUTS = ["reference", "practice_advanced", "harmony_explorer"];
const CORE_THEMES: ThemeName[] = ["warm", "neon"];
const ALL_THEMES: ThemeName[] = ["warm", "moss", "sherbet", "sigil", "neon"];

for (const layout of LAYOUTS) {
  for (const theme of CORE_THEMES) {
    test(`${layout} layout — ${theme} theme`, async ({ page }) => {
      await prepPage(page, { theme });
      await page.goto(`/?layout=${layout}`);
      await settle(page);
      await expect(page).toHaveScreenshot(`${layout}-${theme}.png`);
    });
  }
}

for (const theme of ALL_THEMES.filter((t) => !CORE_THEMES.includes(t))) {
  test(`reference layout — ${theme} theme`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "laptop", "full theme sweep runs on laptop only");
    await prepPage(page, { theme });
    await page.goto("/?layout=reference");
    await settle(page);
    await expect(page).toHaveScreenshot(`reference-${theme}.png`);
  });
}
