import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMockSupabase } from './helpers/mockSupabase.js';
import { getFreshState, isStaleState, STATE_TTL_MS, STATES } from '../src/services/stateService.js';

/* สถานะสนทนาต้องหมดอายุ — เคสจริง: ชุดคำถาม "ขนาดเท่าไหร่คะ?" ของกรอบรูป
 * ค้างข้ามคืน เช้ามาร้านพิมพ์ "งานพิมพ์การ์ด" ก็ถูกอ่านเป็นคำตอบของเมื่อวาน
 * แล้วเจอ "ยังไม่เข้าใจ" ซ้ำ ๆ จนร้านสรุปว่าบอทพัง
 */

const USER = 'user-1';
const ago = (hours) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
const row = (over = {}) => ({ id: 's1', user_id: USER, state: STATES.COLLECTING_JOB, context: { collect: { asking: 'size' } }, updated_at: ago(7), ...over });

test('สถานะค้างเกิน 6 ชม. → อ่านได้ idle และล้างทิ้งถาวร (รอบหน้าก็ idle)', async () => {
  const db = createMockSupabase({ user_states: [row()] });
  const fresh = await getFreshState(USER, db);
  assert.equal(fresh.state, STATES.IDLE);
  assert.deepEqual(fresh.context, {});
  // ล้างจริงในฐานข้อมูล ไม่ใช่แค่โกหกรอบเดียว
  assert.equal(db._store.tables.user_states.length, 1);
  assert.equal(db._store.tables.user_states[0].state, STATES.IDLE);
});

test('สถานะยังใหม่ (1 ชม.) → คืนตามเดิม ไม่แตะต้อง', async () => {
  const db = createMockSupabase({ user_states: [row({ updated_at: ago(1) })] });
  const fresh = await getFreshState(USER, db);
  assert.equal(fresh.state, STATES.COLLECTING_JOB);
  assert.equal(fresh.context.collect.asking, 'size');
  assert.equal(db._store.tables.user_states[0].state, STATES.COLLECTING_JOB);
});

test('idle เก่าแค่ไหนก็ไม่นับว่าหมดอายุ — ไม่เขียนทับให้เปลืองเปล่า ๆ', async () => {
  const old = row({ state: STATES.IDLE, context: {}, updated_at: '2026-09-01T00:00:00.000Z' });
  const db = createMockSupabase({ user_states: [{ ...old }] });
  const fresh = await getFreshState(USER, db);
  assert.equal(fresh.state, STATES.IDLE);
  assert.equal(db._store.tables.user_states[0].updated_at, old.updated_at, 'ห้ามเขียนทับแถว idle');
});

test('updated_at อ่านไม่ออก = ไม่หมดอายุ (ห้ามล้างสถานะเพราะข้อมูลเพี้ยน) และคนไม่มีแถว = null', async () => {
  const db = createMockSupabase({ user_states: [row({ updated_at: 'ไม่ใช่เวลา' })] });
  assert.equal((await getFreshState(USER, db)).state, STATES.COLLECTING_JOB);
  assert.equal(await getFreshState('nobody', db), null);

  assert.equal(isStaleState(null), false);
  assert.equal(isStaleState({ state: STATES.COLLECTING_JOB, updated_at: ago(7) }), true);
  assert.equal(isStaleState({ state: STATES.COLLECTING_JOB, updated_at: ago(5) }), false);
  assert.equal(STATE_TTL_MS, 6 * 60 * 60 * 1000);
});

test('ทางข้อความและทางรูปอ่านสถานะผ่านตัวตรวจอายุ (ปุ่มการ์ดยังใช้ getState ตรง ๆ)', () => {
  const msg = readFileSync(new URL('../src/handlers/messageHandler.js', import.meta.url), 'utf8');
  const img = readFileSync(new URL('../src/handlers/imageHandler.js', import.meta.url), 'utf8');
  assert.match(msg, /getFreshState as getState/);
  assert.match(img, /getFreshState as getState/);
});
