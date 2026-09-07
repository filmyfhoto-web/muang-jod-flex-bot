// Normalise a pasted Supabase project URL.
//
// The dashboard shows several URLs for one project (Project URL, REST
// endpoint `…/rest/v1`, Auth `…/auth/v1`, Storage `…/storage/v1`). The client
// needs the bare project origin; anything else makes every request hit
// `/rest/v1/rest/v1/...` and fail with PGRST125 "Invalid path". Accept the
// common mistakes and return the origin, or null if it is not a URL at all.
const SERVICE_PATH = /\/(rest|auth|storage|realtime|functions|graphql)\/v1\/?.*$/i;

export function normalizeSupabaseUrl(raw) {
  let s = String(raw ?? '').trim();
  s = s.replace(/^['"`]+|['"`]+$/g, '').trim(); // pasted with quotes
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`; // "xxx.supabase.co"

  let url;
  try {
    url = new URL(s);
  } catch {
    return null;
  }

  const path = url.pathname.replace(SERVICE_PATH, '').replace(/\/+$/, '');
  return `${url.origin}${path}`;
}
