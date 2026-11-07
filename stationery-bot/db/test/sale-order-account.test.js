// "แชตและออเดอร์" รุ่น 5 (migrations/005_sale_order_account.sql) on PostgreSQL (PGlite): the payment status "ลงบัญชี" ('account').
//   · an order can be saved as ลงบัญชี; nothing is received, so the paid amount stays 0 even if the page sends one
//   · the other statuses are unchanged, and a made-up status is still refused (by the function and by the table)
//   · the reverse script refuses while such orders exist, and takes the status out once they are changed
//   Run: cd stationery-bot/db && node --test test/sale-order-account.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openSaleDb, migration005, reverse005 } from '../helpers/sale-db.js';
import { asStaff } from '../helpers/shop-db.js';

const T1 = '88888888-8888-4888-8888-888888888801';
const ITEM = { product_id: null, kind: 'goods', name: 'ดินสอ 2B', qty: 2, unit: 'แท่ง', unit_price: 50 };
const tok = (() => {
  let n = 0;
  return () => `acc-${++n}-${Date.now()}`;
})();
const base = (over = {}) => ({ thread_id: T1, client_token: tok(), customer_name: 'คุณสมชาย', by_name: 'หญิง', items: [ITEM], ...over });

const rows = (db, sql, params = []) => db.query(sql, params).then((r) => r.rows);
const save = (db, p) => asStaff(db, (tx) => tx.query('select public.sale_order_save($1::jsonb) as r', [JSON.stringify(p)])).then((r) => r.rows[0].r);

async function fresh() {
  const db = await openSaleDb({ account: true });
  await db.query(`insert into sale_threads (id, title, source) values ($1, 'แชตทดสอบ', 'manual')`, [T1]);
  return db;
}

test('an order can be saved as ลงบัญชี, and the paid amount stays 0 even when the page sends one', async () => {
  const db = await fresh();
  const r = await save(db, base({ pay_status: 'account', paid_amount: 999 }));
  assert.equal(r.order.pay_status, 'account');
  assert.equal(Number(r.order.paid_amount), 0, 'nothing has been received');
  const [o] = await rows(db, 'select pay_status, paid_amount, total from sale_orders where id = $1', [r.order.id]);
  assert.equal(o.pay_status, 'account');
  assert.equal(Number(o.paid_amount), 0);
  assert.ok(Number(o.total) > 0);
});

test('the other statuses still work the same way, and a made-up status is refused', async () => {
  const db = await fresh();
  const unpaid = await save(db, base({ pay_status: 'unpaid' }));
  assert.equal(unpaid.order.pay_status, 'unpaid');
  const paid = await save(db, base({ pay_status: 'paid' }));
  assert.equal(paid.order.pay_status, 'paid');
  await assert.rejects(save(db, base({ pay_status: 'bogus' })), /สถานะการชำระเงินไม่ถูกต้อง/);
  await assert.rejects(db.query(`insert into sale_orders (thread_id, order_no, customer_name, pay_status, client_token, created_by) values ($1, 'ORD-X', 'x', 'bogus', 'tok-x', 'หญิง')`, [T1]), /check|violat/i);
});

test('running the migration again changes nothing', async () => {
  const db = await fresh();
  const before = (await rows(db, "select pg_get_functiondef('public.sale_order_save(jsonb)'::regprocedure) as d"))[0].d;
  await db.exec(migration005());
  const after = (await rows(db, "select pg_get_functiondef('public.sale_order_save(jsonb)'::regprocedure) as d"))[0].d;
  assert.equal(after, before);
  assert.equal((after.match(/v_pay = 'account'/g) || []).length, 1, 'the branch is there once');
});

test('the reverse script refuses while an ลงบัญชี order exists, then takes the status out', async () => {
  const db = await fresh();
  const r = await save(db, base({ pay_status: 'account' }));
  await assert.rejects(db.exec(reverse005()), /ยังมีใบสถานะลงบัญชี/);
  await db.query(`update sale_orders set pay_status = 'unpaid' where id = $1`, [r.order.id]);
  await db.exec(reverse005());
  const d = (await rows(db, "select pg_get_functiondef('public.sale_order_save(jsonb)'::regprocedure) as d"))[0].d;
  assert.equal((d.match(/v_pay = 'account'/g) || []).length, 0, 'the function is back to the version before');
  await assert.rejects(save(db, base({ pay_status: 'account' })), /สถานะการชำระเงินไม่ถูกต้อง/);
});
