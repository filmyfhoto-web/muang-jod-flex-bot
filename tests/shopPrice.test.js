import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createApiRouter } from '../src/routes/api.js';
import { renderReceiptHtml, receiptItemLines, shopOnlyPrice, jobWasAdjusted } from '../src/routes/receipt.js';
import { summarizeBill } from '../src/services/billService.js';
import { shopKey, isShopKey, withShopKey } from '../src/utils/receiptLink.js';
import { billFlex } from '../src/flex/billFlex.js';

// ร้านบอกว่า "บางทีเราอยากแก้ราคาปัดขึ้น ... ส่งให้แอดมิน เห็นราคาจริง
// ส่งให้ลูกค้าราคาแก้แล้ว" — สองราคาในงานเดียว ราคาที่คิดได้จากรายการเป็นของร้าน
// ราคาที่เก็บเป็นของลูกค้า และเส้นแบ่งต้องอยู่ที่ "อะไรถูกส่งออกไป" ไม่ใช่ CSS

process.env.LIFF_ID = '1234567890-abcdefgh';
process.env.PUBLIC_BASE_URL = 'https://shop.example.com';
process.env.RECEIPT_SHOP_SECRET = 'secret-for-tests';

const BILL = {
  bill_number: 'MJ-B-20260911-0002',
  customer_name: 'ผอ กิ๊ก โรงเรียนบ้านนาบง',
  issued_at: '2026-09-11T05:18:00Z',
  payment_status: 'pending',
  subtotal: 4887.97,
  total: 5000,
  paid_amount: 0,
  balance_due: 5000,
  jobs: [
    {
      job_name: 'งานป้าย',
      job_date: '2026-09-11',
      subtotal: 4887.97,
      total: 5000,
      items: [
        { item_name: 'ไวนิลพระเทพ', size: '150 × 300 ซม.', quantity: 1, total: 742.5 },
        { item_name: 'สแตนตี้', quantity: 2, unit: 'ตัว', total: 2400 },
        { item_name: 'ไวนิล โรงเรียน', size: '122 × 303 ซม.', quantity: 1, total: 1745.47 },
      ],
    },
  ],
};

test('the key that opens the shop view is not guessable, and the customer link has none', () => {
  const key = shopKey('tok-abc');
  assert.ok(key && key.length >= 16, 'no key at all');
  assert.notEqual(key, shopKey('tok-xyz'), 'the same key opens every bill');

  assert.ok(isShopKey('tok-abc', key));
  assert.equal(isShopKey('tok-abc', ''), false);
  assert.equal(isShopKey('tok-abc', key.slice(0, -1) + 'f'), false);
  assert.equal(isShopKey('tok-xyz', key), false, "one bill's key opened another");

  // The link handed to a customer is the bare one; the shop's carries the key.
  assert.equal(withShopKey('https://s.example.com/r/tok-abc', 'tok-abc'), `https://s.example.com/r/tok-abc?k=${key}`);
});

test('the card in the shop chat opens the shop view; its share link does not', () => {
  const bill = { id: 'b1', bill_number: 'MJ-B-0001', share_token: 'tok-abc', total: 5000, jobs: [] };
  const footer = billFlex(bill, { baseUrl: 'https://shop.example.com' }).contents.footer.contents;
  const links = JSON.stringify(footer);
  assert.ok(links.includes(`/r/tok-abc?k=${shopKey('tok-abc')}`), 'the shop opens the customer copy of their own receipt');
  // ปุ่มส่งให้ลูกค้าพาลิงก์เปล่าไป กุญแจห้ามติดไปกับข้อความที่ส่งออก
  const share = footer.flatMap((f) => f.contents || []).map((c) => c.action?.uri).find((u) => u?.includes('line.me/R/share'));
  assert.ok(share, 'no share button at all');
  assert.ok(!decodeURIComponent(share).includes('k='), 'the shop key went out to the customer');
});

test('the real price is absent from the customer page, not merely hidden on it', () => {
  const customer = renderReceiptHtml(BILL, {});
  // ตัวเลขจริงต้องไม่มีในหน้าเลย ทั้งในตัวหน้าและใน JSON ที่แนบไปให้ canvas
  assert.ok(!customer.includes('4,887.97'), 'the real price is sitting in the customer page');
  assert.ok(!customer.includes('4887.97'), 'the real price is in the embedded data');
  assert.ok(!customer.includes('class="mine"'), 'the shop-only block rendered for the customer');
  assert.ok(!customer.includes('id="shot-badge"'), 'the shop-only warning rendered for the customer');
  assert.ok(!customer.includes('id="make-shop"'), 'the customer was offered the shop copy');
  assert.ok(customer.includes('฿5,000'), 'the price the customer pays is missing');

  const mine = renderReceiptHtml(BILL, {}, { shopView: true });
  assert.ok(mine.includes('4,887.97'), 'the shop cannot see what the job actually came to');
  // ร้านเรียกมันว่า "ราคายังไม่ปัด" — "ราคาจริง" อ่านแล้วเหมือนบอกว่ายอดที่
  // ลูกค้าจ่ายเป็นของปลอม ทั้งที่นั่นคือเงินที่เก็บจริง
  assert.ok(mine.includes('ราคายังไม่ปัด'), 'the shop-only figure is labelled something else');
  assert.ok(mine.includes('ปัดขึ้น +฿112.03'), 'the rounding is not spelled out');
  assert.ok(mine.includes('id="make-shop"'), 'no way to make the shop copy of the picture');
});

test('a rounded-up job does not print per-item prices that add up to something else', () => {
  // ถ้าโชว์ยอดย่อยบนใบของลูกค้า ลูกค้าบวกเองได้ 4,887.97 แล้วยอดข้างล่างเขียน
  // 5,000 — ซึ่งอ่านได้อย่างเดียวว่าร้านคิดเกิน
  const job = BILL.jobs[0];
  assert.equal(jobWasAdjusted(job), true);

  const forCustomer = receiptItemLines(job);
  assert.equal(forCustomer.length, 3, 'the lines themselves must still be there');
  assert.ok(forCustomer.every((l) => l.amount === ''), 'a price the customer can total came out');
  assert.ok(forCustomer[0].text.includes('ไวนิลพระเทพ'), 'the customer lost sight of what they bought');

  const forShop = receiptItemLines(job, { shopView: true });
  assert.deepEqual(forShop.map((l) => l.amount), ['฿742.50', '฿2,400', '฿1,745.47']);

  // งานที่ไม่ได้ปัด — ยอดที่เก็บเท่ากับผลบวกของบรรทัด — ยังโชว์ยอดต่อบรรทัด
  const plain = { ...job, subtotal: 4887.97, total: 4887.97 };
  assert.equal(jobWasAdjusted(plain), false);
  assert.deepEqual(receiptItemLines(plain).map((l) => l.amount), ['฿742.50', '฿2,400', '฿1,745.47']);

  // ราคายังไม่ปัดที่ร้านพิมพ์ทับไว้ ไม่ใช่ตัวตัดสิน — สิ่งที่ลูกค้าบวกเองได้คือ
  // บรรทัดที่พิมพ์อยู่บนใบ ไม่ใช่ตัวเลขที่ร้านจดไว้ดูเอง
  assert.equal(jobWasAdjusted({ ...plain, subtotal: 3000 }), false, 'a shop-only figure decided what the customer sees');
});

test('the shop chooses whether the customer sees per-item prices; the customer has no such switch', () => {
  // ร้านถามว่า "ในใบเสร็จแล้วก็เลือกได้จะให้เห็นหรือไม่" — สวิตช์เป็นของร้าน
  // อยู่ในใบที่เปิดด้วยกุญแจร้าน ใบที่ลูกค้าถือไม่มีอะไรให้กด
  assert.ok(!renderReceiptHtml(BILL, {}).includes('id="show-items"'), 'the customer got the shop switch');

  // งานที่ปัดราคาแล้ว ตั้งต้นคือปิด เพราะยอดย่อยรวมแล้วไม่ตรงกับที่เก็บ
  const rounded = renderReceiptHtml(BILL, {}, { shopView: true });
  const roundedSwitch = /<input type="checkbox" id="show-items"([^>]*)\/>/.exec(rounded);
  assert.ok(roundedSwitch, 'no switch on the shop copy');
  assert.ok(!roundedSwitch[1].includes('checked'), 'a rounded receipt starts by showing sums that disagree');
  assert.ok(rounded.includes('ยอดย่อยรวมได้ ฿4,887.97'), 'nothing warns what turning it on prints');

  // งานที่ไม่ได้ปัด ตั้งต้นคือเปิด — ไม่มีอะไรต้องปิด
  const plain = { ...BILL, subtotal: 4887.97, total: 4887.97, jobs: [{ ...BILL.jobs[0], total: 4887.97 }] };
  const plainSwitch = /<input type="checkbox" id="show-items"([^>]*)\/>/.exec(
    renderReceiptHtml(plain, {}, { shopView: true })
  );
  assert.ok(plainSwitch[1].includes('checked'), 'prices that add up correctly were hidden by default');
});

test('no rounding, nothing to say — the shop view stays quiet', () => {
  assert.equal(shopOnlyPrice({ subtotal: 930, total: 930 }), null);
  // งานเก่าที่ยังไม่เคยเก็บ subtotal ไว้ ไม่ใช่ "ลดให้ 930 บาท"
  assert.equal(shopOnlyPrice({ total: 930 }), null);
  assert.equal(shopOnlyPrice({ subtotal: 1000, total: 930 }).gapText, 'ลดให้ −฿70');
});

test('a bill carries both numbers, and old jobs count as unrounded', () => {
  const money = summarizeBill([
    { subtotal: 4887.97, total: 5000, paid_amount: 0 },
    { total: 200, paid_amount: 50 }, // งานเก่า ไม่มี subtotal
  ]);
  assert.equal(money.total, 5200, 'the customer owes what the shop charged');
  assert.equal(money.subtotal, 5087.97, 'the real price did not survive the bill');
  assert.equal(money.discount, -112.03, 'the gap is lost, so the receipt cannot show it');
  assert.equal(money.balance_due, 5150);
});

// ---- the API: which number is the server's to compute, and which is the shop's

async function serve(deps = {}) {
  const saved = { patch: null, created: null };
  const app = express();
  app.use(
    '/api',
    createApiRouter({
      verify: async () => ({ userId: 'U-line' }),
      resolveProfile: async () => ({ id: 'user-1', line_user_id: 'U-line' }),
      getJobById: async () => ({ id: 'job-1', subtotal: 4887.97, total: 5000, discount: -112.03, paid_amount: 0, bill_id: null, customer_name: 'พี่นก' }),
      updateJob: async (userId, id, patch) => { saved.patch = patch; return { id }; },
      createJob: async (userId, payload) => { saved.created = payload; return { id: 'job-9', ...payload }; },
      replaceJobItems: async () => [],
      push: async () => {},
      getTodaySummary: async () => null,
      createBill: async () => ({ id: 'b1', bill_number: 'MJ-B-0001', share_token: 'tok-new', total: 5000 }),
      ...deps,
    })
  );
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, method, body) => {
    const res = await fetch(`${base}/api${path}`, {
      method,
      headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  return { saved, call, close: () => new Promise((r) => server.close(r)) };
}

test('the price the shop charges is theirs to set; the price the rows add up to is not', async () => {
  const s = await serve();
  try {
    // แก้รายการพร้อมตั้งราคาที่เก็บ — ราคาจริงมาจากรายการ ไม่ใช่จากเบราว์เซอร์
    const { status } = await s.call('/jobs/job-1', 'PATCH', {
      items: [
        { item_name: 'ไวนิล', quantity: 1, unit_price: 742.5 },
        { item_name: 'สแตนตี้', quantity: 2, unit_price: 1200 },
      ],
      total: 5000,
    });
    assert.equal(status, 200);
    assert.equal(s.saved.patch.subtotal, 3142.5, 'the real price was taken from the wire');
    assert.equal(s.saved.patch.total, 5000, 'the shop was not allowed to set what it charges');
    assert.equal(s.saved.patch.discount, -1857.5, 'the gap between the two is not recorded');
  } finally {
    await s.close();
  }
});

test('changing only the charged price keeps the real one, and re-derives the gap', async () => {
  const s = await serve();
  try {
    await s.call('/jobs/job-1', 'PATCH', { total: 4900 });
    assert.equal(s.saved.patch.subtotal, 4887.97, 'the real price moved with the charged one');
    assert.equal(s.saved.patch.total, 4900);
    assert.equal(s.saved.patch.discount, -12.03);
    assert.equal(s.saved.patch.balance_due, 4900, 'what is still owed did not follow the new price');
  } finally {
    await s.close();
  }
});

test('editing the rows without saying a price lets the price follow the rows', async () => {
  const s = await serve();
  try {
    // ไม่งั้นยอดปัดของเดิมค้างอยู่ ทั้งที่รายการข้างใต้เปลี่ยนไปแล้ว
    await s.call('/jobs/job-1', 'PATCH', { items: [{ item_name: 'ไวนิล', quantity: 1, unit_price: 900 }] });
    assert.equal(s.saved.patch.subtotal, 900);
    assert.equal(s.saved.patch.total, 900);
    assert.equal(s.saved.patch.discount, 0);
  } finally {
    await s.close();
  }
});

test('both prices are the shop\'s to type — the rows do not overrule the one they typed', async () => {
  // ร้านบอกว่า "มีช่องราคาลูกค้า กับช่อง ราคาจริง และฉันกดแก้ไขทั้ง 2 ช่องนั้นได้"
  // ราคายังไม่ปัดไม่เคยขึ้นใบที่ลูกค้าถือ จึงไม่มีอะไรบนใบเสร็จให้ขัดกัน
  const s = await serve();
  try {
    await s.call('/jobs/job-1', 'PATCH', {
      items: [{ item_name: 'ไวนิล', quantity: 1, unit_price: 3000 }],
      subtotal: 4800,
      total: 5000,
    });
    assert.equal(s.saved.patch.subtotal, 4800, 'the rows overwrote the price the shop typed');
    assert.equal(s.saved.patch.total, 5000);
    assert.equal(s.saved.patch.discount, -200);
  } finally {
    await s.close();
  }

  // พิมพ์เฉพาะราคายังไม่ปัด ยอดที่เก็บลูกค้าต้องอยู่ที่เดิม
  const t = await serve();
  try {
    await t.call('/jobs/job-1', 'PATCH', { subtotal: 4800 });
    assert.equal(t.saved.patch.subtotal, 4800);
    assert.equal(t.saved.patch.total, undefined, 'typing the shop price moved what the customer owes');
    assert.equal(t.saved.patch.discount, -200, 'against the price already on the job');
  } finally {
    await t.close();
  }
});

test('a new job can be saved with a typed shop price', async () => {
  const s = await serve();
  try {
    const { status } = await s.call('/jobs', 'POST', {
      items: [{ item_name: 'ไวนิล', quantity: 1, unit_price: 3000, total: 3000 }],
      listedTotal: 4800,
      customerTotal: 5000,
    });
    assert.equal(status, 201);
    assert.equal(s.saved.created.subtotal, 4800);
    assert.equal(s.saved.created.total, 5000);
    assert.equal(s.saved.created.discount, -200);
  } finally {
    await s.close();
  }
});

test('a new job can be saved already rounded up', async () => {
  const s = await serve();
  try {
    const { status } = await s.call('/jobs', 'POST', {
      items: [{ item_name: 'ไวนิล', quantity: 1, unit_price: 4887.97, total: 4887.97 }],
      customerTotal: 5000,
    });
    assert.equal(status, 201);
    assert.equal(s.saved.created.subtotal, 4887.97);
    assert.equal(s.saved.created.total, 5000);
    assert.equal(s.saved.created.discount, -112.03);
  } finally {
    await s.close();
  }
});

test('the receipt endpoint hands back both links, the customer one without the key', async () => {
  const s = await serve();
  try {
    const { body } = await s.call('/jobs/job-1/receipt', 'POST');
    assert.equal(body.url, 'https://shop.example.com/r/tok-new');
    assert.ok(!body.url.includes('k='), 'the customer link carries the shop key');
    assert.equal(body.shopUrl, `https://shop.example.com/r/tok-new?k=${shopKey('tok-new')}`);
  } finally {
    await s.close();
  }
});
