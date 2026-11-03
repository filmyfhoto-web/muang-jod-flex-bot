// "แชตและออเดอร์" · migration 002_sale_orders on PostgreSQL (PGlite) shaped like production (db/helpers/sale-db.js):
// totals and rounding are worked out by the server, a repeated save makes no second order, the job and payment states follow
// the owner's rules (a slip alone is not a payment; closing an undelivered or unpaid order needs a confirmation), only signed-in
// staff get in, school prices come from the shop's own price function, nothing that existed before is changed, and the reverse
// script takes it all back.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openSaleDb, asAnon, migration002, reverse002 } from '../helpers/sale-db.js';
import { asStaff, asService } from '../helpers/shop-db.js';

const CL = '22222222-2222-4222-8222-2222222222c1'; // นัฐภรณ์ คัลเลอร์แล็ป · VAT 7
const PR = '22222222-2222-4222-8222-2222222222b2'; // นัฐภรณ์ การพิมพ์ · VAT 0
const P1 = '33333333-3333-4333-8333-333333333301'; // กระดาษถ่ายเอกสาร A4 80 แกรม · รีม 135
const P2 = '33333333-3333-4333-8333-333333333302'; // กระดาษ A4 คละสี · รีม 160
const P3 = '33333333-3333-4333-8333-333333333303'; // ปากกาเจล สีน้ำเงิน · โหล 120
const P4 = '33333333-3333-4333-8333-333333333304'; // ปากกาเจล สีแดง · โหล 120
const C1 = '44444444-4444-4444-8444-444444444401';
const S1 = '55555555-5555-4555-8555-555555555501'; // โรงเรียนบ้านตัวอย่าง · บวก 10%
const S2 = '55555555-5555-4555-8555-555555555502'; // โรงเรียนวัดใหม่ · บวก 10% + ราคาพิเศษ (ทิก 20s)
const S3 = '55555555-5555-4555-8555-555555555503'; // โรงเรียนที่ปิดใช้งาน
const T1 = '66666666-6666-4666-8666-666666666601';
const T2 = '66666666-6666-4666-8666-666666666602';

let db;
let seq = 0;
const tok = () => `test-token-${++seq}-${Date.now()}`;
const save = (p) => asStaff(db, (tx) => tx.query('select public.sale_order_save($1::jsonb) as r', [JSON.stringify(p)])).then((r) => r.rows[0].r);
const rows = (sql, params = []) => db.query(sql, params).then((r) => r.rows);
const one = async (sql, params = []) => (await rows(sql, params))[0];
const MOCKUP = [
  { product_id: P1, name: 'กระดาษถ่ายเอกสาร A4 80 แกรม (500 แผ่น/รีม)', qty: 10, unit: 'รีม', unit_price: 135 },
  { product_id: P2, name: 'กระดาษ A4 คละสี (500 แผ่น/รีม)', qty: 5, unit: 'รีม', unit_price: 160 },
  { product_id: P3, name: 'ปากกาเจล สีน้ำเงิน (0.5 มม.)', qty: 3, unit: 'โหล', unit_price: 120 },
  { product_id: P4, name: 'ปากกาเจล สีแดง (0.5 มม.)', qty: 2, unit: 'โหล', unit_price: 120 },
];
const base = (over = {}) => ({ thread_id: T1, client_token: tok(), customer_name: 'โรงเรียนบ้านตัวอย่าง', by_name: 'หญิง', items: MOCKUP, ...over });
const fails = (p, re) => assert.rejects(save(p), re);

before(async () => {
  db = await openSaleDb();
  await db.query(`insert into stores (id, name, vat_rate, doc_prefix) values ($1, 'นัฐภรณ์ คัลเลอร์แล็ป', 7, 'RC-CL'), ($2, 'นัฐภรณ์ การพิมพ์', 0, 'RC-PR')`, [CL, PR]);
  await db.query(
    `insert into products (id, code, name, unit, price, stock_qty, tier_prices) values
      ($1, 'A4-80', 'กระดาษถ่ายเอกสาร A4 80 แกรม', 'รีม', 135, 50, '{"20s": 140}'),
      ($2, 'A4-C', 'กระดาษ A4 คละสี', 'รีม', 160, 20, null),
      ($3, 'GEL-B', 'ปากกาเจล สีน้ำเงิน', 'โหล', 120, 30, null),
      ($4, 'GEL-R', 'ปากกาเจล สีแดง', 'โหล', 120, 30, null)`,
    [P1, P2, P3, P4],
  );
  await db.query(`insert into customers (id, name, phone) values ($1, 'โรงเรียนบ้านตัวอย่าง', '053-000000')`, [C1]);
  await db.query(
    `insert into schools (id, name, slug, markup_pct, round_to, active, price_special) values
      ($1, 'โรงเรียนบ้านตัวอย่าง', 'bantuayang', 10, 1, true, false),
      ($2, 'โรงเรียนวัดใหม่', 'watmai', 10, 1, true, true),
      ($3, 'โรงเรียนปิดแล้ว', 'closed', 10, 1, false, false)`,
    [S1, S2, S3],
  );
  await db.query(`insert into sale_threads (id, customer_id, title, phone, unread) values ($1, $2, 'โรงเรียนบ้านตัวอย่าง', '053-000000', 2), ($3, null, 'คุณกิตติ', null, 0)`, [T1, C1, T2]);
  await db.query(`insert into sale_msgs (thread_id, dir, body) values ($1, 'in', 'สวัสดีค่ะ'), ($1, 'out', 'สวัสดีค่ะ')`, [T1]);
  await db.query(`insert into orders (order_no, orderer_name, status, subtotal, total) values ('NT-0145', 'ออเดอร์เว็บเดิม', 'done', 100, 100)`);
});
after(() => db?.close());

test('the totals are the server’s: the owner’s example (2,750 + VAT 7% = 2,942.50), and totals sent by the screen are ignored', async () => {
  const r = await save(base({ vat_on: true, vat_store_id: CL, subtotal: 1, vat_amount: 0, total: 1, items: MOCKUP.map((i) => ({ ...i, line_total: 1 })) }));
  assert.equal(r.duplicate, false);
  assert.equal(r.order.subtotal, 2750);
  assert.equal(r.order.vat_rate, 7);
  assert.equal(r.order.vat_amount, 192.5);
  assert.equal(r.order.total, 2942.5);
  assert.deepEqual(r.items.map((i) => i.line_total), [1350, 800, 360, 240]);
  assert.deepEqual(r.items.map((i) => i.seq), [1, 2, 3, 4]);
  assert.equal(r.order.job_status, 'pending');
  assert.equal(r.order.pay_status, 'unpaid');
  assert.equal(r.order.order_type, 'goods');
});

test('rounding: quantity and price to satang first, then each line, then VAT on the sum (half away from zero, as PostgreSQL)', async () => {
  const r = await save(base({ vat_on: true, vat_store_id: CL, items: [
    { name: 'งานถ่ายเอกสาร', qty: 3, unit_price: 33.333, kind: 'service' },
    { name: 'ริบบิ้น', qty: 1.5, unit: 'เมตร', unit_price: 10.005 },
  ] }));
  assert.deepEqual(r.items.map((i) => [i.qty, i.unit_price, i.line_total]), [[3, 33.33, 99.99], [1.5, 10.01, 15.02]]);
  assert.equal(r.order.subtotal, 115.01);
  assert.equal(r.order.vat_amount, 8.05);
  assert.equal(r.order.total, 123.06);
  assert.equal(r.items[0].kind, 'service');
});

test('VAT only from the shop’s own settings: a store without a VAT rate is refused, and no VAT is 0', async () => {
  await fails(base({ vat_on: true, vat_store_id: PR }), /ไม่ได้ตั้งอัตรา VAT/);
  await fails(base({ vat_on: true, vat_store_id: null }), /สโตร์สำหรับ VAT ไม่ถูกต้อง/);
  const r = await save(base({ vat_on: false, vat_rate: 7 }));
  assert.equal(r.order.vat_rate, 0, 'a rate sent by the screen is not used');
  assert.equal(r.order.vat_amount, 0);
  assert.equal(r.order.total, 2750);
});

test('order numbers run ORD-<Buddhist year>-00001, 00002 … per year', async () => {
  const { yr } = await one(`select (extract(year from now() at time zone 'Asia/Bangkok') + 543)::int as yr`);
  const nos = (await rows('select order_no from sale_orders order by created_at, order_no')).map((x) => x.order_no);
  assert.ok(nos.length >= 3);
  nos.forEach((no, i) => assert.equal(no, `ORD-${yr}-${String(i + 1).padStart(5, '0')}`));
});

test('the same save sent twice makes one order: the second answer is the first order, nothing more is written', async () => {
  const p = base();
  const a = await save(p);
  const counts = async () => one('select (select count(*) from sale_orders)::int o, (select count(*) from sale_order_items)::int i, (select count(*) from sale_order_events)::int e, (select n from sale_order_years) n');
  const before = await counts();
  const b = await save(p);
  assert.equal(b.duplicate, true);
  assert.equal(b.order.id, a.order.id);
  assert.equal(b.order.order_no, a.order.order_no);
  assert.equal(b.items.length, 4);
  assert.deepEqual(await counts(), before, 'no row, event or number was added');
});

test('an edit sent twice is applied once (its token is remembered), and an old token sent late does not make a new order', async () => {
  const first = await save(base());
  const editTok = tok();
  const edit = { ...base(), client_token: editTok, id: first.order.id, version: first.order.version, items: MOCKUP.slice(0, 2) };
  const e1 = await save(edit);
  assert.equal(e1.order.version, 2);
  assert.equal(e1.order.subtotal, 2150);
  const e2 = await save(edit);
  assert.equal(e2.duplicate, true);
  assert.equal(e2.order.version, 2, 'not applied a second time');
  const n = (await one('select count(*)::int n from sale_orders')).n;
  const late = await save({ ...base(), client_token: first.order.client_token });
  assert.equal(late.duplicate, true);
  assert.equal(late.order.id, first.order.id);
  assert.equal((await one('select count(*)::int n from sale_orders')).n, n);
});

test('two identical saves at the same moment: the loser of the race gets the winner’s order, and no number is used up', async () => {
  // the winner's row is there but its event is not yet visible (it committed between the loser's check and its insert)
  const token = tok();
  const [{ id }] = await rows(
    `insert into sale_orders (thread_id, order_no, customer_name, client_token, created_by) values ($1, 'ORD-RACE-1', 'ผู้ชนะ', $2, 'หญิง') returning id`,
    [T1, token],
  );
  const before = await one('select n from sale_order_years');
  const r = await save(base({ client_token: token }));
  assert.equal(r.duplicate, true);
  assert.equal(r.order.id, id);
  assert.deepEqual(await one('select n from sale_order_years'), before, 'the number taken inside the failed insert was rolled back');
  await db.query('delete from sale_orders where id = $1', [id]);
});

test('two staff editing the same order: the second save with the old version is refused and says to reload', async () => {
  const a = await save(base());
  await save({ ...base(), id: a.order.id, version: 1, note: 'คนแรกแก้' });
  await fails({ ...base(), id: a.order.id, version: 1, note: 'คนที่สองแก้ทับ' }, /ถูกแก้โดยคนอื่นแล้ว/);
  assert.equal((await one('select note, version from sale_orders where id = $1', [a.order.id])).note, 'คนแรกแก้');
  await fails({ ...base(), id: a.order.id, version: 2, thread_id: T2 }, /อยู่กับแชตอื่น|ใบนี้อยู่กับแชทอื่น/);
});

test('an order is one kind for good: goods or documents, and the kind cannot be changed after saving (so the two never merge)', async () => {
  const d = await save(base({ order_type: 'docs' }));
  assert.equal(d.order.order_type, 'docs');
  await fails({ ...base(), id: d.order.id, version: 1, order_type: 'goods' }, /เปลี่ยนประเภทใบหลังบันทึกไม่ได้/);
  await fails(base({ order_type: 'mixed' }), /ประเภทใบไม่ถูกต้อง/);
  const kept = await save({ ...base(), id: d.order.id, version: 1 });
  assert.equal(kept.order.order_type, 'docs', 'leaving the kind out keeps it');
});

test('payment: paid means the whole total, unpaid means nothing, a deposit must be more than 0 and less than the total', async () => {
  const paid = await save(base({ pay_status: 'paid', paid_amount: 5 }));
  assert.equal(paid.order.paid_amount, 2750);
  const unpaid = await save(base({ pay_status: 'unpaid', paid_amount: 999 }));
  assert.equal(unpaid.order.paid_amount, 0);
  await fails(base({ pay_status: 'deposit', paid_amount: 0 }), /มากกว่า 0 และน้อยกว่ายอดรวม/);
  await fails(base({ pay_status: 'partial', paid_amount: 2750 }), /มากกว่า 0 และน้อยกว่ายอดรวม/);
  const dep = await save(base({ pay_status: 'deposit', paid_amount: 1000.005 }));
  assert.equal(dep.order.paid_amount, 1000.01);
  await fails(base({ pay_status: 'free' }), /สถานะการชำระเงินไม่ถูกต้อง/);
  await fails(base({ job_status: 'shipped' }), /สถานะงานไม่ถูกต้อง/);
});

test('attaching a slip alone never marks the order paid: the payment state is only what the staff chose', async () => {
  const slip = { path: `sale-orders/${T1}/1730000000000-slip.jpg`, name: 'slip.jpg', type: 'image/jpeg', size: 95578 };
  const a = await save(base({ attach: [slip] }));
  assert.equal(a.order.pay_status, 'unpaid');
  assert.equal(a.order.paid_amount, 0);
  assert.deepEqual(a.order.attach, [slip]);
  const d = await save({ ...base(), id: a.order.id, version: 1, pay_status: 'deposit', paid_amount: 500 });
  const more = await save({ ...base(), id: a.order.id, version: d.order.version, pay_status: 'deposit', paid_amount: 500, attach: [slip, { ...slip, path: `sale-orders/${T1}/1730000000001-slip2.jpg`, name: 'slip2.jpg' }] });
  assert.equal(more.order.pay_status, 'deposit');
  assert.equal(more.order.paid_amount, 500);
  assert.equal(more.order.attach.length, 2);
});

test('attachments are checked on the server: only images/PDF up to 5 MB, only under this chat’s folder of sale-files', async () => {
  const ok = { path: `sale-orders/${T1}/1-a.pdf`, name: 'a.pdf', type: 'application/pdf', size: 1000 };
  await fails(base({ attach: [{ ...ok, path: `sale-orders/${T2}/1-a.pdf` }] }), /ไฟล์แนบไม่ถูกต้อง/);
  await fails(base({ attach: [{ ...ok, path: `sale-orders/${T1}/../x.pdf` }] }), /ไฟล์แนบไม่ถูกต้อง/);
  await fails(base({ attach: [{ ...ok, path: `pick-slips/${T1}/1-a.pdf` }] }), /ไฟล์แนบไม่ถูกต้อง/);
  await fails(base({ attach: [{ ...ok, type: 'text/html' }] }), /ไฟล์แนบไม่ถูกต้อง/);
  await fails(base({ attach: [{ ...ok, size: 6 * 1024 * 1024 }] }), /ไฟล์แนบไม่ถูกต้อง/);
  await fails(base({ attach: Array.from({ length: 31 }, (_, i) => ({ ...ok, path: `sale-orders/${T1}/${i}-a.pdf` })) }), /ไม่เกิน 30 ไฟล์/);
  const r = await save(base({ attach: [ok] }));
  assert.equal(r.order.attach.length, 1);
});

test('closing: an order not yet delivered or not fully paid closes only with a confirmation, which is written in its history', async () => {
  const a = await save(base());
  await fails({ ...base(), id: a.order.id, version: 1, job_status: 'closed', pay_status: 'paid' }, /ยังไม่ได้ส่งมอบ/);
  const dlv = await save({ ...base(), id: a.order.id, version: 1, job_status: 'delivered' });
  await fails({ ...base(), id: a.order.id, version: dlv.order.version, job_status: 'closed' }, /ยังค้างชำระ/);
  const closed = await save({ ...base(), id: a.order.id, version: dlv.order.version, job_status: 'closed', pay_status: 'paid' });
  assert.equal(closed.order.job_status, 'closed');
  assert.ok(closed.order.closed_at, 'the closing time is kept');
  const b = await save(base());
  const forced = await save({ ...base(), id: b.order.id, version: 1, job_status: 'closed', pay_status: 'deposit', paid_amount: 100, force: true });
  assert.equal(forced.order.job_status, 'closed');
  const ev = await one(`select detail from sale_order_events where order_id = $1 and kind = 'save' order by created_at desc limit 1`, [b.order.id]);
  assert.equal(ev.detail.force, true);
  assert.equal(ev.detail.job_from, 'pending');
  assert.equal(ev.detail.pay_from, 'unpaid');
});

test('cancelling needs a reason, kept in the history; a cancelled order can be saved again without a new reason', async () => {
  const a = await save(base());
  await fails({ ...base(), id: a.order.id, version: 1, job_status: 'canceled' }, /ยกเลิกใบต้องบอกเหตุผล/);
  const c = await save({ ...base(), id: a.order.id, version: 1, job_status: 'canceled', reason: 'ลูกค้าเปลี่ยนใจ' });
  assert.equal(c.order.job_status, 'canceled');
  const ev = await one(`select detail from sale_order_events where order_id = $1 and kind = 'save'`, [a.order.id]);
  assert.equal(ev.detail.reason, 'ลูกค้าเปลี่ยนใจ');
  const again = await save({ ...base(), id: a.order.id, version: 2, job_status: 'canceled', note: 'แก้หมายเหตุ' });
  assert.equal(again.order.version, 3);
});

test('what a save needs: a chat, a customer name, staff name, 1–200 named lines with quantity > 0 and price ≥ 0, real products', async () => {
  await fails(base({ thread_id: '66666666-6666-4666-8666-000000000000' }), /ไม่พบแชท/);
  await fails(base({ customer_name: '  ' }), /ต้องมีชื่อลูกค้า/);
  await fails(base({ by_name: '' }), /ต้องมีชื่อพนักงาน/);
  await fails(base({ items: [] }), /อย่างน้อย 1 รายการ/);
  await fails(base({ items: Array.from({ length: 201 }, () => ({ name: 'x', qty: 1, unit_price: 1 })) }), /เกิน 200 แถว/);
  await fails(base({ items: [{ name: '', qty: 1, unit_price: 1 }] }), /รายการที่ 1 ไม่มีชื่อ/);
  await fails(base({ items: [{ name: 'a', qty: 0, unit_price: 1 }] }), /จำนวนของรายการที่ 1/);
  await fails(base({ items: [{ name: 'a', qty: 1, unit_price: -1 }] }), /ราคาของรายการที่ 1/);
  await fails(base({ items: [{ name: 'a', qty: 1, unit_price: 1, kind: 'gift' }] }), /ชนิดของรายการที่ 1/);
  await fails(base({ items: [{ name: 'a', qty: 1, unit_price: 1, product_id: '33333333-3333-4333-8333-000000000000' }] }), /สินค้าที่ไม่มีในระบบ/);
  await fails(base({ client_token: 'short' }), /client_token/);
});

test('school prices come from the shop’s own formula (as on the school order page), and the price saved is the one at order time', async () => {
  const sp = (school, ids) => asStaff(db, (tx) => tx.query('select public.sale_order_school_prices($1, $2::jsonb) as r', [school, JSON.stringify(ids)])).then((r) => r.rows[0].r);
  const a = await sp(S1, [P1, P3]);
  const by = Object.fromEntries(a.map((x) => [x.id, x]));
  assert.equal(by[P1].price, 149, '135 + 10% = 148.5 → 149 (whole baht)');
  assert.equal(by[P1].base, 135);
  assert.equal(by[P3].price, 132);
  const b = Object.fromEntries((await sp(S2, [P1, P3])).map((x) => [x.id, x.price]));
  assert.equal(b[P1], 140, 'a school with special prices gets the product’s "20s" price');
  assert.equal(b[P3], 132);
  await assert.rejects(sp(S3, [P1]), /ปิดใช้งาน/);
  assert.deepEqual(await sp(S1, []), []);
  const r = await save(base({ price_school_id: S1, items: [{ product_id: P1, name: 'กระดาษ', qty: 2, unit: 'รีม', unit_price: 149 }] }));
  assert.equal(r.order.price_school_id, S1);
  await db.query('update products set price = 999 where id = $1', [P1]);
  const kept = await one('select unit_price from sale_order_items where order_id = $1', [r.order.id]);
  assert.equal(Number(kept.unit_price), 149, 'a later price change does not touch a saved order');
  await db.query('update products set price = 135 where id = $1', [P1]);
  await fails(base({ price_school_id: '55555555-5555-4555-8555-000000000000' }), /ไม่พบโรงเรียน/);
});

test('sending the summary is logged as it really happened: copy / chat / line, with ok or not', async () => {
  const a = await save(base());
  const log = (ch, ok) => asStaff(db, (tx) => tx.query('select public.sale_order_log_send($1, $2, $3, $4, $5) as id', [a.order.id, ch, ok, 'ทดสอบ', 'หญิง']));
  await log('copy', true);
  await log('chat', true);
  await assert.rejects(log('sms', true), /ช่องทางส่งไม่ถูกต้อง/);
  await assert.rejects(asStaff(db, (tx) => tx.query('select public.sale_order_log_send($1, $2, true, null, null)', ['77777777-7777-4777-8777-777777777777', 'copy'])), /ไม่พบใบสั่งงาน/);
  const ev = await rows(`select detail->>'channel' ch, (detail->>'ok')::boolean ok from sale_order_events where order_id = $1 and kind = 'send' order by created_at`, [a.order.id]);
  assert.deepEqual(ev, [{ ch: 'copy', ok: true }, { ch: 'chat', ok: true }]);
});

test('only signed-in staff: a visitor without a login cannot read, save, price or log anything', async () => {
  const denied = /permission denied/;
  await assert.rejects(asAnon(db, (tx) => tx.query('select * from sale_orders')), denied);
  await assert.rejects(asAnon(db, (tx) => tx.query('select * from sale_order_items')), denied);
  await assert.rejects(asAnon(db, (tx) => tx.query('select * from sale_order_events')), denied);
  await assert.rejects(asAnon(db, (tx) => tx.query('select public.sale_order_save($1::jsonb)', [JSON.stringify(base())])), denied);
  await assert.rejects(asAnon(db, (tx) => tx.query('select public.sale_order_school_prices($1, $2::jsonb)', [S1, '[]'])), denied);
  await assert.rejects(asAnon(db, (tx) => tx.query("select public.sale_order_log_send(null, 'copy', true, null, null)")), denied);
  await assert.rejects(asAnon(db, (tx) => tx.query('select public.sale_order_next_no()')), denied);
  const threads = await asAnon(db, (tx) => tx.query('select * from sale_threads'));
  assert.equal(threads.rows.length, 0, 'the chats stay hidden by RLS');
  const staff = await asStaff(db, (tx) => tx.query('select count(*)::int n from sale_orders'));
  assert.ok(staff.rows[0].n > 0, 'staff see the orders');
  const svc = await asService(db, (tx) => tx.query('select count(*)::int n from sale_orders'));
  assert.equal(svc.rows[0].n, staff.rows[0].n);
});

test('saving orders cuts no stock and writes nothing into the other systems (web orders, POS, stock moves)', async () => {
  const snap = () => one(`select (select json_agg(json_build_object('id', id, 'q', stock_qty) order by id) from products) stock,
    (select count(*)::int from stock_moves) moves, (select count(*)::int from orders) orders, (select count(*)::int from order_items) oitems,
    (select count(*)::int from sales) sales, (select count(*)::int from sale_items) sitems`);
  const before = await snap();
  await save(base({ pay_status: 'paid' }));
  const a = await save(base());
  await save({ ...base(), id: a.order.id, version: 1, job_status: 'delivered', pay_status: 'paid' });
  assert.deepEqual(await snap(), before);
});

test('the migration changes nothing that was there before, runs twice safely, and the reverse takes back only what it added', async () => {
  const fresh = await openSaleDb({ migrate: false });
  try {
    const fns = () => fresh.query(`select p.oid::regprocedure::text sig, md5(pg_get_functiondef(p.oid)) h from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1`).then((r) => r.rows);
    const cols = () => fresh.query(`select table_name, string_agg(column_name || ':' || data_type || ':' || coalesce(column_default, ''), ',' order by ordinal_position) c from information_schema.columns where table_schema = 'public' group by table_name order by table_name`).then((r) => r.rows);
    const pols = () => fresh.query(`select tablename, policyname, cmd, roles::text r from pg_policies where schemaname = 'public' order by 1, 2`).then((r) => r.rows);
    const grants = () => fresh.query(`select table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' order by 1, 2, 3`).then((r) => r.rows);
    await fresh.query(`insert into sale_threads (title) values ('ก่อนติดตั้ง')`);
    await fresh.query(`insert into sale_msgs (thread_id, dir, body) select id, 'in', 'ข้อความเดิม' from sale_threads`);
    const [f0, c0, p0, g0] = [await fns(), await cols(), await pols(), await grants()];

    await fresh.exec(migration002());
    await fresh.exec(migration002());
    const [f1, c1, p1] = [await fns(), await cols(), await pols()];
    assert.deepEqual(f1.filter((x) => f0.some((y) => y.sig === x.sig)), f0, 'every function that was there is byte-for-byte the same');
    assert.deepEqual(
      f1.filter((x) => !f0.some((y) => y.sig === x.sig)).map((x) => x.sig).sort(),
      ['sale_order_log_send(uuid,text,boolean,text,text)', 'sale_order_next_no()', 'sale_order_save(jsonb)', 'sale_order_school_prices(uuid,jsonb)'],
    );
    assert.deepEqual(c1.filter((x) => c0.some((y) => y.table_name === x.table_name)), c0, 'every table that was there has the same columns');
    assert.deepEqual(c1.filter((x) => !c0.some((y) => y.table_name === x.table_name)).map((x) => x.table_name), ['sale_order_events', 'sale_order_items', 'sale_order_years', 'sale_orders']);
    assert.deepEqual(p1.filter((x) => !p0.some((y) => y.tablename === x.tablename && y.policyname === x.policyname)).map((x) => `${x.tablename}:${x.policyname}:${x.cmd}:${x.r}`),
      ['sale_order_events:staff_all:ALL:{authenticated}', 'sale_order_items:staff_all:ALL:{authenticated}', 'sale_order_years:staff_all:ALL:{authenticated}', 'sale_orders:staff_all:ALL:{authenticated}']);
    const g1 = await grants();
    assert.deepEqual(g1.filter((x) => !x.table_name.startsWith('sale_order')), g0, 'no grant on an existing table changed');
    assert.equal(g1.filter((x) => x.table_name.startsWith('sale_order') && x.grantee === 'anon').length, 0, 'anon has no grant on the new tables');
    assert.deepEqual((await fresh.query(`select file_size_limit, allowed_mime_types from storage.buckets where id = 'sale-files'`)).rows[0],
      { file_size_limit: 5242880, allowed_mime_types: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'] });

    await fresh.exec(reverse002());
    assert.deepEqual(await fns(), f0, 'the functions are as before');
    assert.deepEqual(await cols(), c0, 'the tables are as before');
    assert.deepEqual(await pols(), p0);
    assert.deepEqual(await grants(), g0);
    assert.deepEqual((await fresh.query(`select file_size_limit, allowed_mime_types from storage.buckets where id = 'sale-files'`)).rows[0], { file_size_limit: null, allowed_mime_types: null });
    assert.equal((await fresh.query('select count(*)::int n from sale_msgs')).rows[0].n, 1, 'the chats and messages are kept');
    await fresh.exec(reverse002());
    await fresh.exec(migration002());
    assert.ok((await fresh.query(`select to_regclass('public.sale_orders') r`)).rows[0].r, 'it can be installed again');
  } finally {
    await fresh.close();
  }
});
