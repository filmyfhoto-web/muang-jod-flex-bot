import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitDump } from '../src/utils/dumpSplit.js';
import { draftsFrom } from '../src/actions/saveDump.js';

/* ร้านถามตรง ๆ: "ไม่เห็นแยกงานให้ ถ้าลูกค้า ชื่อ 1 คน สั่ง 3 งาน แยกเฉพาะงาน
 * ให้หน่อยค่ะ จะได้รู้ว่างานไหนเราได้เงินเท่าไหร่"
 *
 * เคสจริงจาก production: คุณพ่อจม ฿1,300 ถูกเก็บเป็น "งานเดียวสามรายการ"
 * (ป้าย 200 + กรอบ 800 + ป้าย 300) — เปิดสมุดแล้วไม่รู้ว่าป้ายได้เท่าไหร่
 * กรอบได้เท่าไหร่ และเลขงาน/หมวด/สถานะเงินมีชุดเดียวทั้งที่เป็นคนละงาน
 *
 * เส้นแบ่ง "หลายงาน" ต้องไม่กลืนใบสั่งโรงเรียน (โฟมบอร์ดสี่ชิ้น ชิ้นละบรรทัด
 * คือใบเดียว) — จึงแยกเฉพาะกองที่ไม่มีหัววัสดุ และบรรทัดราคาเป็นของคนละชนิดจริง
 */

test('ลูกค้าคนเดียวสั่งสามงานคนละชนิด แยกเป็นสามใบ เงินครบ', () => {
  const { jobs, total } = splitDump('คุณพ่อจม\nป้ายไวนิล 200\nกรอบรูป 12*18 นิ้ว 800\nป้ายอลูมิเนียม 300');

  assert.equal(jobs.length, 3, 'ยังถูกยุบเป็นงานเดียวอยู่');
  assert.deepEqual(jobs.map((j) => j.customerName), ['คุณพ่อจม', 'คุณพ่อจม', 'คุณพ่อจม']);
  assert.deepEqual(jobs.map((j) => j.total), [200, 800, 300], 'เงินรายงานไม่ตรงกับที่ร้านพิมพ์');
  assert.equal(total, 1300, 'แยกแล้วเงินรวมต้องเท่าเดิม');

  // แต่ละใบถือรายการของตัวเองใบละชิ้น ไม่ใช่สามรายการกองในใบแรก
  for (const job of jobs) assert.equal(job.items.length, 1);

  // ร่างที่ลงฐานข้อมูลได้สามใบจริง ชื่อลูกค้าติดครบทุกใบ
  const drafts = draftsFrom(jobs, '2026-10-13');
  assert.equal(drafts.length, 3);
  assert.deepEqual(drafts.map((d) => d.total), [200, 800, 300]);
  assert.deepEqual([...new Set(drafts.map((d) => d.customerName))], ['คุณพ่อจม']);
});

test('มัดจำกับวิธีจ่ายที่พิมพ์ในบรรทัดไหน ติดใบนั้น ไม่ปนใบอื่น', () => {
  const { jobs } = splitDump('แม่บัวคำ\nป้ายไวนิล 350 มัดจำ 100\nกรอบรูป 600 โอนแล้ว');

  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].paidAmount, 100, 'มัดจำของป้ายหาย');
  assert.equal(jobs[1].paidAmount, 600, '"โอนแล้ว" = ใบนั้นจ่ายครบ');
  assert.equal(jobs[1].payMethod, 'transfer');
  assert.equal(jobs[0].payMethod, null, 'วิธีจ่ายของใบหนึ่งไหลไปอีกใบ');
});

/* สามด่านที่ห้ามแยก — แยกแล้วต้องเดาเงินหรือฉีกใบสั่งของเขา (V2 §4) */

test('มีหัววัสดุทั้งกอง = ใบสั่งใบเดียว ไม่แยก', () => {
  const { jobs, total } = splitDump('รร สบกอน\nโฟมบอร์ด\nรูปครูยิ้ม 1*1.5*700*2=2,100\nป้ายเกษียณ 1.2*1.7*600*2=2,448');

  assert.equal(jobs.length, 1, 'ใบสั่งโรงเรียนถูกฉีกเป็นหลายงาน');
  assert.equal(jobs[0].jobName, 'โฟมบอร์ด');
  assert.equal(jobs[0].items.length, 2);
  assert.equal(total, 4548);
});

test('ของชนิดเดียวกันหลายแบบ = งานเดียวหลายรายการ ("รับพร้อมกัน")', () => {
  const { jobs } = splitDump('แม่สว่าง\nสติ๊กเกอร์ อุทิศให้ 2 แผ่น แผ่นละ 50\nสติ๊กเกอร์ ของชำร่วย 4 แผ่น แผ่นละ 50');

  assert.equal(jobs.length, 1, 'สติ๊กเกอร์สองแบบของงานเดียว ถูกฉีกเป็นสองงาน');
  assert.equal(jobs[0].items.length, 2);
  assert.equal(jobs[0].total, 300);
});

test('ยอดเหมาที่ไม่เท่าผลบวก = ร้านตั้งราคารวมเอง ไม่แยกและใช้ยอดร้าน', () => {
  const { jobs, total } = splitDump('พ่อจม\nป้ายไวนิล 200\nกรอบรูป 800\nเหมารวม 900');

  assert.equal(jobs.length, 1, 'แยกทั้งที่ราคารายใบไม่รู้จริง — ต้องเดาเงิน');
  assert.equal(total, 900, 'ยอดที่ร้านตั้งเองหาย');
  assert.equal(jobs[0].discount, 100, 'ส่วนลดจากยอดเหมาไม่ถูกบันทึก');
});

test('เงินรับลอย ๆ ท้ายกอง = ไม่รู้ของใบไหน ไม่แยก', () => {
  const { jobs } = splitDump('พ่อจม\nป้ายไวนิล 200\nกรอบรูป 800\nมัดจำ 500');

  assert.equal(jobs.length, 1, 'แยกแล้วมัดจำ 500 ต้องเดาว่าเป็นของใบไหน');
  assert.equal(jobs[0].total, 1000);
  assert.equal(jobs[0].paidAmount, 500);
});
