// The back-office page "แชตและออเดอร์" (module saleorders) goes into app_modules through apply.sql and comes out through reverse.sql.
// Its versions: v1 (installed on 4 Nov 2569 in the morning) → v2 (upgrade-v1-to-v2.sql, run on 4 Nov at the owner's request) →
// v3 (upgrade.sql: the page refreshes every 2 seconds; live since the LINE bridge) → v4 (upgrade-v3-to-v4.sql, live: a shorter order
// panel, customer accounts, order cards) → v5 (upgrade-v4-to-v5.sql: the payment status ลงบัญชี) → v6 (upgrade-v5-to-v6.sql: the bot's
// answers in the chat, and the chat note). Each step runs on PostgreSQL (PGlite)
// with app_modules shaped like production, next to the live chat page "salechat" that must stay exactly as it is.
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
const v10 = read('saleorders.module.v10.js');
const v9 = read('saleorders.module.v9.js');
const v8 = read('saleorders.module.v8.js');
const v7 = read('saleorders.module.v7.js');
const v6 = read('saleorders.module.v6.js');
const v5 = read('saleorders.module.v5.js');
const v4 = read('saleorders.module.v4.js');
const v3 = read('saleorders.module.v3.js');
const v2 = read('saleorders.module.v2.js');
const v1 = read('saleorders.module.v1.js');
const built = buildSql(code, { v10, v9, v8, v7, v6, v5, v4, v3, v2, v1 });
const V1_MD5 = '9559832beab918cf7261079338771178'; // what the first installed version hashes to (checked against production on 4 Nov 2569)
const V2_MD5 = '021d0e36d3e31cb66c46c58e62a7ea7e'; // what the version the back office had before v3 hashes to (checked against production)
const V3_MD5 = '9f5e3e414a69ce2f89c2ab0e135af1a1'; // what the v3 version (live since the LINE bridge) hashes to
const V4_MD5 = '144675bed448432bea634bd6abbc8223'; // what the v4 version (live since the customer accounts and order cards) hashes to
const V5_MD5 = '6bdd44fa4e6cdd40fffbeb1a5b6bdc3c'; // what the v5 version (live since the payment status ลงบัญชี) hashes to
const RAN_V4_TO_V5_MD5 = '0496091cc7837c66a0ca834362b61b52'; // the exact script that ran on production when v5 was installed
const V6_MD5 = 'b78b1655aaa4eccd9bc97f9f92ee5ff1'; // what the v6 version (live since the bot's answers show in the chat) hashes to
const RAN_V5_TO_V6_MD5 = '077596e0f3046397fc89e45f7df27df2'; // the exact script that ran on production when v6 was installed
const V7_MD5 = '5a8b8f0730e5f4958c07e590e5df5545'; // what the v7 version (live since links in LINE messages open) hashes to
const RAN_V6_TO_V7_MD5 = 'b0806a88d6bb40e92509e08a6c7e06ee'; // the exact script that ran on production when v7 was installed
const V8_MD5 = '6750d33a90a9c62659d82deef4168205'; // what the v8 version (a reply from LINE OA Manager can be logged) hashes to
const RAN_V7_TO_V8_MD5 = 'b336c8fae67bc0f21288501aceb66cef'; // the exact script that ran on production when v8 was installed
const V9_MD5 = '00d486ee6556e47e95203879d4f96360'; // what the v9 version (live since the closed-sales total) hashes to
const RAN_V8_TO_V9_MD5 = '4a849c63ac36253293b15a93ac3c6767'; // the exact script that ran on production when v9 was installed
const V10_MD5 = '94897ce42e38bd38939f63072feb4b96'; // what the v10 version (live since colored tags on each chat) hashes to
const RAN_V9_TO_V10_MD5 = 'aee2ac964fae662b65518c96693e0d5f'; // the exact script that ran on production when v10 was installed
const FROZEN_V1_TO_V2_MD5 = 'd0be45e0a86f17d62229ac898a4e5645'; // the exact script that ran on production on 4 Nov 2569
const RAN_V3_TO_V4_MD5 = '02861dcf8aaa83d7ac8a2875be68029b'; // the exact script that ran on production when v4 was installed

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

test('the committed scripts are the ones these files give, and the ten versions are the ones named here', () => {
  for (const [key, file] of [
    ['apply', 'apply.sql'],
    ['reverse', 'reverse.sql'],
    ['upgrade', 'upgrade.sql'],
    ['downgrade', 'downgrade.sql'],
    ['upgrade34', 'upgrade-v3-to-v4.sql'],
    ['downgrade43', 'downgrade-v4-to-v3.sql'],
    ['upgrade45', 'upgrade-v4-to-v5.sql'],
    ['downgrade54', 'downgrade-v5-to-v4.sql'],
    ['upgrade56', 'upgrade-v5-to-v6.sql'],
    ['downgrade65', 'downgrade-v6-to-v5.sql'],
    ['upgrade67', 'upgrade-v6-to-v7.sql'],
    ['downgrade76', 'downgrade-v7-to-v6.sql'],
    ['upgrade78', 'upgrade-v7-to-v8.sql'],
    ['downgrade87', 'downgrade-v8-to-v7.sql'],
    ['upgrade89', 'upgrade-v8-to-v9.sql'],
    ['downgrade98', 'downgrade-v9-to-v8.sql'],
    ['upgrade910', 'upgrade-v9-to-v10.sql'],
    ['downgrade109', 'downgrade-v10-to-v9.sql'],
    ['upgrade1011', 'upgrade-v10-to-v11.sql'],
    ['downgrade1110', 'downgrade-v11-to-v10.sql'],
  ]) {
    assert.equal(read(file), built[key], `${file} is stale: run node app-patches/sale-orders-page/make-sql.mjs`);
  }
  assert.equal(built.md5v1, V1_MD5, 'saleorders.module.v1.js is byte for byte the first installed version');
  assert.equal(built.md5v2, V2_MD5, 'saleorders.module.v2.js is byte for byte the version the back office had before v3');
  assert.equal(built.md5v3, V3_MD5, 'saleorders.module.v3.js is byte for byte the version live since the LINE bridge');
  assert.equal(built.md5v4, V4_MD5, 'saleorders.module.v4.js is byte for byte the version live since v4');
  assert.equal(built.md5v6, V6_MD5, 'saleorders.module.v6.js is byte for byte the version live since the bot’s answers show in the chat');
  assert.equal(built.md5v7, V7_MD5, 'saleorders.module.v7.js is byte for byte the version live since links in LINE messages open');
  assert.equal(built.md5v8, V8_MD5, 'saleorders.module.v8.js is byte for byte the version live since a reply from LINE OA Manager can be logged');
  assert.equal(built.md5v5, V5_MD5, 'saleorders.module.v5.js is byte for byte the version live since ลงบัญชี');
  assert.equal(built.md5v9, V9_MD5, 'saleorders.module.v9.js is byte for byte the version live since the closed-sales total');
  assert.equal(built.md5v10, V10_MD5, 'saleorders.module.v10.js is byte for byte the version live since colored tags on each chat');
  assert.equal(new Set([built.md5, built.md5v10, built.md5v9, built.md5v8, built.md5v7, built.md5v6, built.md5v5, built.md5v4, built.md5v3, built.md5v2, built.md5v1]).size, 11, 'the current version differs from each earlier one');
  assert.equal(md5Of(read('upgrade-v1-to-v2.sql')), FROZEN_V1_TO_V2_MD5, 'upgrade-v1-to-v2.sql is the script that ran on production, unchanged');
  assert.equal(md5Of(read('upgrade-v3-to-v4.sql')), RAN_V3_TO_V4_MD5, 'upgrade-v3-to-v4.sql is the script that ran on production when v4 was installed');
  assert.equal(md5Of(read('upgrade-v4-to-v5.sql')), RAN_V4_TO_V5_MD5, 'upgrade-v4-to-v5.sql is the script that ran on production when v5 was installed');
  assert.equal(md5Of(read('upgrade-v5-to-v6.sql')), RAN_V5_TO_V6_MD5, 'upgrade-v5-to-v6.sql is the script that ran on production when v6 was installed');
  assert.equal(md5Of(read('upgrade-v6-to-v7.sql')), RAN_V6_TO_V7_MD5, 'upgrade-v6-to-v7.sql is the script that ran on production when v7 was installed');
  assert.equal(md5Of(read('upgrade-v7-to-v8.sql')), RAN_V7_TO_V8_MD5, 'upgrade-v7-to-v8.sql is the script that ran on production when v8 was installed');
  assert.equal(md5Of(read('upgrade-v8-to-v9.sql')), RAN_V8_TO_V9_MD5, 'upgrade-v8-to-v9.sql is the script that ran on production when v9 was installed');
  assert.equal(md5Of(read('upgrade-v9-to-v10.sql')), RAN_V9_TO_V10_MD5, 'upgrade-v9-to-v10.sql is the script that ran on production when v10 was installed');
});

test('the module code is valid JavaScript (compiled, not run) and names no other page as its own', () => {
  assert.doesNotThrow(() => new Function(code));
  assert.match(code, /V\.saleorders=/);
  assert.doesNotMatch(code, /(?:VIEWS|V)\.(salechat|weborders|docorders|projdocs|jobs)\s*=/, 'it does not replace another page');
  assert.doesNotMatch(code, /!\s*window\.(?:ROUTES|VIEWS|sb)\b/, 'it never tests window.ROUTES / window.VIEWS / window.sb on their own (undefined in the live shell, which declares them with const)');
  assert.doesNotMatch(code, /from\('(orders|order_items|doc_orders|doc_order_items|project_docs|sales|sale_items|stock_moves)'\)/, 'it reads or writes none of the other order systems');
  assert.doesNotMatch(code, /from\('(products|stores|schools|customers)'\)\.(update|insert|upsert|delete)/, 'it never changes products (no stock cut), stores, schools or customers');
});

test('the payment status ลงบัญชี is offered, and it does not claim money was received', () => {
  assert.match(code, /\['account','ลงบัญชี'/, 'the option is in the list');
  assert.match(code, /ลงบัญชี · ลูกค้าชำระทีหลัง \(ยังไม่ได้รับเงิน\)/, 'the summary says it is paid later');
});

test('the chat note says what the chat shows: the customer, the bot’s answers, and what is sent from the page; not what is typed in LINE OA Manager', () => {
  assert.match(code, /แชตจาก LINE OA · หน้านี้แสดงข้อความของลูกค้า คำตอบของบอท และข้อความที่ส่งจากหน้านี้/);
  assert.match(code, /คำตอบที่พิมพ์ตรงใน LINE OA Manager ไม่ขึ้นเอง/);
  assert.doesNotMatch(code, /คำตอบอัตโนมัติของบอทจะไม่แสดง/, 'the old note said the bot’s answers are not shown: no longer true');
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

test('reverse.sql removes the page while its code is v1, v2, v3, v4, v5, v6, v7, v8 or v9, and refuses an edited one', async () => {
  for (const [label, text] of [['v1', v1], ['v2', v2], ['v3', v3], ['v4', v4], ['v5', v5], ['v6', v6], ['v7', v7], ['v8', v8], ['v9', code]]) {
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
      assert.equal(r.code, v3, 'the stored code is exactly the v3 file');
      assert.equal(await md5In(d, r.code), built.md5v3);
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
    assert.equal(await md5In(d, r.code), V2_MD5, 'the md5 the back office had before v3');
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

test('upgrade-v3-to-v4.sql moves the page from v3 to v4: only its code changes (enabled and seq stay), and running it again does nothing', async () => {
  for (const enabled of [true, false]) {
    const d = await installed(v3, enabled);
    try {
      const others0 = await othersOf(d);
      await d.exec(built.upgrade34);
      const r = await rowOf(d);
      assert.equal(r.code, v4, 'the stored code is exactly the v4 file');
      assert.equal(await md5In(d, r.code), V4_MD5);
      assert.deepEqual([r.enabled, r.seq], [enabled, 66], 'switched on stays on, switched off stays off');
      assert.deepEqual(await othersOf(d), others0, 'salechat and the other modules are exactly as they were');
      await d.exec(built.upgrade34);
      assert.deepEqual(await rowOf(d), r, 'run twice: nothing more changes');
    } finally {
      await d.close();
    }
  }
});

test('upgrade-v3-to-v4.sql refuses a page that is neither v3 nor v4 (an old v2 page, or a v3 page someone edited)', async () => {
  const old = await installed(v2);
  try {
    await assert.rejects(old.exec(built.upgrade34), /neither v3 nor v4/);
    assert.equal((await rowOf(old)).code, v2, 'the v2 page is still there, untouched');
  } finally {
    await old.close();
  }
  const edited = await installed(v3 + '\n// a later edit');
  try {
    await assert.rejects(edited.exec(built.upgrade34), /neither v3 nor v4/);
  } finally {
    await edited.close();
  }
});

test('downgrade-v4-to-v3.sql puts v3 back byte for byte, keeps enabled and seq, refuses an edited v4, and is harmless twice', async () => {
  const d = await installed(v3);
  try {
    await d.exec(built.upgrade34);
    const others0 = await othersOf(d);
    await d.exec(built.downgrade43);
    const r = await rowOf(d);
    assert.equal(r.code, v3);
    assert.equal(await md5In(d, r.code), V3_MD5, 'the md5 the v3 page had before the upgrade');
    assert.deepEqual([r.enabled, r.seq], [true, 66]);
    assert.deepEqual(await othersOf(d), others0);
    await d.exec(built.downgrade43);
    assert.equal((await rowOf(d)).code, v3, 'run twice: still v3');
    await d.exec(built.upgrade34);
    await d.query("update app_modules set code = code || E'\\n// edited' where name = 'saleorders'");
    await assert.rejects(d.exec(built.downgrade43), /neither v4 nor v3/);
  } finally {
    await d.close();
  }
});

test('upgrade-v4-to-v5.sql moves the page from v4 to v5: only its code changes (enabled and seq stay), and running it again does nothing', async () => {
  for (const enabled of [true, false]) {
    const d = await installed(v4, enabled);
    try {
      const others0 = await othersOf(d);
      await d.exec(built.upgrade45);
      const r = await rowOf(d);
      assert.equal(r.code, v5, 'the stored code is exactly the v5 file');
      assert.equal(await md5In(d, r.code), V5_MD5);
      assert.deepEqual([r.enabled, r.seq], [enabled, 66], 'switched on stays on, switched off stays off');
      assert.deepEqual(await othersOf(d), others0, 'salechat and the other modules are exactly as they were');
      await d.exec(built.upgrade45);
      assert.deepEqual(await rowOf(d), r, 'run twice: nothing more changes');
    } finally {
      await d.close();
    }
  }
});

test('upgrade-v4-to-v5.sql refuses a page that is neither v4 nor v5, and never overwrites an edited one', async () => {
  const edited = await installed(v4 + '\n// a later edit');
  try {
    const kept = (await rowOf(edited)).code;
    await assert.rejects(edited.exec(built.upgrade45), /neither v4 nor v5/);
    assert.equal((await rowOf(edited)).code, kept, 'the edited code is still there');
  } finally {
    await edited.close();
  }
  const old = await installed(v3);
  try {
    await assert.rejects(old.exec(built.upgrade45), /neither v4 nor v5/);
    assert.equal((await rowOf(old)).code, v3, 'the v3 page is still there, untouched');
  } finally {
    await old.close();
  }
});

test('downgrade-v5-to-v4.sql puts v4 back byte for byte, keeps enabled and seq, refuses an edited v5, and is harmless twice', async () => {
  const d = await installed(v4);
  try {
    await d.exec(built.upgrade45);
    const others0 = await othersOf(d);
    await d.exec(built.downgrade54);
    const r = await rowOf(d);
    assert.equal(r.code, v4);
    assert.equal(await md5In(d, r.code), V4_MD5, 'the md5 the v4 page had before the upgrade');
    assert.deepEqual([r.enabled, r.seq], [true, 66]);
    assert.deepEqual(await othersOf(d), others0);
    await d.exec(built.downgrade54);
    assert.equal((await rowOf(d)).code, v4, 'run twice: still v4');
    await d.exec(built.upgrade45);
    await d.query("update app_modules set code = code || E'\\n// edited' where name = 'saleorders'");
    await assert.rejects(d.exec(built.downgrade54), /neither v5 nor v4/);
  } finally {
    await d.close();
  }
});

test('upgrade-v5-to-v6.sql moves the page from v5 to v6: only its code changes (enabled and seq stay), and running it again does nothing', async () => {
  for (const enabled of [true, false]) {
    const d = await installed(v5, enabled);
    try {
      const others0 = await othersOf(d);
      await d.exec(built.upgrade56);
      const r = await rowOf(d);
      assert.equal(r.code, v6, 'the stored code is exactly the v6 file');
      assert.equal(await md5In(d, r.code), V6_MD5);
      assert.deepEqual([r.enabled, r.seq], [enabled, 66], 'switched on stays on, switched off stays off');
      assert.deepEqual(await othersOf(d), others0, 'salechat and the other modules are exactly as they were');
      await d.exec(built.upgrade56);
      assert.deepEqual(await rowOf(d), r, 'run twice: nothing more changes');
    } finally {
      await d.close();
    }
  }
});

test('upgrade-v5-to-v6.sql refuses a page that is neither v5 nor v6, and never overwrites an edited one', async () => {
  const edited = await installed(v5 + '\n// a later edit');
  try {
    const kept = (await rowOf(edited)).code;
    await assert.rejects(edited.exec(built.upgrade56), /neither v5 nor v6/);
    assert.equal((await rowOf(edited)).code, kept, 'the edited code is still there');
  } finally {
    await edited.close();
  }
  const old = await installed(v4);
  try {
    await assert.rejects(old.exec(built.upgrade56), /neither v5 nor v6/);
    assert.equal((await rowOf(old)).code, v4, 'the v4 page is still there, untouched');
  } finally {
    await old.close();
  }
});

test('downgrade-v6-to-v5.sql puts v5 back byte for byte, keeps enabled and seq, refuses an edited v6, and is harmless twice', async () => {
  const d = await installed(v5);
  try {
    await d.exec(built.upgrade56);
    const others0 = await othersOf(d);
    await d.exec(built.downgrade65);
    const r = await rowOf(d);
    assert.equal(r.code, v5);
    assert.equal(await md5In(d, r.code), V5_MD5, 'the md5 the v5 page had before the upgrade');
    assert.deepEqual([r.enabled, r.seq], [true, 66]);
    assert.deepEqual(await othersOf(d), others0);
    await d.exec(built.downgrade65);
    assert.equal((await rowOf(d)).code, v5, 'run twice: still v5');
    await d.exec(built.upgrade56);
    await d.query("update app_modules set code = code || E'\\n// edited' where name = 'saleorders'");
    await assert.rejects(d.exec(built.downgrade65), /neither v6 nor v5/);
  } finally {
    await d.close();
  }
});

test('upgrade-v6-to-v7.sql moves the page from v6 to v7: only its code changes (enabled and seq stay), and running it again does nothing', async () => {
  for (const enabled of [true, false]) {
    const d = await installed(v6, enabled);
    try {
      const others0 = await othersOf(d);
      await d.exec(built.upgrade67);
      const r = await rowOf(d);
      assert.equal(r.code, v7, 'the stored code is exactly the v7 file');
      assert.equal(await md5In(d, r.code), V7_MD5);
      assert.deepEqual([r.enabled, r.seq], [enabled, 66], 'switched on stays on, switched off stays off');
      assert.deepEqual(await othersOf(d), others0, 'salechat and the other modules are exactly as they were');
      await d.exec(built.upgrade67);
      assert.deepEqual(await rowOf(d), r, 'run twice: nothing more changes');
    } finally {
      await d.close();
    }
  }
});

test('upgrade-v6-to-v7.sql refuses a page that is neither v6 nor v7, and never overwrites an edited one', async () => {
  const edited = await installed(v6 + '\n// a later edit');
  try {
    const kept = (await rowOf(edited)).code;
    await assert.rejects(edited.exec(built.upgrade67), /neither v6 nor v7/);
    assert.equal((await rowOf(edited)).code, kept, 'the edited code is still there');
  } finally {
    await edited.close();
  }
  const old = await installed(v5);
  try {
    await assert.rejects(old.exec(built.upgrade67), /neither v6 nor v7/);
    assert.equal((await rowOf(old)).code, v5, 'the v5 page is still there, untouched');
  } finally {
    await old.close();
  }
});

test('downgrade-v7-to-v6.sql puts v6 back byte for byte, keeps enabled and seq, refuses an edited v7, and is harmless twice', async () => {
  const d = await installed(v6);
  try {
    await d.exec(built.upgrade67);
    const others0 = await othersOf(d);
    await d.exec(built.downgrade76);
    const r = await rowOf(d);
    assert.equal(r.code, v6);
    assert.equal(await md5In(d, r.code), V6_MD5, 'the md5 the v6 page had before the upgrade');
    assert.deepEqual([r.enabled, r.seq], [true, 66]);
    assert.deepEqual(await othersOf(d), others0);
    await d.exec(built.downgrade76);
    assert.equal((await rowOf(d)).code, v6, 'run twice: still v6');
    await d.exec(built.upgrade67);
    await d.query("update app_modules set code = code || E'\\n// edited' where name = 'saleorders'");
    await assert.rejects(d.exec(built.downgrade76), /neither v7 nor v6/);
  } finally {
    await d.close();
  }
});

test('a link in a LINE text message opens in a new tab; only http and https links are made, and the rest stays escaped', () => {
  assert.ok(code.includes('function linkHtml(s){'));
  assert.ok(code.includes("/https?:\\/\\/[^\\s<>\"']+/g"), 'only http and https');
  assert.ok(code.includes('target="_blank" rel="noopener noreferrer"'));
  assert.ok(code.includes("${m.kind==='text'?linkHtml(m.body):E(m.body)}"), 'a text message goes through the link check; other kinds stay escaped');
});

test('upgrade-v7-to-v8.sql moves the page from v7 to v8: only its code changes (enabled and seq stay), and running it again does nothing', async () => {
  for (const enabled of [true, false]) {
    const d = await installed(v7, enabled);
    try {
      const others0 = await othersOf(d);
      await d.exec(built.upgrade78);
      const r = await rowOf(d);
      assert.equal(r.code, v8, 'the stored code is exactly the v8 file');
      assert.equal(await md5In(d, r.code), V8_MD5);
      assert.deepEqual([r.enabled, r.seq], [enabled, 66], 'switched on stays on, switched off stays off');
      assert.deepEqual(await othersOf(d), others0, 'salechat and the other modules are exactly as they were');
      await d.exec(built.upgrade78);
      assert.deepEqual(await rowOf(d), r, 'run twice: nothing more changes');
    } finally {
      await d.close();
    }
  }
});

test('upgrade-v7-to-v8.sql refuses a page that is neither v7 nor v8, and never overwrites an edited one', async () => {
  const edited = await installed(v7 + '\n// a later edit');
  try {
    const kept = (await rowOf(edited)).code;
    await assert.rejects(edited.exec(built.upgrade78), /neither v7 nor v8/);
    assert.equal((await rowOf(edited)).code, kept, 'the edited code is still there');
  } finally {
    await edited.close();
  }
  const old = await installed(v6);
  try {
    await assert.rejects(old.exec(built.upgrade78), /neither v7 nor v8/);
    assert.equal((await rowOf(old)).code, v6, 'the v6 page is still there, untouched');
  } finally {
    await old.close();
  }
});

test('downgrade-v8-to-v7.sql puts v7 back byte for byte, keeps enabled and seq, refuses an edited v8, and is harmless twice', async () => {
  const d = await installed(v7);
  try {
    await d.exec(built.upgrade78);
    const others0 = await othersOf(d);
    await d.exec(built.downgrade87);
    const r = await rowOf(d);
    assert.equal(r.code, v7);
    assert.equal(await md5In(d, r.code), V7_MD5, 'the md5 the v7 page had before the upgrade');
    assert.deepEqual([r.enabled, r.seq], [true, 66]);
    assert.deepEqual(await othersOf(d), others0);
    await d.exec(built.downgrade87);
    assert.equal((await rowOf(d)).code, v7, 'run twice: still v7');
    await d.exec(built.upgrade78);
    await d.query("update app_modules set code = code || E'\\n// edited' where name = 'saleorders'");
    await assert.rejects(d.exec(built.downgrade87), /neither v8 nor v7/);
  } finally {
    await d.close();
  }
});

test('a reply typed in LINE OA Manager is logged into the chat with one click: kept as a staff message marked as logged, never sent from the page and never queued for LINE', () => {
  assert.ok(code.includes('data-a="oalog"'), 'the button is there, for LINE chats only');
  assert.ok(code.includes('const viaOa=!note&&S.oaLog&&isLine(S.list.find(x=>x.id===id))'));
  assert.ok(code.includes('if(!note&&!viaOa&&isLine(S.list.find(x=>x.id===id))){await sendLine(id,body);return}'), 'a logged reply does not go to the LINE queue');
  assert.ok(code.includes("row.meta={src:'oa_manager',delivery:'logged',delivery_at:now}"), 'it is marked logged, not sent');
  assert.ok(code.includes("if(meta.src==='oa_manager')return"), 'the chat says it was not sent from the page');
  assert.ok(code.includes("if(a==='oalog'){S.oaLog=!S.oaLog;"));
  assert.ok(code.includes("if(a==='note'){S.note=!S.note;if(S.note)S.oaLog=false;"), 'the note and the log are never on together');
});

test('upgrade-v8-to-v9.sql moves the page from v8 to v9: only its code changes (enabled and seq stay), and running it again does nothing', async () => {
  for (const enabled of [true, false]) {
    const d = await installed(v8, enabled);
    try {
      const others0 = await othersOf(d);
      await d.exec(built.upgrade89);
      const r = await rowOf(d);
      assert.equal(r.code, v9, 'the stored code is exactly the v9 file');
      assert.equal(await md5In(d, r.code), built.md5v9);
      assert.deepEqual([r.enabled, r.seq], [enabled, 66], 'switched on stays on, switched off stays off');
      assert.deepEqual(await othersOf(d), others0, 'salechat and the other modules are exactly as they were');
      await d.exec(built.upgrade89);
      assert.deepEqual(await rowOf(d), r, 'run twice: nothing more changes');
    } finally {
      await d.close();
    }
  }
});

test('upgrade-v8-to-v9.sql refuses a page that is neither v8 nor v9, and never overwrites an edited one', async () => {
  const edited = await installed(v8 + '\n// a later edit');
  try {
    const kept = (await rowOf(edited)).code;
    await assert.rejects(edited.exec(built.upgrade89), /neither v8 nor v9/);
    assert.equal((await rowOf(edited)).code, kept, 'the edited code is still there');
  } finally {
    await edited.close();
  }
  const old = await installed(v7);
  try {
    await assert.rejects(old.exec(built.upgrade89), /neither v8 nor v9/);
    assert.equal((await rowOf(old)).code, v7, 'the v7 page is still there, untouched');
  } finally {
    await old.close();
  }
});

test('downgrade-v9-to-v8.sql puts v8 back byte for byte, keeps enabled and seq, refuses an edited v9, and is harmless twice', async () => {
  const d = await installed(v8);
  try {
    await d.exec(built.upgrade89);
    const others0 = await othersOf(d);
    await d.exec(built.downgrade98);
    const r = await rowOf(d);
    assert.equal(r.code, v8);
    assert.equal(await md5In(d, r.code), V8_MD5, 'the md5 the v8 page had before the upgrade');
    assert.deepEqual([r.enabled, r.seq], [true, 66]);
    assert.deepEqual(await othersOf(d), others0);
    await d.exec(built.downgrade98);
    assert.equal((await rowOf(d)).code, v8, 'run twice: still v8');
    await d.exec(built.upgrade89);
    await d.query("update app_modules set code = code || E'\\n// edited' where name = 'saleorders'");
    await assert.rejects(d.exec(built.downgrade98), /neither v9 nor v8/);
  } finally {
    await d.close();
  }
});

test('upgrade-v9-to-v10.sql moves the page from v9 to v10: only its code changes (enabled and seq stay), and running it again does nothing', async () => {
  for (const enabled of [true, false]) {
    const d = await installed(v9, enabled);
    try {
      const others0 = await othersOf(d);
      await d.exec(built.upgrade910);
      const r = await rowOf(d);
      assert.equal(r.code, v10, 'the stored code is exactly the v10 file');
      assert.equal(await md5In(d, r.code), built.md5v10);
      assert.deepEqual([r.enabled, r.seq], [enabled, 66], 'switched on stays on, switched off stays off');
      assert.deepEqual(await othersOf(d), others0, 'salechat and the other modules are exactly as they were');
      await d.exec(built.upgrade910);
      assert.deepEqual(await rowOf(d), r, 'run twice: nothing more changes');
    } finally {
      await d.close();
    }
  }
});

test('upgrade-v9-to-v10.sql refuses a page that is neither v9 nor v10, and never overwrites an edited one', async () => {
  const edited = await installed(v9 + '\n// a later edit');
  try {
    const kept = (await rowOf(edited)).code;
    await assert.rejects(edited.exec(built.upgrade910), /neither v9 nor v10/);
    assert.equal((await rowOf(edited)).code, kept, 'the edited code is still there');
  } finally {
    await edited.close();
  }
  const old = await installed(v8);
  try {
    await assert.rejects(old.exec(built.upgrade910), /neither v9 nor v10/);
    assert.equal((await rowOf(old)).code, v8, 'the v8 page is still there, untouched');
  } finally {
    await old.close();
  }
});

test('downgrade-v10-to-v9.sql puts v9 back byte for byte, keeps enabled and seq, refuses an edited v10, and is harmless twice', async () => {
  const d = await installed(v9);
  try {
    await d.exec(built.upgrade910);
    const others0 = await othersOf(d);
    await d.exec(built.downgrade109);
    const r = await rowOf(d);
    assert.equal(r.code, v9);
    assert.equal(await md5In(d, r.code), V9_MD5, 'the md5 the v9 page had before the upgrade');
    assert.deepEqual([r.enabled, r.seq], [true, 66]);
    assert.deepEqual(await othersOf(d), others0);
    await d.exec(built.downgrade109);
    assert.equal((await rowOf(d)).code, v9, 'run twice: still v9');
    await d.exec(built.upgrade910);
    await d.query("update app_modules set code = code || E'\\n// edited' where name = 'saleorders'");
    await assert.rejects(d.exec(built.downgrade109), /neither v10 nor v9/);
  } finally {
    await d.close();
  }
});

test('upgrade-v10-to-v11.sql moves the page from v10 to v11: only its code changes (enabled and seq stay), and running it again does nothing', async () => {
  for (const enabled of [true, false]) {
    const d = await installed(v10, enabled);
    try {
      const others0 = await othersOf(d);
      await d.exec(built.upgrade1011);
      const r = await rowOf(d);
      assert.equal(r.code, code, 'the stored code is exactly the current (v11) file');
      assert.equal(await md5In(d, r.code), built.md5);
      assert.deepEqual([r.enabled, r.seq], [enabled, 66], 'switched on stays on, switched off stays off');
      assert.deepEqual(await othersOf(d), others0, 'salechat and the other modules are exactly as they were');
      await d.exec(built.upgrade1011);
      assert.deepEqual(await rowOf(d), r, 'run twice: nothing more changes');
    } finally {
      await d.close();
    }
  }
});

test('upgrade-v10-to-v11.sql refuses a page that is neither v10 nor v11, and never overwrites an edited one', async () => {
  const edited = await installed(v10 + '\n// a later edit');
  try {
    const kept = (await rowOf(edited)).code;
    await assert.rejects(edited.exec(built.upgrade1011), /neither v10 nor v11/);
    assert.equal((await rowOf(edited)).code, kept, 'the edited code is still there');
  } finally {
    await edited.close();
  }
  const old = await installed(v9);
  try {
    await assert.rejects(old.exec(built.upgrade1011), /neither v10 nor v11/);
    assert.equal((await rowOf(old)).code, v9, 'the v9 page is still there, untouched');
  } finally {
    await old.close();
  }
});

test('downgrade-v11-to-v10.sql puts v10 back byte for byte, keeps enabled and seq, refuses an edited v11, and is harmless twice', async () => {
  const d = await installed(v10);
  try {
    await d.exec(built.upgrade1011);
    const others0 = await othersOf(d);
    await d.exec(built.downgrade1110);
    const r = await rowOf(d);
    assert.equal(r.code, v10);
    assert.equal(await md5In(d, r.code), V10_MD5, 'the md5 the v10 page had before the upgrade');
    assert.deepEqual([r.enabled, r.seq], [true, 66]);
    assert.deepEqual(await othersOf(d), others0);
    await d.exec(built.downgrade1110);
    assert.equal((await rowOf(d)).code, v10, 'run twice: still v10');
    await d.exec(built.upgrade1011);
    await d.query("update app_modules set code = code || E'\\n// edited' where name = 'saleorders'");
    await assert.rejects(d.exec(built.downgrade1110), /neither v11 nor v10/);
  } finally {
    await d.close();
  }
});

test('ป้ายสีจัดหมวดแชต (tags) are offered as a small menu next to the stage button, and the list row shows the color as a left border', () => {
  assert.match(code, /const TAG=\[\['inquiry','สอบถาม'/, 'the four tags are defined');
  assert.ok(code.includes("data-a=\"tagmenu\""), 'the header has a tag button');
  assert.ok(code.includes("if(a==='tagmenu'){S.tagMenu=!S.tagMenu;S.stageMenu=false;"), 'opening the tag menu closes the stage menu');
  assert.ok(code.includes("if(a==='stagemenu'){S.stageMenu=!S.stageMenu;S.tagMenu=false;"), 'opening the stage menu closes the tag menu');
  assert.ok(code.includes("if(a==='tag'){setTag(el.dataset.k||null);return}"));
  assert.ok(code.includes('async function setTag(k){'));
  assert.ok(code.includes(".update({tag:k,updated_at:now})"), 'the tag is written straight to sale_threads, like the stage');
  assert.ok(code.includes("so-row.tagged{border-left-color:var(--tc,transparent)}"), 'an untagged row keeps a transparent border — no visual change');
});

test('the quick-reply buttons follow the job flow, and a chat has a per-thread responsible person next to its tag', () => {
  assert.match(code, /const TPL=\[\['รับรายละเอียดแล้ว'/, 'the quick-reply buttons are the job-flow set, not the old generic greeting set');
  assert.ok(code.includes("['งานพร้อมรับ','"), 'the last step of the flow is there too');
  assert.doesNotMatch(code, /'ทักทาย'/, 'the old generic greeting template is gone, not just added to');
  assert.match(code, /const STAFF=\['หญิง','ฟิล์ม','พี่ปิ่น'\]/, 'the assignee quick-pick list is the same 3 names as the order form’s own staff datalist');
  assert.ok(code.includes('data-a="assignmenu"'), 'the header has an assignee button');
  assert.ok(code.includes("if(a==='assignmenu'){S.assignMenu=!S.assignMenu;S.stageMenu=false;S.tagMenu=false;"), 'opening the assignee menu closes the other two');
  assert.ok(code.includes("if(a==='tagmenu'){S.tagMenu=!S.tagMenu;S.stageMenu=false;S.assignMenu=false;"), 'opening the tag menu also closes the assignee menu');
  assert.ok(code.includes("if(a==='stagemenu'){S.stageMenu=!S.stageMenu;S.tagMenu=false;S.assignMenu=false;"), 'opening the stage menu also closes the assignee menu');
  assert.ok(code.includes("if(a==='assign'){setAssignee(el.dataset.k);return}"));
  assert.ok(code.includes('async function setAssignee(name){'));
  assert.ok(code.includes('.update({assignee:v,updated_at:now})'), 'the assignee is written straight to sale_threads, like the stage and the tag');
});

test('the customer card offers linking before any order exists, and its purchase stats are computed from that customer’s own orders, not just this thread’s', () => {
  assert.ok(code.includes('function custCard(t){'));
  assert.ok(code.includes('data-a="custlinktoggle"'), 'a thread with no linked customer offers a manual link button');
  assert.ok(code.includes('async function pickThreadCust(id,name,phone){'));
  assert.ok(code.includes(".update({customer_id:id,updated_at:now}).eq('id',tid)"), 'picking a customer writes straight to sale_threads.customer_id');
  assert.ok(code.includes("sb.from('sale_orders').select('total,job_status').eq('customer_id',t.customer_id)"), 'the stats query is scoped to the customer, across every thread of theirs');
  assert.ok(code.includes('isOpenJob(r.job_status)).length'), 'the in-progress count reuses the same open-job rule as the rest of the page');
});

test('the closed-sales summary adds up the orders that are closed by responsible person; delivered-but-not-closed is shown apart and not added in', () => {
  assert.ok(code.includes('data-a="closedsum"'), 'the button is in the list header');
  assert.ok(code.includes("if(a==='closedsum'){openClosedSum();return}"));
  assert.ok(code.includes(".eq('job_status','closed')"), 'only closed orders count as closed');
  assert.ok(code.includes(".eq('job_status','delivered')"), 'delivered-but-not-closed is a separate line');
  assert.ok(code.includes('ไม่ระบุผู้รับผิดชอบ'), 'an order without a responsible person is still counted');
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
