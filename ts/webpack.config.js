const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ENTRY = 'reference_bundle';

// Two build targets share this config:
//   single — everything inlined into one downloadable dist/index.html
//   hosted — dist-hosted/, content-hashed files that can be cached forever
// Production builds of either are driven by ../build_html.js, which assembles the
// HTML around what webpack emits. In development the bundle is the same for both —
// unhashed and served from memory — and the target only decides what `/` returns.
module.exports = (env = {}, argv = {}) => {
  const target = env.target === 'single' ? 'single' : 'hosted';
  const prod = argv.mode === 'production';

  const output = !prod
    ? {
        filename: '[name].js', // The output bundle file
        path: path.join(ROOT, 'js'), // Output directory (same as your tsconfig)
        publicPath: '/js/',
      }
    : target === 'single'
      ? {
          // Intermediate only: build_html.js inlines this into dist/index.html.
          filename: '[name].js',
          path: path.join(ROOT, '.build/single'),
          publicPath: '',
        }
      : {
          // The hash is of the file's final contents, so a filename only changes
          // when its bytes do. That is what lets deploy/_headers mark assets/ as
          // immutable. The length must match HASH_LENGTH in build/assemble.js.
          filename: 'assets/[name].[contenthash:10].js',
          chunkFilename: 'assets/[name].[contenthash:10].js',
          path: path.join(ROOT, 'dist-hosted'),
          publicPath: 'auto',
        };

  return {
    context: __dirname,
    entry: {
      [ENTRY]: './reference_page/reference_main.ts',
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: 'ts-loader', // Use ts-loader to compile TypeScript
          exclude: /node_modules/,
        },
      ],
    },
    resolve: {
      extensions: ['.ts', '.js'],
    },
    output,
    mode: prod ? 'production' : 'development',
    // Hosted ships its source map as a separate file, fetched only when DevTools is
    // open. The single file ships none — a map would have to be inlined into it.
    devtool: prod ? (target === 'hosted' ? 'source-map' : false) : 'eval',
    optimization: prod ? { moduleIds: 'deterministic', realContentHash: true } : {},
    performance: { hints: false },
    devServer: {
      static: {
        directory: ROOT, //  Serve content from the root
      },
      compress: true,
      // Part of the F:\Programming local-dev port scheme: 5200 + 10 * alphabetical
      // index across all web projects (see PROJECTS.md). FretFalcon owns 5290-5299;
      // the two dev modes get their own ports so they can run side by side.
      port: target === 'single' ? 5293 : 5290,
      // An inlined bundle can't be hot-patched; the single target reloads the page.
      hot: target !== 'single', //  Enable Hot Module Replacement (HMR)
      setupMiddlewares: (middlewares, devServer) => {
        if (target === 'single') middlewares.unshift(singleFileIndex(devServer, output.path));
        return middlewares;
      },
    },
  };
};

// `npm run dev:single`: answer `/` with the single-file page, assembled on each
// request from the in-memory bundle by the same code the production build uses.
// Nothing is cached, so an edit to index.html or the CSS shows up on the next load.
function singleFileIndex(devServer, outputPath) {
  const { bundleCss, renderSingle } = require('../build/assemble');
  return {
    name: 'single-file-index',
    middleware: (req, res, next) => {
      const url = (req.url || '').split('?')[0];
      if (req.method !== 'GET' || (url !== '/' && url !== '/index.html')) return next();
      devServer.middleware.waitUntilValid(() => {
        devServer.compiler.outputFileSystem.readFile(
          path.join(outputPath, `${ENTRY}.js`),
          'utf8',
          (err, js) => {
            if (err) return next(err);
            try {
              const html = renderSingle({ js, css: bundleCss(), build: 'single dev' });
              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              res.setHeader('Cache-Control', 'no-store');
              res.end(html);
            } catch (e) {
              next(e);
            }
          }
        );
      });
    },
  };
}
