import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { groupByMoney, moneyListText, moneyListMessage, MONEY_LABEL } from '../src/actions/moneyList.js';
import { moneyKind, statusPatch } from '../src/utils/jobState.js';
import { resolveMenuCommand } from '../src/utils/menuCommands.js';

/* ร้านขอ "แยกเงินสดกับลงบัญชีไว้เช็คงานอีกที" */

const NOW = new Date('2026-10-06T03:00:00Z');
const job = (id, total, change, over = {}) => {
  const base = { id, job_name: `งาน ${id}`, customer_name: `ลูกค้า ${id}`, status: 'active', total, paid_amount: 0, balance_due: total, payment_status: 'pending', ...over };
  return change ? { ...base, ...statusPatch(base, change, NOW) } : base;
};

const JOBS = [
  job('a', 1000, { money: 'cash' }),
  job('b', 2000, { money: 'transfer' }),
  job('c', 3000, { money: 'account' }),
  job('d', 400),
  job('e', 500, null, { paid_amount: 500, balance_due: 0, payment_status: 'paid' }), // งานเก่า ไม่รู้ช่องทาง
  job('f', 900, null, { paid_amount: 300, balance_due: 600, payment_status: 'partial' }), // มัดจำ = ยังไม่ได้รับครบ
  job('x', 700, { money: 'cash' }, { status: 'cancelled' }),
];

test('แยกกองเงิน: สด · โอน · ลงบัญชี · ยังไม่ได้รับ (รวมมัดจำ) · ไม่ระบุช่องทาง · ไม่นับที่ยกเลิก', () => {
  const g = groupByMoney(JOBS);
  assert.deepEqual(g.cash.map((j) => j.id), ['a']);
  assert.deepEqual(g.transfer.map((j) => j.id), ['b']);
  assert.deepEqual(g.account.map((j) => j.id), ['c']);
  assert.deepEqual(g.unpaid.map((j) => j.id).sort(), ['d', 'f']);
  assert.deepEqual(g.paid.map((j) => j.id), ['e']);
  assert.equal(moneyKind(JOBS[5]), 'unpaid');
});

test('ข้อความสรุปกอง: หัว ตัวเลขรวม และรายการ — กองค้างโชว์ยอดค้าง', () => {
  const g = groupByMoney(JOBS);
  const t = moneyListText('unpaid', g.unpaid);
  assert.match(t, /ยังไม่ได้รับเงิน — 2 งาน · รวม ฿1,300 · ค้าง ฿1,000/);
  assert.match(t, /1\. ลูกค้า d · งาน d ฿400/);
  assert.match(t, /2\. ลูกค้า f · งาน f ฿600/, 'ใบที่มัดจำแล้วโชว์ยอดที่ยังค้าง ไม่ใช่ยอดเต็ม');

  const cash = moneyListText('cash', g.cash);
  assert.match(cash, /เงินสด — 1 งาน · รวม ฿1,000/);
  assert.ok(!cash.includes('ค้าง'), 'กองเงินสดไม่มียอดค้าง');

  assert.match(moneyListText('account', []), /ไม่มีงานในกองนี้ค่ะ/);
});

test('รายการยาวเกินสิบ ตัดแล้วบอกว่ามีอีกกี่งาน', () => {
  const many = Array.from({ length: 13 }, (_, i) => job('j' + i, 100, { money: 'cash' }));
  const t = moneyListText('cash', many);
  assert.equal(t.split('\n').filter((l) => /^\d+\. /.test(l)).length, 10);
  assert.match(t, /และอีก 3 งาน/);
});

test('ปุ่มใต้ข้อความ: สลับไปกองอื่นพร้อมตัวเลข และไม่มีปุ่มของกองที่กำลังดูอยู่', () => {
  const g = groupByMoney(JOBS);
  const msg = moneyListMessage('account', g);
  const items = msg.quickReply.items;
  const datas = items.map((i) => i.action.data).filter(Boolean);
  assert.ok(datas.includes('action=money_list&k=cash'));
  assert.ok(datas.includes('action=money_list&k=transfer'));
  assert.ok(!datas.includes('action=money_list&k=account'));
  assert.ok(items.every((i) => i.action.label.length <= 20));
  assert.ok(items.length <= 13);

  // กองค้าง มีปุ่มพาไปตรวจทีละใบ
  assert.ok(moneyListMessage('unpaid', g).quickReply.items.some((i) => i.action.data === 'action=review_jobs'));
  // กอง "ไม่ระบุช่องทาง" ว่างอยู่ ไม่ต้องมีปุ่ม
  const none = moneyListMessage('cash', groupByMoney([job('a', 1000, { money: 'cash' })]));
  assert.ok(!none.quickReply.items.some((i) => i.action.data === 'action=money_list&k=paid'));
});

test('พิมพ์ได้: งานเงินสด / งานโอน / งานลงบัญชี / ยังไม่จ่าย', () => {
  assert.equal(resolveMenuCommand('งานเงินสด'), 'money_list&k=cash');
  assert.equal(resolveMenuCommand('ดูงานเงินสดหน่อย'), 'money_list&k=cash');
  assert.equal(resolveMenuCommand('งานโอน'), 'money_list&k=transfer');
  assert.equal(resolveMenuCommand('งานลงบัญชี'), 'money_list&k=account');
  assert.equal(resolveMenuCommand('ลงบัญชี'), 'money_list&k=account');
  assert.equal(resolveMenuCommand('ยังไม่จ่าย'), 'money_list&k=unpaid');
  assert.equal(MONEY_LABEL.account.includes('ลงบัญชี'), true);
});

test('หน้าแดชบอร์ดมีแถวแยกตามเงิน และรับ ?money= จากลิงก์', () => {
  const page = readFileSync(new URL('../public/liff/index.html', import.meta.url), 'utf8');
  for (const label of ['เงินสด', 'โอน', 'ลงบัญชี', 'ยังไม่ได้รับ', 'ไม่ระบุช่องทาง']) assert.ok(page.includes(label), label);
  assert.match(page, /id="t-queue-money"/);
  assert.match(page, /get\('money'\)/);
  assert.match(page, /function moneyKindOf\(job\)/);

  // กติกากองเดียวกับฝั่งเซิร์ฟเวอร์: ได้รับบางส่วน = ยังไม่ได้รับ
  assert.match(page, /m === 'partial' \? 'unpaid' : m/);

  const ledger = readFileSync(new URL('../public/liff/ledger/index.html', import.meta.url), 'utf8');
  assert.match(ledger, /id="g-account"/);
  assert.match(ledger, /id="g-unpaid"/);
  assert.match(ledger, /money=account/);
  assert.match(ledger, /money=unpaid/);
});
