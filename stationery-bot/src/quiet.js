// "Don't answer while an admin is talking."
//
// LINE never tells a bot what an admin types in OA Manager, so the bot cannot see
// a human has joined. Two switches stand in for that:
//  1. after a customer asks for the admin, the bot stays quiet for that customer
//     for a while (they can bring it back by typing "เมนู");
//  2. an admin can silence the bot for everyone from their own LINE account
//     ("ปิดบอท" … "เปิดบอท"), which also expires on its own so it is never left off.
// Both live in memory: a restart makes the bot talk again, which fails safe.

export function createQuiet(now = () => Date.now()) {
  const users = new Map(); // userId → quiet until (ms)
  let allUntil = 0;
  return {
    silenceUser(userId, ms) {
      users.set(userId, now() + ms);
    },
    wake(userId) {
      users.delete(userId);
    },
    userQuiet(userId) {
      const until = users.get(userId);
      if (until !== undefined && until <= now()) users.delete(userId);
      return users.has(userId);
    },
    pauseAll(ms) {
      allUntil = now() + ms;
    },
    resumeAll() {
      allUntil = 0;
    },
    allPaused() {
      return allUntil > now();
    },
    // true → send nothing to this customer right now
    silentFor(userId) {
      return this.allPaused() || this.userQuiet(userId);
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
  return null;
}

// A customer bringing the bot back after asking for the admin.
export const isWakeWord = (text) =>
  /^(?:เมนู|บอท|menu|เริ่มใหม่)\s*(?:ค่ะ|คะ|ครับ|คับ|นะคะ|นะครับ|นะ)*$/i.test(String(text ?? '').trim());

export const isWhoAmI = (text) => /^(?:ไอดีฉัน|myid)$/i.test(String(text ?? '').trim());

// Master switch: while paused the bot answers nobody and does nothing at all.
// Set "paused": true in data/shop.json, or BOT_PAUSED=1 in the host's environment.
export function isPaused(shop, env = {}) {
  const v = String(env.BOT_PAUSED ?? '').trim().toLowerCase();
  return shop?.paused === true || (v !== '' && !['0', 'false', 'off', 'no'].includes(v));
}
