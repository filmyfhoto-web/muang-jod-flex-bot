import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskUserId, _sanitizeForTest as sanitize } from '../src/services/logger.js';

test('maskUserId hides the middle', () => {
  const masked = maskUserId('U1234567890abcdef');
  assert.equal(masked, 'U123…cdef');
  assert.equal(maskUserId(''), 'unknown');
});

test('sanitize redacts secrets and buffers, never logs them', () => {
  const out = sanitize({
    channel_access_token: 'super-secret',
    service_role_key: 'key',
    SUPABASE_SERVICE_ROLE_KEY: 'key2',
    buffer: Buffer.from('binary-content'),
    action: 'add_job',
    nested: { authorization: 'Bearer x', ok: 1 },
  });
  assert.equal(out.channel_access_token, '[REDACTED]');
  assert.equal(out.service_role_key, '[REDACTED]');
  assert.equal(out.SUPABASE_SERVICE_ROLE_KEY, '[REDACTED]');
  assert.match(out.buffer, /^\[buffer \d+b\]$/);
  assert.equal(out.action, 'add_job'); // non-secret preserved
  assert.equal(out.nested.authorization, '[REDACTED]');
  assert.equal(out.nested.ok, 1);
});
