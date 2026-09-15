import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import express from 'express';
import { createMockSupabase } from './helpers/mockSupabase.js';
import { dispatchCheckins } from '../src/services/checkinDispatcher.js';
import { createApiRouter } from '../src/routes/api.js';
import {
  dueSlot,
  zonedParts,
  toMinutes,
  toHHMM,
  normalizeSettings,
  sendKey,
  snoozeUntil,
  snoozeUntilAt,
  snoozeText,
  checkinText,
  CHECKIN_ACTIONS,
  DEFAULT_TIMES,
} from '../src/utils/checkinSchedule.js';

const dashboard = readFileSync(new URL('../public/liff/index.html', import.meta.url), 'utf8');
const actions = readFileSync(new URL('../src/actions/checkin.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/010_checkin.sql', import.meta.url), 'utf8');

process.env.LIFF_ID = '1234567890-abcdefgh';

// ร้านขอให้ม่วงแวะมาถามเองว่า "วันนี้มีงานอะไรให้ม่วงจดไหมคะ?" วันละสองรอบ
// ข้อความที่ร้านไม่ได้ขอ ส่งผิดทีเดียวก็กลายเป็นแอปกวนใจไปแล้ว ทุกเทสต์ในไฟล์นี้
// จึงเป็นเทสต์ที่ถามว่า "ไม่ส่งตอนไหน" มากกว่า "ส่งตอนไหน"

const SHOP = { line_user_id: 'U1', display_name: 'ฟิล์ม' };
const at = (iso) => new Date(iso);

test('the clock is the shop\'s clock, not the server\'s', () => {
  // Render รันด้วย UTC ถ้าอ่านวันจากเครื่องตรง ๆ ร้านไทยจะข้ามวันตอนตีเจ็ด
  const justBeforeMidnightBangkok = at('2026-09-15T16:30:00Z'); // 23:30 ไทย
  const bkk = zonedParts(justBeforeMidnightBangkok, 'Asia/Bangkok');
  assert.equal(bkk.day, '2026-09-15', 'วันของร้านข้ามไปแล้วทั้งที่ยังไม่เที่ยงคืน');
  assert.equal(bkk.minutes, 23 * 60 + 30);
  assert.equal(zonedParts(justBeforeMidnightBangkok, 'UTC').day, '2026-09-15');

  // เที่ยงคืนตรงของไทยคือวันใหม่ และเป็นนาทีที่ 0 ไม่ใช่ 1440
  const midnight = zonedParts(at('2026-09-15T17:00:00Z'), 'Asia/Bangkok');
  assert.equal(midnight.day, '2026-09-16');
  assert.equal(midnight.minutes, 0);

  assert.equal(toMinutes('12:00'), 720);
  assert.equal(toMinutes('7:05'), 425);
  assert.equal(toMinutes('24:00'), null, 'เวลาที่ไม่มีอยู่จริงต้องไม่ผ่าน');
  assert.equal(toMinutes('ห้าโมง'), null);
  assert.equal(toHHMM(720), '12:00');
});

test('a shop that never opened settings is never messaged', () => {
  // กฎข้อแรกของบรีฟ: ส่งเฉพาะคนที่เปิดรับไว้แล้ว
  assert.equal(dueSlot({ ...SHOP, enabled: false }, { now: at('2026-09-15T05:05:00Z') }).ok, false);
  assert.equal(dueSlot({ display_name: 'ฟิล์ม' }, { now: at('2026-09-15T05:05:00Z') }).why, 'ไม่มี LINE user id');

  // และ dispatcher อ่านเฉพาะแถวที่ enabled — ไม่มีแถว = ไม่มีใครให้ส่ง
  assert.match(
    readFileSync(new URL('../src/services/checkinService.js', import.meta.url), 'utf8'),
    /\.eq\('enabled', true\)/,
    'ดึงคนมาส่งโดยไม่ได้กรองว่าเปิดไว้ไหม'
  );
});

test('each slot fires once a day, whatever the timer does', async () => {
  const db = createMockSupabase({
    profiles: [{ id: 'u1', ...SHOP }],
    notification_settings: [{ user_id: 'u1', ...SHOP, enabled: true, reminder_times: DEFAULT_TIMES, active_days: [0, 1, 2, 3, 4, 5, 6], timezone: 'Asia/Bangkok' }],
  });
  const pushes = [];
  const push = async (to, msg) => pushes.push({ to, msg });
  const run = (now) => dispatchCheckins({ client: db, push, now: at(now), env: {} });

  assert.equal((await run('2026-09-15T05:05:00Z')).sent, 1, 'รอบเที่ยงไม่ได้ส่ง');
  // ตัวจับเวลาเดินทุกห้านาที ทุกรอบหลังจากนี้ต้องไม่ส่งอะไรอีก
  for (const t of ['2026-09-15T05:10:00Z', '2026-09-15T05:20:00Z', '2026-09-15T06:00:00Z']) {
    assert.equal((await run(t)).sent, 0, `ส่งซ้ำตอน ${t}`);
  }
  assert.equal((await run('2026-09-15T11:05:00Z')).sent, 1, 'รอบเย็นไม่ได้ส่ง');
  assert.equal((await run('2026-09-15T11:10:00Z')).sent, 0);

  assert.equal(pushes.length, 2, `ส่งไป ${pushes.length} ครั้ง ควรเป็นสองครั้ง`);
  assert.equal(pushes[0].to, 'U1', 'ต้องยิงด้วย LINE user id ไม่ใช่ชื่อ');

  // ประวัติการส่งบันทึกครบ พร้อมกุญแจกันซ้ำ
  const logs = db._store.tables.notification_logs;
  assert.deepEqual(logs.map((l) => l.unique_send_key).sort(), [
    'U1|2026-09-15|12:00|checkin',
    'U1|2026-09-15|18:00|checkin',
  ]);
  assert.ok(logs.every((l) => l.status === 'sent' && l.sent_at), 'สถานะการส่งไม่ได้ถูกบันทึก');
  assert.ok(logs.every((l) => l.user_response == null), 'บันทึกคำตอบทั้งที่ร้านยังไม่ได้ตอบ');
});

test('the message says something different at noon and at six', () => {
  assert.match(checkinText('12:00', 'ฟิล์ม'), /^ฟิล์มคะ ช่วงเช้า/);
  assert.match(checkinText('18:00', 'ฟิล์ม'), /ยังไม่ได้จดอีกไหม/);
  // ไม่ได้ตั้งชื่อไว้ก็ทักได้ ไม่ใช่ "undefined คะ"
  assert.match(checkinText('12:00', null), /^สวัสดีค่ะ/);
  // ตั้งข้อความเองได้
  assert.equal(checkinText('12:00', 'ฟิล์ม', 'มีงานไหมจ๊ะ'), 'ฟิล์มคะ มีงานไหมจ๊ะ');

  // ห้าปุ่มตามบรีฟ ครบและเรียงตามนั้น
  assert.deepEqual(CHECKIN_ACTIONS.map((a) => a.label), [
    '✏️ มีงานให้จด',
    '📋 ดูงานวันนี้',
    '✅ วันนี้ไม่มีงาน',
    '⏰ เตือนอีกที',
    '🔕 วันนี้ไม่ต้อง',
  ]);
  // LINE นับเป็นหน่วย UTF-16 และปฏิเสธทั้งข้อความถ้าป้ายไหนยาวเกิน ไม่ใช่ตัดให้
  // "🔕 ไม่ต้องเตือนวันนี้" ยาว 21 พอดี — ร้านจะไม่ได้รับอะไรเลย
  for (const a of CHECKIN_ACTIONS) assert.ok(a.label.length <= 20, `ป้ายยาวเกิน (${a.label.length}): ${a.label}`);
  assert.equal(CHECKIN_ACTIONS.at(-1).text, 'ไม่ต้องเตือนวันนี้', 'คำเต็มหายไปจาก displayText ด้วย');
});

test('every reason not to send', () => {
  const now = at('2026-09-15T11:05:00Z'); // 18:05 ไทย อังคาร
  const why = (ctx) => dueSlot(SHOP, { now, ...ctx }).why;

  assert.equal(why({ dayState: { answered_at: '2026-09-15T05:10:00Z' } }), 'ตอบไปแล้ววันนี้');
  assert.equal(why({ dayState: { muted: true } }), 'ปิดเสียงเฉพาะวันนี้');
  assert.equal(why({ dayState: { snooze_until: '2026-09-15T12:00:00Z' } }), 'เลื่อนไปก่อน');
  assert.equal(why({ lastJobAt: '2026-09-15T10:30:00Z' }), 'เพิ่งจดงานไป');
  assert.equal(why({ sentKeys: [sendKey({ lineUserId: 'U1', day: '2026-09-15', slot: '18:00' })] }), 'ส่งรอบนี้ไปแล้ว');
  assert.equal(dueSlot({ ...SHOP, active_days: [0, 6] }, { now }).why, 'ไม่ใช่วันที่ตั้งให้ทัก');
  assert.equal(dueSlot({ ...SHOP, skip_holidays: true }, { now, isHoliday: true }).why, 'วันหยุด');
  // ตีสองไม่ทัก
  assert.equal(dueSlot(SHOP, { now: at('2026-09-15T19:00:00Z') }).why, 'ยังไม่ถึงเวลา');
  // สายเกินก็ไม่ทักย้อนหลัง อ่านเหมือนบอทค้าง ไม่เหมือนคนแวะมาถาม
  assert.equal(dueSlot(SHOP, { now: at('2026-09-15T08:40:00Z') }).why, 'ยังไม่ถึงเวลา');

  // เลื่อนเวลาผ่านไปแล้วก็ทักได้ตามปกติ
  assert.equal(dueSlot(SHOP, { now, dayState: { snooze_until: '2026-09-15T10:00:00Z' } }).ok, true);
});

test('waking up late asks the round it is actually near, not the one it missed', () => {
  // ตื่นมาตอนหกโมงครึ่งแล้วมีทั้งรอบเที่ยงและรอบหกโมงค้าง — ต้องถามรอบหกโมง
  const verdict = dueSlot(SHOP, { now: at('2026-09-15T11:35:00Z') });
  assert.equal(verdict.ok, true);
  assert.equal(verdict.slot, '18:00', 'ถามรอบเที่ยงย้อนหลังตอนหกโมงครึ่ง');
});

test('snoozing is not answering, and a time that has gone is refused', () => {
  const noon = at('2026-09-15T05:05:00Z'); // 12:05 ไทย
  assert.equal(snoozeUntil('1h', { now: noon }).toISOString(), '2026-09-15T06:05:00.000Z');
  assert.equal(snoozeUntil('2h', { now: noon }).toISOString(), '2026-09-15T07:05:00.000Z');
  assert.equal(snoozeUntil('17', { now: noon }).toISOString(), '2026-09-15T10:00:00.000Z');
  assert.match(snoozeText(snoozeUntil('17', { now: noon })), /17:00 น\./);

  // ห้าโมงเย็นตอนหกโมงเย็น = ผ่านไปแล้ว ต้องไม่เงียบไปทั้งวัน
  assert.equal(snoozeUntil('17', { now: at('2026-09-15T11:05:00Z') }), null);
  assert.equal(snoozeUntilAt('19:30', { now: noon }).toISOString(), '2026-09-15T12:30:00.000Z');
  assert.equal(snoozeUntilAt('ไม่ใช่เวลา', { now: noon }), null);

  // "เตือนอีกที" เขียนแค่ snooze_until ห้ามแตะ answered_at — ไม่งั้นพอถึงเวลา
  // ที่เลื่อนไว้ ม่วงก็จะไม่ถาม เพราะนึกว่าตอบไปแล้ว
  const snooze = actions.slice(actions.indexOf('export async function checkinSnooze'), actions.indexOf('export async function checkinMuteToday'));
  const writes = snooze.match(/setDayState\([^)]*\)/g) || [];
  assert.equal(writes.length, 1, 'เขียนสถานะของวันหลายที่ในฟังก์ชันเดียว');
  assert.match(writes[0], /snooze_until/);
  assert.ok(!writes[0].includes('answered_at'), 'การเลื่อนเวลาถูกนับเป็นการตอบ');
  assert.ok(!snooze.includes("remember(profile"), 'การเลื่อนเวลาถูกบันทึกเป็นคำตอบ');
});

test('not answering is never recorded as "no work"', () => {
  // กฎข้อ 13 และ 14 ของบรีฟ — ข้อที่ผิดแล้วเจ็บที่สุด
  assert.match(actions, /export async function checkinNoWork/);
  const noWork = actions.slice(actions.indexOf('export async function checkinNoWork'), actions.indexOf('export async function checkinSnooze'));
  assert.match(noWork, /remember\(profile, 'no_work'\)/);

  // ไม่มีที่ไหนเขียน no_work ได้เองนอกจากตอนร้านกดปุ่มนั้น
  const dispatcher = readFileSync(new URL('../src/services/checkinDispatcher.js', import.meta.url), 'utf8');
  assert.ok(!dispatcher.includes('no_work'), 'ตัวส่งข้อความเขียนคำตอบให้ร้านเอง');
  assert.match(migration, /ไม่ได้ตอบ.*ไม่มีงาน|null คือยัง/s);
});

test('blocking the OA stops the schedule, not just this round', async () => {
  const db = createMockSupabase({
    profiles: [{ id: 'u1', ...SHOP }],
    notification_settings: [{ user_id: 'u1', ...SHOP, enabled: true, reminder_times: ['12:00'], active_days: [0, 1, 2, 3, 4, 5, 6], timezone: 'Asia/Bangkok' }],
  });
  const blocked = async () => {
    const err = new Error('blocked');
    err.status = 403;
    throw err;
  };
  await dispatchCheckins({ client: db, push: blocked, now: at('2026-09-15T05:05:00Z'), env: {} });

  assert.equal(db._store.tables.notification_settings[0].enabled, false, 'ยังจะยิงหาคนที่บล็อกอยู่ทุกวัน');
  const log = db._store.tables.notification_logs[0];
  assert.equal(log.status, 'failed');
  assert.ok(log.error_message, 'ส่งไม่สำเร็จแล้วไม่ได้บันทึกว่าเพราะอะไร');
});

test('bad settings are refused, not silently dropped', async () => {
  const saved = [];
  const app = express();
  app.use(
    '/api',
    createApiRouter({
      verify: async () => ({ userId: 'U1' }),
      resolveProfile: async () => ({ id: 'u1', line_user_id: 'U1' }),
      getCheckinSettings: async () => null,
      saveCheckinSettings: async (_id, _line, patch) => {
        saved.push(patch);
        return { user_id: 'u1', line_user_id: 'U1', enabled: true, ...patch };
      },
    })
  );
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (body) =>
    fetch(`${base}/api/checkin`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  try {
    // ยังไม่เคยเปิด = ปิดอยู่ ไม่ใช่เปิดโดยปริยาย
    const first = await (await fetch(`${base}/api/checkin`, { headers: { Authorization: 'Bearer t' } })).json();
    assert.equal(first.checkin.enabled, false, 'เปิดให้เองทั้งที่ร้านไม่ได้กด');
    assert.equal(first.configured, false);

    // เวลาที่อ่านไม่ออกต้องไม่หายไปเงียบ ๆ ร้านจะคิดว่าตั้งแล้วแต่ม่วงไม่เคยมา
    assert.equal((await call({ times: ['12:00', 'บ่ายสอง'] })).status, 400);
    assert.equal((await call({ times: [] })).status, 400);
    assert.equal((await call({ days: [] })).status, 400);

    const ok = await call({ enabled: true, times: ['18:00', '9:30', '18:00'], days: [1, 2, 3, 1], displayName: 'ฟิล์ม' });
    assert.equal(ok.status, 200);
    // เรียงและตัดซ้ำก่อนเก็บ ไม่งั้นรอบซ้อนกันเองแล้วยิงสองครั้ง
    assert.deepEqual(saved.at(-1).reminder_times, ['09:30', '18:00']);
    assert.deepEqual(saved.at(-1).active_days, [1, 2, 3]);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('defaults are the ones the shop asked for, and survive a broken row', () => {
  const cfg = normalizeSettings({});
  assert.deepEqual(cfg.times, ['12:00', '18:00']);
  assert.deepEqual(cfg.days, [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(cfg.timezone, 'Asia/Bangkok');

  // แถวที่พังบางส่วนต้องไม่ทำให้ทั้งระบบเงียบ
  const messy = normalizeSettings({ reminder_times: ['ไม่ใช่เวลา', '8:5'], active_days: [9, -1, 3] });
  assert.deepEqual(messy.times, ['12:00', '18:00'], 'เวลาพังหมดแล้วไม่กลับไปใช้ค่าเริ่มต้น');
  assert.deepEqual(messy.days, [3]);
});

test('the settings page can turn it on, and set times and days', () => {
  assert.ok(dashboard.includes('id="ck-on"'), 'ไม่มีสวิตช์เปิด/ปิด');
  assert.ok(dashboard.includes('id="ck-times"') && dashboard.includes('id="ck-add"'), 'เพิ่ม/ลบช่วงเวลาไม่ได้');
  assert.ok(dashboard.includes('id="ck-days"'), 'เลือกวันไม่ได้');
  assert.ok(dashboard.includes('id="ck-holiday"'), 'ไม่มีตัวเลือกวันหยุด');
  assert.ok(dashboard.includes('id="ck-msg"'), 'เลือกข้อความเองไม่ได้');
  assert.ok(dashboard.includes('id="ck-name"'), 'ตั้งชื่อที่บอทใช้เรียกไม่ได้');
  assert.match(dashboard, /<option value="Asia\/Bangkok">/, 'เลือกเขตเวลาไม่ได้');
  assert.match(dashboard, /api\('\/checkin', \{\s*method: 'PATCH'/, 'หน้าตั้งค่าไม่ได้บันทึกอะไร');
  // เหลือช่วงเดียวแล้วลบไม่ได้ ไม่งั้นเปิดไว้แต่ไม่มีเวลาไหนให้ทักเลย
  assert.match(dashboard, /if \(checkin\.times\.length <= 1\) return toast/);
});

test('the five buttons are wired to something that answers them', () => {
  const router = readFileSync(new URL('../src/handlers/postbackHandler.js', import.meta.url), 'utf8');
  const allowed = readFileSync(new URL('../src/utils/validation.js', import.meta.url), 'utf8');
  for (const a of CHECKIN_ACTIONS) {
    assert.match(router, new RegExp(`case '${a.action}':`), `ไม่มีใครรับปุ่ม ${a.label}`);
    assert.match(allowed, new RegExp(`'${a.action}'`), `${a.action} ไม่อยู่ในรายการที่อนุญาต`);
  }
  // "มีงานให้จด" ต้องเข้าโหมดคุยจดงานต่อทันที ไม่ใช่พาไปเปิดฟอร์ม
  const has = actions.slice(actions.indexOf('export async function checkinHasWork'), actions.indexOf('export async function checkinToday'));
  assert.match(has, /STATES\.WAITING_FOR_JOB/);
  assert.match(has, /มีงานกรอบรูป/, 'ไม่ได้บอกร้านว่าพิมพ์อะไรต่อได้');
});

test('the tables exist, and the duplicate guard is the database\'s job', () => {
  assert.match(migration, /create table if not exists public\.notification_settings/);
  assert.match(migration, /create table if not exists public\.notification_logs/);
  assert.match(migration, /create table if not exists public\.checkin_day_state/);
  assert.match(migration, /unique_send_key\s+text not null unique/, 'กุญแจกันส่งซ้ำไม่ได้ unique จริงที่ฐานข้อมูล');
  assert.match(migration, /enable row level security/);
  // จองก่อนยิง ไม่ใช่ยิงก่อนแล้วค่อยบันทึก
  const service = readFileSync(new URL('../src/services/checkinService.js', import.meta.url), 'utf8');
  assert.match(service, /error\.code === '23505'/, 'ไม่ได้อ่าน unique violation ว่าเป็น "มีคนจองแล้ว"');
});
