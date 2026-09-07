import { test } from 'node:test';
import assert from 'node:assert/strict';
import { receiptFlex } from '../src/flex/receiptFlex.js';
import { formatBaht } from '../src/utils/currency.js';

const job = {
  job_name: 'งานพิมพ์ / ป้ายโฆษณา',
  job_number: 'MJ-20260907-0001',
  job_date: '2026-09-07',
  created_at: '2026-09-07T03:25:00.000Z',
  customer_name: 'พี่นก',
  total: 400,
  paid_amount: 0,
  balance_due: 400,
  payment_status: 'pending',
  items: [
    { item_name: 'ป้ายไวนิล', size: '60x100', quantity: 1, unit: null, unit_price: 150, total: 150 },
    { item_name: 'โฟมบอร์ด', size: '40x60', quantity: 1, unit: null, unit_price: 250, total: 250 },
  ],
};

test('receipt card: structure, content and actions', () => {
  const msg = receiptFlex(job, { heroImageUrl: undefined });
  assert.equal(msg.type, 'flex');
  assert.equal(msg.contents.type, 'bubble');
  assert.equal(msg.contents.size, 'mega');
  assert.equal(msg.contents.hero, undefined); // no hero without a URL

  const json = JSON.stringify(msg);
  assert.ok(json.includes('บันทึกสำเร็จ'));
  assert.ok(json.includes('งานพิมพ์ / ป้ายโฆษณา'));
  assert.ok(json.includes('ป้ายไวนิล 60x100'));
  assert.ok(json.includes('1 ชิ้น'));
  assert.ok(json.includes(formatBaht(400)));
  assert.ok(json.includes('ลูกค้า: พี่นก'));
  assert.ok(json.includes('action=today_summary'));
  assert.ok(json.includes('action=record_payment'));
});

test('receipt card: optional mascot / hero images and partial-payment rows', () => {
  const withHero = receiptFlex(job, { heroImageUrl: 'https://example.com/hero.png' });
  assert.equal(withHero.contents.hero?.url, 'https://example.com/hero.png');

  const withMascot = receiptFlex(job, { mascotImageUrl: 'https://example.com/dog.png' });
  assert.ok(JSON.stringify(withMascot).includes('https://example.com/dog.png'));
  const noMascot = receiptFlex(job, { mascotImageUrl: null, heroImageUrl: undefined });
  assert.ok(!JSON.stringify(noMascot).includes('"type":"image"'));

  const partial = receiptFlex({ ...job, paid_amount: 150, balance_due: 250, payment_status: 'partial' });
  const json = JSON.stringify(partial);
  assert.ok(json.includes('รับแล้ว'));
  assert.ok(json.includes('คงเหลือ'));
});
