// "แชตและออเดอร์" รุ่น 10 (migrations/006_sale_thread_tags.sql) on PostgreSQL (PGlite): sale_threads.tag.
//   · a thread can be tagged with one of the four colors, or have no tag (null) · a made-up tag is refused by the table
//   · changing the tag does not touch anything else on the thread · staff can set and clear it (the existing staff_all policy)
//   · running the migration again changes nothing · the reverse script takes the column out
//   Run: cd stationery-bot/db && node --test test/sale-thread-tags.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openSaleDb, migration006, reverse006 } from '../helpers/sale-db.js';
import { asStaff } from '../helpers/shop-db.js';

const T1 = '88888888-8888-4888-8888-888888888901';

const rows = (db, sql, params = []) => db.query(sql, params).then((r) => r.rows);

async function fresh() {
  const db = await openSaleDb({ tags: true });
  await db.query(`insert into sale_threads (id, title, source) values ($1, 'แชตทดสอบ', 'manual')`, [T1]);
  return db;
}

test('a new thread has no tag; staff can set it to any of the four, and clear it back to none', async () => {
  const db = await fresh();
  const [before] = await rows(db, 'select tag from sale_threads where id = $1', [T1]);
  assert.equal(before.tag, null);

  for (const k of ['inquiry', 'problem', 'urgent', 'later']) {
    await asStaff(db, (tx) => tx.query('update sale_threads set tag = $2 where id = $1', [T1, k]));
    const [r] = await rows(db, 'select tag from sale_threads where id = $1', [T1]);
    assert.equal(r.tag, k);
  }
  await asStaff(db, (tx) => tx.query('update sale_threads set tag = null where id = $1', [T1]));
  const [cleared] = await rows(db, 'select tag from sale_threads where id = $1', [T1]);
  assert.equal(cleared.tag, null);
});

test('a made-up tag is refused by the table itself, and the thread keeps its old tag', async () => {
  const db = await fresh();
  await asStaff(db, (tx) => tx.query('update sale_threads set tag = $2 where id = $1', [T1, 'urgent']));
  await assert.rejects(db.query(`update sale_threads set tag = 'bogus' where id = $1`, [T1]), /check|violat/i);
  const [r] = await rows(db, 'select tag from sale_threads where id = $1', [T1]);
  assert.equal(r.tag, 'urgent', 'the bad update did not go through');
});

test('tagging a thread does not change anything else on it', async () => {
  const db = await fresh();
  const [before] = await rows(db, 'select stage, unread, last_text from sale_threads where id = $1', [T1]);
  await asStaff(db, (tx) => tx.query('update sale_threads set tag = $2 where id = $1', [T1, 'problem']));
  const [after] = await rows(db, 'select stage, unread, last_text from sale_threads where id = $1', [T1]);
  assert.deepEqual(after, before);
});

test('running the migration again changes nothing', async () => {
  const db = await fresh();
  await asStaff(db, (tx) => tx.query('update sale_threads set tag = $2 where id = $1', [T1, 'later']));
  await db.exec(migration006());
  const [r] = await rows(db, 'select tag from sale_threads where id = $1', [T1]);
  assert.equal(r.tag, 'later', 'untouched by re-running the migration');
  const [{ n }] = await rows(
    db,
    "select count(*)::int as n from pg_constraint where conrelid = 'public.sale_threads'::regclass and conname = 'sale_threads_tag_check'",
  );
  assert.equal(n, 1, 'the check constraint exists exactly once, not duplicated');
});

test('the reverse script takes the column out; the rest of the thread is untouched', async () => {
  const db = await fresh();
  await asStaff(db, (tx) => tx.query('update sale_threads set tag = $2 where id = $1', [T1, 'urgent']));
  await db.exec(reverse006());
  await assert.rejects(rows(db, 'select tag from sale_threads where id = $1', [T1]), /column.*tag.*does not exist|does not exist/i);
  const [r] = await rows(db, 'select title, stage from sale_threads where id = $1', [T1]);
  assert.equal(r.title, 'แชตทดสอบ');
});
