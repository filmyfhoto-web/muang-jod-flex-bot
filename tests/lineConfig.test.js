import { test } from 'node:test';
import assert from 'node:assert/strict';
import { channelSecretShape } from '../src/config/line.js';

// A wrong channel secret fails every webhook signature, LINE answers itself
// with a 401 and stops delivering, and the chat just goes quiet. Catching the
// shape is the difference between a five-minute fix and an evening of guessing.

test('a channel secret is 32 hex characters, and anything else is named', () => {
  const good = 'a'.repeat(32);
  assert.deepEqual(channelSecretShape(good, good), { ok: true, length: 32, trimmed: false });

  // The channel ID is the value most often pasted here by mistake: all digits,
  // and the wrong length.
  const channelId = '2007891234';
  assert.equal(channelSecretShape(channelId, channelId).ok, false);
  assert.match(channelSecretShape(channelId, channelId).why, /32/);

  // Right length, but not hex — a token fragment, say.
  const notHex = 'z'.repeat(32);
  assert.equal(channelSecretShape(notHex, notHex).ok, false);
  assert.match(channelSecretShape(notHex, notHex).why, /0-9/);

  assert.equal(channelSecretShape('', '').ok, false);
});

test('whitespace around the value is reported, since it is invisible in a dashboard', () => {
  const secret = 'f'.repeat(32);
  assert.deepEqual(channelSecretShape(secret, `  ${secret}\n`), { ok: true, length: 32, trimmed: true });
  assert.equal(channelSecretShape(secret, secret).trimmed, false);
});
