import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { listModuleFiles, listFeatureFiles, walkTsFiles } from '../helpers/module_files';

// View IDs are minted module-locally (viewId("...")) with no central enum, and
// referenced as raw strings from bundled layouts (default_configs.ts) and the
// onboarding tour. A typo or rename in those references only surfaces at runtime
// (parseViewId warns and skips). This test parses source as text — never importing
// the require.context manifest — and fails the build on any dangling reference.

const TS_ROOT = path.resolve(__dirname, '../../../ts');
const read = (p: string) => fs.readFileSync(p, 'utf-8');

function collectAll(re: RegExp, source: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) out.push(m[1]);
  return out;
}

// ── Declared IDs ────────────────────────────────────────────────────────────
/** Every viewId("...") minted in a module + the CORE_VIEW_IDS values. */
function declaredViewIds(): Set<string> {
  const ids = new Set<string>();
  for (const f of listModuleFiles()) {
    for (const id of collectAll(/viewId\(\s*["']([^"']+)["']\s*\)/g, read(f))) {
      ids.add(id);
    }
  }
  for (const v of Object.values(coreViewIds())) ids.add(v);
  return ids;
}

/** Parse the CORE_VIEW_IDS object literal from ids.ts as { KEY: idValue }. */
function coreViewIds(): Record<string, string> {
  const src = read(path.join(TS_ROOT, 'core/ids.ts'));
  const block = src.match(/export const CORE_VIEW_IDS\s*=\s*\{([\s\S]*?)\}\s*as const;/);
  if (!block) throw new Error('Could not locate CORE_VIEW_IDS in core/ids.ts');
  const out: Record<string, string> = {};
  for (const m of block[1].matchAll(/(\w+)\s*:\s*viewId\(\s*["']([^"']+)["']\s*\)/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

/** Every static typeName in a fretboard feature file. */
function declaredFeatureTypeNames(): Set<string> {
  const names = new Set<string>();
  for (const f of listFeatureFiles()) {
    for (const n of collectAll(/static\s+(?:readonly\s+)?typeName\s*=\s*["']([^"']+)["']/g, read(f))) {
      names.add(n);
    }
  }
  return names;
}

describe('view-ID reference integrity', () => {
  it('sanity: discovers declared IDs', () => {
    expect(declaredViewIds().size).toBeGreaterThan(10);
    expect(declaredFeatureTypeNames().size).toBeGreaterThan(5);
    expect(Object.keys(coreViewIds()).length).toBeGreaterThan(0);
  });

  it('every viewId referenced in default_configs.ts is declared by a module', () => {
    const declared = declaredViewIds();
    const src = read(path.join(TS_ROOT, 'screen_config/default_configs.ts'));
    const referenced = collectAll(/viewId:\s*["']([^"']+)["']/g, src);
    expect(referenced.length).toBeGreaterThan(0);
    for (const id of referenced) {
      expect(declared.has(id), `default_configs.ts references undeclared viewId "${id}"`).toBe(true);
    }
  });

  it('every viewId spawned by the onboarding tour is declared by a module', () => {
    const declared = declaredViewIds();
    const src = read(path.join(TS_ROOT, 'onboarding/onboarding_tour.ts'));
    for (const id of collectAll(/spawnView\(\s*["']([^"']+)["']/g, src)) {
      expect(declared.has(id), `onboarding_tour.ts spawns undeclared viewId "${id}"`).toBe(true);
    }
  });

  it('every featureTypeName referenced in default_configs.ts is declared by a feature', () => {
    const declared = declaredFeatureTypeNames();
    const src = read(path.join(TS_ROOT, 'screen_config/default_configs.ts'));
    // Skip the "driven" sentinel (a config placeholder, not a feature name).
    const referenced = collectAll(/featureTypeName:\s*["']([^"']+)["']/g, src);
    expect(referenced.length).toBeGreaterThan(0);
    for (const name of referenced) {
      expect(declared.has(name), `default_configs.ts references undeclared featureTypeName "${name}"`).toBe(true);
    }
  });

  it('every CORE_VIEW_IDS entry is referenced by core machinery outside ids.ts', () => {
    // A well-known ID only earns its place in the central list if something references
    // it. An unused entry is dead coupling (this is what caught the stale GlobalKey).
    const keys = Object.keys(coreViewIds());
    const idsFile = path.join(TS_ROOT, 'core', 'ids.ts');
    const sources = walkTsFiles(TS_ROOT)
      .filter((f) => f !== idsFile)
      .map((f) => read(f))
      .join('\n');
    for (const key of keys) {
      expect(
        sources.includes(`CORE_VIEW_IDS.${key}`),
        `CORE_VIEW_IDS.${key} is declared but never referenced — remove it from core/ids.ts`,
      ).toBe(true);
    }
  });
});
