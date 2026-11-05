import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNaturalJob, extractPayMethod } from '../src/utils/nlParser.js';
import { makeDraft } from '../src/utils/jobDraft.js';
import { createJob } from '../src/services/jobService.js';
import { createMockSupabase } from './helpers/mockSupabase.js';
import { parseExpense } from '../src/utils/expense.js';
import { parseStatusSpeak } from '../src/utils/statusSpeak.js';
import { parseQuickEdit } from '../src/utils/quickEdit.js';
import { buildLedger } from '../src/utils/ledger.js';
import { resolveMenuCommand } from '../src/utils/menuCommands.js';
import { expenseConfirmMessage } from '../src/actions/expense.js';
import { changeCode } from '../src/actions/statusSpeak.js';

/* ม่วงจด V2 — "พิมพ์น้อย จดไว เข้าใจงาน ไม่ต้องกรอกหลายช่อง"
 *
 * สี่ประโยคตัวอย่างของร้านคือสัญญาของชุดนี้:
 *   "อัดรูป 150 เงินสด"                         → รายรับ รับสดครบ ลงบัญชีวันนี้
 *   "ครูแอนสั่งป้าย ... มัดจำ 200 รับพรุ่งนี้"   → ลูกค้า/ราคา/มัดจำ/วันนัด (มีอยู่แล้ว)
 *   "ซื้อกระดาษ A4 350"                          → รายจ่าย
 *   "งานครูแอนเสร็จแล้ว"                         → เปลี่ยนสถานะตามชื่อ
 */

// --- ช่องทางเงินท้ายประโยค ---------------------------------------------------------

test('อัดรูป 150 เงินสด = รับสดครบ — ไม่ใช่ของชื่อ "อัดรูป เงินสด"', () => {
  const d = parseNaturalJob('อัดรูป 150 เงินสด');
  assert.equal(d.payMethod, 'cash');
  assert.equal(d.total, 150);
  assert.equal(d.paidAmount, 150, 'บอกช่องทางเฉย ๆ = รับครบแล้ว');
  assert.equal(d.items.length, 1);
  assert.ok(!d.items[0].item_name.includes('เงินสด'), 'คำว่าเงินสดไม่ติดไปในชื่อของ');

  const draft = makeDraft(d);
  assert.equal(draft.paymentStatus, 'paid');
  assert.equal(draft.payMethod, 'cash');
  assert.equal(draft.balanceDue, 0);
});

test('คำช่องทางแบบอื่น ๆ ที่ร้านพิมพ์จริง', () => {
  assert.equal(parseNaturalJob('ป้ายไวนิล 60x100 600 โอน').payMethod, 'transfer');
  assert.equal(parseNaturalJob('ตรายาง 300 จ่ายสด').payMethod, 'cash');
  assert.equal(parseNaturalJob('ตรายาง 300 สด').payMethod, 'cash');
  assert.equal(parseNaturalJob('สติ๊กเกอร์ 250 พร้อมเพย์').payMethod, 'transfer');
  const booked = parseNaturalJob('ป้าย 500 ลงบัญชี');
  assert.equal(booked.payMethod, 'account');
  assert.equal(booked.paidAmount, 0, 'ลงบัญชี = ยังไม่ได้เงิน ไม่ใช่รับครบ');
  // โอนเงินครบแล้ว (วลีจ่ายครบของเดิม) ก็รู้ช่องทาง
  const full = parseNaturalJob('กรอบรูป 450 โอนเงินแล้ว');
  assert.equal(full.payMethod, 'transfer');
  assert.equal(full.paidAmount, 450);
});

test('มัดจำ + ช่องทาง: ยอดมัดจำชนะ ไม่กลายเป็นรับครบ', () => {
  const d = parseNaturalJob('ป้าย 2x1 600 มัดจำ 200 เงินสด');
  assert.equal(d.paidAmount, 200);
  assert.equal(d.payMethod, 'cash');
  // โอนแล้ว 300 = มัดจำ 300 ทางโอน (ของเดิม + ช่องทางใหม่)
  const t = parseNaturalJob('โฟมบอร์ด 900 โอนแล้ว 300');
  assert.equal(t.paidAmount, 300);
  assert.equal(t.payMethod, 'transfer');
});

test('ไม่มีคำช่องทาง = เหมือนเดิมทุกอย่าง และคำที่คล้ายไม่โดนกิน', () => {
  const d = parseNaturalJob('ป้ายไวนิล 60x100 150 บาท');
  assert.equal(d.payMethod, null);
  assert.equal(d.paidAmount, 0);
  // "สด" ที่เป็นส่วนของคำอื่น ไม่ใช่ช่องทาง
  const fresh = parseNaturalJob('ป้ายอาหารสด 300');
  assert.equal(fresh.payMethod, null);
  assert.ok(fresh.items[0].item_name.includes('สด'), 'ชื่อของไม่โดนตัด');
  assert.deepEqual(extractPayMethod('โอนแล้ว 300'), { method: null, rest: 'โอนแล้ว 300' });
});

test('createJob: เงินสดครบ → pay_method + booked_at (เข้าใบลงบัญชีวันนี้เลย)', async () => {
  const db = createMockSupabase();
  const job = await createJob('u1', makeDraft(parseNaturalJob('อัดรูป 150 เงินสด')), db);
  assert.equal(job.pay_method, 'cash');
  assert.ok(job.booked_at, 'ต้องลงบัญชีทันที ไม่ต้องไปกดซ้ำ');
  assert.equal(job.payment_status, 'paid');

  const led = buildLedger([job], new Date().toISOString().slice(0, 10));
  assert.equal(led.total, 150, 'โผล่เป็นรายรับของวันนี้');
  assert.equal(led.methods[0].id, 'cash');
});

test('createJob: มัดจำสด → ได้ช่องทางแต่ยังไม่ลงบัญชี · ลงบัญชี → booked อย่างเดียว', async () => {
  const db = createMockSupabase();
  const part = await createJob('u1', makeDraft(parseNaturalJob('ป้าย 600 มัดจำ 200 เงินสด')), db);
  assert.equal(part.pay_method, 'cash');
  assert.ok(!part.booked_at, 'ยังค้างอยู่ ไม่ใช่รายรับเต็มของวันนี้');

  const booked = await createJob('u1', makeDraft(parseNaturalJob('ป้าย 500 ลงบัญชี')), db);
  assert.ok(booked.booked_at);
  assert.ok(!booked.pay_method, 'ยังไม่รู้ว่าจะจ่ายสดหรือโอน');
  const led = buildLedger([booked], new Date().toISOString().slice(0, 10));
  assert.equal(led.total, 0);
  assert.equal(led.carry.account.jobCount, 1, 'ไปอยู่กองลงบัญชีไว้ (ค้างจ่าย)');
});

// --- รายจ่าย ----------------------------------------------------------------------

test('ซื้อกระดาษ A4 350 = รายจ่าย', () => {
  assert.deepEqual(parseExpense('ซื้อกระดาษ A4 350'), { item: 'ซื้อกระดาษ A4', amount: 350, payMethod: null });
  assert.deepEqual(parseExpense('จ่ายค่าไฟ 1,200 โอน'), { item: 'ค่าไฟ', amount: 1200, payMethod: 'transfer' });
  assert.deepEqual(parseExpense('เติมหมึกปริ้นเตอร์ 450 เงินสด'), { item: 'เติมหมึกปริ้นเตอร์', amount: 450, payMethod: 'cash' });
  assert.deepEqual(parseExpense('รายจ่าย ค่าน้ำ 230'), { item: 'ค่าน้ำ', amount: 230, payMethod: null });
  assert.equal(parseExpense('ซื้อกระดาษ A4 350 บาท').amount, 350);
});

test('สิ่งที่ไม่ใช่รายจ่าย ต้องไม่โดนคว้า', () => {
  for (const t of [
    'ป้ายไวนิล 60x100 350',      // งานของลูกค้า
    'ค่าส่ง 50',                  // รายรับค่าส่งในใบงาน — เงินไหลคนละทาง
    'ค่ารถ 100',
    'ซื้อกระดาษ',                 // ไม่มีจำนวนเงิน
    'ซื้อ 350',                   // ไม่มีของ
    'ครูแอนซื้อป้าย 600',         // ลูกค้าซื้อ = รายรับ (ไม่ได้ขึ้นต้นด้วยซื้อ)
    'ซื้อกระดาษ 350\nป้าย 150',   // หลายบรรทัดคือใบงาน
  ]) {
    assert.equal(parseExpense(t), null, t);
  }
});

test('การ์ดยืนยันรายจ่าย: ข้อมูลครบอยู่บนปุ่ม ไม่พึ่งสเตต', () => {
  const msg = expenseConfirmMessage({ item: 'ซื้อกระดาษ A4', amount: 350, payMethod: 'cash' });
  const json = JSON.stringify(msg);
  assert.ok(json.includes('ซื้อกระดาษ A4'));
  assert.ok(json.includes('฿350'));
  assert.ok(json.includes('เงินสด'));
  assert.ok(json.includes('action=exp_save&i=' + encodeURIComponent('ซื้อกระดาษ A4') + '&a=350&m=cash'));
  assert.ok(json.includes('action=exp_cancel'));
  const data = /action=exp_save[^"]*/.exec(json)[0];
  assert.ok(data.length <= 300, 'postback ของ LINE ยาวได้ 300 ตัว');
});

test('ใบลงบัญชี: รายจ่ายกับคงเหลือ', () => {
  const led = buildLedger([], '2026-10-09', '+07:00', {
    expenses: [
      { id: 'e1', item: 'ซื้อกระดาษ A4', amount: 350, pay_method: 'cash', status: 'active' },
      { id: 'e2', item: 'ค่าไฟ', amount: 1200, pay_method: 'transfer', status: 'active' },
      { id: 'e3', item: 'ลบไปแล้ว', amount: 99, pay_method: null, status: 'cancelled' },
    ],
  });
  assert.equal(led.expense.count, 2, 'ที่ลบแล้วไม่นับ');
  assert.equal(led.expense.total, 1550);
  assert.equal(led.net, -1550, 'ยังไม่มีรายรับ คงเหลือติดลบตามจริง');
  assert.deepEqual(buildLedger([], '2026-10-09').expense, { rows: [], total: 0, count: 0 });
});

// --- เปลี่ยนสถานะด้วยประโยคพูด -------------------------------------------------------

test('งานครูแอนเสร็จแล้ว: อ่านชื่อกับสถานะออก', () => {
  assert.deepEqual(parseStatusSpeak('งานครูแอนเสร็จแล้ว'), { name: 'ครูแอน', change: { done: true }, ask: null, label: '✓ ทำเสร็จแล้ว' });
  assert.deepEqual(parseStatusSpeak('ครูแอนมารับแล้ว').change, { picked: true });
  assert.deepEqual(parseStatusSpeak('รร.สบกอนจ่ายสดแล้ว').change, { money: 'cash' });
  assert.deepEqual(parseStatusSpeak('ครูแอน โอนแล้ว').change, { money: 'transfer' });
  assert.deepEqual(parseStatusSpeak('งานป้ายครูแอนลงบัญชีแล้ว').change, { money: 'account' });
  // จ่ายแล้วเฉย ๆ — ได้เงินจริง แต่สด/โอนต้องถามต่อ ไม่เดา
  const paid = parseStatusSpeak('ครูแอนจ่ายแล้ว');
  assert.equal(paid.ask, 'method');
  assert.equal(changeCode(paid), 'ask');
});

test('ประโยคที่ห้ามคว้า: ไม่มีชื่อ มีตัวเลข หรือเป็นการจดงาน', () => {
  for (const t of [
    'เสร็จแล้ว',                       // ไม่มีชื่อ = กำกวม
    'จ่ายแล้ว',
    'กรอบรูป 2 อัน จ่ายแล้ว',          // มีตัวเลข = จดงานใหม่ (ของเดิมต้องไม่พัง)
    'ป้ายไวนิล 60x100 150 จ่ายสดแล้ว',
  ]) {
    assert.equal(parseStatusSpeak(t), null, t);
  }
});

// --- แก้ใบล่าสุดด้วยประโยคเดียว ------------------------------------------------------

test('แก้ราคาเป็น 650: อ่านออก และเรื่องเงินต้องผ่านการยืนยัน', () => {
  assert.deepEqual(parseQuickEdit('แก้ราคาเป็น 650'), { field: 'total', value: 650, fieldLabel: 'ราคา' });
  assert.deepEqual(parseQuickEdit('แก้ยอดรวมเป็น 1,250'), { field: 'total', value: 1250, fieldLabel: 'ราคา' });
  assert.deepEqual(parseQuickEdit('แก้มัดจำเป็น 300'), { field: 'paid', value: 300, fieldLabel: 'ยอดที่รับมาแล้ว' });
  assert.deepEqual(parseQuickEdit('แก้ลูกค้าเป็น รร.สบกอน'), { field: 'customer', value: 'รร.สบกอน', fieldLabel: 'ชื่อลูกค้า' });
  assert.deepEqual(parseQuickEdit('แก้ชื่องานเป็น ป้ายหน้าร้าน'), { field: 'jobName', value: 'ป้ายหน้าร้าน', fieldLabel: 'ชื่องาน' });
});

test('คำสั่งแก้ของเดิมต้องไม่โดนคว้า', () => {
  for (const t of ['แก้ไขล่าสุด', 'แก้ล่าสุด', 'แก้สถานะ', 'แก้ไขหมวด', 'แก้ราคา', 'แก้ราคาเป็น ศูนย์']) {
    assert.equal(parseQuickEdit(t), null, t);
  }
});

// --- ต่อสายและเมนู -------------------------------------------------------------------

const handler = readFileSync(new URL('../src/handlers/messageHandler.js', import.meta.url), 'utf8');
const postback = readFileSync(new URL('../src/handlers/postbackHandler.js', import.meta.url), 'utf8');
const home = readFileSync(new URL('../src/flex/homeFlex.js', import.meta.url), 'utf8');

test('ลำดับการอ่านข้อความ: เมนู → เพิ่มหมวด → รายจ่าย → ประโยคสถานะ → แก้ไว → ก่อนอ่านเป็นงาน', () => {
  const at = (needle) => {
    const i = handler.indexOf(needle);
    assert.ok(i > 0, `ไม่เจอ ${needle}`);
    return i;
  };
  const order = [
    'resolveMenuCommand(text)',
    'parseAddCategory(text)',
    'parseExpense(text)',
    'parseStatusSpeak(text)',
    'parseQuickEdit(text)',
    'splitLeadingAddJob(text)',
    'getState(profile.id)',
  ];
  for (let i = 1; i < order.length; i += 1) {
    assert.ok(at(order[i - 1]) < at(order[i]), `${order[i - 1]} ต้องมาก่อน ${order[i]}`);
  }
});

test('postback รู้จักทุกปุ่มใหม่ของ V2', () => {
  for (const action of ['exp_save', 'exp_cancel', 'expense_list', 'exp_del', 'exp_del_yes', 'money_note', 'sbn', 'qe', 'qe_cancel']) {
    assert.match(postback, new RegExp(`case '${action}':`), `ไม่มี case ${action}`);
  }
});

test('คำสั่งเมนูใหม่', () => {
  assert.equal(resolveMenuCommand('จดรายรับรายจ่าย'), 'money_note');
  assert.equal(resolveMenuCommand('จดรายจ่าย'), 'money_note');
  assert.equal(resolveMenuCommand('รายจ่ายวันนี้'), 'expense_list');
  assert.equal(resolveMenuCommand('รายจ่าย'), 'expense_list');
  assert.equal(resolveMenuCommand('สรุปยอดร้าน'), 'today_summary');
  assert.equal(resolveMenuCommand('จดงานใหม่'), 'add_job');
  // ของเดิมไม่ขยับ
  assert.equal(resolveMenuCommand('รายงาน'), 'report_menu');
  assert.equal(resolveMenuCommand('รายการล่าสุด'), 'recent_jobs');
});

test('หน้าแรก 4 เมนูหลัก อยู่ใน homeFlex จริง', () => {
  for (const label of ['จดงานใหม่', 'จดรายรับ–รายจ่าย', 'งานวันนี้', 'สรุปยอดร้าน']) {
    assert.ok(home.includes(label), `ไม่มีปุ่ม ${label}`);
  }
});
