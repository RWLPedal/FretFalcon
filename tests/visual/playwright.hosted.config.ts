// tests/visual/playwright.hosted.config.ts
// The same harness as playwright.config.ts, pointed at the hosted build target
// (dist-hosted/). Specs and goldens are shared: both targets are built from the same
// source and must render identically, so a diff here means the builds have diverged.
import { makeConfig } from "./playwright.config";

export default makeConfig("hosted");
