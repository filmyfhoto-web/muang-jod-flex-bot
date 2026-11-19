// The order cards (src/salechat/card.js): the customer's card and the team's card are built from the order's database rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCustomerCard, buildTeamCard, money, thaiDate } from '../src/salechat/card.js';
import { retryKeyFor } from '../src/salechat/team.js';

const order = {
  id: 'o1',
  order_no: 'ORD-2569-00123',
  order_type: 'goods',
  order_date: '2026-11-04',
  customer_name: 'โรงเรียนบ้านตัวอย่าง',
  phone: '053-000000',
  subtotal: 2750,
  vat_rate: 7,
  vat_amount: 192.5,
  total: 2942.5,
  note: 'ส่งของที่โรงเรียน ภายในวันที่ 27 ม.ค. 2569',
  fulfil: 'delivery',
  need_date: '2026-11-27',
};
const items = [
  { seq: 1, name: 'กระดาษถ่ายเอกสาร A4 80 แกรม', qty: 10, unit: 'รีม', unit_price: 135, line_total: 1350 },
  { seq: 2, name: 'ปากกาเจล สีน้ำเงิน', qty: 3, unit: 'โหล', unit_price: 120, line_total: 360 },
];

// every text node of a flex message, in order, as one string (so a test can look for a word anywhere on the card)
const allText = (node) => {
  if (!node || typeof node !== 'object') return '';
  if (Array.isArray(node)) return node.map(allText).join('\n');
  const own = node.type === 'text' ? String(node.text) : '';
  return [own, allText(node.header), allText(node.body), allText(node.footer), allText(node.contents)].filter(Boolean).join('\n');
};

test('the customer card is a flex bubble with the order number, each line, the totals and the shop name', () => {
  const card = buildCustomerCard({ order, items }, { shopName: 'ร้านนัฐภรณ์ เชียงกลาง' });
  assert.equal(card.type, 'flex');
  assert.match(card.altText, /ORD-2569-00123/);
  assert.match(card.altText, /2,942\.50/);
  assert.equal(card.contents.type, 'bubble');
  const t = allText(card);
  for (const w of ['ร้านนัฐภรณ์ เชียงกลาง', 'ยืนยันคำสั่งซื้อ', 'ORD-2569-00123', 'โรงเรียนบ้านตัวอย่าง', 'กระดาษถ่ายเอกสาร A4 80 แกรม', '×10 รีม', '1,350.00', '×3 โหล', 'รวมเป็นเงิน', 'ภาษีมูลค่าเพิ่ม 7%', 'ยอดรวมทั้งสิ้น', '2,942.50 บาท', 'จัดส่ง', '27 พ.ย. 2569']) {
    assert.ok(t.includes(w), `the customer card shows “${w}”`);
  }
  assert.doesNotMatch(t, /เบอร์|053-000000/, 'the customer card does not repeat the phone number');
});

test('no VAT line when the order has no VAT, and no payment line until the shop writes one', () => {
  const plain = { ...order, vat_rate: 0, vat_amount: 0, total: 2750 };
  const t = allText(buildCustomerCard({ order: plain, items }, { shopName: 'ร้าน' }));
  assert.doesNotMatch(t, /ภาษีมูลค่าเพิ่ม/);
  assert.equal(allText(buildCustomerCard({ order, items }, { shopName: 'ร้าน', payNote: 'พร้อมเพย์ 0812345678' })).includes('พร้อมเพย์ 0812345678'), true);
  assert.equal(allText(buildCustomerCard({ order, items }, { shopName: 'ร้าน', payNote: '' })).includes('พร้อมเพย์'), false);
});

test('a long order is cut at fifteen lines and says how many were left out', () => {
  const many = Array.from({ length: 18 }, (_, i) => ({ seq: i + 1, name: `สินค้า ${i + 1}`, qty: 1, unit: 'ชิ้น', unit_price: 10, line_total: 10 }));
  const t = allText(buildCustomerCard({ order, items: many }, { shopName: 'ร้าน' }));
  assert.ok(t.includes('สินค้า 15'));
  assert.ok(!t.includes('สินค้า 16'));
  assert.ok(t.includes('และอีก 3 รายการ'));
});

test('the team card says who, what and how much, and is titled as a new order', () => {
  const card = buildTeamCard({ order, items }, { shopName: 'ร้านนัฐภรณ์ เชียงกลาง' });
  assert.equal(card.type, 'flex');
  assert.match(card.altText, /^คำสั่งงานใหม่ ORD-2569-00123/);
  const t = allText(card);
  for (const w of ['คำสั่งงานใหม่ ORD-2569-00123', 'โรงเรียนบ้านตัวอย่าง', '053-000000', 'กระดาษถ่ายเอกสาร A4 80 แกรม', '2,942.50 บาท', 'จัดส่ง', 'ส่งของที่โรงเรียน']) {
    assert.ok(t.includes(w), `the team card shows “${w}”`);
  }
});

test('money, quantities in the lines and Thai dates are written the way the shop writes them', () => {
  assert.equal(money(2942.5), '2,942.50');
  assert.equal(money(null), '0.00');
  assert.equal(thaiDate('2026-11-04'), '4 พ.ย. 2569');
  assert.equal(thaiDate(''), '');
  assert.match(allText(buildCustomerCard({ order: { ...order, subtotal: 1, total: 1, vat_rate: 0 }, items: [{ name: 'x', qty: 2.5, unit: '', unit_price: 1, line_total: 2.5 }] }, {})), /×2\.5/);
});

test('the retry key LINE uses is a UUID, the same for the same order and person, and different for another one', () => {
  const a = retryKeyFor('team', 'o1', 'U1');
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(retryKeyFor('team', 'o1', 'U1'), a);
  assert.notEqual(retryKeyFor('team', 'o1', 'U2'), a);
  assert.notEqual(retryKeyFor('team', 'o2', 'U1'), a);
});
