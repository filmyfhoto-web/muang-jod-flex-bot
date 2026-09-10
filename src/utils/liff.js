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

// The quick form, as a sheet over the chat.
//
// A LIFF app's size (Compact / Tall / Full) belongs to the LIFF ID, not to the
// URL — so the pop-up card needs its own LIFF app, Size = Tall, pointing at
// <โดเมน>/app/jot?quick=1. With LIFF_ID_QUICK set the bot links to that; with
// it unset the same form still opens, just full screen.
// `query` rides through to the form — LINE appends a liff.line.me URL's query
// string to the endpoint, so `{ customer: 'ผู้ใหญ่สมศรี' }` reaches the page
// either way and the form opens with the name already filled in.
export function quickFormUrl(query = {}, env = process.env) {
  const clean = Object.fromEntries(
    Object.entries(query).filter(([, v]) => v !== undefined && v !== null && String(v) !== '')
  );
  const id = String(env.LIFF_ID_QUICK || '').trim();
  if (/^\d+-[A-Za-z0-9]+$/.test(id)) {
    const qs = new URLSearchParams(clean).toString();
    return `https://liff.line.me/${id}${qs ? `?${qs}` : ''}`;
  }
  return liffPage('jot', { quick: 1, ...clean }, env);
}

// A page inside the LIFF app: LINE appends the path to the endpoint URL, so
// liffPage('jot') opens <endpoint>/jot — the "กรอกข้อมูลงาน" form.
export function liffPage(path, query = {}, env = process.env) {
  const base = liffUrl(query, env);
  if (!base) return null;
  const clean = String(path || '').replace(/^\/+|\/+$/g, '');
  if (!clean) return base;
  const [head, qs] = base.split('?');
  return `${head}/${clean}${qs ? `?${qs}` : ''}`;
}
