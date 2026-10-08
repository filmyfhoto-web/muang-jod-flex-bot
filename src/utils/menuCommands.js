// Map plain-text menu labels to postback actions.
//
// A Rich Menu built in LINE Official Account Manager usually sends the button
// label as a normal text message instead of a postback. This lets those
// buttons (and typed commands) reach the same handlers as postback buttons.
// Matching is exact (after trimming) so ordinary job text is never hijacked.

const COMMANDS = new Map([
  // the brand footer on the Rich Menu
  ['ม่วงจด', 'home'],
  ['ม่วงจดให้', 'home'],
  ['หน้าแรก', 'home'],
  ['เริ่มใช้งาน', 'home'],
  // the labels as they are written on the Rich Menu artwork — a menu built in
  // OA Manager sends the label as text, so each one has to land here too
  ['รายการล่าสุด/แก้ไข', 'recent_jobs'],
  ['บันทึก/แนบสลิป', 'attach_evidence'],
  ['งานค้าง', 'pending_payment'],
  ['ตั้งค่า', 'open_dashboard'],
  // The small captions printed under a button. A menu whose buttons send text
  // can be built to send either line, and a shop reading the artwork may type
  // the caption rather than the heading.
  ['ดูงานทั้งหมด', 'recent_jobs'],
  ['ปรับแต่งแอป', 'open_dashboard'],
  // 8 core menu buttons
  ['บันทึกงานวันนี้', 'add_job'],
  ['บันทึกงาน', 'add_job'],
  ['งานวันนี้', 'add_job'],
  ['จดงาน', 'add_job'],
  // การ์ดจด (ฟอร์มเล็ก): จดเองในฟอร์มก็ได้ พิมพ์ให้บอทจดก็ได้ — การ์ดเดียวกัน
  ['ฟอร์ม', 'add_job'],
  ['เปิดฟอร์ม', 'add_job'],
  ['การ์ดจด', 'add_job'],
  ['จดเอง', 'add_job'],
  ['แนบสลิป/หลักฐาน', 'attach_evidence'],
  ['แนบสลิป', 'attach_evidence'],
  ['แนบหลักฐาน', 'attach_evidence'],
  ['รายการล่าสุด', 'recent_jobs'],
  ['สรุปวันนี้', 'today_summary'],
  ['แก้ไขล่าสุด', 'edit_latest'],
  ['แก้ล่าสุด', 'edit_latest'],
  ['ยกเลิกล่าสุด', 'cancel_latest'],
  ['ค้างรับ', 'pending_payment'],
  ['ค้างรับ & ติดตามงาน', 'pending_payment'],
  ['ติดตามงาน', 'pending_payment'],
  ['ช่วยเหลือ', 'help'],
  ['วิธีใช้', 'help'],
  ['help', 'help'],
  // QR รับเงินของร้าน — คำเดียวแล้วรูปเด้ง ไม่ต้องไถหาในอัลบั้ม
  ['qr', 'shop_qr'],
  ['คิวอาร์', 'shop_qr'],
  ['คิวอาร์โค้ด', 'shop_qr'],
  ['qr code', 'shop_qr'],
  ['คิวอาร์รับเงิน', 'shop_qr'],
  ['qr รับเงิน', 'shop_qr'],
  ['สแกนจ่าย', 'shop_qr'],
  ['พร้อมเพย์', 'shop_qr'],
  ['เพิ่ม qr', 'add_shop_qr'],
  ['เพิ่มคิวอาร์', 'add_shop_qr'],
  ['เปลี่ยน qr', 'add_shop_qr'],
  ['เปลี่ยนคิวอาร์', 'add_shop_qr'],
  ['แก้ qr', 'add_shop_qr'],
  // extras reachable by text
  ['บันทึกรับเงิน', 'record_payment'],
  ['รับเงิน', 'record_payment'],
  ['ค้นหางาน', 'search_jobs'],
  ['ค้นหา', 'search_jobs'],
  ['รายงาน', 'report_menu'],
  ['report', 'report_menu'],
  ['ออกบิล', 'create_bill'],
  ['ออกบิล & ใบเสร็จ', 'create_bill'],
  ['รวมบิล', 'create_bill'],
  ['บิล', 'create_bill'],
  ['ใบเสร็จ', 'view_receipt'],
  // บิลเก่าที่ยังรวมงานของหลายคนอยู่ หาไม่เจอในแชตแล้ว — คำพวกนี้ยกมันกลับมา
  ['แยกบิล', 'split_bills'],
  ['แยกใบเสร็จ', 'split_bills'],
  ['ใบเสร็จแยกคน', 'split_bills'],
  ['แยกบิลเป็นคนๆ', 'split_bills'],
  // "ออกบิลคือการออกใบเสร็จรับเงิน" — so this one starts a bill rather than
  // opening the last receipt, which is what ใบเสร็จ on its own does.
  ['ออกใบเสร็จ', 'create_bill'],
  ['รับชำระ', 'bill_payment'],
  ['แดชบอร์ด', 'open_dashboard'],
  ['dashboard', 'open_dashboard'],
  ['ตั้งแจ้งเตือนงาน', 'remind_job'],
  ['ตั้งเตือน', 'remind_job'],
  ['แจ้งเตือน', 'remind_job'],
  ['แจ้งเตือนงาน', 'remind_job'],
  ['การแจ้งเตือน', 'my_reminders'],
  // ม่วงทักก่อน — ปิดได้ด้วยคำที่คนพูดจริงตอนรำคาญ ไม่ใช่แค่ปุ่มบนข้อความ
  // ที่เลื่อนหายไปแล้ว
  ['ไม่ต้องทัก', 'nudge_off'],
  ['ไม่ต้องทักมา', 'nudge_off'],
  ['หยุดทัก', 'nudge_off'],
  ['เลิกทัก', 'nudge_off'],
  ['อย่าทัก', 'nudge_off'],
  ['ไม่ต้องเตือน', 'nudge_off'],
  ['ทดสอบทัก', 'nudge_test'],
  ['ลองทัก', 'nudge_test'],
  ['ทักได้', 'nudge_on'],
  ['ทักมาได้', 'nudge_on'],
  ['ทักด้วย', 'nudge_on'],
  ['เตือนด้วย', 'nudge_on'],
  // ทบทวนงานเก่า: จ่ายแล้ว / ยังไม่จ่าย / ลงบัญชีแล้ว กดทีละใบ
  ['ตรวจงานเก่า', 'review_jobs'],
  ['ทบทวนงานเก่า', 'review_jobs'],
  ['งานเก่า', 'review_jobs'],
  ['ทบทวนงาน', 'review_jobs'],
  ['แก้สถานะ', 'review_jobs'],
  ['แก้สถานะงาน', 'review_jobs'],
  // แยกงานตามเงิน: เงินสด / โอน / ลงบัญชี / ยังไม่ได้รับ — เช็คงานซ้ำ
  ['งานเงินสด', 'money_list&k=cash'],
  ['เงินสด', 'money_list&k=cash'],
  ['งานโอน', 'money_list&k=transfer'],
  ['เงินโอน', 'money_list&k=transfer'],
  ['งานลงบัญชี', 'money_list&k=account'],
  ['ลงบัญชี', 'money_list&k=account'],
  ['ค้างลงบัญชี', 'money_list&k=account'],
  ['งานยังไม่จ่าย', 'money_list&k=unpaid'],
  ['ยังไม่จ่าย', 'money_list&k=unpaid'],
  ['ยังไม่ได้รับเงิน', 'money_list&k=unpaid'],
  // ค่า AI เป็นบาท / ลิงก์เปิดบนคอม
  ['ค่า ai', 'ai_cost'],
  ['ค่าai', 'ai_cost'],
  ['ค่าเอไอ', 'ai_cost'],
  ['ค่าไอ', 'ai_cost'],
  ['ค่าใช้จ่าย ai', 'ai_cost'],
  ['ai ใช้เงินเท่าไหร่', 'ai_cost'],
  ['ใช้เงินเท่าไหร่', 'ai_cost'],
  ['ลิงก์', 'web_links'],
  ['ลิงค์', 'web_links'],
  ['link', 'web_links'],
  ['เปิดในคอม', 'web_links'],
  ['เปิดบนคอม', 'web_links'],
  ['เว็บ', 'web_links'],
  ['เปิดเว็บ', 'web_links'],
  ['เลือกหมวด', 'pick_category'],
  ['หมวดงาน', 'pick_category'],
  ['เปลี่ยนหมวด', 'pick_category'],
  // หมวดงานของร้านเอง: ดู เพิ่ม แก้ไข — "เพิ่มหมวด <ชื่อ>" เพิ่มทันทีอยู่ที่ categoryCommands
  // (ไม่ใส่ "แก้หมวด" เฉย ๆ เพราะกำกวมกับ "เปลี่ยนหมวด" ของงานล่าสุด)
  ['เพิ่มหมวด', 'manage_categories'],
  ['เพิ่มหมวดงาน', 'manage_categories'],
  ['แก้ไขหมวด', 'manage_categories'],
  ['แก้ไขหมวดงาน', 'manage_categories'],
  ['จัดการหมวด', 'manage_categories'],
  ['จัดการหมวดงาน', 'manage_categories'],
  ['ตั้งค่าหมวด', 'manage_categories'],
  ['ตั้งค่าหมวดงาน', 'manage_categories'],
  ['หมวดของร้าน', 'manage_categories'],
  ['หมวดงานของร้าน', 'manage_categories'],
]);

function normalise(text) {
  return String(text ?? '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '') // emoji
    .replace(/^\s*\d+[.)]?\s*/, '') // "1. " / "1) " prefixes
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/* คำสุภาพที่คนพูดหุ้มคำสั่งไว้ — "ดูงานค้างหน่อย" คือ "งานค้าง"
 *
 * ร้านพิมพ์ "ดูงานค้างหน่อย" สองรอบ แล้วม่วงตอบคำทักทายกลับไปทั้งสองรอบ เพราะ
 * ตารางคำสั่งเทียบแบบตรงตัวเป๊ะ ๆ ("งานค้าง" เท่านั้น) — ร้านบอกว่า "อยากให้
 * บอทตอบได้ในสิ่งที่เราถาม"
 *
 * ปอกหัวท้ายออกแล้วค่อยเทียบใหม่ ไม่ได้ทำให้การเทียบหลวมลงเลย เพราะผลที่ปอก
 * แล้วยังต้องตรงกับชื่อคำสั่งเป๊ะ ๆ อยู่ดี "ขอตรายาง 2 อัน" ปอกแล้วได้
 * "ตรายาง 2 อัน" ซึ่งไม่ใช่คำสั่ง ก็ยังตกไปเป็นการจดงานเหมือนเดิม
 */
const LEAD_RE = /^(?:ช่วย|ขอ|อยาก(?:ได้)?|ไหน)?\s*(?:ดู|เปิด|เช็ค|เช็ก|เรียก)?\s*/;
const TAIL_RE = /\s*(?:ให้|หน่อย|ด้วย|ที|ซิ|สิ|นะ|น่ะ|จ้า|ครับ|คับ|ค่ะ|คะ|ๆ)+$/;

function undress(cleaned) {
  let out = cleaned.replace(LEAD_RE, '').trim();
  // ปอกหางซ้ำได้ ("ให้หน่อยค่ะ" = สามคำต่อกัน)
  let before;
  do {
    before = out;
    out = out.replace(TAIL_RE, '').trim();
  } while (out !== before);
  return out;
}

// Normalise: trim, collapse spaces, drop a leading emoji/number decoration,
// lower-case latin. Returns the action name or null.
export function resolveMenuCommand(text) {
  const cleaned = normalise(text);
  if (!cleaned) return null;

  // เทียบตรงตัวก่อนเสมอ — คำสั่งที่ขึ้นต้นด้วย "ดู" อยู่แล้ว ("ดูงานทั้งหมด")
  // ต้องไม่ถูกปอกหัวทิ้งจนหาไม่เจอ
  const exact = COMMANDS.get(cleaned);
  if (exact) return exact;

  const bare = undress(cleaned);
  return bare && bare !== cleaned ? COMMANDS.get(bare) ?? null : null;
}

/* เดาว่าร้านน่าจะหมายถึงคำสั่งไหน — สำหรับ "เสนอเป็นปุ่ม" เท่านั้น
 *
 * ต่างจาก resolveMenuCommand ตรงที่มองหาคำสั่งที่ "อยู่ข้างใน" ประโยค ซึ่งหลวม
 * เกินกว่าจะสั่งทำงานเองได้ แต่พอดีสำหรับถามกลับว่า "หมายถึงอันนี้ไหมคะ" แทน
 * ที่จะตอบคำทักทายกลับไปเฉย ๆ ทั้งที่ร้านถามมาชัด ๆ
 *
 * ยาวก่อนสั้น — ประโยคหนึ่งมีได้หลายคำสั่งซ้อนกัน ("บิล" อยู่ข้างใน "แยกบิล")
 * คำที่ยาวกว่าคือคำที่ตรงกับที่ร้านพิมพ์มามากกว่า
 */
export function suggestMenuCommand(text) {
  const cleaned = normalise(text);
  if (!cleaned) return null;
  let best = null;
  for (const [label, action] of COMMANDS) {
    if (!cleaned.includes(label)) continue;
    if (!best || label.length > best.label.length) best = { label, action };
  }
  return best?.action ?? null;
}

// ป้ายบนปุ่มที่จะเสนอ — ใช้ชื่อแรกที่เจอ ซึ่งเป็นชื่อที่เขียนบนเมนูจริง
export function labelForAction(action) {
  for (const [label, act] of COMMANDS) {
    if (act === action) return label;
  }
  return null;
}

// "งานวันนี้ ป้ายไวนิล 150 บาท" -> { action: 'add_job', rest: 'ป้ายไวนิล 150 บาท' }
// Only the add-job labels are accepted as a prefix; returns null otherwise.
export function splitLeadingAddJob(text) {
  const cleaned = normalise(text);
  if (!cleaned) return null;
  for (const [label, action] of COMMANDS) {
    if (action !== 'add_job') continue;
    if (cleaned.startsWith(`${label} `)) {
      const rest = cleaned.slice(label.length).trim();
      if (rest) return { action, rest };
    }
  }
  return null;
}
