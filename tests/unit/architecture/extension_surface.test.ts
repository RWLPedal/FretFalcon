import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as glob from 'glob';

// Paths that module files must NOT import from — these are internal implementation details.
const FORBIDDEN_PATTERNS = [
  /panels\/panel_manager/,
  /panels\/link_manager/,
  /panels\/panel_registry/,
  /panels\/panel_types/,
  /reference_page\//,
  /mobile\//,
  /screen_config\//,
  /onboarding\//,
];

// Modules that are allowed to import ConfigurableFeatureView directly.
// All other feature-panel modules must use featurePanelModule() from module_types.ts instead.
const CONFIGURABLE_FEATURE_ALLOWED = new Set([
  'feature_panel',
]);

// A module must be self-contained: its view implementation lives inside its own
// folder (ts/modules/<name>/), not pointed at from ts/views/ or ts/fretboard/views/.
// This allowlist covers modules not yet co-located (Phase 4.5) plus the privileged
// modules (any_view, feature_panel). It may only SHRINK — never add a new module here.
const EXTERNAL_VIEW_ALLOWED = new Set([
  'timer',
  'drone',
  'capo',
  'global_key',
  'circle_of_fifths',
  'metronome',
  'strum',
  'backing_track',
  // privileged:
  'any_view',
  'feature_panel',
]);

function getModuleFiles(): string[] {
  const root = path.resolve(__dirname, '../../../ts/modules');
  return glob.sync('*/module.ts', { cwd: root }).map(f => path.join(root, f));
}

function extractImports(source: string): string[] {
  const importRe = /^import\s+.*?\s+from\s+['"]([^'"]+)['"]/gm;
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(source)) !== null) {
    matches.push(m[1]);
  }
  return matches;
}

describe('Extension surface architecture', () => {
  const moduleFiles = getModuleFiles();

  it('discovers at least one module file', () => {
    expect(moduleFiles.length).toBeGreaterThan(0);
  });

  for (const filePath of moduleFiles) {
    const moduleName = path.basename(path.dirname(filePath));
    const canImportConfigurableFeature = CONFIGURABLE_FEATURE_ALLOWED.has(moduleName);

    it(`${moduleName}/module.ts only imports from the allowed extension surface`, () => {
      const source = fs.readFileSync(filePath, 'utf-8');
      const imports = extractImports(source);

      for (const imp of imports) {
        for (const forbidden of FORBIDDEN_PATTERNS) {
          expect(
            forbidden.test(imp),
            `${moduleName}/module.ts imports from forbidden path: ${imp}`,
          ).toBe(false);
        }

        // Feature-panel modules must use featurePanelModule(), not ConfigurableFeatureView directly.
        if (!canImportConfigurableFeature && /configurable_feature_view/.test(imp)) {
          expect.fail(
            `${moduleName}/module.ts imports ConfigurableFeatureView directly. ` +
            `Use featurePanelModule() from module_types.ts instead.`,
          );
        }

        // Modules must own their view implementation (co-located in the module folder).
        if (!EXTERNAL_VIEW_ALLOWED.has(moduleName) && /\/views\//.test(imp)) {
          expect.fail(
            `${moduleName}/module.ts imports a view from outside its folder: ${imp}. ` +
            `Move the view implementation into ts/modules/${moduleName}/.`,
          );
        }
      }
    });

    it(`${moduleName}/module.ts has a default export`, () => {
      const source = fs.readFileSync(filePath, 'utf-8');
      expect(source).toMatch(/export default /);
    });
  }
});
