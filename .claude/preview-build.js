// Local preview bundler (not committed tooling). esbuild can't handle webpack's
// require.context in ts/modules/manifest.ts, so this plugin replaces that file with a
// statically-imported list of every ts/modules/*/module.ts default export.
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const modulesDir = path.resolve(__dirname, '../ts/modules');
const moduleDirs = fs
  .readdirSync(modulesDir)
  .filter((d) => fs.existsSync(path.join(modulesDir, d, 'module.ts')));

const manifestPlugin = {
  name: 'static-manifest',
  setup(build) {
    build.onLoad({ filter: /modules[\\/]manifest\.ts$/ }, () => {
      const imports = moduleDirs.map((d, i) => `import m${i} from './${d}/module';`).join('\n');
      const arr = moduleDirs.map((_, i) => `m${i}`).join(', ');
      const contents = `import { ViewModule } from './module_types';\n${imports}\nexport const VIEW_MODULES: ViewModule[] = [${arr}];\n`;
      return { contents, loader: 'ts', resolveDir: modulesDir };
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
