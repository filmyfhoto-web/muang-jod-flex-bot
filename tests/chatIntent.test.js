import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChatIntent } from '../src/utils/chatIntent.js';
import { billJobsFlex } from '../src/flex/billFlex.js';

test('the bot answers when it is spoken to, not only commanded', () => {
  for (const said of [
    'ม่วง จดงานให้หน่อย',
    'ม่วงจดงานให้หน่อย',
    'จดงานให้หน่อย',
    'ช่วยจดงานที',
    'ม่วงจดให้หน่อย',
    'ม่วง จดงานให้หน่อยค่ะ',
  ]) {
    assert.deepEqual(parseChatIntent(said), { kind: 'start_job' }, said);
  }
});

test('a customer named first is held for the work that follows', () => {
  assert.deepEqual(parseChatIntent('ชื่อลูกค้า ผู้ใหญ่สมศรี'), {
    kind: 'set_customer',
    customerName: 'ผู้ใหญ่สมศรี',
    rest: null,
  });

  for (const said of ['ลูกค้า ป้านวล', 'ลูกค้าชื่อ ป้านวล', 'งานของ ป้านวล']) {
    assert.equal(parseChatIntent(said)?.customerName, 'ป้านวล', said);
  }

  // An organisation is a customer too.
  assert.equal(parseChatIntent('ลูกค้า โรงเรียนบ้านหนอง')?.customerName, 'โรงเรียนบ้านหนอง');

  // A name with no honorific still works.
  assert.deepEqual(parseChatIntent('ชื่อลูกค้า สมศรี'), {
    kind: 'set_customer',
    customerName: 'สมศรี',
    rest: null,
  });
});

test('name and work in one message keeps both', () => {
  // Splitting on word count made the customer "ผู้ใหญ่สมศรี ป้ายไวนิล".
  assert.deepEqual(parseChatIntent('ชื่อลูกค้า ผู้ใหญ่สมศรี ป้ายไวนิล 500 บาท'), {
    kind: 'set_customer',
    customerName: 'ผู้ใหญ่สมศรี',
    rest: 'ป้ายไวนิล 500 บาท',
  });
  assert.deepEqual(parseChatIntent('ชื่อลูกค้า สมศรี ป้ายไวนิล 500'), {
    kind: 'set_customer',
    customerName: 'สมศรี',
    rest: 'ป้ายไวนิล 500',
  });
});

test('ordinary job text is left alone', () => {
  // The chat layer runs beside the job parser, so anything it swallows by
  // mistake is a job the shop typed and did not get.
  for (const said of [
    'ป้ายไวนิล 60x100 150 บาท',
    'ป้ายหน้าร้าน 300',
    'ไวนิล 160x300 ตรมละ 165',
    'สวัสดี',
    'ม่วง',
    '',
  ]) {
    assert.equal(parseChatIntent(said), null, said);
  }
});

const jobs = [
  { id: 'j1', job_name: 'ป้ายไวนิล หน้าร้าน', job_date: '2026-09-10', total: 500 },
  { id: 'j2', job_name: 'โฟมบอร์ด', job_date: '2026-09-11', total: 300 },
  { id: 'j3', job_name: 'สติ๊กเกอร์', job_date: '2026-09-12', total: 200 },
];

test('a customer with several jobs gets a choice, not one lumped bill', () => {
  const json = JSON.stringify(billJobsFlex('ผู้ใหญ่สมศรี', jobs));

  // Each job can be billed on its own…
  for (const j of jobs) {
    assert.ok(json.includes(`action=bill_job&jobId=${j.id}`), `${j.job_name} is not billable on its own`);
    assert.ok(json.includes(j.job_name), `${j.job_name} missing`);
  }
  // …and combining them is still there, as a choice.
  assert.ok(json.includes(`action=bill_all&customer=${encodeURIComponent('ผู้ใหญ่สมศรี')}`));
  assert.ok(json.includes('รวมทุกงาน (3)'));

  // The header says whose jobs these are and what they come to.
  assert.ok(json.includes('ผู้ใหญ่สมศรี'));
  assert.ok(json.includes('฿1,000'));
});

test('a job with no customer name still bills', () => {
  const json = JSON.stringify(billJobsFlex(null, jobs));
  assert.ok(json.includes('ไม่ระบุลูกค้า'));
  // An empty customer round-trips as "" — the picker and the biller agree on it.
  assert.ok(json.includes('action=bill_all&customer='));
});

// --- what the parser leaves behind ------------------------------------------

test('a stray separator is not part of the item name', async () => {
  const { parseNaturalJob } = await import('../src/utils/nlParser.js');
  // "ไวนิล = 0.80X1.80 165" put the "=" in the name once the numbers went.
  const d = parseNaturalJob('ไวนิล = 0.80X1.80 165');
  assert.equal(d.items[0].item_name, 'ไวนิล');
  assert.equal(d.total, 165);
});

test('a unit orphaned by the size is dropped, but real names survive', async () => {
  const { parseNaturalJob } = await import('../src/utils/nlParser.js');
  // The size moves to its own field, so the "ซม." left behind is not a name.
  const d = parseNaturalJob('ผู้ใหญ่สมศรี สั่งป้ายไวนิล 200x100 ซม. 330 บาท');
  assert.equal(d.customerName, 'ผู้ใหญ่สมศรี');
  assert.equal(d.items[0].item_name, 'สั่งป้ายไวนิล');
  assert.equal(d.items[0].size, '200x100');

  // Matched as whole tokens only: a blind strip of "ม" makes โฟมบอร์ด into
  // โฟบอร์ด, which is the kind of fix that is worse than the bug.
  assert.equal(parseNaturalJob('โฟมบอร์ด 40x60 ซม. 250 บาท').items[0].item_name, 'โฟมบอร์ด');
});

test('a unit the parser does not know undercharges the shop', async () => {
  const { parseNaturalJob } = await import('../src/utils/nlParser.js');
  // "ดวง" was missing, so twenty stickers at 15 each billed as one at 15.
  const d = parseNaturalJob('สติ๊กเกอร์ไดคัท 20 ดวง ดวงละ 15');
  assert.equal(d.items[0].quantity, 20);
  assert.equal(d.items[0].unit, 'ดวง');
  assert.equal(d.total, 300);

  // The units that already worked still do.
  const signs = parseNaturalJob('ป้ายไวนิล 2 ป้าย ป้ายละ 500');
  assert.equal(signs.items[0].quantity, 2);
  assert.equal(signs.total, 1000);
});

test('area pricing keeps its own size label', async () => {
  const { parseNaturalJob } = await import('../src/utils/nlParser.js');
  // The leftover-unit strip must not reach into the size field, which is
  // deliberately written as "160 × 300 ซม.".
  const d = parseNaturalJob('ไวนิล 160x300 ตรมละ 165');
  assert.equal(d.items[0].item_name, 'ไวนิล');
  assert.equal(d.items[0].size, '160 × 300 ซม.');
  assert.equal(d.total, 792);
});
