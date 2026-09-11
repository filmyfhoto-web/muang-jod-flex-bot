import { createHmac, timingSafeEqual } from 'node:crypto';

// กุญแจ "โหมดร้าน" ของหน้าใบเสร็จ
//
// ลิงก์ /r/<share_token> คือใบเสร็จของลูกค้า ใครถือลิงก์ก็เปิดได้ — นั่นคือ
// ความหมายของการยื่นใบเสร็จให้คนอื่น แต่ร้านอยากเห็นมากกว่านั้น: ราคาที่คิดได้
// จริงจากรายการ ก่อนที่ร้านจะปัดขึ้น/ลดให้ลูกค้า ซึ่งเป็นตัวเลขที่ลูกค้าไม่ควรเห็น
//
// หน้านี้ไม่มีการล็อกอิน (ลูกค้าไม่มีบัญชีในระบบ) จึงเพิ่มกุญแจใบที่สองแทน:
// แฮชของ share_token กับ secret ของเซิร์ฟเวอร์ ลิงก์ที่ส่งให้ลูกค้าไม่มีมันติดไป
// ส่วนลิงก์ที่ร้านได้จาก /api (ซึ่งผ่าน LINE login แล้ว) มี — คำนวณสด ๆ ทุกครั้ง
// จึงไม่ต้องเก็บอะไรเพิ่มในฐานข้อมูล และเดาไม่ได้ถ้าไม่รู้ secret
const KEY_LENGTH = 16;

function secret() {
  return process.env.RECEIPT_SHOP_SECRET || process.env.LINE_CHANNEL_SECRET || '';
}

export function shopKey(shareToken) {
  const key = secret();
  if (!key || !shareToken) return null;
  return createHmac('sha256', key).update(`receipt-shop:${shareToken}`).digest('hex').slice(0, KEY_LENGTH);
}

// เทียบแบบไม่ให้เวลาที่ใช้บอกใบ้ว่าตรงไปกี่ตัว
export function isShopKey(shareToken, given) {
  const want = shopKey(shareToken);
  if (!want || typeof given !== 'string' || given.length !== want.length) return false;
  try {
    return timingSafeEqual(Buffer.from(want), Buffer.from(given));
  } catch {
    return false;
  }
}

// ลิงก์เดียวกัน แต่ถือกุญแจร้านไปด้วย ใช้ตอนร้านกดเปิดใบเสร็จจากในแอปตัวเอง
export function withShopKey(url, shareToken) {
  const key = shopKey(shareToken);
  if (!url || !key) return url || null;
  return `${url}${url.includes('?') ? '&' : '?'}k=${key}`;
}
