import crypto from 'node:crypto';

export function verifyLineSignature(rawBody, signature, channelSecret) {
  if (!signature || !channelSecret) return false;
  const expected = crypto.createHmac('sha256', channelSecret).update(rawBody).digest('base64');
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function signOpaqueId(id, secret) {
  const mac = crypto.createHmac('sha256', secret).update(String(id)).digest('base64url').slice(0, 20);
  return `${id}.${mac}`;
}

export function verifyOpaqueId(value, secret) {
  const raw = String(value || '');
  const splitAt = raw.lastIndexOf('.');
  if (splitAt < 1) return null;
  const id = raw.slice(0, splitAt);
  const expected = signOpaqueId(id, secret);
  const left = Buffer.from(raw);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right) ? id : null;
}

export async function resolveLineUser(req, config) {
  if (config.demoMode) {
    const testId = req.headers['x-test-user-id'] || 'TEST-U001';
    if (!String(testId).startsWith('TEST-')) throw new Error('โหมดทดลองรับเฉพาะผู้ใช้ TEST');
    return String(testId);
  }
  const auth = String(req.headers.authorization || '');
  const idToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!idToken) throw new Error('ไม่พบ LINE ID token');
  const body = new URLSearchParams({ id_token: idToken, client_id: config.line.loginChannelId });
  const response = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  });
  const profile = await response.json();
  if (!response.ok || !profile.sub) throw new Error('ตรวจสอบตัวตน LINE ไม่สำเร็จ');
  return profile.sub;
}
