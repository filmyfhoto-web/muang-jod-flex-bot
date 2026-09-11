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
  ['ทักได้', 'nudge_on'],
  ['ทักมาได้', 'nudge_on'],
  ['ทักด้วย', 'nudge_on'],
  ['เตือนด้วย', 'nudge_on'],
  ['เลือกหมวด', 'pick_category'],
  ['หมวดงาน', 'pick_category'],
  ['เปลี่ยนหมวด', 'pick_category'],
]);

function normalise(text) {
  return String(text ?? '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '') // emoji
    .replace(/^\s*\d+[.)]?\s*/, '') // "1. " / "1) " prefixes
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Normalise: trim, collapse spaces, drop a leading emoji/number decoration,
// lower-case latin. Returns the action name or null.
export function resolveMenuCommand(text) {
  const cleaned = normalise(text);
  if (!cleaned) return null;
  return COMMANDS.get(cleaned) ?? null;
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
