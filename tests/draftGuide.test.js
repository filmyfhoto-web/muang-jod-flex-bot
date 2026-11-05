import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftGuideItems, withDraftGuide, RATE_CHOICES } from '../src/flex/draftGuide.js';
import { makeDraft } from '../src/utils/jobDraft.js';
import { getRecentCustomerNames } from '../src/services/jobService.js';

/* ร้านขอ "ไม่ซับซ้อน กดทีละขั้นตอนเพื่อความรวดเร็ว"
 * ขั้น 1 เลือกลูกค้า → ขั้น 2 เลือกเรต → กด ✅ บันทึกงาน
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

test('ขั้น 1: ยังไม่รู้ว่าของใคร → ปุ่มชื่อลูกค้าที่เคยจด (เฉพาะชื่อที่พิมพ์เองก็รับ)', () => {
  const items = draftGuideItems(BOARDS(), ['โรงเรียนพระธาตุพิทยาคม', 'ครูแนน', 'รร.บ้านดอน 2', 'ครูแนน', 'โอเค']);
  const texts = items.map((i) => i.action.text);
  assert.deepEqual(texts, ['โรงเรียนพระธาตุพิทยาคม', 'ครูแนน']); // ซ้ำตัด, ชื่อมีเลข/คำรับไม่ใช่ชื่อตัด
  assert.ok(items.every((i) => i.action.type === 'message' && i.action.label.length <= 20));
});

test('ขั้น 2: รู้ลูกค้าแล้วแต่ไม่มีราคา → ปุ่มเรตตารางเมตร', () => {
  const items = draftGuideItems(BOARDS({ customerName: 'ครูแนน' }));
  assert.deepEqual(items.map((i) => i.action.text), RATE_CHOICES.map((r) => `ตรมละ ${r}`));
});

test('ครบแล้ว (มีลูกค้า + มีราคา) หรือไม่มีขนาดให้คิด = ไม่มีปุ่มเพิ่ม', () => {
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
