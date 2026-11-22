// ช่อง “ลูกค้า” เติมให้เองจากชื่อสินค้า/ชื่อร้านในชิ้นงาน — ร้านไม่มีเวลากรอก
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const C = require('../adobe/nesting-cut/core/customer.js');
const read = (p) => readFileSync(new URL('../adobe/nesting-cut/' + p, import.meta.url), 'utf8');

const scan = (parts, document = 'Untitled-1') => ({ document, parts });

test('ตัวหนังสือในงาน: เอาตัวใหญ่สุด · ข้ามเบอร์โทร/เว็บ/น้ำหนัก/ส่วนประกอบ', () => {
  const g = C.guess(
    scan([
      {
        texts: [
          { s: 'โทร 081-234-5678', h: 60 },
          { s: 'www.shop.com', h: 50 },
          { s: '100 g', h: 45 },
          { s: 'ส่วนประกอบ: พริก กระเทียม', h: 40 },
          { s: 'ป้าแดง\rน้ำพริกเผา', h: 28 },
          { s: 'สูตรโบราณ', h: 12 },
        ],
      },
    ])
  );
  assert.deepEqual(g, { name: 'ป้าแดง น้ำพริกเผา', from: 'text', fromText: 'ตัวหนังสือในงาน' });
});

test('หลายแบบแบรนด์เดียวกัน: ชื่อที่ซ้ำทุกแบบชนะคำที่ใหญ่กว่าแต่มีแบบเดียว', () => {
  const parts = ['รสต้นตำรับ', 'รสเผ็ด', 'รสหวาน'].map((r) => ({ texts: [{ s: 'น้ำพริกแม่ศรี', h: 18 }, { s: r, h: 22 }] }));
  assert.equal(C.guess(scan(parts)).name, 'น้ำพริกแม่ศรี');
});

test('ไม่มีตัวหนังสือ (แปลงเป็นเส้นแล้ว/รูป): ใช้ชื่อไฟล์รูป แล้วค่อยชื่อไฟล์งาน', () => {
  assert.deepEqual(C.guess(scan([{ files: ['S__1234567.jpg', 'ร้านกาแฟบ้านสวน_final(2).png'] }])), {
    name: 'ร้านกาแฟบ้านสวน',
    from: 'file',
    fromText: 'ชื่อไฟล์รูป',
  });
  // รูปที่วางเป็นชิ้นงานเองก็ใช้ชื่อไฟล์ได้ · IMG_1234 ไม่ใช่ชื่อ → ไปใช้ชื่อไฟล์งาน
  assert.equal(C.guess(scan([{ name: 'IMG_1234.jpg', typename: 'PlacedItem' }], 'งานป้าแดง สติ๊กเกอร์ 5x5cm.ai')).name, 'ป้าแดง');
  assert.equal(C.guess(scan([], 'ฉลาก น้ำพริกแม่ศรี (2).pdf')).name, 'น้ำพริกแม่ศรี');
  assert.equal(C.guess(scan([], 'Logo_Baan-Suan_v2.ai')).name, 'Baan Suan');
});

test('เดาไม่ได้ → null (ไม่เดามั่ว): ชื่ออัตโนมัติ · คำกลาง ๆ · ชื่อชิ้นงานใน Layers', () => {
  for (const d of ['Untitled-1', 'ไม่มีชื่อ-3.ai', 'โลโก้ร้าน.ai', 'งาน.ai', 'สติ๊กเกอร์ ฉลาก.ai', '12345.ai']) assert.equal(C.guess(scan([], d)), null, d);
  assert.equal(C.guess(scan([{ name: 'ดาว x10' }, { name: '<Group>' }])), null);
  assert.equal(C.guess(null), null);
  // “รูปหัวใจ” ไม่ใช่ชื่ออัตโนมัติ (คำว่า รูป ต้องตามด้วยเลข/ช่องว่าง)
  assert.equal(C.junk('รูปหัวใจ'), false);
  assert.equal(C.junk('IMG 1234'), true);
});

test('ข้อความยาวตัดที่คำ ไม่เกิน 40 ตัว · ตัดเครื่องหมายหัวท้าย', () => {
  assert.equal(C.tidy('  “ลุย!”  '), 'ลุย');
  const long = C.tidy('Golden Coconut Farm Organic Virgin Coconut Oil Premium Grade');
  assert.ok(long.length <= 40 && !/\s$/.test(long), long);
  assert.equal(long, 'Golden Coconut Farm Organic Virgin');
});

test('แผง: ดึงชิ้นงานแล้วเติมช่องลูกค้า · พิมพ์เองไม่ทับ · งานใหม่เดาไม่ได้ล้างชื่องานก่อน · ปิดได้', () => {
  const main = read('illustrator/main.js');
  assert.match(main, /var who = customerFromScan\(res\);/);
  assert.match(main, /var mine = !s\.customer \|\| s\.customer === s\.customerAuto;/);
  assert.match(main, /if \(s\.autoCustomer && mine\) \{/);
  assert.match(main, /var name = g \? g\.name : '';/); // เดาไม่ได้ = ล้าง (ไม่ให้ชื่อลูกค้าคนก่อนติดหัวงาน)
  assert.match(main, /autoCustomer: true,/);
  const html = read('illustrator.html');
  assert.match(html, /<input type="checkbox" data-setting="autoCustomer" \/> เติมชื่อลูกค้าจากชื่อสินค้าในชิ้นงานให้เอง/);
  assert.match(html, /<p class="hint cust-hint" id="custHint" hidden><\/p>/);
  assert.ok(html.indexOf('core/customer.js') > 0 && html.indexOf('core/customer.js') < html.indexOf('illustrator/main.js'));
});

test('Illustrator: np_scan ส่งตัวหนังสือ (ขนาดจริงหลังย่อขยาย) + ชื่อไฟล์รูปในชิ้นงาน · เดินกลุ่มใหญ่ไม่เกิน 400 ชิ้น', () => {
  const host = read('illustrator/host.jsx');
  assert.match(host, /function np_collectInfo\(it, out, depth\)/);
  assert.match(host, /texts: info\.texts,\n\s*files: info\.files\n/);
  assert.match(host, /size \* sc/);
  assert.match(host, /out\.seen <= 400/);
  // โหมดทดลองมีตัวหนังสือในงานให้ลอง
  assert.match(read('illustrator/demo.js'), /texts: \[\{ s: 'ม่วง ปริ้นท์', h: 40 \}\]/);
});
