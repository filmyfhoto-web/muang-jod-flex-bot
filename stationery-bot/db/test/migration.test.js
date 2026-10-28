import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openShopDb, asStaff, asService, migrationSql, reverseSql } from '../helpers/shop-db.js';

let db;
before(async () => {
  db = await openShopDb({ migrate: false });
});
after(async () => {
  await db.close();
});

test('the migration applies on a copy of the shop schema, and the reverse removes exactly what it added', async () => {
  await db.exec(migrationSql());
  const tables = await db.query(
    "select table_name from information_schema.tables where table_schema = 'public' and (table_name like 'chat\\_%' or table_name = 'line_channels') order by 1",
  );
  assert.deepEqual(tables.rows.map((r) => r.table_name), ['chat_draft_events', 'chat_drafts', 'chat_messages', 'line_channels']);
  const fns = await db.query("select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and proname like 'chat\\_%' order by 1");
  assert.deepEqual(fns.rows.map((r) => r.proname), ['chat_draft_cancel', 'chat_draft_confirm', 'chat_draft_manual', 'chat_draft_pos', 'chat_draft_save', 'chat_next_draft_no']);
  const bucket = await db.query("select id, public, file_size_limit from storage.buckets where id = 'chat-media'");
  assert.deepEqual(bucket.rows, [{ id: 'chat-media', public: false, file_size_limit: 8388608 }]);
  // the shop's own functions are still the same single definitions
  const pos = await db.query("select count(*)::int as n from pg_proc where proname = 'pos_checkout'");
  assert.equal(pos.rows[0].n, 1);

  // the migration is safe to run twice
  await db.exec(migrationSql());

  await db.exec(reverseSql());
  const left = await db.query("select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name like 'chat\\_%'");
  assert.equal(left.rows[0].n, 0);
  // and the shop's own objects are still there
  const kept = await db.query("select count(*)::int as n from pg_proc where proname in ('pos_checkout', '_write_order') ");
  assert.equal(kept.rows[0].n, 1);
  await db.exec(migrationSql());
});

test('staff can read the drafts, cannot write them, and cannot read the LINE secrets or call the bot-only functions', async () => {
  await asService(db, (tx) =>
    tx.query("insert into chat_drafts (draft_no, channel_key, line_user_id, customer_name) values ('CH-0001', 'main', 'U' || repeat('a', 32), 'ปู่')"),
  );
  const seen = await asStaff(db, (tx) => tx.query('select draft_no, status from chat_drafts'));
  assert.deepEqual(seen.rows, [{ draft_no: 'CH-0001', status: 'open' }]);
  await assert.rejects(
    asStaff(db, (tx) => tx.query("insert into chat_drafts (draft_no, channel_key, line_user_id) values ('CH-0002', 'main', 'Ux')")),
    /permission denied/,
  );
  await assert.rejects(asStaff(db, (tx) => tx.query('update chat_drafts set customer_name = $1', ['x'])), /permission denied/);
  await assert.rejects(asStaff(db, (tx) => tx.query('select channel_secret from line_channels')), /permission denied/);
  await assert.rejects(asStaff(db, (tx) => tx.query('select chat_next_draft_no()')), /permission denied/);
});

test('one customer can have only one open draft per OA; a cancelled one frees the slot', async () => {
  await assert.rejects(
    asService(db, (tx) =>
      tx.query("insert into chat_drafts (draft_no, channel_key, line_user_id) values ('CH-0009', 'main', 'U' || repeat('a', 32))"),
    ),
    /chat_drafts_one_open_per_customer/,
  );
  // the same customer on another OA can have its own draft
  await asService(db, (tx) =>
    tx.query("insert into line_channels (key, name, enabled) values ('shop2', 'OA ที่ 2', true)"),
  );
  await asService(db, (tx) =>
    tx.query("insert into chat_drafts (draft_no, channel_key, line_user_id) values ('CH-0010', 'shop2', 'U' || repeat('a', 32))"),
  );
  await asService(db, (tx) => tx.query("update chat_drafts set status = 'cancelled' where draft_no = 'CH-0001'"));
  await asService(db, (tx) =>
    tx.query("insert into chat_drafts (draft_no, channel_key, line_user_id) values ('CH-0011', 'main', 'U' || repeat('a', 32))"),
  );
  const open = await asService(db, (tx) => tx.query("select draft_no from chat_drafts where status = 'open' order by 1"));
  assert.deepEqual(open.rows.map((r) => r.draft_no), ['CH-0010', 'CH-0011']);
});

test('draft numbers come from their own sequence and the bot can read them', async () => {
  const a = await asService(db, (tx) => tx.query('select chat_next_draft_no() as n'));
  const b = await asService(db, (tx) => tx.query('select chat_next_draft_no() as n'));
  assert.match(a.rows[0].n, /^CH-\d{4}$/);
  assert.notEqual(a.rows[0].n, b.rows[0].n);
});
