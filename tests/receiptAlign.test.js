import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RECEIPT_IMAGE_JS, receiptData } from '../src/routes/receipt.js';
import { SHEET_CANVAS_JS } from '../src/routes/sheetCanvas.js';

/* ยอดในรูปใบเสร็จต้องอยู่ในกระดาษ แม้เบราว์เซอร์จะไม่สนใจ ctx.textAlign
 *
 * ร้านส่งภาพมาว่า "ยอดเด้งไม่ตรงกรอบ": ฿1,100 ของแถวแรกโดนเฉือนเลขท้ายทิ้ง
 * ยอดรวมเหลือ "฿1,1" และคงเหลือเหลือ "คงเหลื" ทั้งที่โค้ดตั้ง textAlign = 'right'
 * ไว้ก่อนวาดทุกครั้ง — เบราว์เซอร์ในแอปไลน์บนเครื่องของร้านไม่ทำตามค่านั้น
 *
 * แคนวาสปลอมข้างล่างจึง "ไม่รู้จัก" textAlign เหมือนเครื่องของร้านเป๊ะ ๆ
 * ถ้าวันหนึ่งมีใครกลับไปใช้ textAlign อีก เทสต์นี้จะจับได้ทันที
 */

// ความกว้างโดยประมาณ ไม่ต้องตรงกับฟอนต์จริง ขอแค่สม่ำเสมอ — โค้ดที่วาดใช้
// measureText ตัวเดียวกันทั้งตอนตัดบรรทัดและตอนจัดชิดขวา
const CHAR_W = 0.62;

function fakeContext(record) {
  let size = 16;
  const ctx = {
    canvas: null,
    set font(v) {
      const m = /(\d+(?:\.\d+)?)px/.exec(String(v));
      if (m) size = Number(m[1]);
      this._font = v;
    },
    get font() {
      return this._font;
    },
    // เครื่องของร้านไม่สนใจค่านี้ ตั้งได้แต่ไม่มีผล — วาดชิดซ้ายเสมอ
    textAlign: 'left',
    textBaseline: 'alphabetic',
    fillStyle: '#000',
    scale() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    arcTo() {},
    closePath() {},
    fill() {},
    fillRect() {},
    measureText(t) {
      return { width: String(t).length * CHAR_W * size };
    },
    fillText(t, x, y) {
      record.push({ text: String(t), x, y, width: this.measureText(t).width, size });
    },
  };
  return ctx;
}

function fakeElement(id) {
  return {
    id,
    hidden: false,
    checked: true,
    disabled: false,
    textContent: '',
    innerHTML: '',
    style: { setProperty() {} },
    classList: { toggle: () => false, remove() {}, add() {}, contains: () => false },
    getAttribute: () => 'ใบเสร็จ.png',
    setAttribute() {},
    addEventListener() {},
    click() {},
  };
}

// รันสคริปต์วาดรูปจริง ๆ บนแคนวาสปลอม แล้วคืนทุกข้อความที่ถูกวาด
function drawWith(billData, { shopView = false } = {}) {
  const drawn = [];
  const els = new Map();
  const el = (id) => {
    if (!els.has(id)) els.set(id, fakeElement(id));
    return els.get(id);
  };
  el('bill-data').textContent = JSON.stringify(billData);
  // หน้าที่ลูกค้าเปิดไม่มีสวิตช์นี้ ให้หายไปเลยเหมือนของจริง
  if (!shopView) els.set('show-items', null);

  const document = {
    getElementById: (id) => (els.has(id) ? els.get(id) : el(id)),
    createElement: () => ({ width: 0, height: 0, getContext: () => fakeContext(drawn), toDataURL: () => 'data:image/png;base64,AA==' }),
    body: { classList: { toggle() {} } },
    fonts: { ready: Promise.resolve() },
  };

  const fn = new Function(
    'document',
    'localStorage',
    'navigator',
    'atob',
    'File',
    'URL',
    'setTimeout',
    // หน้าจริงโหลดเครื่องมือวาดก่อนสคริปต์ของใบเสร็จ เทสต์ก็ต้องต่อกันแบบเดียวกัน
    SHEET_CANVAS_JS + '\n' + RECEIPT_IMAGE_JS
  );
  fn(
    document,
    { getItem: () => null, setItem() {} },
    {},
    () => '',
    class {},
    {},
    () => {}
  );

  // กดปุ่ม "ทำรูป" เหมือนร้านกดจริง
  const btn = document.getElementById('make');
  assert.equal(typeof btn.onclick, 'function', 'ปุ่มทำรูปไม่ได้ถูกต่อสาย');
  return { run: btn.onclick(), drawn };
}

const BILL = {
  bill_number: 'MJ-B-20260916-0002',
  customer_name: 'พี่น้อย',
  created_at: '2026-09-16T13:16:00.000Z',
  total: 1100,
  subtotal: 1023,
  paid_amount: 0,
  balance_due: 1100,
  payment_status: 'pending',
  jobs: [
    {
      id: 'j1',
      job_name: 'รพ.สต.บ้านชี',
      job_date: '2026-09-09',
      total: 1100,
      subtotal: 1023,
      items: [
        { item_name: 'พี่น้อย รพ.สต. บ้านชี', size: '160 × 200 ซม.', total: 600 },
        { item_name: 'พี่น้อย รพ.สต. บ้านชี', size: '100 × 300 ซม.', total: 500 },
      ],
    },
  ],
};
const SHOP = { shop_name: 'นัฐภรณ์ การพิมพ์' };

// ขนาดกระดาษ ต้องตรงกับค่าในสคริปต์วาดรูป
const W = 680;
const M = 24;
const P = 28;
const SHEET_RIGHT = W - M; // 656 — ขอบกระดาษ
const CONTENT_RIGHT = W - M - P; // 628 — ขอบเนื้อหา

test('ทุกยอดอยู่ในกระดาษ ถึงเบราว์เซอร์จะไม่ทำตาม textAlign', async () => {
  const { run, drawn } = drawWith(receiptData(BILL, SHOP, true), { shopView: true });
  await run;

  assert.ok(drawn.length > 10, 'ไม่ได้วาดอะไรเลย');

  const over = drawn.filter((d) => d.x + d.width > SHEET_RIGHT + 0.5);
  assert.deepEqual(
    over.map((d) => `${d.text} ล้นถึง ${Math.round(d.x + d.width)}`),
    [],
    'มีข้อความวิ่งออกนอกกระดาษ — เลขท้ายจะโดนเฉือนทิ้งบนเครื่องของร้าน'
  );

  // และต้องไม่มีอะไรล้นออกทางซ้ายด้วย
  assert.deepEqual(drawn.filter((d) => d.x < M - 0.5).map((d) => d.text), []);
});

test('ยอดถูกจัดชิดขวาจริง ไม่ใช่แค่ไม่ล้น', async () => {
  const { run, drawn } = drawWith(receiptData(BILL, SHOP, true), { shopView: true });
  await run;

  const money = drawn.filter((d) => /^฿[\d,]+$/.test(d.text));
  assert.ok(money.length >= 4, `หายอดไม่เจอ (เจอ ${money.length})`);

  // ยอดรวมทั้งสิ้นเป็นตัวใหญ่ในกล่องสีม่วง ชิดขวาโดยเว้นขอบกล่อง 18
  const grand = money.filter((m) => m.size >= 40);
  assert.equal(grand.length, 1);
  assert.ok(Math.abs(grand[0].x + grand[0].width - (CONTENT_RIGHT - 18)) < 0.5);

  // ยอดของแถวงาน กับยอดของรายการย่อย ชิดขอบเนื้อหาพอดี
  for (const m of money.filter((x) => x.size < 40)) {
    assert.ok(
      Math.abs(m.x + m.width - CONTENT_RIGHT) < 0.5,
      `${m.text} จบที่ ${Math.round(m.x + m.width)} ไม่ใช่ ${CONTENT_RIGHT}`
    );
  }

  // "คงเหลือ ฿1,100" ก็ชิดขวาเหมือนกัน
  const balance = drawn.find((d) => d.text.startsWith('คงเหลือ'));
  assert.ok(balance, 'ไม่มีบรรทัดคงเหลือ');
  assert.ok(Math.abs(balance.x + balance.width - CONTENT_RIGHT) < 0.5);

  // "รับชำระแล้ว" ยังชิดซ้ายตามเดิม
  const paid = drawn.find((d) => d.text.startsWith('รับชำระแล้ว'));
  assert.ok(paid && Math.abs(paid.x - (M + P)) < 0.5);
});

test('ใบของลูกค้า (ไม่มีสวิตช์ในหน้า) ก็ไม่ล้นเหมือนกัน', async () => {
  const { run, drawn } = drawWith(receiptData(BILL, SHOP, false), { shopView: false });
  await run;
  assert.deepEqual(drawn.filter((d) => d.x + d.width > SHEET_RIGHT + 0.5).map((d) => d.text), []);
});

test('ยอดที่ยาวผิดปกติ ยังไม่ทับชื่องาน และยังไม่ออกนอกกระดาษ', async () => {
  const huge = {
    ...BILL,
    total: 999999999,
    balance_due: 999999999,
    jobs: [{ ...BILL.jobs[0], job_name: 'ป้ายไวนิลงานบุญประจำปีของหมู่บ้าน', total: 999999999, items: [] }],
  };
  const { run, drawn } = drawWith(receiptData(huge, SHOP, true), { shopView: true });
  await run;
  assert.deepEqual(drawn.filter((d) => d.x + d.width > SHEET_RIGHT + 0.5).map((d) => d.text), []);
});
