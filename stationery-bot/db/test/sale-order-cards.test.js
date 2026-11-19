// "แชตและออเดอร์" รุ่น 4 (migrations/004_sale_order_cards.sql) on PostgreSQL (PGlite):
//   · the first order of a chat opens the customer's account (customers) by phone, and the chat is linked to it
//   · the same phone written another way is the same account; nothing is duplicated
//   · a visitor who is not signed in cannot open accounts
//   · orders that already exist count as "card sent to the team" (the bot sends only new ones)
//   · the reverse script takes the new things out and leaves customers and orders as they are
//   Run: cd stationery-bot/db && node --test test/sale-order-cards.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openSaleDb, asAnon, migration004, reverse004 } from '../helpers/sale-db.js';
import { asStaff } from '../helpers/shop-db.js';

const T1 = '77777777-7777-4777-8777-777777777701';
const T2 = '77777777-7777-4777-8777-777777777702';
const T3 = '77777777-7777-4777-8777-777777777703';

const rows = (db, sql, params = []) => db.query(sql, params).then((r) => r.rows);
const upsert = (db, thread, name, phone, source) =>
  asStaff(db, (tx) => tx.query('select public.sale_customer_upsert($1, $2, $3, $4) as id', [thread, name, phone, source])).then((r) => r.rows[0].id);

async function threads(db) {
  await db.query(
    `insert into sale_threads (id, title, source) values ($1, 'แชต 1', 'line'), ($2, 'แชต 2', 'line'), ($3, 'แชต 3', 'manual')`,
    [T1, T2, T3],
  );
}

test('the first order of a chat opens the customer account by phone, and the chat is linked to it', async () => {
  const db = await openSaleDb({ cards: true });
  await threads(db);
  const id = await upsert(db, T1, 'โรงเรียนบ้านตัวอย่าง', '053-000000', 'สั่งผ่าน LINE');
  assert.ok(id, 'an account id comes back');
  const [c] = await rows(db, 'select name, phone, source from customers where id = $1', [id]);
  assert.deepEqual(c, { name: 'โรงเรียนบ้านตัวอย่าง', phone: '053-000000', source: 'สั่งผ่าน LINE' });
  const [t] = await rows(db, 'select customer_id from sale_threads where id = $1', [T1]);
  assert.equal(t.customer_id, id, 'the chat points at that account');
});

test('the same phone written another way is the same account; a new chat with it is linked to that account', async () => {
  const db = await openSaleDb({ cards: true });
  await threads(db);
  const a = await upsert(db, T1, 'คุณสมชาย', '081-234-5678', 'สั่งผ่าน LINE');
  const b = await upsert(db, T2, 'สมชาย ใจดี', '0812345678', 'สั่งผ่าน LINE');
  assert.equal(b, a, 'the same account, not a second one');
  const [n] = await rows(db, "select count(*)::int as n from customers where regexp_replace(coalesce(phone,''), '\\D', '', 'g') = '0812345678'");
  assert.equal(n.n, 1, 'no duplicate');
  const [t2] = await rows(db, 'select customer_id from sale_threads where id = $1', [T2]);
  assert.equal(t2.customer_id, a);
});

test('an existing account keeps its own name, and a chat that already has an account is not re-pointed', async () => {
  const db = await openSaleDb({ cards: true });
  await threads(db);
  const a = await upsert(db, T1, 'คุณสมชาย', '081-234-5678', 'สั่งผ่าน LINE');
  const again = await upsert(db, T1, 'สมชาย (ชื่อใหม่)', '081 234 5678', 'หน้าร้าน/โทร');
  assert.equal(again, a);
  const [c] = await rows(db, 'select name from customers where id = $1', [a]);
  assert.equal(c.name, 'คุณสมชาย');
  const other = await upsert(db, T3, 'ลูกค้าอื่น', '089-000-0000', 'หน้าร้าน/โทร');
  assert.notEqual(other, a);
  await asStaff(db, (tx) => tx.query('select public.sale_customer_upsert($1, $2, $3, $4)', [T1, 'ลูกค้าอื่น', '089-000-0000', 'หน้าร้าน/โทร']));
  const [t1] = await rows(db, 'select customer_id from sale_threads where id = $1', [T1]);
  assert.equal(t1.customer_id, a, 'the chat keeps the account it already had');
});

test('a name without a phone opens an account with the name; nothing typed opens nothing', async () => {
  const db = await openSaleDb({ cards: true });
  await threads(db);
  const id = await upsert(db, T3, 'ร้านหนังสือเล็ก', '', 'หน้าร้าน/โทร');
  const [c] = await rows(db, 'select name, phone from customers where id = $1', [id]);
  assert.deepEqual(c, { name: 'ร้านหนังสือเล็ก', phone: null });
  const none = await upsert(db, T3, '  ', '', 'หน้าร้าน/โทร');
  assert.equal(none, null);
  const [n] = await rows(db, "select count(*)::int as n from customers where name = ''");
  assert.equal(n.n, 0);
});

test('a visitor who is not signed in cannot open accounts', async () => {
  const db = await openSaleDb({ cards: true });
  await threads(db);
  await assert.rejects(
    asAnon(db, (tx) => tx.query('select public.sale_customer_upsert($1, $2, $3, $4)', [T1, 'คนแปลกหน้า', '099-999-9999', 'x'])),
    /permission denied/,
  );
  const [n] = await rows(db, "select count(*)::int as n from customers where name = 'คนแปลกหน้า'");
  assert.equal(n.n, 0);
});

test('orders that already exist count as sent to the team, so the bot only sends new ones', async () => {
  const db = await openSaleDb({ cards: false });
  await threads(db);
  await db.query(`insert into sale_orders (thread_id, order_no, customer_name, client_token, created_by) values ($1, 'ORD-OLD-1', 'เก่า', 'tok-old-1', 'หญิง')`, [T1]);
  await db.exec(migration004());
  const [o] = await rows(db, "select team_card_at is not null as sent from sale_orders where order_no = 'ORD-OLD-1'");
  assert.equal(o.sent, true);
  await db.query(`insert into sale_orders (thread_id, order_no, customer_name, client_token, created_by) values ($1, 'ORD-NEW-1', 'ใหม่', 'tok-new-1', 'หญิง')`, [T1]);
  const [n] = await rows(db, "select team_card_at from sale_orders where order_no = 'ORD-NEW-1'");
  assert.equal(n.team_card_at, null, 'a new order waits for the bot');
});

test('running the migration twice is safe', async () => {
  const db = await openSaleDb({ cards: true });
  await db.exec(migration004());
  await threads(db);
  const id = await upsert(db, T1, 'โรงเรียนบ้านตัวอย่าง', '053-000000', 'สั่งผ่าน LINE');
  assert.ok(id);
});

test('the reverse script takes the new column and function out, and keeps the customers that were added', async () => {
  const db = await openSaleDb({ cards: true });
  await threads(db);
  const id = await upsert(db, T1, 'โรงเรียนบ้านตัวอย่าง', '053-000000', 'สั่งผ่าน LINE');
  await db.exec(reverse004());
  const col = await rows(db, "select 1 from information_schema.columns where table_schema = 'public' and table_name = 'sale_orders' and column_name = 'team_card_at'");
  assert.equal(col.length, 0, 'the column is gone');
  const fn = await rows(db, "select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'sale_customer_upsert'");
  assert.equal(fn.length, 0, 'the function is gone');
  const [c] = await rows(db, 'select name from customers where id = $1', [id]);
  assert.equal(c.name, 'โรงเรียนบ้านตัวอย่าง', 'the account stays');
});
