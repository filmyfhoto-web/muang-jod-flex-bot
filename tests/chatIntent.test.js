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
