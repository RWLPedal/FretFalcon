// tests/unit/build/assemble.test.ts
// The HTML assembly shared by both build targets (build/assemble.js). These run
// against the real index.html and style/ tree, so they also fail when a tag the
// assembler depends on is edited out from under it.
import { describe, expect, it } from "vitest";
// A plain CommonJS build script with no type declarations: imported as `any`.
import * as assemble from "../../../build/assemble.js";

const {
  MARKERS,
  HASHED_ASSET,
  TOUCH_ICON,
  bundleCss,
  contentHash,
  findLocalRefs,
  readManifest,
  readTemplate,
  renderHosted,
  renderManifest,
  renderServiceWorker,
  renderSingle,
} = assemble;

const JS = 'console.log("app");';
const CSS = "body{margin:0}";

describe("renderSingle", () => {
  it("leaves no tag that loads a separate file", () => {
    const html = renderSingle({ js: JS, css: CSS, build: "test" });
    expect(findLocalRefs(html)).toEqual([]);
    expect(html).toContain(JS);
    expect(html).toContain(CSS);
    expect(html).toContain('href="data:image/svg+xml,');
  });

  it("inlines `$` sequences literally", () => {
    // String.replace would expand these in a replacement *string*.
    const js = "const a = '$&', b = \"$'\", c = '$$', d = `$1`;";
    expect(renderSingle({ js, css: CSS, build: "test" })).toContain(js);
  });

  it("keeps a </script> inside the bundle from closing the inline script", () => {
    const html = renderSingle({ js: 'const s = "</script><b>";', css: CSS, build: "test" });
    expect(html).toContain('const s = "<\\/script><b>";');
    // The JSON-LD block and the bundle: exactly the two scripts index.html declares.
    expect(html.match(/<\/script>/g)).toHaveLength(2);
  });

  it("stamps the build into the page", () => {
    const html = renderSingle({ js: JS, css: CSS, build: "single 2026-01-01 abc1234" });
    expect(html).toContain('<meta name="ff-build" content="single 2026-01-01 abc1234">');
  });

  it("offers nothing to install: a file on disk cannot be", () => {
    const html = renderSingle({ js: JS, css: CSS, build: "test" });
    expect(html).not.toContain('rel="manifest"');
    expect(html).not.toContain('rel="apple-touch-icon"');
  });
});

describe("renderHosted", () => {
  const assets = {
    scripts: ["assets/reference_bundle.0123456789.js"],
    stylesheet: "assets/style.abcdef0123.css",
    favicon: "assets/favicon.fedcba9876.svg",
    manifest: "assets/manifest.0a1b2c3d4e.webmanifest",
    touchIcon: "assets/apple-touch-icon.9f8e7d6c5b.png",
  };

  it("loads exactly the files it was given", () => {
    const html = renderHosted({ ...assets, build: "test" });
    expect(findLocalRefs(html).sort()).toEqual(
      [assets.favicon, assets.manifest, assets.touchIcon, assets.stylesheet, ...assets.scripts].sort(),
    );
  });

  it("links the manifest and the home-screen icon it was given", () => {
    const html = renderHosted({ ...assets, build: "test" });
    expect(html).toContain(`<link rel="manifest" href="${assets.manifest}">`);
    expect(html).toContain(`<link rel="apple-touch-icon" href="${assets.touchIcon}">`);
  });

  it("keeps every script deferred, in order", () => {
    const scripts = ["assets/runtime.0000000000.js", "assets/reference_bundle.1111111111.js"];
    const html = renderHosted({ ...assets, scripts, build: "test" });
    const tags = scripts.map((src) => `<script src="${src}" defer></script>`);
    expect(html.indexOf(tags[0])).toBeGreaterThan(-1);
    expect(html.indexOf(tags[1])).toBeGreaterThan(html.indexOf(tags[0]));
  });
});

describe("template markers", () => {
  it("are all present in index.html", () => {
    const template = readTemplate();
    for (const marker of Object.values(MARKERS)) expect(template).toContain(marker);
  });

  it.each(Object.entries(MARKERS))("a missing %s tag fails the build", (_name, marker) => {
    const template = readTemplate().replace(marker as string, "");
    expect(() => renderSingle({ js: JS, css: CSS, template, build: "test" })).toThrow(/expected tag/);
    expect(() =>
      renderHosted({
        scripts: ["a.js"],
        stylesheet: "a.css",
        favicon: "a.svg",
        manifest: "a.webmanifest",
        touchIcon: "a.png",
        template,
        build: "test",
      }),
    ).toThrow(/expected tag/);
  });
});

describe("renderManifest", () => {
  const source = readManifest();
  const icons = Object.fromEntries(
    source.icons.map((icon: { src: string }, i: number) => [icon.src, `icon-${i}.0123456789.png`]),
  );

  it("describes the app one level up from assets/, where the manifest is served", () => {
    const manifest = JSON.parse(renderManifest({ icons }));
    expect(manifest.start_url).toBe("../");
    expect(manifest.scope).toBe("../");
    expect(manifest.display).toBe("standalone");
    expect(manifest.name).toBe(source.name);
  });

  it("points every icon at its built file, keeping its size and purpose", () => {
    const manifest = JSON.parse(renderManifest({ icons }));
    expect(manifest.icons).toHaveLength(source.icons.length);
    manifest.icons.forEach((icon: { src: string; sizes: string; purpose: string }, i: number) => {
      expect(icon.src).toBe(`icon-${i}.0123456789.png`);
      expect(icon.sizes).toBe(source.icons[i].sizes);
      expect(icon.purpose).toBe(source.icons[i].purpose);
    });
  });

  it("fails the build when an icon was not built", () => {
    expect(() => renderManifest({ icons: {} })).toThrow(/no built file/);
  });
});

describe("the source manifest", () => {
  const manifest = readManifest();

  it("has what a browser needs before it offers to install", () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    expect(manifest.display).toBe("standalone");
    const sizes = manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes} ${i.purpose}`);
    expect(sizes).toEqual(expect.arrayContaining(["192x192 any", "512x512 any", "512x512 maskable"]));
  });

  it("names icons that exist (build/make_icons.mjs draws them)", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    for (const src of [...manifest.icons.map((i: { src: string }) => i.src), TOUCH_ICON]) {
      expect(fs.existsSync(path.join(assemble.ROOT, src)), `${src} is missing`).toBe(true);
    }
  });

  it("matches the page's own colour", () => {
    const tint = readTemplate().match(/<meta name="theme-color" content="([^"]+)">/)?.[1];
    expect(manifest.theme_color).toBe(tint);
    expect(manifest.background_color).toBe(tint);
  });
});

describe("renderServiceWorker", () => {
  const assets = ["assets/style.abcdef0123.css", "assets/reference_bundle.0123456789.js"];

  it("fills in the file list and leaves no placeholder behind", () => {
    const sw = renderServiceWorker({ assets });
    for (const asset of assets) expect(sw).toContain(JSON.stringify(asset));
    expect(sw).not.toContain("__ASSETS__");
    expect(sw).not.toContain("__VERSION__");
    // Still a script that parses.
    expect(() => new Function(sw)).not.toThrow();
  });

  it("changes when the files do, and only then", () => {
    const again = renderServiceWorker({ assets: [...assets].reverse() });
    expect(again).toBe(renderServiceWorker({ assets }));
    const next = renderServiceWorker({ assets: [assets[0], "assets/reference_bundle.9999999999.js"] });
    expect(next).not.toBe(again);
    const version = (sw: string) => sw.match(/const VERSION = "([0-9a-f]+)"/)?.[1];
    expect(version(next)).toBeTruthy();
    expect(version(next)).not.toBe(version(again));
  });
});

describe("bundleCss", () => {
  it("resolves every @import into one stylesheet", () => {
    const css = bundleCss();
    expect(css).not.toMatch(/@import/);
    // One rule from the first file loaded and one from the last.
    expect(css).toContain("[data-theme=");
    expect(css).toContain(".onb-");
  });

  it("minifies without changing what is bundled", () => {
    const plain = bundleCss();
    const minified = bundleCss({ minify: true });
    expect(minified.length).toBeLessThan(plain.length);
    expect(minified).not.toMatch(/@import/);
  });

  it("is deterministic, so the content hash only moves when the CSS does", () => {
    expect(contentHash(bundleCss({ minify: true }))).toBe(contentHash(bundleCss({ minify: true })));
    expect(contentHash("a")).not.toBe(contentHash("b"));
  });
});

describe("HASHED_ASSET", () => {
  it("accepts only content-hashed files under assets/", () => {
    expect(HASHED_ASSET.test(`assets/style.${contentHash("x")}.css`)).toBe(true);
    expect(HASHED_ASSET.test("assets/style.css")).toBe(false);
    expect(HASHED_ASSET.test("style/style.css")).toBe(false);
    expect(HASHED_ASSET.test("./js/reference_bundle.js")).toBe(false);
  });
});

describe("findLocalRefs", () => {
  it("ignores absolute URLs, data URIs and markup inside inline scripts", () => {
    const html = [
      '<link rel="canonical" href="https://fretfalcon.com/">',
      '<link rel="icon" href="data:image/svg+xml,x">',
      '<script>const a = \'<img src="local.png">\';</script>',
      '<link rel="stylesheet" href="style/style.css">',
    ].join("\n");
    expect(findLocalRefs(html)).toEqual(["style/style.css"]);
  });
});
