import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')
);

await esbuild.build({
  entryPoints: [path.join(__dirname, 'src/hub/main.ts')],
  outfile: path.join(__dirname, 'dist/hub.js'),
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  // This bundle is copied verbatim into every AT Series VSIX, so its size is
  // paid three times over. `keepNames` costs a little of that back but keeps
  // stderr stack traces readable, which is the only diagnostic channel the
  // hub has once it is running under an IDE.
  minify: true,
  keepNames: true,
  // No sourcemap: nothing consumes it. `copy-hub.mjs` ships only hub.js, so a
  // map would bloat the npm tarball by ~1.4 MB and reach no debugger.
  sourcemap: false,
  define: {
    __HUB_VERSION__: JSON.stringify(pkg.version)
  },
  external: []
});

console.log(`Bundled hub.js (${pkg.version}) -> dist/hub.js`);
