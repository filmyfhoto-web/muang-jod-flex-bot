import { createHmac, timingSafeEqual } from 'node:crypto';
import { matchSize, inferUnit } from './area.js';

// ตั๋วเปิดแอปจำลองป้าย (/sign/) จากงานในม่วงจด
//
// ร้านกด "ทำภาพ 3 มิติ" บนงานในม่วงจด (ผ่าน LINE login แล้ว) → เซิร์ฟเวอร์ออกตั๋วให้งานนั้นงานเดียว
// แอปจำลองป้ายไม่มีล็อกอินของตัวเอง ถือตั๋วนี้ไว้ใน ?job= แล้วใช้มันอ่านงาน (ชื่อลูกค้า ขนาด รูปที่แนบ)
// และบันทึกภาพจำลองกลับเข้างานเดียวกันได้ — ทำอย่างอื่นไม่ได้ เปิดงานอื่นไม่ได้
//
// ตั๋ว = ข้อมูล (เจ้าของงาน · งาน · วันหมดอายุ) + ลายเซ็น HMAC ด้วย secret ของเซิร์ฟเวอร์
// ไม่ต้องเก็บอะไรในฐานข้อมูล เซิร์ฟเวอร์รีสตาร์ต/หลับแล้วตื่นก็ยังใช้ได้ · แก้ข้อมูลในตั๋วแล้วลายเซ็นไม่ตรง
// อายุ 3 วัน (ร้านทำภาพต่อพรุ่งนี้ได้) หมดแล้วกดปุ่มในม่วงจดใหม่ได้ตั๋วใหม่

export const TICKET_DAYS = 3;
const SIG_LENGTH = 32;

function secret() {
  return process.env.MOCKUP_TICKET_SECRET || process.env.RECEIPT_SHOP_SECRET || process.env.LINE_CHANNEL_SECRET || '';
}

function sign(body, key) {
  return createHmac('sha256', key).update(`sign-mockup-job:${body}`).digest('base64url').slice(0, SIG_LENGTH);
}

export function mintTicket(userId, jobId, { now = Date.now(), days = TICKET_DAYS, key = secret() } = {}) {
  if (!key || !userId || !jobId) return null;
  const body = Buffer.from(JSON.stringify({ u: String(userId), j: String(jobId), e: Math.floor(now / 1000) + days * 86400 })).toString('base64url');
  return `${body}.${sign(body, key)}`;
}

// คืน { userId, jobId, expires } · ตั๋วหมดอายุ → { expired: true } · ปลอม/พัง → null
export function readTicket(ticket, { now = Date.now(), key = secret() } = {}) {
  if (!key || typeof ticket !== 'string' || ticket.length > 400) return null;
  const m = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(ticket);
  if (!m || m[2].length !== SIG_LENGTH) return null;
  const want = sign(m[1], key);
  if (!timingSafeEqual(Buffer.from(want), Buffer.from(m[2]))) return null;
  let p;
  try {
    p = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!p || typeof p.u !== 'string' || typeof p.j !== 'string' || !(Number(p.e) > 0)) return null;
  if (p.e * 1000 < now) return { expired: true };
  return { userId: p.u, jobId: p.j, expires: p.e * 1000 };
}

const CM_PER = { cm: 1, m: 100, inch: 2.54, ft: 30.48 };

// ขนาดป้าย (ซม.) จากงาน: รายการ → ชื่องาน → หมายเหตุ ("ไวนิล 160*300", "1.2x2.4 ม.", "60 x 90 cm")
// ไม่เจอ → null (แอปใช้ขนาดเดิม)
export function sizeFromJob(job) {
  const texts = [];
  for (const it of job?.items || []) texts.push([it.item_name, it.size].filter(Boolean).join(' '));
  texts.push(job?.job_name, job?.note);
  for (const t of texts) {
    const s = matchSize(t);
    if (!s) continue;
    const unit = s.unit || inferUnit(s.width, s.height);
    const w = Math.round(s.width * CM_PER[unit] * 10) / 10;
    const h = Math.round(s.height * CM_PER[unit] * 10) / 10;
    if (w >= 1 && h >= 1 && w <= 5000 && h <= 5000) return { w, h };
  }
  return null;
}

// ข้อมูลงานที่ส่งให้แอปจำลองป้าย — เฉพาะที่ใช้ทำภาพ (ไม่ส่งยอดค้าง/การจ่ายเงิน/เบอร์ของคนอื่น)
export function jobForMockup(job, images = []) {
  return {
    id: String(job.id),
    number: job.job_number || '',
    name: job.job_name || '',
    customer: job.customer_name || '',
    total: Number(job.total) || 0,
    items: (job.items || []).slice(0, 12).map((it) => ({
      name: it.item_name || '',
      size: it.size || '',
      qty: Number(it.quantity) || 1,
    })),
    size: sizeFromJob(job),
    images: images.map((a) => ({ id: a.id })),
  };
}

// ลิงก์ดู 3 มิติของร้านเอง (…/sign/v/<id>) — ไม่รับลิงก์อื่นมาแปะในงาน
export function isShareLink(url) {
  return typeof url === 'string' && url.length <= 200 && /^https?:\/\/[A-Za-z0-9.-]+(?::\d+)?\/sign\/v\/[A-Za-z0-9]{6,32}$/.test(url);
}

// หมายเหตุงาน + บรรทัดลิงก์ 3 มิติ — บันทึกซ้ำแทนบรรทัดเดิม (ลิงก์ล่าสุดบรรทัดเดียว) · ไม่เกิน 500 ตัวตามช่องหมายเหตุ
// ลิงก์ไม่ใช่ของร้าน / ลิงก์เดิมอยู่แล้ว / ยาวเกิน → null (ไม่แตะหมายเหตุเดิม)
export const LINK_LINE = '🪧 ภาพ 3 มิติ: ';
export function noteWithLink(note, link) {
  const cur = String(note || '');
  if (!isShareLink(link) || cur.includes(link)) return null;
  const kept = cur
    .split('\n')
    .filter((l) => !l.startsWith(LINK_LINE))
    .join('\n')
    .trim();
  const line = LINK_LINE + link;
  const next = kept ? `${kept}\n${line}` : line;
  return next.length <= 500 ? next : null;
}
