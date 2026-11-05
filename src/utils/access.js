/* ใครเปิดหลังร้านได้บ้าง
 *
 * ร้านบอกว่า "ม่วงจดเป็นบอทส่วนตัวสำหรับฉันและใช้ดูหลังร้านเท่านั้น ... ห้ามเปิด
 * ข้อมูลงาน ยอดเงิน ข้อมูลลูกค้า หรือข้อมูลหลังร้านให้บุคคลอื่น ให้ตรวจสอบ LINE
 * User ID ก่อนเปิดสิทธิ์หลังร้าน"
 *
 * รายชื่อเก็บใน environment variable ไม่ใช่ในฐานข้อมูล เพราะคนที่เข้าถึงฐานข้อมูล
 * ได้ไม่ควรเพิ่มตัวเองเข้ารายชื่อได้ และเจ้าของแก้ได้เองจากหน้า Render
 *
 * ไม่ได้ตั้งค่าไว้ = เปิดเหมือนเดิม ตั้งใจให้เป็นแบบนี้: ถ้าตั้งเป็น "ปิดทุกคน"
 * เมื่อไม่ได้ตั้งค่า การ deploy ที่ตกหล่นตัวแปรนี้จะล็อกเจ้าของออกจากบอทตัวเอง
 * โดยไม่มีทางกลับเข้าไปแก้ ความเสี่ยงนั้นหนักกว่าการที่บอทยังเปิดอยู่หนึ่งรอบ
 * deploy — และบอทนี้ก็แยกข้อมูลรายคนอยู่แล้วตั้งแต่ต้น (ทุกคิวรีผูกกับ user_id)
 */

const SPLIT = /[\s,;\n]+/;

// LINE user id จริงเป็น U ตามด้วยเลขฐานสิบหก 32 ตัว — ตรวจรูปแบบไว้เพื่อให้
// ค่าที่พิมพ์ผิด (เช่นเผลอใส่ชื่อเล่น) ไม่กลายเป็นรายชื่อที่ไม่มีวันตรงกับใคร
// แล้วล็อกเจ้าของออกเงียบ ๆ
export const LINE_USER_ID = /^U[0-9a-f]{32}$/i;

export function allowedUserIds(env = process.env) {
  const raw = String(env.ALLOWED_LINE_USER_IDS ?? '').trim();
  if (!raw) return [];
  return [...new Set(raw.split(SPLIT).map((s) => s.trim()).filter((s) => LINE_USER_ID.test(s)))];
}

// มีค่าที่ตั้งมาแต่ไม่มีอันไหนเป็น id ที่ใช้ได้เลย = พิมพ์ผิดทั้งชุด
export function hasMalformedIds(env = process.env) {
  const raw = String(env.ALLOWED_LINE_USER_IDS ?? '').trim();
  if (!raw) return false;
  return allowedUserIds(env).length === 0;
}

export function accessEnabled(env = process.env) {
  return allowedUserIds(env).length > 0;
}

export function isAllowed(lineUserId, env = process.env) {
  const list = allowedUserIds(env);
  if (!list.length) return true; // ยังไม่ได้ตั้งรายชื่อ = ใช้ได้เหมือนเดิม
  const id = String(lineUserId ?? '').trim();
  return list.some((allowed) => allowed.toLowerCase() === id.toLowerCase());
}

/* คำที่คนนอกพิมพ์มาแล้วยังต้องตอบได้
 *
 * เจ้าของต้องรู้ LINE user id ของตัวเองก่อนถึงจะกรอกรายชื่อได้ ถ้าคำสั่งนี้ถูก
 * ปิดไปพร้อมกับทุกอย่าง เจ้าของที่กรอก id ผิดสักตัวจะล็อกตัวเองออกถาวร โดยไม่มี
 * ทางถาม id ของตัวเองอีก — คำสั่งนี้จึงเปิดไว้เสมอ มันบอกแค่ id ของคนที่ถามเอง
 * ซึ่งเป็นข้อมูลของเขาเอง ไม่ใช่ข้อมูลหลังร้านของใคร
 */
export const MY_ID_WORDS =
  /^(?:รหัสของฉัน|รหัสฉัน|ไอดีของฉัน|ไอดีฉัน|ขอไอดี|ขอรหัส|my ?id|myid|user ?id|line ?id)\s*(?:ค่ะ|คะ|ครับ|หน่อย|ด้วย|นะ)*$/i;

export function isMyIdCommand(text) {
  return MY_ID_WORDS.test(String(text ?? '').trim());
}

// ข้อความที่คนนอกได้รับ — สุภาพ แต่ไม่บอกว่ามีข้อมูลอะไรอยู่ข้างใน
export const DENIED_TEXT =
  'ขออภัยค่ะ ม่วงจดเป็นผู้ช่วยส่วนตัวของร้าน ใช้ได้เฉพาะเจ้าของร้านค่ะ 💜';

export function myIdText(lineUserId) {
  return (
    'LINE user id ของคุณคือ 💜\n' +
    `${lineUserId}\n\n` +
    'เอาไปใส่ในช่อง ALLOWED_LINE_USER_IDS ได้เลยค่ะ'
  );
}

/* ด่านหน้าสุดของ webhook — ตัดสินใจอย่างเดียว ไม่ส่งข้อความเอง
 *
 * แยกออกมาเป็นฟังก์ชันล้วนเพราะ webhook จริงมี middleware ตรวจลายเซ็นของ LINE
 * คั่นอยู่ ทดสอบผ่าน HTTP ตรง ๆ ไม่ได้ — และกฎว่าใครเข้าได้เป็นสิ่งที่ต้องมี
 * เทสต์คุมมากที่สุดในไฟล์นี้
 */
export function gateEvent(event, env = process.env) {
  const lineUserId = event?.source?.userId;
  if (!lineUserId) return { action: 'drop' };

  if (event?.type === 'message' && isMyIdCommand(event?.message?.text)) {
    return { action: 'my_id', text: myIdText(lineUserId) };
  }
  if (!isAllowed(lineUserId, env)) return { action: 'deny', text: DENIED_TEXT };
  return { action: 'pass' };
}
