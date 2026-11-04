// The back-office page "แชตและออเดอร์" (module saleorders) goes into app_modules through apply.sql and comes out through
// reverse.sql. Run on PostgreSQL (PGlite) with app_modules shaped like production (name, code, seq, enabled, updated_at), next to
// the live chat page "salechat" that must stay exactly as it is.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { PGlite } from '@electric-sql/pglite';
import { buildSql } from '../../app-patches/sale-orders-page/make-sql.mjs';
import { parseOrderText } from '../../src/picklist.js';

const DIR = fileURLToPath(new URL('../../app-patches/sale-orders-page/', import.meta.url));
const code = readFileSync(DIR + 'saleorders.module.js', 'utf8');
const built = buildSql(code);

let db;
before(async () => {
  db = new PGlite();
  await db.exec(`
    create table app_modules (name text primary key, code text not null, seq integer not null default 100, enabled boolean not null default true, updated_at timestamptz default now());
    insert into app_modules (name, code, seq) values ('salechat', 'window.salechat = true;', 66), ('docorders', 'void 0;', 66), ('weborders', 'void 1;', 62);
  `);
});
after(() => db.close());

const row = async () => (await db.query("select name, code, seq, enabled from app_modules where name = 'saleorders'")).rows[0];
const others = async () => (await db.query("select name, code, seq, enabled, updated_at from app_modules where name <> 'saleorders' order by name")).rows;

test('the committed apply.sql and reverse.sql are the ones this module code gives (regenerate with make-sql.mjs after any change)', () => {
  assert.equal(readFileSync(DIR + 'apply.sql', 'utf8'), built.apply, 'apply.sql is stale: run node app-patches/sale-orders-page/make-sql.mjs');
  assert.equal(readFileSync(DIR + 'reverse.sql', 'utf8'), built.reverse, 'reverse.sql is stale: run node app-patches/sale-orders-page/make-sql.mjs');
});

test('the module code is valid JavaScript (compiled, not run) and names no other page as its own', () => {
  assert.doesNotThrow(() => new Function(code));
  assert.match(code, /V\.saleorders=/);
  assert.doesNotMatch(code, /(?:VIEWS|V)\.(salechat|weborders|docorders|projdocs|jobs)\s*=/, 'it does not replace another page');
  assert.doesNotMatch(code, /!\s*window\.(?:ROUTES|VIEWS|sb)\b/, 'it never tests window.ROUTES / window.VIEWS / window.sb on their own (undefined in the live shell, which declares them with const)');
  assert.doesNotMatch(code, /from\('(orders|order_items|doc_orders|doc_order_items|project_docs|sales|sale_items|stock_moves)'\)/, 'it reads or writes none of the other order systems');
  assert.doesNotMatch(code, /from\('(products|stores|schools|customers)'\)\.(update|insert|upsert|delete)/, 'it never changes products (no stock cut), stores, schools or customers');
});

test('"สร้างรายการจากแชต" reads a chat list exactly as the bot does (its copy of src/picklist.js gives the same lines)', () => {
  // the module is run the way the live back office runs it: the shell's script declares ROUTES / VIEWS / sb with const (so they
  // are NOT properties of window), then the module's code is added as another classic script in the same global scope
  const ctx = { addEventListener() {}, console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext("const ROUTES=[{id:'home'},{id:'salechat'},{id:'weborders'}]; const VIEWS={}; const sb={}; function buildNav(){ globalThis.navBuilt=(globalThis.navBuilt||0)+1 }", ctx);
  vm.runInContext(code, ctx);
  assert.equal(ctx.ROUTES, undefined, 'the stand-in really behaves like the live shell: window.ROUTES is not there');
  assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(ROUTES.map(r => r.id))', ctx)), ['home', 'salechat', 'saleorders', 'weborders'], 'the page puts itself in the menu right after the old chat page');
  assert.equal(vm.runInContext("typeof VIEWS.saleorders", ctx), 'function', 'and registers its screen');
  assert.equal(ctx.navBuilt, 1, 'and asks the shell to rebuild the menu once');
  vm.runInContext(code, ctx);
  assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(ROUTES.map(r => r.id))', ctx)), ['home', 'salechat', 'saleorders', 'weborders'], 'loaded twice, it is still one menu entry');
  const mine = ctx.NattaSaleOrders.parseOrderText;
  const samples = [
    'ไม้กวาดทางมะพร้าว=10\nไม้ถูพื้น=10\nน้ำยาล้างห้องน้ำ=2แพค',
    'รายการที่ต้องการมีดังนี้ค่ะ\n• กระดาษถ่ายเอกสาร A4 80 แกรม 10 รีม\n• กระดาษ A4 คละสี 5 รีม\n• ปากกาเจล สีน้ำเงิน 3 โหล\nขอใบเสนอราคาด้วยได้ไหมคะ',
    '1. สมุด 5 เล่ม\n2) ปากกา x 12\n10:05 ดินสอ 2B 20 แท่งค่ะ\n5 ด้าม ปากกาแดง\nวันที่ 28 ครูจะแวะมารับ',
    'บ้านเลขที่ 12 หมู่ 5\nMax 5\nโทร 0812345678\nราคา 135 บาท',
    'กาว: 3 หลอด ขนาดใหญ่\nเทป＝2 ม้วน\nกระดาษ 1,000 แผ่น\nแฟ้ม 2.5 โหลนะคะ',
  ];
  for (const s of samples) assert.deepEqual(JSON.parse(JSON.stringify(mine(s))), JSON.parse(JSON.stringify(parseOrderText(s))), s);
  assert.equal(mine(samples[1]).items.length, 3);
});

test('apply.sql adds one disabled row next to salechat and leaves every other module as it was', async () => {
  const before = await others();
  await db.exec(built.apply);
  const r = await row();
  assert.equal(r.enabled, false, 'it is installed switched off');
  assert.equal(r.seq, 66);
  assert.equal(r.code, code, 'the stored code is exactly the file');
  assert.deepEqual(await others(), before, 'no other module changed (salechat included)');
});

test('apply.sql run again changes nothing', async () => {
  const before = await row();
  await db.exec(built.apply);
  assert.deepEqual(await row(), before);
  assert.equal((await db.query("select count(*)::int as n from app_modules where name = 'saleorders'")).rows[0].n, 1);
});

test('reverse.sql refuses to remove the page once its code was edited after install, and removes the installed one', async () => {
  await db.exec("update app_modules set code = code || E'\\n// a later edit' where name = 'saleorders'");
  await assert.rejects(db.exec(built.reverse), /the code was changed after it was installed; not removed/);
  await db.query("update app_modules set code = $1 where name = 'saleorders'", [code]);
  const before = await others();
  await db.exec(built.reverse);
  assert.equal(await row(), undefined);
  assert.deepEqual(await others(), before);
  await db.exec(built.reverse);
  assert.equal(await row(), undefined, 'running it again is harmless');
});

test('the install can be put back after a removal, and the stored code matches the md5 in both scripts', async () => {
  await db.exec(built.apply);
  const r = await row();
  assert.equal((await db.query('select md5($1::text) as m', [r.code])).rows[0].m, built.md5);
  assert.match(built.apply, new RegExp(built.md5));
  assert.match(built.reverse, new RegExp(built.md5));
});
