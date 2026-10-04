import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildReply, contactMessages } from '../src/replies.js';
import { createContactState, findContact, notificationText, contactLabel } from '../src/contact.js';
import { isWakeWord } from '../src/wake.js';
import { chatLink } from '../src/line.js';

const shop = JSON.parse(readFileSync(new URL('../data/shop.json', import.meta.url), 'utf8'));
const MIN = 60_000;
const clock = () => {
  let t = 1_000_000;
  return { now: () => t, tick: (ms) => (t += ms) };
};
const cfg = { windowMs: 20 * MIN, gapMs: 60_000 };

test('the three people are หญิง, ฟิล์ม, พี่ปิ่น and the bot answers at once', () => {
  assert.deepEqual(shop.contact.people.map((p) => p.name), ['หญิง', 'ฟิล์ม', 'พี่ปิ่น']);
  assert.equal(shop.replyDelaySeconds, 0);
  assert.equal(shop.contact.quietMinutes, 20);
});

test('the contact card shows the three names as buttons that send "ติดต่อ <name>"', () => {
  const card = contactMessages(shop, 'card')[0];
  const buttons = card.contents.footer.contents;
  assert.deepEqual(buttons.map((b) => b.action.label), ['ติดต่อ หญิง', 'ติดต่อ ฟิล์ม', 'ติดต่อ พี่ปิ่น']);
  assert.deepEqual(buttons.map((b) => b.action.text), buttons.map((b) => b.action.label));
  assert.ok(buttons.every((b) => b.action.label.length <= 20));
  assert.match(JSON.stringify(contactMessages(shop, 'remind')[0]), /ย้ำนะคะ/);
});

test('the black "ติดต่อแอดมิน" button on the menu opens the same card', () => {
  const r = buildReply('ติดต่อแอดมิน', shop);
  assert.equal(r.messages[0].contents.footer.contents.length, 3);
  assert.match(JSON.stringify(r.messages[0]), /ต้องการติดต่อใคร/);
  assert.ok(!r.silent);
});

test('tapping a name is recognised, however it is spaced', () => {
  for (const [t, name] of [['ติดต่อ หญิง', 'หญิง'], ['ติดต่อฟิล์ม', 'ฟิล์ม'], ['ติดต่อ พี่ปิ่น', 'พี่ปิ่น']]) {
    assert.equal(findContact(t, shop)?.name, name, t);
  }
  assert.equal(findContact('ติดต่อใครดี', shop), null);
  assert.equal(findContact('หญิง', shop), null); // the name alone is not a choice
  assert.equal(contactLabel({ name: 'ฟิล์ม' }), 'ติดต่อ ฟิล์ม');
});

test('first unknown message → card; another within a minute → nothing; later → one reminder', () => {
  const c = clock();
  const st = createContactState(c.now);
  assert.equal(st.onUnknown('u1', cfg), 'card');
  c.tick(10_000);
  assert.equal(st.onUnknown('u1', cfg), 'silent'); // no spamming
  c.tick(2 * MIN);
  assert.equal(st.onUnknown('u1', cfg), 'remind');
  c.tick(2 * MIN);
  assert.equal(st.onUnknown('u1', cfg), 'silent'); // reminded once only
});

test('the timed reminder fires once, and only for a customer who has not chosen', () => {
  const st = createContactState(clock().now);
  st.onUnknown('u1', cfg);
  assert.equal(st.dueReminder('u1'), true);
  assert.equal(st.dueReminder('u1'), false);
  st.onUnknown('u2', cfg);
  st.choose('u2', cfg.windowMs);
  assert.equal(st.dueReminder('u2'), false);
  assert.equal(st.dueReminder('nobody'), false);
});

test('once a name is tapped the bot is quiet for 20 minutes of silence, each message extends it', () => {
  const c = clock();
  const st = createContactState(c.now);
  st.choose('u1', cfg.windowMs);
  assert.equal(st.isQuiet('u1', cfg.windowMs), true);
  c.tick(15 * MIN);
  assert.equal(st.isQuiet('u1', cfg.windowMs), true); // a message at 15 min extends the window
  c.tick(15 * MIN);
  assert.equal(st.isQuiet('u1', cfg.windowMs), true);
  c.tick(21 * MIN); // 20+ minutes of nothing
  assert.equal(st.isQuiet('u1', cfg.windowMs), false);
  assert.equal(st.onUnknown('u1', cfg), 'card'); // BOT MODE again
});

test('the customer can bring the bot back, and other customers are not affected', () => {
  const st = createContactState(clock().now);
  st.choose('u1', cfg.windowMs);
  assert.equal(st.isQuiet('u2', cfg.windowMs), false);
  st.wake('u1');
  assert.equal(st.isQuiet('u1', cfg.windowMs), false);
  for (const w of ['เมนู', 'เมนูค่ะ', 'บอท', 'menu']) assert.ok(isWakeWord(w), w);
  assert.ok(!isWakeWord('ขอดูเมนูอาหาร'));
});

test('the notification names the customer and the person they chose', () => {
  const t = notificationText({ customer: 'สมชาย', contact: { name: 'ฟิล์ม' }, said: 'อยากทำไวนิล   ขนาด 1x2' });
  assert.match(t, /🔔 มีลูกค้าทักมา — ต้องการติดต่อ ฟิล์ม/);
  assert.match(t, /ลูกค้า: สมชาย/);
  assert.match(t, /ข้อความ: อยากทำไวนิล ขนาด 1x2/);
  const none = notificationText({ customer: null, contact: null, said: '' });
  assert.match(none, /ยังไม่ได้เลือกว่าจะติดต่อใคร/);
  assert.match(none, /ไม่ทราบชื่อ/);
  assert.ok(!none.includes('ข้อความ:'));
  assert.ok(notificationText({ customer: 'x', contact: null, said: 'ก'.repeat(500) }).length < 250);
});

test('each person has a name and a well-formed LINE user id (U + 32 hex), all different', () => {
  const ppl = shop.contact.people;
  assert.ok(ppl.every((p) => p.name && /^U[0-9a-f]{32}$/.test(p.userId)), 'every id is U + 32 hex characters');
  assert.equal(new Set(ppl.map((p) => p.userId)).size, ppl.length);
});

test('the notification carries a link into the OA chat, and says not to answer in the notification room', () => {
  const link = chatLink('UBOT123', 'UCUST456');
  assert.equal(link, 'https://chat.line.biz/UBOT123/chat/UCUST456');
  const t = notificationText({ customer: 'สมชาย', contact: { name: 'ฟิล์ม' }, said: 'ทดสอบ', link });
  assert.ok(t.includes(link));
  assert.match(t, /อย่าตอบในห้องนี้/);
  // without the bot id (lookup failed) the text still says where to answer
  const bare = notificationText({ customer: 'x', contact: null, said: '', link: null });
  assert.match(bare, /ไม่ใช่ห้องแชทนี้/);
  assert.equal(chatLink(undefined, 'U1'), null);
  assert.equal(chatLink('UBOT', 'anon'), null);
});
