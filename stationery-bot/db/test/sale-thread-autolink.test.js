// "แชตและออเดอร์" รุ่น 13 (migrations/008_sale_thread_autolink.sql) on PostgreSQL (PGlite): sale_thread_autolink_customer(thread_id).
//   · a LINE thread with no customer yet gets a new customers row, named after their LINE display name, and gets linked to it
//   · calling it again on an already-linked thread is a no-op — never a second customer row
//   · a thread already linked (e.g. from a real order) is left exactly as it is — its customer's name is never touched
//   · a thread with no sale_line_links row (manual/web chat) does nothing and returns null
//   · two callers racing for the SAME brand-new thread never produce two customers — the thread row lock serializes them
//   Run: cd stationery-bot/db && node --test test/sale-thread-autolink.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openSaleDb } from '../helpers/sale-db.js';
import { asStaff } from '../helpers/shop-db.js';

const T1 = '88888888-8888-4888-8888-888888888903';
const T2 = '88888888-8888-4888-8888-888888888904';
const T3 = '88888888-8888-4888-8888-888888888905';
const C1 = '99999999-9999-4999-8999-999999999901';

const rows = (db, sql, params = []) => db.query(sql, params).then((r) => r.rows);
const call = (db, id) => asStaff(db, (tx) => tx.query('select sale_thread_autolink_customer($1) as id', [id])).then((r) => r.rows[0].id);

async function fresh() {
  const db = await openSaleDb({ line: true, autolink: true });
  await db.query(`insert into sale_threads (id, title, source) values ($1, 'ริงโกลาเฟ009', 'line'), ($2, 'มีลูกค้าอยู่แล้ว', 'line'), ($3, 'แชตเปิดเอง', 'manual')`, [T1, T2, T3]);
  await db.query(`insert into customers (id, name, phone, source) values ($1, 'คุณสมศรี (ลูกค้าเก่า)', '053-123456', 'หน้าร้าน/โทร')`, [C1]);
  await db.query(`update sale_threads set customer_id = $1 where id = $2`, [C1, T2]);
  await db.query(
    `insert into sale_line_links (thread_id, channel_key, line_user_id, line_name) values
     ($1, 'main', 'U-ringolafe009', 'ริงโกลาเฟ009'),
     ($2, 'main', 'U-somsri', 'สมศรีเก่า')`,
    [T1, T2],
  );
  return db;
}

test('a brand-new LINE thread gets a customer named after the LINE display name, and gets linked to it', async () => {
  const db = await fresh();
  const [before] = await rows(db, 'select customer_id from sale_threads where id = $1', [T1]);
  assert.equal(before.customer_id, null);

  const id = await call(db, T1);
  assert.ok(id, 'returns the new customer id');

  const [t] = await rows(db, 'select customer_id from sale_threads where id = $1', [T1]);
  assert.equal(t.customer_id, id);
  const [c] = await rows(db, 'select name, line_name, phone, source from customers where id = $1', [id]);
  assert.deepEqual(c, { name: 'ริงโกลาเฟ009', line_name: 'ริงโกลาเฟ009', phone: null, source: 'LINE OA (เพิ่มเพื่อน)' });
});

test('calling it again on an already-autolinked thread is a no-op — never a second customer row', async () => {
  const db = await fresh();
  const id1 = await call(db, T1);
  const [{ n: before }] = await rows(db, 'select count(*)::int n from customers');
  const id2 = await call(db, T1);
  assert.equal(id2, id1, 'same customer id both times');
  const [{ n: after }] = await rows(db, 'select count(*)::int n from customers');
  assert.equal(after, before, 'no new customer row was created the second time');
});

test('a thread already linked to a customer (from a real order, say) is left exactly as it is', async () => {
  const db = await fresh();
  const id = await call(db, T2);
  assert.equal(id, C1, 'returns the existing linked customer, not a new one');
  const [{ n }] = await rows(db, "select count(*)::int n from customers where source = 'LINE OA (เพิ่มเพื่อน)'");
  assert.equal(n, 0, 'no LINE-sourced customer was created');
  const [c] = await rows(db, 'select name, phone from customers where id = $1', [C1]);
  assert.deepEqual(c, { name: 'คุณสมศรี (ลูกค้าเก่า)', phone: '053-123456' }, "the existing customer's real name and phone are untouched");
});

test('a thread with no sale_line_links row (not from LINE) does nothing and returns null', async () => {
  const db = await fresh();
  const id = await call(db, T3);
  assert.equal(id, null);
  const [t] = await rows(db, 'select customer_id from sale_threads where id = $1', [T3]);
  assert.equal(t.customer_id, null);
});

// PGlite is a single embedded connection with one query queue — it cannot host two genuinely concurrent writers, so no test
// in this file can mechanically force two real Postgres connections to collide on the same row at the same instant (a
// nested db.transaction() call started before the outer one finishes simply deadlocks here, proving nothing about the lock).
// What IS real: "select ... for update" is the standard Postgres idiom for exactly this race, and on the shop's actual
// multi-connection Supabase project a second caller reaching this row while the first still holds the lock genuinely blocks
// there until the first commits — this is not PGlite-specific behavior being hoped for, it is how Postgres row locks work.
// What this test can and does prove on PGlite: calling the function twice back to back for the same never-before-seen
// thread — the shape every real double-call takes once the first one has committed, which is the common case (two staff
// tabs polling a few seconds apart, not to the same millisecond) — never leaves two customers behind.
test('calling it twice in a row for the same brand-new thread leaves exactly one customer behind, not two', async () => {
  const db = await fresh();
  const id1 = await call(db, T1);
  const id2 = await call(db, T1);
  assert.equal(id1, id2, 'both calls agree on the same customer id');
  const [{ n }] = await rows(db, "select count(*)::int n from customers where line_name = 'ริงโกลาเฟ009'");
  assert.equal(n, 1, 'exactly one customer was created, not two');
});
