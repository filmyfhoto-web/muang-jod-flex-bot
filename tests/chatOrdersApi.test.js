import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createApiRouter, orderFieldsOf } from '../src/routes/api.js';

// LIFF must be configured or the router refuses everything before our guards run.
process.env.LIFF_ID = '1234567890-abcdefgh';

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const TOKEN = 'token-abc';

const COLUMN_MISSING = (col) => Object.assign(new Error(`Could not find the '${col}' column of 'jobs' in the schema cache`), { code: 'PGRST204' });

async function serve(deps = {}) {
  const calls = { chatWrites: [], chatImages: [], reads: [], created: [], saved: [], cancelled: [], parsed: [] };
  const app = express();
  app.use(
    '/api',
    createApiRouter({
      verify: async () => ({ userId: 'U-line' }),
      resolveProfile: async () => ({ id: 'user-1', line_user_id: 'U-line' }),
      ensureTaxonomy: async () => {},
      push: async () => {},
      createJob: async (userId, draft) => {
        calls.created.push({ userId, draft });
        return { id: 'job-1', job_number: 'MJ-0001', total: draft.total, job_name: draft.jobName };
      },
      getJobById: async (userId, id) => ({ id, job_number: 'MJ-0001', total: 1590, paid_amount: 0, items: [], customer_name: 'ครูแนน' }),
      updateJob: async (userId, id, patch) => {
        calls.saved.push({ id, patch });
        return {};
      },
      cancelJob: async (userId, id) => {
        calls.cancelled.push(id);
      },
      listChatCustomers: async () => ({ customers: [{ key: 'ครูแนน', name: 'ครูแนน', unread: 2 }], channels: [], chatReady: true }),
      listChatMessages: async (userId, key) => [{ id: 'm1', direction: 'in', body: 'ขอใบเสนอราคา', key }],
      listCustomerJobs: async () => [{ id: 'job-1', status: 'active' }],
      addChatMessage: async (userId, fields) => {
        calls.chatWrites.push({ userId, fields });
        return { id: 'msg-1', direction: fields.direction, body: fields.body, file_url: fields.fileUrl };
      },
      saveChatImage: async (userId, buffer, fileType) => {
        calls.chatImages.push({ bytes: buffer.length, fileType });
        return { fileUrl: 'https://signed.example/img.png', fileType };
      },
      markChatRead: async (userId, key) => {
        calls.reads.push(key);
        return { ok: true };
      },
      findJobByClientRef: async () => null,
      parse: null,
      ...deps,
    })
  );
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  return { calls, call, close: () => new Promise((r) => server.close(r)) };
}

const ITEM = { item_name: 'กระดาษ A4', quantity: 10, unit: 'รีม', unit_price: 135 };

// ---------- ข้อความในแชต ----------

test('POST /chat/messages: ไม่มีชื่อลูกค้า → 400 และไม่บันทึกอะไร', async () => {
  const t = await serve();
  try {
    const r = await t.call('POST', '/chat/messages', { direction: 'in', body: 'สวัสดี' });
    assert.equal(r.status, 400);
    assert.equal(t.calls.chatWrites.length, 0);
  } finally {
    await t.close();
  }
});

test('POST /chat/messages: ไม่มีทั้งข้อความและรูป → 400', async () => {
  const t = await serve();
  try {
    const r = await t.call('POST', '/chat/messages', { customerName: 'ครูแนน', direction: 'in', body: '   ' });
    assert.equal(r.status, 400);
    assert.equal(r.body.message, 'ต้องมีข้อความหรือรูปค่ะ');
  } finally {
    await t.close();
  }
});

test('POST /chat/messages: ข้อความร้านตอบถูกบันทึกเป็นขาออก ไม่ได้ถูกส่งไปไหน', async () => {
  const t = await serve();
  try {
    const r = await t.call('POST', '/chat/messages', { customerName: 'ครูแนน', direction: 'out', body: 'รับทราบค่ะ' });
    assert.equal(r.status, 201);
    assert.equal(t.calls.chatWrites[0].fields.direction, 'out');
    assert.equal(t.calls.chatWrites[0].fields.fileUrl, null);
    assert.equal(t.calls.chatImages.length, 0);
  } finally {
    await t.close();
  }
});

test('POST /chat/messages: แนบรูปแล้วเก็บลิงก์รูปลงข้อความ', async () => {
  const t = await serve();
  try {
    const r = await t.call('POST', '/chat/messages', { customerName: 'ครูแนน', direction: 'in', body: '', image: PNG });
    assert.equal(r.status, 201);
    assert.equal(t.calls.chatImages.length, 1);
    assert.equal(t.calls.chatWrites[0].fields.fileUrl, 'https://signed.example/img.png');
    assert.equal(t.calls.chatWrites[0].fields.fileType, 'image/png');
  } finally {
    await t.close();
  }
});

test('POST /chat/messages: ไฟล์ที่ไม่ใช่ JPG/PNG ถูกปฏิเสธก่อนอัปโหลด', async () => {
  const t = await serve();
  try {
    const r = await t.call('POST', '/chat/messages', { customerName: 'ครูแนน', direction: 'in', image: GIF });
    assert.equal(r.status, 400);
    assert.equal(t.calls.chatImages.length, 0);
    assert.equal(t.calls.chatWrites.length, 0);
  } finally {
    await t.close();
  }
});

test('POST /chat/messages: อัปโหลดรูปไม่สำเร็จ → 502 และไม่บันทึกข้อความที่ค้างครึ่งทาง', async () => {
  const t = await serve({
    saveChatImage: async () => {
      throw new Error('storage down');
    },
  });
  try {
    const r = await t.call('POST', '/chat/messages', { customerName: 'ครูแนน', direction: 'in', body: 'ดูรูปนี้', image: PNG });
    assert.equal(r.status, 502);
    assert.match(r.body.message, /ยังไม่ได้บันทึกข้อความ/);
    assert.equal(t.calls.chatWrites.length, 0);
  } finally {
    await t.close();
  }
});

test('GET /chat/messages: ต้องระบุลูกค้า และคืนข้อความของคนนั้น', async () => {
  const t = await serve();
  try {
    assert.equal((await t.call('GET', '/chat/messages')).status, 400);
    const ok = await t.call('GET', '/chat/messages?key=' + encodeURIComponent('ครูแนน'));
    assert.equal(ok.status, 200);
    assert.equal(ok.body.messages[0].body, 'ขอใบเสนอราคา');
  } finally {
    await t.close();
  }
});

test('GET /chat/customers: คืนรายชื่อพร้อมสถานะช่องทาง', async () => {
  const t = await serve();
  try {
    const r = await t.call('GET', '/chat/customers');
    assert.equal(r.status, 200);
    assert.equal(r.body.customers[0].unread, 2);
    assert.equal(r.body.chatReady, true);
  } finally {
    await t.close();
  }
});

test('POST /chat/read: เคลียร์ตามลูกค้าที่ระบุเท่านั้น', async () => {
  const t = await serve();
  try {
    const r = await t.call('POST', '/chat/read', { customerKey: 'ครูแนน' });
    assert.equal(r.status, 200);
    assert.deepEqual(t.calls.reads, ['ครูแนน']);
    assert.equal((await t.call('POST', '/chat/read', {})).status, 400);
  } finally {
    await t.close();
  }
});

// ---------- การบันทึกออเดอร์ ----------

test('orderFieldsOf: เฉพาะช่องที่ส่งมาจริง ค่าว่างไม่เขียนทับ', () => {
  assert.deepEqual(orderFieldsOf({ customerPhone: null, fulfillment: 'pickup', handlerName: '', clientRef: 'ref-12345678' }), {
    fulfillment: 'pickup',
    client_ref: 'ref-12345678',
  });
  assert.deepEqual(orderFieldsOf({}), {});
});

test('POST /jobs: รหัสเดิมที่มีงานอยู่แล้ว → คืนงานเดิม ไม่สร้างใบซ้ำ', async () => {
  const t = await serve({ findJobByClientRef: async () => ({ id: 'job-old' }), getJobById: async (u, id) => ({ id, job_number: 'MJ-OLD', items: [] }) });
  try {
    const r = await t.call('POST', '/jobs', { customerName: 'ครูแนน', items: [ITEM], clientRef: 'ref-12345678' });
    assert.equal(r.status, 200);
    assert.equal(r.body.duplicate, true);
    assert.equal(r.body.job.id, 'job-old');
    assert.equal(t.calls.created.length, 0);
  } finally {
    await t.close();
  }
});

test('POST /jobs: บันทึกแล้วลงเบอร์ วิธีรับ และผู้รับผิดชอบด้วย', async () => {
  const t = await serve();
  try {
    const r = await t.call('POST', '/jobs', {
      customerName: 'ครูแนน',
      items: [ITEM],
      customerTotal: 1600,
      customerPhone: '0812345678',
      fulfillment: 'delivery',
      handlerName: 'น้ำ',
      clientRef: 'ref-12345678',
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.orderFieldsSaved, true);
    const stamp = t.calls.saved.find((s) => s.id === 'job-1');
    assert.equal(stamp.patch.customer_phone, '0812345678');
    assert.equal(stamp.patch.fulfillment, 'delivery');
    assert.equal(stamp.patch.handler_name, 'น้ำ');
    assert.equal(stamp.patch.client_ref, 'ref-12345678');
    // ยอดยังคิดฝั่งเซิร์ฟเวอร์เหมือนเดิม: 1,350 ที่ร้านปัดขึ้นเป็น 1,600
    assert.equal(t.calls.created[0].draft.total, 1600);
    assert.equal(t.calls.created[0].draft.subtotal, 1350);
  } finally {
    await t.close();
  }
});

test('POST /jobs: ฐานข้อมูลยังไม่มี migration 022 → ยังจดงานได้ แต่บอกว่าเบอร์ยังไม่ถูกเก็บ', async () => {
  const t = await serve({
    updateJob: async () => {
      throw COLUMN_MISSING('customer_phone');
    },
  });
  try {
    const r = await t.call('POST', '/jobs', { customerName: 'ครูแนน', items: [ITEM], customerPhone: '0812345678' });
    assert.equal(r.status, 201);
    assert.equal(r.body.orderFieldsSaved, false);
    assert.equal(t.calls.created.length, 1);
  } finally {
    await t.close();
  }
});

test('POST /jobs: สองคำขอแข่งกันด้วยรหัสเดียว → ยกเลิกใบที่เพิ่งสร้างแล้วคืนใบแรก', async () => {
  let lookups = 0;
  const t = await serve({
    // ครั้งแรกยังไม่เจอ (ก่อนสร้าง) ครั้งที่สองเจอใบที่อีกคำขอเพิ่งสร้าง
    findJobByClientRef: async () => (lookups++ === 0 ? null : { id: 'job-first' }),
    getJobById: async (u, id) => ({ id, job_number: 'MJ-FIRST', items: [] }),
    updateJob: async () => {
      const e = new Error('duplicate key value violates unique constraint "jobs_user_client_ref_idx"');
      e.code = '23505';
      throw e;
    },
  });
  try {
    const r = await t.call('POST', '/jobs', { customerName: 'ครูแนน', items: [ITEM], clientRef: 'ref-12345678' });
    assert.equal(r.status, 200);
    assert.equal(r.body.duplicate, true);
    assert.equal(r.body.job.id, 'job-first');
    assert.deepEqual(t.calls.cancelled, ['job-1']);
  } finally {
    await t.close();
  }
});

test('PATCH /jobs/:id: ช่องใหม่ผ่านการตรวจและถูกเขียนลงงาน', async () => {
  const t = await serve();
  try {
    const r = await t.call('PATCH', '/jobs/job-9', {
      customer_phone: '0899999999',
      fulfillment: 'pickup',
      handler_name: 'ฝน',
    });
    assert.equal(r.status, 200);
    const saved = t.calls.saved.find((s) => s.id === 'job-9');
    assert.equal(saved.patch.customer_phone, '0899999999');
    assert.equal(saved.patch.fulfillment, 'pickup');
  } finally {
    await t.close();
  }
});

test('PATCH /jobs/:id: วิธีรับที่ไม่รู้จักถูกปฏิเสธ', async () => {
  const t = await serve();
  try {
    const r = await t.call('PATCH', '/jobs/job-9', { fulfillment: 'drone' });
    assert.equal(r.status, 400);
    assert.equal(t.calls.saved.length, 0);
  } finally {
    await t.close();
  }
});

test('PATCH /jobs/:id: ยังไม่รัน migration 022 → 503 พร้อมบอกว่าต้องทำอะไร', async () => {
  const t = await serve({
    updateJob: async () => {
      throw COLUMN_MISSING('handler_name');
    },
  });
  try {
    const r = await t.call('PATCH', '/jobs/job-9', { handler_name: 'ฝน' });
    assert.equal(r.status, 503);
    assert.equal(r.body.error, 'not_ready');
    assert.match(r.body.message, /022_chat_orders\.sql/);
  } finally {
    await t.close();
  }
});

test('ทุกเส้นทางของแชตต้องผ่านการยืนยันตัวตนเดิม', async () => {
  const app = express();
  app.use('/api', createApiRouter({ verify: async () => null }));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const port = server.address().port;
    const res = await fetch(`http://127.0.0.1:${port}/api/chat/customers`);
    assert.equal(res.status, 401);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('GET /chat/customers: บัญชีที่ไม่ได้อยู่ในรายชื่อเจ้าของ → 403 เหมือนหน้าอื่น', async () => {
  const before = process.env.ALLOWED_LINE_USER_IDS;
  process.env.ALLOWED_LINE_USER_IDS = 'U' + 'f'.repeat(32);
  const t = await serve();
  try {
    const r = await t.call('GET', '/chat/customers');
    assert.equal(r.status, 403);
    assert.equal(t.calls.saved.length, 0);
  } finally {
    await t.close();
    if (before === undefined) delete process.env.ALLOWED_LINE_USER_IDS;
    else process.env.ALLOWED_LINE_USER_IDS = before;
  }
});
