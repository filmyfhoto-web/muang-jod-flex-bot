import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { jobPreviewMessage } from '../src/flex/jobCard.js';

const js = readFileSync(new URL('../public/liff/jot/script.js', import.meta.url), 'utf8');

const DRAFT = {
  job_name: 'งานป้าย',
  customer_name: 'ผอ กิ้ก โรงเรียนบ้านนาบง',
  job_date: '2026-09-11',
  payment_status: 'pending',
  total: 3752.44,
  items: [{ item_name: 'ไวนิลพระเทพ', size: '150 × 300 ซม.', quantity: 1, unit_price: 742.5, total: 742.5 }],
};

test('✏️ on the preview opens the form holding the draft, not a blank one', () => {
  // Before this it threw the draft away and asked for the whole note again,
  // which on a seven-line school order is a punishing answer to "line four is
  // wrong".
  const withLiff = jobPreviewMessage(DRAFT, 'x', { editDraftUrl: 'https://liff.line.me/1-a/jot?quick=1&draft=1' });
  const json = JSON.stringify(withLiff);
  assert.ok(json.includes('"uri":"https://liff.line.me/1-a/jot?quick=1&draft=1"'), 'แก้ไข is not a link to the form');
  assert.ok(json.includes('action=confirm_add_job'), 'saving from the chat still has to work');
  assert.ok(json.includes('action=cancel_new_job'));

  // No LIFF app configured: back to the chat route, which still works.
  const noLiff = JSON.stringify(jobPreviewMessage(DRAFT, 'x', { editDraftUrl: null }));
  assert.ok(noLiff.includes('action=edit_new_job'));
});

test('the form turns a chat draft back into rows it can edit', () => {
  // The chat keeps items in the database's shape (item_name / size / quantity);
  // the form thinks in width, length and unit, so the label has to be read back.
  assert.match(js, /function parseSizeLabel/);
  assert.match(js, /UNIT_FROM_LABEL/);
  assert.ok(js.includes("'ซม.': 'cm'") && js.includes("'ม.': 'm'"), 'size units are not mapped back');
  assert.match(js, /function fromDraft/);
});

test('a price from the chat is shown, and is not recomputed away', () => {
  // priceManual stops the form pricing it again from a rate that is not there.
  assert.match(js, /priceManual: true/);
  // But paint() skips the box when priceManual, so without this the row came
  // back with the right total and an empty price.
  assert.match(js, /price\.value = item\.price \|\| '';/, 'the price box is never filled in');
});

test('editing a loaded row moves the total — the whole point of the button', () => {
  // Pinning totalManual made every row's total immovable: change the quantity
  // and the money stayed at the old figure. Silently wrong is worse than not
  // editable at all.
  assert.ok(!/totalManual: true,\n\s*\};\n\s*\}\);\n\n\s*state\.customer/.test(js), 'the line total is pinned again');
  assert.match(js, /totalManual: Math\.abs\(/, 'nothing decides when a total may float');

  // Only a row whose total never was price × quantity keeps its own figure.
  const rule = /totalManual: Math\.abs\(num\(it\.unit_price\) \* \(num\(it\.quantity\) \|\| 1\) - num\(it\.total\)\) > 0\.01/;
  assert.match(js, rule);
});

test('saving from the form ends the draft sitting in the chat', () => {
  // Leaving the state set has the next message parsed as a correction to a job
  // that is already in the database.
  assert.match(js, /fetch\('\/api\/draft', \{ method: 'DELETE'/);
  assert.match(js, /params\.get\('draft'\) === '1'/);
});
