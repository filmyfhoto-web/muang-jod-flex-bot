import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('receipt card: edit opens the LIFF form, delete asks the bot first', () => {
  const withLiff = receiptFlex(
    { ...job, id: 'job-1' },
    { editUrl: 'https://liff.line.me/1234567890-abcdefgh?edit=job-1', mascotImageUrl: null, heroImageUrl: undefined }
  );
  const json = JSON.stringify(withLiff);
  assert.ok(json.includes('"uri":"https://liff.line.me/1234567890-abcdefgh?edit=job-1"'));
  assert.ok(json.includes('action=delete_job&jobId=job-1'));

  // No LIFF configured: the edit button falls back to a postback the chat answers.
  const noLiff = receiptFlex({ ...job, id: 'job-1' }, { editUrl: null, mascotImageUrl: null });
  assert.ok(JSON.stringify(noLiff).includes('action=edit_job&jobId=job-1'));

  // A preview (unsaved) job has no id, so no edit/delete buttons at all.
  const unsaved = receiptFlex(job, { editUrl: null, mascotImageUrl: null });
  assert.ok(!JSON.stringify(unsaved).includes('delete_job'));
});

test('receipt card: structure, content and actions', () => {
  const msg = receiptFlex(job, { heroImageUrl: undefined });
  assert.equal(msg.type, 'flex');
  assert.equal(msg.contents.type, 'bubble');
  assert.equal(msg.contents.size, 'mega');
  assert.equal(msg.contents.hero, undefined); // nothing to point at, so no hero

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

// สัดส่วนจริงของแถบมาสคอต อ่านจากหัวไฟล์ PNG (IHDR)
function heroRatio() {
  const buf = readFileSync(new URL('../public/brand/ui/card-hero.png', import.meta.url));
  return buf.readUInt32BE(16) / buf.readUInt32BE(20);
}

// "20:5" -> 4 — เทียบเป็นตัวเลข เพราะ 20:5 กับ 4:1 คือสัดส่วนเดียวกัน
function declaredRatio(aspectRatio) {
  const [w, h] = String(aspectRatio).split(':').map(Number);
  return w / h;
}

test('receipt card: the mascot strip is the hero unless something else is chosen', () => {
  // Flex cannot let an image overflow its bubble, so the mascot resting on the
  // card's rim is a pre-rendered strip served from the bot's own /brand.
  const prev = process.env.PUBLIC_BASE_URL;
  process.env.PUBLIC_BASE_URL = 'https://bot.example.com';
  try {
    const msg = receiptFlex(job);
    assert.equal(msg.contents.hero?.url, 'https://bot.example.com/brand/ui/card-hero.png');
    // The ratio has to match the strip that was actually drawn, or LINE crops
    // the mascot's head off. Read it from the file rather than trusting a
    // number typed here.
    assert.equal(
      declaredRatio(msg.contents.hero.aspectRatio),
      heroRatio(),
      `hero declares ${msg.contents.hero.aspectRatio}, but the strip is not that shape`
    );

    // An explicit null still means "no hero at all".
    assert.equal(receiptFlex(job, { heroImageUrl: null }).contents.hero, undefined);
    // And an override still wins over the default.
    assert.equal(
      receiptFlex(job, { heroImageUrl: 'https://example.com/other.png' }).contents.hero.url,
      'https://example.com/other.png'
    );
  } finally {
    if (prev === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = prev;
  }
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
