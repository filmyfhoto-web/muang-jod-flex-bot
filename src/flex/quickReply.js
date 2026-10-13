import { liffUrl } from '../utils/liff.js';
import { activeTaxonomy } from '../utils/category.js';

// แถบปุ่มลัดเหนือช่องพิมพ์ (Quick Reply ของ LINE)
//
// ริชเมนูใช้ได้ดีบนมือถือ แต่บนคอมมันหุบอยู่ ต้องกดเปิดทุกครั้ง ปุ่มลัดแถบนี้
// ลอยอยู่เหนือช่องพิมพ์ตลอด กดได้ทันทีทั้งบนคอมและมือถือ
//
// LINE ให้ได้สูงสุด 13 ปุ่ม ป้ายละไม่เกิน 20 ตัวอักษร และจะโชว์เฉพาะข้อความ
// "ใบสุดท้าย" ของแต่ละครั้งที่ตอบ — จึงแนบที่ทางส่งทีเดียว ไม่ต้องไล่ใส่ทุกที่
//
// หน้าตาของปุ่ม (สีพื้น ทรงมน ฟอนต์) เป็นของแอป LINE ไม่ใช่ของเรา — มันตาม
// ธีมสว่าง/มืดที่เครื่องตั้งไว้ ฝั่งบอตตั้งได้แค่ข้อความกับไอคอน

/* ปุ่มงานมาจากหมวดของร้านเอง ไม่ใช่ลิสต์ตายตัวในไฟล์อีกแล้ว
 *
 * ร้านขอ "อัพเดตและแก้ไขปุ่มงานด่วนให้เข้ากับหมวดงาน" — ร้านแก้หมวดเองได้อยู่แล้ว
 * (เพิ่มประเภท เปลี่ยนชื่อ เปลี่ยนไอคอน ซ่อน) แถบนี้จึงไล่ตามชุดหมวดที่ใช้อยู่:
 * ประเภทที่มองเห็นทุกอัน เรียงตามลำดับหมวดของร้าน สูงสุด 12 ปุ่ม + ปุ่มหมวดงาน
 * ประเภทที่ร้านเพิ่ง "เพิ่ม/เปลี่ยนชื่อ/ซ่อน" จะมาเองภายในไม่กี่นาที (แคชหมวด
 * รีเฟรชเองอยู่แล้ว) ไม่ต้องมาแก้ไฟล์นี้อีก
 *
 * ชื่อที่ปุ่มส่งให้ม่วงคือชื่อประเภทเต็ม ๆ — ตัวจัดหมวดรู้จักชื่อที่ร้านตั้งเสมอ
 * (ชื่อประเภทเป็นคำค้นของตัวเองด้วย) กดแล้วม่วงเริ่มถามของงานชนิดนั้นในแชตเลย
 * ส่วนป้ายบนปุ่มโดนตัดที่ 20 ตัวอักษรตามกติกา LINE ซึ่งเป็นคนละช่องกับชื่อที่ส่ง
 */
const MAX_JOB_CHIPS = 12;

// ตาข่ายกันแถบว่าง — ไม่ควรถึง (ชุดหมวดตั้งต้นมีประเภทเสมอ) แต่แถบว่างคือ
// ข้อความถูก LINE ปฏิเสธทั้งใบ จึงกันไว้
const FALLBACK = [
  { label: '📝 บันทึกงาน', action: 'add_job', text: 'บันทึกงานวันนี้' },
  { label: '📊 สรุปวันนี้', action: 'today_summary', text: 'สรุปวันนี้' },
  { label: '💰 ค้างรับ', action: 'pending_payment', text: 'ค้างรับ' },
  { label: '🕘 ล่าสุด', action: 'recent_jobs', text: 'รายการล่าสุด' },
];

// ท้ายแถบ ถัดจากปุ่มงาน: ทางไปดูว่างานแต่ละหมวดมีอะไรไปแล้วบ้าง ร้านขอไว้ว่า
// "ตรงเมนูด่วนด้านหลังตรายาง เพิ่มหมวดงานให้หน่อย" — ปุ่มอื่นในแถบนี้คือ "จดงาน
// ชนิดนี้" ปุ่มนี้คือ "ขอดูงานที่จดไปแล้ว" จึงอยู่ท้ายสุด ไม่ปนกับงาน
export const QUICK_LINKS = [{ label: '📂 หมวดงาน', page: { tab: 'category' } }];

// ปุ่มงานจากชุดหมวดชุดหนึ่ง — แยกเป็นฟังก์ชันให้เทสต์ส่งชุดหมวดอื่นเข้ามาได้
//
// ลำดับการหยิบ: ประเภทที่ร้านเพิ่มเองมาก่อน (คือเหตุผลที่ร้านขอให้แถบ "เข้ากับ
// หมวดงาน") แล้วค่อยหยิบของระบบวนทีละหมวด หมวดละหนึ่ง — ทุกหมวดได้โผล่บนแถบ
// ไม่โดนหมวดแรก (งานพิมพ์มี 4 ประเภท) กินที่จนกรอบรูปท้ายลิสต์หลุดไป
export function quickJobItems(tax = activeTaxonomy()) {
  const groups = (tax.groups || []).map((g) => ({ g, types: (g.types || []).filter((t) => !t.hidden) }));
  const picked = [];

  for (const { g, types } of groups) {
    for (const t of types) if (t.custom) picked.push([g, t]);
  }
  for (let round = 0; picked.length < MAX_JOB_CHIPS; round += 1) {
    let took = false;
    for (const { g, types } of groups) {
      if (picked.length >= MAX_JOB_CHIPS) break;
      const t = types.filter((x) => !x.custom)[round];
      if (!t) continue;
      picked.push([g, t]);
      took = true;
    }
    if (!took) break;
  }

  return picked.slice(0, MAX_JOB_CHIPS).map(([g, t]) => ({
    label: `${t.icon || g.icon || '📦'} ${t.label}`.slice(0, 20),
    name: t.label,
    action: 'quick_job',
    params: { name: t.label },
    text: `จด${t.label}`,
  }));
}

export function defaultItems() {
  const jobs = quickJobItems();
  const links = QUICK_LINKS.map((l) => ({ ...l, uri: liffUrl(l.page) })).filter((l) => l.uri);
  const items = [...jobs, ...links];
  return items.length ? items : FALLBACK;
}

export function quickReplyBlock(items = defaultItems()) {
  return {
    items: items.slice(0, 13).map((item) => ({
      type: 'action',
      action: item.uri
        ? { type: 'uri', label: item.label, uri: item.uri }
        : {
            type: 'postback',
            label: item.label,
            data: new URLSearchParams({ action: item.action, ...(item.params || {}) }).toString(),
            displayText: item.text || item.label,
          },
    })),
  };
}

// แนบปุ่มลัดให้ข้อความใบสุดท้าย ใบที่ตั้ง quickReply มาเองแล้วไม่ยุ่งด้วย
// (บางจังหวะอยากได้ปุ่มเฉพาะกิจ เช่น ตอนถามยอดเงิน)
export function withQuickReply(messages, items) {
  const list = Array.isArray(messages) ? messages : [messages];
  if (!list.length) return list;

  const last = list[list.length - 1];
  if (!last || typeof last !== 'object' || last.quickReply) return list;

  // ส่งแถบว่างไม่ได้: LINE ปฏิเสธทั้งข้อความ ไม่ใช่แค่แถบ
  //
  // และที่สำคัญกว่านั้น — แถบของ LINE จะเปลี่ยนก็ต่อเมื่อมีข้อความใหม่ที่พก
  // แถบมาด้วยเท่านั้น ข้อความที่ไม่แนบแถบไม่ได้ "ลบ" แถบเดิม มันปล่อยของเก่า
  // ค้างอยู่บนจอ ตอนที่แถบนี้ว่างได้ (ไม่ได้ตั้ง LIFF) ร้านจึงติดอยู่กับปุ่ม
  // ชุดเก่าตลอดไป มองไม่เห็นปุ่มใหม่เลย — ซึ่งคือสิ่งที่ร้านเจอ
  // defaultItems() จึงไม่มีทางคืนลิสต์ว่างอีกแล้ว และตรงนี้กันไว้อีกชั้น
  const block = quickReplyBlock(items);
  if (!block.items.length) return list;

  return [...list.slice(0, -1), { ...last, quickReply: block }];
}
