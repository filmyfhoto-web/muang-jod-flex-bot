import { priceDraftBySqm } from '../utils/jobDraft.js';

/* ปุ่มแนะนำใต้การ์ดร่างงาน
 *
 *   ยังไม่มีราคา (ใบที่มีขนาด) → ปุ่มเรต ตรมละ 250/300/350/400/450
 *   นอกนั้น                    → ไม่มีปุ่มของร่าง = แถบเมนูหลักกลับมาแสดงแทน
 *
 * เดิมมีขั้น "ปุ่มชื่อลูกค้าที่เคยจด" ด้วย — ร้านดูจอคอมแล้วสั่ง (25 พ.ย. 69)
 * "เมนูชื่อลูกค้าแบบนี้ไม่เอาค่ะ ฉันอยากให้เมนูแบบริชเมนู" จึงถอดออก:
 * ชื่อลูกค้าพิมพ์เอาตามที่การ์ดถามอยู่แล้ว (ชิปชื่อยังมีในฟอร์มจดด่วนและ
 * ใบจดในเกม ซึ่งไม่เบียดเมนูของแชต)
 *
 * ปุ่มเป็นการ "พิมพ์แทน" (message action) จึงผ่านทางเดียวกับที่ร้านพิมพ์เอง
 * ไม่มีทางลัดแอบแก้ร่างอีกทาง
 */

export const RATE_CHOICES = [250, 300, 350, 400, 450];

const say = (label, text = label) => ({
  type: 'action',
  action: { type: 'message', label: String(label).slice(0, 20), text },
});

export function draftGuideItems(draft) {
  if (!draft) return [];
  if (!(draft.total > 0) && priceDraftBySqm(draft, 1)) {
    return RATE_CHOICES.map((r) => say(`ตรมละ ${r}`));
  }
  return [];
}

// แนบปุ่มให้ข้อความใบสุดท้าย (ไม่มีปุ่มก็ส่งข้อความตามเดิม)
export function withDraftGuide(messages, draft) {
  const items = draftGuideItems(draft);
  if (!items.length) return messages;
  const list = Array.isArray(messages) ? messages : [messages];
  const last = list[list.length - 1];
  if (!last || last.quickReply) return list;
  return [...list.slice(0, -1), { ...last, quickReply: { items } }];
}
