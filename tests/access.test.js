import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  allowedUserIds,
  accessEnabled,
  hasMalformedIds,
  isAllowed,
  isMyIdCommand,
} from '../src/utils/access.js';

const OWNER = 'U' + '0'.repeat(31) + '1';
const HELPER = 'U' + 'a'.repeat(32);
const STRANGER = 'U' + 'f'.repeat(32);

test('ยังไม่ได้ตั้งรายชื่อ = ใช้ได้เหมือนเดิม ไม่ล็อกใครออก', () => {
  /* ถ้าค่าว่างแปลว่า "ปิดทุกคน" การ deploy ที่ตกตัวแปรนี้จะล็อกเจ้าของออกจาก
   * บอทตัวเอง โดยไม่มีทางกลับเข้าไปแก้ — เสียหายกว่าการเปิดค้างหนึ่งรอบ deploy
   */
  for (const env of [{}, { ALLOWED_LINE_USER_IDS: '' }, { ALLOWED_LINE_USER_IDS: '   ' }]) {
    assert.ok(isAllowed(OWNER, env));
    assert.ok(isAllowed(STRANGER, env));
    assert.equal(accessEnabled(env), false);
  }
});

test('ตั้งรายชื่อแล้ว เฉพาะคนในรายชื่อเท่านั้นที่เข้าได้', () => {
  const env = { ALLOWED_LINE_USER_IDS: `${OWNER},${HELPER}` };
  assert.ok(isAllowed(OWNER, env));
  assert.ok(isAllowed(HELPER, env));
  assert.ok(!isAllowed(STRANGER, env));
  assert.ok(!isAllowed('', env));
  assert.ok(!isAllowed(null, env));
  assert.ok(accessEnabled(env));
});

test('คั่นด้วยอะไรก็ได้ที่คนพิมพ์จริง และตัวพิมพ์ใหญ่เล็กไม่สำคัญ', () => {
  // ช่องใน Render เป็นช่องเดียวบรรทัดเดียว คนวางทีละ id ต่อบรรทัดก็มี
  for (const sep of [',', ' ', ', ', '\n', ';', '  ,  ']) {
    const env = { ALLOWED_LINE_USER_IDS: `${OWNER}${sep}${HELPER}` };
    assert.deepEqual(allowedUserIds(env), [OWNER, HELPER], JSON.stringify(sep));
  }
  assert.ok(isAllowed(HELPER.toUpperCase(), { ALLOWED_LINE_USER_IDS: HELPER }));
});

test('ค่าที่ไม่ใช่ id จริง ถูกทิ้ง และบอกได้ว่าพิมพ์ผิดทั้งชุด', () => {
  // กรอกชื่อเล่นแทน id แล้วรายชื่อจะไม่มีวันตรงกับใคร = ล็อกตัวเองออกเงียบ ๆ
  const typo = { ALLOWED_LINE_USER_IDS: 'filmy, นัฐภรณ์' };
  assert.deepEqual(allowedUserIds(typo), []);
  assert.ok(hasMalformedIds(typo));
  assert.ok(!hasMalformedIds({ ALLOWED_LINE_USER_IDS: OWNER }));
  assert.ok(!hasMalformedIds({}));

  // ปนกันก็ยังเอาเฉพาะตัวที่ใช้ได้
  assert.deepEqual(allowedUserIds({ ALLOWED_LINE_USER_IDS: `filmy ${OWNER}` }), [OWNER]);
});

test('ซ้ำกันในรายชื่อ นับครั้งเดียว', () => {
  assert.deepEqual(allowedUserIds({ ALLOWED_LINE_USER_IDS: `${OWNER},${OWNER}` }), [OWNER]);
});

test('"รหัสของฉัน" ต้องถามได้หลายแบบ', () => {
  for (const text of ['รหัสของฉัน', 'ไอดีของฉัน', 'ขอไอดีหน่อย', 'my id', 'MyID', 'user id', 'line id ค่ะ']) {
    assert.ok(isMyIdCommand(text), text);
  }
  for (const text of ['รหัสของลูกค้า', 'ป้ายไวนิล 150', '', 'ไอดีของเขา']) {
    assert.ok(!isMyIdCommand(text), text);
  }
});
