import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { receiptFlex } from '../src/flex/receiptFlex.js';

// One customer, several jobs, and a photo of the site that belongs to the job
// being typed — not to whatever was saved before it.

const JOB = {
  id: 'job-1',
  job_name: 'ป้ายไวนิล',
  job_number: 'MJ-1',
  job_date: '2026-09-10',
  created_at: '2026-09-10T03:00:00Z',
  customer_name: 'ผู้ใหญ่สมศรี',
  total: 500,
  paid_amount: 0,
  balance_due: 500,
  payment_status: 'pending',
  items: [{ item_name: 'ป้ายไวนิล', quantity: 1, unit_price: 500, total: 500 }],
};

test('the receipt offers the next job for the same customer', () => {
  const json = JSON.stringify(receiptFlex(JOB));
  assert.ok(json.includes('➕ เพิ่มงานอีก'), 'no way to add another job');
  assert.ok(
    json.includes(`action=add_more&customer=${encodeURIComponent('ผู้ใหญ่สมศรี')}`),
    'the customer is not carried over'
  );

  // A job with no customer still gets the button — the shop may add the name
  // to the next one — it just has nothing to carry.
  const anon = JSON.stringify(receiptFlex({ ...JOB, customer_name: null }));
  assert.ok(anon.includes('➕ เพิ่มงานอีก'));
  assert.ok(anon.includes('action=add_more&customer='));
});

test('a remembered customer fills in, but never overrules the message', () => {
  const handler = readFileSync(new URL('../src/handlers/messageHandler.js', import.meta.url), 'utf8');
  const action = readFileSync(new URL('../src/actions/addJob.js', import.meta.url), 'utf8');

  // Stashed on the state by "➕ เพิ่มงานอีก" …
  assert.match(action, /setState\(profile\.id, STATES\.WAITING_FOR_JOB, \{ customerName \}\)/);
  // … read back when the next message is parsed …
  assert.match(handler, /handleNewJob\(replyToken, profile, text, state\?\.context\?\.customerName \|\| null\)/);
  // … and it only fills a gap. A name in the message wins, because the shop
  // may have moved on to the next customer without pressing anything.
  assert.match(handler, /customerName: parsed\.customerName \|\| knownCustomer/);
});

test('a photo sent while a draft is on screen belongs to that draft', () => {
  const image = readFileSync(new URL('../src/handlers/imageHandler.js', import.meta.url), 'utf8');

  // Without this the photo went to getLatestJob() — the job saved BEFORE the
  // one being typed, which is the one job it certainly does not belong to.
  assert.match(image, /const drafting = current === STATES\.CONFIRMING_JOB && Boolean\(state\?\.context\?\.draft\)/);
  const block = image.slice(image.indexOf('if (drafting) {'), image.indexOf('if (!attaching) {'));
  assert.match(block, /attachment: \{ messageId: message\.id, fileType \}/, 'the photo is not held for the draft');
  assert.ok(block.includes('...state.context'), 'holding the photo drops the draft');
  assert.ok(block.includes('jobPreviewMessage'), 'the draft is not shown again');

  // Held, not uploaded: a cancelled draft must not leave a file behind.
  assert.ok(!block.includes('saveAttachment'), 'the photo is uploaded before the job exists');
});
