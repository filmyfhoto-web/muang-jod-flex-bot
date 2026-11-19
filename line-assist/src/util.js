export const MIN = 60 * 1000;
export const HOUR = 60 * MIN;

// base64 of raw bytes without Node's Buffer, so the same code runs in Deno and Node.
export function toBase64(bytes) {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(s);
}

// Compares two strings without stopping at the first difference.
export function sameStr(a, b) {
  a = String(a ?? '');
  b = String(b ?? '');
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// The signature LINE puts in x-line-signature: base64(HMAC-SHA256(secret, body)).
export async function hmacBase64(secret, body) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
  return toBase64(mac);
}
