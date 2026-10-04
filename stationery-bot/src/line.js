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
  if (!res.ok) throw new Error(`LINE reply failed: ${res.status} ${await res.text()}`);
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
