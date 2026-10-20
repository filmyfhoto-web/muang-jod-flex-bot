// Copies the answering engine from ../line-assist/src into src/assist/ (the Render service may only deploy this folder,
// so it carries its own copy). tests/assist-sync.test.js fails when the copy has drifted from the source.
//   node scripts/vendor-assist.mjs
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const from = fileURLToPath(new URL('../../line-assist/src/', import.meta.url));
const to = fileURLToPath(new URL('../src/assist/', import.meta.url));
mkdirSync(to, { recursive: true });
const files = readdirSync(from).filter((f) => f.endsWith('.js'));
for (const f of files) copyFileSync(from + f, to + f);
console.log(`copied ${files.length} files to src/assist/`);
