import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAppFlow } from '../src/app/flow.js';
import { makeFakes, settings, orderRow, textEv, followEv, imageEv, batch, OWNER, OTHER, STAFF } from './helpers/app-fakes.js';

const quietLog = { info() {}, error() {}, warn() {} };
const HOUR = 3600e3;

// A flow wired to the fakes. `others` records what comes back to the Render bot's own answers.
async function setup(opts = {}) {
  const f = makeFakes(opts);
  const got = [];
  const picks = [];
  let isPaused = false;
  const clock = { t: Date.parse('2026-10-20T03:00:00Z') };
  const now = () => clock.t;
  const flow = await createAppFlow({
    env: { SUPABASE_URL: 'https://proj.supabase.co' },
    store: f.fake,
    fetch: f.doFetch,
    now,
    log: quietLog,
    others: async (events) => {
      got.push(...events);
    },
    onPick: async (ev, admin) => {
      picks.push({ uid: ev.source.userId, admin: admin.name });
    },
    skip: opts.skip,
    paused: () => isPaused,
  });
  const send = (...events) => flow.handle(batch(...events), 'sig', events);
  return { ...f, flow, got, picks, send, clock, pause: (v) => (isPaused = v) };
}
const kinds = (msgs) => msgs.map((m) => m.type);
const textOfAll = (msgs) => msgs.map((m) => m.text ?? m.altText ?? '').join('\n');

test('off without the database settings, and never throws', async () => {
  const flow = await createAppFlow({ env: {}, others: async () => {}, log: quietLog });
  assert.equal(flow, null);
  await assert.rejects(() => createAppFlow({ store: {} }), /others/);
});

// ---- order cards ------------------------------------------------------------------------------------------------

test('"ขอใบสั่งซื้อ NT-0044" from the customer who ordered gets the order card, is marked read and tagged', async () => {
  const t = await setup();
  await t.send(textEv('ขอใบสั่งซื้อ NT-0044'));
  assert.deepEqual(kinds(t.sent()), ['flex']);
  assert.match(t.sent()[0].altText, /NT-0044/);
  assert.equal(t.marked().length, 1);
  assert.match(t.fake.orderNotify('NT-0044'), /c:sent/);
  assert.deepEqual(t.got, [], 'nothing is left for the Render bot');
});

test('somebody else\'s order is not shown, staff may see any order and are not tagged', async () => {
  const t = await setup();
  await t.send(textEv('ขอใบสั่งซื้อ NT-0044', OTHER));
  assert.match(t.sent()[0].text, /ไม่พบใบสั่งซื้อ|ร้านได้รับข้อความแล้ว/);
  assert.equal(t.fake.orderNotify('NT-0044'), '');
  const s = await setup();
  await s.send(textEv('ขอใบสั่งซื้อ NT-0044', STAFF));
  assert.deepEqual(kinds(s.sent()), ['flex']);
  assert.equal(s.fake.orderNotify('NT-0044'), '', 'a staff member looking at it does not mark it as sent to the customer');
});

test('confirmation card: waits until the shop has confirmed, then shows it', async () => {
  const t = await setup();
  await t.send(textEv('ขอการ์ดยืนยัน NT-0044'));
  assert.match(t.sent()[0].text, /ร้านกำลังตรวจสอบออเดอร์ NT-0044/);
  const c = await setup({ orders: [orderRow({ line_notify: 'k:ok' })] });
  await c.send(textEv('ขอการ์ดยืนยัน NT-0044'));
  assert.deepEqual(kinds(c.sent()), ['flex']);
  assert.match(c.fake.orderNotify('NT-0044'), /k:sent/);
});

test('"📦 ส่งออเดอร์ NT-0044" answers with the card but is NOT marked read (the admins see it); unknown order gets the holding note', async () => {
  const t = await setup();
  await t.send(textEv('📦 ส่งออเดอร์ NT-0044\nปากกา x2'));
  assert.deepEqual(kinds(t.sent()), ['flex']);
  assert.equal(t.marked().length, 0);
  const u = await setup({ orders: [] });
  await u.send(textEv('📦 ส่งออเดอร์ NT-0999'));
  assert.match(u.sent()[0].text, /แอดมินจะตรวจสอบออเดอร์ NT-0999/);
});

test('a cancelled order is said to be cancelled', async () => {
  const t = await setup({ orders: [orderRow({ status: 'cancelled' })] });
  await t.send(textEv('ขอใบสั่งซื้อ NT-0044'));
  assert.match(t.sent()[0].text, /ยกเลิกแล้ว/);
});

// ---- the shop menu ----------------------------------------------------------------------------------------------

test('menu card: follow, first message after 60 minutes, and "เมนู"; not for the same visit', async () => {
  const t = await setup({ line_bot: settings({ menu_card: true }) });
  await t.send(followEv());
  assert.deepEqual(kinds(t.sent()), ['text', 'imagemap']);
  assert.match(t.sent()[0].text, /ร้านนัฐภรณ์ เชียงกลาง/);
  assert.equal(t.sent()[1].actions.length, 3);
  assert.equal(t.sent()[1].baseUrl, 'https://proj.supabase.co/functions/v1/line-assets/qm/v2');
  assert.deepEqual(t.sent()[1].actions.map((a) => a.type === 'uri' ? a.linkUri : a.text), ['https://www.nattagroup.com', 'ส่งเอกสารโครงการ', 'คุยกับแอดมิน']);
  assert.deepEqual(t.sent()[1].quickReply.items.map((i) => i.action.label).slice(0, 4), ['สั่งซื้อสินค้า', 'ส่งเอกสารโครงการ', 'คุยกับแอดมิน', 'เวลาเปิดร้าน']);
  assert.ok(t.fake.chatOf(OWNER).menu_ms);
  // first message right after: same visit, so it is NOT answered with a second menu
  const before = t.replies().length;
  await t.send(textEv('ขอราคาปากกาหน่อย'));
  assert.equal(t.replies().length, before, 'no second menu');
  assert.equal(t.got.length, 1, 'an ordinary message goes on to the Render bot');
  // an hour of silence, then a message → menu again
  t.clock.t += 61 * 60e3;
  await t.send(textEv('สวัสดีค่ะ'));
  assert.equal(t.replies().length, before + 1);
  assert.deepEqual(kinds(t.replies().at(-1).body.messages), ['text', 'imagemap']);
  // the word "เมนู" always works
  await t.send(textEv('เมนู'));
  assert.equal(t.replies().length, before + 2);
});

test('menu card: the four old buttons are not answered with the menu, they go to the Render bot', async () => {
  const t = await setup({ line_bot: settings({ menu_card: true }), chat: { [OWNER]: { mode: 'bot', seen_ms: 0 } } });
  t.clock.t += 5 * HOUR;
  for (const w of ['เวลาเปิดร้าน', 'สั่งของ', 'อุปกรณ์การเรียน 2-69', 'ที่ตั้งร้าน']) await t.send(textEv(w));
  assert.equal(t.replies().length, 0);
  assert.deepEqual(t.got.map((e) => e.message.text), ['เวลาเปิดร้าน', 'สั่งของ', 'อุปกรณ์การเรียน 2-69', 'ที่ตั้งร้าน']);
});

// ---- talk to an admin -------------------------------------------------------------------------------------------

test('admin pick: ask → card with the three names; pick → confirmation, quiet for 24 h, the person is told; "เมนู" brings the bot back', async () => {
  const t = await setup({ line_bot: settings({ admin_pick: true, menu_card: true, admins: [{ name: 'เจ้ปิ่น', note: 'ร้านเครื่องเขียน' }, { name: 'หญิง', note: 'ร้านเครื่องเขียน' }, { name: 'ฟิล์ม', note: 'ถ่ายรูป · ถ่ายเอกสาร · ไวนิล' }] }) });
  await t.send(textEv('คุยกับแอดมิน'));
  assert.deepEqual(kinds(t.sent()), ['flex']);
  assert.equal(t.sent()[0].quickReply.items.length, 3);
  await t.send(textEv('คุยกับเจ้ปิ่น'));
  assert.match(t.sent().at(-1).text, /เลือกคุยกับ เจ้ปิ่น \(ร้านเครื่องเขียน\) แล้วค่ะ/);
  assert.equal(t.fake.chatOf(OWNER).mode, 'admin');
  assert.equal(t.fake.chatOf(OWNER).admin_name, 'เจ้ปิ่น');
  assert.deepEqual(t.picks, [{ uid: OWNER, admin: 'เจ้ปิ่น' }]);
  // 23 hours later: still quiet, nothing sent, nothing left for the Render bot, the window slides
  const n = t.replies().length;
  t.clock.t += 23 * HOUR;
  await t.send(textEv('ขอราคาโฟมบอร์ด'));
  await t.send(imageEv());
  assert.equal(t.replies().length, n);
  assert.equal(t.got.length, 0);
  assert.equal(t.marked().length, 0, 'never marked as read');
  // "เมนู" ends it and sends the menu
  await t.send(textEv('เมนู'));
  assert.equal(t.fake.chatOf(OWNER).mode, 'bot');
  assert.deepEqual(kinds(t.replies().at(-1).body.messages), ['text', 'imagemap']);
});

test('admin pick: a name typed alone also works; a quiet window older than 24 h has ended', async () => {
  const t = await setup({ line_bot: settings({ admin_pick: true, admins: [{ name: 'หญิง', note: '' }] }) });
  await t.send(textEv('หญิง'));
  assert.match(t.sent().at(-1).text, /เลือกคุยกับ หญิง/);
  t.clock.t += 25 * HOUR;
  await t.send(textEv('ขอบคุณค่ะ'));
  assert.equal(t.got.length, 1, 'after 24 hours the bot answers again');
});

// ---- project documents ------------------------------------------------------------------------------------------

test('"ส่งเอกสารโครงการ" gives the link card when documents are on, and goes to the Render bot when they are off', async () => {
  const on = await setup({ line_bot: settings({ docs: true }) });
  await on.send(textEv('ส่งเอกสารโครงการ'));
  assert.deepEqual(kinds(on.sent()), ['flex']);
  assert.match(JSON.stringify(on.sent()[0]), /nattagroup\.com\/pj\.html/);
  assert.equal(on.got.length, 0);
  const off = await setup({ line_bot: settings({ docs: false }) });
  await off.send(textEv('ส่งเอกสารโครงการ'));
  assert.equal(off.replies().length, 0);
  assert.equal(off.got.length, 1);
});

// ---- hand-over and safety ---------------------------------------------------------------------------------------

test('with every switch off (today\'s settings) only order cards are answered; the rest is the Render bot\'s', async () => {
  const t = await setup({ line_bot: settings() });
  await t.send(followEv());
  await t.send(textEv('เมนู'));
  await t.send(textEv('คุยกับแอดมิน'));
  await t.send(textEv('ขอใบสั่งซื้อ NT-0044'));
  assert.equal(t.replies().length, 1);
  assert.deepEqual(t.got.map((e) => e.type === 'follow' ? 'follow' : e.message.text), ['follow', 'เมนู', 'คุยกับแอดมิน']);
});

test('a batch with an order request and an ordinary message: each goes where it belongs, once', async () => {
  const t = await setup();
  await t.send(textEv('ขอใบสั่งซื้อ NT-0044'), textEv('อยากได้สมุดเล่มละ 10 บาท'));
  assert.equal(t.replies().length, 1);
  assert.deepEqual(t.got.map((e) => e.message.text), ['อยากได้สมุดเล่มละ 10 บาท']);
});

// ---- the Render bot's own commands ------------------------------------------------------------------------------

// stands in for server.js's isOwnCommand: the Render bot's admin / set-up words
const ownCommand = (ev) => ev.type === 'message' && /^(?:ติดตั้งเมนู|ปิดบอท|เปิดบอท|แอดมินออนไลน์|ไอดีฉัน)$/.test(String(ev.message?.text ?? '').trim());

test('the Render bot\'s own commands go straight to it: never answered with the shop menu or the admin picker', async () => {
  const t = await setup({ line_bot: settings({ menu_card: true, admin_pick: true }), skip: ownCommand });
  // the first message in ages would get the menu card, and "แอดมินออนไลน์" has "แอดมิน" in it, which would open the picker
  await t.send(textEv('ติดตั้งเมนู', STAFF), textEv('แอดมินออนไลน์', STAFF), textEv('ไอดีฉัน', OTHER));
  assert.equal(t.calls.length, 0, 'the app says nothing');
  assert.deepEqual(t.got.map((e) => e.message.text), ['ติดตั้งเมนู', 'แอดมินออนไลน์', 'ไอดีฉัน']);
  assert.equal(t.fake.chatOf(STAFF)?.seen_ms ?? 0, 0, 'a command is not a visit');
  // …and an ordinary first message from the same person is still a customer\'s first message
  await t.send(textEv('สวัสดีค่ะ', STAFF));
  assert.deepEqual(kinds(t.replies().at(-1).body.messages), ['text', 'imagemap']);
});

test('a "skip" that fails counts as "not a command", and without one nothing is skipped', async () => {
  const bad = await setup({ line_bot: settings({ menu_card: true }), skip: () => { throw new Error('boom'); } });
  await bad.send(textEv('ติดตั้งเมนู'));
  assert.deepEqual(kinds(bad.replies().at(-1).body.messages), ['text', 'imagemap']);
  const none = await setup({ line_bot: settings({ menu_card: true }) });
  await none.send(textEv('ติดตั้งเมนู'));
  assert.deepEqual(kinds(none.replies().at(-1).body.messages), ['text', 'imagemap']);
});

test('while the bot is paused customers get nothing, but an admin\'s own command ("เปิดบอท") still reaches the Render bot', async () => {
  const t = await setup({ line_bot: settings({ menu_card: true, admin_pick: true }), skip: ownCommand });
  t.pause(true);
  const out = await t.send(textEv('เวลาเปิดร้าน', OTHER), followEv(), textEv('เปิดบอท', STAFF));
  assert.equal(out.bypass, 'paused');
  assert.equal(t.calls.length, 0);
  assert.deepEqual(t.got.map((e) => e.message?.text), ['เปิดบอท']);
});

test('settings that cannot be read: everything goes to the Render bot and nothing is sent by the app', async () => {
  const t = await setup({ line_bot: settings({ menu_card: true, admin_pick: true, docs: true }) });
  t.fake.broken = true;
  await t.send(followEv(), textEv('ขอใบสั่งซื้อ NT-0044'), textEv('เมนู'));
  assert.equal(t.calls.length, 0);
  assert.equal(t.got.length, 3);
  // a short outage after a good read keeps using the last good copy instead of failing over
  const u = await setup({ line_bot: settings({ menu_card: true }) });
  await u.send(textEv('x'));
  u.fake.broken = true;
  u.clock.t += 60e3;
  const before = u.replies().length;
  await u.send(followEv());
  assert.equal(u.replies().length, before + 1, 'the follow is still answered by the app');
  assert.deepEqual(kinds(u.replies().at(-1).body.messages), ['text', 'imagemap']);
});

test('chat state that cannot be read: nobody is sent a menu because of it', async () => {
  const t = await setup({ line_bot: settings({ menu_card: true }) });
  t.fake.chatBroken = true;
  await t.send(textEv('สวัสดีค่ะ'));
  assert.equal(t.replies().length, 0);
  assert.equal(t.got.length, 1);
});

test('"enabled": false in the app settings switches all of it off; a paused bot says nothing at all', async () => {
  const t = await setup({ line_bot: settings({ enabled: false, menu_card: true }) });
  await t.send(textEv('ขอใบสั่งซื้อ NT-0044'), followEv());
  assert.equal(t.calls.length, 0);
  assert.equal(t.got.length, 2);
  const p = await setup();
  p.pause(true);
  await p.send(textEv('ขอใบสั่งซื้อ NT-0044'));
  assert.equal(p.calls.length, 0);
  assert.equal(p.got.length, 0);
});

test('status() tells which parts are on', async () => {
  const t = await setup({ line_bot: settings({ menu_card: true, docs: 'trial' }) });
  assert.deepEqual(t.flow.status(), { menu: false, pick: false, docs: false, enabled: false }, 'nothing is known before the first message');
  await t.send(textEv('x'));
  assert.deepEqual(t.flow.status(), { menu: true, pick: false, docs: true, enabled: true });
});
