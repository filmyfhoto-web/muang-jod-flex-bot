// "แชตและออเดอร์" รุ่น 11 (migrations/007_sale_thread_assignee.sql) on PostgreSQL (PGlite): sale_threads.assignee.
//   · a thread can be assigned to a named person, or have no one assigned (null) · free text, any name is accepted (no roster table exists)
//   · assigning does not touch anything else on the thread · staff can set and clear it (the existing staff_all policy)
//   · running the migration again changes nothing · the reverse script takes the column out
//   Run: cd stationery-bot/db && node --test test/sale-thread-assignee.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openSaleDb, migration007, reverse007 } from '../helpers/sale-db.js';
import { asStaff } from '../helpers/shop-db.js';

const T1 = '88888888-8888-4888-8888-888888888902';

const rows = (db, sql, params = []) => db.query(sql, params).then((r) => r.rows);

async function fresh() {
  const db = await openSaleDb({ assignee: true });
  await db.query(`insert into sale_threads (id, title, source) values ($1, 'แชตทดสอบ', 'manual')`, [T1]);
  return db;
}

test('a new thread has no one assigned; staff can assign a name, and clear it back to none', async () => {
  const db = await fresh();
  const [before] = await rows(db, 'select assignee from sale_threads where id = $1', [T1]);
  assert.equal(before.assignee, null);

  await asStaff(db, (tx) => tx.query('update sale_threads set assignee = $2 where id = $1', [T1, 'ฟิล์ม']));
  const [r] = await rows(db, 'select assignee from sale_threads where id = $1', [T1]);
  assert.equal(r.assignee, 'ฟิล์ม');

  await asStaff(db, (tx) => tx.query('update sale_threads set assignee = $2 where id = $1', [T1, 'ชื่อที่ไม่ได้อยู่ในรายชื่อลัด']));
  const [r2] = await rows(db, 'select assignee from sale_threads where id = $1', [T1]);
  assert.equal(r2.assignee, 'ชื่อที่ไม่ได้อยู่ในรายชื่อลัด', 'free text — any name is accepted, not just the 3 shortcut names');

  await asStaff(db, (tx) => tx.query('update sale_threads set assignee = null where id = $1', [T1]));
  const [cleared] = await rows(db, 'select assignee from sale_threads where id = $1', [T1]);
  assert.equal(cleared.assignee, null);
});

test('assigning a thread does not change anything else on it', async () => {
  const db = await fresh();
  const [before] = await rows(db, 'select stage, unread, last_text from sale_threads where id = $1', [T1]);
  await asStaff(db, (tx) => tx.query('update sale_threads set assignee = $2 where id = $1', [T1, 'หญิง']));
  const [after] = await rows(db, 'select stage, unread, last_text from sale_threads where id = $1', [T1]);
  assert.deepEqual(after, before);
});

test('running the migration again changes nothing', async () => {
  const db = await fresh();
  await asStaff(db, (tx) => tx.query('update sale_threads set assignee = $2 where id = $1', [T1, 'พี่ปิ่น']));
  await db.exec(migration007());
  const [r] = await rows(db, 'select assignee from sale_threads where id = $1', [T1]);
  assert.equal(r.assignee, 'พี่ปิ่น', 'untouched by re-running the migration');
});

test('the reverse script takes the column out; the rest of the thread is untouched', async () => {
  const db = await fresh();
  await asStaff(db, (tx) => tx.query('update sale_threads set assignee = $2 where id = $1', [T1, 'ฟิล์ม']));
  await db.exec(reverse007());
  await assert.rejects(
    rows(db, 'select assignee from sale_threads where id = $1', [T1]),
    /column.*assignee.*does not exist|does not exist/i,
  );
  const [r] = await rows(db, 'select title, stage from sale_threads where id = $1', [T1]);
  assert.equal(r.title, 'แชตทดสอบ');
});
