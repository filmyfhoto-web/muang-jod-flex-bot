// The back-office page "แชตและออเดอร์" (module saleorders) goes into app_modules through apply.sql and comes out through reverse.sql.
// Its versions: v1 (installed on 4 Nov 2569 in the morning) → v2 (upgrade-v1-to-v2.sql, run on 4 Nov at the owner's request) →
// v3 (upgrade.sql: the page refreshes every 2 seconds). Each step runs on PostgreSQL (PGlite) with app_modules shaped like production,
// next to the live chat page "salechat" that must stay exactly as it is.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { PGlite } from '@electric-sql/pglite';
import { buildSql, md5Of } from '../../app-patches/sale-orders-page/make-sql.mjs';
import { parseOrderText } from '../../src/picklist.js';

const DIR = fileURLToPath(new URL('../../app-patches/sale-orders-page/', import.meta.url));
const read = (f) => readFileSync(DIR + f, 'utf8');
const code = read('saleorders.module.js');
const v2 = read('saleorders.module.v2.js');
const v1 = read('saleorders.module.v1.js');
const built = buildSql(code, { v2, v1 });
const V1_MD5 = '9559832beab918cf7261079338771178'; // what the first installed version hashes to (checked against production on 4 Nov 2569)
const V2_MD5 = '021d0e36d3e31cb66c46c58e62a7ea7e'; // what the version on the live back office hashes to (checked against production)
const FROZEN_V1_TO_V2_MD5 = 'd0be45e0a86f17d62229ac898a4e5645'; // the exact script that ran on production on 4 Nov 2569

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

const rowOf = async (d) => (await d.query("select name, code, seq, enabled from app_modules where name = 'saleorders'")).rows[0];
const othersOf = async (d) => (await d.query("select name, code, seq, enabled, updated_at from app_modules where name <> 'saleorders' order by name")).rows;
const md5In = async (d, text) => (await d.query('select md5($1::text) as m', [text])).rows[0].m;
const installed = async (text, enabled = true) => {
  const d = new PGlite();
  await d.exec(SEED);
  await d.query("insert into app_modules (name, code, seq, enabled) values ('saleorders', $1, 66, $2)", [text, enabled]);
  return d;
};
const row = () => rowOf(db);
const others = () => othersOf(db);

test('the committed scripts are the ones these files give, and the three versions are the ones named here', () => {
  for (const f of ['apply', 'reverse', 'upgrade', 'downgrade']) {
    assert.equal(read(`${f}.sql`), built[f], `${f}.sql is stale: run node app-patches/sale-orders-page/make-sql.mjs`);
  }
  assert.equal(built.md5v1, V1_MD5, 'saleorders.module.v1.js is byte for byte the first installed version');
  assert.equal(built.md5v2, V2_MD5, 'saleorders.module.v2.js is byte for byte the version on the live back office');
  assert.equal(new Set([built.md5, built.md5v2, built.md5v1]).size, 3, 'the current version differs from both earlier ones');
  assert.equal(md5Of(read('upgrade-v1-to-v2.sql')), FROZEN_V1_TO_V2_MD5, 'upgrade-v1-to-v2.sql is the script that ran on production, unchanged');
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
  assert.equal(vm.runInContext('typeof VIEWS.saleorders', ctx), 'function', 'and registers its screen');
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

test('reverse.sql removes the page while its code is v1, v2 or v3, and refuses an edited one', async () => {
  for (const [label, text] of [['v1', v1], ['v2', v2], ['v3', code]]) {
    const d = await installed(text);
    try {
      const others0 = await othersOf(d);
      await d.exec(built.reverse);
      assert.equal(await rowOf(d), undefined, `${label} removed`);
      assert.deepEqual(await othersOf(d), others0, 'the other modules are as they were');
    } finally {
      await d.close();
    }
  }
  const edited = await installed(code + '\n// a later edit');
  try {
    await assert.rejects(edited.exec(built.reverse), /changed after it was installed; not removed/);
    assert.ok(await rowOf(edited), 'the edited page is still there');
  } finally {
    await edited.close();
  }
});

test('apply.sql can be run again after a removal, and the stored code matches the md5 in the scripts', async () => {
  await db.exec(built.apply);
  const r = await row();
  assert.equal(await md5In(db, r.code), built.md5);
  assert.match(built.apply, new RegExp(built.md5));
  assert.match(built.reverse, new RegExp(built.md5));
});

test('upgrade.sql moves the page from v2 to v3: only its code changes (enabled and seq stay), no other module is touched, and running it again does nothing', async () => {
  for (const enabled of [true, false]) {
    const d = await installed(v2, enabled);
    try {
      const others0 = await othersOf(d);
      await d.exec(built.upgrade);
      const r = await rowOf(d);
      assert.equal(r.code, code, 'the stored code is exactly the file');
      assert.equal(await md5In(d, r.code), built.md5);
      assert.deepEqual([r.enabled, r.seq], [enabled, 66], 'switched on stays on, switched off stays off');
      assert.deepEqual(await othersOf(d), others0, 'salechat and the other modules are exactly as they were');
      await d.exec(built.upgrade);
      assert.deepEqual(await rowOf(d), r, 'run twice: nothing more changes');
    } finally {
      await d.close();
    }
  }
});

test('upgrade.sql never overwrites an edited page and never invents one: it stops and says why', async () => {
  const edited = await installed(v2 + '\n// a later edit');
  try {
    const kept = (await rowOf(edited)).code;
    await assert.rejects(edited.exec(built.upgrade), /neither v2 nor v3/);
    assert.equal((await rowOf(edited)).code, kept, 'the edited code is still there');
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

test('downgrade.sql puts v2 back byte for byte, keeps enabled and seq, refuses an edited v3, and is harmless twice', async () => {
  const d = await installed(v2);
  try {
    await d.exec(built.upgrade);
    const others0 = await othersOf(d);
    await d.exec(built.downgrade);
    const r = await rowOf(d);
    assert.equal(r.code, v2);
    assert.equal(await md5In(d, r.code), V2_MD5, 'the md5 the live page had before the upgrade');
    assert.deepEqual([r.enabled, r.seq], [true, 66]);
    assert.deepEqual(await othersOf(d), others0);
    await d.exec(built.downgrade);
    assert.equal((await rowOf(d)).code, v2, 'run twice: still v2');
    await d.exec(built.upgrade);
    await d.query("update app_modules set code = code || E'\\n// edited' where name = 'saleorders'");
    await assert.rejects(d.exec(built.downgrade), /neither v3 nor v2/);
  } finally {
    await d.close();
  }
});

test('upgrade-v1-to-v2.sql (the step run on 4 Nov) still moves the first version to v2 — the record is frozen', async () => {
  const d = await installed(v1);
  try {
    await d.exec(read('upgrade-v1-to-v2.sql'));
    assert.equal(await md5In(d, (await rowOf(d)).code), V2_MD5);
  } finally {
    await d.close();
  }
});

test('the page does not assume the bridge exists, and sends only through the two database functions', () => {
  assert.match(code, /errMsg\(r\)\)\{S\.line=null/, 'a failing status read is “not connected”');
  assert.match(code, /statusOffUntil/, 'and is not asked again every few seconds');
  assert.match(code, /linksOffUntil/);
  assert.match(code, /sb\.rpc\('sale_line_send'/);
  assert.match(code, /sb\.rpc\('sale_line_retry'/);
  assert.doesNotMatch(code, /from\('sale_line_(out|msgs)'\)\.(insert|update|upsert|delete)/, 'no direct write to the send queue');
  assert.doesNotMatch(code, /delivery\s*[:=]\s*['"]sent['"]/, 'no place in the page sets a message to sent');
});
