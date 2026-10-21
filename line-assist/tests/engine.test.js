import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, CUSTOMER, CUSTOMER2, IDS, MIN, HOUR, textsOf } from './_line.js';
import { makeShop } from './_shop.js';
import { shopChips } from '../src/chips.js';

const lastReply = (t) => t.log.replies.at(-1);
const flexText = (m) => textsOf(m);

test('an answer the shop has set up: one free reply, with the topic buttons under it', async () => {
  const t = setup();
  assert.equal(await t.say(CUSTOMER, 'ร้านเปิดกี่โมงคะ'), 'reply');
  assert.equal(t.log.replies.length, 1);
  assert.equal(t.log.pushes.length, 0); // a reply costs nothing
  const [m] = lastReply(t).messages;
  assert.equal(m.type, 'flex');
  assert.match(flexText(m), /07\.30 - 18\.00/);
  assert.equal(m.sender, undefined); // same face as the shop's own messages
  assert.deepEqual(m.quickReply.items.map((i) => i.action.text ?? i.action.uri), ['เวลาเปิดร้าน', 'สั่งของ', 'อุปกรณ์การเรียน 2-69', 'ที่ตั้งร้าน']);
});

test('the shop picture can be switched on as the sender\'s avatar', async () => {
  const t = setup({ shop: makeShop({ senderIcon: true }) });
  await t.say(CUSTOMER, 'ร้านเปิดกี่โมงคะ');
  assert.equal(lastReply(t).messages[0].sender.iconUrl, 'https://pics.example/line-assist/icon.png');
});

test('with the shop\'s own buttons known, they are the ones under our answers too', async () => {
  const chips = shopChips({}, 'https://x.supabase.co/functions/v1/line-assets');
  const t = setup({ shop: makeShop({ chips }) });
  await t.say(CUSTOMER, 'ร้านเปิดกี่โมงคะ');
  const items = lastReply(t).messages[0].quickReply.items;
  assert.deepEqual(items.map((i) => i.action.label), ['สั่งซื้อสินค้า', 'ส่งเอกสารโครงการ', 'คุยกับแอดมิน', 'เวลาเปิดร้าน', 'สั่งของ', 'อุปกรณ์การเรียน 2-69', 'ที่ตั้งร้าน']);
  assert.equal(items[0].action.type, 'uri');
  assert.equal(items[0].imageUrl, 'https://x.supabase.co/functions/v1/line-assets/i/cart.png');
});

test('what the bot does not know gets no reply and no alert', async () => {
  const t = setup();
  for (const text of ['xyz', 'ราคาเท่าไหร่', 'โอนยังไง', 'ขอใบเสร็จ', '555']) assert.equal(await t.say(CUSTOMER, text), 'silent', text);
  assert.equal(t.log.replies.length, 0);
  assert.equal(t.log.pushes.length, 0);
});

test('a plain hello is left to the shop\'s own menu card; asking for the menu is answered', async () => {
  const t = setup();
  assert.equal(await t.say(CUSTOMER, 'สวัสดีค่ะ'), 'silent');
  assert.equal(t.log.replies.length, 0);
  t.tick(10_000);
  assert.equal(await t.say(CUSTOMER, 'เริ่มใหม่'), 'reply');
  assert.equal(t.log.replies.length, 1);
  // …unless the shop wants the assistant to greet too
  const g = setup({ shop: makeShop({ engineGreeting: true }) });
  assert.equal(await g.say(CUSTOMER, 'สวัสดีค่ะ'), 'reply');
});

test('an order, a job or a question → the people to choose from; nobody is alerted yet', async () => {
  for (const text of ['สั่งงาน', 'รับทำป้ายไหม', 'ขอถามหน่อยค่ะ', 'มีสินค้าแบบนี้ไหม', 'ติดต่อแอดมิน', 'คุยกับแอดมิน']) {
    const t = setup();
    assert.equal(await t.say(CUSTOMER, text), 'reply', text);
    const card = lastReply(t).messages[0];
    const buttons = card.contents.footer.contents.map((row) => {
      const column = row.contents.find((c) => c.contents?.some((x) => x.action)) ?? row; // with a photo the column sits beside it
      return column.contents.find((c) => c.action);
    });
    assert.deepEqual(buttons.map((b) => b.action.text), ['คุยกับเจ้ปิ่น', 'คุยกับหญิง', 'คุยกับฟิล์ม'], text);
    assert.equal(t.log.pushes.length, 0, text);
  }
});

test('the order card says it takes orders, the question card does not', async () => {
  const t = setup();
  await t.say(CUSTOMER, 'สั่งงาน');
  assert.match(textsOf(lastReply(t).messages), /รับเรื่องสั่งของ\/สั่งงาน/);
  t.tick(HOUR);
  await t.say(CUSTOMER, 'ขอถามหน่อยค่ะ');
  assert.match(textsOf(lastReply(t).messages), /ต้องการติดต่อใคร/);
});

test('with the admins\' photos on the card when LINE gives them', async () => {
  const t = setup({ line: { profile: { [IDS.หญิง]: { name: 'หญิง', picture: 'https://p.example/ying.jpg' } } } });
  await t.say(CUSTOMER, 'สั่งงาน');
  assert.match(textsOf(lastReply(t).messages), /https:\/\/p\.example\/ying\.jpg/);
});

test('choosing a person: no reply, only that person is told (no message text), then the bot is quiet', async () => {
  const t = setup();
  assert.equal(await t.say(CUSTOMER, 'คุยกับหญิง'), 'pick');
  assert.equal(t.log.replies.length, 0);
  assert.equal(t.log.pushes.length, 1);
  assert.equal(t.log.pushes[0].to, IDS.หญิง);
  const card = textsOf(t.log.pushes[0].messages);
  assert.match(card, /ต้องการติดต่อ/);
  assert.match(card, /หญิง/);
  assert.match(card, /https:\/\/chat\.example\/oa\?x=1/); // the button into the OA app
  assert.ok(!/ข้อความ:/.test(textsOf(t.log.pushes[0].messages[0].altText)));
  // quiet: anything the customer writes is left to the person
  t.tick(2 * MIN);
  assert.equal(await t.say(CUSTOMER, 'ร้านเปิดกี่โมง...'), 'quiet'); // not a menu tap
  assert.equal(await t.say(CUSTOMER, 'xyz'), 'quiet');
  assert.equal(t.log.replies.length, 0);
});

test('the quiet window slides with each message and ends after 20 quiet minutes', async () => {
  const t = setup();
  await t.say(CUSTOMER, 'คุยกับฟิล์ม');
  for (let i = 0; i < 4; i++) {
    t.tick(15 * MIN); // each message is within 20 min of the previous one, so it stays quiet for an hour
    assert.equal(await t.say(CUSTOMER, 'ครับ'), 'quiet');
  }
  t.tick(21 * MIN);
  assert.equal(await t.say(CUSTOMER, 'ร้านเปิดกี่โมง'), 'reply');
});

test('a topic button or "เมนู" brings the bot back at once', async () => {
  const t = setup();
  await t.say(CUSTOMER, 'คุยกับหญิง');
  t.tick(MIN);
  assert.equal(await t.say(CUSTOMER, 'เวลาเปิดร้าน'), 'reply'); // a topic chip
  t.tick(MIN);
  await t.say(CUSTOMER, 'คุยกับหญิง');
  t.tick(MIN);
  assert.equal(await t.say(CUSTOMER, 'เมนู'), 'reply'); // woken, and the menu card comes (in practice the shop's own line-bot answers "เมนู" first)
  t.tick(10_000);
  assert.equal(await t.say(CUSTOMER, 'ร้านเปิดกี่โมง'), 'reply'); // and awake now
});

test('tapping the same name again does not alert again; another name alerts that person', async () => {
  const t = setup();
  await t.say(CUSTOMER, 'คุยกับหญิง');
  t.tick(MIN);
  await t.say(CUSTOMER, 'คุยกับหญิง');
  t.tick(MIN);
  await t.say(CUSTOMER, 'คุยกับหญิง');
  assert.equal(t.log.pushes.length, 1);
  t.tick(MIN);
  await t.say(CUSTOMER, 'คุยกับฟิล์ม');
  assert.equal(t.log.pushes.length, 2);
  assert.equal(t.log.pushes[1].to, IDS.ฟิล์ม);
  // five hours later the same customer asking for the same person is told again
  t.tick(5 * HOUR + MIN);
  await t.say(CUSTOMER, 'คุยกับหญิง');
  assert.equal(t.log.pushes.length, 3);
});

test('another customer is not quiet because of the first one', async () => {
  const t = setup();
  await t.say(CUSTOMER, 'คุยกับหญิง');
  assert.equal(await t.say(CUSTOMER2, 'ร้านเปิดกี่โมง'), 'reply');
});

test('several messages at once get one answer; a different button a moment later is answered', async () => {
  const t = setup();
  assert.equal(await t.say(CUSTOMER, 'เวลาเปิดร้าน'), 'reply');
  t.tick(2000);
  assert.equal(await t.say(CUSTOMER, 'ที่ตั้งร้านอยู่ไหน'), 'burst'); // typed, not a button
  assert.equal(await t.say(CUSTOMER, 'เวลาเปิดร้าน'), 'burst'); // a button, but the same request again
  assert.equal(await t.say(CUSTOMER, 'ที่ตั้งร้าน'), 'reply'); // a different button
  assert.equal(t.log.replies.length, 2);
  t.tick(7000);
  assert.equal(await t.say(CUSTOMER, 'ร้านเปิดกี่โมง'), 'reply');
});

test('"which school?" then the school name: answered even right away; the question times out after 10 minutes', async () => {
  const t = setup();
  assert.equal(await t.say(CUSTOMER, 'อุปกรณ์การเรียน 2-69'), 'reply');
  assert.match(textsOf(lastReply(t).messages), /โรงเรียนไหน/);
  assert.equal(await t.say(CUSTOMER, 'บ้านกอก'), 'reply'); // inside the burst window, still answered
  assert.match(textsOf(lastReply(t).messages), /qeujy/);
  // asked again, then ignored for 11 minutes: the school name alone is no longer taken as an answer
  t.tick(MIN);
  await t.say(CUSTOMER, 'อุปกรณ์การเรียน 2-69');
  t.tick(11 * MIN);
  const before = t.log.replies.length;
  assert.equal(await t.say(CUSTOMER, 'โรงเรียนบ้านกอก'), 'silent');
  assert.equal(t.log.replies.length, before);
});

test('a picture (no AI key): thanks, and every admin is told once; more pictures in a row change nothing', async () => {
  const t = setup();
  assert.equal(await t.media(CUSTOMER, 'image'), 'picture');
  assert.match(textsOf(lastReply(t).messages), /ได้รับรูปแล้ว/);
  assert.deepEqual(t.log.pushes.map((p) => p.to).sort(), Object.values(IDS).sort());
  assert.match(textsOf(t.log.pushes[0].messages), /ลูกค้าส่งรูป/);
  for (let i = 0; i < 4; i++) {
    t.tick(30_000);
    assert.equal(await t.media(CUSTOMER, 'image'), 'media:gate');
  }
  assert.equal(t.log.replies.length, 1);
  assert.equal(t.log.pushes.length, 3);
});

test('thanked again after 10 minutes, but the admins are told only once per 5 hours', async () => {
  const t = setup();
  await t.media(CUSTOMER, 'image');
  t.tick(11 * MIN);
  assert.equal(await t.media(CUSTOMER, 'image'), 'picture');
  assert.equal(t.log.replies.length, 2);
  assert.equal(t.log.pushes.length, 3); // no new alerts
  t.tick(5 * HOUR);
  await t.media(CUSTOMER, 'image');
  assert.equal(t.log.pushes.length, 6);
});

test('a file is thanked as a file and never read', async () => {
  const t = setup();
  assert.equal(await t.media(CUSTOMER, 'file', { fileName: 'a.pdf' }), 'file');
  assert.match(textsOf(lastReply(t).messages), /ได้รับไฟล์แล้ว/);
  assert.match(textsOf(t.log.pushes[0].messages), /ลูกค้าส่งไฟล์/);
});

test('with a reader key: a slip is thanked as a slip (never the amount); another picture is passed to the admins quietly', async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const slip = setup({ env: { GEMINI_API_KEY: 'k' }, line: { content: { bytes, mime: 'image/png' }, gemini: 'slip' } });
  assert.equal(await slip.media(CUSTOMER, 'image'), 'slip');
  assert.match(textsOf(lastReply(slip).messages), /ได้รับสลิปแล้ว/);
  assert.ok(!/บาท|\d/.test(lastReply(slip).messages[0].altText)); // the words carry no amount
  assert.match(textsOf(slip.log.pushes[0].messages), /ลูกค้าส่งสลิป/);

  const other = setup({ env: { GEMINI_API_KEY: 'k' }, line: { content: { bytes, mime: 'image/png' }, gemini: 'other' } });
  assert.equal(await other.media(CUSTOMER, 'image'), 'silent:media');
  assert.equal(other.log.replies.length, 0); // the customer gets nothing
  assert.equal(other.log.pushes.length, 3); // the admins are told
  assert.match(textsOf(other.log.pushes[0].messages), /ลูกค้าส่งรูป/);
});

test('pictures and stickers from a customer who is talking to a person are left alone', async () => {
  const t = setup();
  await t.say(CUSTOMER, 'คุยกับหญิง');
  const pushes = t.log.pushes.length;
  t.tick(MIN);
  assert.equal(await t.media(CUSTOMER, 'image'), 'quiet');
  assert.equal(t.log.replies.length, 0);
  assert.equal(t.log.pushes.length, pushes);
});

test('a thank-you sticker is answered like "ขอบคุณ"; other stickers are not', async () => {
  const t = setup();
  assert.equal(await t.media(CUSTOMER, 'sticker', { keywords: ['thanks', 'thank you'] }), 'sticker:thanks');
  assert.match(textsOf(lastReply(t).messages), /ยินดีค่ะ/);
  assert.equal(await t.media(CUSTOMER2, 'sticker', { keywords: ['hello'] }), 'sticker:ignored');
  assert.equal(t.log.replies.length, 1);
});

test('Saturday: the closing notice goes in front of the first reply of the day, once per customer', async () => {
  const sat = Date.UTC(2026, 9, 3, 5, 0, 0);
  const t = setup({ start: sat });
  await t.say(CUSTOMER, 'ร้านเปิดกี่โมง');
  const first = lastReply(t).messages;
  assert.equal(first.length, 2);
  assert.match(first[0].text, /ร้านหยุดทุกวันเสาร์/);
  t.tick(MIN);
  await t.say(CUSTOMER, 'ที่ตั้งร้าน');
  assert.equal(lastReply(t).messages.length, 1);
  // an unknown message on a Saturday still earns the notice, once
  await t.say(CUSTOMER2, 'xyz');
  assert.match(lastReply(t).messages[0].text, /ร้านหยุดทุกวันเสาร์/);
  t.tick(MIN);
  assert.equal(await t.say(CUSTOMER2, 'xyz'), 'silent');
  // a thank-you needs no apology and does not use the notice up
  const t2 = setup({ start: sat });
  await t2.say(CUSTOMER, 'ขอบคุณค่ะ');
  assert.equal(lastReply(t2).messages.length, 1);
  // a weekday: nothing extra
  const fri = setup({ start: Date.UTC(2026, 9, 2, 5, 0, 0) });
  await fri.say(CUSTOMER, 'xyz');
  assert.equal(fri.log.replies.length, 0);
});

test('a reply token that ran out (400) → the message goes out as a push instead', async () => {
  const t = setup({ line: { replyStatus: 400 } });
  assert.equal(await t.say(CUSTOMER, 'ร้านเปิดกี่โมง'), 'reply');
  assert.equal(t.log.replies.length, 1);
  assert.equal(t.log.pushes.length, 1);
  assert.equal(t.log.pushes[0].to, CUSTOMER);
  // any other failure is reported, not retried as a push
  const bad = setup({ line: { replyStatus: 500 } });
  await assert.rejects(bad.say(CUSTOMER, 'ร้านเปิดกี่โมง'), /reply failed 500/);
  assert.equal(bad.log.pushes.length, 0);
});

test('admin switches: only the listed people can pause the bot, it ends by itself, and "โควตา" shows the quota', async () => {
  const t = setup();
  assert.equal(await t.say(CUSTOMER, 'พักบอท'), 'silent'); // a customer typing it is just a customer
  assert.equal(await t.say(IDS.หญิง, 'ปิดบอท 2'), 'admin:pause');
  assert.match(lastReply(t).messages[0].text, /ปิดบอทชั่วคราว 2 ชั่วโมง/);
  assert.equal(await t.say(CUSTOMER, 'ร้านเปิดกี่โมง'), 'paused:all');
  assert.equal(await t.media(CUSTOMER, 'image'), 'quiet');
  t.tick(2 * HOUR + MIN);
  assert.equal(await t.say(CUSTOMER, 'ร้านเปิดกี่โมง'), 'reply'); // ended by itself
  await t.say(IDS.ฟิล์ม, 'ปิดบอท');
  assert.equal(await t.say(CUSTOMER2, 'ร้านเปิดกี่โมง'), 'paused:all');
  await t.say(IDS.ฟิล์ม, 'เปิดบอท');
  assert.equal(await t.say(CUSTOMER2, 'ร้านเปิดกี่โมง'), 'reply');
  await t.say(IDS.เจ้ปิ่น, 'โควตา');
  assert.match(lastReply(t).messages[0].text, /ใช้ไปแล้ว 120 จาก 300[\s\S]*เหลือ 180/);
});

test('"ไอดีฉัน" tells anybody their LINE id (to fill in the settings row)', async () => {
  const t = setup();
  await t.say(CUSTOMER, 'ไอดีฉัน');
  assert.match(lastReply(t).messages[0].text, new RegExp(CUSTOMER));
});

test('the settings can pause everything; groups, standby mode and events without a reply token are skipped', async () => {
  const p = setup({ shop: makeShop({ paused: true }) });
  assert.equal(await p.say(CUSTOMER, 'ร้านเปิดกี่โมง'), 'paused');
  const t = setup();
  assert.equal(await t.engine.handle(t.ev(CUSTOMER, { type: 'text', text: 'ร้านเปิดกี่โมง' }, { source: { type: 'group', groupId: 'C1', userId: CUSTOMER } }), t.shop), 'skip:source');
  assert.equal(await t.engine.handle(t.ev(CUSTOMER, { type: 'text', text: 'ร้านเปิดกี่โมง' }, { mode: 'standby' }), t.shop), 'skip:standby');
  assert.equal(await t.engine.handle(t.ev(CUSTOMER, { type: 'text', text: 'ร้านเปิดกี่โมง' }, { replyToken: undefined }), t.shop), 'skip:no-token');
  assert.equal(await t.engine.handle({ type: 'unfollow', source: { type: 'user', userId: CUSTOMER } }, t.shop), 'skip:no-token');
  assert.equal(t.log.replies.length, 0);
});

test('nobody to choose from (no admins in the settings): order words and pictures are left alone, nothing breaks', async () => {
  const t = setup({ shop: makeShop({ contact: { ...makeShop().contact, people: [] } }) });
  assert.equal(await t.say(CUSTOMER, 'สั่งงาน'), 'silent');
  assert.equal(await t.media(CUSTOMER, 'image'), 'picture'); // still thanked
  assert.equal(t.log.pushes.length, 0); // but nobody can be told
});

test('the OA\'s own follow: welcome card unless the shop\'s menu card is used instead', async () => {
  const t = setup();
  const follow = { type: 'follow', mode: 'active', source: { type: 'user', userId: CUSTOMER }, replyToken: 'f1' };
  assert.equal(await t.engine.handle(follow, t.shop), 'follow');
  assert.equal(t.log.replies.length, 1);
  const off = setup({ shop: makeShop({ welcome: false }) });
  assert.equal(await off.engine.handle(follow, off.shop), 'follow:off');
});

test('a person can be asked for in the usual ways, and only as the whole message', async () => {
  for (const text of ['คุยกับหญิง', 'ขอคุยกับหญิงค่ะ', 'คุยกับแอดมินหญิง', 'แอดมินหญิง', 'ติดต่อ หญิง', 'ติดต่อหญิงนะคะ']) {
    const t = setup();
    assert.equal(await t.say(CUSTOMER, text), 'pick', text);
    assert.equal(t.log.pushes[0].to, IDS.หญิง, text);
  }
  const t = setup();
  assert.notEqual(await t.say(CUSTOMER, 'อยากคุยกับหญิงเรื่องโฟมบอร์ดค่ะ'), 'pick'); // a sentence is a question, not a choice
  assert.equal(t.log.pushes.length, 0);
});

test('the shop\'s own buttons are the ones that wake the bot from its quiet time', async () => {
  const t = setup({ shop: makeShop({ menuTexts: ['ส่งเอกสารโครงการ', 'คุยกับแอดมิน'] }) });
  await t.say(CUSTOMER, 'คุยกับหญิง');
  t.tick(MIN);
  assert.equal(await t.say(CUSTOMER, 'ส่งเอกสารโครงการ'), 'reply'); // a tap on the shop's button is a request in its own right
});

test('announcing a choice made in the shop\'s own picker: only that person, once per window', async () => {
  const t = setup();
  assert.equal(await t.engine.alertPick(t.shop, { customerId: CUSTOMER, adminName: 'ฟิล์ม' }), 'pick:alerted');
  assert.equal(t.log.pushes.length, 1);
  assert.equal(t.log.pushes[0].to, IDS.ฟิล์ม);
  assert.ok(!/ข้อความ:/.test(t.log.pushes[0].messages[0].altText)); // no customer text
  assert.equal(await t.engine.alertPick(t.shop, { customerId: CUSTOMER, adminName: 'ฟิล์ม' }), 'pick:again');
  assert.equal(await t.engine.alertPick(t.shop, { customerId: CUSTOMER, adminName: 'หญิง' }), 'pick:alerted');
  assert.equal(await t.engine.alertPick(t.shop, { customerId: CUSTOMER, adminName: 'ใครก็ไม่รู้' }), 'pick:unknown');
  assert.equal(t.log.pushes.length, 2);
  t.tick(5 * HOUR + MIN);
  assert.equal(await t.engine.alertPick(t.shop, { customerId: CUSTOMER, adminName: 'ฟิล์ม' }), 'pick:alerted');
  // a paused bot announces nothing
  const p = setup({ shop: makeShop({ paused: true }) });
  assert.equal(await p.engine.alertPick(p.shop, { customerId: CUSTOMER, adminName: 'ฟิล์ม' }), 'pick:paused');
  assert.equal(p.log.pushes.length, 0);
});
