import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { draftGuideItems, withDraftGuide, RATE_CHOICES } from '../src/flex/draftGuide.js';
import { makeDraft, looksLikeBareLink } from '../src/utils/jobDraft.js';
import { getRecentCustomerNames } from '../src/services/jobService.js';

/* ปุ่มใต้การ์ดร่างงาน
 *
 * เดิมมี "ขั้น 1 ปุ่มชื่อลูกค้าที่เคยจด" — ร้านดูจอคอมแล้วสั่ง (25 พ.ย. 69)
 * "เมนูชื่อลูกค้าแบบนี้ไม่เอาค่ะ ฉันอยากให้เมนูแบบริชเมนู" จึงถอดออก:
 * ร่างที่ไม่มีปุ่มของตัวเอง = แถบเมนูหลัก (กระจกริชเมนู) กลับมาแสดงแทน
 * เหลือปุ่มเรตตารางเมตรไว้ (ร้านไม่ได้ติด และกดทีเดียวจบจริง)
 */

const BOARDS = (extra = {}) =>
  makeDraft({
    jobName: 'โฟมบอร์ด',
    items: [
      { item_name: 'บอร์ด 1', size: '120x70 ซม.', quantity: 1, unit_price: 0, total: 0 },
      { item_name: 'บอร์ด 2', size: '120x120 ซม.', quantity: 1, unit_price: 0, total: 0 },
    ],
    ...extra,
  });

test('ไม่มีปุ่มชื่อลูกค้าอีกแล้ว — ร่างไม่มีชื่อก็ได้ปุ่มเรต (ถ้าคิดตามขนาดได้)', () => {
  const items = draftGuideItems(BOARDS());
  assert.deepEqual(items.map((i) => i.action.text), RATE_CHOICES.map((r) => `ตรมละ ${r}`));
  assert.ok(items.every((i) => i.action.type === 'message' && i.action.label.length <= 20));
});

test('รู้ลูกค้าแล้วแต่ไม่มีราคา → ปุ่มเรตตารางเมตรเหมือนเดิม', () => {
  const items = draftGuideItems(BOARDS({ customerName: 'ครูแนน' }));
  assert.deepEqual(items.map((i) => i.action.text), RATE_CHOICES.map((r) => `ตรมละ ${r}`));
});

test('มีราคาแล้ว หรือไม่มีขนาดให้คิด = ไม่มีปุ่มของร่าง (เมนูหลักได้แสดงแทน)', () => {
  const priced = BOARDS({ customerName: 'ครูแนน' });
  priced.total = 1000;
  assert.deepEqual(draftGuideItems(priced), []);

  const noSize = makeDraft({ jobName: 'x', customerName: 'ครูแนน', items: [{ item_name: 'นามบัตร', quantity: 1, unit_price: 0, total: 0 }] });
  assert.deepEqual(draftGuideItems(noSize), []);
});

test('withDraftGuide แนบปุ่มที่ข้อความใบสุดท้าย และไม่ทับปุ่มที่มีอยู่', () => {
  const msgs = [{ type: 'text', text: 'a' }, { type: 'flex', altText: 'b', contents: {} }];
  const out = withDraftGuide(msgs, BOARDS({ customerName: 'ครูแนน' }));
  assert.equal(out.length, 2);
  assert.ok(out[1].quickReply.items.length === RATE_CHOICES.length);
  assert.equal(out[0].quickReply, undefined);

  const own = [{ type: 'text', text: 'a', quickReply: { items: [] } }];
  assert.equal(withDraftGuide(own, BOARDS({ customerName: 'ครูแนน' }))[0].quickReply.items.length, 0);

  const none = [{ type: 'text', text: 'a' }];
  assert.equal(withDraftGuide(none, null), none);
});

/* ร้านวางลิงก์เชิญทีมของ LINE OA ลงแชต แล้วม่วงตีเป็นร่างงาน ฿6 (25 พ.ย. 69)
 * — ลิงก์เพียว ๆ ไม่ใช่งาน แต่งานจริงที่พ่วงลิงก์ไฟล์ต้องยังจดได้ */
test('ลิงก์เพียว ๆ ไม่ใช่งานให้จด — งานจริงที่มีลิงก์พ่วงยังผ่าน', () => {
  assert.ok(looksLikeBareLink('https://manager.line.biz/invitation/HWjV/hQUBagnnfR'));
  assert.ok(looksLikeBareLink('  http://example.com/a?b=1  '));
  assert.ok(looksLikeBareLink('www.example.com/file.pdf'));
  assert.ok(looksLikeBareLink('https://a.co/x https://b.co/y'), 'สองลิงก์ติดกันก็ยังเป็นลิงก์ล้วน');

  assert.ok(!looksLikeBareLink('ป้ายไวนิล 3x1 2 ผืน ไฟล์ https://drive.google.com/abc'), 'งานที่พ่วงลิงก์ไฟล์');
  assert.ok(!looksLikeBareLink('https://drive.google.com/abc ป้ายไวนิล 3x1 ของวัดไชยคำ'), 'ลิงก์นำแต่มีงานตามหลัง');
  assert.ok(!looksLikeBareLink('วัดไชยคำ ป้าย 2 ผืน'));
  assert.ok(!looksLikeBareLink(''));

  // ด่านต้องยืนอยู่ปากทางของตัวอ่านข้อความจริง
  const handler = readFileSync(new URL('../src/handlers/messageHandler.js', import.meta.url), 'utf8');
  assert.ok(handler.includes('if (looksLikeBareLink(text))'));
  assert.ok(handler.includes('ม่วงเลยไม่จดเป็นงานนะคะ'));
});

test('getRecentCustomerNames: ไม่ซ้ำ เรียงล่าสุดก่อน ข้ามชื่อว่าง และล้มเหลว = ว่าง', async () => {
  const q = {
    select: () => q,
    eq: () => q,
    in: () => q,
    order: () => q,
    limit: async () => ({ data: [{ customer_name: 'ก' }, { customer_name: ' ' }, { customer_name: null }, { customer_name: 'ข' }, { customer_name: 'ก' }], error: null }),
  };
  assert.deepEqual(await getRecentCustomerNames('u1', 8, { from: () => q }), ['ก', 'ข']);
  const b = { select: () => b, eq: () => b, in: () => b, order: () => b, limit: async () => ({ data: null, error: { message: 'x' } }) };
  assert.deepEqual(await getRecentCustomerNames('u1', 8, { from: () => b }), []);
});
