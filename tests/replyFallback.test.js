import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// A reply token is one-shot and expires in about a minute. Reading a
// photographed document can outlast it, and a refused reply used to mean the
// bot said nothing at all — indistinguishable, from the chat, from a bot that
// is simply broken. These are the pieces that turn that silence into a push.

const source = readFileSync(new URL('../src/services/lineService.js', import.meta.url), 'utf8');
const webhook = readFileSync(new URL('../src/routes/webhook.js', import.meta.url), 'utf8');

test('a refused reply is pushed to the same user instead of dropped', () => {
  assert.match(source, /export function rememberReplyTarget/);
  assert.match(source, /catch \(err\)[\s\S]*?takeReplyTarget\(replyToken\)[\s\S]*?pushMessage/);

  // The push has to carry the SAME messages, through the same theming and
  // quick-reply stamping the reply would have had.
  assert.match(source, /pushMessage\(\{ to: userId, messages: toArray\(messages\) \}\)/);

  // With no known user there is nothing to push to: the original error stands
  // rather than being swallowed into a silent success.
  assert.match(source, /if \(!userId\) throw err;/);
});

test('every incoming event registers its reply token before anything can fail', () => {
  assert.ok(webhook.includes('rememberReplyTarget(event.replyToken, lineUserId)'), 'nothing is remembered');

  // Registered BEFORE dispatch — a handler that throws is exactly the case the
  // fallback exists for, so it must already be armed by then.
  const armed = webhook.indexOf('rememberReplyTarget(event.replyToken');
  const dispatched = webhook.indexOf('await dispatch(event, profile)');
  assert.ok(armed > -1 && dispatched > armed, 'the token is registered too late to help');
});

test('the token map cannot grow without bound', () => {
  // A busy day must not turn into a memory leak: capped, oldest evicted first,
  // and anything past its life is treated as gone.
  assert.match(source, /MAX_REPLY_TARGETS = \d+/);
  assert.match(source, /replyTargets\.delete\(replyTargets\.keys\(\)\.next\(\)\.value\)/);
  assert.match(source, /Date\.now\(\) - hit\.at > REPLY_TARGET_TTL_MS/);

  // A token that was used successfully is not kept around either.
  assert.match(source, /await client\.replyMessage[\s\S]*?replyTargets\.delete\(replyToken\)/);
});
