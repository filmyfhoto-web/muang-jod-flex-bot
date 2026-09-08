import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockSupabase } from './helpers/mockSupabase.js';
import { REMIND_CHOICES, findChoice, resolveRemindAt } from '../src/utils/remindTimes.js';
import {
  createReminder,
  getUpcomingReminders,
  cancelReminder,
  getDueReminders,
  claimReminder,
} from '../src/services/reminderService.js';
import { dispatchDueReminders } from '../src/services/reminderDispatcher.js';

const USER = 'user-1';
const OTHER = 'user-2';

test('remind times land on the chosen hour in Bangkok, never in the past', () => {
  const morning = new Date('2026-09-08T02:00:00Z'); // 09:00 Bangkok

  const tomorrow = resolveRemindAt('tomorrow_9', morning);
  assert.ok(tomorrow > morning);
  assert.equal(tomorrow.toISOString(), '2026-09-09T02:00:00.000Z'); // 09:00 +07

  // 18:00 today is still ahead at 09:00.
  assert.equal(resolveRemindAt('tonight_18', morning).toISOString(), '2026-09-08T11:00:00.000Z');

  // …but from 20:00 it has passed, so it rolls to tomorrow rather than firing
  // the moment it is created.
  const evening = new Date('2026-09-08T13:00:00Z'); // 20:00 Bangkok
  const rolled = resolveRemindAt('tonight_18', evening);
  assert.ok(rolled > evening);
  assert.equal(rolled.toISOString(), '2026-09-09T11:00:00.000Z');

  assert.equal(resolveRemindAt('nope', morning), null);
  assert.equal(findChoice('nope'), null);
  assert.ok(REMIND_CHOICES.every((c) => c.id && c.label && typeof c.hour === 'number'));
});

test('reminders are created, listed and cancelled per user', async () => {
  const db = createMockSupabase();

  const r = await createReminder(USER, { message: 'ทวงงานพี่นก', remindAt: new Date('2026-09-09T02:00:00Z') }, db);
  assert.equal(r.status, 'pending');
  assert.equal(r.message, 'ทวงงานพี่นก');

  await createReminder(OTHER, { message: 'ของคนอื่น', remindAt: new Date('2026-09-09T02:00:00Z') }, db);

  const mine = await getUpcomingReminders(USER, db);
  assert.equal(mine.length, 1, 'only this user\'s reminders come back');

  assert.equal(await cancelReminder(OTHER, r.id, db), null, 'another user cannot cancel it');
  assert.equal((await cancelReminder(USER, r.id, db)).status, 'cancelled');
  assert.deepEqual(await getUpcomingReminders(USER, db), []);
  assert.equal(await cancelReminder(USER, r.id, db), null, 'cancelling twice is a no-op');
});

test('createReminder rejects an empty message or an unusable time', async () => {
  const db = createMockSupabase();
  assert.equal(await createReminder(USER, { message: '   ', remindAt: new Date() }, db), null);
  assert.equal(await createReminder(USER, { message: 'x', remindAt: 'not a date' }, db), null);
});

test('only due reminders are picked up, and only once', async () => {
  const now = new Date('2026-09-08T02:00:00Z');
  const db = createMockSupabase();
  const due = await createReminder(USER, { message: 'ถึงเวลาแล้ว', remindAt: new Date('2026-09-08T01:00:00Z') }, db);
  await createReminder(USER, { message: 'ยังไม่ถึง', remindAt: new Date('2026-09-08T09:00:00Z') }, db);

  const picked = await getDueReminders({ now }, db);
  assert.deepEqual(picked.map((r) => r.id), [due.id]);

  // Claiming is what stops a second dispatcher sending the same nudge.
  assert.equal((await claimReminder(due.id, db)).status, 'sent');
  assert.equal(await claimReminder(due.id, db), null);
  assert.deepEqual(await getDueReminders({ now }, db), []);
});

test('the dispatcher pushes to the reminder owner and retries a failed push', async () => {
  const now = new Date('2026-09-08T02:00:00Z');
  const db = createMockSupabase({
    profiles: [{ id: USER, line_user_id: 'U-line-1' }],
  });
  await createReminder(USER, { message: 'ทวงงานพี่นก', remindAt: new Date('2026-09-08T01:00:00Z') }, db);

  const sent = [];
  const result = await dispatchDueReminders({
    client: db,
    now,
    push: async (to, msg) => sent.push({ to, text: msg.text }),
  });

  assert.deepEqual(result, { due: 1, sent: 1 });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'U-line-1');
  assert.ok(sent[0].text.includes('ทวงงานพี่นก'));

  // Nothing is left to send.
  assert.deepEqual(await dispatchDueReminders({ client: db, now, push: async () => {} }), { due: 0, sent: 0 });
});

test('a push that throws leaves the reminder pending for the next pass', async () => {
  const now = new Date('2026-09-08T02:00:00Z');
  const db = createMockSupabase({ profiles: [{ id: USER, line_user_id: 'U-line-1' }] });
  await createReminder(USER, { message: 'ลองใหม่', remindAt: new Date('2026-09-08T01:00:00Z') }, db);

  const failed = await dispatchDueReminders({
    client: db,
    now,
    push: async () => {
      throw new Error('LINE down');
    },
  });
  assert.deepEqual(failed, { due: 1, sent: 0 });

  const sent = [];
  const retry = await dispatchDueReminders({ client: db, now, push: async (to, m) => sent.push(m.text) });
  assert.deepEqual(retry, { due: 1, sent: 1 }, 'the reminder was retried, not lost');
  assert.ok(sent[0].includes('ลองใหม่'));
});
