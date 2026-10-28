import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aiOn, looksLikeOrder, parseAiReply, readOrder } from '../src/chatai.js';

const SAID = 'ขอสั่งไม้กวาด 10 อัน แล้วก็น้ำยาล้างจาน 2 แกลลอนนะคะ วันที่ 28';

test('only a message that could be an order is ever sent to the AI: a number, a unit or an ordering word, and not a question', () => {
  assert.equal(looksLikeOrder(SAID), true);
  assert.equal(looksLikeOrder('ส่งปากกา 3 โหลด้วยค่ะ'), true);
  assert.equal(looksLikeOrder('เอาสมุด ๕ เล่มค่ะ'), true, 'Thai digits count');
  for (const t of ['สวัสดีค่ะ', 'ขอบคุณมากนะคะ', 'ปากกาด้ามละเท่าไหร่ 10 ด้าม', 'มีสมุด 5 เล่มไหมคะ', 'ราคาไม้กวาด 10 อัน', 'ok', '', null, 'x'.repeat(2000) + ' 5 อัน']) {
    assert.equal(looksLikeOrder(t), false, String(t).slice(0, 40));
  }
});

test('the AI is on only with a key on the server', () => {
  assert.equal(aiOn({}), false);
  assert.equal(aiOn({ GEMINI_API_KEY: 'k' }), true);
  assert.equal(aiOn({ ANTHROPIC_API_KEY: 'k' }), true);
});

test('what the AI returns is checked: a product the customer did not name, or a quantity they did not write, is dropped', () => {
  const r = parseAiReply(
    {
      order: true,
      items: [
        { name: 'ไม้กวาด', qty: 10, unit: 'อัน' },
        { name: 'น้ำยาล้างจาน', qty: 2, unit: 'แกลอน' },
        { name: 'สบู่', qty: 3, unit: 'ก้อน' }, // never mentioned
        { name: 'ไม้กวาด', qty: 7, unit: 'อัน' }, // quantity not in the message
        { name: 'น้ำยาล้างจาน', qty: -1, unit: '' },
        { name: '', qty: 1 },
        { name: 'ไม้กวาด', qty: 'สิบ' },
        null,
      ],
      day: 28,
    },
    SAID,
  );
  assert.deepEqual(r.items.map((i) => [i.name, i.qty, i.unit]), [['ไม้กวาด', 10, 'อัน'], ['น้ำยาล้างจาน', 2, 'แกลลอน']], 'the unit is spelled the shop\'s way');
  assert.equal(r.day, 28);
  assert.equal(r.via, 'ai');
  assert.deepEqual(r.notes, []);
});

test('anything else from the AI is "not an order"', () => {
  for (const bad of [null, undefined, 'text', 42, [], {}, { order: false, items: [] }, { order: true }, { order: true, items: 'x' }, { order: true, items: [] }, { order: 'true', items: [{ name: 'ไม้กวาด', qty: 10 }] }]) {
    assert.equal(parseAiReply(bad, SAID), null, JSON.stringify(bad));
  }
  assert.equal(parseAiReply({ order: true, items: [{ name: 'ไม้กวาด', qty: 10, unit: 'อัน' }], day: 99 }, SAID).day, null, 'a day that is not a day is ignored');
  assert.equal(parseAiReply({ order: true, items: [{ name: 'ไม้กวาด', qty: 10, unit: '12345678901234' }] }, SAID), null, 'a unit that long is not a unit');
  const many = { order: true, items: Array.from({ length: 200 }, () => ({ name: 'ไม้กวาด', qty: 10 })) };
  assert.ok(parseAiReply(many, SAID).items.length <= 60);
});

test('readOrder: no key, not an order-looking message, a refusal or a broken answer all give null and never throw', async () => {
  const ask = async () => ({ order: true, items: [{ name: 'ไม้กวาด', qty: 10, unit: 'อัน' }], day: null });
  const env = { GEMINI_API_KEY: 'k' };
  assert.equal((await readOrder(SAID, { env, ask })).items.length, 1);
  assert.equal(await readOrder(SAID, { env: {}, ask }), null, 'no key');
  assert.equal(await readOrder('สวัสดีค่ะ', { env, ask }), null, 'not an order-looking message: nothing is sent');
  let asked = 0;
  await readOrder('สวัสดีค่ะ', { env, ask: async () => { asked++; return null; } });
  assert.equal(asked, 0);
  assert.equal(await readOrder(SAID, { env, ask: async () => { throw new Error('boom'); } }), null);
  assert.equal(await readOrder(SAID, { env, ask: async () => 'not json' }), null);
});

test('the request to the provider carries only the message text, and the key stays in the header', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, init });
    return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"order":true,"items":[{"name":"ไม้กวาด","qty":10,"unit":"อัน"}],"day":null}' }] }), { status: 200 });
  };
  const r = await readOrder(SAID, { env: { ANTHROPIC_API_KEY: 'sk-test' }, fetchImpl });
  assert.equal(r.items.length, 1);
  assert.equal(seen[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(seen[0].init.headers['x-api-key'], 'sk-test');
  const body = JSON.parse(seen[0].init.body);
  assert.equal(body.messages.length, 1);
  assert.equal(body.messages[0].content, SAID);
  assert.ok(!seen[0].init.body.includes('sk-test'), 'the key is not in the body');
  // a provider error is "not an order"
  assert.equal(await readOrder(SAID, { env: { ANTHROPIC_API_KEY: 'k' }, fetchImpl: async () => new Response('{}', { status: 500 }) }), null);
});
