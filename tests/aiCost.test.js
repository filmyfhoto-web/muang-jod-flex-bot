import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costUsd, formatBaht, usdPerMillion } from '../src/utils/aiCost.js';
import { summarizeUsage, recordAiUsage } from '../src/services/aiUsageService.js';
import { resolveMenuCommand } from '../src/utils/menuCommands.js';

test('ราคาโมเดล: sonnet 5.5 $2/$10, haiku $1/$5, รุ่นไม่รู้จักคิดแพงไว้ก่อน', () => {
  assert.deepEqual(usdPerMillion('claude-sonnet-5-5'), { input: 2, output: 10 });
  assert.deepEqual(usdPerMillion('claude-haiku-4-5'), { input: 1, output: 5 });
  assert.deepEqual(usdPerMillion('claude-opus-5-5'), { input: 4, output: 20 });
  assert.deepEqual(usdPerMillion('whatever'), { input: 3, output: 15 });
});

test('คิดเงินรูปหนึ่งใบ: 4500 เข้า + 400 ออก ≈ $0.013 ≈ 0.45 บาท', () => {
  const usd = costUsd('claude-sonnet-5-5', 4500, 400);
  assert.equal(usd, 0.013);
  assert.equal(formatBaht(usd, {}), '฿0.45');
  assert.equal(formatBaht(3.9, { USD_THB: '36' }), '฿140');
});

test('สรุปยอดตามวันเวลาไทย: ข้ามเที่ยงคืนไทยไม่ปนวัน', () => {
  const now = new Date('2026-10-05T10:00:00Z'); // 17:00 วันที่ 5 ตามเวลาไทย
  const rows = [
    { created_at: '2026-10-05T01:00:00Z', cost_usd: 0.01 }, // 08:00 ไทย วันนี้
    { created_at: '2026-10-04T17:30:00Z', cost_usd: 0.02 }, // 00:30 ไทย วันนี้ (ยังเป็น 4 ต.ค. ตาม UTC)
    { created_at: '2026-10-04T10:00:00Z', cost_usd: 0.03 }, // เมื่อวาน
    { created_at: '2026-09-20T10:00:00Z', cost_usd: 0.5 },  // เดือนก่อน
  ];
  const s = summarizeUsage(rows, now);
  assert.equal(s.today.count, 2);
  assert.ok(Math.abs(s.today.usd - 0.03) < 1e-9);
  assert.equal(s.month.count, 3);
  assert.deepEqual(s.days.map((d) => d.day), ['2026-10-05', '2026-10-04']);
});

test('เก็บยอดไม่สำเร็จ (ยังไม่มีตาราง) ไม่ throw และไม่ล้มงานหลัก', async () => {
  const broken = { from: () => ({ insert: async () => ({ error: { message: 'relation "ai_usage" does not exist' } }) }) };
  assert.equal(await recordAiUsage('u1', { model: 'claude-sonnet-5-5', usage: { input_tokens: 10, output_tokens: 5 } }, broken), false);
  const throwing = { from: () => { throw new Error('boom'); } };
  assert.equal(await recordAiUsage('u1', { model: 'claude-sonnet-5-5', usage: { input_tokens: 10, output_tokens: 5 } }, throwing), false);
  assert.equal(await recordAiUsage('u1', { model: 'x' }, broken), false);
});

test('คำสั่งพิมพ์: ค่า AI และลิงก์', () => {
  for (const t of ['ค่า AI', 'ค่าเอไอ', 'ใช้เงินเท่าไหร่']) assert.equal(resolveMenuCommand(t), 'ai_cost', t);
  for (const t of ['ลิงก์', 'เปิดในคอม', 'เว็บ']) assert.equal(resolveMenuCommand(t), 'web_links', t);
});

test('readImage ส่งโทเคนจริงให้ onUsage ผ่านตัวสกัด', async () => {
  const { readImage } = await import('../src/services/visionService.js');
  const seen = [];
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1]);
  await readImage(jpeg, 'image/jpeg', {
    prepareForVision: async (buffer, mimeType) => ({ buffer, mimeType }),
    onUsage: (u) => seen.push(u),
    visionExtract: async (_b, _m, hooks) => {
      hooks.onUsage({ model: 'claude-sonnet-5-5', usage: { input_tokens: 4000, output_tokens: 300 } });
      return { kind: 'other', items: [] };
    },
  });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].usage.input_tokens, 4000);
});
