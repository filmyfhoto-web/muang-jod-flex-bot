import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractDueDate, extractDate } from '../src/utils/thaiDate.js';
import { dueText, dueLine } from '../src/flex/components/dueLine.js';
import { makeDraft, draftToBubble } from '../src/utils/jobDraft.js';
import { jobCardMessage } from '../src/flex/jobCard.js';
import { safe, jobCreateSchema, jobPatchSchema } from '../src/utils/validation.js';

// วันนัดรับงานเป็นคนละเรื่องกับวันที่จด: จดวันนี้ นัดรับอีกสิบวันข้างหน้าได้
const NOW = new Date('2026-09-09T05:00:00Z'); // 2026-09-09 ที่กรุงเทพ

test('extractDueDate: a pickup date always wears a label', () => {
  const cases = [
    ['ป้ายไวนิล 300 นัดรับ 15 ก.ย.', '2026-09-15', 'ป้ายไวนิล 300'],
    ['ป้าย 500 รับก่อน 20/9', '2026-09-20', 'ป้าย 500'],
    ['วันรับ 1 ต.ค. ป้าย 900', '2026-10-01', 'ป้าย 900'],
    ['ป้าย 500 นัดส่ง พรุ่งนี้', '2026-09-10', 'ป้าย 500'],
    ['ป้าย 200 นัดรับ มะรืน', '2026-09-11', 'ป้าย 200'],
    ['ป้าย 500 ส่งอีก 3 วัน', '2026-09-12', 'ป้าย 500'],
  ];
  for (const [input, date, rest] of cases) {
    assert.deepEqual(extractDueDate(input, NOW), { date, rest }, input);
  }
});

test('extractDueDate: money after "รับ" is money, not a date', () => {
  // This is the trap the whole design avoids: "รับมาแล้ว 300" is a deposit,
  // and reading it as the 300th of anything would be nonsense with a date
  // attached to it.
  for (const plain of [
    'ไวนิล 160x300 ตรมละ 165 รับมาแล้ว 300',
    'ป้ายไวนิล 60x100 150 บาท',
    'ป้าย 350 รับเงินแล้ว',
    'ส่งของแล้วนะ',
  ]) {
    assert.deepEqual(extractDueDate(plain, NOW), { date: null, rest: plain }, plain);
  }
});

test('a pickup date with no year is the one coming up, not the one gone', () => {
  // The mirror of the record date, which means the one that just happened.
  assert.equal(extractDueDate('ป้าย 100 นัดรับ 5 ม.ค.', NOW).date, '2027-01-05');
  // A couple of days behind is a typo, not next year.
  assert.equal(extractDueDate('ป้าย 100 นัดรับ 8 ก.ย.', NOW).date, '2026-09-08');
  // A year that was given is simply believed, พ.ศ. and all.
  assert.equal(extractDueDate('ป้าย 100 นัดรับ 15 ก.ย. 2570', NOW).date, '2027-09-15');
});

test('one message can carry both dates, and they do not eat each other', () => {
  const text = '10 กันยา ป้ายไวนิล 300 นัดรับ 20 ก.ย.';
  const due = extractDueDate(text, NOW);
  const when = extractDate(due.rest, NOW);

  assert.equal(due.date, '2026-09-20', 'the pickup date');
  assert.equal(when.date, '2026-09-10', 'the date it was jotted');
  assert.equal(when.rest, 'ป้ายไวนิล 300', 'and neither is left in the item name');
});

test('dueText counts the days, and says when they have run out', () => {
  const on = (d) => dueText(d, '2026-09-09');
  assert.match(on('2026-09-09').text, /วันนี้$/);
  assert.match(on('2026-09-10').text, /พรุ่งนี้$/);
  assert.match(on('2026-09-14').text, /อีก 5 วัน$/);
  assert.match(on('2026-09-07').text, /เลยกำหนด 2 วัน$/);
  assert.match(on('2026-09-14').text, /^📅 นัดรับ 14 ก\.ย\. 2569/);

  // Late is red and bold, due today or tomorrow is amber, the rest is quiet.
  assert.equal(on('2026-09-07').late, true);
  assert.equal(on('2026-09-10').soon, true);
  assert.equal(on('2026-09-30').late, false);
  assert.equal(on('2026-09-30').soon, false);

  // No pickup date, no line — the card simply does not mention it.
  assert.equal(dueText(null), null);
  assert.equal(dueLine(null), null);
});

test('the pickup date reaches the card, and an absent one adds nothing', () => {
  const draft = makeDraft({
    jobName: 'ป้ายไวนิล',
    dueDate: '2026-09-20',
    items: [{ item_name: 'ป้าย', quantity: 1, unit_price: 300, total: 300 }],
  });
  assert.equal(draft.dueDate, '2026-09-20');
  assert.equal(draftToBubble(draft).due_date, '2026-09-20');
  assert.ok(JSON.stringify(jobCardMessage(draftToBubble(draft))).includes('นัดรับ'));

  const plain = makeDraft({ jobName: 'ป้าย', items: [{ item_name: 'ป้าย', quantity: 1, unit_price: 300, total: 300 }] });
  assert.equal(plain.dueDate, null);
  assert.ok(!JSON.stringify(jobCardMessage(draftToBubble(plain))).includes('นัดรับ'));
});

test('the API takes a pickup date on create and on edit, and refuses nonsense', () => {
  const items = [{ item_name: 'ป้าย', quantity: 1, unit_price: 300 }];
  assert.equal(safe(jobCreateSchema, { items, dueDate: '2026-09-20' }).data.dueDate, '2026-09-20');
  assert.equal(safe(jobCreateSchema, { items, dueDate: null }).ok, true, 'no date is a valid answer');
  assert.equal(safe(jobCreateSchema, { items, dueDate: '20/9/2026' }).ok, false);

  // Editing must be able to CLEAR it, so null has to survive the schema.
  assert.equal(safe(jobPatchSchema, { due_date: null }).ok, true);
  assert.equal(safe(jobPatchSchema, { due_date: '2026-09-20' }).ok, true);
  assert.equal(safe(jobPatchSchema, { due_date: 'พรุ่งนี้' }).ok, false);
});

test('a job is never lost over a column the database may not have yet', () => {
  // Migration 007 is run by hand. Until it is, due_date does not exist — so it
  // is stamped on after the row is written, never inserted with it, and a
  // failure there is a warning rather than a lost job.
  const service = readFileSync(new URL('../src/services/jobService.js', import.meta.url), 'utf8');
  const insert = service.slice(service.indexOf(".from('jobs')\n      .insert({"), service.indexOf('.select(\'*\')\n      .single();'));
  assert.ok(!insert.includes('due_date'), 'due_date must not be part of the insert');
  assert.match(service, /update\(\{ due_date: dueDate \}\)/);
  assert.match(service, /logger\.warn\('job\.due_stamp_failed'/);
});

test('the form and the edit page both offer the field', () => {
  const jot = readFileSync(new URL('../public/liff/jot/index.html', import.meta.url), 'utf8');
  const jotJs = readFileSync(new URL('../public/liff/jot/script.js', import.meta.url), 'utf8');
  const dash = readFileSync(new URL('../public/liff/index.html', import.meta.url), 'utf8');

  assert.ok(jot.includes('id="f-due"') && jot.includes('วันรับงาน'), 'the form has no pickup date');
  assert.ok(jotJs.includes('dueDate: state.due || null'), 'the form never sends it');
  assert.ok(dash.includes('id="e-due"'), 'the edit page cannot change it');
  // Clearing the box has to mean "no pickup date", not "leave it alone".
  assert.ok(dash.includes("due_date: $('e-due').value || null"), 'the pickup date cannot be cleared');
});
