import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liffId, liffChannelId, liffUrl } from '../src/utils/liff.js';
import { verifyLineAccessToken } from '../src/routes/api.js';
import { safe, jobPatchSchema } from '../src/utils/validation.js';

const ENV = { LIFF_ID: '1234567890-AbCdEfGh' };

test('liff: id, channel and URL building', () => {
  assert.equal(liffId(ENV), '1234567890-AbCdEfGh');
  assert.equal(liffChannelId(ENV), '1234567890');
  assert.equal(liffUrl({}, ENV), 'https://liff.line.me/1234567890-AbCdEfGh');
  assert.equal(liffUrl({ edit: 'job-1' }, ENV), 'https://liff.line.me/1234567890-AbCdEfGh?edit=job-1');
  assert.equal(liffUrl({ edit: null, tab: 'today' }, ENV), 'https://liff.line.me/1234567890-AbCdEfGh?tab=today');
});

test('liff: unset or malformed id disables every LIFF link', () => {
  for (const env of [{}, { LIFF_ID: '' }, { LIFF_ID: 'not-a-liff-id' }, { LIFF_ID: '1234567890' }]) {
    assert.equal(liffId(env), null);
    assert.equal(liffUrl({ edit: 'x' }, env), null);
  }
});

// A stub LINE API: /verify describes the token, /profile identifies its owner.
function lineApi({ clientId = '1234567890', expiresIn = 2000, userId = 'U-line-1', verifyOk = true, profileOk = true } = {}) {
  return async (url) => {
    if (String(url).includes('/oauth2/v2.1/verify')) {
      return { ok: verifyOk, json: async () => ({ client_id: clientId, expires_in: expiresIn }) };
    }
    return { ok: profileOk, json: async () => ({ userId, displayName: 'ฟิล์ม' }) };
  };
}

test('verifyLineAccessToken: accepts a live token from our own channel', async () => {
  const user = await verifyLineAccessToken('tok-1', {
    fetchImpl: lineApi(),
    channelId: '1234567890',
    now: 1,
  });
  assert.equal(user.userId, 'U-line-1');
  assert.equal(user.displayName, 'ฟิล์ม');
});

test('verifyLineAccessToken: rejects another channel, an expired token, and no token', async () => {
  const base = { channelId: '1234567890', now: 1 };
  assert.equal(await verifyLineAccessToken('tok-2', { ...base, fetchImpl: lineApi({ clientId: '999' }) }), null);
  assert.equal(await verifyLineAccessToken('tok-3', { ...base, fetchImpl: lineApi({ expiresIn: 0 }) }), null);
  assert.equal(await verifyLineAccessToken('tok-4', { ...base, fetchImpl: lineApi({ verifyOk: false }) }), null);
  assert.equal(await verifyLineAccessToken('tok-5', { ...base, fetchImpl: lineApi({ profileOk: false }) }), null);
  assert.equal(await verifyLineAccessToken('', { ...base, fetchImpl: lineApi() }), null);
});

test('jobPatchSchema: accepts a partial edit, rejects junk and unknown fields', () => {
  assert.ok(safe(jobPatchSchema, { job_name: 'ป้ายงานวัด' }).ok);
  assert.ok(safe(jobPatchSchema, { total: 500, payment_status: 'paid' }).ok);
  assert.ok(safe(jobPatchSchema, { customer_name: null, note: null }).ok);

  assert.ok(!safe(jobPatchSchema, {}).ok); // nothing to change
  assert.ok(!safe(jobPatchSchema, { total: -5 }).ok);
  assert.ok(!safe(jobPatchSchema, { payment_status: 'unknown' }).ok);
  assert.ok(!safe(jobPatchSchema, { job_date: '7/9/2026' }).ok);
  assert.ok(!safe(jobPatchSchema, { user_id: 'someone-else' }).ok); // strict
  assert.ok(!safe(jobPatchSchema, { job_name: '' }).ok);
});
