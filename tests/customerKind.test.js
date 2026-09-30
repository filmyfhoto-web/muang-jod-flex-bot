import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { customerKind, kindMeta, JOB_KINDS } from '../src/utils/customerKind.js';
import { isOrgCustomer } from '../src/utils/nlParser.js';

const page = readFileSync(new URL('../public/liff/index.html', import.meta.url), 'utf8');

/* ร้านขอ "แยกงานโรงเรียนกับงานทั่วไปให้หน่อย ฟีลแบบ เก็บเงินสดหน้าร้านแล้ว
 * แล้วก็ลงบัญชี" — สองประโยคนี้บอกทั้งการแบ่งและเหตุผลของการแบ่ง
 *
 *   หน่วยงาน = สั่งแล้วเอาของไปก่อน วางบิลไว้ ต้องตามเก็บและออกใบเสร็จ
 *   หน้าร้าน  = จ่ายสด รับของกลับ จบ เหลือแค่ลงบัญชี
 */

// ลูกค้าจริงของร้าน ที่เห็นในคิวงานและในแชต
const ORGS = ['รรสบกอน', 'โรงเรียนบ้านปงสนุก', 'โรงเรียนเจดีย์', 'ธกส ทุ่งช้าง', 'วัดบ้านชี', 'อบต.นาดี', 'รพสตบ้านชี'];
const WALKINS = ['พี่ต่าย', 'น้องป่าน', 'คุณแอน', 'ครูแดง', 'พี่นก', 'น้าปิ่ม', 'พี่ยงค์ ร้านไข่'];

test('แยกลูกค้าหน่วยงานออกจากลูกค้าหน้าร้านได้', () => {
  for (const name of ORGS) assert.equal(customerKind(name), 'org', name);
  for (const name of WALKINS) assert.equal(customerKind(name), 'walkin', name);

  // ไม่ได้ใส่ชื่อ = ขายหน้าร้าน ซึ่งเป็นเรื่องปกติของงานที่จ่ายสดแล้วจบ
  assert.equal(customerKind(''), 'walkin');
  assert.equal(customerKind(null), 'walkin');
  assert.equal(customerKind(undefined), 'walkin');

  // รับตัวงานทั้งใบก็ได้ ไม่ใช่แค่ชื่อ
  assert.equal(customerKind({ customer_name: 'โรงเรียนบ้านหนอง' }), 'org');
  assert.equal(customerKind({ customer_name: 'พี่ต่าย' }), 'walkin');
  assert.equal(customerKind({}), 'walkin');
});

/* "ธกส ทุ่งช้าง" อยู่ในคิวงานของร้านมาตลอด แต่ไม่เคยถูกอ่านว่าเป็นหน่วยงาน
 *
 * ถ้าไม่เพิ่มเข้าไป งานของ ธกส จะไปกองรวมกับลูกค้าหน้าร้าน ทั้งที่เป็นงานที่
 * ต้องวางบิลและออกใบเสร็จ
 */
test('หน่วยงานที่ร้านนี้ออกใบเสร็จให้จริง อยู่ในลิสต์ครบ', () => {
  for (const name of ['ธกส ทุ่งช้าง', 'ธ.ก.ส. สาขาน่าน', 'สหกรณ์การเกษตร', 'กศน.ตำบล']) {
    assert.equal(isOrgCustomer(name), true, name);
  }
});

/* คำนำหน้าต้องอยู่ต้นชื่อเท่านั้น
 *
 * ภาษาไทยไม่เว้นวรรค ถ้าจับกลางชื่อ "พี่ยงค์ ร้านไข่" จะกลายเป็นหน่วยงาน
 * ทั้งที่เป็นคนที่เดินมาซื้อของแล้วจ่ายสด
 */
test('คำนำหน้าหน่วยงานที่อยู่กลางชื่อ ไม่นับ', () => {
  assert.equal(customerKind('พี่ยงค์ ร้านไข่'), 'walkin');
  assert.equal(customerKind('ร้านไข่'), 'org', 'ขึ้นต้นด้วยร้าน = ร้านค้าด้วยกัน');

  // คำที่มีตัวอักษรของคำนำหน้าอยู่ข้างใน ต้องไม่โดนจับ
  assert.equal(isOrgCustomer('ธรรมชาติ'), false);
  assert.equal(isOrgCustomer('กรรไกร'), false);
});

/* กติกานี้ถูกเขียนไว้สองที่ — ฝั่งเซิร์ฟเวอร์กับในหน้าเว็บ
 *
 * หน้าเว็บโหลดเป็นไฟล์เดียวไม่มีตัวรวมโมดูล จึง import จาก src/ ไม่ได้ แต่ถ้า
 * สองที่ตอบไม่ตรงกัน งานเดียวกันจะอยู่คนละกองแล้วแต่ว่าถามจากตรงไหน
 */
test('กติกาในหน้าเว็บ ตอบตรงกับฝั่งเซิร์ฟเวอร์ทุกชื่อ', () => {
  const m = /const ORG_RE = (\/\^.*?\/);/.exec(page);
  assert.ok(m, 'หากติกาในหน้าเว็บไม่เจอ');
  const pageRe = new RegExp(m[1].slice(1, -1));
  const pageKind = (name) => (pageRe.test(String(name || '').trim()) ? 'org' : 'walkin');

  for (const name of [...ORGS, ...WALKINS, '', 'ธ.ก.ส. สาขาน่าน', 'สหกรณ์การเกษตร', 'กศน.ตำบล', 'ธรรมชาติ', 'ร้านไข่']) {
    assert.equal(pageKind(name), customerKind(name), `หน้าเว็บกับเซิร์ฟเวอร์ตอบไม่ตรงกัน: ${name}`);
  }
});

test('ป้ายชื่อสองแบบ มีครบและเรียงถูก', () => {
  assert.deepEqual(JOB_KINDS.map((k) => k.id), ['org', 'walkin']);
  assert.equal(kindMeta('org').label, 'หน่วยงาน');
  assert.equal(kindMeta('walkin').label, 'หน้าร้าน');
  // ไม่รู้จัก = หน้าร้าน ซึ่งเป็นค่าที่ปลอดภัยกว่า (ไม่ไปสัญญาว่าจะออกใบเสร็จ)
  assert.equal(kindMeta('มั่ว').id, 'walkin');
});

/* หน้าแก้ไขถามเท่าที่จำเป็นกับลูกค้าแบบนั้น
 *
 * ร้านบอกว่า "ไม่ต้องกรอกเยอะ บางทีไม่มีเวลากรอกเอง" — ของเดิมถามสิบเอ็ดช่อง
 * ทุกใบไม่ว่างานแบบไหน
 */
test('หน้าแก้ไขแยกสองแบบ และพับของที่ไม่ต้องกรอก', () => {
  assert.match(page, /id="e-kind"/, 'ไม่มีปุ่มเลือกว่าลูกค้าแบบไหน');
  assert.match(page, /data-k="org"/);
  assert.match(page, /data-k="walkin"/);

  // ช่องที่มีเฉพาะงานหน่วยงาน: สถานะการเงิน · รับมาแล้ว · วันนัดรับ
  const org = page.slice(page.indexOf('<div data-kind="org">'), page.indexOf('id="e-items"'));
  for (const id of ['e-status', 'e-paid', 'e-due']) {
    assert.ok(org.includes(id), `${id} ควรอยู่เฉพาะฝั่งหน่วยงาน`);
  }

  // ของที่ม่วงเดาให้ถูกอยู่แล้ว พับไว้
  const more = page.slice(page.indexOf('<details id="e-more">'), page.indexOf('</details>'));
  for (const id of ['e-group', 'e-type', 'e-date', 'e-mine', 'e-note']) {
    assert.ok(more.includes(id), `${id} ควรถูกพับไว้ใน "ตัวเลือกเพิ่มเติม"`);
  }

  // ติ๊กเดียวแทนการกรอกสถานะ + ช่องรับมาแล้ว
  assert.match(page, /id="e-cash"/);
  assert.match(page, /function syncCash\(\)/);
  assert.match(page, /setStatus\(on \? 'paid' : 'pending'\)/, 'ติ๊กแล้วไม่ได้ตั้งสถานะให้');
});

test('คิวงานแบ่งกองตามลูกค้าสองแบบได้', () => {
  assert.match(page, /data-g="kind"/, 'ไม่มีปุ่มแบ่งตามลูกค้า');
  assert.match(page, /const byKind = \(list, done\) =>/);
  assert.match(page, /saved === 'kind'/, 'เลือกไว้แล้วเปิดมาใหม่ไม่อยู่ที่เดิม');
});
