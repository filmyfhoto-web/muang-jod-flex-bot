// The overview module's apply.sql and reverse.sql are the ones make-sql.mjs builds from overview.module.js, and they install,
// reinstall and remove the row the way the owner's steps say (PGlite is the same PostgreSQL engine as the database).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { buildSql } from '../../app-patches/home-module/make-sql.mjs';

const DIR = fileURLToPath(new URL('../../app-patches/home-module/', import.meta.url));
const read = (f) => readFileSync(DIR + f, 'utf8');
const count = async (db) => (await db.query("select count(*)::int as c from app_modules where name = 'overview'")).rows[0].c;

async function appModules() {
  const db = new PGlite();
  await db.exec(`create table app_modules (name text primary key, code text not null, seq integer not null default 100,
    enabled boolean not null default true, updated_at timestamptz default now());`);
  return db;
}

test('the committed apply.sql and reverse.sql are what make-sql.mjs builds from the module code now', () => {
  const { apply, reverse } = buildSql(read('overview.module.js'));
  assert.equal(read('apply.sql'), apply, 'run: node app-patches/home-module/make-sql.mjs');
  assert.equal(read('reverse.sql'), reverse);
});

test('apply installs the module switched off, twice is the same as once, reverse removes it, and it can be put back', async () => {
  const db = await appModules();
  await db.exec(read('apply.sql'));
  await db.exec(read('apply.sql'));
  assert.equal(await count(db), 1);
  const [r] = (await db.query("select seq, enabled, length(code) as n from app_modules where name = 'overview'")).rows;
  assert.equal(r.seq, 66);
  assert.equal(r.enabled, false, 'it is installed switched off');
  assert.equal(r.n, [...read('overview.module.js')].length, 'the stored code is the file (characters, not UTF-16 units: the icon is outside the BMP)');
  await db.exec(read('reverse.sql'));
  assert.equal(await count(db), 0);
  await db.exec(read('apply.sql'));
  assert.equal(await count(db), 1);
  await db.close();
});

test('reverse leaves the row alone when its code was changed after the install', async () => {
  const db = await appModules();
  await db.exec(read('apply.sql'));
  await db.query("update app_modules set code = code || ' ' where name = 'overview'");
  await db.exec(read('reverse.sql'));
  assert.equal(await count(db), 1, 'changed code is not deleted');
  await db.close();
});
