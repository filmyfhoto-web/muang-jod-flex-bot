// The back-office module "chatorders" goes into app_modules through apply.sql and comes out through reverse.sql. Run on PostgreSQL
// (PGlite) with app_modules shaped like production (name, code, seq, enabled, updated_at).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { buildSql } from '../../app-patches/chat-drafts-module/make-sql.mjs';

const DIR = fileURLToPath(new URL('../../app-patches/chat-drafts-module/', import.meta.url));
const code = readFileSync(DIR + 'chatorders.module.js', 'utf8');
const built = buildSql(code);

let db;
before(async () => {
  db = new PGlite();
  await db.exec(`
    create table app_modules (
      name text primary key,
      code text not null,
      seq integer not null default 100,
      enabled boolean not null default true,
      updated_at timestamptz default now()
    );
    insert into app_modules (name, code, seq) values ('weborders', 'window.weborders = true;', 62), ('projdocs', 'void 0;', 63);
  `);
});
after(() => db.close());

const row = async () => (await db.query("select name, code, seq, enabled from app_modules where name = 'chatorders'")).rows[0];
const others = async () => (await db.query("select name, code, seq, enabled from app_modules where name <> 'chatorders' order by name")).rows;

test('the committed apply.sql and reverse.sql are the ones this module code gives (regenerate with make-sql.mjs after any change)', () => {
  assert.equal(readFileSync(DIR + 'apply.sql', 'utf8'), built.apply, 'apply.sql is stale: run node app-patches/chat-drafts-module/make-sql.mjs');
  assert.equal(readFileSync(DIR + 'reverse.sql', 'utf8'), built.reverse, 'reverse.sql is stale: run node app-patches/chat-drafts-module/make-sql.mjs');
});

test('the module code is valid JavaScript (it is compiled here; it is not run)', () => {
  assert.doesNotThrow(() => new Function(code));
});

test('apply.sql adds one disabled row with the sequence after jobs, and leaves the other modules as they were', async () => {
  const before = await others();
  await db.exec(built.apply);
  const r = await row();
  assert.equal(r.enabled, false, 'it is installed switched off');
  assert.equal(r.seq, 65);
  assert.equal(r.code, code, 'the stored code is exactly the file');
  assert.deepEqual(await others(), before, 'no other module changed');
});

test('apply.sql run again changes nothing (it is idempotent)', async () => {
  const before = await row();
  await db.exec(built.apply);
  assert.deepEqual(await row(), before);
  assert.equal((await db.query("select count(*)::int as n from app_modules where name = 'chatorders'")).rows[0].n, 1);
});

test('enabling it is the one update the owner runs after checking; the code stays the same', async () => {
  await db.exec("update app_modules set enabled = true where name = 'chatorders'");
  assert.equal((await row()).enabled, true);
});

test('reverse.sql refuses to remove a module whose code has been changed since it was installed', async () => {
  await db.exec("update app_modules set code = code || E'\\n// a later edit' where name = 'chatorders'");
  await assert.rejects(db.exec(built.reverse), /the code was changed after it was installed; not removed/);
  assert.ok(await row(), 'the row is still there');
});

test('reverse.sql removes the installed module and leaves the other modules as they were', async () => {
  await db.query("update app_modules set code = $1 where name = 'chatorders'", [code]);
  await db.exec(built.reverse);
  assert.equal(await row(), undefined);
  assert.deepEqual(
    (await others()).map((x) => x.name),
    ['projdocs', 'weborders'],
  );
});

test('reverse.sql run again when nothing is installed does nothing and does not fail', async () => {
  await db.exec(built.reverse);
  assert.equal(await row(), undefined);
});

test('the install can be put back after a removal, and the stored code matches the md5 in the script', async () => {
  await db.exec(built.apply);
  const r = await row();
  assert.equal((await db.query('select md5($1::text) as m', [r.code])).rows[0].m, built.md5);
  assert.match(built.apply, new RegExp(built.md5));
  assert.match(built.reverse, new RegExp(built.md5));
});
