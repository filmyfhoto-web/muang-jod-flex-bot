/* ทีมของร้าน — ด่านสิทธิ์ (ส่วนที่เป็นกติกาล้วน ไม่มีฐานข้อมูล)
 *
 * ร้านขอ: "เพิ่มคนใช้ม่วงจดเพิ่มได้ไหม จะได้ช่วยเราจดงาน" (24 พ.ย. 69)
 *
 * หลักคิด: สมาชิกทีมได้แบบ "เปิดเท่าที่ให้" ไม่ใช่ "ปิดเท่าที่นึกออก" —
 * รายการข้างล่างคือทุกอย่างที่สมาชิกทำได้ (จดงาน แนบรูป ดูคิว เล่นเกมคิวงาน)
 * อะไรนอกรายการถูกปัดสุภาพโดยอัตโนมัติ ฟีเจอร์เงินที่เพิ่มใหม่ในอนาคตจึง
 * ปลอดภัยตั้งแต่เกิด ไม่ต้องจำว่าต้องมาปิดที่นี่
 *
 * เรื่องเงินระดับ "ใบงาน" (ราคาที่พิมพ์ตอนจด) เป็นส่วนหนึ่งของการจดงาน —
 * สมาชิกเห็น/พิมพ์ได้ ส่วนเรื่องเงินระดับ "ร้าน" (ยอดรวม บัญชี รายงาน บิล
 * สมุดลูกค้า การบันทึกรับเงิน) เป็นของเจ้าของเท่านั้น
 */

import { randomBytes } from 'node:crypto';

// ตัวอักษรรหัสเชิญ — ตัดตัวที่อ่านสับสน (0/O, 1/I/L) ออก พิมพ์ตามปากกันง่าย
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const INVITE_TTL_HOURS = 48;

export function newInviteCode() {
  const bytes = randomBytes(6);
  let code = '';
  for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return code;
}

// "ทีม ABC123" / "ทีม-abc123" / "ทีมABC123" — คนพิมพ์จากปากต่อปาก ต้องหลวมพอ
export const JOIN_TEXT = /^ทีม[\s-]*([A-Za-z0-9]{6})$/;

export function parseJoinCode(text) {
  const m = JOIN_TEXT.exec(String(text ?? '').trim());
  return m ? m[1].toUpperCase() : null;
}

// คำสั่งของเจ้าของร้าน
export const OWNER_INVITE_WORDS = /^เพิ่ม(?:พนักงาน|ทีม|คนช่วย|คนจด|คนใช้)\s*(?:ค่ะ|คะ|ครับ|หน่อย|ด้วย|นะ)*$/;
export const OWNER_LIST_WORDS = /^(?:ทีม|รายชื่อทีม|ทีมของฉัน|ดูทีม)\s*(?:ค่ะ|คะ|ครับ|หน่อย|ด้วย|นะ)*$/;
export const OWNER_REMOVE_WORDS = /^ลบ(?:พนักงาน|ทีม|คนช่วย|คนจด)\s+(.+)$/;

/* โพสต์แบ็กที่สมาชิกกดได้ — ครอบเส้นทาง "จดงานให้เสร็จ" ทั้งสาย
 * (จด → แก้ร่าง → ยืนยัน → แนบหลักฐาน → ดูงานล่าสุด → เปิดเกม) */
export const MEMBER_POSTBACKS = new Set([
  'add_job',
  'quick_job',
  'add_more',
  'confirm_add_job',
  'pick_branch',
  'branch_view',
  'edit_new_job',
  'cancel_new_job',
  'confirm_dump',
  'cancel_dump',
  'attach_evidence',
  'recent_jobs',
  'edit_latest',
  'edit_job',
  'pick_category',
  'move_category',
  'open_game',
  'home',
]);

/* คำในแชตที่พาไปเรื่องเงินระดับร้าน / การตั้งค่าร้าน — สมาชิกพิมพ์แล้วถูกปัดสุภาพ
 * (ข้อความจดงานปกติ เช่น "ป้ายไวนิล 3×1 500 บาท" ไม่ติดตาข่ายนี้) */
export const MEMBER_BLOCKED_TEXT = new RegExp(
  [
    'สรุป', 'ยอดวันนี้', 'ยอดเดือน', 'ยอดรวม', 'ดูยอด', 'เช็กยอด', 'เช็คยอด',
    'บัญชี', 'ลงบัญชี', 'ค้างจ่าย', 'ตามเงิน', 'รับเงิน', 'เก็บเงิน', 'จ่ายครบ',
    'บิล', 'ใบเสร็จ', 'ใบวางบิล', 'วางบิล', 'รายงาน', 'รายได้', 'กำไร',
    'สมุดลูกค้า', 'ขายดี', 'แดชบอร์ด', 'ค่าใช้จ่าย', 'รายจ่าย',
    'ตั้งค่าร้าน', 'คิวอาร์', 'เพิ่มพนักงาน', 'ลบพนักงาน', 'รายชื่อทีม',
    'dashboard', 'ledger',
  ].join('|'),
  'i'
);

export const MEMBER_DENIED_TEXT =
  'ส่วนนี้เปิดเฉพาะเจ้าของร้านค่ะ 💜\nที่ช่วยได้เลย: พิมพ์งานที่รับมา = จดเข้าคิวร้าน · พิมพ์ "เกม" เปิดบอร์ดคิวงาน';

/* /api ที่สมาชิกเรียกได้ — เท่าที่หน้า "จดงาน" (/app/jot) กับเกม (/app/game) ใช้
 * [regex ของ path, วิธีที่อนุญาต (null = ทุกวิธี)] */
export const MEMBER_API = [
  [/^\/game(\/|$)/, null], // เกมคิวงาน (ออกแบบมาไม่มีช่องเงินตั้งแต่ต้น)
  [/^\/categories$/, 'GET'],
  [/^\/customers$/, 'GET'],
  [/^\/parse$/, 'POST'],
  [/^\/draft$/, 'GET'],
  [/^\/draft$/, 'DELETE'], // หน้า จดงาน เคลียร์ร่างของตัวเองหลังบันทึก
  [/^\/jobs$/, 'POST'], // จดงานใหม่ (ราคาที่ลูกค้าตกลงคือส่วนหนึ่งของการจด)
  [/^\/jobs\/[^/]+$/, 'GET'], // เปิดดูใบงาน
  [/^\/jobs\/[^/]+$/, 'PATCH'], // แก้ใบที่จดผิด (ช่องเงินถูกริบก่อนเสมอ)
  [/^\/jobs\/[^/]+\/(images|attachments)$/, 'GET'],
];

export function memberApiAllowed(method, path) {
  return MEMBER_API.some(([re, m]) => re.test(path) && (!m || m === method));
}

/* ช่องเงิน/สถานะรับของ ที่ต้องไม่หลุดเข้ามากับ PATCH ของสมาชิก
 * (แก้ "ใบที่จดผิด" ได้ แต่บันทึกว่า "ได้เงินแล้ว/รับของแล้ว" เป็นของเจ้าของ
 * — ฝั่งเกมมีทางของมันเองที่ตรวจกติกาแยกอยู่แล้ว) */
export const MEMBER_PATCH_BLOCKED = [
  'paid_amount', 'balance_due', 'payment_status', 'pay_method', 'paid_at',
  'booked_at', 'done_at', 'picked_up_at', 'status',
];

export function stripMemberPatch(body = {}) {
  const clean = { ...body };
  for (const k of MEMBER_PATCH_BLOCKED) delete clean[k];
  return clean;
}
