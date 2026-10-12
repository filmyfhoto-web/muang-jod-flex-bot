import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { paidAtPatch } from '../src/utils/payment.js';
import { statusPatch } from '../src/utils/jobState.js';
import { buildLedger, receivedDate, moneyToday } from '../src/utils/ledger.js';
import { groupByMoney, moneyListMessage, accountListFlex } from '../src/actions/moneyList.js';
import { resolveMenuCommand } from '../src/utils/menuCommands.js';
import { dashboardFlex } from '../src/flex/dashboardFlex.js';
import { jobCreateSchema } from '../src/utils/validation.js';

/* แยก "งานลงบัญชี (รอเก็บ)" กับ "เก็บเงินแล้ว" — ร้านขอตรง ๆ ว่า
 * "อยากให้แยก งานลงบัญชี กับเก็บเงินสดแล้ว"
 *
 * ของเดิมพอตามเก็บเงินงานลงบัญชีได้ ระบบลืมว่าเคยลงบัญชี แถมเอารายรับไปขึ้น
 * ย้อนหลังวันที่ลงบัญชีไว้ (booked_at) — เปิด "เงินวันนี้" แล้วไม่เห็นเงินที่เพิ่ง
 * รับมาหมาด ๆ ชุดนี้ปักกติกาใหม่: paid_at คือวันเก็บเงินจริง และใบลงบัญชี
 * นับรายรับตามวันนั้น (ของเก่าไม่มี paid_at ใช้วันลงบัญชีแบบเดิม ไม่เดา)
 */

const T = (d) => `${d}T05:00:00.000Z`; // เที่ยงเมืองไทยของวันนั้น

const accountJob = (over = {}) => ({
  id: 'j1',
  job_number: 'MJ-SIGN-0001',
  job_name: 'ป้ายไวนิล',
  customer_name: 'รร.สบกอน',
  status: 'active',
  total: 1000,
  paid_amount: 0,
  balance_due: 1000,
  payment_status: 'pending',
  booked_at: T('2026-10-01'),
  pay_method: null,
  paid_at: null,
  ...over,
});

test('paidAtPatch: เพิ่งครบประทับ · ครบอยู่แล้วไม่ขยับ · หลุดจากครบล้างทิ้ง · ไม่แตะเรื่องเงินไม่ยุ่ง', () => {
  const now = new Date(T('2026-10-12'));
  assert.deepEqual(paidAtPatch({}, { payment_status: 'paid' }, now), { paid_at: T('2026-10-12') });
  assert.deepEqual(paidAtPatch({ paid_at: T('2026-10-05') }, { payment_status: 'paid' }, now), {});
  assert.deepEqual(paidAtPatch({ paid_at: T('2026-10-05') }, { payment_status: 'pending' }, now), { paid_at: null });
  assert.deepEqual(paidAtPatch({ paid_at: T('2026-10-05') }, { payment_status: 'partial' }, now), { paid_at: null });
  assert.deepEqual(paidAtPatch({}, { payment_status: 'pending' }, now), {});
  assert.deepEqual(paidAtPatch({ paid_at: T('2026-10-05') }, { note: 'x' }, now), {});
});

test('statusPatch: เก็บเงินงานลงบัญชี → ประทับวันเก็บจริง โดย booked_at เดิมไม่ขยับ', () => {
  const job = accountJob();
  const now = new Date(T('2026-10-12'));
  const patch = statusPatch(job, { money: 'cash' }, now);
  assert.equal(patch.paid_at, T('2026-10-12'));
  assert.equal(patch.booked_at, T('2026-10-01'), 'ประวัติวันลงบัญชีต้องอยู่ครบ');
  assert.equal(patch.pay_method, 'cash');
  assert.equal(patch.payment_status, 'paid');

  // กดซ้ำบนงานที่เก็บแล้ว — วันเก็บจริงต้องไม่เลื่อน
  const again = statusPatch({ ...job, ...patch }, { money: 'cash' }, new Date(T('2026-10-15')));
  assert.equal(again.paid_at, undefined, 'มี paid_at แล้วต้องไม่ส่งค่าใหม่มาทับ');

  // แก้กลับเป็นลงบัญชี (ยังไม่ได้เงิน) — วันเก็บต้องถูกล้าง ไม่งั้นเงินผีโผล่ในใบลงบัญชี
  const undo = statusPatch({ ...job, ...patch }, { money: 'account' }, new Date(T('2026-10-15')));
  assert.equal(undo.paid_at, null);
  assert.equal(undo.payment_status, 'pending');
});

test('ใบลงบัญชี: เงินที่ตามเก็บได้ ขึ้นวันที่เก็บจริง ไม่ย้อนไปวันลงบัญชี', () => {
  const collectedJob = accountJob({
    paid_amount: 1000,
    balance_due: 0,
    payment_status: 'paid',
    pay_method: 'cash',
    paid_at: T('2026-10-12'),
  });

  const dayCollect = buildLedger([collectedJob], '2026-10-12');
  assert.equal(dayCollect.total, 1000);
  assert.equal(dayCollect.rows[0].fromAccount, true, 'ต้องติดป้ายว่าเป็นเงินบัญชีเก่า');
  assert.deepEqual(dayCollect.collected, { jobCount: 1, total: 1000 });

  const dayBooked = buildLedger([collectedJob], '2026-10-01');
  assert.equal(dayBooked.total, 0, 'วันลงบัญชีไม่ใช่วันรับเงิน — ห้ามมีรายรับ');
  assert.equal(dayBooked.carry.jobCount, 0, 'จ่ายครบแล้ว ไม่ใช่ยอดยกไปด้วย');

  // งานจ่ายครบวันเดียวกับที่ลงบัญชี (จดแบบจ่ายสดปกติ) — ไม่ใช่เงินบัญชีเก่า
  const sameDay = accountJob({
    booked_at: T('2026-10-12'),
    paid_at: T('2026-10-12'),
    paid_amount: 1000,
    balance_due: 0,
    payment_status: 'paid',
    pay_method: 'cash',
  });
  const led = buildLedger([sameDay], '2026-10-12');
  assert.equal(led.rows[0].fromAccount, false);
  assert.deepEqual(led.collected, { jobCount: 0, total: 0 });
});

test('งานเก่าก่อนมี paid_at: พฤติกรรมเดิมเป๊ะ — ใช้วันลงบัญชี ไม่เดาวันเก็บ', () => {
  const legacy = accountJob({
    paid_amount: 1000,
    balance_due: 0,
    payment_status: 'paid',
    pay_method: 'cash',
    paid_at: null,
  });
  assert.equal(receivedDate(legacy), '2026-10-01');
  assert.equal(buildLedger([legacy], '2026-10-01').total, 1000);
  assert.equal(buildLedger([legacy], '2026-10-12').total, 0);
  assert.deepEqual(buildLedger([legacy], '2026-10-01').collected, { jobCount: 0, total: 0 });
});

test('moneyToday: สามก้อนครบ — สด/โอน · เก็บจากบัญชีเก่า · ลงบัญชีวันนี้+ค้างสะสม', () => {
  const jobs = [
    // เก็บบัญชีเก่าได้วันนี้เป็นเงินสด 1,000
    accountJob({ paid_amount: 1000, balance_due: 0, payment_status: 'paid', pay_method: 'cash', paid_at: T('2026-10-12') }),
    // งานวันนี้ จ่ายโอนครบ 500
    accountJob({ id: 'j2', total: 500, paid_amount: 500, balance_due: 0, payment_status: 'paid', pay_method: 'transfer', booked_at: T('2026-10-12'), paid_at: T('2026-10-12') }),
    // ลงบัญชีไว้วันนี้ ยังไม่ได้เงิน 700
    accountJob({ id: 'j3', total: 700, balance_due: 700, booked_at: T('2026-10-12') }),
    // ลงบัญชีค้างมาจากวันก่อน 900
    accountJob({ id: 'j4', total: 900, balance_due: 900 }),
  ];
  const m = moneyToday(jobs, '2026-10-12');
  assert.equal(m.received, 1500);
  assert.equal(m.cash, 1000);
  assert.equal(m.transfer, 500);
  assert.deepEqual(m.collected, { jobCount: 1, total: 1000 });
  assert.deepEqual(m.bookedToday, { jobCount: 1, total: 700 });
  assert.deepEqual(m.accountCarry, { jobCount: 2, owed: 1600 });
});

test('กองลงบัญชีเป็นการ์ดกดเก็บเงินได้ — ปุ่ม 💵/🏦 คือ sbn เดิม ไม่มีกติกาเงินชุดที่สอง', () => {
  const jobs = [accountJob(), accountJob({ id: 'j2', customer_name: 'อบต.เชียงกลาง', total: 900, balance_due: 900 })];
  const groups = groupByMoney(jobs);
  const msg = moneyListMessage('account', groups, { collected: { jobCount: 1, total: 600 } });

  assert.equal(msg.type, 'flex');
  assert.match(msg.altText, /ลงบัญชีไว้ \(รอเก็บ\) 2 งาน/);
  const flat = JSON.stringify(msg.contents);
  assert.match(flat, /action=sbn&id=j1&c=cash/);
  assert.match(flat, /action=sbn&id=j1&c=transfer/);
  assert.match(flat, /action=sbn&id=j2&c=cash/);
  assert.match(flat, /เก็บจากบัญชีได้วันนี้ 1 งาน/);
  assert.ok(msg.quickReply.items.length >= 2, 'ปุ่มสลับกองเงินเดิมต้องยังอยู่');
  for (const item of msg.quickReply.items) {
    if (item.action.type === 'postback') assert.ok(item.action.data.length <= 300);
  }

  // เรียงค้างมากอยู่บน และตัดที่ 5 แถวพร้อมบอกว่ามีต่อ
  const many = Array.from({ length: 7 }, (_, i) => accountJob({ id: `m${i}`, balance_due: 100 + i }));
  const bubble = accountListFlex(many);
  const body = JSON.stringify(bubble.body);
  assert.match(body, /และอีก 2 งาน/);
  assert.ok(body.indexOf('id=m6') >= 0 && body.indexOf('id=m6') < body.indexOf('id=m2'), 'ค้างมากสุดต้องขึ้นก่อน');
  assert.ok(!body.includes('id=m0'), 'ค้างน้อยสุดถูกพับไว้หลัง "ดูทั้งหมดในเว็บ"');

  // กองว่าง = ข้อความเดิม + บรรทัดเก็บได้วันนี้ถ้ามี
  const empty = moneyListMessage('account', groupByMoney([]), { collected: { jobCount: 2, total: 1500 } });
  assert.equal(empty.type, 'text');
  assert.match(empty.text, /ไม่มีงานในกองนี้/);
  assert.match(empty.text, /เก็บจากบัญชีได้วันนี้ 2 งาน/);
});

test('คำที่ร้านพิมพ์จริง: เก็บเงินแล้ว/รอเก็บ/ตามเก็บ → กองลงบัญชี · เงินวันนี้/วันนี้ → สรุปวันนี้', () => {
  for (const word of ['เก็บเงินแล้ว', 'รอเก็บ', 'งานรอเก็บ', 'ตามเก็บ', 'เก็บเงินแล้วค่ะ']) {
    assert.equal(resolveMenuCommand(word), 'money_list&k=account', word);
  }
  for (const word of ['เงินวันนี้', 'ยอดวันนี้', 'วันนี้', 'ดูเงินวันนี้หน่อย']) {
    assert.equal(resolveMenuCommand(word), 'today_summary', word);
  }
  // "‹ชื่อ›เก็บเงินแล้ว" ไม่ใช่คำสั่งเมนู — ยังเป็นประโยคเปลี่ยนสถานะของ statusSpeak
  assert.equal(resolveMenuCommand('ครูแอนเก็บเงินแล้ว'), null);
  // คำถามยาวยังเป็นคำถาม ไม่โดน "วันนี้" ดัก
  assert.equal(resolveMenuCommand('วันนี้มีงานอะไรบ้าง'), null);
});

test('การ์ดสรุปวันนี้: มีแถวเงินเข้า/เก็บบัญชีเก่า/ลงบัญชี เมื่อส่ง money มา — ไม่ส่งก็หน้าตาเดิม', () => {
  const dash = {
    summary: { date: '2026-10-12', jobCount: 2, total: 1500, paid: 1500, pending: 0 },
    counts: {},
    categories: [],
    trend: null,
    recent: [],
  };
  const money = {
    received: 1500,
    cash: 1000,
    transfer: 500,
    unknown: 0,
    collected: { jobCount: 1, total: 1000 },
    bookedToday: { jobCount: 1, total: 700 },
    accountCarry: { jobCount: 2, owed: 1600 },
  };
  const withMoney = JSON.stringify(dashboardFlex(dash, { money, liffUrl: null, mascotImageUrl: null }));
  assert.match(withMoney, /เงินเข้าวันนี้/);
  assert.match(withMoney, /สด ฿1,000/);
  assert.match(withMoney, /โอน ฿500/);
  assert.match(withMoney, /ตามเก็บเงินบัญชีเก่าได้ ฿1,000/);
  assert.match(withMoney, /ลงบัญชีวันนี้ \+฿700/);
  assert.match(withMoney, /รอเก็บรวม ฿1,600/);
  assert.match(withMoney, /money_list&k=account/, 'ปุ่ม 📒 รอเก็บ เปิดกองลงบัญชี');

  const without = JSON.stringify(dashboardFlex(dash, { liffUrl: null, mascotImageUrl: null }));
  assert.doesNotMatch(without, /เงินเข้าวันนี้/);
});

test('วิธีจ่ายไม่หายกลางฟอร์ม: schema รับ payMethod และฟอร์มพกไป-กลับ', () => {
  const ok = jobCreateSchema.safeParse({ items: [{ item_name: 'การ์ด', quantity: 1, unit_price: 100, total: 100 }], payMethod: 'account' });
  assert.equal(ok.success, true);
  assert.equal(ok.data.payMethod, 'account');
  const bad = jobCreateSchema.safeParse({ items: [{ item_name: 'การ์ด', quantity: 1, unit_price: 100, total: 100 }], payMethod: 'กู้' });
  assert.equal(bad.success, false);

  const jot = readFileSync(new URL('../public/liff/jot/script.js', import.meta.url), 'utf8');
  assert.match(jot, /payMethod: state\.payMethod \|\| null/, 'payload ต้องส่ง payMethod');
  assert.match(jot, /state\.payMethod = draft\.payMethod \|\| ''/, 'ร่างจากแชตต้องพกมา');

  const api = readFileSync(new URL('../src/routes/api.js', import.meta.url), 'utf8');
  assert.match(api, /payMethod: draft\.payMethod \|\| null/, 'POST /jobs ต้องส่งเข้าตัวสร้างงาน');
});

test('ทุกทางที่เงินครบพกวันเก็บจริงไปด้วย — จุดเขียนแต่ละทางเรียก paidAtPatch', () => {
  const jobService = readFileSync(new URL('../src/services/jobService.js', import.meta.url), 'utf8');
  // สร้างงานแบบจ่ายครบตั้งแต่แรก
  assert.match(jobService, /\.\.\.paidAtPatch\(\{\}, pay\)/);
  // บันทึกรับเงินทีละก้อน
  assert.match(jobService, /paidAtPatch\(job, fields\)/);
  // ตาข่ายใน updateJob สำหรับทางที่ส่งมาแต่สถานะ (แชตแก้ไข ฯลฯ)
  assert.match(jobService, /allowed\.payment_status !== undefined && allowed\.paid_at === undefined/);

  const billService = readFileSync(new URL('../src/services/billService.js', import.meta.url), 'utf8');
  assert.match(billService, /paidAtPatch\(job, fields/);

  const api = readFileSync(new URL('../src/routes/api.js', import.meta.url), 'utf8');
  assert.match(api, /paidAtPatch\(current, patch\)/, 'PATCH หน้าแก้ไข');

  const quickEdit = readFileSync(new URL('../src/actions/quickEdit.js', import.meta.url), 'utf8');
  assert.match(quickEdit, /paidAtPatch\(job, patch\)/);

  const handler = readFileSync(new URL('../src/handlers/messageHandler.js', import.meta.url), 'utf8');
  assert.match(handler, /paidAtPatch\(current, patch\)/, 'แชต "สถานะ: จ่ายแล้ว"');
});
