import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SUMMARY_IMAGE_JS, summaryImageData } from '../src/routes/summaryImage.js';
import { SHEET_CANVAS_JS, SHEET_SHOT_JS } from '../src/routes/sheetCanvas.js';

/* รูปของใบสรุปต้องอยู่ในกระดาษ แม้เบราว์เซอร์จะไม่สนใจ ctx.textAlign
 *
 * ใบเสร็จเคยโดนมาแล้ว: ร้านส่งภาพมาว่า "ยอดเด้งไม่ตรงกรอบ" เพราะเบราว์เซอร์ใน
 * แอปไลน์บนเครื่องของร้านไม่ทำตาม textAlign ที่ตั้งไว้ แคนวาสปลอมข้างล่างจึง
 * "ไม่รู้จัก" textAlign เหมือนเครื่องของร้านเป๊ะ ๆ — ถ้าวันหนึ่งมีใครกลับไปใช้
 * textAlign บนใบสรุป เทสต์นี้จะจับได้ทันที
 */

const CHAR_W = 0.62;

function fakeContext(record) {
  let size = 16;
  return {
    set font(v) {
      const m = /(\d+(?:\.\d+)?)px/.exec(String(v));
      if (m) size = Number(m[1]);
      this._font = v;
    },
    get font() {
      return this._font;
    },
    // เครื่องของร้านตั้งค่านี้ได้แต่ไม่มีผล — วาดชิดซ้ายเสมอ
    textAlign: 'left',
    textBaseline: 'alphabetic',
    fillStyle: '#000',
    scale() {},
    beginPath() {},
    moveTo() {},
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
}

function fakeElement(id) {
  return {
    id,
    hidden: true,
    disabled: false,
    textContent: '',
    innerHTML: '',
    src: '',
    href: '',
    style: { setProperty() {} },
    classList: { toggle: () => false, remove() {}, add() {} },
    getAttribute: () => 'ใบสรุป.png',
    setAttribute() {},
    addEventListener() {},
    click() {},
  };
}

// รันสคริปต์วาดรูปจริง แล้วคืนทุกข้อความที่ถูกวาด
async function drawWith(data) {
  const drawn = [];
  const els = new Map();
  const el = (id) => {
    if (!els.has(id)) els.set(id, fakeElement(id));
    return els.get(id);
  };
  el('summary-data').textContent = JSON.stringify(data);

  const document = {
    getElementById: (id) => el(id),
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => fakeContext(drawn),
      toDataURL: () => 'data:image/png;base64,AA==',
    }),
    fonts: { ready: Promise.resolve() },
  };

  // หน้าจริงโหลดเครื่องมือวาดและตัวคุมปุ่มก่อนสคริปต์ของใบสรุป
  const fn = new Function(
    'document',
    'navigator',
    'atob',
    'File',
    'setTimeout',
    [SHEET_CANVAS_JS, SHEET_SHOT_JS, SUMMARY_IMAGE_JS].join('\n')
  );
  fn(document, {}, () => '', class {}, () => {});

  const btn = document.getElementById('make');
  assert.equal(typeof btn.onclick, 'function', 'ปุ่มทำรูปไม่ได้ถูกต่อสาย');
  await btn.onclick();
  return drawn;
}

// ใบเดียวกับที่ร้านส่งตัวอย่างมา: สามวัน มีค่าส่งสองวัน
const BILL = {
  bill_number: 'MJ-B-20260718-0001',
  customer_name: 'พี่แอน',
  total: 6535,
  jobs: [
    {
      job_name: 'สติ๊กเกอร์',
      job_date: '2026-07-18',
      total: 3350,
      items: [
        { item_name: 'สติ๊กเกอร์ใส', size: '13 × 19 นิ้ว', unit: 'แผ่น', quantity: 48, total: 2400 },
        { item_name: 'สติ๊กเกอร์ขาวเงา', size: '13 × 19 นิ้ว', unit: 'แผ่น', quantity: 24, total: 950 },
      ],
    },
    {
      job_name: 'สติ๊กเกอร์',
      job_date: '2026-07-20',
      total: 1005,
      items: [
        { item_name: 'สติ๊กเกอร์ใส', size: '13 × 19 นิ้ว', unit: 'แผ่น', quantity: 18, total: 900 },
        { item_name: 'ค่าส่ง', total: 105 },
      ],
    },
    {
      job_name: 'สติ๊กเกอร์',
      job_date: '2026-07-24',
      total: 2180,
      items: [
        { item_name: 'สติ๊กเกอร์ขาวด้าน', size: '13 × 19 นิ้ว', unit: 'แผ่น', quantity: 42, total: 2100 },
        { item_name: 'ค่าส่ง', total: 80 },
      ],
    },
  ],
};
const SHOP = { shop_name: 'นัฐภรณ์ การพิมพ์', phone: '081-234-5678' };

// ขนาดกระดาษ ต้องตรงกับค่าในสคริปต์วาดรูป
const W = 680;
const M = 24;
const P = 28;
const SHEET_RIGHT = W - M; // 656 — ขอบกระดาษ
const CONTENT_RIGHT = W - M - P; // 628 — ขอบเนื้อหา

test('ทุกอย่างอยู่ในกระดาษ ถึงเบราว์เซอร์จะไม่ทำตาม textAlign', async () => {
  const drawn = await drawWith(summaryImageData(BILL, SHOP));
  assert.ok(drawn.length > 20, 'ไม่ได้วาดอะไรเลย');

  const over = drawn.filter((d) => d.x + d.width > SHEET_RIGHT + 0.5);
  assert.deepEqual(
    over.map((d) => `${d.text} ล้นถึง ${Math.round(d.x + d.width)}`),
    [],
    'มีข้อความวิ่งออกนอกกระดาษ — เลขท้ายจะโดนเฉือนทิ้งบนเครื่องของร้าน'
  );
  assert.deepEqual(drawn.filter((d) => d.x < M - 0.5).map((d) => d.text), []);
});

test('ราคาของแต่ละบรรทัดชิดขอบเนื้อหาจริง ไม่ใช่แค่ไม่ล้น', async () => {
  const drawn = await drawWith(summaryImageData(BILL, SHOP));

  // ยอดของบรรทัดรายการ (ไม่ใช่ยอดรวมวัน ซึ่งเว้นขอบกล่อง 14 และตัวใหญ่กว่า)
  const rowAmounts = drawn.filter((d) => /^฿[\d,]+$/.test(d.text) && d.size === 19);
  assert.ok(rowAmounts.length >= 6, `หายอดรายการไม่เจอ (เจอ ${rowAmounts.length})`);
  for (const m of rowAmounts) {
    const right = m.x + m.width;
    const ok = Math.abs(right - CONTENT_RIGHT) < 0.5 || Math.abs(right - (CONTENT_RIGHT - 14)) < 0.5;
    assert.ok(ok, `${m.text} จบที่ ${Math.round(right)} ไม่ใช่ ${CONTENT_RIGHT}`);
  }

  // ยอดรวมทั้งหมดเป็นตัวใหญ่สุดในกล่องสรุป
  const grand = drawn.filter((d) => d.size === 26);
  assert.equal(grand.length, 1);
  assert.equal(grand[0].text, '฿6,535');
});

test('ตัวเลขบนรูปตรงกับใบสรุปบนหน้าเว็บทุกตัว', async () => {
  const data = summaryImageData(BILL, SHOP);
  const drawn = await drawWith(data);
  const texts = drawn.map((d) => d.text);

  // ยอดรวมของแต่ละวันจากใบที่ร้านส่งมา
  assert.deepEqual(
    data.days.map((d) => [d.sheets, d.total]),
    [
      ['72 แผ่น', '฿3,350'],
      ['18 แผ่น', '฿1,005'],
      ['42 แผ่น', '฿2,180'],
    ]
  );
  assert.deepEqual(data.grand, {
    sheets: '132',
    goods: '฿6,350',
    shipping: '฿185',
    total: '฿6,535',
  });

  for (const want of ['132', '฿6,350', '฿185', '฿6,535', 'MJ-B-20260718-0001', 'พี่แอน']) {
    assert.ok(texts.includes(want), `ไม่มี "${want}" บนรูป`);
  }
  // ชื่อร้านต้องขึ้นหัวใบ ลูกค้าจะได้รู้ว่าใบนี้มาจากร้านไหน
  assert.ok(texts.includes('นัฐภรณ์ การพิมพ์'));
});

test('ค่าส่งไม่กินเลขลำดับ และไม่ถูกนับเป็นแผ่น', async () => {
  const data = summaryImageData(BILL, SHOP);
  const july20 = data.days[1];

  assert.deepEqual(july20.rows.map((r) => [r.no, r.name, r.sheets]), [
    ['1', 'สติ๊กเกอร์ใส', '18 แผ่น'],
    ['', 'ค่าส่ง', ''],
  ]);

  const drawn = await drawWith(data);
  assert.ok(drawn.some((d) => d.text === 'ค่าส่ง'), 'ค่าส่งหายไปจากรูป');
  assert.ok(drawn.some((d) => d.text === '฿105'), 'ยอดค่าส่งหายไปจากรูป');
});

test('ชื่อรายการยาว ๆ ขึ้นบรรทัดใหม่ ไม่ทับราคาและไม่ล้นกระดาษ', async () => {
  const long = {
    ...BILL,
    total: 99999,
    jobs: [
      {
        job_name: 'งานยาว',
        job_date: '2026-07-18',
        total: 99999,
        items: [
          {
            item_name: 'สติ๊กเกอร์ไดคัทติดกระจกร้านพร้อมเคลือบยูวีกันแดดกันน้ำ ลายพิเศษ',
            size: 'กว้าง 120 ซม. ยาว 240 ซม. · ตอกตาไก่ 4 มุม',
            unit: 'แผ่น',
            quantity: 6,
            total: 99999,
          },
        ],
      },
    ],
  };
  const drawn = await drawWith(summaryImageData(long, SHOP));
  assert.deepEqual(drawn.filter((d) => d.x + d.width > SHEET_RIGHT + 0.5).map((d) => d.text), []);

  assert.ok(drawn.filter((d) => d.size === 20).length >= 2, 'ชื่อยาวไม่ได้ถูกตัดบรรทัด');
  assert.deepEqual(collisions(drawn), []);
});

/* ข้อความสองชิ้นที่อยู่บรรทัดเดียวกันแล้วกินที่ทับกัน
 *
 * เช็คจากพิกัดที่วาดจริง ไม่ใช่จากค่าคงที่ที่จำมาจากโค้ด — รอบแรกเทสต์เทียบกับ
 * "ขอบคอลัมน์" ที่คิดเอาเองแล้วผ่านฉลุย ทั้งที่รูปจริงมีชื่อรายการทับกับ
 * "42 แผ่น" อยู่ เพราะคอลัมน์จำนวนไม่ได้ถูกกันที่ไว้ให้เลย
 */
function collisions(drawn) {
  const byLine = new Map();
  for (const d of drawn) {
    if (!String(d.text).trim()) continue;
    const key = Math.round(d.y);
    if (!byLine.has(key)) byLine.set(key, []);
    byLine.get(key).push(d);
  }
  const bad = [];
  for (const row of byLine.values()) {
    const sorted = [...row].sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i++) {
      const left = sorted[i - 1];
      const right = sorted[i];
      if (left.x + left.width > right.x + 0.5) bad.push(`"${left.text}" ทับ "${right.text}"`);
    }
  }
  return bad;
}

test('ไม่มีข้อความชิ้นไหนวาดทับกันบนบรรทัดเดียวกัน', async () => {
  assert.deepEqual(collisions(await drawWith(summaryImageData(BILL, SHOP))), []);
});

test('ใบที่ร้านปัดราคา บอกทั้งยอดรายการและยอดที่ตกลงกัน', async () => {
  const data = summaryImageData({ ...BILL, total: 6500 }, SHOP);
  assert.match(data.note, /฿6,535/);
  assert.match(data.note, /฿6,500/);
  assert.equal(data.grand.total, '฿6,500');

  const drawn = await drawWith(data);
  assert.ok(drawn.some((d) => d.text === data.note), 'หมายเหตุราคาที่ปัดไม่ได้ขึ้นบนรูป');
});

test('บิลเปล่า ยังทำรูปได้ ไม่พัง', async () => {
  const drawn = await drawWith(summaryImageData({ bill_number: 'MJ-B-1', total: 0, jobs: [] }, {}));
  assert.ok(drawn.some((d) => d.text === 'ยังไม่มีรายการในใบนี้'));
  assert.deepEqual(drawn.filter((d) => d.x + d.width > SHEET_RIGHT + 0.5).map((d) => d.text), []);
});
