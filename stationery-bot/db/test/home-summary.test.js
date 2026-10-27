// home_summary() (migration 002): the numbers of the overview screen. It runs as a signed-in staff member (RLS applies), it
// changes nothing, and the chat card is null until the chat-to-order tables (migration 001) are installed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openShopDb, asService, asStaff } from '../helpers/shop-db.js';
import { seedShopCatalogue, P1, P2, P3, STORE } from '../helpers/back-office-db.js';

const MIG = fileURLToPath(new URL('../migrations/002_home_summary.sql', import.meta.url));
// the first moment of today in Bangkok: every "today" order below is at this moment plus a few minutes
const TODAY0 = "(date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok')";

async function fresh({ migrate = true } = {}) {
  const db = await openShopDb({ migrate });
  await db.exec(readFileSync(MIG, 'utf8'));
  await seedShopCatalogue(db);
  await db.exec(`
    create table pick_slips (id uuid primary key default gen_random_uuid(), order_id uuid, order_no text, archived_at timestamptz);
    grant all on pick_slips to anon, authenticated, service_role;`);
  return db;
}

async function seed(db) {
  await asService(db, async (tx) => {
    // stock: P1 is at its reorder point (low), P2 is above it, P3 is below it; a service below its point is never listed
    await tx.query('update products set reorder_point = 10 where id = $1', [P1]);
    await tx.query('update products set reorder_point = 3 where id = $1', [P2]);
    await tx.query('update products set reorder_point = 25 where id = $1', [P3]);
    await tx.query("insert into products (code, name, unit, type, stock_qty, reorder_point, price) values ('S1', 'ค่าบริการติดตั้ง', 'งาน', 'งานบริการ', 0, 1, 500)");
    await tx.query(`insert into orders (order_no, status, total, created_at, orderer_name, school_name) values
      ('NT-0001', 'pending', 300, ${TODAY0} + interval '1 minute', 'คุณครูสุดา', null),
      ('NT-0002', 'done', 700, ${TODAY0} + interval '2 minutes', '', 'โรงเรียนบ้านสวน'),
      ('NT-0003', 'cancelled', 999, ${TODAY0} + interval '3 minutes', 'คุณลุงดำ', null),
      ('NT-0004', 'done', 150, now() - interval '40 days', 'คุณป้าแดง', null)`);
    await tx.query(`insert into sales (store_id, sale_no, total, status, created_at, paid_at, cancelled_at) values
      ($1, 'POS-1', 200, 'paid', ${TODAY0} + interval '1 minute', ${TODAY0} + interval '1 minute', null),
      ($1, 'POS-2', 50, 'cancelled', ${TODAY0} + interval '2 minutes', ${TODAY0} + interval '2 minutes', now()),
      ($1, 'POS-3', 90, 'paid', now() - interval '40 days', now() - interval '40 days', null)`, [STORE]);
    await tx.query(`insert into pick_slips (order_no, archived_at) values ('NT-0001', null), ('NT-0002', null), ('NT-0004', now())`);
  });
}

const summary = (db) => asStaff(db, async (tx) => (await tx.query('select public.home_summary() as s')).rows[0].s);

test('the numbers: this month and today, pending, slips not archived, POS of the month, low stock, recent orders', async () => {
  const db = await fresh();
  await seed(db);
  const s = await summary(db);
  assert.deepEqual(s.month, { orders: 2, amount: 1000 }, 'the month: NT-0001 and NT-0002 (not the cancelled one, not last month)');
  assert.deepEqual(s.today, { orders: 2, amount: 1000 }, 'today: the same two orders');
  assert.equal(s.pending_orders, 1);
  assert.equal(s.unarchived_slips, 2, 'NT-0004 is archived');
  assert.deepEqual(s.pos_month, { sales: 1, amount: 200 }, 'POS: the paid sale of today only');
  assert.equal(s.low_stock, 2, 'P1 at its point and P3 below it; P2 is above its point; the service is never listed');
  assert.deepEqual(s.low_stock_items.map((p) => p.id), [P3, P1], 'the most short first');
  assert.equal(s.low_stock_items[0].reorder_point, 25);
  assert.equal(s.recent_orders.length, 4, 'every order, the newest first');
  assert.deepEqual(s.recent_orders.map((o) => o.order_no), ['NT-0003', 'NT-0002', 'NT-0001', 'NT-0004']);
  assert.equal(s.recent_orders[1].who, 'โรงเรียนบ้านสวน', 'a blank orderer name shows the school');
  assert.equal(s.recent_orders[0].status, 'cancelled', 'a cancelled order is listed with its status');
  assert.equal(s.chat_open, 0, 'the chat tables are installed and nothing is open yet');
  await db.close();
});

test('cancelled and old orders are left out of the money; a service is never low stock', async () => {
  const db = await fresh();
  await seed(db);
  const s = await summary(db);
  assert.equal(s.month.amount, 1000, 'NT-0003 (999, cancelled) and NT-0004 (150, last month) are not in the money');
  assert.ok(!s.low_stock_items.some((p) => p.name === 'ค่าบริการติดตั้ง'), 'the service is not in the list');
  await db.close();
});

test('the chat card counts the open drafts once the chat-to-order tables exist', async () => {
  const db = await fresh();
  await seed(db);
  await asStaff(db, (tx) =>
    tx.query('select public.chat_draft_manual($1::jsonb, $2, $3, $4, $5, $6) as r', [
      JSON.stringify([{ name: 'ไม้ถูพื้น', qty: 2, unit: '', product_id: P1, raw: 'ไม้ถูพื้น 2' }]),
      'คุณครูสุดา', null, null, null, 'staff:สมชาย',
    ]),
  );
  assert.equal((await summary(db)).chat_open, 1);
  await db.close();
});

test('without the chat-to-order tables the chat card is null, and everything else still works', async () => {
  const db = await fresh({ migrate: false });
  await seed(db);
  const s = await summary(db);
  assert.equal(s.chat_open, null);
  assert.equal(s.pending_orders, 1);
  await db.close();
});

test('only signed-in staff can read it', async () => {
  const db = await fresh();
  await assert.rejects(
    db.transaction(async (tx) => {
      await tx.exec('set local role anon');
      await tx.query('select public.home_summary()');
    }),
    /permission denied/,
  );
  await db.close();
});

test('it changes nothing: orders, products, stock moves and sales are the same before and after', async () => {
  const db = await fresh();
  await seed(db);
  const counts = () =>
    asService(db, async (tx) => {
      const r = await tx.query(`select (select count(*) from orders)::int as o, (select sum(stock_qty) from products)::int as st,
        (select count(*) from stock_moves)::int as m, (select count(*) from sales)::int as sa`);
      return r.rows[0];
    });
  const before = await counts();
  await summary(db);
  await summary(db);
  assert.deepEqual(await counts(), before);
  await db.close();
});
