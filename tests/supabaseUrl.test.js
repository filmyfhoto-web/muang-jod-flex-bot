import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSupabaseUrl } from '../src/utils/supabaseUrl.js';

const ORIGIN = 'https://abcdefghijkl.supabase.co';

test('normalizeSupabaseUrl: accepts the project URL as-is', () => {
  assert.equal(normalizeSupabaseUrl(ORIGIN), ORIGIN);
  assert.equal(normalizeSupabaseUrl(`${ORIGIN}/`), ORIGIN);
  assert.equal(normalizeSupabaseUrl(`  ${ORIGIN}  `), ORIGIN);
});

test('normalizeSupabaseUrl: strips the service endpoints the dashboard also shows', () => {
  assert.equal(normalizeSupabaseUrl(`${ORIGIN}/rest/v1`), ORIGIN);
  assert.equal(normalizeSupabaseUrl(`${ORIGIN}/rest/v1/`), ORIGIN);
  assert.equal(normalizeSupabaseUrl(`${ORIGIN}/rest/v1/profiles`), ORIGIN);
  assert.equal(normalizeSupabaseUrl(`${ORIGIN}/auth/v1`), ORIGIN);
  assert.equal(normalizeSupabaseUrl(`${ORIGIN}/storage/v1/object`), ORIGIN);
  assert.equal(normalizeSupabaseUrl(`${ORIGIN}/functions/v1`), ORIGIN);
});

test('normalizeSupabaseUrl: forgives quotes and a missing scheme', () => {
  assert.equal(normalizeSupabaseUrl(`"${ORIGIN}"`), ORIGIN);
  assert.equal(normalizeSupabaseUrl(`'${ORIGIN}/rest/v1'`), ORIGIN);
  assert.equal(normalizeSupabaseUrl('abcdefghijkl.supabase.co'), ORIGIN);
});

test('normalizeSupabaseUrl: keeps a self-hosted path prefix, rejects garbage', () => {
  assert.equal(normalizeSupabaseUrl('https://example.com/supabase/rest/v1'), 'https://example.com/supabase');
  assert.equal(normalizeSupabaseUrl(''), null);
  assert.equal(normalizeSupabaseUrl(null), null);
  assert.equal(normalizeSupabaseUrl('http://'), null);
});
