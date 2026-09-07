// LIFF (LINE Front-end Framework) support for the dashboard / edit form.
//
// A LIFF ID looks like "1234567890-AbCdEfGh": the part before the dash is the
// LINE Login channel that owns the LIFF app, which is exactly what an API
// access token must have been issued for. Nothing here is required — with no
// LIFF_ID the bot simply shows no "open dashboard" buttons.

export function liffId(env = process.env) {
  const id = String(env.LIFF_ID || '').trim();
  return /^\d+-[A-Za-z0-9]+$/.test(id) ? id : null;
}

export function liffChannelId(env = process.env) {
  const id = liffId(env);
  return id ? id.split('-')[0] : null;
}

// https://liff.line.me/<id>?edit=<jobId> etc. Null when LIFF isn't configured.
export function liffUrl(query = {}, env = process.env) {
  const id = liffId(env);
  if (!id) return null;
  const qs = new URLSearchParams(
    Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString();
  return `https://liff.line.me/${id}${qs ? `?${qs}` : ''}`;
}
