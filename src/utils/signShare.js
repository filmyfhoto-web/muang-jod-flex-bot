// ลิงก์ดูป้าย 3 มิติ (แอปจำลองป้าย /sign) — ตรวจไฟล์ที่ส่งมาก่อนเก็บ
//
// ใครก็กดสร้างลิงก์ได้ (แอปเปิดสาธารณะ) จึงรับเฉพาะ GLB ที่หัวไฟล์ถูกต้อง + รูปตัวอย่าง JPEG
// ข้อความทุกช่องตัดตัวควบคุม/แท็ก จำกัดความยาว — หน้าดูยัง escape ซ้ำอีกชั้นตอนพิมพ์ลง HTML

import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

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

/* ---------- คนเปิดดูลิงก์ + ลูกค้าที่สนใจ ----------
 * ร้านที่สร้างลิงก์ได้ "กุญแจเจ้าของ" กลับไปเก็บในเครื่อง (เซิร์ฟเวอร์เก็บแค่ค่าแฮช)
 * ดูยอดเปิด/รายชื่อลูกค้าที่สนใจได้เฉพาะคนที่ถือกุญแจ — เบอร์โทรลูกค้าไม่เปิดสาธารณะ */
export function newOwnerKey() {
  return randomBytes(18).toString('base64url');
}
export function hashKey(key) {
  return createHash('sha256').update(String(key || '')).digest('hex');
}
export function keyMatches(key, hash) {
  if (typeof key !== 'string' || !key || typeof hash !== 'string' || hash.length !== 64) return false;
  const a = Buffer.from(hashKey(key), 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
export const VIEW_SOURCES = ['facebook', 'line', 'other'];
export const VIEW_DEVICES = ['mobile', 'desktop'];
// เหตุการณ์ "เปิดดู" จากหน้า 3 มิติ (ค่าแปลก ๆ = other/mobile)
export function cleanView(b) {
  const o = b && typeof b === 'object' ? b : {};
  return {
    src: VIEW_SOURCES.includes(o.src) ? o.src : 'other',
    dev: VIEW_DEVICES.includes(o.dev) ? o.dev : 'mobile',
    first: o.first === true,
  };
}
// รวมยอดเปิดดู (ไม่แก้ของเดิม) · days เก็บย้อนหลัง 60 วัน
export function mergeStats(old, views, at) {
  const s = old && typeof old === 'object' ? old : {};
  const out = {
    views: Number(s.views) || 0,
    visitors: Number(s.visitors) || 0,
    first: Number(s.first) || 0,
    last: Number(s.last) || 0,
    src: Object.assign({ facebook: 0, line: 0, other: 0 }, s.src),
    dev: Object.assign({ mobile: 0, desktop: 0 }, s.dev),
    days: Object.assign({}, s.days),
  };
  for (const v of views) {
    out.views++;
    if (v.first) out.visitors++;
    out.src[v.src] = (out.src[v.src] || 0) + 1;
    out.dev[v.dev] = (out.dev[v.dev] || 0) + 1;
    const t = v.at || at;
    const d = new Date(t + 7 * 3600000).toISOString().slice(0, 10); // วันตามเวลาไทย
    out.days[d] = (out.days[d] || 0) + 1;
    if (!out.first || t < out.first) out.first = t;
    if (t > out.last) out.last = t;
  }
  const keep = Object.keys(out.days).sort().slice(-60);
  out.days = Object.fromEntries(keep.map((k) => [k, out.days[k]]));
  return out;
}
// ฟอร์ม "สนใจ / ขอราคา": ชื่อ + เบอร์ (ตัวเลข 9–15 หลัก) + ข้อความสั้น ๆ
export function cleanLead(b) {
  const o = b && typeof b === 'object' ? b : {};
  const name = clean(o.name, 60);
  const phoneRaw = clean(o.phone, 30).replace(/[^\d+\-\s()]/g, '');
  const digits = phoneRaw.replace(/\D/g, '');
  const note = clean(o.note, 300);
  if (!name) return { error: 'lead_name' };
  if (digits.length < 9 || digits.length > 15) return { error: 'lead_phone' };
  return { name, phone: phoneRaw.trim(), note, src: VIEW_SOURCES.includes(o.src) ? o.src : 'other' };
}
// ข้อความแจ้งร้านทาง LINE
export function leadText(rec, lead, url) {
  const m = (rec && rec.meta) || {};
  const from = { facebook: 'Facebook', line: 'LINE', other: 'ลิงก์ตรง/อื่น ๆ' }[lead.src] || 'อื่น ๆ';
  return [
    '🔔 มีลูกค้าสนใจป้าย',
    [m.title, m.size].filter(Boolean).join(' ') || 'ป้าย',
    m.customer ? `(งานของ ${m.customer})` : '',
    `ชื่อ: ${lead.name}`,
    `โทร: ${lead.phone}`,
    lead.note ? `ข้อความ: ${lead.note}` : '',
    `มาจาก: ${from}`,
    url ? `ภาพ 3 มิติ: ${url}` : '',
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 1800);
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
