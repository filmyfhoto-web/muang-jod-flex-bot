import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockSupabase } from './helpers/mockSupabase.js';
import { getState, setState, clearState, STATES } from '../src/services/stateService.js';

const USER = 'user-1';

test('setState upserts, getState reads it back', async () => {
  const db = createMockSupabase();

  await setState(USER, STATES.CONFIRMING_JOB, { draft: { total: 700 } }, db);
  let state = await getState(USER, db);
  assert.equal(state.state, STATES.CONFIRMING_JOB);
  assert.equal(state.context.draft.total, 700);

  await setState(USER, STATES.WAITING_FOR_EDIT, { jobId: 'j1' }, db);
  state = await getState(USER, db);
  assert.equal(state.state, STATES.WAITING_FOR_EDIT);
  assert.equal(db._store.tables.user_states.length, 1); // still one row per user

  await clearState(USER, db);
  assert.equal((await getState(USER, db)).state, STATES.IDLE);
});

test('setState falls back to update/insert when ON CONFLICT is unsupported', async () => {
  const db = createMockSupabase({ failUpsert: true });

  // No row yet -> update matches nothing, insert creates it.
  const created = await setState(USER, STATES.WAITING_FOR_JOB, {}, db);
  assert.equal(created.state, STATES.WAITING_FOR_JOB);
  assert.equal(db._store.tables.user_states.length, 1);

  // Row exists -> update path, no duplicate row.
  const updated = await setState(USER, STATES.CONFIRMING_JOB, { draft: { total: 12 } }, db);
  assert.equal(updated.state, STATES.CONFIRMING_JOB);
  assert.equal(db._store.tables.user_states.length, 1);
  assert.equal((await getState(USER, db)).context.draft.total, 12);
});

test('getState is per-user, returns null when unknown, survives duplicate rows', async () => {
  const db = createMockSupabase({
    user_states: [
      { id: 's1', user_id: USER, state: 'idle', context: {}, updated_at: '2026-09-07T01:00:00.000Z' },
      { id: 's2', user_id: USER, state: STATES.WAITING_FOR_SEARCH, context: {}, updated_at: '2026-09-07T02:00:00.000Z' },
      { id: 's3', user_id: 'other', state: STATES.WAITING_FOR_EDIT, context: {}, updated_at: '2026-09-07T03:00:00.000Z' },
    ],
  });

  assert.equal((await getState(USER, db)).state, STATES.WAITING_FOR_SEARCH); // newest wins
  assert.equal((await getState('other', db)).state, STATES.WAITING_FOR_EDIT);
  assert.equal(await getState('nobody', db), null);
});
