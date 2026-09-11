import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categoryGroupsFlex, categoryTypesFlex } from '../src/flex/categoryPickerFlex.js';
import { buildJobBubble, jobPreviewMessage } from '../src/flex/jobCard.js';
import { CATEGORY_GROUPS } from '../src/utils/category.js';

test('picker step 1: every group is offered, and carries the job id through', () => {
  const json = JSON.stringify(categoryGroupsFlex('job-1'));
  for (const g of CATEGORY_GROUPS) {
    assert.ok(json.includes(g.label), `missing ${g.label}`);
    assert.ok(json.includes(`action=pick_category&group=${g.id}&jobId=job-1`), `missing action for ${g.id}`);
  }
  assert.ok(json.includes('งานทั่วไป')); // the catch-all

  // Without a job id the picker still works (it re-categorises the latest job).
  assert.ok(!JSON.stringify(categoryGroupsFlex()).includes('jobId='));
});

test('picker step 2: the chosen group\'s types, plus a way back', () => {
  const json = JSON.stringify(categoryTypesFlex('sign', 'job-1'));
  assert.ok(json.includes('งานป้าย'));
  assert.ok(json.includes('ป้ายไวนิล'));
  assert.ok(json.includes('โฟมบอร์ด'));
  assert.ok(json.includes('action=pick_category&group=sign&type=vinyl&jobId=job-1'));
  assert.ok(json.includes('เลือกประเภทงานใหม่'));

  // Human descriptions, as in the mockup — not the matching keywords.
  assert.ok(json.includes('ขนาดตามต้องการ / งานด่วน'));
  assert.ok(!json.includes('อิงค์เจ็ท'), 'keywords must not leak into the picker');

  // สติ๊กเกอร์กับตรายางเป็นหมวดของตัวเองแล้ว ไม่ได้อยู่ใต้งานป้าย/งานพิมพ์
  const sticker = JSON.stringify(categoryTypesFlex('sticker'));
  assert.ok(sticker.includes('สติ๊กเกอร์ไดคัท / ฉลากสินค้า'));
  assert.ok(sticker.includes('สติ๊กเกอร์ฟิวเจอร์บอร์ด'));
  const stamp = JSON.stringify(categoryTypesFlex('stamp'));
  assert.ok(stamp.includes('หมึกในตัว / ด้ามไม้ / สั่งทำตามแบบ'));

  const print = JSON.stringify(categoryTypesFlex('print'));
  assert.ok(print.includes('เลือกประเภทงานพิมพ์ที่ต้องการ'));
  assert.ok(print.includes('ขาวดำ / สี / จำนวนหลายชุด'));
  assert.ok(print.includes('สแกนเป็นไฟล์ PDF / JPG'));
});

test('picker step 2: a group with no types can still be chosen', () => {
  const json = JSON.stringify(categoryTypesFlex('other', 'job-1'));
  assert.ok(json.includes('งานทั่วไป'));
  assert.ok(json.includes('action=pick_category&group=other&type=&jobId=job-1'));
});

const job = {
  job_name: 'งานป้าย / ป้ายไวนิล',
  job_date: '2026-09-08',
  payment_status: 'pending',
  total: 400,
  items: [
    { item_name: 'ป้ายไวนิล', size: '60x100', quantity: 1, total: 150 },
    { item_name: 'โฟมบอร์ด', size: '40x60', quantity: 1, total: 250 },
  ],
};

test('job card: a compact numbered table, with ✏️ / ✕ beside the job name', () => {
  const bubble = buildJobBubble({ ...job, id: 'job-9' });
  const saved = JSON.stringify(bubble);
  assert.ok(saved.includes('"text":"1."'));
  assert.ok(saved.includes('"text":"2."'));
  assert.ok(saved.includes('action=edit_job&jobId=job-9'));
  assert.ok(saved.includes('action=delete_job&jobId=job-9'));
  assert.ok(saved.includes('action=pick_category&jobId=job-9'));

  // ✏️ and ✕ ride on the job's own row now; only ออกใบเสร็จ / เลือกหมวด are
  // left in the footer. If they slide back down there the card grows a
  // three-button stack again and stops looking like the reference.
  const footer = JSON.stringify(bubble.footer);
  assert.ok(!footer.includes('action=edit_job'), 'แก้ไข must not be a footer button');
  assert.ok(!footer.includes('action=delete_job'), 'ยกเลิก must not be a footer button');
  assert.ok(footer.includes('action=pick_category&jobId=job-9'));
});

// Every text node in a bubble, so an assertion can look at one by its text
// rather than at the shape of the JSON around it.
function texts(node, out = []) {
  if (Array.isArray(node)) node.forEach((n) => texts(n, out));
  else if (node && typeof node === 'object') {
    if (node.type === 'text') out.push(node);
    Object.values(node).forEach((v) => v && typeof v === 'object' && texts(v, out));
  }
  return out;
}

test('job card: a long item name is never truncated', () => {
  const longName = 'สั่งป้ายไวนิลหน้างานสีดำ แนวตั้ง พร้อมตาไก่';
  const bubble = buildJobBubble({
    ...job,
    id: 'job-9',
    items: [{ item_name: longName, size: '160 × 300 ซม.', quantity: 2, unit: 'ผืน', total: 1200 }],
  });
  const all = texts(bubble);

  // The whole name, and wrap on the node that carries it — a card that cuts
  // the name to "สั่งป้ายไวนิลหน้…" cannot tell the shop which job it is.
  const name = all.find((t) => t.text === longName);
  assert.ok(name, 'the item name must appear in full');
  assert.equal(name.wrap, true, 'the item name must wrap, not truncate');

  // Size and quantity move to their own quiet line under the name.
  assert.ok(all.some((t) => t.text === '160 × 300 ซม. · 2 ผืน'));
});

test('job card: a draft has no job number yet, so no dangling separator', () => {
  // The preview card is the one the shop reads most, and a draft has no
  // number until it is saved — "10 ก.ย. 2569 ·" is what that used to render.
  const all = texts(buildJobBubble(job));
  assert.ok(all.some((t) => t.text === '8 ก.ย. 2569'), 'date stands alone on a draft');
  assert.ok(!all.some((t) => /·\s*$/.test(t.text)), 'no line may end in a separator');

  const saved = texts(buildJobBubble({ ...job, id: 'job-9', job_number: 'MJ-20260908-0001' }));
  assert.ok(saved.some((t) => t.text === '8 ก.ย. 2569 · MJ-20260908-0001'));
});

test('job card: an unsaved draft gets the confirm footer, never edit/delete', () => {
  const preview = JSON.stringify(jobPreviewMessage({ ...job, id: 'should-be-ignored' }));
  assert.ok(preview.includes('action=confirm_add_job'));
  assert.ok(!preview.includes('action=edit_job'));
  assert.ok(!preview.includes('action=delete_job'));

  const draft = JSON.stringify(buildJobBubble(job));
  assert.ok(!draft.includes('action=edit_job'));
});
