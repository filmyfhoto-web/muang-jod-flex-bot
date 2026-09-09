// แถบปุ่มลัดเหนือช่องพิมพ์ (Quick Reply ของ LINE)
//
// ริชเมนูใช้ได้ดีบนมือถือ แต่บนคอมมันหุบอยู่ ต้องกดเปิดทุกครั้ง ปุ่มลัดแถบนี้
// ลอยอยู่เหนือช่องพิมพ์ตลอด กดได้ทันทีทั้งบนคอมและมือถือ
//
// LINE ให้ได้สูงสุด 13 ปุ่ม ป้ายละไม่เกิน 20 ตัวอักษร และจะโชว์เฉพาะข้อความ
// "ใบสุดท้าย" ของแต่ละครั้งที่ตอบ — จึงแนบที่ทางส่งทีเดียว ไม่ต้องไล่ใส่ทุกที่

export const QUICK_REPLIES = [
  { label: '📝 บันทึกงาน', action: 'add_job', text: 'บันทึกงานวันนี้' },
  { label: '📊 สรุปวันนี้', action: 'today_summary', text: 'สรุปวันนี้' },
  { label: '💰 ค้างรับ', action: 'pending_payment', text: 'ค้างรับ' },
  { label: '🕘 ล่าสุด', action: 'recent_jobs', text: 'รายการล่าสุด' },
  { label: '🧾 ออกบิล', action: 'create_bill', text: 'ออกบิล' },
  { label: '⏰ ตั้งเตือน', action: 'remind_job', text: 'ตั้งแจ้งเตือนงาน' },
  { label: '📈 รายงาน', action: 'report_menu', text: 'รายงาน' },
  { label: '❓ ช่วยเหลือ', action: 'help', text: 'ช่วยเหลือ' },
];

export function quickReplyBlock(items = QUICK_REPLIES) {
  return {
    items: items.slice(0, 13).map((item) => ({
      type: 'action',
      action: {
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
