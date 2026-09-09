import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUICK_REPLIES, quickReplyBlock, withQuickReply } from '../src/flex/quickReply.js';
import { POSTBACK_ACTIONS } from '../src/utils/validation.js';
import { resolveMenuCommand } from '../src/utils/menuCommands.js';

// The bar above the keyboard is the only menu that is always on screen in LINE
// for desktop, so a dead button here is a dead end for anyone working on a
// computer.

test('every quick reply reaches a handler, by tap and by the text it echoes', () => {
  for (const item of QUICK_REPLIES) {
    assert.ok(POSTBACK_ACTIONS.includes(item.action), `${item.label}: unknown action "${item.action}"`);
    // displayText is echoed into the chat as if the person typed it, so it has
    // to resolve too — otherwise the transcript shows a command the bot ignores.
    assert.equal(resolveMenuCommand(item.text), item.action, `${item.label}: "${item.text}" resolves elsewhere`);
  }
});

test('it stays inside what LINE accepts', () => {
  assert.ok(QUICK_REPLIES.length <= 13, `${QUICK_REPLIES.length} buttons, LINE takes 13`);

  const block = quickReplyBlock();
  assert.equal(block.items.length, QUICK_REPLIES.length);
  for (const { action } of block.items) {
    assert.ok(action.label.length <= 20, `"${action.label}" is ${action.label.length} chars, max 20`);
    assert.ok(action.data.length <= 300);
    assert.equal(action.type, 'postback');
  }

  // More than thirteen would be rejected outright, so the extras are dropped.
  const many = Array.from({ length: 20 }, () => QUICK_REPLIES[0]);
  assert.equal(quickReplyBlock(many).items.length, 13);
});

test('the bar lands on the last message only — that is the one LINE shows it on', () => {
  const out = withQuickReply([
    { type: 'text', text: 'หนึ่ง' },
    { type: 'text', text: 'สอง' },
    { type: 'flex', altText: 'การ์ด', contents: {} },
  ]);
  assert.equal(out.length, 3);
  assert.equal(out[0].quickReply, undefined);
  assert.equal(out[1].quickReply, undefined);
  assert.ok(out[2].quickReply.items.length);

  // A single message, not in an array, still comes back as one.
  const single = withQuickReply({ type: 'text', text: 'เดี่ยว' });
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
