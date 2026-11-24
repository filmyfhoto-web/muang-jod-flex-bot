import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {
  newInviteCode,
  parseJoinCode,
  OWNER_INVITE_WORDS,
  OWNER_LIST_WORDS,
  OWNER_REMOVE_WORDS,
  MEMBER_POSTBACKS,
  MEMBER_BLOCKED_TEXT,
  memberApiAllowed,
  stripMemberPatch,
} from '../src/utils/teamGate.js';
import { handleJoinAttempt, handleOwnerTeamCommand, memberGate } from '../src/handlers/teamHandler.js';
import { createApiRouter } from '../src/routes/api.js';

/* ทีมของร้าน — "เพิ่มคนใช้ม่วงจดเพิ่มได้ไหม จะได้ช่วยเราจดงาน" (24 พ.ย. 69)
 *
 * หลักที่เทสต์ชุดนี้ตรึง:
 *   1. ทางเข้าทีมมีทางเดียว: รหัสเชิญที่เจ้าของสั่งสร้าง ใช้ครั้งเดียว หมดอายุได้
 *   2. สมาชิกทำงานบน "สมุดของเจ้าของร้าน" ไม่ใช่สมุดตัวเอง
 *   3. สิทธิ์สมาชิกเป็นแบบ "เปิดเท่าที่ให้": จดงาน/คิว/เกม — เรื่องเงินระดับร้าน
 *      (ยอดรวม บัญชี บิล รายงาน สมุดลูกค้า) เป็นของเจ้าของเท่านั้น
 */

process.env.LIFF_ID = '1234567890-abcdefgh';
process.env.PUBLIC_BASE_URL = 'https://shop.example';

const OWNER_LINE = 'U' + 'a'.repeat(32);
const MEMBER_LINE = 'U' + 'b'.repeat(32);
const STRANGER_LINE = 'U' + 'c'.repeat(32);

const msg = (text, userId = MEMBER_LINE) => ({
  type: 'message',
  replyToken: 'rt',
  source: { userId },
  message: { type: 'text', text },
});
const pb = (action, userId = MEMBER_LINE) => ({
  type: 'postback',
  replyToken: 'rt',
  source: { userId },
  postback: { data: `action=${action}` },
});
const spy = () => {
  const calls = [];
  const reply = async (_token, m) => calls.push(Array.isArray(m) ? m.map((x) => x.text).join('\n') : m.text);
  return { calls, reply, last: () => calls.at(-1) || '' };
};

test('ทีม: รหัสเชิญอ่านง่าย พิมพ์หลวมได้ และตัวสับสน (0/O/1/I/L) ไม่มีวันโผล่', () => {
  for (let i = 0; i < 40; i++) {
    const code = newInviteCode();
    assert.match(code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/, code);
  }
  assert.equal(parseJoinCode('ทีม ABC234'), 'ABC234');
  assert.equal(parseJoinCode('ทีม-abc234'), 'ABC234');
  assert.equal(parseJoinCode('ทีมABC234'), 'ABC234');
  assert.equal(parseJoinCode('  ทีม ABC234  '), 'ABC234');
  assert.equal(parseJoinCode('ทีม ABC23'), null, 'สั้นไปไม่ใช่รหัส');
  assert.equal(parseJoinCode('ทีมงานโรงเรียน'), null, 'คำว่าทีมในประโยคปกติไม่ใช่รหัส');
});

test('ทีม: คำสั่งเจ้าของจับถูกคำ และไม่กินคำจดงานปกติ', () => {
  for (const t of ['เพิ่มพนักงาน', 'เพิ่มทีม', 'เพิ่มคนช่วยค่ะ', 'เพิ่มคนใช้หน่อย']) {
    assert.ok(OWNER_INVITE_WORDS.test(t), t);
  }
  assert.ok(!OWNER_INVITE_WORDS.test('เพิ่มพนักงานให้ร้านสมชาย 2 คน'), 'ประโยคจดงานต้องไม่ติด');
  for (const t of ['ทีม', 'รายชื่อทีม', 'ทีมของฉัน']) assert.ok(OWNER_LIST_WORDS.test(t), t);
  const m = OWNER_REMOVE_WORDS.exec('ลบพนักงาน ฟิล์ม');
  assert.equal(m?.[1], 'ฟิล์ม');
});

test('ทีม: สิทธิ์สมาชิกแบบ "เปิดเท่าที่ให้" — ปุ่มจดงาน/เกมผ่าน ปุ่มเงินไม่ผ่าน', () => {
  for (const a of ['add_job', 'quick_job', 'confirm_add_job', 'edit_new_job', 'recent_jobs', 'open_game', 'attach_evidence']) {
    assert.ok(MEMBER_POSTBACKS.has(a), a);
  }
  for (const a of ['today_summary', 'bill_job', 'create_bill', 'bill_all', 'qr_send', 'open_dashboard', 'delete_job', 'cancel_latest']) {
    assert.ok(!MEMBER_POSTBACKS.has(a), `${a} ต้องเป็นของเจ้าของ`);
  }
});

test('ทีม: ข้อความเงินระดับร้านถูกปัด — ข้อความจดงาน (มีราคาได้) ผ่านปกติ', () => {
  for (const t of ['สรุปวันนี้', 'ขอดูบัญชีหน่อย', 'ลงบัญชี 104', 'บิลโรงเรียน', 'ยอดวันนี้เท่าไหร่', 'รายงานเดือนนี้', 'สมุดลูกค้า', 'ค่าใช้จ่ายเดือนนี้', 'เพิ่มพนักงาน']) {
    assert.ok(MEMBER_BLOCKED_TEXT.test(t), t);
  }
  for (const t of [
    'โรงเรียนบ้านหนองแดง ป้ายไวนิล 3×1 ม. 2 ผืน 500 บาท ด่วน รับศุกร์',
    'ถ่ายเอกสาร 100 แผ่น ป้าสมศรี',
    'แก้ 104 ราคา 450',
    'คิว',
    'เกม',
  ]) {
    assert.ok(!MEMBER_BLOCKED_TEXT.test(t), `จดงานปกติต้องผ่าน: ${t}`);
  }
});

test('ทีม: /api ของสมาชิกเปิดเท่าที่หน้าจดงานกับเกมใช้', () => {
  const yes = [
    ['GET', '/game/jobs'], ['POST', '/game/jobs/xyz/work'],
    ['POST', '/jobs'], ['GET', '/jobs/abc'], ['PATCH', '/jobs/abc'],
    ['GET', '/categories'], ['GET', '/customers'], ['POST', '/parse'], ['GET', '/draft'],
    ['GET', '/jobs/abc/images'],
  ];
  for (const [m, p] of yes) assert.ok(memberApiAllowed(m, p), `${m} ${p}`);
  const no = [
    ['GET', '/jobs'], ['GET', '/dashboard'], ['GET', '/ledger'], ['GET', '/book'],
    ['GET', '/expenses'], ['GET', '/report'], ['GET', '/shop'],
    ['POST', '/jobs/abc/state'], ['POST', '/jobs/abc/stage'], ['POST', '/jobs/abc/status'],
    ['POST', '/jobs/abc/payments'], ['POST', '/jobs/abc/cancel'], ['POST', '/jobs/abc/receipt'],
    ['PUT', '/categories'], ['DELETE', '/jobs/abc'],
  ];
  for (const [m, p] of no) assert.ok(!memberApiAllowed(m, p), `${m} ${p} ต้องเป็นของเจ้าของ`);
});

test('ทีม: PATCH ของสมาชิกถูกริบช่องเงิน/สถานะรับของ — ช่องจดงานอยู่ครบ', () => {
  const clean = stripMemberPatch({
    note: 'เพิ่มเบอร์โทร',
    customer_name: 'ป้าสมศรี',
    job_name: 'ป้ายไวนิล',
    paid_amount: 999,
    balance_due: 0,
    payment_status: 'paid',
    picked_up_at: 'x',
    done_at: 'x',
    status: 'cancelled',
    booked_at: 'x',
  });
  assert.deepEqual(clean, { note: 'เพิ่มเบอร์โทร', customer_name: 'ป้าสมศรี', job_name: 'ป้ายไวนิล' });
});

test('ทีม: บทสนทนาเจ้าของ — เชิญ/ดูรายชื่อ/ลบ และเผลอพิมพ์รหัสตัวเองก็ไม่พัง', async () => {
  const owner = { id: 'owner1', line_user_id: OWNER_LINE };
  const made = [];
  const svc = {
    createInvite: async (ownerId) => { made.push(ownerId); return { code: 'QWE234', expiresAt: 'x' }; },
    listMembers: async () => [{ name: 'ฟิล์ม', created_at: '2026-11-24T01:00:00Z' }],
    removeMemberByName: async (_o, name) => (name === 'ฟิล์ม' ? 1 : 0),
    redeemInvite: async () => ({ ok: false, reason: 'owner_self' }),
  };
  const s = spy();

  assert.ok(await handleOwnerTeamCommand(msg('เพิ่มพนักงาน', OWNER_LINE), owner, { reply: s.reply, svc }));
  assert.ok(s.last().includes('ทีม QWE234'), 'บอกรหัสพร้อมวิธีพิมพ์');
  assert.ok(s.last().includes('48 ชั่วโมง'));
  assert.ok(s.last().includes('เรื่องเงิน บัญชี รายงาน ยังเห็นเฉพาะคุณ'), 'บอกขอบเขตสิทธิ์ตรง ๆ');
  assert.deepEqual(made, ['owner1']);

  assert.ok(await handleOwnerTeamCommand(msg('ทีม', OWNER_LINE), owner, { reply: s.reply, svc }));
  assert.ok(s.last().includes('ฟิล์ม'));

  assert.ok(await handleOwnerTeamCommand(msg('ลบพนักงาน ฟิล์ม', OWNER_LINE), owner, { reply: s.reply, svc }));
  assert.ok(s.last().includes('ออกจากทีมแล้ว'));
  assert.ok(await handleOwnerTeamCommand(msg('ลบพนักงาน ใครไม่รู้', OWNER_LINE), owner, { reply: s.reply, svc }));
  assert.ok(s.last().includes('ไม่พบ'));

  // เจ้าของพิมพ์รหัสเอง → redeem ตอบ owner_self → ข้อความอธิบาย ไม่ใช่เข้าทีม
  assert.ok(await handleOwnerTeamCommand(msg('ทีม QWE234', OWNER_LINE), owner, { reply: s.reply, svc }));
  assert.ok(s.last().includes('เจ้าของร้านอยู่แล้ว'));

  // ข้อความจดงานปกติไม่ใช่คำสั่งทีม
  assert.equal(await handleOwnerTeamCommand(msg('ป้ายไวนิล 3×1 2 ผืน', OWNER_LINE), owner, { reply: s.reply, svc }), false);
});

test('ทีม: คนถูกชวนพิมพ์รหัส — เข้าทีมได้ / รหัสเสียบอกตรง ๆ / เข้าซ้ำยินดีต้อนรับกลับ', async () => {
  const s = spy();
  const svc = { redeemInvite: async (code) => (code === 'QWE234' ? { ok: true, member: { name: 'ฟิล์ม' } } : { ok: false, reason: 'bad_code' }) };

  assert.ok(await handleJoinAttempt(msg('ทีม QWE234'), { reply: s.reply, svc }));
  assert.ok(s.last().includes('ยินดีต้อนรับเข้าทีมร้าน'), s.last());
  assert.ok(s.last().includes('คุณฟิล์ม'));
  assert.ok(s.last().includes('liff.line.me'), 'มีลิงก์เกมคิวงานให้เลย');
  assert.ok(s.last().includes('เรื่องเงิน บัญชี และรายงาน เป็นของเจ้าของร้าน'));

  assert.ok(await handleJoinAttempt(msg('ทีม ZZZ999'), { reply: s.reply, svc }));
  assert.ok(s.last().includes('รหัสไม่ถูกต้องหรือหมดอายุ'));

  const svc2 = { redeemInvite: async () => ({ ok: true, already: true, member: { name: 'ฟิล์ม' } }) };
  assert.ok(await handleJoinAttempt(msg('ทีม QWE234'), { reply: s.reply, svc: svc2 }));
  assert.ok(s.last().includes('อยู่ในทีมร้านอยู่แล้ว'));

  // ข้อความอื่นไม่ใช่ความพยายามเข้าทีม
  assert.equal(await handleJoinAttempt(msg('สวัสดีค่ะ'), { reply: s.reply, svc }), false);
});

test('ทีม: ด่านสมาชิกในแชต — จดงานผ่าน เงินถูกปัดสุภาพ รูปแนบหลักฐานผ่าน', async () => {
  const s = spy();
  assert.equal(await memberGate(pb('add_job'), { reply: s.reply }), false, 'ปุ่มจดงานผ่าน');
  assert.equal(await memberGate(pb('open_game'), { reply: s.reply }), false);
  assert.ok(await memberGate(pb('today_summary'), { reply: s.reply }), 'สรุปยอดเป็นของเจ้าของ');
  assert.ok(s.last().includes('เฉพาะเจ้าของร้าน'));
  assert.ok(await memberGate(pb('create_bill'), { reply: s.reply }));

  assert.equal(await memberGate(msg('โรงเรียนบ้านหนองแดง ป้ายไวนิล 2 ผืน'), { reply: s.reply }), false, 'จดงานผ่าน');
  assert.ok(await memberGate(msg('สรุปวันนี้'), { reply: s.reply }));
  assert.ok(await memberGate(msg('ทีม QWE234'), { reply: s.reply }), 'สมาชิกพิมพ์รหัสซ้ำ = บอกว่าอยู่แล้ว');
  assert.ok(s.last().includes('อยู่ในทีมอยู่แล้ว'));

  const img = { type: 'message', replyToken: 'rt', source: { userId: MEMBER_LINE }, message: { type: 'image' } };
  assert.equal(await memberGate(img, { reply: s.reply }), false, 'รูปหลักฐานงานผ่าน');
});

test('ทีม: ผ่าน /api จริง — สมาชิกลงสมุดเจ้าของ เปิดเท่าที่ให้ และเงินถูกริบจาก PATCH', async () => {
  process.env.ALLOWED_LINE_USER_IDS = OWNER_LINE; // ด่านปิด: เฉพาะเจ้าของ + ทีมที่เชิญ
  try {
    const queueCalls = [];
    const saved = [];
    const app = express();
    app.use(express.json());
    app.use(
      '/api',
      createApiRouter({
        verify: async (token) => ({ userId: token }), // Bearer <lineUserId> ตรง ๆ ในเทสต์
        resolveProfile: async (uid) => ({ id: 'owner1', line_user_id: uid }),
        findTeamFor: async (uid) =>
          uid === MEMBER_LINE
            ? { member: { name: 'ฟิล์ม', line_user_id: uid }, owner: { id: 'owner1', line_user_id: OWNER_LINE } }
            : null,
        getQueueJobs: async (ownerId) => { queueCalls.push(ownerId); return []; },
        getJobById: async () => ({ id: 'j1', total: 500, paid_amount: 0, balance_due: 500 }),
        updateJob: async (_u, _id, patch) => { saved.push(patch); return { id: 'j1', ...patch }; },
        ensureTaxonomy: async () => {},
      })
    );
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const call = (method, path, who, body) =>
      fetch(base + path, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${who}` },
        body: body ? JSON.stringify(body) : undefined,
      });

    try {
      // สมาชิก: เกมเปิดได้ และคิวที่อ่านคือ "ของเจ้าของร้าน"
      const g = await call('GET', '/game/jobs', MEMBER_LINE);
      assert.equal(g.status, 200);
      assert.deepEqual(queueCalls, ['owner1'], 'อ่านสมุดเจ้าของ ไม่ใช่สมุดตัวเอง');

      // สมาชิก: หน้าเงิน/สถานะรับของ = ของเจ้าของ (ปัดพร้อมคำอธิบาย)
      for (const [m, p] of [['GET', '/dashboard'], ['GET', '/ledger'], ['POST', '/jobs/j1/state'], ['POST', '/jobs/j1/payments']]) {
        const r = await call(m, p, MEMBER_LINE, m === 'POST' ? {} : undefined);
        assert.equal(r.status, 403, `${m} ${p}`);
        assert.equal((await r.json()).error, 'owner_only');
      }

      // สมาชิกแก้ใบที่จดผิดได้ แต่ช่องเงินที่แอบติดมาถูกริบทิ้ง
      const patch = await call('PATCH', '/jobs/j1', MEMBER_LINE, { note: 'เพิ่มเบอร์โทร', paid_amount: 999 });
      assert.equal(patch.status, 200);
      assert.ok(saved.length, 'บันทึกจริง');
      assert.equal(saved.at(-1).note, 'เพิ่มเบอร์โทร');
      assert.ok(!('paid_amount' in saved.at(-1)), 'เงินต้องไม่ไปกับมือสมาชิก');

      // เจ้าของใช้ได้ทุกอย่างเหมือนเดิม
      assert.equal((await call('GET', '/game/jobs', OWNER_LINE)).status, 200);

      // คนนอกที่ไม่ใช่ทีม: ปัดตั้งแต่ด่านเดิม
      assert.equal((await call('GET', '/game/jobs', STRANGER_LINE)).status, 403);
    } finally {
      server.close();
    }
  } finally {
    delete process.env.ALLOWED_LINE_USER_IDS;
  }
});
