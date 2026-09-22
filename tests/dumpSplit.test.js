import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitDump, looksLikeDump, groupLines } from '../src/utils/dumpSplit.js';
import { draftsFrom } from '../src/actions/saveDump.js';
import { dumpPreviewFlex } from '../src/flex/dumpFlex.js';

/* ร้านบอกว่า "ถ้าเราใส่จดประจำวันอ่ะ แบบคิดได้ก็ใส่ ให้ม่วงแยกประจำวันให้ได้ไหม
 * บางทีไม่มีเวลามานั่งใส่เป็นหมวด ๆ"
 *
 * ของเดิมข้อความหลายบรรทัดถูกอ่านเป็น "งานเดียวที่มีหลายรายการ" ลูกค้าสี่คนใน
 * สี่บรรทัดจึงกลายเป็นบิลใบเดียวของคนแรก ส่วนชื่ออีกสามคนถูกยัดไปเป็นชื่อสินค้า
 * ("โรงเรียนบ้านปงสนุก ตรายาง") — ออกใบเสร็จให้ใครไม่ได้เลยสักคน
 */

const DAY = `พี่ต่าย สติ๊กเกอร์ 50 ดวง 5*6.5 ดวงละ 5
โรงเรียนบ้านปงสนุก ตรายาง 2 อัน อันละ 300
ป้าแดง ป้ายไวนิล 160x300 ตรมละ 165
วัดบ้านชี กรอบรูป 3 อัน อันละ 450`;

test('จดสี่บรรทัด ได้สี่งาน คนละลูกค้า', () => {
  const { jobs, total } = splitDump(DAY);

  assert.equal(jobs.length, 4, 'ไม่ได้แยกเป็นสี่งาน');
  assert.deepEqual(
    jobs.map((j) => j.customerName),
    ['พี่ต่าย', 'โรงเรียนบ้านปงสนุก', 'ป้าแดง', 'วัดบ้านชี']
  );

  // ชื่อลูกค้าต้องไม่ไปโผล่เป็นชื่อสินค้า ซึ่งคือสิ่งที่เกิดขึ้นของเดิม
  for (const job of jobs) {
    for (const item of job.items) {
      assert.ok(
        !item.item_name.includes(job.customerName),
        `ชื่อลูกค้าติดไปในชื่อสินค้า: "${item.item_name}"`
      );
    }
  }

  assert.deepEqual(jobs.map((j) => j.total), [250, 600, 792, 1350]);
  assert.equal(total, 2992);
});

/* "สติ๊กเกอร์ 50 ดวง ดวงละ 5" ตัวอ่านหลายบรรทัดคิดได้ ฿5
 *
 * จำนวนถูกกลืนไปอยู่ในชื่อสินค้า ("สติ๊กเกอร์ 50 ดวง") แล้วเหลือ quantity = 1
 * ร้านจึงคิดเงินลูกค้าขาดไป 245 บาทต่อบรรทัด — อ่านทีละบรรทัดได้ ฿250 ซึ่งถูก
 */
test('จำนวนไม่ถูกกลืนไปอยู่ในชื่อสินค้า', () => {
  const [sticker] = splitDump(DAY).jobs;
  assert.equal(sticker.items[0].item_name, 'สติ๊กเกอร์');
  assert.equal(sticker.items[0].quantity, 50);
  assert.equal(sticker.items[0].unit, 'ดวง');
  assert.equal(sticker.total, 250, 'คิดเงินขาด — จำนวนหายไปอยู่ในชื่อ');
});

test('เขียนชื่อลูกค้าไว้หัวกลุ่มแล้วไล่ของข้างใต้ ก็เข้าใจ', () => {
  const { jobs } = splitDump(`พี่ต่าย
  สติ๊กเกอร์ 50 ดวง ดวงละ 5
  ตรายาง 1 อัน 250
โรงเรียนบ้านปงสนุก ตรายาง 2 อัน อันละ 300`);

  // ของหลายอย่างของลูกค้าคนเดียว = งานเดียวหลายรายการ ใบเสร็จจึงเป็นใบเดียว
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].customerName, 'พี่ต่าย');
  assert.equal(jobs[0].items.length, 2);
  assert.equal(jobs[0].total, 500);
  assert.equal(jobs[1].customerName, 'โรงเรียนบ้านปงสนุก');
});

/* เดาชื่อลูกค้าผิดแปลว่าออกใบเสร็จผิดคน จึงไม่เดาเกินที่ร้านเขียน
 *
 * บรรทัดที่ไม่ได้ย่อหน้าและไม่มีชื่อ = งานขายหน้าร้าน ไม่ใช่ของลูกค้าคนข้างบน
 */
test('งานที่ไม่มีชื่อ ไม่ถูกยัดให้ลูกค้าคนก่อนหน้า', () => {
  const { jobs } = splitDump(`ป้าแดง ป้ายไวนิล 160x300 ตรมละ 165
ตรายาง 1 อัน 250`);

  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].customerName, 'ป้าแดง');
  assert.equal(jobs[1].customerName, null, 'งานขายหน้าร้านถูกยัดให้ป้าแดง');
});

test('หัวข้ออย่าง "งานวันนี้" ไม่กลายเป็นงาน', () => {
  const { jobs } = splitDump(`งานวันนี้
พี่นก ป้ายไวนิล 2 ป้าย ป้ายละ 350
ครูแดง ตรายาง 1 อัน 300`);

  assert.equal(jobs.length, 2);
  assert.deepEqual(jobs.map((j) => j.customerName), ['พี่นก', 'ครูแดง']);
  assert.deepEqual(groupLines('งานวันนี้\nพี่นก ป้าย 2 ป้าย ป้ายละ 350').length, 1);
});

test('งานเดียวยังไปทางเดิม ไม่ใช่ทางแยกกอง', () => {
  // ทางเดิมมีการ์ดสรุปและปุ่มแก้ไขครบอยู่แล้ว ไม่มีอะไรให้แยก
  assert.equal(looksLikeDump('พี่ต่าย สติ๊กเกอร์ 50 ดวง ดวงละ 5'), false);
  assert.equal(looksLikeDump(''), false);
  assert.equal(looksLikeDump('สวัสดีค่ะ\nวันนี้เป็นยังไงบ้าง'), false, 'คุยเล่นถูกอ่านเป็นการจดงาน');

  // สองบรรทัดที่เป็นงานจริงถึงจะใช่
  assert.equal(looksLikeDump('พี่นก ป้าย 2 ป้าย ป้ายละ 350\nครูแดง ตรายาง 1 อัน 300'), true);
});

test('ร่างที่ส่งเข้าฐานข้อมูล มีครบทุกช่องที่งานหนึ่งใบต้องมี', () => {
  const { jobs } = splitDump(DAY);
  const drafts = draftsFrom(jobs, '2026-09-22');

  assert.equal(drafts.length, 4);
  for (const [i, d] of drafts.entries()) {
    assert.equal(d.customerName, jobs[i].customerName);
    assert.equal(d.jobDate, '2026-09-22', 'ทุกงานต้องลงวันเดียวกันกับวันที่จด');
    assert.ok(d.items.length > 0);
    assert.equal(d.total, jobs[i].total);
  }
});

test('การ์ดตรวจ โชว์ชื่อลูกค้าทุกคนและยอดรวม', () => {
  const { jobs, total } = splitDump(DAY);
  const json = JSON.stringify(dumpPreviewFlex(jobs, total));

  for (const j of jobs) assert.ok(json.includes(j.customerName), `ไม่มี ${j.customerName} บนการ์ด`);
  assert.ok(json.includes('฿2,992'), 'ไม่มียอดรวมบนการ์ด');
  assert.ok(json.includes('action=confirm_dump'), 'ไม่มีปุ่มบันทึกทั้งหมด');
  assert.ok(json.includes('action=cancel_dump'), 'ไม่มีทางยกเลิก');

  // งานที่ไม่มีชื่อลูกค้า ต้องบอกให้รู้ตัว ไม่ใช่ปล่อยไปเจอตอนออกใบเสร็จ
  const anon = splitDump('ป้าแดง ป้ายไวนิล 160x300 ตรมละ 165\nตรายาง 1 อัน 250');
  const anonJson = JSON.stringify(dumpPreviewFlex(anon.jobs, anon.total));
  assert.ok(anonJson.includes('ยังไม่มีชื่อลูกค้า'));
});

/* บันทึกจริงลงฐานข้อมูล (จำลอง) — ร่างที่แยกได้ต้องกลายเป็นงานคนละใบจริง ๆ
 *
 * เทสต์ข้างบนดูแค่ว่าแยกถูก ส่วนอันนี้ดูว่าของที่แยกแล้วเขียนลงตารางได้ และ
 * ได้ออกมาเป็นสี่งานคนละลูกค้า ไม่ใช่งานเดียวสี่รายการเหมือนของเดิม
 */
test('แยกแล้วบันทึกได้จริง เป็นสี่งานคนละลูกค้า', async () => {
  const { createMockSupabase } = await import('./helpers/mockSupabase.js');
  const { createJob } = await import('../src/services/jobService.js');
  const db = createMockSupabase({ profiles: [{ id: 'u1', line_user_id: 'U1' }] });

  const { jobs } = splitDump(DAY);
  for (const draft of draftsFrom(jobs, '2026-09-22')) {
    await createJob('u1', draft, db);
  }

  const rows = db._store.tables.jobs;
  assert.equal(rows.length, 4, 'ไม่ได้เป็นสี่งานแยกกัน');
  assert.deepEqual(
    rows.map((r) => r.customer_name),
    ['พี่ต่าย', 'โรงเรียนบ้านปงสนุก', 'ป้าแดง', 'วัดบ้านชี']
  );
  assert.deepEqual(rows.map((r) => Number(r.total)), [250, 600, 792, 1350]);
  // ทุกงานลงวันเดียวกัน — มันคือการจดของวันนั้นทั้งกอง
  assert.deepEqual([...new Set(rows.map((r) => r.job_date))], ['2026-09-22']);

  // และรายการย่อยต้องผูกกับงานของตัวเอง ไม่ใช่กองรวมอยู่ใบเดียว
  const items = db._store.tables.job_items;
  assert.equal(items.length, 4);
  assert.equal(new Set(items.map((i) => i.job_id)).size, 4, 'รายการย่อยไปกองอยู่งานเดียว');
});

test('แชตต่อสายถึงจริง — ทางแยกกองมาก่อนทางงานเดี่ยว', async () => {
  const { readFileSync } = await import('node:fs');
  const handler = readFileSync(new URL('../src/handlers/messageHandler.js', import.meta.url), 'utf8');
  const postback = readFileSync(new URL('../src/handlers/postbackHandler.js', import.meta.url), 'utf8');

  // ลำดับสำคัญ: looksLikeJob คว้าข้อความหลายบรรทัดไปได้เหมือนกัน ถ้ามาก่อน
  // ทางแยกกองจะไม่มีวันถูกเรียกเลยสักครั้ง
  const dumpAt = handler.indexOf('looksLikeDump(text)');
  const singleAt = handler.indexOf('looksLikeJob(text) || looksLikePricelessJob(text)');
  assert.ok(dumpAt > -1, 'ตัวจัดการข้อความไม่รู้จักการจดรวดเดียว');
  assert.ok(singleAt > -1);
  assert.ok(dumpAt < singleAt, 'ทางงานเดี่ยวมาก่อน ทางแยกกองจะไม่ถูกเรียก');

  // ยังไม่บันทึกอะไรจนกว่าจะกดยืนยัน — การ์ดคือจุดที่ร้านตรวจว่าแยกถูกคนไหม
  const fn = handler.slice(handler.indexOf('async function handleDump'), handler.indexOf('async function handleNewJob'));
  assert.match(fn, /STATES\.CONFIRMING_DUMP/);
  assert.ok(!/createJob/.test(fn), 'บันทึกลงฐานข้อมูลตั้งแต่ยังไม่ได้ยืนยัน');

  // และปุ่มบนการ์ดต้องมีปลายทางจริง
  assert.match(postback, /case 'confirm_dump':/);
  assert.match(postback, /case 'cancel_dump':/);
});
