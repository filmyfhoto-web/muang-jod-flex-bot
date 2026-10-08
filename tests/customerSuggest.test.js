import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import express from 'express';
import { matchCustomer } from '../src/utils/customerMatch.js';
import { getCustomerDirectory } from '../src/services/jobService.js';
import { createApiRouter } from '../src/routes/api.js';

/* ร้านขอ "หากฉันพิมพ์ลูกค้าคนไหนที่เคยจดไว้ แสดงให้อัตโนมัติได้ไหม จะได้ไม่ต้องพิมพ์"
 *
 * สองทาง: ในแชต (ตอบคำถาม "ของใคร" แล้วม่วงจับคู่กับชื่อที่เคยจด) และในฟอร์มจดงาน
 * (พิมพ์บางส่วน ชื่อเต็มเด้งเป็นชิปให้กด) — ทั้งคู่ใช้สะกดเดิมที่เคยจด สมุดลูกค้าจึงรวมเจ้าถูก
 */

process.env.LIFF_ID = '1234567890-abcdefgh';

const KNOWN = ['รร.สบกอน', 'น้าปิ่ม', 'รพสต.บ้านชี', 'โรงเรียนเจดีย์', 'ครูแนน'];

// --- จับคู่ชื่อ -------------------------------------------------------------------

test('matchCustomer: สะกดต่างแต่เจ้าเดียวกัน = exact ใช้ชื่อที่เคยจด', () => {
  assert.deepEqual(matchCustomer('รร สบกอน', KNOWN), { kind: 'exact', name: 'รร.สบกอน' });
  assert.deepEqual(matchCustomer('รรสบกอน', KNOWN), { kind: 'exact', name: 'รร.สบกอน' });
  assert.deepEqual(matchCustomer('รร.สบกอน', KNOWN), { kind: 'exact', name: 'รร.สบกอน' });
  assert.deepEqual(matchCustomer('  น้าปิ่ม  ', KNOWN), { kind: 'exact', name: 'น้าปิ่ม' });
});

test('matchCustomer: พิมพ์บางส่วน = partial พร้อมชื่อเต็ม เรียงตามที่ให้มา (ล่าสุดก่อน)', () => {
  assert.deepEqual(matchCustomer('สบกอน', KNOWN), { kind: 'partial', names: ['รร.สบกอน'] });
  assert.deepEqual(matchCustomer('บ้านชี', KNOWN), { kind: 'partial', names: ['รพสต.บ้านชี'] });
  // หลายเจ้ามีคำเดียวกัน — ได้ทุกเจ้า ไม่เกินสาม
  const many = ['รร.บ้านดอน', 'รร.บ้านชี', 'รร.บ้านไร่', 'รร.บ้านนา'];
  const hit = matchCustomer('บ้าน', many);
  assert.equal(hit.kind, 'partial');
  assert.deepEqual(hit.names, ['รร.บ้านดอน', 'รร.บ้านชี', 'รร.บ้านไร่']);
});

test('matchCustomer: สั้นเกิน ชื่อใหม่ หรือรายชื่อว่าง = null (ไม่เดามั่ว)', () => {
  assert.equal(matchCustomer('รร', KNOWN), null, 'สองตัวอักษรไปโผล่ครึ่งสมุด ไม่เดา');
  assert.equal(matchCustomer('ผู้ใหญ่สมศรี', KNOWN), null, 'ลูกค้าใหม่จริง ๆ');
  assert.equal(matchCustomer('', KNOWN), null);
  assert.equal(matchCustomer(null, KNOWN), null);
  assert.equal(matchCustomer('สบกอน', []), null);
});

test('matchCustomer: ชื่อซ้ำหลายสะกดในรายการ นับเป็นเจ้าเดียว', () => {
  const dup = ['รร.สบกอน', 'รร สบกอน', 'รรสบกอน'];
  assert.deepEqual(matchCustomer('สบกอน', dup), { kind: 'partial', names: ['รร.สบกอน'] });
  assert.deepEqual(matchCustomer('รร สบกอน', dup), { kind: 'exact', name: 'รร.สบกอน' });
});

// --- สมุดรายชื่อจากงานเก่า ----------------------------------------------------------

function jobsClient(rows, { error = null } = {}) {
  const calls = [];
  const chain = {
    select: () => chain,
    eq: (k, v) => (calls.push([k, v]), chain),
    in: () => chain,
    order: () => chain,
    limit: async () => (error ? { data: null, error } : { data: rows, error: null }),
  };
  return { calls, from: () => chain };
}

test('getCustomerDirectory: รวมสะกดเป็นเจ้าเดียว ใช้สะกดที่จดบ่อย เรียงเจ้าล่าสุดก่อน', async () => {
  const rows = [
    { customer_name: 'น้าปิ่ม', created_at: '2026-10-08T03:00:00Z' },
    { customer_name: 'รร สบกอน', created_at: '2026-10-07T03:00:00Z' },
    { customer_name: 'รร.สบกอน', created_at: '2026-10-06T03:00:00Z' },
    { customer_name: 'รร.สบกอน', created_at: '2026-10-05T03:00:00Z' },
    { customer_name: '', created_at: '2026-10-04T03:00:00Z' },
    { customer_name: 'ครูแนน', created_at: '2026-10-01T03:00:00Z' },
  ];
  const client = jobsClient(rows);
  const out = await getCustomerDirectory('u1', 30, client);
  assert.deepEqual(out.map((c) => [c.name, c.jobCount]), [
    ['น้าปิ่ม', 1],
    ['รร.สบกอน', 3], // สะกดมีจุดชนะ (2 ต่อ 1) แม้ใบล่าสุดจะไม่มีจุด
    ['ครูแนน', 1],
  ]);
  assert.equal(out[1].lastAt, '2026-10-07T03:00:00Z', 'เวลาเป็นของใบล่าสุดของเจ้านั้น');
  assert.ok(client.calls.some(([k, v]) => k === 'user_id' && v === 'u1'), 'เฉพาะงานของร้านนี้');
});

test('getCustomerDirectory: จำกัดจำนวน และอ่านพังได้รายชื่อว่าง ไม่ throw', async () => {
  const many = Array.from({ length: 50 }, (_, i) => ({ customer_name: `ลูกค้า ${i}`, created_at: '2026-10-01T00:00:00Z' }));
  assert.equal((await getCustomerDirectory('u1', 5, jobsClient(many))).length, 5);
  assert.deepEqual(await getCustomerDirectory('u1', 30, jobsClient([], { error: { message: 'down' } })), []);
});

// --- API ให้ฟอร์มดึง ---------------------------------------------------------------

test('GET /api/customers: ต้องล็อกอิน และได้รายชื่อของร้านตัวเอง', async () => {
  const app = express();
  app.use(
    '/api',
    createApiRouter({
      verify: async (t) => (t === 'good' ? { userId: 'U-line' } : null),
      resolveProfile: async () => ({ id: 'cust-user', line_user_id: 'U-line' }),
      ensureTaxonomy: async () => {},
      getCustomerDirectory: async (userId) => {
        assert.equal(userId, 'cust-user');
        return [{ name: 'รร.สบกอน', jobCount: 3, lastAt: '2026-10-07T03:00:00Z' }];
      },
    })
  );
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const ok = await fetch(`${base}/api/customers`, { headers: { Authorization: 'Bearer good' } });
    assert.equal(ok.status, 200);
    assert.deepEqual((await ok.json()).customers.map((c) => c.name), ['รร.สบกอน']);

    assert.equal((await fetch(`${base}/api/customers`)).status, 401);
    assert.equal((await fetch(`${base}/api/customers`, { headers: { Authorization: 'Bearer bad' } })).status, 401);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

// --- ต่อสายในแชต -------------------------------------------------------------------

const handler = readFileSync(new URL('../src/handlers/messageHandler.js', import.meta.url), 'utf8');
const postback = readFileSync(new URL('../src/handlers/postbackHandler.js', import.meta.url), 'utf8');
const drafter = readFileSync(new URL('../src/actions/draftCustomer.js', import.meta.url), 'utf8');

test('แชต: คำตอบ "ของใคร" ถูกจับคู่กับชื่อที่เคยจด — สะกดต่างใช้ของเดิม พิมพ์บางส่วนมีปุ่มชื่อเต็ม', () => {
  const block = handler.slice(
    handler.indexOf('if (hasDraft && !state.context.draft.customerName) {'),
    handler.indexOf('return reply(replyToken, { type: \'text\', text: hasDraft ? DRAFT_WAITING_REPLY')
  );
  assert.match(block, /matchCustomer\(typed, known\)/);
  assert.match(block, /getRecentCustomerNames\(profile\.id, 30\)/, 'เทียบกับรายชื่อมากพอ ไม่ใช่แค่ 8 ชื่อบนปุ่ม');
  assert.match(block, /\.catch\(\(\) => \[\]\)/, 'อ่านรายชื่อพังต้องไม่พาการจดงานล่ม');
  assert.match(block, /hit\?\.kind === 'exact' \? hit\.name : typed/, 'exact = ใช้สะกดที่เคยจด');
  assert.match(block, /ชื่อที่เคยจดไว้/, 'บอกว่าชื่อถูกเปลี่ยนเป็นของเดิม ไม่เงียบ');
  assert.match(block, /action=draft_customer&name=\$\{encodeURIComponent\(n\)\}/, 'ปุ่มชื่อเต็มเป็น postback');
  assert.match(block, /slice\(0, 3\)/);
  assert.match(block, /label: `ใช้ "\$\{n\}"`\.slice\(0, 20\)/, 'ป้ายปุ่ม LINE ยาวได้ 20 ตัว');
});

test('แชต: action=draft_customer เปลี่ยนชื่อบนร่าง — มีร่างเท่านั้น และชื่อผ่านตัวกรองเดียวกับพิมพ์เอง', () => {
  assert.match(postback, /case 'draft_customer':\s*\n\s*return setDraftCustomer\(ctx\)/);
  assert.match(drafter, /parseCustomerName\(params\?\.name\)/, 'ชื่อจากปุ่มผ่านตัวกรองเดียวกับชื่อที่พิมพ์');
  assert.match(drafter, /STATES\.CONFIRMING_JOB/, 'เปลี่ยนได้เฉพาะตอนมีร่างอยู่');
  assert.match(drafter, /ไม่มีร่างงานค้างอยู่/, 'กดปุ่มเก่าหลังร่างหายไป ต้องบอกตรง ๆ');
  assert.match(drafter, /withDraftGuide/, 'การ์ดใหม่ยังมีปุ่มแนะนำขั้นถัดไป');
});

// --- ฟอร์มจดงาน -------------------------------------------------------------------

const jot = readFileSync(new URL('../public/liff/jot/index.html', import.meta.url), 'utf8');
const jotJs = readFileSync(new URL('../public/liff/jot/script.js', import.meta.url), 'utf8');

test('ฟอร์ม: มีชิปชื่อลูกค้าเดิมใต้ช่องลูกค้า และ datalist ให้คีย์บอร์ดเติมเอง', () => {
  assert.match(jot, /id="cust-suggest"/);
  assert.match(jot, /list="customer-list"/);
  assert.match(jot, /<datalist id="customer-list">/);
});

test('ฟอร์ม: ดึง /api/customers หลังล็อกอิน กรองแบบเดียวกับสมุดลูกค้า และกดชิปแล้วได้สะกดเดิม', () => {
  assert.match(jotJs, /fetch\('\/api\/customers'/);
  assert.match(jotJs, /loadCustomers\(\)/);
  assert.match(jotJs, /if \(!token\) return/, 'โหมดทดลองนอก LINE ไม่ยิง API');
  // ตัดจุด เว้นวรรค ขีด ตัวพิมพ์ — กติกาเดียวกับ accountKey ของสมุดลูกค้า
  assert.ok(jotJs.includes("replace(/[\\s.·,\\-\\u2013\\u2014]/g, '').toLowerCase()"), 'custKey ต้องกรองแบบ accountKey');
  assert.match(jotJs, /state\.customer = c\.name/, 'กดชิปแล้วใช้สะกดที่เคยจดเป๊ะ');
  assert.match(jotJs, /k === typed.*ไม่ต้องเสนอซ้ำ|if \(k === typed\) return false/s, 'พิมพ์ครบแล้วชิปไม่ค้าง');
  assert.match(jotJs, /\.slice\(0, typed \? 4 : 6\)/, 'ชิปมีเพดาน ไม่ท่วมฟอร์ม');
});
