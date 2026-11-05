import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { customerCardMessage, parseCardAsk } from '../src/actions/customerCard.js';
import { moveCategoryGroupsFlex, categoryJobsFlex } from '../src/flex/categoryPickerFlex.js';
import { BASE_TAXONOMY } from '../src/utils/category.js';

/* การ์ดลูกค้ารายคน — ร้านขอ "ลูกค้าคนไหนที่มีงานหลายชิ้น คนละอย่าง ช่วยแสดง
 * ทั้งหมดด้วย บางอย่างชื่อเดียวกันแต่ขอแยกจ่าย"
 *
 * แถวละงานเสมอ งานชื่อซ้ำแยกด้วยเลขงาน+วันที่ ใบค้างมีปุ่มเก็บเงินของตัวเอง
 */

const T = (d) => `${d}T05:00:00.000Z`;
let seq = 0;
const job = (over = {}) => {
  seq += 1;
  return {
    id: `j${seq}`,
    job_number: `MJ-PRT-000${seq}`,
    job_name: 'ถ่ายเอกสาร',
    customer_name: 'รร.สบกอน',
    job_date: '2026-10-10',
    status: 'active',
    total: 120,
    paid_amount: 0,
    balance_due: 120,
    payment_status: 'pending',
    booked_at: T('2026-10-10'),
    category: 'print',
    category_type: 'print',
    bill_id: null,
    ...over,
  };
};

test('งานชื่อเดียวกันสองใบ แยกแถวกันชัด และต่างใบต่างมีปุ่มเก็บเงินของตัวเอง', () => {
  seq = 0;
  const jobs = [
    job(), // ถ่ายเอกสาร ใบที่ 1 — ค้าง
    job({ job_date: '2026-10-11' }), // ถ่ายเอกสาร ใบที่ 2 ชื่อซ้ำ — ค้าง
    job({ job_name: 'ป้ายไวนิล', total: 950, paid_amount: 950, balance_due: 0, payment_status: 'paid', bill_id: 'b1' }),
  ];

  const msg = customerCardMessage(jobs, 'รร.สบกอน');
  assert.equal(msg.type, 'flex');
  assert.match(msg.altText, /รร\.สบกอน — 3 งาน · ค้าง ฿240/);

  const flat = JSON.stringify(msg.contents);
  // ครบทุกใบ และใบชื่อซ้ำแยกกันด้วยเลขงาน
  assert.match(flat, /MJ-PRT-0001/);
  assert.match(flat, /MJ-PRT-0002/);
  assert.match(flat, /MJ-PRT-0003/);
  // แยกจ่ายรายใบ: ปุ่ม sbn ของใบค้างแต่ละใบ (กติกาเงินอยู่ที่ statusPatch เดิม)
  assert.match(flat, /action=sbn&id=j1&c=cash/);
  assert.match(flat, /action=sbn&id=j1&c=transfer/);
  assert.match(flat, /action=sbn&id=j2&c=cash/);
  // ใบที่จ่ายแล้วไม่มีปุ่มเก็บ แต่บอกสถานะ (และบอกว่าออกใบแล้ว)
  assert.ok(!flat.includes('action=sbn&id=j3'));
  assert.match(flat, /จ่ายแล้ว · ออกใบแล้ว/);
});

test('สะกดต่างเจ้าเดียวกันก็เปิดการ์ดได้ (accountKey เดียวกับสมุดลูกค้า)', () => {
  seq = 0;
  const jobs = [job(), job({ job_date: '2026-10-11' })];
  const msg = customerCardMessage(jobs, 'รร สบกอน'); // ไม่มีจุด
  assert.ok(msg, 'สะกดไม่ตรงตัวอักษรเป๊ะต้องยังเจอ');
  assert.match(msg.altText, /2 งาน/);
  assert.equal(customerCardMessage(jobs, 'คนที่ไม่เคยจด'), null);
});

test('งานเกินหนึ่งใบการ์ด → ต่อเป็น carousel ไม่ตัดใครทิ้ง (เกินเพดานค่อยชี้ไปสมุด)', () => {
  seq = 0;
  const jobs = Array.from({ length: 8 }, (_, i) => job({ job_date: `2026-10-0${(i % 7) + 1}` }));
  const msg = customerCardMessage(jobs, 'รร.สบกอน');
  assert.equal(msg.contents.type, 'carousel');
  assert.equal(msg.contents.contents.length, 2, '8 งาน = 6+2 สองใบการ์ด');
  const flat = JSON.stringify(msg.contents);
  for (let i = 1; i <= 8; i += 1) assert.ok(flat.includes(`MJ-PRT-000${i}`), `ใบที่ ${i} หาย`);
  assert.match(flat, /\(ต่อ\)/);
});

test('ปุ่มออกบิลโผล่เมื่อยังมีค้าง และ postback ไม่ทะลุเพดาน 300', () => {
  seq = 0;
  const msg = customerCardMessage([job()], 'รร.สบกอน');
  const flat = JSON.stringify(msg.contents);
  assert.match(flat, /action=create_bill&customer=/);
  for (const m of flat.matchAll(/"data":"([^"]+)"/g)) {
    assert.ok(m[1].length <= 300, `postback ยาวเกิน: ${m[1].slice(0, 40)}…`);
  }

  // ชื่อยาวจน encode เกินเพดาน → ไม่มีปุ่มบิล (ยังดูในสมุดได้ ไม่พัง)
  seq = 0;
  const longName = 'โรงเรียนเทศบาลเมืองเชียงใหม่วิทยาคมอนุสรณ์'; // > 28 ตัวอักษรไทย
  const long = customerCardMessage([job({ customer_name: longName })], longName);
  assert.ok(!JSON.stringify(long.contents).includes('create_bill'), 'ปุ่มบิลชื่อยาวจะยิง postback ไม่ผ่าน');
});

test('เกตพิมพ์ชื่อ อยู่หลังจับงานทั้งใบ แต่ก่อนชุดคำถาม — ชื่อที่มีคำช่างปนต้องเปิดการ์ด', () => {
  const src = readFileSync(new URL('../src/handlers/messageHandler.js', import.meta.url), 'utf8');
  const wholeJob = src.indexOf('looksLikeJob(text) || looksLikePricelessJob(text)', src.indexOf('// Idle:'));
  const gate = src.indexOf('customerCardForText({ replyToken, profile }, text)');
  const collect = src.indexOf('startCollectFlow(replyToken, profile, collecting)', gate);
  assert.ok(wholeJob > -1 && gate > wholeJob, 'งานทั้งใบ (มีตัวเลข/ราคา) ต้องชนะชื่อเสมอ');
  assert.ok(collect > gate, 'ลูกค้าชื่อ "ร้านป้ายเจริญ" ต้องเปิดการ์ด ไม่ใช่โดน "ป้าย" ดักเริ่มจดงาน');
});

/* ย้ายงานข้ามหมวด — "เลือกหางานในหมวดแล้วย้ายได้" */

test('ย้ายหมวด: การ์ดหมวด → การ์ดงานในหมวด (เลขงาน+วันที่กำกับ) → ตัวเลือกหมวดเดิม', () => {
  const groups = moveCategoryGroupsFlex(BASE_TAXONOMY);
  const gflat = JSON.stringify(groups);
  assert.match(gflat, /action=cat_jobs&group=print/);
  assert.match(gflat, /action=cat_jobs&group=other/, 'งานทั่วไป (GEN) ต้องย้ายออกได้ — เคสการ์ดแต่งงานของจริง');

  seq = 0;
  const inGroup = [job(), job({ job_name: 'การ์ดแต่งงาน', total: 7400 })];
  const card = categoryJobsFlex(BASE_TAXONOMY.findGroup('print'), inGroup, {
    formatDate: (d) => d,
    formatMoney: (n) => `฿${n}`,
  });
  const flat = JSON.stringify(card);
  assert.match(flat, /action=pick_category&jobId=j1/);
  assert.match(flat, /action=pick_category&jobId=j2/);
  assert.match(flat, /MJ-PRT-0001 · 2026-10-10 · ฿120/, 'แถวไม่มีเลขงาน/วันที่กำกับ');

  const empty = JSON.stringify(categoryJobsFlex(BASE_TAXONOMY.findGroup('stamp'), []));
  assert.match(empty, /หมวดนี้ยังไม่มีงานค่ะ/);
});

/* ร้านสอนประโยคมาเอง: "พิมพ์ว่า ขอดูงานของโรงเรียนบ้านห้วยฟอง ก็ลิสขึ้นมาให้ดูเลย" */
test('ขอดูงานของ… ดึงชื่อออกมาเปิดการ์ด และเกตต้องมาก่อนตัวทายจดงาน', () => {
  assert.deepEqual(parseCardAsk('ขอดูงานของโรงเรียนบ้านห้วยฟอง'), { name: 'โรงเรียนบ้านห้วยฟอง', explicit: true });
  assert.deepEqual(parseCardAsk('ดูงานของ อบต.ผาทอง'), { name: 'อบต.ผาทอง', explicit: true });
  assert.deepEqual(parseCardAsk('งานของคุณนก'), { name: 'คุณนก', explicit: true });
  // ไม่มี "ของ" = เดา: เจอก็เปิดการ์ด ไม่เจอปล่อยไหลตามทางเดิม
  assert.deepEqual(parseCardAsk('ดูงาน ครูแนน'), { name: 'ครูแนน', explicit: false });
  // คำสั่งเดิมห้ามโดนแย่ง: มุมมองรายร้าน (เขียนติดกัน) กับงานค้าง
  assert.equal(parseCardAsk('ดูงานเชียงกลาง'), null);
  assert.equal(parseCardAsk('ขอดูงานค้าง'), null);
  assert.equal(parseCardAsk('จดงานของเดิม'), null);

  // ในแชต เกตนี้อยู่ก่อน looksLikeJob — "ขอดูงานของโรงเรียน…" มีทั้งคำว่า งาน
  // และชื่อหน่วยงาน ถ้าไปอยู่หลัง จะโดนทายเป็นจดงานใหม่ชื่อประหลาด
  const handler = readFileSync(new URL('../src/handlers/messageHandler.js', import.meta.url), 'utf8');
  const gate = handler.indexOf('parseCardAsk(text)');
  const guess = handler.indexOf('if (looksLikeJob(text) || looksLikePricelessJob(text))');
  assert.ok(gate > 0 && gate < guess, 'เกต ขอดูงานของ ต้องมาก่อนตัวทายจดงาน');
  // บอกชัดว่า "ของใคร" แล้วไม่เจอ ต้องตอบตรง ๆ ไม่เงียบไหลไปทางอื่น
  assert.match(handler, /ยังไม่เจอลูกค้าชื่อ/);
});
