// The back office for browser tests: the real shell (index.html, admin1-3.js) and the real weborders module, from a copy of the live
// app (NATTA_LIVE_DIR = a folder with files/admin/ and modules/weborders.js); the chatorders module from this repo; supabase-js
// from node_modules; the database through the PostgREST stand-in (db/helpers/pg-rest.js) on PGlite. The browser never reaches the
// internet: the shell's Supabase host and its CDN script are answered locally.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join, extname } from 'node:path';

const require = createRequire(import.meta.url);
const UMD = fileURLToPath(new URL('../../node_modules/@supabase/supabase-js/dist/umd/supabase.js', import.meta.url));
export const PROJECT_REF = 'mamlmgixovlwnjstetkj';
export const SUPABASE_HOST = `https://${PROJECT_REF}.supabase.co`;
const FORWARD = ['authorization', 'apikey', 'content-type', 'prefer', 'accept', 'range', 'x-upsert', 'accept-profile', 'content-profile', 'x-client-info'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

export function liveDir() {
  const d = process.env.NATTA_LIVE_DIR;
  return d && existsSync(join(d, 'files', 'admin', 'index.html')) && existsSync(join(d, 'modules', 'weborders.js')) ? d : null;
}

export function playwright() {
  return require('playwright');
}

// Serves the live shell at /admin/ on a local port. Returns { url, close }.
export async function serveShell() {
  const root = join(liveDir(), 'files', 'admin');
  const srv = createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    const file = p === '/admin/' || p === '/admin' ? 'index.html' : p.replace(/^\/admin\//, '');
    if (!/^[\w.-]+$/.test(file) || !existsSync(join(root, file))) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(join(root, file)));
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)) };
}

// A signed-in staff session for supabase-js (stored where supabase-js keeps it, so the shell's getSession() finds it)
export function staffSession(jwt, sub, email = 'staff@test.local') {
  return {
    access_token: jwt,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'refresh-test',
    user: { id: sub, aud: 'authenticated', role: 'authenticated', email },
  };
}

// Routes the browser's traffic: the Supabase host → the PostgREST stand-in; the CDN script → the local supabase-js; the rest is refused
export async function routeOffline(context, pgUrl) {
  const umd = readFileSync(UMD);
  await context.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.startsWith(SUPABASE_HOST)) {
      const u = new URL(url);
      const cors = {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'authorization, apikey, content-type, prefer, range, x-client-info, x-upsert, accept, accept-profile, content-profile',
        'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
      };
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      const h = req.headers();
      const headers = {};
      for (const k of FORWARD) if (h[k]) headers[k] = h[k];
      const body = req.postDataBuffer();
      const res = await fetch(pgUrl + u.pathname + u.search, { method: req.method(), headers, body: body && body.length ? body : undefined });
      const out = {};
      res.headers.forEach((v, k) => {
        if (!['content-length', 'content-encoding', 'transfer-encoding', 'connection'].includes(k)) out[k] = v;
      });
      return route.fulfill({ status: res.status, headers: out, body: Buffer.from(await res.arrayBuffer()) });
    }
    if (url === 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2') {
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: umd });
    }
    if (url.startsWith('http://127.0.0.1')) return route.continue();
    return route.abort();
  });
}
