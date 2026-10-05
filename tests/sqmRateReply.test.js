import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeDraft, parseBareSqmRate, priceDraftBySqm, parseCustomerName } from '../src/utils/jobDraft.js';

/* ร้านขอไว้ตรง ๆ: ใบสั่งงานหลายบอร์ด "ให้บอทถามต่อว่าของใคร แล้วไล่บอร์ด
 * 1-2-3-4 มาเลย ขนาดเท่านี้ ตรมละเท่านี้ กี่บาท"
 *
 * เคสจริงที่ทำให้เกิดเรื่องนี้: โฟมบอร์ด 4 แผ่นของโรงเรียนพระธาตุพิทยาคม
 * 120x70 / 120x120 / 120x80 / 120x80 ซม. — ไม่มีราคาในเอกสาร
 */

const BOARDS = makeDraft({
  jobName: 'ปริ้นโฟมบอร์ด 4 บอร์ด',
  items: [
    { item_name: 'บอร์ด 1 แนะนำโรงเรียน', size: '120x70 ซม.', quantity: 1, unit_price: 0, total: 0 },
    { item_name: 'บอร์ด 2 ข้าวนาบุญ', size: '120x120 ซม.', quantity: 1, unit_price: 0, total: 0 },
    { item_name: 'บอร์ด 3 เห็ดของเรา', size: '120x80 ซม.', quantity: 1, unit_price: 0, total: 0 },
    { item_name: 'บอร์ด 4 ผักสลัด', size: '120x80 ซม.', quantity: 1, unit_price: 0, total: 0 },
  ],
});

test('คำตอบที่เป็นเรตล้วน ๆ เท่านั้นที่นับเป็นเรต', () => {
  for (const [text, want] of [
    ['ตรมละ 350', 350],
    ['ตารางเมตรละ 350 บาท', 350],
    ['ตร.ม. ละ 350 ค่ะ', 350],
    ['350 บาท/ตรม', 350],
    ['คิด ตรมละ 350 เลย', 350],
  ]) {
    assert.equal(parseBareSqmRate(text), want, text);
  }
  // มีขนาดติดมา = บรรทัดงานใหม่ ไม่ใช่คำตอบ
  assert.equal(parseBareSqmRate('ไวนิล 160x300 ตรมละ 165'), null);
  // ราคาก้อน ไม่ใช่เรต
  assert.equal(parseBareSqmRate('1500'), null);
  assert.equal(parseBareSqmRate('รวม 1500'), null);
  assert.equal(parseBareSqmRate(''), null);
});

test('ไล่คิดทีละบอร์ดตามขนาดของมันเอง และยอดรวมถูก', () => {
  const out = priceDraftBySqm(BOARDS, 350);
  assert.ok(out, 'ไม่ยอมคิดทั้งที่ทุกบอร์ดมีขนาด');

  // 0.84 / 1.44 / 0.96 / 0.96 ตร.ม. × 350
  assert.deepEqual(out.draft.items.map((i) => i.total), [294, 504, 336, 336]);
  assert.equal(out.draft.total, 1470);
  assert.equal(out.draft.subtotal, 1470);

  // วิธีคิดไล่ให้ดูทีละบรรทัด ตรวจเลขด้วยมือได้
  assert.equal(out.lines.length, 4);
  assert.match(out.lines[0], /บอร์ด 1.*0\.84 ตร\.ม\. × 350 = 294/);
  assert.match(out.lines[1], /1\.44 ตร\.ม\. × 350 = 504/);

  // วิธีคิดตามไปอยู่ในโน้ตของงานด้วย เปิดดูทีหลังก็ยังเห็น
  assert.match(out.draft.note, /คิดตาม ตร\.ม\./);
});

test('บอร์ดเดียวไม่มีขนาด = ไม่คิดให้ทั้งใบ ไม่ใช่คิดเฉพาะที่คิดได้', () => {
  /* ใบที่คิดให้แค่ 3 ใน 4 บอร์ดคือใบที่ยอดรวมผิดแบบเงียบที่สุด — บอร์ดที่หาย
   * ไปคือบอร์ดที่ไม่มีใครรู้ว่าไม่ได้เก็บเงิน
   */
  const missing = makeDraft({
    jobName: 'x',
    items: [
      { item_name: 'บอร์ด 1', size: '120x70 ซม.', quantity: 1, unit_price: 0, total: 0 },
      { item_name: 'นามบัตร', quantity: 1, unit_price: 0, total: 0 },
    ],
  });
  assert.equal(priceDraftBySqm(missing, 350), null);
});

test('ใบที่มีราคาแล้ว ไม่ถูกคิดทับ และจำนวนหลายชิ้นคูณให้ด้วย', () => {
  const priced = makeDraft({
    jobName: 'x',
    items: [{ item_name: 'ป้าย', size: '100x100 ซม.', quantity: 1, unit_price: 500, total: 500 }],
    total: 500,
  });
  assert.equal(priceDraftBySqm(priced, 350), null);

  const two = makeDraft({
    jobName: 'x',
    items: [{ item_name: 'ป้าย', size: '100x100 ซม.', quantity: 2, unit_price: 0, total: 0 }],
  });
  const out = priceDraftBySqm(two, 350);
  // 1 ตร.ม. × 350 = 350 ต่อชิ้น × 2
  assert.equal(out.draft.total, 700);
  assert.match(out.lines[0], /× 2 ชิ้น = 700/);
});

test('ขนาดอยู่ในชื่อของ (ไม่มีช่อง size) ก็ยังคิดได้', () => {
  const inName = makeDraft({
    jobName: 'x',
    items: [{ item_name: 'โฟมบอร์ด 120x70', quantity: 1, unit_price: 0, total: 0 }],
  });
  assert.equal(priceDraftBySqm(inName, 350)?.draft.total, 294);
});

/* "ให้บอทถามต่อว่าของใคร" — คำตอบคือชื่อ ไม่ใช่คำคุย */
test('ชื่อลูกค้ารับได้ คำรับคำทั่วไปไม่ใช่ชื่อ', () => {
  assert.equal(parseCustomerName('โรงเรียนพระธาตุพิทยาคม'), 'โรงเรียนพระธาตุพิทยาคม');
  assert.equal(parseCustomerName('ของโรงเรียนบ้านดอน'), 'โรงเรียนบ้านดอน');
  assert.equal(parseCustomerName('ลูกค้าชื่อ ครูแนน'), 'ครูแนน');
  assert.equal(parseCustomerName('คุณแอน'), 'คุณแอน');

  for (const text of ['โอเค', 'ได้เลย', 'ครับ', 'ค่ะ', 'ขอบคุณค่ะ', 'ใช่', 'ok', '', 'รร.บ้านดอน 2']) {
    assert.equal(parseCustomerName(text), null, JSON.stringify(text));
  }
});

test('บทสนทนาต่อกันครบ: ถามของใคร → รับชื่อ → รับเรต → ไล่คิดให้', () => {
  const handler = readFileSync(new URL('../src/handlers/messageHandler.js', import.meta.url), 'utf8');
  const image = readFileSync(new URL('../src/handlers/imageHandler.js', import.meta.url), 'utf8');

  // ถามว่าของใคร ทั้งทางพิมพ์และทางรูป เมื่อยังไม่รู้ลูกค้า
  for (const [src, name] of [[handler, 'messageHandler'], [image, 'imageHandler']]) {
    assert.ok(src.includes('งานนี้ของลูกค้าท่านไหนคะ'), name + ' ไม่ถาม');
  }

  // เรตต้องถูกเช็กก่อนราคาเหมา เพราะ "ตรมละ 350" ก็มีตัวเลขเหมือนกัน
  const fn = handler.slice(handler.indexOf('async function handleDraftPrice'));
  assert.ok(fn.indexOf('parseBareSqmRate') < fn.indexOf('parseBarePrice'), 'เรตต้องมาก่อนราคาเหมา');

  // ชื่อถูกใส่เข้าร่างแล้วขึ้นการ์ดใหม่ ไม่ใช่ตอบ "ยังมีร่างค้าง" ใส่หน้า
  assert.match(handler, /parseCustomerName\(text\)/);
  assert.match(handler, /customerName: name/);

  // ใบหลายบอร์ด แนะนำให้ตอบเป็นเรต
  assert.ok(handler.includes('ไล่คิดทีละแผ่น') || handler.includes('ตรมละ'), 'ไม่แนะนำเรต');
  assert.ok(image.includes('ตรมละ'), 'ทางรูปไม่แนะนำเรต');
});
