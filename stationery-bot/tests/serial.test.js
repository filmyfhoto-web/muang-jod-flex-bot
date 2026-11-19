import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSerial } from '../src/serial.js';

const tick = (ms) => new Promise((r) => setTimeout(r, ms));

test('one customer\'s jobs run one at a time, in the order they were queued', async () => {
  const s = createSerial();
  const log = [];
  let running = 0;
  let maxRunning = 0;
  const job = (name, ms) => async () => {
    running++;
    maxRunning = Math.max(maxRunning, running);
    log.push(`start ${name}`);
    await tick(ms);
    log.push(`end ${name}`);
    running--;
  };
  await Promise.all([s.run('u1', job('a', 20)), s.run('u1', job('b', 1)), s.run('u1', job('c', 5))]);
  assert.deepEqual(log, ['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
  assert.equal(maxRunning, 1);
});

test('different customers do not wait for each other', async () => {
  const s = createSerial();
  let running = 0;
  let maxRunning = 0;
  const job = async () => {
    running++;
    maxRunning = Math.max(maxRunning, running);
    await tick(15);
    running--;
  };
  await Promise.all([s.run('u1', job), s.run('u2', job), s.run('u3', job)]);
  assert.equal(maxRunning, 3);
});

test('a job that fails does not block the ones behind it, and the failure still reaches its caller', async () => {
  const s = createSerial();
  const failing = s.run('u1', async () => {
    throw new Error('boom');
  });
  const after = s.run('u1', async () => 'ok');
  await assert.rejects(failing, /boom/);
  assert.equal(await after, 'ok');
});

test('finished customers are forgotten (no memory growth)', async () => {
  const s = createSerial();
  await Promise.all([s.run('a', async () => {}), s.run('b', async () => {})]);
  await tick(5);
  assert.equal(s.size(), 0);
});
