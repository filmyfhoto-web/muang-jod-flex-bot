import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quickReplyBlock, withQuickReply, defaultItems } from '../src/flex/quickReply.js';
import { POSTBACK_ACTIONS } from '../src/utils/validation.js';
import { resolveMenuCommand } from '../src/utils/menuCommands.js';

// The bar above the keyboard is the only menu that is always on screen in LINE
// for desktop, so a dead button here is a dead end for anyone working on a
// computer. What is ON it is covered by tests/quickJobs.test.js; this is the
// machinery that puts it there.

function withLiff(fn) {
  const had = process.env.LIFF_ID;
  process.env.LIFF_ID = '1234567890-AbCdEfGh';
  try {
    return fn();
  } finally {
    if (had === undefined) delete process.env.LIFF_ID;
    else process.env.LIFF_ID = had;
  }
}

test('it stays inside what LINE accepts', () => {
  const block = withLiff(() => quickReplyBlock());
  assert.ok(block.items.length >= 1 && block.items.length <= 13, `${block.items.length} buttons, LINE takes 13`);
  for (const { action } of block.items) {
    assert.ok(action.label.length <= 20, `"${action.label}" is ${action.label.length} chars, max 20`);
  }

  // More than thirteen would be rejected outright, so the extras are dropped.
  const many = Array.from({ length: 20 }, () => ({ label: 'x', action: 'help', text: 'ช่วยเหลือ' }));
  assert.equal(quickReplyBlock(many).items.length, 13);
});

test('a postback button still reaches a handler, by tap and by the text it echoes', () => {
  // The default bar is all links now, but the builder still takes postbacks —
  // the payment prompt uses its own. One that goes nowhere is a dead end.
  const items = [{ label: '❓ ช่วยเหลือ', action: 'help', text: 'ช่วยเหลือ' }];
  const [{ action }] = quickReplyBlock(items).items;

  assert.equal(action.type, 'postback');
  assert.ok(POSTBACK_ACTIONS.includes('help'), 'unknown action');
  assert.ok(action.data.length <= 300);
  // displayText resolves too, so a transcript never shows a command the bot
  // would ignore.
  assert.equal(resolveMenuCommand(items[0].text), items[0].action);
});

test('the bar lands on the last message only — that is the one LINE shows it on', () => {
  const out = withLiff(() =>
    withQuickReply([
      { type: 'text', text: 'หนึ่ง' },
      { type: 'text', text: 'สอง' },
      { type: 'flex', altText: 'การ์ด', contents: {} },
    ])
  );
  assert.equal(out.length, 3);
  assert.equal(out[0].quickReply, undefined);
  assert.equal(out[1].quickReply, undefined);
  assert.ok(out[2].quickReply.items.length);

  // A single message, not in an array, still comes back as one.
  const single = withLiff(() => withQuickReply({ type: 'text', text: 'เดี่ยว' }));
  assert.equal(single.length, 1);
  assert.ok(single[0].quickReply);
});

test("a message that brought its own buttons keeps them", () => {
  const own = { items: [{ type: 'action', action: { type: 'message', label: '500', text: '500' } }] };
  const out = withQuickReply([{ type: 'text', text: 'ยอดเท่าไหร่คะ', quickReply: own }]);
  assert.equal(out[0].quickReply, own, 'the default overwrote a purpose-built bar');
});

test('nothing to send, nothing to attach', () => {
  assert.deepEqual(withQuickReply([]), []);
  assert.deepEqual(withQuickReply([null]), [null]);
});

test('a bar always goes out, because a missing one leaves the old one on screen', () => {
  // LINE swaps the bar only when a message carries one; a message without one
  // leaves the previous bar sitting there. So "attach nothing" is not neutral
  // — it freezes whatever the shop was last shown.
  assert.ok(defaultItems().length > 0, 'nothing to attach, so the old bar stays');

  const out = withQuickReply([{ type: 'text', text: 'สวัสดีค่ะ' }]);
  assert.equal(out.length, 1);
  assert.ok(out[0].quickReply.items.length, 'no bar went out with the message');
  assert.equal(out[0].text, 'สวัสดีค่ะ', 'the message itself must survive');
});

test('an empty list handed in is still refused, not sent as an empty bar', () => {
  // LINE rejects an empty quickReply outright, which takes down the message it
  // rode on rather than just the bar.
  const out = withQuickReply([{ type: 'text', text: 'สวัสดีค่ะ' }], []);
  assert.equal(out[0].quickReply, undefined);
  assert.equal(out[0].text, 'สวัสดีค่ะ');
});
