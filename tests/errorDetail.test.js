import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errorDetail, debugErrorsEnabled } from '../src/routes/webhook.js';

test('errorDetail surfaces the useful part of each error shape', () => {
  // Supabase / PostgREST
  const pg = { code: '42P10', message: 'no unique or exclusion constraint', hint: 'add a unique index' };
  const pgText = errorDetail(pg);
  assert.ok(pgText.includes('42P10'));
  assert.ok(pgText.includes('add a unique index'));

  // LINE SDK — the reason lives in `body`, not `message`
  const line = {
    status: 400,
    message: 'Request failed with status code 400',
    body: { message: 'A message (messages[1]) in the request body is invalid' },
  };
  const lineText = errorDetail(line);
  assert.ok(lineText.includes('400'));
  assert.ok(lineText.includes('messages[1]'));

  assert.equal(errorDetail(null), 'unknown error');
  assert.ok(errorDetail({ message: 'x'.repeat(2000) }).length <= 900);
});

test('debug detail is on unless explicitly switched off', () => {
  assert.equal(debugErrorsEnabled({}), true);
  assert.equal(debugErrorsEnabled({ DEBUG_ERRORS: '1' }), true);
  assert.equal(debugErrorsEnabled({ DEBUG_ERRORS: '0' }), false);
  assert.equal(debugErrorsEnabled({ DEBUG_ERRORS: 'false' }), false);
  assert.equal(debugErrorsEnabled({ DEBUG_ERRORS: 'off' }), false);
});
