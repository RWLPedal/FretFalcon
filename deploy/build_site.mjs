#!/usr/bin/env node
// Assembles the complete fretfalcon.com site into deploy/site/ from the two
// projects that make it up:
//
//   FretFalcon      -> /            the webapp (the hosted build target: a small
//                                   index.html plus content-hashed assets/)
//   FretFalcon_info -> /info/       the Astro info page
//
// The result is a plain static directory: copy it to a server, serve it with
// anything, or hand it to `netlify deploy --dir=deploy/site`.
//
// Flags:
//   --skip-build   assemble from the existing build outputs (fast merge iteration)
//   --install      run npm ci in all three package roots first
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, "..");
const INFO_ROOT =
  process.env.FRETFALCON_INFO_DIR ?? path.resolve(APP_ROOT, "../FretFalcon_info");
const OUT = path.join(HERE, "site");

// Must match SITE_ORIGIN in ../build_html.js and `site` in the info project's
// astro.config.mjs — all three bake absolute URLs into their output.
const SITE_ORIGIN = "https://fretfalcon.com";

// Where the info build lands inside OUT. Must match `base` in astro.config.mjs.
const INFO_SUBDIR = "info";

const args = new Set(process.argv.slice(2));
const skipBuild = args.has("--skip-build");
const doInstall = args.has("--install");

const step = (msg) => console.log(`\n\x1b[1m>> ${msg}\x1b[0m`);
const fail = (msg) => {
  console.error(`\n\x1b[31mbuild_site: ${msg}\x1b[0m\n`);
  process.exit(1);
};

// npm is a .cmd shim on Windows, which execFile can't spawn without a shell.
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const run = (args, cwd) =>
  execFileSync(npm, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });

// ── Preflight ───────────────────────────────────────────────────────────────
// The app's webpack build resolves ts-loader out of ts/node_modules, so that
// install is a separate prerequisite from the root one.
const NEEDS_INSTALL = [
  { dir: APP_ROOT, label: "FretFalcon" },
  { dir: path.join(APP_ROOT, "ts"), label: "FretFalcon/ts" },
  { dir: INFO_ROOT, label: "FretFalcon_info" },
];

if (!fs.existsSync(INFO_ROOT)) {
  fail(
    `info project not found at ${INFO_ROOT}\n` +
      `Set FRETFALCON_INFO_DIR if it lives somewhere else.`,
  );
}

if (doInstall) {
  for (const { dir, label } of NEEDS_INSTALL) {
    step(`npm ci — ${label}`);
    run(["ci"], dir);
  }
} else {
  const missing = NEEDS_INSTALL.filter(
    ({ dir }) => !fs.existsSync(path.join(dir, "node_modules")),
  );
  if (missing.length) {
    fail(
      `missing node_modules in:\n` +
        missing.map(({ dir }) => `  ${dir}`).join("\n") +
        `\n\nRun this script with --install, or install them yourself.`,
    );
  }
}

// ── Build both projects ─────────────────────────────────────────────────────
if (skipBuild) {
  console.log("Skipping builds (--skip-build); assembling existing build outputs.");
} else {
  step("Building the app (FretFalcon)");
  run(["run", "build"], APP_ROOT);

  step("Building the info page (FretFalcon_info)");
  run(["run", "build"], INFO_ROOT);
}

// The app's hosted target, not dist/ — that holds the single-file build, which
// reaches the site only as the download inside the hosted directory.
const APP_DIST = path.join(APP_ROOT, "dist-hosted");
const INFO_DIST = path.join(INFO_ROOT, "dist");
for (const [dist, label] of [
  [APP_DIST, "FretFalcon"],
  [INFO_DIST, INFO_ROOT],
]) {
  if (!fs.existsSync(dist)) fail(`${label} has no build output at ${dist}`);
}

// ── Assemble ────────────────────────────────────────────────────────────────
// Always from scratch: the app's assets and the info CSS are content-hashed, so
// an incremental copy would silently accumulate orphaned files.
//
// Clear the contents rather than the directory itself. On Windows, removing a
// directory fails with EBUSY whenever anything holds a handle on it — a shell
// sitting in it, an open editor, or the preview server from `npm run site:serve`
// — and rebuilding while previewing is exactly the normal workflow.
step(`Assembling ${path.relative(APP_ROOT, OUT)}`);
fs.mkdirSync(OUT, { recursive: true });
for (const entry of fs.readdirSync(OUT)) {
  fs.rmSync(path.join(OUT, entry), { recursive: true, force: true });
}

fs.cpSync(APP_DIST, OUT, { recursive: true });
fs.cpSync(INFO_DIST, path.join(OUT, INFO_SUBDIR), { recursive: true });

// Netlify config lives next to this script and ships at the site root.
for (const name of ["_redirects", "_headers"]) {
  const src = path.join(HERE, name);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(OUT, name));
  else console.warn(`  (no deploy/${name} — skipping)`);
}

// The app's build writes a robots.txt that only knows about its own sitemap.
// Only the root robots.txt is ever read, so replace it with one covering both
// halves of the site. The info build's own sitemap stays where it is, under
// /info/, and is advertised from here.
fs.writeFileSync(
  path.join(OUT, "robots.txt"),
  `User-agent: *\nAllow: /\n\n` +
    `Sitemap: ${SITE_ORIGIN}/sitemap.xml\n` +
    `Sitemap: ${SITE_ORIGIN}/${INFO_SUBDIR}/sitemap-index.xml\n`,
  "utf8",
);

// ── Report ──────────────────────────────────────────────────────────────────
const kb = (n) => `${(n / 1024).toFixed(1).padStart(8)} KB`;
let total = 0;
const lines = [];
const walk = (dir, prefix = "") => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      lines.push(`           ${prefix}${e.name}/`);
      walk(full, `${prefix}  `);
    } else {
      const { size } = fs.statSync(full);
      total += size;
      lines.push(`${kb(size)}  ${prefix}${e.name}`);
    }
  }
};
walk(OUT);

step(`Site assembled at ${OUT}`);
console.log(lines.join("\n"));
console.log(`${"-".repeat(40)}\n${kb(total)}  total\n`);
console.log(`Preview it:  npm run site:serve`);
console.log(`Ship it:     npm run deploy\n`);
