import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as glob from 'glob';

// All TypeScript files outside ts/schedule/ must NOT import from ts/schedule/ internals.
// The only permitted cross-boundary import is `ts/schedule/api.ts`.
//
// Transition shims: files that ARE re-export bridges into ts/schedule/ are exempt.
// Remove a file from this set once the shim is deleted.
const SHIM_FILES = new Set([
  'display_controller.ts',
  'fretboard/fretboard_interval_settings.ts',
  'views/schedule_floating_view.ts',
  'views/schedule_playback_view.ts',
]);

const TS_ROOT = path.resolve(__dirname, '../../../ts');

function getAllTsFiles(dir: string): string[] {
  return glob.sync('**/*.ts', { cwd: dir }).map(f => path.join(dir, f));
}

function extractImports(source: string): string[] {
  const importRe = /^(?:import|export)\s+.*?\s+from\s+['"]([^'"]+)['"]/gm;
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(source)) !== null) {
    matches.push(m[1]);
  }
  return matches;
}

/** Resolve a relative import specifier to an absolute path (no extension needed). */
function resolveImport(importer: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null; // not a relative import
  return path.resolve(path.dirname(importer), specifier);
}

describe('Schedule quarantine', () => {
  const scheduleDir = path.join(TS_ROOT, 'schedule');
  const scheduleApiPath = path.join(scheduleDir, 'api');

  // Collect all .ts files that are OUTSIDE ts/schedule/
  const outsideFiles = getAllTsFiles(TS_ROOT).filter(
    f => !f.startsWith(scheduleDir + path.sep)
  );

  it('finds TypeScript files outside ts/schedule/', () => {
    expect(outsideFiles.length).toBeGreaterThan(0);
  });

  for (const filePath of outsideFiles) {
    const relPath = path.relative(TS_ROOT, filePath).replace(/\\/g, '/');

    // Shim files are intentional re-export bridges — skip quarantine check for them.
    if (SHIM_FILES.has(relPath)) continue;

    it(`${relPath} does not import ts/schedule internals directly`, () => {
      const source = fs.readFileSync(filePath, 'utf-8');
      const imports = extractImports(source);

      for (const imp of imports) {
        const resolved = resolveImport(filePath, imp);
        if (!resolved) continue;

        // Does this import resolve into ts/schedule/?
        if (resolved.startsWith(scheduleDir + path.sep) || resolved === scheduleDir) {
          // Only ts/schedule/api is permitted
          const isApi = resolved === scheduleApiPath || resolved.startsWith(scheduleApiPath + '.');
          expect(
            isApi,
            `${relPath} imports from ts/schedule internals: "${imp}". ` +
            `Only ts/schedule/api is allowed outside the quarantine boundary.`,
          ).toBe(true);
        }
      }
    });
  }
});
