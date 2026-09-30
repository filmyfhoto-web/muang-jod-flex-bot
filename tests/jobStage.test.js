import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jobStage, stagePatch, JOB_STAGES } from '../src/utils/jobState.js';

/* ร้านเขียนสี่ขั้นนี้มาเอง:
 *   งานส่วนไหน  เสร็จแล้ว *รับแล้ว *จ่ายแล้ว *ลงบัญชี *เงินสด
 */

const AT = new Date('2026-09-30T04:05:06.000Z');
const STAMP = AT.toISOString();

test('สี่ขั้น เรียงตามที่ร้านเขียนมา', () => {
  assert.deepEqual(JOB_STAGES.map((s) => s.label), ['ทำเสร็จ', 'ลูกค้ารับ', 'ได้เงิน', 'ลงบัญชี']);
});

test('งานเดินมาถึงขั้นไหน นับจากต้นทางที่ต่อกันมา', () => {
  const total = 960;
  assert.equal(jobStage({ total, balance_due: total }), 0);
  assert.equal(jobStage({ total, balance_due: total, done_at: STAMP }), 1);
  assert.equal(jobStage({ total, balance_due: total, done_at: STAMP, picked_up_at: STAMP }), 2);
  assert.equal(jobStage({ total, balance_due: 0, done_at: STAMP, picked_up_at: STAMP }), 3);
  assert.equal(jobStage({ total, balance_due: 0, done_at: STAMP, picked_up_at: STAMP, booked_at: STAMP }), 4);
});

test('ลูกค้ารับของไปแล้ว แปลว่างานเสร็จแน่ ถึงจะไม่เคยกดปุ่มทำเสร็จ', () => {
  // งานเก่าทุกใบที่จดไว้ก่อนมี done_at — ถ้าไม่นับให้ จะถอยกลับไปขั้น 0 ทั้งหมด
  assert.equal(jobStage({ total: 500, balance_due: 500, picked_up_at: STAMP }), 2);
  assert.equal(jobStage({ total: 500, balance_due: 0, picked_up_at: STAMP }), 3);
});

test('จ่ายล่วงหน้าแต่ยังไม่มารับ ยังอยู่ขั้นทำเสร็จ เพราะของยังไม่ออกจากร้าน', () => {
  const job = { total: 1000, paid_amount: 1000, balance_due: 0, done_at: STAMP };
  assert.equal(jobStage(job), 1);
});

test('งานที่ยังไม่มียอด ไม่นับว่าได้เงินแล้ว', () => {
  // total 0 = ยังไม่ได้ใส่ราคา ไม่ใช่ "เก็บครบแล้ว"
  assert.equal(jobStage({ total: 0, balance_due: 0, done_at: STAMP, picked_up_at: STAMP }), 2);
});

test('แตะช่องไหน งานเดินถึงขั้นนั้นพอดี ไม่เกินไม่ขาด', () => {
  const job = { total: 960, paid_amount: 0, balance_due: 960 };

  assert.deepEqual(stagePatch(job, 1, AT), { done_at: STAMP, picked_up_at: null, booked_at: null });

  assert.deepEqual(stagePatch(job, 2, AT), { done_at: STAMP, picked_up_at: STAMP, booked_at: null });

  assert.deepEqual(stagePatch(job, 3, AT), {
    done_at: STAMP, picked_up_at: STAMP, booked_at: null,
    paid_amount: 960, balance_due: 0, payment_status: 'paid',
  });

  assert.deepEqual(stagePatch(job, 4, AT), {
    done_at: STAMP, picked_up_at: STAMP, booked_at: STAMP,
    paid_amount: 960, balance_due: 0, payment_status: 'paid',
  });
});

test('ถอยกลับ ล้างเฉพาะขั้นที่ถอยพ้น ไม่ลบเวลาที่ลงไว้แล้วของขั้นก่อน', () => {
  const job = { total: 960, paid_amount: 960, balance_due: 0, payment_status: 'paid',
                done_at: '2026-09-27T01:00:00.000Z', picked_up_at: '2026-09-28T02:00:00.000Z', booked_at: STAMP };

  // ถอยจาก "ลงบัญชี" มาที่ "ได้เงิน" — เวลาที่ทำเสร็จและมารับยังเป็นของเดิม
  const back = stagePatch(job, 3, AT);
  assert.equal(back.done_at, '2026-09-27T01:00:00.000Z');
  assert.equal(back.picked_up_at, '2026-09-28T02:00:00.000Z');
  assert.equal(back.booked_at, null);
  assert.equal(back.paid_amount, undefined); // จ่ายครบอยู่แล้ว ไม่ต้องแตะ
});

test('ถอยพ้น "ได้เงินแล้ว" ต้องบอกว่ายังไม่ได้เงินจริง ๆ ไม่ใช่แค่ป้าย', () => {
  const job = { total: 960, paid_amount: 960, balance_due: 0, payment_status: 'paid',
                done_at: STAMP, picked_up_at: STAMP };

  const back = stagePatch(job, 2, AT);
  assert.equal(back.paid_amount, 0);
  assert.equal(back.balance_due, 960);
  assert.equal(back.payment_status, 'pending');
  assert.equal(back.picked_up_at, STAMP);
});

test('มัดจำไว้บางส่วน ถอยขั้นแล้วมัดจำไม่หาย', () => {
  const job = { total: 1000, paid_amount: 300, balance_due: 700, payment_status: 'partial', done_at: STAMP };

  const back = stagePatch(job, 1, AT);
  assert.equal(back.paid_amount, 300);
  assert.equal(back.balance_due, 700);
  assert.equal(back.payment_status, 'partial');
});

test('ถอยกลับไปขั้น 0 = ยังไม่ได้เริ่ม ล้างทุกเวลา', () => {
  const job = { total: 500, paid_amount: 500, balance_due: 0, payment_status: 'paid',
                done_at: STAMP, picked_up_at: STAMP, booked_at: STAMP };
  assert.deepEqual(stagePatch(job, 0, AT), {
    done_at: null, picked_up_at: null, booked_at: null,
    paid_amount: 0, balance_due: 500, payment_status: 'pending',
  });
});

test('ขั้นที่ไม่มีจริง ไม่ทำอะไรเลย', () => {
  const job = { total: 100 };
  // null และ '' ต้องไม่แปลว่า "ขั้น 0" — คำขอที่ไม่ได้บอกขั้น ต้องไม่กลายเป็น
  // คำสั่งถอยงานกลับจุดเริ่มต้นแล้วลบเวลาที่ลงไว้ทิ้ง
  for (const bad of [-1, 5, 1.5, 'สาม', null, undefined, NaN, '', ' ', true, false, {}, []]) {
    assert.equal(stagePatch(job, bad, AT), null, String(bad));
  }
});

test('ขั้นที่คิดได้ ตรงกับขั้นที่เพิ่งสั่งให้ไป', () => {
  // ถ้าสองอันนี้ไม่ตรงกัน ตารางจะเด้งกลับที่เดิมทุกครั้งที่กด
  const job = { total: 960, paid_amount: 0, balance_due: 960 };
  for (let want = 0; want <= 4; want += 1) {
    assert.equal(jobStage({ ...job, ...stagePatch(job, want, AT) }), want, `ขั้น ${want}`);
  }
});
