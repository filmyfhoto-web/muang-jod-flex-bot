import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractDate } from '../src/utils/thaiDate.js';
import { transcribe, transcriberName, maxVoiceSeconds } from '../src/services/transcriptionService.js';
import { parseNaturalJob } from '../src/utils/nlParser.js';

// A fixed "now" so a test written in September still means September.
const NOW = new Date('2026-09-09T05:00:00Z'); // 2026-09-09 in Bangkok

test('extractDate: the ways a date gets spoken into a job', () => {
  const cases = [
    ['10 กันยา ไก่ทอดน้ำปลา 278', '2026-09-10', 'ไก่ทอดน้ำปลา 278'],
    ['10 ก.ย. 68 ข้าวมันไก่ 151', '2025-09-10', 'ข้าวมันไก่ 151'],
    ['10 กย ข้าวมันไก่ 151', '2026-09-10', 'ข้าวมันไก่ 151'], // a transcriber drops the dots
    ['10 กันยายน ป้าย 500', '2026-09-10', 'ป้าย 500'],
    ['วันที่ 10/9 ป้าย 500', '2026-09-10', 'ป้าย 500'],
    ['10/9/2568 ป้าย 500', '2025-09-10', 'ป้าย 500'],
    ['เมื่อวาน ป้ายไวนิล 300', '2026-09-08', 'ป้ายไวนิล 300'],
    ['วานซืน ป้าย 200', '2026-09-07', 'ป้าย 200'],
    ['3 วันก่อน ป้าย 100', '2026-09-06', 'ป้าย 100'],
    ['วันนี้ ป้าย 100', '2026-09-09', 'ป้าย 100'],
  ];
  for (const [input, date, rest] of cases) {
    assert.deepEqual(extractDate(input, NOW), { date, rest }, input);
  }
});

test('extractDate: a date with no year is the one that just happened', () => {
  // December, said in September, is last December — not three months away.
  assert.equal(extractDate('15 ธันวา ป้าย 90', NOW).date, '2025-12-15');
  // A few days ahead is a slip of the tongue, not a whole year back.
  assert.equal(extractDate('12 กันยา ป้าย 90', NOW).date, '2026-09-12');
  // A day that does not exist is not a date.
  assert.equal(extractDate('31 กุมภา ป้าย 100', NOW).date, null);
});

test('extractDate: leaves a message that is not about a date alone', () => {
  // The whole point of lifting the date off is that the rest still parses —
  // "10 กันยา" left in place becomes part of the item name.
  const dated = extractDate('10 กันยา ไก่ทอดน้ำปลา 278', NOW);
  assert.equal(parseNaturalJob(dated.rest).items[0].item_name, 'ไก่ทอดน้ำปลา');
  assert.equal(parseNaturalJob('10 กันยา ไก่ทอดน้ำปลา 278').items[0].item_name, 'กันยา ไก่ทอดน้ำปลา');

  for (const plain of [
    'ป้ายไวนิล 60x100 150 บาท',
    'ไวนิล 160x300 ตรมละ 165',
    'ท่อ 3/4 นิ้ว 200', // a size mid-sentence is not the 3rd of April
    'ค้างรับ',
  ]) {
    assert.deepEqual(extractDate(plain, NOW), { date: null, rest: plain }, plain);
  }
});

test('transcribe: whatever comes back is trimmed, and nothing ever throws', async () => {
  const buf = Buffer.from('x');

  assert.equal(
    await transcribe(buf, { transcribeAudio: async () => '  10 กันยา ไก่ทอดน้ำปลา 278 ' }),
    '10 กันยา ไก่ทอดน้ำปลา 278'
  );

  // Silence, no provider, and a dead API all mean the same thing to the
  // caller: say so, do not crash the webhook.
  assert.equal(await transcribe(buf, { transcribeAudio: async () => '   ' }), null);
  assert.equal(await transcribe(buf, { transcribeAudio: async () => null }), null);
  assert.equal(
    await transcribe(buf, {
      transcribeAudio: async () => {
        throw new Error('402 payment required');
      },
    }),
    null
  );
});

test('the voice provider is whichever key is set, and off with neither', () => {
  const before = [process.env.OPENAI_API_KEY, process.env.GEMINI_API_KEY];
  try {
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    assert.equal(transcriberName(), null, 'no key must not pretend to work');

    process.env.GEMINI_API_KEY = 'g';
    assert.equal(transcriberName(), 'gemini');

    process.env.OPENAI_API_KEY = 'o';
    assert.equal(transcriberName(), 'openai', 'openai wins when both are set');

    assert.equal(maxVoiceSeconds(), 120, 'a default cap, so a long recording cannot run up a bill');
  } finally {
    for (const [i, key] of ['OPENAI_API_KEY', 'GEMINI_API_KEY'].entries()) {
      if (before[i] == null) delete process.env[key];
      else process.env[key] = before[i];
    }
  }
});
