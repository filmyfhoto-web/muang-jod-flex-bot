import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildRichMenu, loadMenuImage, installRichMenu, removeRichMenu, menuCommandReply, ForeignMenuError, WIDTH, HEIGHT, MAX_BYTES } from '../src/richmenu.js';
import { parseAdminCommand } from '../src/quiet.js';
import { isMenuTap } from '../src/matcher.js';
import { buildReply } from '../src/replies.js';
import { slipReply } from '../src/slip.js';

const shop = JSON.parse(readFileSync(new URL('../data/shop.json', import.meta.url), 'utf8'));
const IMAGE = new URL('../assets/richmenu.png', import.meta.url).pathname;

const quietLog = { log() {}, error() {} };

// A LINE API that remembers what it was asked. `menus` = the rich menus that already exist.
const fakeLine = ({ menus = [], defaultId = null, failOn = null } = {}) => {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    const u = url.replace('https://api.line.me/v2/bot', 'API').replace('https://api-data.line.me/v2/bot', 'DATA');
    calls.push({ method: opts.method, url: u, headers: opts.headers, body: opts.body });
    const reply = (status, body = {}) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });
    if (failOn && `${opts.method} ${u}`.includes(failOn)) return reply(400, { message: 'bad picture' });
    if (opts.method === 'POST' && u === 'API/richmenu') return reply(200, { richMenuId: 'richmenu-new' });
    if (opts.method === 'GET' && u === 'API/richmenu/list') return reply(200, { richmenus: menus });
    if (opts.method === 'GET' && u === 'API/user/all/richmenu') return defaultId ? reply(200, { richMenuId: defaultId }) : reply(404, { message: 'no default' });
    return reply(200);
  };
  return { fetchImpl, calls, seen: () => calls.map((c) => `${c.method} ${c.url}`) };
};

test('the menu is one row of equal tappable columns, open by default, inside LINE\'s limits', () => {
  const m = buildRichMenu(shop);
  assert.deepEqual(m.size, { width: 2500, height: 843 });
  assert.equal(m.selected, true);
  assert.ok([...m.chatBarText].length <= 14);
  assert.equal(m.areas.length, 2);
  let x = 0;
  for (const a of m.areas) {
    assert.equal(a.bounds.x, x); // no gaps, no overlap
    assert.ok(a.bounds.y >= 0 && a.bounds.y + a.bounds.height <= HEIGHT);
    assert.ok(a.bounds.width > 0);
    x += a.bounds.width;
    assert.equal(a.action.type, 'message');
    assert.ok([...a.action.label].length <= 20);
  }
  assert.equal(x, WIDTH); // the columns cover the whole width
  assert.deepEqual(m.areas.map((a) => a.action.text), ['สั่งของ', 'ติดต่อแอดมิน']);
  assert.equal(m.areas[0].bounds.y, 150); // the title strip is not tappable
});

test('a column can open a web page; only https links are accepted', () => {
  const menu = (areas) => buildRichMenu({ richMenu: { areas } });
  const m = menu([{ label: 'เว็บร้าน', uri: 'https://example.com/shop?a=1' }, { text: 'สั่งของ' }]);
  assert.deepEqual(m.areas[0].action, { type: 'uri', label: 'เว็บร้าน', uri: 'https://example.com/shop?a=1' });
  assert.deepEqual(m.areas[1].action, { type: 'message', label: 'สั่งของ', text: 'สั่งของ' });
  assert.equal(menu([{ uri: 'https://example.com' }]).areas[0].action.label, 'เปิดเว็บ'); // a label is always sent
  for (const bad of ['http://example.com', 'example.com', 'javascript:alert(1)', 'https://', 'line://nv/chat']) {
    assert.throws(() => menu([{ label: 'x', uri: bad }]), /uri ต้องเป็นลิงก์ https/, bad);
  }
});

test('a broken menu setting is rejected with a clear message', () => {
  assert.throws(() => buildRichMenu({}), /richMenu\.areas/);
  assert.throws(() => buildRichMenu({ richMenu: { areas: [] } }), /richMenu\.areas/);
  assert.throws(() => buildRichMenu({ richMenu: { areas: Array.from({ length: 7 }, (_, i) => ({ text: `t${i}` })) } }), /ไม่เกิน/);
  assert.throws(() => buildRichMenu({ richMenu: { areas: [{ label: 'x', text: ' ' }] } }), /ไม่มี text/);
});

test('the menu picture in the project is exactly what LINE accepts: PNG, 2500×843, under 1 MB', () => {
  const img = loadMenuImage(IMAGE);
  assert.equal(img.mime, 'image/png');
  assert.ok(img.bytes.length < MAX_BYTES);
  assert.equal(img.bytes.readUInt32BE(16), 2500);
  assert.equal(img.bytes.readUInt32BE(20), 843);
});

test('a missing, oversized, wrong-type or wrong-size picture is explained, not sent to LINE', () => {
  const dir = mkdtempSync(join(tmpdir(), 'menu-'));
  assert.throws(() => loadMenuImage(join(dir, 'nope.png')), /ไม่พบไฟล์/);
  const txt = join(dir, 'a.png');
  writeFileSync(txt, Buffer.from('not a picture at all, just words'));
  assert.throws(() => loadMenuImage(txt), /PNG หรือ JPEG/);
  const small = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(small, 0);
  small.writeUInt32BE(100, 16);
  small.writeUInt32BE(100, 20);
  const f = join(dir, 'small.png');
  writeFileSync(f, small);
  assert.throws(() => loadMenuImage(f), /2500×843.*100×100/);
  const big = join(dir, 'big.jpg');
  writeFileSync(big, Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(MAX_BYTES + 1)]));
  assert.throws(() => loadMenuImage(big), /1 MB/);
});

test('install: create → upload the picture → make it everyone\'s default → only then remove older copies of OUR menu', async () => {
  const line = fakeLine({
    menus: [
      { richMenuId: 'richmenu-old', name: 'stationery-bot-menu' },
      { richMenuId: 'richmenu-new', name: 'stationery-bot-menu' },
      { richMenuId: 'richmenu-other', name: 'a menu somebody else made' },
    ],
  });
  const r = await installRichMenu({ token: 'tok', shop, imageFile: IMAGE, fetchImpl: line.fetchImpl });
  assert.deepEqual(r, { richMenuId: 'richmenu-new', replaced: 1 });
  assert.deepEqual(line.seen(), [
    'GET API/user/all/richmenu', // is another system's menu already the default? (none here → 404)
    'POST API/richmenu',
    'POST DATA/richmenu/richmenu-new/content',
    'POST API/user/all/richmenu/richmenu-new',
    'GET API/richmenu/list',
    'DELETE API/richmenu/richmenu-old', // the old copy only — not the new one, not someone else's
  ]);
  const create = line.calls.find((c) => c.method === 'POST' && c.url === 'API/richmenu');
  const upload = line.calls.find((c) => c.url.endsWith('/content'));
  assert.equal(create.headers.Authorization, 'Bearer tok');
  assert.equal(JSON.parse(create.body).name, 'stationery-bot-menu');
  assert.equal(upload.headers['Content-Type'], 'image/png');
  assert.ok(Buffer.isBuffer(upload.body) && upload.body.length > 1000);
});

test('install: when the picture is refused the half-made menu is deleted again and the reason is passed on', async () => {
  const line = fakeLine({ failOn: 'POST DATA/richmenu/richmenu-new/content' });
  await assert.rejects(installRichMenu({ token: 'tok', shop, imageFile: IMAGE, fetchImpl: line.fetchImpl }), /400.*bad picture/);
  assert.deepEqual(line.seen(), ['GET API/user/all/richmenu', 'POST API/richmenu', 'POST DATA/richmenu/richmenu-new/content', 'DELETE API/richmenu/richmenu-new']);
});

test('the token never appears in an error message', async () => {
  const line = fakeLine({ failOn: 'POST API/richmenu' });
  await assert.rejects(installRichMenu({ token: 'SECRET-TOKEN', shop, imageFile: IMAGE, fetchImpl: line.fetchImpl }), (e) => !e.message.includes('SECRET-TOKEN'));
});

test('remove: takes away only our menu, un-sets it as the default first, and reports how many', async () => {
  const line = fakeLine({
    menus: [
      { richMenuId: 'richmenu-ours', name: 'stationery-bot-menu' },
      { richMenuId: 'richmenu-other', name: 'someone else' },
    ],
    defaultId: 'richmenu-ours',
  });
  assert.equal(await removeRichMenu({ token: 'tok', shop, fetchImpl: line.fetchImpl }), 1);
  assert.deepEqual(line.seen(), ['GET API/richmenu/list', 'GET API/user/all/richmenu', 'DELETE API/user/all/richmenu', 'DELETE API/richmenu/richmenu-ours']);
});

test('remove: nothing of ours installed → nothing is touched', async () => {
  const line = fakeLine({ menus: [{ richMenuId: 'richmenu-other', name: 'someone else' }] });
  assert.equal(await removeRichMenu({ token: 'tok', shop, fetchImpl: line.fetchImpl }), 0);
  assert.deepEqual(line.seen(), ['GET API/richmenu/list']);
});

test('admin commands: "ติดตั้งเมนู" / "ลบเมนู" — and a customer\'s "เมนู" is not one', () => {
  assert.deepEqual(parseAdminCommand('ติดตั้งเมนู'), { type: 'menuInstall', force: false });
  assert.deepEqual(parseAdminCommand('ตั้งเมนู'), { type: 'menuInstall', force: false });
  assert.deepEqual(parseAdminCommand('ติดตั้งเมนู ทับ'), { type: 'menuInstall', force: true });
  assert.deepEqual(parseAdminCommand('ลบเมนู'), { type: 'menuRemove' });
  assert.equal(parseAdminCommand('เมนู'), null);
});

test('what a menu button or a topic chip sends is recognised as a tap', () => {
  for (const t of ['สั่งของ', 'ติดต่อแอดมิน', 'เวลาเปิด - ปิด', 'ที่ตั้งร้าน', 'สั่งของค่ะ']) assert.equal(isMenuTap(t, shop), true, t);
  for (const t of ['xyz', 'สั่งของ 3 กล่อง', '', 'ขอถามหน่อย']) assert.equal(isMenuTap(t, shop), false, t);
});

test('the "ส่งเอกสารโครงการ" button asks who to talk to, and files are thanked as files', () => {
  const r = buildReply('ส่งเอกสารโครงการ', shop, {});
  assert.equal(r.needsPhotos, true);
  assert.equal(r.askText, shop.contact.documentAsk);
  assert.ok(r.askText.includes('ไฟล์'));
  assert.equal(buildReply('สั่งของ', shop, {}).needsPhotos, undefined); // the order button still answers with the web-shop card
  assert.equal(buildReply('ติดต่อแอดมิน', shop, {}).needsPhotos, true);
  const f = JSON.stringify(slipReply(shop, { sure: false, kind: 'file' }));
  assert.ok(f.includes('ได้รับไฟล์แล้ว') && !f.includes('สลิป'));
  assert.ok(JSON.stringify(slipReply(shop, { sure: false })).includes('ได้รับรูปแล้ว'));
});

test('install refuses to replace a menu another system put there — unless the admin says "ทับ"', async () => {
  const line = fakeLine({ menus: [{ richMenuId: 'richmenu-shopapp', name: 'natta-group-menu' }], defaultId: 'richmenu-shopapp' });
  await assert.rejects(installRichMenu({ token: 'tok', shop, imageFile: IMAGE, fetchImpl: line.fetchImpl }), (e) => e instanceof ForeignMenuError && e.menuName === 'natta-group-menu');
  assert.deepEqual(line.seen(), ['GET API/user/all/richmenu', 'GET API/richmenu/list']); // nothing was created or deleted
  const forced = fakeLine({ menus: [{ richMenuId: 'richmenu-shopapp', name: 'natta-group-menu' }], defaultId: 'richmenu-shopapp' });
  const r = await installRichMenu({ token: 'tok', shop, imageFile: IMAGE, force: true, fetchImpl: forced.fetchImpl });
  assert.equal(r.richMenuId, 'richmenu-new');
  assert.ok(!forced.seen().some((c) => c.startsWith('DELETE'))); // the other system's menu is replaced as the default, never deleted
});

test('install: our own menu as the current default (a re-install) or no default at all needs no "ทับ"', async () => {
  const own = fakeLine({ menus: [{ richMenuId: 'richmenu-old', name: 'stationery-bot-menu' }], defaultId: 'richmenu-old' });
  assert.equal((await installRichMenu({ token: 'tok', shop, imageFile: IMAGE, fetchImpl: own.fetchImpl })).replaced, 1);
  const none = fakeLine({});
  assert.equal((await installRichMenu({ token: 'tok', shop, imageFile: IMAGE, fetchImpl: none.fetchImpl })).richMenuId, 'richmenu-new');
});

test('the menu command is OFF in the shop file until the owner turns it on, and nothing is called while it is off', async () => {
  assert.equal(shop.richMenu.enabled, false);
  const line = fakeLine({});
  const text = await menuCommandReply({ cmd: { type: 'menuInstall', force: false }, shop, token: 'tok', imageFile: IMAGE, fetchImpl: line.fetchImpl, log: quietLog });
  assert.match(text, /ยังไม่เปิด/);
  assert.deepEqual(line.seen(), []);
});

test('with the menu command on: install says done; a foreign menu is explained; a LINE error is passed on; "ลบเมนู" always works', async () => {
  const on = { ...shop, richMenu: { ...shop.richMenu, enabled: true } };
  const ok = fakeLine({});
  assert.match(await menuCommandReply({ cmd: { type: 'menuInstall' }, shop: on, token: 'tok', imageFile: IMAGE, fetchImpl: ok.fetchImpl, log: quietLog }), /ติดตั้งเมนูเรียบร้อย/);
  const foreign = fakeLine({ menus: [{ richMenuId: 'richmenu-x', name: 'natta-group-menu' }], defaultId: 'richmenu-x' });
  const t = await menuCommandReply({ cmd: { type: 'menuInstall' }, shop: on, token: 'tok', imageFile: IMAGE, fetchImpl: foreign.fetchImpl, log: quietLog });
  assert.match(t, /natta-group-menu/);
  assert.match(t, /ติดตั้งเมนู ทับ/);
  const bad = fakeLine({ failOn: 'POST API/richmenu' });
  assert.match(await menuCommandReply({ cmd: { type: 'menuInstall' }, shop: on, token: 'tok', imageFile: IMAGE, fetchImpl: bad.fetchImpl, log: quietLog }), /ไม่สำเร็จ/);
  const gone = fakeLine({ menus: [{ richMenuId: 'richmenu-ours', name: 'stationery-bot-menu' }], defaultId: 'richmenu-ours' });
  assert.match(await menuCommandReply({ cmd: { type: 'menuRemove' }, shop, token: 'tok', fetchImpl: gone.fetchImpl, log: quietLog }), /เอาเมนูออกแล้ว/); // even while installing is off
});

test('the welcome card on "add friend" can be switched off (when the OA\'s own greeting is kept)', () => {
  assert.equal(shop.welcome, true);
});
