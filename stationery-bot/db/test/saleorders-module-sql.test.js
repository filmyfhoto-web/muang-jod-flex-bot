// The back-office page "แชตและออเดอร์" (module saleorders) goes into app_modules through apply.sql and comes out through
// reverse.sql; the version installed on 4 Nov 2569 (v1, without LINE) is replaced by the current one through upgrade.sql and put back
// byte for byte through downgrade.sql. Run on PostgreSQL (PGlite) with app_modules shaped like production (name, code, seq, enabled,
// updated_at), next to the live chat page "salechat" that must stay exactly as it is.
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
const previous = readFileSync(DIR + 'saleorders.module.v1.js', 'utf8'); // the version installed in the live back office on 4 Nov 2569
const built = buildSql(code, previous);
const PREVIOUS_MD5 = '9559832beab918cf7261079338771178'; // what the live row's code hashes to (checked against production when it was installed)

const SEED = `
  create table app_modules (name text primary key, code text not null, seq integer not null default 100, enabled boolean not null default true, updated_at timestamptz default now());
  insert into app_modules (name, code, seq) values ('salechat', 'window.salechat = true;', 66), ('docorders', 'void 0;', 66), ('weborders', 'void 1;', 62);
`;
let db;
before(async () => {
  db = new PGlite();
  await db.exec(SEED);
});
after(() => db.close());

const row = async () => (await db.query("select name, code, seq, enabled from app_modules where name = 'saleorders'")).rows[0];
const others = async () => (await db.query("select name, code, seq, enabled, updated_at from app_modules where name <> 'saleorders' order by name")).rows;

test('the committed scripts are the ones these module files give (regenerate with make-sql.mjs after any change), and v1 is the very code that is live', () => {
  for (const f of ['apply', 'reverse', 'upgrade', 'downgrade']) {
    assert.equal(readFileSync(DIR + `${f}.sql`, 'utf8'), built[f], `${f}.sql is stale: run node app-patches/sale-orders-page/make-sql.mjs`);
  }
  assert.equal(built.prevMd5, PREVIOUS_MD5, 'saleorders.module.v1.js must stay byte for byte what was installed (it is what downgrade.sql gives back)');
  assert.notEqual(built.md5, built.prevMd5, 'the current version differs from the installed one');
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

// ---- the page is already installed (v1, enabled): upgrade to the LINE version, and back ------------------------------------------------

async function installedDb({ enabled = true } = {}) {
  const d = new PGlite();
  await d.exec(SEED);
  await d.query("insert into app_modules (name, code, seq, enabled) values ('saleorders', $1, 66, $2)", [previous, enabled]);
  return d;
}
const rowOf = async (d) => (await d.query("select name, code, seq, enabled from app_modules where name = 'saleorders'")).rows[0];
const othersOf = async (d) => (await d.query("select name, code, seq, enabled, updated_at from app_modules where name <> 'saleorders' order by name")).rows;
const md5 = async (d, text) => (await d.query('select md5($1::text) as m', [text])).rows[0].m;

test('upgrade.sql turns the installed page into the LINE version: only its code changes (enabled and seq stay), no other module is touched, and running it again does nothing', async () => {
  for (const enabled of [true, false]) {
    const d = await installedDb({ enabled });
    try {
      const others = await othersOf(d);
      await d.exec(built.upgrade);
      const r = await rowOf(d);
      assert.equal(r.code, code, 'the stored code is exactly the file');
      assert.equal(await md5(d, r.code), built.md5);
      assert.deepEqual([r.enabled, r.seq], [enabled, 66], 'switched on stays on, switched off stays off');
      assert.deepEqual(await othersOf(d), others, 'salechat and the other modules are exactly as they were');
      await d.exec(built.upgrade);
      assert.deepEqual(await rowOf(d), r, 'run twice: nothing more changes');
    } finally {
      await d.close();
    }
  }
});

test('upgrade.sql never overwrites an edited page and never invents one: it stops and says why', async () => {
  const edited = await installedDb();
  try {
    await edited.query("update app_modules set code = code || E'\\n// a later edit' where name = 'saleorders'");
    const mine = (await rowOf(edited)).code;
    await assert.rejects(edited.exec(built.upgrade), /neither the installed version nor this one/);
    assert.equal((await rowOf(edited)).code, mine, 'the edited code is still there');
  } finally {
    await edited.close();
  }
  const none = new PGlite();
  await none.exec(SEED);
  try {
    await assert.rejects(none.exec(built.upgrade), /not installed; use apply\.sql/);
    assert.equal(await rowOf(none), undefined);
  } finally {
    await none.close();
  }
});

test('downgrade.sql gives the installed version back byte for byte, keeps enabled and seq, refuses an edited page, and is harmless twice', async () => {
  const d = await installedDb();
  try {
    await d.exec(built.upgrade);
    const others = await othersOf(d);
    await d.exec(built.downgrade);
    const r = await rowOf(d);
    assert.equal(r.code, previous);
    assert.equal(await md5(d, r.code), PREVIOUS_MD5, 'the md5 production had before the upgrade');
    assert.deepEqual([r.enabled, r.seq], [true, 66]);
    assert.deepEqual(await othersOf(d), others);
    await d.exec(built.downgrade);
    assert.equal((await rowOf(d)).code, previous, 'run twice: still the earlier version');

    await d.exec(built.upgrade);
    await d.query("update app_modules set code = code || E'\\n// edited' where name = 'saleorders'");
    await assert.rejects(d.exec(built.downgrade), /neither the LINE version nor the earlier one/);
  } finally {
    await d.close();
  }
});

test('reverse.sql removes the page while its code is the installed version or the LINE version, and still refuses an edited one', async () => {
  for (const which of ['earlier', 'LINE']) {
    const d = await installedDb();
    try {
      if (which === 'LINE') await d.exec(built.upgrade);
      const others = await othersOf(d);
      await d.exec(built.reverse);
      assert.equal(await rowOf(d), undefined, `${which} version removed`);
      assert.deepEqual(await othersOf(d), others);
    } finally {
      await d.close();
    }
  }
  const d = await installedDb();
  try {
    await d.query("update app_modules set code = code || E'\\n// edited' where name = 'saleorders'");
    await assert.rejects(d.exec(built.reverse), /changed after it was installed; not removed/);
  } finally {
    await d.close();
  }
});

test('the LINE version of the page does not assume the bridge exists, and sends only through the two database functions', () => {
  // the page never assumes the bridge exists: a missing table is "not connected", not an error banner
  assert.match(code, /errMsg\(r\)\)\{S\.line=null/, 'a failing status read is “not connected”');
  assert.match(code, /statusOffUntil/, 'and is not asked again every few seconds');
  assert.match(code, /linksOffUntil/);
  // it can only send through the two database functions (never a direct insert for a LINE reply) and never marks anything sent itself
  assert.match(code, /sb\.rpc\('sale_line_send'/);
  assert.match(code, /sb\.rpc\('sale_line_retry'/);
  assert.doesNotMatch(code, /from\('sale_line_(out|msgs)'\)\.(insert|update|upsert|delete)/, 'no direct write to the send queue');
  assert.doesNotMatch(code, /delivery\s*[:=]\s*['"]sent['"]/, 'no place in the page sets a message to sent');
});
