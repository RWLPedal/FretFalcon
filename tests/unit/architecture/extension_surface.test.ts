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
      }
    });

    it(`${moduleName}/module.ts has a default export`, () => {
      const source = fs.readFileSync(filePath, 'utf-8');
      expect(source).toMatch(/export default /);
    });
  }
});
