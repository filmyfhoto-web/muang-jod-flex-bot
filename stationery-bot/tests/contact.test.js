import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildReply } from '../src/replies.js';
import { createContactState, findContact, notificationText, contactLabel } from '../src/contact.js';
import { isWakeWord } from '../src/wake.js';
import { chatLink } from '../src/line.js';

const shop = JSON.parse(readFileSync(new URL('../data/shop.json', import.meta.url), 'utf8'));
const MIN = 60_000;
const clock = () => {
  let t = 1_000_000;
  return { now: () => t, tick: (ms) => (t += ms) };
};
const WINDOW = 20 * MIN;

test('the three people are หญิง, ฟิล์ม, พี่ปิ่น and the bot answers at once', () => {
  assert.deepEqual(shop.contact.people.map((p) => p.name), ['หญิง', 'ฟิล์ม', 'พี่ปิ่น']);
  assert.equal(shop.replyDelaySeconds, 0);
  assert.equal(shop.contact.quietMinutes, 20);
});

test('the contact card shows the three names as buttons that send "ติดต่อ <name>"', () => {
  const card = buildReply('ติดต่อแอดมิน', shop).messages[0];
  const buttons = card.contents.footer.contents;
  assert.deepEqual(buttons.map((b) => b.action.label), ['ติดต่อ หญิง', 'ติดต่อ ฟิล์ม', 'ติดต่อ พี่ปิ่น']);
  assert.deepEqual(buttons.map((b) => b.action.text), buttons.map((b) => b.action.label));
  assert.ok(buttons.every((b) => b.action.label.length <= 20));
});

test('the black "ติดต่อแอดมิน" button on the menu opens the same card', () => {
  const r = buildReply('ติดต่อแอดมิน', shop);
  assert.equal(r.messages[0].contents.footer.contents.length, 3);
  assert.match(JSON.stringify(r.messages[0]), /ต้องการติดต่อใคร/);
  assert.ok(!r.silent);
  assert.equal(r.needsPhotos, true); // the server adds the admins' LINE photos
});

test('tapping a name is recognised, however it is spaced', () => {
  for (const [t, name] of [['ติดต่อ หญิง', 'หญิง'], ['ติดต่อฟิล์ม', 'ฟิล์ม'], ['ติดต่อ พี่ปิ่น', 'พี่ปิ่น']]) {
    assert.equal(findContact(t, shop)?.name, name, t);
  }
  assert.equal(findContact('ติดต่อใครดี', shop), null);
  assert.equal(findContact('หญิง', shop), null); // the name alone is not a choice
  assert.equal(contactLabel({ name: 'ฟิล์ม' }), 'ติดต่อ ฟิล์ม');
});

test('"the bot did not understand" alerts: once per customer per window, per customer', () => {
  const c = clock();
  const st = createContactState(c.now);
  const win = 10 * MIN;
  assert.equal(st.alertDue('u1', win), true);
  c.tick(2 * MIN);
  assert.equal(st.alertDue('u1', win), false); // same customer, still inside the window
  assert.equal(st.alertDue('u2', win), true); // another customer is separate
  c.tick(9 * MIN); // 11 minutes since u1's alert
  assert.equal(st.alertDue('u1', win), true);
});

test('once a name is tapped the bot is quiet for 20 minutes of silence, each message extends it', () => {
  const c = clock();
  const st = createContactState(c.now);
  st.choose('u1');
  assert.equal(st.isQuiet('u1', WINDOW), true);
  c.tick(15 * MIN);
  assert.equal(st.isQuiet('u1', WINDOW), true); // a message at 15 min extends the window
  c.tick(15 * MIN);
  assert.equal(st.isQuiet('u1', WINDOW), true);
  c.tick(21 * MIN); // 20+ minutes of nothing
  assert.equal(st.isQuiet('u1', WINDOW), false); // BOT MODE again
});

test('the customer can bring the bot back, and other customers are not affected', () => {
  const st = createContactState(clock().now);
  st.choose('u1');
  assert.equal(st.isQuiet('u2', WINDOW), false);
  st.wake('u1');
  assert.equal(st.isQuiet('u1', WINDOW), false);
  for (const w of ['เมนู', 'เมนูค่ะ', 'บอท', 'menu']) assert.ok(isWakeWord(w), w);
  assert.ok(!isWakeWord('ขอดูเมนูอาหาร'));
});

test('the notification names the customer and the person they chose', () => {
  const t = notificationText({ customer: 'สมชาย', contact: { name: 'ฟิล์ม' }, said: 'อยากทำไวนิล   ขนาด 1x2' });
  assert.match(t, /🔔 มีลูกค้าทักมา — ต้องการติดต่อ ฟิล์ม/);
  assert.match(t, /ลูกค้า: สมชาย/);
  assert.match(t, /ข้อความ: อยากทำไวนิล ขนาด 1x2/);
  const none = notificationText({ customer: null, contact: null, said: '' });
  assert.match(none, /บอทตอบเรื่องนี้ไม่ได้/);
  assert.match(none, /ไม่ทราบชื่อ/);
  assert.ok(!none.includes('ข้อความ:'));
  assert.ok(notificationText({ customer: 'x', contact: null, said: 'ก'.repeat(500) }).length < 250);
});

test('each person has a name and a well-formed LINE user id (U + 32 hex), all different', () => {
  const ppl = shop.contact.people;
  assert.ok(ppl.every((p) => p.name && /^U[0-9a-f]{32}$/.test(p.userId)), 'every id is U + 32 hex characters');
  assert.equal(new Set(ppl.map((p) => p.userId)).size, ppl.length);
});

test('chat links come only from a template the shop sets; none by default', () => {
  assert.equal(chatLink('UBOT', 'UCUST', undefined), null);
  assert.equal(chatLink('UBOT', 'UCUST', ''), null);
  assert.equal(shop.contact.chatLinkTemplate, 'https://chat.line.biz/Ua2a7bf2be3ad317480e20a51f532a766?openExternalBrowser=1');
  assert.equal(chatLink('UBOT', 'UCUST', 'https://x.example/{bot}/chat/{customer}'), 'https://x.example/UBOT/chat/UCUST');
  assert.equal(chatLink(undefined, 'UCUST', 'https://x.example/{bot}/chat/{customer}'), null);
  assert.equal(chatLink('UBOT', 'anon', 'https://x.example/{customer}'), null);
  assert.equal(chatLink(null, 'UCUST', 'https://x.example/c/{customer}'), 'https://x.example/c/UCUST');
});

test('without a link the notification says where to answer: in the OA app', () => {
  const t = notificationText({ customer: 'สมชาย', contact: { name: 'ฟิล์ม' }, said: 'ทดสอบ', link: null });
  assert.match(t, /แอป LINE Official Account/);
  assert.match(t, /ไม่ใช่ห้องแชทนี้/);
  const withLink = notificationText({ customer: 'x', contact: null, said: '', link: 'https://x.example/c/1' });
  assert.match(withLink, /https:\/\/x\.example\/c\/1/);
});

import { contactCard } from '../src/flex.js';
import { notificationCard, contactPhotos } from '../src/contact.js';
import { getProfile, getProfileCached } from '../src/line.js';

const PHOTO = 'https://profile.line-scdn.net/abc123';

test('contact card: a round photo beside the button for each person who has one', () => {
  const card = contactCard(shop, 'ต้องการติดต่อใคร', { ฟิล์ม: PHOTO });
  const rows = card.contents.footer.contents;
  assert.equal(rows.length, 3);
  assert.equal(rows[0].type, 'button'); // หญิง: no photo → plain button
  assert.equal(rows[1].type, 'box'); // ฟิล์ม: photo + button
  const [av, btn] = rows[1].contents;
  assert.equal(av.cornerRadius, '22px'); // clips the image to a circle
  assert.equal(av.contents[0].url, PHOTO);
  assert.equal(btn.action.text, 'ติดต่อ ฟิล์ม');
  assert.equal(contactCard(shop, 'x').contents.footer.contents.every((r) => r.type === 'button'), true);
});

test('notification card: customer photo and name, whom they chose, the message and a button into the OA chat', () => {
  const link = 'https://chat.line.biz/UBOT/chat/UCUST';
  const card = notificationCard(shop, {
    customer: { name: 'สมชาย', picture: PHOTO },
    contact: { name: 'ฟิล์ม', picture: PHOTO + 'f' },
    said: 'อยากทำป้ายไวนิล',
    link,
  });
  const json = JSON.stringify(card);
  assert.match(json, /สมชาย/);
  assert.match(json, /ต้องการติดต่อ/);
  assert.match(json, /ฟิล์ม/);
  assert.match(json, /อยากทำป้ายไวนิล/);
  assert.ok(json.includes(PHOTO) && json.includes(PHOTO + 'f'));
  assert.equal(card.contents.footer.contents[0].action.uri, link);
  assert.equal(notificationCard(shop, { customer: { name: 'ก' }, contact: null, said: '', link: null }).contents.footer, undefined);
  // the phone's banner shows the plain text version
  assert.match(card.altText, /🔔 มีลูกค้าทักมา — ต้องการติดต่อ ฟิล์ม/);
  assert.ok(card.altText.includes(link));
  assert.ok(card.altText.length <= 400);
});

test('notification card without photos or link still works; the "bot could not answer" variant says so', () => {
  const card = notificationCard(shop, { customer: { name: null, picture: null }, contact: null, said: '', link: null });
  const json = JSON.stringify(card);
  assert.match(json, /ไม่ทราบชื่อ/);
  assert.match(json, /บอทตอบเรื่องนี้ไม่ได้/);
  assert.equal(card.contents.footer, undefined);
  assert.ok(!json.includes('"type":"image"'));
  assert.match(card.contents.header.contents[0].text, /บอทตอบไม่ได้/);
});

test('profile lookups: https photos only, failures give empty, admins are cached', async () => {
  const real = globalThis.fetch;
  let calls = 0;
  const reply = (body, status = 200) => async () => {
    calls++;
    return new Response(JSON.stringify(body), { status });
  };
  try {
    globalThis.fetch = reply({ displayName: 'ฟิล์ม', pictureUrl: PHOTO });
    assert.deepEqual(await getProfile('U1', 't'), { name: 'ฟิล์ม', picture: PHOTO });
    globalThis.fetch = reply({ displayName: 'x', pictureUrl: 'http://insecure/a.png' });
    assert.equal((await getProfile('U2', 't')).picture, null);
    globalThis.fetch = reply({}, 404);
    assert.deepEqual(await getProfile('U3', 't'), { name: null, picture: null });
    globalThis.fetch = async () => { throw new Error('offline'); };
    assert.deepEqual(await getProfile('U4', 't'), { name: null, picture: null });
    calls = 0;
    globalThis.fetch = reply({ displayName: 'หญิง', pictureUrl: PHOTO });
    await getProfileCached('UCACHE', 't');
    await getProfileCached('UCACHE', 't');
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = real;
  }
});

test('contactPhotos maps names to photos and skips people without an id or photo', async () => {
  const s = { contact: { people: [{ name: 'ก', userId: 'U1' }, { name: 'ข', userId: 'U2' }, { name: 'ค', userId: '' }] } };
  const out = await contactPhotos(s, async (id) => ({ picture: id === 'U1' ? PHOTO : null }));
  assert.deepEqual(out, { ก: PHOTO });
});

test('unknown messages and media get no reply from the bot: they go to the admins instead', () => {
  assert.equal(shop.replyOnlyKnown, true);
  assert.deepEqual(buildReply('ขอดูรูปตัวอย่างหน่อยค่ะ', shop).messages, []);
  assert.equal(buildReply('ขอดูรูปตัวอย่างหน่อยค่ะ', shop).silent, true); // the server turns this into an alert
  assert.equal(shop.contact.notifyAllMinutes, 10);
  assert.equal(shop.contact.unknown, undefined); // no "reminder" card any more
  assert.equal(shop.contact.remind, undefined);
});

test('a customer asking for a job or an order is pointed to the admins with the contact card', () => {
  for (const t of ['ส่งโฟมบอร์ดจ้า 4 แผ่น\nรร พระธาตุพิทยาคม', 'อยากสั่งทำป้ายไวนิล', 'สั่งงานหน่อยค่ะ']) {
    const r = buildReply(t, shop, {});
    assert.equal(r.needsPhotos, true, t);
    assert.equal(r.alertAdmins, undefined, t); // in order: ask → choose → only then the chosen admin is told
    assert.ok(r.askText.includes('แอดมิน'));
  }
  assert.equal(buildReply('สั่งของ', shop, {}).needsPhotos, undefined); // the web-shop answer stays
  assert.equal(buildReply('ขอบคุณค่ะ', shop, {}).needsPhotos, undefined);
});

test('questions the bot cannot answer get the admin card; known answers still win', () => {
  for (const t of ['ขอถามหน่อยค่ะ', 'รบกวนสอบถามค่ะ', 'มีสินค้าแบบนี้ไหมคะ']) {
    const r = buildReply(t, shop, {});
    assert.equal(r.needsPhotos, true, t);
    assert.equal(r.alertAdmins, undefined, t); // the contact card only: no push to the admins
  }
  assert.equal(buildReply("สั่งทำได้ไหมคะ", shop, {}).needsPhotos, true); // "สั่งทำ" is an order word: the card comes first
  const hours = buildReply('ขอถามเวลาเปิดร้านหน่อยค่ะ', shop, {});
  assert.equal(hours.needsPhotos, undefined); // the opening-hours answer wins
  assert.ok(hours.messages.length > 0);
});

test('the topic buttons ride on the last message of every reply, contact card included', async () => {
  const { withSender, quick } = await import('../src/replies.js');
  const qr = quick(shop);
  assert.ok(qr.items.length > 0);
  const out = withSender([{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }], 'https://x.example', qr);
  assert.equal(out[0].quickReply, undefined);
  assert.equal(out[1].quickReply, qr);
  const own = { items: [] };
  assert.equal(withSender([{ type: 'text', text: 'a', quickReply: own }], null, qr)[0].quickReply, own);
});

test('unknown messages: nothing is sent and nobody is alerted', () => {
  assert.equal(shop.contact.receivedNote, '');
  assert.equal(shop.contact.askOnUnknown, false);
});

test('switched-off topics (payment, promotion, receipt, products) get nothing and alert nobody', () => {
  for (const t of ['โอนยังไง', 'ส่วนลดมีไหม', 'ขอใบเสร็จ', 'ปากกา', 'ขอถามเรื่องโปรโมชั่นหน่อย']) {
    const r = buildReply(t, shop, {});
    assert.deepEqual(r.messages, [], t);
    assert.equal(r.silent, true, t);
    assert.equal(r.quiet, true, t); // the server neither sends the note nor alerts the admins
  }
  assert.equal(buildReply('xyz', shop, {}).quiet, undefined); // other unknowns still reach the admins
});

test('only orders alert the admins; hello still shows the "who?" card', () => {
  assert.equal(shop.contact.notify, true);
  assert.equal(buildReply('สวัสดีค่ะ', shop, {}).thenContact, true);
  assert.equal(buildReply("โฟมบอร์ด", shop, {}).needsPhotos, true); // an order → card first, the alert follows the choice
  const q = buildReply('xyz', shop, {});
  assert.equal(q.silent, true);
  assert.equal(q.alertAdmins, undefined); // not understood → no alert
});

test('an order alert says what it is about, not that the bot could not answer', () => {
  const card = notificationCard(shop, { customer: { name: 'ก' }, contact: null, said: 'โฟมบอร์ด', link: null, reason: 'ลูกค้าสั่งงาน/สั่งของ' });
  const json = JSON.stringify(card);
  assert.ok(json.includes('ลูกค้าสั่งงาน/สั่งของ') && !json.includes('บอทตอบเรื่องนี้ไม่ได้'));
});
