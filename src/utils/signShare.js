// ลิงก์ดูป้าย 3 มิติ (แอปจำลองป้าย /sign) — ตรวจไฟล์ที่ส่งมาก่อนเก็บ
//
// ใครก็กดสร้างลิงก์ได้ (แอปเปิดสาธารณะ) จึงรับเฉพาะ GLB ที่หัวไฟล์ถูกต้อง + รูปตัวอย่าง JPEG
// ข้อความทุกช่องตัดตัวควบคุม/แท็ก จำกัดความยาว — หน้าดูยัง escape ซ้ำอีกชั้นตอนพิมพ์ลง HTML

import { randomBytes } from 'node:crypto';

export const MAX_GLB = 20 * 1024 * 1024;
export const MAX_POSTER = 3 * 1024 * 1024;
export const SHARE_DAYS = 365;
// bucket แยกของลิงก์ 3 มิติ และชนิดไฟล์ที่ยอมให้เก็บ
export const SHARE_BUCKET = 'sign-share';
export const SHARE_TYPES = ['model/gltf-binary', 'image/jpeg', 'application/json'];

const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

// รหัสลิงก์ 10 ตัว (62^10 ≈ 8×10^17 เดาไม่ได้)
export function newShareId() {
  const bytes = randomBytes(10);
  let s = '';
  for (const b of bytes) s += B62[b % 62];
  return s;
}

export function isShareId(id) {
  return typeof id === 'string' && /^[0-9A-Za-z]{10}$/.test(id);
}

// glTF Binary: "glTF" + เวอร์ชัน 2 + ความยาวทั้งไฟล์ตรงกับหัวไฟล์ + ก้อนแรกเป็น JSON
export function isGlb(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 28) return false;
  if (buf.readUInt32LE(0) !== 0x46546c67) return false;
  if (buf.readUInt32LE(4) !== 2) return false;
  if (buf.readUInt32LE(8) !== buf.length) return false;
  return buf.readUInt32LE(16) === 0x4e4f534a;
}

export function isJpeg(buf) {
  return Buffer.isBuffer(buf) && buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

// ขนาดรูป JPEG (อ่านจากหัวไฟล์ SOF) — ใส่ใน og:image:width/height ให้ Facebook/LINE โชว์รูปตัวอย่างได้ทันที ไม่ต้องรอโหลดรูปก่อน
export function jpegSize(buf) {
  if (!isJpeg(buf)) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const m = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      const h = buf.readUInt16BE(i + 5);
      const w = buf.readUInt16BE(i + 7);
      return w > 0 && h > 0 ? { w, h } : null;
    }
    i += 2 + len;
  }
  return null;
}

function clean(value, max) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, max);
}

export function cleanMeta(m) {
  const src = m && typeof m === 'object' ? m : {};
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 && n <= 5000 ? Math.round(n * 10) / 10 : 0;
  };
  return {
    title: clean(src.title, 80) || 'ป้าย',
    size: clean(src.size, 60),
    customer: clean(src.customer, 60),
    shop: clean(src.shop, 60),
    phone: clean(src.phone, 30),
    w: num(src.w),
    h: num(src.h),
  };
}

// ถอด base64 แบบเข้มงวด (ตัวอักษรนอก base64 = ไม่รับ)
export function fromBase64(s, max) {
  if (typeof s !== 'string' || !s) return null;
  const body = s.replace(/^data:[\w/+.-]+;base64,/, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body)) return null;
  if ((body.length * 3) / 4 > max + 4) return null;
  return Buffer.from(body, 'base64');
}

// ตรวจคำขอสร้างลิงก์ → { glb, poster, meta } หรือ { error }
export function parseShareRequest(body) {
  if (!body || typeof body !== 'object') return { error: 'bad_request' };
  const glb = fromBase64(body.glb, MAX_GLB);
  if (!glb) return { error: typeof body.glb === 'string' && body.glb.length > MAX_GLB ? 'too_large' : 'bad_model' };
  if (!isGlb(glb)) return { error: 'bad_model' };
  let poster = null;
  if (body.poster) {
    poster = fromBase64(body.poster, MAX_POSTER);
    if (!poster || !isJpeg(poster)) return { error: 'bad_poster' };
  }
  return { glb, poster, meta: cleanMeta(body.meta) };
}

// จำกัดจำนวนลิงก์ต่อเครื่อง (ต่อ IP) และรวมทั้งวัน กันคนยิงไฟล์ใส่จนพื้นที่เต็ม
export function rateLimiter({ perHour = 30, perDay = 600, now = () => Date.now() } = {}) {
  const byKey = new Map();
  let day = [];
  return function allow(key) {
    const t = now();
    day = day.filter((x) => t - x < 86400000);
    const list = (byKey.get(key) || []).filter((x) => t - x < 3600000);
    if (list.length >= perHour || day.length >= perDay) {
      byKey.set(key, list);
      return false;
    }
    list.push(t);
    day.push(t);
    byKey.set(key, list);
    if (byKey.size > 5000) byKey.clear();
    return true;
  };
}
