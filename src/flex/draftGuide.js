import { priceDraftBySqm, parseCustomerName } from '../utils/jobDraft.js';

/* ปุ่มแนะนำทีละขั้นใต้การ์ดร่างงาน — ร้านขอ "ไม่ซับซ้อน กดทีละขั้นตอนเพื่อความรวดเร็ว"
 *
 *   ขั้น 1 ยังไม่รู้ว่าของใคร  → ปุ่มชื่อลูกค้าที่เคยจดไว้ กดทีเดียวจบ
 *   ขั้น 2 ยังไม่มีราคา        → ปุ่มเรต ตรมละ 250/300/350/400/450 (ใบที่มีขนาด)
 *   ครบแล้ว                    → ไม่มีปุ่มเพิ่ม เหลือ "✅ บันทึกงาน" บนการ์ด
 *
 * ปุ่มเป็นการ "พิมพ์แทน" (message action) จึงผ่านทางเดียวกับที่ร้านพิมพ์เอง
 * ไม่มีทางลัดแอบแก้ร่างอีกทาง
 */

export const RATE_CHOICES = [250, 300, 350, 400, 450];

const say = (label, text = label) => ({
  type: 'action',
  action: { type: 'message', label: String(label).slice(0, 20), text },
});

export function draftGuideItems(draft, recentNames = []) {
  if (!draft) return [];

  if (!draft.customerName) {
    // เฉพาะชื่อที่ตอนพิมพ์เองก็รับเป็นชื่อ ไม่งั้นกดแล้วม่วงงง
    const names = [...new Set(recentNames)].filter((n) => parseCustomerName(n) === n).slice(0, 10);
    return names.map((n) => say(n));
  }

  if (!(draft.total > 0) && priceDraftBySqm(draft, 1)) {
    return RATE_CHOICES.map((r) => say(`ตรมละ ${r}`));
  }
  return [];
}

// แนบปุ่มให้ข้อความใบสุดท้าย (ไม่มีปุ่มก็ส่งข้อความตามเดิม)
export function withDraftGuide(messages, draft, recentNames = []) {
  const items = draftGuideItems(draft, recentNames);
  if (!items.length) return messages;
  const list = Array.isArray(messages) ? messages : [messages];
  const last = list[list.length - 1];
  if (!last || last.quickReply) return list;
  return [...list.slice(0, -1), { ...last, quickReply: { items } }];
}
