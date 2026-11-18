import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildWeekByGroup, mondayISO } from '../src/utils/ledger.js';

/* ร้านถาม: "ถ้าเราแยกงานแค่ชื่องาน เพื่อดูว่าเราได้กี่บาทต่อสัปดาห์" —
 * ยอดรายสัปดาห์แยกตามหมวดงาน ใช้กติกาเงินชุดเดียวกับใบลงบัญชีเป๊ะ:
 * นับเฉพาะงานที่รับเงินครบ ตามวันที่เงินเข้ามือจริง ไม่คิดเงินสูตรใหม่ (V2 §4)
 */

test('วันจันทร์ของสัปดาห์ — ปฏิทินไทยเริ่มจันทร์ อาทิตย์ยังนับเป็นสัปดาห์เดิม', () => {
  assert.equal(mondayISO('2026-11-16'), '2026-11-16'); // จันทร์เอง
  assert.equal(mondayISO('2026-11-19'), '2026-11-16'); // พฤหัส
  assert.equal(mondayISO('2026-11-22'), '2026-11-16'); // อาทิตย์ → จันทร์เดียวกัน
  assert.equal(mondayISO('2026-11-23'), '2026-11-23'); // จันทร์ถัดไป
});

test('ยอดสัปดาห์แยกตามหมวด: นับเฉพาะเงินที่เข้ามือจริงในสัปดาห์ หมวดทำเงินมากอยู่บน', () => {
  const jobs = [
    // ป้ายสองงาน จ่ายครบในสัปดาห์ (อังคาร + เสาร์) = ฿2,500
    { id: 'a', category: 'sign', total: 1500, paid_amount: 1500, balance_due: 0,
      paid_at: '2026-11-17T10:00:00+07:00', status: 'active' },
    { id: 'b', category: 'sign', total: 1000, paid_amount: 1000, balance_due: 0,
      paid_at: '2026-11-21T19:00:00+07:00', status: 'active' },
    // ตรายางงานเดียว ฿300 (ศุกร์)
    { id: 'c', category: 'stamp', total: 300, paid_amount: 300, balance_due: 0,
      paid_at: '2026-11-20T09:00:00+07:00', status: 'active' },
    // ยังค้างอยู่ — ไม่ใช่รายรับ (กติกาใบลงบัญชี)
    { id: 'd', category: 'sign', total: 900, paid_amount: 0, balance_due: 900,
      status: 'active', booked_at: '2026-11-18T09:00:00+07:00' },
    // จ่ายครบแต่คนละสัปดาห์
    { id: 'e', category: 'stamp', total: 700, paid_amount: 700, balance_due: 0,
      paid_at: '2026-11-10T09:00:00+07:00', status: 'active' },
    // ยกเลิกแล้ว
    { id: 'f', category: 'sign', total: 400, paid_amount: 400, balance_due: 0,
      paid_at: '2026-11-18T09:00:00+07:00', status: 'cancelled' },
    // ค่ำวันอาทิตย์ 23:00 ไทย — UTC เป็นวันจันทร์ถัดไปแล้ว ต้องยังอยู่สัปดาห์นี้
    { id: 'g', category: 'print', total: 200, paid_amount: 200, balance_due: 0,
      paid_at: '2026-11-22T23:00:00+07:00', status: 'active' },
  ];

  const wk = buildWeekByGroup(jobs, '2026-11-16');
  assert.equal(wk.start, '2026-11-16');
  assert.equal(wk.end, '2026-11-22');
  assert.equal(wk.days.length, 7);

  assert.equal(wk.total, 3000); // 2500 + 300 + 200
  assert.equal(wk.jobCount, 4);
  assert.deepEqual(wk.groups.map((g) => [g.id, g.jobCount, g.total]),
    [['sign', 2, 2500], ['stamp', 1, 300], ['print', 1, 200]]);
  // ป้ายชื่อหมวดมากับชุดหมวดจริง ไม่ใช่รหัส
  assert.equal(wk.groups[0].label, 'งานป้าย');
});

test('เส้นทาง /report/week ใช้กติกาเดิม: ไม่ส่ง start = จันทร์สัปดาห์นี้เวลาไทย', () => {
  const api = readFileSync(new URL('../src/routes/api.js', import.meta.url), 'utf8');
  assert.ok(api.includes("router.get('/report/week'"));
  assert.match(api, /mondayISO\(todayISO\(\)\)/);
  assert.match(api, /buildWeekByGroup\(await bookJobs\(req\.profile\.id\), start, '\+07:00'\)/);
});

test('หน้าแรกมีแถบสัปดาห์: แตะกาง เลื่อนสัปดาห์ก่อนได้ อนาคตกดไม่ได้ โหลดพังขีดไว้', () => {
  const dash = readFileSync(new URL('../public/liff/index.html', import.meta.url), 'utf8');
  assert.ok(dash.includes('id="wk-open"'));
  assert.match(dash, /api\('\/report\/week' \+ \(wkStart \? '\?start=' \+ wkStart : ''\)\)/);
  assert.match(dash, /\$\('wk-next'\)\.disabled = current;/);
  assert.match(dash, /wkShift\(wkStart, -7\)/);
  assert.match(dash, /\$\('wk-sum'\)\.textContent = '—';/, 'โหลดพังต้องขีดไว้ ไม่เดาเงิน');
});

test('หัวบัญชีลูกค้าบอกว่าสั่งกี่อย่าง (กี่หมวด) ตั้งแต่แรกเห็น', () => {
  const book = readFileSync(new URL('../public/liff/book/index.html', import.meta.url), 'utf8');
  assert.match(book, /\$\{account\.jobCount\} งาน · สั่ง \$\{account\.groups\.length\} หมวด/);
});
