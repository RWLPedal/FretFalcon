// tests/unit/helpers/module_files.ts
// File-enumeration helpers for the architecture and sizing tests.
//
// These replace the previous `import * as glob from 'glob'` usage: glob was never
// declared in package.json (it resolved through netlify-cli's transitive tree), so
// a dependency prune would have silently broken the architecture suite. Everything
// here is plain node:fs.
//
// All functions return ABSOLUTE paths and throw if a directory is missing or
// suspiciously empty — an enumeration that returns [] would make every for-loop
// generated test vacuously pass.

import * as fs from 'fs';
import * as path from 'path';

/** Absolute path of the ts/ source root. */
export const TS_ROOT = path.resolve(__dirname, '../../../ts');

/** Every ts/modules/<name>/module.ts, absolute paths, sorted. */
export function listModuleFiles(): string[] {
  const root = path.join(TS_ROOT, 'modules');
  const files = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(root, e.name, 'module.ts'))
    .filter((p) => fs.existsSync(p))
    .sort();
  if (files.length < 20) {
    throw new Error(
      `listModuleFiles found only ${files.length} module.ts files under ${root} — ` +
        `expected 20+. Path broken or modules moved?`,
    );
  }
  return files;
}

/** Every ts/fretboard/features/*_feature.ts, absolute paths, sorted. */
export function listFeatureFiles(): string[] {
  const root = path.join(TS_ROOT, 'fretboard', 'features');
  const files = fs
    .readdirSync(root)
    .filter((f) => f.endsWith('_feature.ts'))
    .map((f) => path.join(root, f))
    .sort();
  if (files.length < 10) {
    throw new Error(
      `listFeatureFiles found only ${files.length} *_feature.ts files under ${root} — ` +
        `expected 10+. Path broken or features moved?`,
    );
  }
  return files;
}

/** All .ts files under root (recursive), absolute paths, sorted. */
export function walkTsFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.endsWith('.ts')) out.push(full);
    }
  };
  walk(root);
  if (out.length === 0) {
    throw new Error(`walkTsFiles found no .ts files under ${root}`);
  }
  return out.sort();
}
