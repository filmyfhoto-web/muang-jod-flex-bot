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

// Every image url in a bubble, so a test can count the dogs.
function imageUrls(node, out = []) {
  if (Array.isArray(node)) node.forEach((n) => imageUrls(n, out));
  else if (node && typeof node === 'object') {
    if (node.type === 'image' && node.url) out.push(node.url);
    Object.values(node).forEach((v) => v && typeof v === 'object' && imageUrls(v, out));
  }
  return out;
}

test('receipt card: the dog appears once, and no hero strip', () => {
  // The hero strip carries the same dog as the mascot in the panel below it,
  // so keeping both showed the dog twice — and the strip is a dark-navy asset
  // from the old dark theme, a black band cut through a white card.
  const prev = process.env.PUBLIC_BASE_URL;
  process.env.PUBLIC_BASE_URL = 'https://bot.example.com';
  try {
    const msg = receiptFlex(job);
    assert.equal(msg.contents.hero, undefined, 'no hero strip');

    const dogs = imageUrls(msg.contents);
    assert.equal(dogs.length, 1, `expected one mascot, got ${dogs.length}: ${dogs.join(', ')}`);
    assert.ok(!dogs.some((u) => u.includes('card-hero')), 'the dark hero strip is gone');

    // A caller that wants a hero back can still pass one.
    assert.equal(
      receiptFlex(job, { heroImageUrl: 'https://example.com/other.png' }).contents.hero.url,
      'https://example.com/other.png'
    );
    assert.equal(receiptFlex(job, { heroImageUrl: null }).contents.hero, undefined);
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


test('the receipt carries the day\'s running total, and never invents one', () => {
  const json = (opts) => JSON.stringify(receiptFlex(job, opts));

  // "Saved" alone does not say where you are. The tally is what does.
  const tallied = json({ today: { date: '2026-09-09', jobCount: 3, total: 1250, paid: 850, pending: 400 } });
  assert.ok(tallied.includes('วันนี้จดไปแล้ว 3 งาน'));
  assert.ok(tallied.includes('฿1,250'));
  assert.ok(tallied.includes('ยังค้างรับ ฿400'));

  // Nothing outstanding: no line about it.
  const clear = json({ today: { date: '2026-09-09', jobCount: 1, total: 150, paid: 150, pending: 0 } });
  assert.ok(clear.includes('วันนี้จดไปแล้ว 1 งาน'));
  assert.ok(!clear.includes('ยังค้างรับ'));

  // A tally that could not be read is left off rather than shown as zero —
  // "0 งาน" under a job you just saved is a card contradicting itself.
  for (const opts of [{}, { today: null }, { today: { jobCount: 0, total: 0 } }]) {
    assert.ok(!json(opts).includes('วันนี้จดไปแล้ว'), JSON.stringify(opts));
  }
});
