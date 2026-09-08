import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startKeepAlive, keepAliveEnabled, parseHours, withinActiveHours } from '../src/services/keepAlive.js';

const BASE = { PUBLIC_BASE_URL: 'https://muang-jod.example.com' };

test('the ping only runs when there is a public URL and it is switched on', () => {
  assert.equal(startKeepAlive({ env: {} }), null, 'nothing to ping without a public URL');
  assert.equal(startKeepAlive({ env: { ...BASE, KEEP_ALIVE: '0' } }), null, 'KEEP_ALIVE=0 turns it off');
  assert.equal(startKeepAlive({ env: { PUBLIC_BASE_URL: 'http://insecure.example.com' } }), null, 'plain http is not a base');

  assert.equal(keepAliveEnabled({}), true, 'on by default');
  assert.equal(keepAliveEnabled({ KEEP_ALIVE: 'false' }), false);
});

test('the active window is read from KEEP_ALIVE_HOURS, and a bad value does not silence it', () => {
  assert.deepEqual(parseHours('6-23'), [6, 23]);
  assert.deepEqual(parseHours(' 0 - 24 '), [0, 24]);
  assert.deepEqual(parseHours('22-6'), [22, 6], 'a window may wrap past midnight');
  for (const bad of [undefined, '', 'always', '25-30', '9-9', '6:00-23:00']) {
    assert.deepEqual(parseHours(bad), [6, 23], `${bad}: falls back rather than never pinging`);
  }
});

test('the ping only runs during the active hours, counted in Bangkok time', () => {
  const at = (iso) => new Date(iso);
  // 06:00-23:00 Bangkok is 23:00-16:00 UTC.
  assert.equal(withinActiveHours(at('2026-09-08T02:00:00Z'), [6, 23]), true, '09:00 Bangkok');
  assert.equal(withinActiveHours(at('2026-09-08T15:59:00Z'), [6, 23]), true, '22:59 Bangkok');
  assert.equal(withinActiveHours(at('2026-09-08T16:00:00Z'), [6, 23]), false, '23:00 Bangkok');
  assert.equal(withinActiveHours(at('2026-09-08T21:00:00Z'), [6, 23]), false, '04:00 Bangkok');

  assert.equal(withinActiveHours(at('2026-09-08T21:00:00Z'), [0, 24]), true, 'round the clock');
  // A wrapping window covers both sides of midnight.
  assert.equal(withinActiveHours(at('2026-09-08T05:00:00Z'), [22, 6]), false, '12:00 Bangkok, outside');
  assert.equal(withinActiveHours(at('2026-09-08T15:00:00Z'), [22, 6]), true, '22:00 Bangkok');
  assert.equal(withinActiveHours(at('2026-09-08T16:00:00Z'), [22, 6]), true, '23:00 Bangkok');
  assert.equal(withinActiveHours(at('2026-09-08T21:00:00Z'), [22, 6]), true, '04:00 Bangkok');
});

test('it pings its own /health on the interval, and a failed ping does not throw', async () => {
  const calls = [];
  const stop = startKeepAlive({
    env: { ...BASE, KEEP_ALIVE_INTERVAL_MS: '10', KEEP_ALIVE_HOURS: '0-24' },
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


test('outside the window it stays quiet, which is what keeps the free hours down', async () => {
  const calls = [];
  const stop = startKeepAlive({
    env: { ...BASE, KEEP_ALIVE_INTERVAL_MS: '10' },
    now: () => new Date('2026-09-08T21:00:00Z'), // 04:00 Bangkok
    fetch: async (url) => calls.push(url),
  });
  await new Promise((r) => setTimeout(r, 60));
  stop();
  assert.equal(calls.length, 0, 'nothing should have been pinged at 4am');
});
