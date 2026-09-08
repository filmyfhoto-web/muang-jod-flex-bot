import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startKeepAlive, keepAliveEnabled } from '../src/services/keepAlive.js';

const BASE = { PUBLIC_BASE_URL: 'https://muang-jod.example.com' };

test('the ping only runs when there is a public URL and it is switched on', () => {
  assert.equal(startKeepAlive({ env: {} }), null, 'nothing to ping without a public URL');
  assert.equal(startKeepAlive({ env: { ...BASE, KEEP_ALIVE: '0' } }), null, 'KEEP_ALIVE=0 turns it off');
  assert.equal(startKeepAlive({ env: { PUBLIC_BASE_URL: 'http://insecure.example.com' } }), null, 'plain http is not a base');

  assert.equal(keepAliveEnabled({}), true, 'on by default');
  assert.equal(keepAliveEnabled({ KEEP_ALIVE: 'false' }), false);
});

test('it pings its own /health on the interval, and a failed ping does not throw', async () => {
  const calls = [];
  const stop = startKeepAlive({
    env: { ...BASE, KEEP_ALIVE_INTERVAL_MS: '10' },
    fetch: async (url) => {
      calls.push(url);
      throw new Error('host asleep'); // the pass must survive this
    },
  });
  assert.equal(typeof stop, 'function');

  await new Promise((r) => setTimeout(r, 60));
  stop();

  assert.ok(calls.length >= 2, `expected repeated pings, got ${calls.length}`);
  assert.ok(calls.every((u) => u === 'https://muang-jod.example.com/health'));

  // Stopping means stopping.
  const seen = calls.length;
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(calls.length, seen);
});
