import { quickFormUrl } from '../utils/liff.js';

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

// งานสามอย่างที่ร้านทำบ่อยที่สุด กดแล้วเปิดฟอร์มที่มีชื่อรายการใส่ไว้ให้แล้ว
// เหลือแค่ใส่ขนาดกับราคา บันทึก แล้วออกใบเสร็จจากการ์ดที่เด้งมาได้เลย
//
// ร้านบอกว่า "เราไม่เอาออกบิลละ เรากรอกเสร็จออกใบเสร็จเลย" — ปุ่มออกบิลจึง
// ออกไป มันเป็นขั้นตอนรวมงานหลายงานเข้าบิลเดียว ซึ่งไม่ใช่วิธีทำงานของร้านนี้
export const QUICK_JOBS = [
  { label: '🖼 งานกรอบรูป', name: 'กรอบรูป' },
  { label: '🪧 งานป้าย', name: 'ป้ายไวนิล' },
  { label: '🧊 งานโฟมบอร์ด', name: 'โฟมบอร์ด' },
];

export const QUICK_REPLIES = [
  { label: '📝 บันทึกงาน', action: 'add_job', text: 'บันทึกงานวันนี้' },
  { label: '📊 สรุปวันนี้', action: 'today_summary', text: 'สรุปวันนี้' },
  { label: '💰 ค้างรับ', action: 'pending_payment', text: 'ค้างรับ' },
  { label: '🕘 ล่าสุด', action: 'recent_jobs', text: 'รายการล่าสุด' },
  { label: '⏰ ตั้งเตือน', action: 'remind_job', text: 'ตั้งแจ้งเตือนงาน' },
  { label: '📈 รายงาน', action: 'report_menu', text: 'รายงาน' },
  { label: '❓ ช่วยเหลือ', action: 'help', text: 'ช่วยเหลือ' },
];

// งานด่วนขึ้นก่อน เพราะเป็นสิ่งที่ร้านกดบ่อยที่สุด และแถบนี้ยาวเกินจอ —
// ปุ่มที่อยู่ท้าย ๆ ต้องปัดไปหา
export function defaultItems() {
  const jobs = QUICK_JOBS.map((j) => ({ ...j, uri: quickFormUrl({ name: j.name }) })).filter((j) => j.uri);
  return [...jobs, ...QUICK_REPLIES];
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
            data: `action=${item.action}`,
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

  return [...list.slice(0, -1), { ...last, quickReply: quickReplyBlock(items) }];
}
