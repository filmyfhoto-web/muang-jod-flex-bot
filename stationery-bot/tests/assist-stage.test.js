import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAssistStage } from '../src/assist-stage.js';
import { createMemoryStore } from '../src/assist/store.js';

const quietLog = { info() {}, error() {}, warn() {} };
const ID = (c) => 'U' + c.repeat(32);
const ADMINS = [
  { name: 'หญิง', userId: ID('1') },
  { name: 'ฟิล์ม', userId: ID('2') },
  { name: 'เจ้ปิ่น', userId: ID('3') },
];
const LINE_BOT = { admins: [{ name: 'เจ้ปิ่น', note: 'ร้านเครื่องเขียน' }, { name: 'หญิง', note: 'ร้านเครื่องเขียน' }, { name: 'ฟิล์ม', note: 'ถ่ายรูป' }], silence_hours: 24 };

function setup({ mode = 'all', content, broken = false } = {}) {
  const store = createMemoryStore({ config: { faq_bot: { mode, admins: ADMINS, content }, line_bot: LINE_BOT } });
  if (broken) store.getConfig = async () => { throw new Error('db down'); };
  const calls = [];
  const doFetch = async (url, init = {}) => {
    calls.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null });
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const clock = { t: Date.parse('2026-10-20T03:00:00Z') };
  return { store, calls, clock, make: () => createAssistStage({ env: { LINE_CHANNEL_ACCESS_TOKEN: 'tok' }, store, fetch: doFetch, now: () => clock.t, log: quietLog }) };
}
const textEv = (text, userId, n = 1) => ({ type: 'message', mode: 'active', replyToken: 'rt' + n, source: { type: 'user', userId }, message: { id: 'm' + n, type: 'text', text } });
const replies = (calls) => calls.filter((c) => c.url.endsWith('/v2/bot/message/reply'));

test('no token or no database: the stage is simply absent', async () => {
  assert.equal(await createAssistStage({ env: {}, log: quietLog }), null);
  assert.equal(await createAssistStage({ env: { LINE_CHANNEL_ACCESS_TOKEN: 't' }, log: quietLog }), null);
});

test('mode off → nobody; admins → only the listed people; all → everybody', async () => {
  const customer = ID('9');
  const off = await setup({ mode: 'off' }).make();
  assert.equal(await off.takes(textEv('เวลาเปิดร้าน', customer)), false);
  assert.equal(await off.takes(textEv('เวลาเปิดร้าน', ADMINS[0].userId)), false);
  const trial = await setup({ mode: 'admins' }).make();
  assert.equal(await trial.takes(textEv('เวลาเปิดร้าน', ADMINS[0].userId)), true);
  assert.equal(await trial.takes(textEv('เวลาเปิดร้าน', customer)), false);
  const all = await setup({ mode: 'all' }).make();
  assert.equal(await all.takes(textEv('เวลาเปิดร้าน', customer)), true);
  assert.equal(await all.mode(), 'all');
});

test('the admin commands always stay with the Render bot, in every mode (its pause switch is in front of every layer)', async () => {
  const words = ['ติดตั้งเมนู', 'ลบเมนู', 'ปิดบอท 2', 'เปิดบอท', 'แอดมินออนไลน์', 'โควตา', 'ไอดีฉัน'];
  for (const mode of ['admins', 'all']) {
    const s = await setup({ mode }).make();
    for (const w of words) assert.equal(await s.takes(textEv(w, ADMINS[0].userId)), false, `${mode}: ${w}`);
    assert.equal(await s.takes(textEv('เวลาเปิดร้าน', ADMINS[0].userId)), true, `${mode}: an ordinary question is still the engine's`);
  }
});

test('settings that cannot be read: the stage declines (the Render bot answers) and does not throw', async () => {
  const s = await setup({ broken: true }).make();
  assert.equal(await s.takes(textEv('เวลาเปิดร้าน', ID('9'))), false);
  await assert.rejects(() => s.run(textEv('เวลาเปิดร้าน', ID('9'))), /unreadable/);
});

test('a rule saved in the Studio answers; with no saved rules the shipped answers do', async () => {
  const rules = [{ id: 'r1', name: 'เวลา', enabled: true, match: 'contains', keywords: ['เวลาเปิดร้าน'], replies: [{ type: 'text', text: 'ทดสอบกฎจากหน้า Studio' }], quick: true }];
  const a = setup({ mode: 'all', content: { rules } });
  const stage = await a.make();
  await stage.run(textEv('เวลาเปิดร้านกี่โมงคะ', ID('9')));
  assert.equal(replies(a.calls).length, 1);
  assert.equal(replies(a.calls)[0].body.messages[0].text, 'ทดสอบกฎจากหน้า Studio');
  const b = setup({ mode: 'all' });
  await (await b.make()).run(textEv('เวลาเปิดร้าน', ID('9')));
  assert.equal(replies(b.calls)[0].body.messages[0].type, 'flex');
});

test('a customer who picked a person in the app\'s card: that person gets one alert push per window', async () => {
  const a = setup({ mode: 'all' });
  const stage = await a.make();
  await stage.alertPick(ID('9'), 'หญิง');
  await stage.alertPick(ID('9'), 'หญิง');
  const pushes = a.calls.filter((c) => c.url.endsWith('/v2/bot/message/push'));
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].body.to, ADMINS[0].userId);
});
