import crypto from 'node:crypto';

export function verifySignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const given = Buffer.from(signature, 'base64');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

export async function replyMessage(replyToken, messages, token) {
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages }),
  });
  if (!res.ok) throw Object.assign(new Error(`LINE reply failed: ${res.status} ${await res.text()}`), { status: res.status });
}

// Push costs a message from the plan's monthly quota, unlike a reply — use it only when
// the reply token can no longer be used (e.g. after the 90 s wait).
export async function pushMessage(to, messages, token) {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to, messages }),
  });
  if (!res.ok) throw Object.assign(new Error(`LINE push failed: ${res.status} ${await res.text()}`), { status: res.status });
}

// One log line per webhook event — what kind it is, never what anyone wrote. Used to
// see whether LINE reports anything when an admin answers from OA Manager.
export function describeEvent(ev) {
  const parts = [
    `type=${ev?.type}`,
    `source=${ev?.source?.type ?? '-'}`,
    `message=${ev?.message?.type ?? '-'}`,
    `mode=${ev?.mode ?? '-'}`,
  ];
  const extra = Object.keys(ev ?? {}).filter(
    (k) => !['type', 'source', 'message', 'mode', 'timestamp', 'replyToken', 'webhookEventId', 'deliveryContext', 'postback'].includes(k)
  );
  if (extra.length) parts.push(`other=${extra.join(',')}`);
  return `[webhook] ${parts.join(' ')}`;
}

// A LINE profile: { name, picture } (picture is an https URL or null). Never throws.
export async function getProfile(userId, token) {
  try {
    const res = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { name: null, picture: null };
    const j = await res.json();
    const picture = typeof j.pictureUrl === 'string' && j.pictureUrl.startsWith('https://') ? j.pictureUrl : null;
    return { name: j.displayName ?? null, picture };
  } catch {
    return { name: null, picture: null };
  }
}

// Profiles that rarely change (the admins') are kept for an hour.
const profileCache = new Map();
export async function getProfileCached(userId, token, ttlMs = 60 * 60 * 1000, now = Date.now()) {
  const hit = profileCache.get(userId);
  if (hit && now - hit.at < ttlMs) return hit.profile;
  const profile = await getProfile(userId, token);
  if (profile.name || profile.picture) profileCache.set(userId, { at: now, profile });
  return profile;
}

// The OA's own user id (needed to build links into OA Manager's chat screen). Cached.
let botUserId;
export async function getBotUserId(token) {
  if (botUserId) return botUserId;
  try {
    const res = await fetch('https://api.line.me/v2/bot/info', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) botUserId = (await res.json()).userId;
  } catch {
    /* no link then */
  }
  return botUserId;
}

// A link to this customer's chat, built from the shop's own template, e.g.
//   "https://example/{bot}/chat/{customer}"
// There is no default: a link that does not open is worse than none. Returns null unless a
// template is set.
export function chatLink(botId, customerId, template) {
  if (!template || !customerId || customerId === 'anon') return null;
  if (template.includes('{bot}') && !botId) return null;
  return template.replace('{bot}', botId ?? '').replace('{customer}', customerId);
}
