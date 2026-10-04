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
