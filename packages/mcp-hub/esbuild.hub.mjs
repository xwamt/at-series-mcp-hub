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
  sourcemap: true,
  define: {
    __HUB_VERSION__: JSON.stringify(pkg.version)
  },
  external: []
});

console.log(`Bundled hub.js (${pkg.version}) -> dist/hub.js`);
