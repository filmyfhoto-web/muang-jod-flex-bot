// src/assist/ is a copy of ../line-assist/src (the Render service may deploy only this folder). Fails when they differ:
//   node scripts/vendor-assist.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('../../line-assist/src/', import.meta.url));
const copy = fileURLToPath(new URL('../src/assist/', import.meta.url));

test('src/assist is identical to line-assist/src', { skip: !existsSync(src) && 'line-assist/src is not next to this folder' }, () => {
  const files = readdirSync(src).filter((f) => f.endsWith('.js'));
  assert.deepEqual(readdirSync(copy).filter((f) => f.endsWith('.js')).sort(), files.sort(), 'same list of files');
  for (const f of files) assert.equal(readFileSync(copy + f, 'utf8'), readFileSync(src + f, 'utf8'), f + ' differs — run: node scripts/vendor-assist.mjs');
});
