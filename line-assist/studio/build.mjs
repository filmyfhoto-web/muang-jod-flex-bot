// Builds the Reply Studio page: one HTML file with the bot's own code (so the page behaves exactly like the bot),
// the screen, and the styles all inline. Pictures go next to it in dist/img/.
//
//   npm i --no-save esbuild      (once)
//   node studio/build.mjs
//
// Output: studio/dist/studio.html and studio/dist/img/*.png
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(process.env.ESBUILD_FROM ? join(process.env.ESBUILD_FROM, '/') : join(here, '/'));
const esbuild = require('esbuild');

const src = join(here, 'src');
const dist = join(here, 'dist');
mkdirSync(join(dist, 'img'), { recursive: true });

// the bot's code, as one script that defines `Engine`
const bundle = await esbuild.build({
  entryPoints: [join(src, 'entry.js')],
  bundle: true,
  format: 'iife',
  globalName: 'Engine',
  write: false,
  target: 'es2020',
  legalComments: 'none',
  charset: 'utf8',
});
const engine = bundle.outputFiles[0].text;

// the screen: every file of src/ui in order, as one plain script
const ui = readdirSync(join(src, 'ui'))
  .filter((f) => f.endsWith('.js'))
  .sort()
  .map((f) => `// ---- ${f}\n` + readFileSync(join(src, 'ui', f), 'utf8'))
  .join('\n');

const css = readFileSync(join(src, 'studio.css'), 'utf8');
const safe = (s) => s.replace(/<\/script/gi, '<\\/script'); // nothing may close the script early
const html = readFileSync(join(src, 'template.html'), 'utf8')
  .replace('/*__CSS__*/', () => css)
  .replace('/*__ENGINE__*/', () => safe(engine))
  .replace('/*__UI__*/', () => safe(ui));
writeFileSync(join(dist, 'studio.html'), html);

for (const f of readdirSync(join(here, '..', 'assets')).filter((f) => f.endsWith('.png'))) copyFileSync(join(here, '..', 'assets', f), join(dist, 'img', f));
console.log(`studio.html ${(html.length / 1024).toFixed(0)} KB (engine ${(engine.length / 1024).toFixed(0)} KB, screen ${(ui.length / 1024).toFixed(0)} KB)`);
