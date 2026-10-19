// Admin switches. While an admin is talking to customers themselves they can silence the
// bot for everyone from their own LINE account ("ปิดบอท" … "เปิดบอท"); it ends by itself so
// it is never left off by mistake.

const PAUSE = /^(?:ปิดบอท|พักบอท|แอดมินออนไลน์|แอดมินคุยอยู่)\s*(\d+(?:\.\d+)?)?\s*(?:ชม\.?|ชั่วโมง)?$/;
const RESUME = /^(?:เปิดบอท|เลิกพักบอท|แอดมินออฟไลน์)$/;

// → { type: 'pause', hours: number | null } | { type: 'resume' } | { type: 'quota' } | null
export function parseAdminCommand(text) {
  const t = String(text ?? '').trim();
  const p = PAUSE.exec(t);
  if (p) return { type: 'pause', hours: p[1] ? Number(p[1]) : null };
  if (RESUME.test(t)) return { type: 'resume' };
  if (/^(?:โควตา|quota)$/i.test(t)) return { type: 'quota' };
  return null;
}

export const isWhoAmI = (text) => /^(?:ไอดีฉัน|myid)$/i.test(String(text ?? '').trim());

// Master switch: while paused the bot answers nobody and does nothing at all.
export function isPaused(shop, paused) {
  const v = String(paused ?? '').trim().toLowerCase();
  return shop?.paused === true || (v !== '' && !['0', 'false', 'off', 'no'].includes(v));
}
