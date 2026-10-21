// A small stand-in for Supabase's REST (PostgREST) and Storage APIs — just the parts @supabase/supabase-js uses in
// src/app/store.js: select with eq/neq/in/gte/is/not filters, order, limit, exact counts, insert, upsert (on_conflict),
// update, delete, and storage upload/download. It lets the real server run against it in tests/app-e2e.test.js.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);

function coerce(v, like) {
  if (typeof like === 'number') return Number(v);
  if (typeof like === 'boolean') return v === 'true';
  return v;
}

function matcher(key, raw) {
  let negate = false;
  let rest = raw;
  if (rest.startsWith('not.')) {
    negate = true;
    rest = rest.slice(4);
  }
  const dot = rest.indexOf('.');
  const op = rest.slice(0, dot);
  const val = rest.slice(dot + 1);
  const test = (row) => {
    const cell = row[key];
    switch (op) {
      case 'eq':
        return cell != null && String(cell) === String(val);
      case 'neq':
        return cell == null || String(cell) !== String(val);
      case 'gte':
        return cell != null && cell >= coerce(val, cell);
      case 'lt':
        return cell != null && cell < coerce(val, cell);
      case 'is':
        return val === 'null' ? cell == null : String(cell) === val;
      case 'in': {
        const list = val
          .replace(/^\(|\)$/g, '')
          .split(',')
          .map((x) => x.replace(/^"|"$/g, ''));
        return cell != null && list.includes(String(cell));
      }
      default:
        throw new Error('operator not supported by the emulator: ' + op);
    }
  };
  return (row) => (negate ? !test(row) : test(row));
}

export function createEmulator({ tables = {} } = {}) {
  const db = Object.fromEntries(Object.entries(tables).map(([k, rows]) => [k, rows.map((r) => ({ ...r }))]));
  const storage = new Map();
  const requests = [];

  const send = (res, status, body, headers = {}) => {
    const text = body === undefined ? '' : typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body);
    res.writeHead(status, { 'content-type': body instanceof Uint8Array ? 'application/octet-stream' : 'application/json', ...headers });
    res.end(text);
  };

  async function rest(req, res, url, name) {
    const rows = (db[name] ??= []);
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf8');
    const body = raw ? JSON.parse(raw) : undefined;
    const prefer = String(req.headers.prefer ?? '');
    const asObject = String(req.headers.accept ?? '').includes('vnd.pgrst.object');
    const filters = [];
    for (const [k, v] of url.searchParams) if (!RESERVED.has(k)) filters.push(matcher(k, v));
    const hit = (r) => filters.every((f) => f(r));
    const project = (r) => {
      const sel = url.searchParams.get('select');
      if (!sel || sel === '*') return { ...r };
      return Object.fromEntries(sel.split(',').map((c) => [c.trim(), r[c.trim()]]));
    };
    const reply = (list, status = 200) => {
      if (asObject) {
        if (list.length !== 1) return send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' });
        return send(res, status, list[0]);
      }
      return send(res, status, list);
    };

    if (req.method === 'GET' || req.method === 'HEAD') {
      let out = rows.filter(hit);
      const total = out.length;
      const order = url.searchParams.get('order');
      if (order) {
        for (const part of order.split(',').reverse()) {
          const [col, dir = 'asc'] = part.split('.');
          out = out.slice().sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (dir === 'desc' ? -1 : 1));
        }
      }
      const limit = url.searchParams.get('limit');
      if (limit) out = out.slice(0, Number(limit));
      const headers = prefer.includes('count=exact') ? { 'content-range': (out.length ? `0-${out.length - 1}` : '*') + '/' + total } : {};
      if (req.method === 'HEAD') return send(res, 200, undefined, headers);
      if (asObject) {
        if (out.length !== 1) return send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' });
        return send(res, 200, project(out[0]), headers);
      }
      return send(res, 200, out.map(project), headers);
    }
    if (req.method === 'POST') {
      const list = (Array.isArray(body) ? body : [body]).map((r) => ({ ...r }));
      const conflict = url.searchParams.get('on_conflict');
      const merge = prefer.includes('resolution=merge-duplicates');
      const written = [];
      for (const r of list) {
        if (conflict) {
          const cols = conflict.split(',');
          const at = rows.find((x) => cols.every((c) => x[c] === r[c]));
          if (at) {
            if (!merge) continue;
            Object.assign(at, r);
            written.push(at);
            continue;
          }
        }
        if (name !== 'app_secrets' && name !== 'app_config' && name !== 'line_chat_state' && name !== 'line_doc_state' && r.id === undefined) r.id = randomUUID();
        rows.push(r);
        written.push(r);
      }
      if (prefer.includes('return=representation')) return reply(written.map(project), 201);
      return send(res, 201);
    }
    if (req.method === 'PATCH') {
      const changed = rows.filter(hit);
      for (const r of changed) Object.assign(r, body);
      if (prefer.includes('return=representation')) return reply(changed.map(project));
      return send(res, 204);
    }
    if (req.method === 'DELETE') {
      db[name] = rows.filter((r) => !hit(r));
      return send(res, 204);
    }
    return send(res, 405, { message: 'method' });
  }

  // the two atomic helpers of line-assist's st_state table (sql/001_st_state.sql)
  async function rpc(req, res, name) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const { p_key, p_now, p_ms } = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    const rows = (db.st_state ??= []);
    const at = rows.find((r) => r.key === p_key);
    const fresh = Boolean(at) && p_now - Number(at.at) < p_ms;
    if (name === 'st_claim') {
      if (fresh) return send(res, 200, false);
      if (at) at.at = p_now;
      else rows.push({ key: p_key, at: p_now, data: {} });
      return send(res, 200, true);
    }
    if (name === 'st_touch_within') {
      if (!fresh) return send(res, 200, false);
      at.at = p_now;
      return send(res, 200, true);
    }
    return send(res, 404, { message: 'unknown function ' + name });
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://emulator');
    requests.push(`${req.method} ${url.pathname}`);
    try {
      let m = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(url.pathname);
      if (m) return await rpc(req, res, m[1]);
      m = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname);
      if (m) return await rest(req, res, url, m[1]);
      m = /^\/storage\/v1\/object\/([^/]+)\/(.+)$/.exec(url.pathname);
      if (m) {
        const key = m[1] + '/' + decodeURIComponent(m[2]);
        if (req.method === 'POST') {
          const chunks = [];
          for await (const c of req) chunks.push(c);
          storage.set(key, new Uint8Array(Buffer.concat(chunks)));
          return send(res, 200, { Key: key });
        }
        if (req.method === 'GET') return storage.has(key) ? send(res, 200, storage.get(key)) : send(res, 404, { message: 'not found' });
      }
      return send(res, 404, { message: 'unknown path ' + url.pathname });
    } catch (e) {
      return send(res, 500, { message: String(e.message) });
    }
  });

  return {
    db,
    storage,
    requests,
    listen: () => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port))),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
