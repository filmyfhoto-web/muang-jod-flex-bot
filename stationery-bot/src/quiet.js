// Admin switches. While an admin is talking to customers themselves they can silence
// the bot for everyone from their own LINE account ("ปิดบอท" … "เปิดบอท"); it ends by
// itself so it is never left off by mistake. In memory: a restart makes the bot talk again.

export function createQuiet(now = () => Date.now()) {
  let allUntil = 0;
  return {
    pauseAll(ms) {
      allUntil = now() + ms;
    },
    resumeAll() {
      allUntil = 0;
    },
    allPaused() {
      return allUntil > now();
    },
  };
}

export function parseAdminIds(value) {
  return new Set(
    String(value ?? '')
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

const PAUSE = /^(?:ปิดบอท|พักบอท|แอดมินออนไลน์|แอดมินคุยอยู่)\s*(\d+(?:\.\d+)?)?\s*(?:ชม\.?|ชั่วโมง)?$/;
const RESUME = /^(?:เปิดบอท|เลิกพักบอท|แอดมินออฟไลน์)$/;

// → { type: 'pause', hours: number | null } | { type: 'resume' } | null
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
// Set "paused": true in data/shop.json, or BOT_PAUSED=1 in the host's environment.
export function isPaused(shop, env = {}) {
  const v = String(env.BOT_PAUSED ?? '').trim().toLowerCase();
  return shop?.paused === true || (v !== '' && !['0', 'false', 'off', 'no'].includes(v));
}
