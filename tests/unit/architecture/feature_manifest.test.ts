import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { listFeatureFiles } from '../helpers/module_files';

// Fretboard features are auto-discovered from ts/fretboard/features/*_feature.ts by
// feature_manifest.ts (webpack require.context) — there is no hand-maintained list in
// fretboard_category.ts anymore. This test (source-as-text, never importing the
// require.context manifest) guards that contract: every feature is a discoverable
// descriptor, migrated features expose a FeatureSpec, and the old dual list stays gone.

const TS_ROOT = path.resolve(__dirname, '../../../ts');
const FEATURES = path.join(TS_ROOT, 'fretboard/features');
const read = (p: string) => fs.readFileSync(p, 'utf-8');

// Features not yet migrated to a typed FeatureSpec. Legacy-only descriptors. This set
// may only SHRINK — migrate a feature and remove it here; never add a new feature to it.
const LEGACY_NO_SPEC = new Set(['metronome_feature.ts']);

function featureFiles(): string[] {
  return listFeatureFiles().map((p) => path.basename(p));
}

describe('fretboard feature manifest', () => {
  const files = featureFiles();

  it('discovers the feature files', () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  for (const file of files) {
    it(`${file} exports a discoverable Feature descriptor (static typeName)`, () => {
      const src = read(path.join(FEATURES, file));
      // The manifest duck-types the descriptor by static typeName + createFeature.
      expect(src, `${file} has no exported class with a static typeName`).toMatch(
        /export\s+class\s+\w+[\s\S]*?static\s+(?:readonly\s+)?typeName\s*=/,
      );
    });

    if (!LEGACY_NO_SPEC.has(file)) {
      it(`${file} exports a typed FeatureSpec`, () => {
        const src = read(path.join(FEATURES, file));
        expect(src, `${file} is not in LEGACY_NO_SPEC but exports no *FeatureSpec`).toMatch(
          /export\s+const\s+\w*FeatureSpec\b/,
        );
      });
    }
  }

  it('fretboard_category.ts derives both registries from the manifest (no hand-synced list)', () => {
    const src = read(path.join(TS_ROOT, 'fretboard/fretboard_category.ts'));
    expect(src).toMatch(/FEATURE_DESCRIPTORS/);
    expect(src).toMatch(/FEATURE_SPECS/);
    // The old hand-maintained Map literal and per-feature registerFeatureSpec() calls
    // must not creep back in.
    expect(
      /new Map<string, FeatureTypeDescriptor>\(\s*\[/.test(src),
      'fretboard_category.ts still hand-lists features in a Map literal — derive from FEATURE_DESCRIPTORS instead',
    ).toBe(false);
    expect(
      /registerFeatureSpec\(\w+FeatureSpec/.test(src),
      'fretboard_category.ts still hand-registers named FeatureSpecs — use FEATURE_SPECS.forEach instead',
    ).toBe(false);
  });

  it('LEGACY_NO_SPEC only lists files that really lack a FeatureSpec', () => {
    for (const file of LEGACY_NO_SPEC) {
      const src = read(path.join(FEATURES, file));
      expect(
        /export\s+const\s+\w*FeatureSpec\b/.test(src),
        `${file} now exports a FeatureSpec — remove it from LEGACY_NO_SPEC`,
      ).toBe(false);
    }
  });
});
