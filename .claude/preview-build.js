// Local preview bundler (not committed tooling). esbuild can't handle webpack's
// require.context, so this plugin statically replaces the two files that use it:
//   • ts/modules/manifest.ts        → list of every ts/modules/*/module.ts default export
//   • ts/fretboard/features/feature_manifest.ts → FEATURE_DESCRIPTORS / FEATURE_SPECS
//     duck-typed from every features/*_feature.ts (mirrors the runtime file's logic).
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const modulesDir = path.resolve(__dirname, '../ts/modules');
const moduleDirs = fs
  .readdirSync(modulesDir)
  .filter((d) => fs.existsSync(path.join(modulesDir, d, 'module.ts')));

const featuresDir = path.resolve(__dirname, '../ts/fretboard/features');
const featureFiles = fs
  .readdirSync(featuresDir)
  .filter((f) => /_feature\.ts$/.test(f));

const manifestPlugin = {
  name: 'static-manifest',
  setup(build) {
    build.onLoad({ filter: /modules[\\/]manifest\.ts$/ }, () => {
      const imports = moduleDirs.map((d, i) => `import m${i} from './${d}/module';`).join('\n');
      const arr = moduleDirs.map((_, i) => `m${i}`).join(', ');
      const contents = `import { ViewModule } from './module_types';\n${imports}\nexport const VIEW_MODULES: ViewModule[] = [${arr}];\n`;
      return { contents, loader: 'ts', resolveDir: modulesDir };
    });

    build.onLoad({ filter: /features[\\/]feature_manifest\.ts$/ }, () => {
      const imports = featureFiles
        .map((f, i) => `import * as f${i} from './${f.replace(/\.ts$/, '')}';`)
        .join('\n');
      const arr = featureFiles.map((_, i) => `f${i}`).join(', ');
      const contents = `
${imports}
const mods = [${arr}];
const isDescriptor = (v) => typeof v?.typeName === 'string' && typeof v?.createFeature === 'function';
const isSpec = (v) => typeof v?.id === 'string' && !!v?.configSpec && typeof v?.create === 'function';
export const FEATURE_DESCRIPTORS = [];
export const FEATURE_SPECS = [];
for (const m of mods) for (const e of Object.values(m)) {
  if (isDescriptor(e)) FEATURE_DESCRIPTORS.push(e);
  if (isSpec(e)) FEATURE_SPECS.push(e);
}
`;
      return { contents, loader: 'ts', resolveDir: featuresDir };
    });
  },
};

esbuild
  .build({
    entryPoints: [path.resolve(__dirname, '../ts/reference_page/reference_main.ts')],
    bundle: true,
    outfile: path.resolve(__dirname, '../js/reference_bundle.js'),
    format: 'iife',
    plugins: [manifestPlugin],
    logLevel: 'info',
  })
  .then(() => console.log('preview bundle built'))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
