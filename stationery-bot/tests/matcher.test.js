import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchIntent, isThanks, isThanksSticker } from '../src/matcher.js';
import { buildReply, withSender, thanksReply } from '../src/replies.js';
import { verifySignature } from '../src/line.js';
import crypto from 'node:crypto';

const shop = JSON.parse(readFileSync(new URL('../data/shop.json', import.meta.url), 'utf8'));

test('product by alias', () => {
  const r = matchIntent('ปากกาลูกลื่นราคาเท่าไหร่คะ', shop);
  assert.equal(r.type, 'products');
  assert.match(r.products[0].name, /ปากกาลูกลื่น/);
});

test('longest alias wins', () => {
  const r = matchIntent('กระดาษ a4 มีไหม', shop);
  assert.equal(r.products.length, 1);
  assert.match(r.products[0].name, /A4/);
});

test('faq', () => {
  assert.equal(matchIntent('ร้านเปิดกี่โมงคะ', shop).faq.label, 'เวลาเปิดร้าน');
  assert.equal(matchIntent('ค่าส่งเท่าไหร่', shop).faq.label, 'การจัดส่ง');
});

test('handoff, greeting, fallback', () => {
  assert.equal(matchIntent('ขอคุยกับแอดมิน', shop).type, 'handoff');
  assert.equal(matchIntent('สวัสดีค่ะ', shop).type, 'greeting');
  assert.equal(matchIntent('xyz', shop).type, 'fallback');
});

test('greeting replies with a flex card with menu buttons', () => {
  const { messages } = buildReply('สวัสดีค่ะ', shop);
  assert.equal(messages[0].type, 'flex');
  const buttons = messages[0].contents.footer.contents;
  assert.ok(buttons.length > 1);
  assert.ok(buttons.every((b) => b.action.label.length <= 20));
});

test('single product → bubble, several → carousel; out-of-stock flagged', () => {
  const one = buildReply('ไฮไลท์', shop).messages[0];
  assert.equal(one.contents.type, 'bubble');
  assert.match(JSON.stringify(one), /สินค้าหมดชั่วคราว/);
  const many = buildReply('ปากกา', shop).messages[0];
  assert.ok(['bubble', 'carousel'].includes(many.contents.type));
});

test('faq and fallback are flex cards; handoff stays text', () => {
  assert.equal(buildReply('ร้านเปิดกี่โมง', shop).messages[0].type, 'flex');
  assert.equal(buildReply('xyz', shop).messages[0].type, 'flex');
  assert.equal(buildReply('แอดมิน', shop).messages[0].type, 'text');
});

test('supplies button only asks which school — no school list, no link', () => {
  const r = buildReply('อุปกรณ์การเรียน 2-69', shop);
  assert.equal(r.awaitingSchool, true);
  assert.equal(r.messages.length, 1);
  assert.equal(r.messages[0].type, 'text');
  assert.match(r.messages[0].text, /โรงเรียนไหน/);
  assert.equal(r.messages[0].quickReply, undefined);
  const out = JSON.stringify(r);
  assert.ok(!shop.schoolSupplies.schools.some((s) => out.includes(s.link) || out.includes(s.name)));
});

test('every school resolves to its own link however the customer writes it', () => {
  for (const sc of shop.schoolSupplies.schools) {
    const short = sc.name.replace(/^โรงเรียน/, '');
    const bare = short.replace(/^บ้าน/, '');
    const variants = [sc.name, short, bare, `ร.ร.${short}`, `ร.ร. ${short}`, `รร${short}`, `รร ${short}`, `รร.${short}`,
      `${short} ค่ะ`, `อยู่โรงเรียน${short}ค่ะ`, `ร.ร.${bare}`];
    for (const typed of variants) {
      const r = buildReply(typed, shop, { awaitingSchool: true });
      assert.equal(r.awaitingSchool, false, typed);
      assert.ok(JSON.stringify(r.messages[0]).includes(sc.link), typed);
    }
  }
});

test('a distinctive part of a name is enough; an ambiguous one is not guessed', () => {
  const link = (t) => {
    const r = buildReply(t, shop, { awaitingSchool: true });
    return r.awaitingSchool ? null : JSON.stringify(r.messages[0]);
  };
  assert.match(link('ไตรมิตร'), /bc2m4/);
  assert.match(link('เปียงซ้อ'), /bc9u9/);
  assert.match(link('ไทยรัฐ 98'), /c99h3/);
  assert.match(link('เจดีย์เชียงโคม'), /x7mep/);
  assert.match(link('กอกจูน'), /bdtwk/);
  assert.match(link('บ้านกอก'), /qeujy/);
  assert.equal(link('บ้าน'), null);
  assert.equal(link('น้ำ'), null);
  assert.equal(link('ร.ร.'), null);
});

test('all school links are https and unique', () => {
  const links = shop.schoolSupplies.schools.map((s) => s.link);
  assert.ok(links.every((l) => /^https:\/\/\S+$/.test(l)));
  assert.equal(new Set(links).size, links.length);
});

test('school named together with supplies → link straight away', () => {
  const r = buildReply('ขอรายการอุปกรณ์ บ้านปางกอม', shop);
  assert.match(JSON.stringify(r.messages[0]), /dcbt7/);
});

test('school name alone, not asked → link is not sent', () => {
  assert.doesNotMatch(JSON.stringify(buildReply('โรงเรียนบ้านกอก', shop).messages[0]), /qeujy/);
});

test('unknown school while asked → ask again; other topics still work', () => {
  const again = buildReply('โรงเรียนอะไรไม่รู้', shop, { awaitingSchool: true });
  assert.equal(again.awaitingSchool, true);
  assert.match(again.messages[0].text, /ยังไม่พบ/);
  const faq = buildReply('ร้านเปิดกี่โมง', shop, { awaitingSchool: true });
  assert.equal(faq.awaitingSchool, false);
  assert.equal(faq.messages[0].type, 'flex');
});

test('สั่งของ has an answer', () => {
  assert.equal(matchIntent('สั่งของ', shop).faq.label, 'สั่งของ');
});

test('greeting asks what the customer is contacting about', () => {
  const card = JSON.stringify(buildReply('สวัสดีค่ะ', shop).messages[0]);
  assert.match(card, /ติดต่อสอบถามเรื่องอะไร/);
});

test('withSender adds the shop icon only with a public https base url', () => {
  const msgs = [{ type: 'text', text: 'x' }];
  assert.equal(withSender(msgs, '')[0].sender, undefined);
  assert.equal(withSender(msgs, 'http://localhost:3000')[0].sender, undefined);
  assert.equal(withSender(msgs, 'https://bot.onrender.com/')[0].sender.iconUrl, 'https://bot.onrender.com/assets/icon.png');
  assert.equal(msgs[0].sender, undefined); // input not mutated
});

test('shop name and opening hours are the real ones', () => {
  assert.equal(shop.name, 'ร้านนัฐภรณ์ เชียงกลาง');
  const hours = matchIntent('เวลาเปิดร้าน', shop).faq.answer;
  assert.match(hours, /จันทร์ - ศุกร์\s+07\.30 - 18\.00/);
  assert.match(hours, /เสาร์\s+หยุด/);
  assert.match(hours, /อาทิตย์\s+07\.30 - 17\.00/);
});

test('every button label fits LINE (<=20) and sends a message the bot understands', () => {
  const card = buildReply('สวัสดี', shop).messages[0];
  const buttons = card.contents.footer.contents.map((b) => b.action);
  for (const a of buttons) assert.ok(a.label.length <= 20, a.label);
  const supplies = buttons.find((a) => a.label.startsWith('อุปกรณ์'));
  assert.equal(buildReply(supplies.text, shop).awaitingSchool, true);
  const chips = buildReply('ปากกา', shop).messages[0].quickReply.items;
  for (const c of chips) assert.ok(c.action.label.length <= 20, c.action.label);
});

test('greeting card shows the shop picture in front of the text when a url is known', () => {
  const none = JSON.stringify(buildReply('สวัสดี', shop).messages[0]);
  assert.ok(!none.includes('"type":"image"'));
  const withIcon = buildReply('สวัสดี', { ...shop, iconUrl: 'https://bot.example/assets/icon.png' }).messages[0];
  const body = withIcon.contents.body.contents[0];
  assert.equal(body.layout, 'horizontal');
  assert.equal(body.contents[0].type, 'image');
  assert.equal(body.contents[1].type, 'text');
});

test('สั่งของ: chat-order instructions plus a button to the web shop', () => {
  const card = buildReply('สั่งของ', shop).messages[0];
  const json = JSON.stringify(card);
  assert.match(json, /พิมพ์ชื่อสินค้าและจำนวน/);
  const btn = card.contents.footer.contents[0].action;
  assert.equal(btn.type, 'uri');
  assert.equal(btn.uri, 'https://www.nattagroup.com/');
  assert.ok(btn.label.length <= 20);
  assert.ok(!json.includes('shop.json'));
});

const withPics = { ...shop, assetBase: 'https://bot.example', iconUrl: 'https://bot.example/assets/icon.png' };
const heroUrl = (m) => m.contents.hero?.url;

test('with a public address: banner on the greeting, pictures on order / school / ask / admin cards', () => {
  const greet = buildReply('สวัสดี', withPics).messages[0];
  assert.equal(heroUrl(greet), 'https://bot.example/assets/banner.png');
  assert.equal(greet.contents.header, undefined); // the banner already carries the shop name

  assert.equal(heroUrl(buildReply('สั่งของ', withPics).messages[0]), 'https://bot.example/assets/order.png');
  assert.equal(heroUrl(buildReply('อุปกรณ์การเรียน 2-69', withPics).messages[0]), 'https://bot.example/assets/ask.png');
  assert.equal(heroUrl(buildReply('แอดมิน', withPics).messages[0]), 'https://bot.example/assets/admin.png');
  const link = buildReply('บ้านกอก', withPics, { awaitingSchool: true }).messages[0];
  assert.equal(heroUrl(link), 'https://bot.example/assets/school.png');
  assert.match(JSON.stringify(link), /qeujy/);
});

test('without a public address nothing breaks: no pictures, plain header and text', () => {
  const greet = buildReply('สวัสดี', shop).messages[0];
  assert.equal(greet.contents.hero, undefined);
  assert.ok(greet.contents.header);
  assert.equal(buildReply('แอดมิน', shop).messages[0].type, 'text');
  assert.equal(buildReply('อุปกรณ์การเรียน 2-69', shop).messages[0].type, 'text');
});

test('every picture the cards point at exists in public/ and is a PNG with transparency', () => {
  for (const n of ['banner', 'order', 'school', 'ask', 'admin', 'icon']) {
    const f = readFileSync(new URL(`../public/${n}.png`, import.meta.url));
    assert.equal(f.subarray(1, 4).toString(), 'PNG', n);
    assert.ok(f.length < 1_000_000, `${n} must stay under LINE's 1MB image limit`);
  }
  for (const n of ['banner', 'order', 'school', 'ask', 'admin']) {
    const f = readFileSync(new URL(`../public/${n}.png`, import.meta.url));
    assert.ok([4, 6].includes(f[25]), `${n} should have an alpha channel`); // PNG colour type 6 = RGBA
  }
});

test('thanks in its usual spellings gets the fixed reply', () => {
  for (const t of ['ขอบคุณ', 'ขอบคุณค่ะ', 'ขอบคุณมากครับ', 'ขอบคุณนะคะ 🙏', 'ขอบคุณที่ช่วยนะคะ', 'ขอบคุณมากๆ ค่ะ', 'ขอบใจจ้า', 'thanks', 'Thank you!', 'ขอบพระคุณค่ะ']) {
    assert.ok(isThanks(t), t);
    assert.equal(buildReply(t, shop).messages[0].text, 'ยินดีค่ะ สอบถามรายละเอียดเพิ่มเติม แจ้งได้เลยนะคะ', t);
  }
});

test('thanks plus a real question is still a question', () => {
  assert.ok(!isThanks('ขอบคุณค่ะ ปากการาคาเท่าไหร่'));
  assert.equal(buildReply('ขอบคุณค่ะ ร้านเปิดกี่โมง', shop).messages[0].type, 'flex');
  assert.ok(!isThanks('สวัสดีค่ะ'));
  assert.ok(!isThanks(''));
});

test('thanks while a school is being asked ends the question and sends no link', () => {
  const r = buildReply('ขอบคุณค่ะ', shop, { awaitingSchool: true });
  assert.equal(r.awaitingSchool, false);
  assert.ok(!JSON.stringify(r).includes('nattagroup'));
});

test('thank-you stickers are recognised by their keywords; others are not', () => {
  assert.ok(isThanksSticker(['thanks', 'thank you', 'grateful']));
  assert.ok(isThanksSticker(['Thank']));
  assert.ok(!isThanksSticker(['hello', 'hi']));
  assert.ok(!isThanksSticker(undefined));
  assert.equal(thanksReply(shop).messages[0].text, 'ยินดีค่ะ สอบถามรายละเอียดเพิ่มเติม แจ้งได้เลยนะคะ');
});

test('signature check', () => {
  const body = Buffer.from('{"events":[]}');
  const sig = crypto.createHmac('sha256', 's').update(body).digest('base64');
  assert.ok(verifySignature(body, sig, 's'));
  assert.ok(!verifySignature(body, sig, 'other'));
  assert.ok(!verifySignature(body, null, 's'));
});
