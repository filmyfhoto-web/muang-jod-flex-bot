import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import express from 'express';
import { createApiRouter, missingPickupColumn } from '../src/routes/api.js';

process.env.LIFF_ID = '1234567890-abcdefgh';

const page = readFileSync(new URL('../public/liff/index.html', import.meta.url), 'utf8');

/* ร้านส่งรูปคิวงานมาพร้อมคำว่า "กดไม่ได้ แยกช่องหมวดงานให้หน่อย อ่านแล้ว งง
 * ปรับให้ใช้งานง่ายกว่านี้ได้มั้ย"
 *
 * สามเรื่องในประโยคเดียว: ปุ่มไม่ทำงาน · ไม่มีการแบ่งตามหมวดงาน · หน้าจออ่านยาก
 */

/* "กดไม่ได้" — ปุ่มเด้งกลับที่เดิมทุกครั้ง โดยไม่มีอะไรบอกว่าทำไม
 *
 * ช่อง picked_up_at ยังไม่มีในฐานข้อมูล (ยังไม่ได้รัน migration 014) คำขอจึง
 * ล้มเป็น error 500 แล้วหน้าเว็บขึ้นว่า "บันทึกไม่สำเร็จ" เฉย ๆ ร้านไม่มีทาง
 * รู้เลยว่าต้องไปรัน migration
 */
test('ยังไม่ได้รัน migration ต้องบอกให้รู้ ไม่ใช่เงียบ ๆ ว่าบันทึกไม่สำเร็จ', async () => {
  const noColumn = Object.assign(new Error("Could not find the 'picked_up_at' column of 'jobs' in the schema cache"), {
    code: 'PGRST204',
  });

  const app = express();
  app.use(express.json());
  app.use(
    '/api',
    createApiRouter({
      verify: async () => ({ userId: 'U1' }),
      resolveProfile: async () => ({ id: 'u1', line_user_id: 'U1' }),
      getJobById: async () => ({ id: 'j1', total: 600, paid_amount: 0, balance_due: 600 }),
      updateJob: async () => {
        throw noColumn;
      },
    })
  );

  const server = app.listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/jobs/j1/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'done' }),
    });
    assert.equal(res.status, 503, 'ตกเป็น error ทั่วไป ร้านเห็นแค่ "บันทึกไม่สำเร็จ"');
    const body = await res.json();
    assert.match(body.message, /014_job_pickup/, 'ไม่ได้บอกว่าต้องทำอะไรถึงจะกดได้');
  } finally {
    server.close();
  }
});

test('แยกออกว่าช่องไหนหาย ไม่ใช่เหมาว่าพังทุกอย่างคือ migration', () => {
  const err = (over) => Object.assign(new Error(over.message || ''), over);

  assert.equal(
    missingPickupColumn(err({ code: 'PGRST204', message: "Could not find the 'picked_up_at' column" })),
    true
  );
  assert.equal(missingPickupColumn(err({ code: '42703', message: 'column jobs.picked_up_at does not exist' })), true);

  // ช่องอื่นหาย หรือพังด้วยเรื่องอื่น ไม่ใช่เรื่องนี้ — ห้ามบอกร้านให้ไปรัน
  // migration ที่ไม่เกี่ยวกัน
  assert.equal(missingPickupColumn(err({ code: 'PGRST204', message: "Could not find the 'note' column" })), false);
  assert.equal(missingPickupColumn(err({ code: '23505', message: 'duplicate key' })), false);
  assert.equal(missingPickupColumn(err({ message: 'network down' })), false);
  assert.equal(missingPickupColumn(null), false);
});

/* "แยกช่องหมวดงานให้หน่อย" — คิวเรียงตามวันนัดรับอย่างเดียว
 *
 * ตรายาง กรอบรูป ป้าย สติ๊กเกอร์ ปนกันทั้งกอง ร้านที่อยากดู "งานตรายางมีกี่ใบ"
 * ต้องเลื่อนหาทีละแถวจากยี่สิบแถว
 */
test('หน้าเว็บเลือกได้ว่าจะแบ่งกองตามวันนัด หรือตามหมวดงาน', () => {
  assert.match(page, /id="t-queue-group"/, 'ไม่มีปุ่มเลือกวิธีแบ่งกอง');
  assert.match(page, /data-g="day"/);
  assert.match(page, /data-g="cat"/);
  assert.match(page, /const byCat = \(list, done\) =>/, 'ไม่มีตัวแบ่งกองตามหมวดงาน');

  // แบ่งกองด้วยหมวดงานจริง ๆ ไม่ใช่ชื่องานที่ร้านพิมพ์มา (ชื่อเดียวกันสะกด
  // คนละแบบก็กลายเป็นคนละกองทันที)
  assert.match(page, /const key = j\.category \|\| 'other';/);

  // จำไว้ว่าร้านเลือกอะไร ไม่ต้องกดใหม่ทุกครั้งที่เปิดหน้า
  assert.match(page, /QUEUE_GROUP_KEY/);
});

/* "อ่านแล้ว งง" — เรื่องเดียวกันถูกเขียนซ้ำสามที่บนหน้าจอเดียว
 *
 * บรรทัด "ค้างรับ 7 งาน · รับแล้ว 13 งาน" · ปุ่ม "ค้างรับ 7" "รับแล้ว 13" ·
 * ลิงก์ "ดูค้างรับ ›" — ทั้งสามพูดเรื่องเดียวกัน เหลือไว้แบบเดียวที่กดได้
 */
test('เรื่องเดียวกันไม่ถูกเขียนซ้ำบนหน้าจอเดียว', () => {
  assert.doesNotMatch(page, /t-queue-sum/, 'บรรทัดสรุปที่ซ้ำกับปุ่มกรองยังอยู่');
  assert.doesNotMatch(page, /data-go="pending">ดูค้างรับ/, 'ลิงก์ที่ซ้ำกับปุ่ม "ค้างรับ" ยังอยู่');

  // ปุ่มกรองที่เหลือไว้ ต้องยังมีตัวเลขบนปุ่ม
  assert.match(page, /names\[v\] \+ \(counts\[v\] \? ' ' \+ counts\[v\] : ''\)/);
});

/* ชิปวันข้างบนเขียนว่า "เลยกำหนด · 13 ก.ย." อยู่แล้ว
 *
 * คำว่า "เลยกำหนดแล้ว" ในแถวจึงเป็นเรื่องเดิมรอบที่สอง — แต่ตอนแบ่งตามหมวดงาน
 * ไม่มีชิปวัน บรรทัดนี้คือที่เดียวที่บอกว่างานใบนี้เลยกำหนด
 */
test('ป้ายเลยกำหนดขึ้นตอนที่หัวกองไม่ได้บอกวันไว้แล้ว', () => {
  assert.match(page, /if \(opts\.lateNote && job\.due_date/, 'ป้ายเลยกำหนดยังขึ้นทุกแบบการแบ่งกอง');

  // แบ่งตามวัน = ชิปบอกแล้ว ไม่ต้องซ้ำ · แบ่งตามหมวด = ต้องมี
  assert.match(page, /appendJob\(el, j, i \+ 1, done, false\)/, 'แบ่งตามวันยังพูดซ้ำ');
  assert.match(page, /appendJob\(body, j, i \+ 1, done, true\)/, 'แบ่งตามหมวดแล้วไม่รู้ว่าใบไหนเลยกำหนด');
});

/* กองที่มีงานเลยกำหนด กางไว้ให้เลย
 *
 * พับทุกกองแล้วร้านต้องกดเปิดทีละกองเพื่อหาว่างานไหนเลยกำหนด ซึ่งเป็นสิ่งเดียว
 * ที่ต้องรีบ — กองที่เหลือพับไว้ได้ เพราะไม่มีอะไรต้องทำวันนี้
 */
test('กองที่มีงานเลยกำหนด กางไว้ ที่เหลือพับ', () => {
  assert.match(page, /const late = jobs\.filter\(\(j\) => !done && j\.due_date && j\.due_date < today\)\.length;/);
  assert.match(page, /const open = late > 0 \|\| queueOpenCats\.has\(key\);/);

  // จำนวนงานเลยกำหนดต้องเห็นตอนกองพับอยู่ ไม่งั้นต้องกางทุกกองเพื่อหา
  assert.match(page, /'เลยกำหนด ' \+ late/);
});
