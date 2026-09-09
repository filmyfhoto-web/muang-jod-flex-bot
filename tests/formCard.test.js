import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formCardsMessage, greetingTexts } from '../src/flex/formCardFlex.js';
import { COLORS, themedContents } from '../src/flex/theme.js';
import { POSTBACK_ACTIONS } from '../src/utils/validation.js';

// The card people actually see in chat: the form's shape, in the bot's own
// navy-and-blue. Nothing here can be rendered in a test, so what is guarded is
// what silently breaks — a card LINE would reject, a row that leads nowhere,
// and colours drifting away from the rest of the cards.

const FORM = 'https://liff.line.me/1234567890-quick';
const DASH = 'https://liff.line.me/1234567890-abcdefgh?tab=today';
const JOB = { id: 'job-1', job_name: 'ป้ายไวนิล 160x300', job_date: '2026-09-08', total: 792 };

const walk = (node, out = []) => {
  if (Array.isArray(node)) node.forEach((n) => walk(n, out));
  else if (node && typeof node === 'object') {
    out.push(node);
    Object.values(node).forEach((v) => walk(v, out));
  }
  return out;
};
const textsOf = (node) => walk(node).filter((n) => n.type === 'text').map((n) => n.text);

test('the card comes out on the same surface as every other card', () => {
  const message = formCardsMessage({ formUrl: FORM });
  const themed = themedContents(message.contents);

  for (const bubble of themed.contents) {
    assert.equal(bubble.styles.body.backgroundColor, COLORS.surface);
    assert.equal(bubble.styles.footer.backgroundColor, COLORS.surface);
  }

  // Light text on a light panel is the way this card fails outright, so no
  // part of it may paint white behind the writing.
  assert.ok(!JSON.stringify(themed).includes('"backgroundColor":"#FFFFFF"'), 'a white panel survived');
});

test('it is a carousel — that is what makes it swipe left and right in chat', () => {
  const message = formCardsMessage({ formUrl: FORM, dashboardUrl: DASH, recent: [JOB] });
  assert.equal(message.type, 'flex');
  assert.equal(message.contents.type, 'carousel');
  assert.equal(message.contents.contents.length, 2);
  assert.ok(message.altText, 'no alt text for notifications and old clients');

  // LINE rejects a flex message over 50 KB, and a rejected message reads to
  // the user as the bot going silent.
  assert.ok(JSON.stringify(message).length < 50_000, 'too big for LINE');
});

test('every field from the design is on the card', () => {
  const texts = textsOf(formCardsMessage({ formUrl: FORM }));
  for (const label of ['ชื่อ', 'รายละเอียด', 'ราคา (บาท)', 'จำนวน', 'ตรมละ (บาท)', 'แนบรูป', 'ยอดรวม (บาท)']) {
    assert.ok(texts.includes(label), `missing field: ${label}`);
  }
  assert.ok(texts.includes('กรอกข้อมูลงานได้เลย'));
  assert.ok(texts.some((t) => t.includes('บันทึกงานพิมพ์ / ป้ายโฆษณา')));
});

test('the rows are the way through to the real form', () => {
  const withForm = walk(formCardsMessage({ formUrl: FORM }));
  const uris = withForm.filter((n) => n.action?.type === 'uri').map((n) => n.action.uri);
  assert.ok(uris.length >= 7, `only ${uris.length} tappable targets`);
  assert.ok(uris.every((u) => u === FORM), 'a row points somewhere unexpected');
});

test('with no LIFF configured the card still works, by chat', () => {
  const message = formCardsMessage({});
  const nodes = walk(message);
  assert.equal(nodes.filter((n) => n.action?.type === 'uri').length, 0, 'a dead link would go nowhere');

  // Everything that remains has to land on an action the router knows.
  const actions = nodes.filter((n) => n.action?.type === 'postback').map((n) => /action=([a-z_]+)/.exec(n.action.data)?.[1]);
  assert.ok(actions.length, 'nothing is tappable at all');
  for (const action of actions) {
    assert.ok(POSTBACK_ACTIONS.includes(action), `unknown action: ${action}`);
  }
});

test('the second card shows real jobs, and says so when there are none', () => {
  const withJobs = textsOf(formCardsMessage({ formUrl: FORM, recent: [JOB] }));
  assert.ok(withJobs.includes('ป้ายไวนิล 160x300'));
  assert.ok(withJobs.includes('฿792'));

  const empty = textsOf(formCardsMessage({ formUrl: FORM, recent: [] }));
  assert.ok(empty.some((t) => t.includes('ยังไม่มีงานที่จดไว้')));

  // Only four fit before the card gets too tall to read.
  const many = Array.from({ length: 9 }, (_, i) => ({ ...JOB, id: 'j' + i, job_name: 'งาน ' + i }));
  const shown = textsOf(formCardsMessage({ formUrl: FORM, recent: many })).filter((t) => t.startsWith('งาน '));
  assert.equal(shown.length, 4);
});

test('the greeting uses the name when there is one', () => {
  const [hello] = greetingTexts('FILM');
  assert.match(hello.text, /คุณFILM/);
  assert.match(hello.text, /เลื่อนดูรายการได้เลยค่ะ/);

  const [anon] = greetingTexts('');
  assert.doesNotMatch(anon.text, /คุณ\s*💜/, 'a blank name must not leave a dangling "คุณ"');
  assert.match(anon.text, /^สวัสดีค่ะ 💜/);
});
