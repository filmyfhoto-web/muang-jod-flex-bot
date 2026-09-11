import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockSupabase } from './helpers/mockSupabase.js';
import { nudgeText, callName, MAX_NUDGES } from '../src/utils/nudgeMessages.js';
import { shouldNudge, withinNudgeHours, bangkokHour, findIdleShops, nudgeSettings } from '../src/services/nudgeService.js';
import { dispatchNudges } from '../src/services/nudgeDispatcher.js';
import { resolveMenuCommand } from '../src/utils/menuCommands.js';

const NOW = new Date('2026-09-11T05:00:00.000Z'); // 12:00 ในไทย
const days = (n) => n * 86_400_000;
const ago = (n) => new Date(NOW.getTime() - days(n)).toISOString();

test('ม่วงเรียกชื่อ และไม่ทิ้งช่องว่างไว้เมื่อไม่รู้ชื่อ', () => {
  assert.equal(callName('ฟิล์ม'), 'ฟิล์ม');
  assert.equal(callName('ฟิล์ม โฟโต้'), 'ฟิล์ม', 'ชื่อ LINE ยาวได้ เอาคำแรกพอ');
  assert.equal(callName(''), '');
  assert.equal(callName(null), '');

  const named = nudgeText('ฟิล์ม', 0, () => 0);
  assert.ok(named.includes('ฟิล์ม'), 'ไม่ได้เรียกชื่อ');
  assert.ok(!named.includes('{name}'), 'ช่องชื่อไม่ถูกแทน');

  // ไม่รู้ชื่อก็ต้องอ่านรู้เรื่อง ไม่ใช่ "ขา หายไปเลย"
  for (let tier = 0; tier < MAX_NUDGES; tier += 1) {
    for (const pick of [() => 0, () => 0.4, () => 0.9]) {
      const anon = nudgeText(null, tier, pick);
      assert.ok(!anon.includes('{name}'), anon);
      assert.ok(!/^[ขา~\s]/.test(anon), `ขึ้นต้นด้วยเศษของชื่อที่หายไป: ${anon}`);
      assert.ok(anon.trim().length > 5, anon);
    }
  }
});

test('ทักบ่อยขึ้นไม่ได้ และทักไม่รู้จบไม่ได้', () => {
  const fresh = { enabled: true, last_nudge_at: null, streak: 0 };
  assert.equal(shouldNudge(fresh, { now: NOW }).ok, true);

  // เพิ่งทักไปเมื่อวาน
  assert.equal(shouldNudge({ ...fresh, last_nudge_at: ago(1) }, { now: NOW }).ok, false);
  // ทักไปห้าวันก่อน ทักได้แล้ว
  assert.equal(shouldNudge({ ...fresh, last_nudge_at: ago(5) }, { now: NOW }).ok, true);

  // ร้านสั่งปิด
  assert.equal(shouldNudge({ ...fresh, enabled: false }, { now: NOW }).ok, false);

  // ทักครบโควตาแล้วยังเงียบ = ไม่ได้ลืม แต่ไม่อยากคุย
  assert.equal(shouldNudge({ ...fresh, streak: MAX_NUDGES }, { now: NOW }).ok, false);
  assert.equal(shouldNudge({ ...fresh, streak: MAX_NUDGES - 1 }, { now: NOW }).ok, true);
});

test('ไม่ทักตอนตีสอง', () => {
  assert.equal(bangkokHour(new Date('2026-09-11T05:00:00Z')), 12, 'UTC+7');
  assert.equal(withinNudgeHours(new Date('2026-09-10T19:00:00Z')), false, 'ตีสองไทย');
  assert.equal(withinNudgeHours(new Date('2026-09-11T01:00:00Z')), false, 'แปดโมงเช้า ยังเช้าไป');
  assert.equal(withinNudgeHours(new Date('2026-09-11T05:00:00Z')), true, 'เที่ยง');
  assert.equal(withinNudgeHours(new Date('2026-09-11T12:30:00Z')), false, 'หนึ่งทุ่มครึ่ง เลิกแล้ว');
});

function world({ jobs = [], nudge_state = [], profiles } = {}) {
  return createMockSupabase({
    profiles: profiles || [
      { id: 'u1', line_user_id: 'L1', display_name: 'ฟิล์ม', created_at: ago(60) },
    ],
    jobs,
    nudge_state,
  });
}

function spyPush() {
  const sent = [];
  return { sent, push: async (to, msg) => sent.push({ to, msg }) };
}

test('ทักร้านที่เงียบ ไม่ทักร้านที่เพิ่งจดไป', async () => {
  const quiet = spyPush();
  const r1 = await dispatchNudges({ client: world({ jobs: [{ id: 'j1', user_id: 'u1', created_at: ago(10) }] }), push: quiet.push, now: NOW });
  assert.equal(r1.sent, 1);
  assert.equal(quiet.sent[0].to, 'L1');
  assert.ok(quiet.sent[0].msg.text.includes('ฟิล์ม'));

  const busy = spyPush();
  const r2 = await dispatchNudges({ client: world({ jobs: [{ id: 'j1', user_id: 'u1', created_at: ago(1) }] }), push: busy.push, now: NOW });
  assert.equal(r2.sent, 0, 'จดเมื่อวานแล้วยังโดนทักว่าหายไปไหน');
  assert.equal(busy.sent.length, 0);
});

test('ข้อความที่ทักไปมีทางปิดติดมาด้วยเสมอ', async () => {
  const spy = spyPush();
  await dispatchNudges({ client: world({ jobs: [{ id: 'j1', user_id: 'u1', created_at: ago(10) }] }), push: spy.push, now: NOW });

  const items = spy.sent[0].msg.quickReply?.items || [];
  const actions = items.map((i) => i.action.data);
  assert.ok(actions.includes('action=nudge_off'), 'ข้อความที่ปิดไม่ได้คือสแปม');
  assert.ok(actions.includes('action=add_job'), 'ทักแล้วต้องจดต่อได้เลย');
});

test('ปิดได้ด้วยคำที่คนพิมพ์จริงตอนรำคาญ', () => {
  for (const said of ['ไม่ต้องทัก', 'หยุดทัก', 'เลิกทัก', 'อย่าทัก', 'ไม่ต้องเตือน']) {
    assert.equal(resolveMenuCommand(said), 'nudge_off', said);
  }
  for (const said of ['ทักได้', 'ทักมาได้', 'เตือนด้วย']) {
    assert.equal(resolveMenuCommand(said), 'nudge_on', said);
  }
});

test('ร้านที่ปิดไว้ และร้านที่เพิ่งสมัคร ไม่โดนทัก', async () => {
  const off = spyPush();
  await dispatchNudges({
    client: world({
      jobs: [{ id: 'j1', user_id: 'u1', created_at: ago(10) }],
      nudge_state: [{ user_id: 'u1', enabled: false, last_nudge_at: null, streak: 0 }],
    }),
    push: off.push,
    now: NOW,
  });
  assert.equal(off.sent.length, 0);

  // สมัครเมื่อเช้า ยังไม่เคยจด แล้วโดนทักว่าหายไปไหน เป็นการทักที่ไม่จริง
  const newbie = await findIdleShops(new Date(NOW.getTime() - days(3)), world({
    profiles: [{ id: 'u2', line_user_id: 'L2', display_name: 'ใหม่', created_at: ago(0.2) }],
  }));
  assert.deepEqual(newbie, []);
});

test('กลับมาจดแล้วเงียบใหม่ = การหายไปรอบใหม่ ไม่ใช่รอบเดิมที่ทักครบแล้ว', async () => {
  const spy = spyPush();
  await dispatchNudges({
    client: world({
      // ทักครบโควตาไปแล้ว แต่หลังจากนั้นเขากลับมาจด แล้วเพิ่งเงียบอีกรอบ
      jobs: [{ id: 'j1', user_id: 'u1', created_at: ago(8) }],
      nudge_state: [{ user_id: 'u1', enabled: true, last_nudge_at: ago(20), streak: MAX_NUDGES }],
    }),
    push: spy.push,
    now: NOW,
  });
  assert.equal(spy.sent.length, 1, 'ร้านที่เคยเงียบยาวครั้งหนึ่ง จะไม่ได้ยินม่วงอีกเลยตลอดกาล');
});

test('ปิดทั้งระบบได้ และไม่ทักนอกเวลา', async () => {
  const client = world({ jobs: [{ id: 'j1', user_id: 'u1', created_at: ago(10) }] });

  const offAll = spyPush();
  const r = await dispatchNudges({ client, push: offAll.push, now: NOW, env: { NUDGE_ENABLED: '0' } });
  assert.equal(r.skipped, 'disabled');
  assert.equal(offAll.sent.length, 0);

  const night = spyPush();
  await dispatchNudges({ client, push: night.push, now: new Date('2026-09-10T19:00:00Z') });
  assert.equal(night.sent.length, 0, 'ตีสองไทย');

  assert.equal(nudgeSettings({}).enabled, true, 'ค่าเริ่มต้นคือเปิด');
  assert.equal(nudgeSettings({ NUDGE_IDLE_DAYS: '7' }).idleDays, 7);
});
