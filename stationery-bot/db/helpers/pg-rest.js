// A PostgREST-compatible HTTP server backed by the PGlite database (a real PostgreSQL), so the bot's own Supabase client
// (@supabase/supabase-js, the same one production uses) talks to real SQL: constraints, the partial unique index, RLS and the
// functions all run for real. Only the subset the bot and the back office use is implemented:
//   select (columns, eq/neq/gt/gte/lt/lte/is/in/not, order, limit, offset) · insert (one or many, DEFAULT for missing keys,
//   on_conflict with ignore-duplicates / merge-duplicates) · update · delete · rpc/<fn> (named arguments) ·
//   storage upload/download · functions/v1/* (recorded, answered 200 — the push-notify edge function is not reimplemented).
// Service-key requests run as the service_role role, a user JWT runs as the authenticated role with request.jwt.claims set —
// the same way Supabase does it. The JWT signature is not checked here (this is a test double).
import http from 'node:http';

const IDENT = /^[a-z_][a-z0-9_]*$/;
const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);

class HttpError extends Error {
  constructor(status, message, code = 'PGRST') {
    super(message);
    this.httpStatus = status;
    this.code = code;
  }
}

const quote = (id) => {
  if (!IDENT.test(id)) throw new HttpError(400, `bad identifier: ${id}`);
  return `"${id}"`;
};

const encode = (v) => {
  if (v === undefined) return null;
  if (v !== null && typeof v === 'object') return JSON.stringify(v);
  return v;
};

function decodeJwt(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function whereSql(params, values) {
  const parts = [];
  for (const [col, raw] of params) {
    if (RESERVED.has(col)) continue;
    let expr = raw;
    let neg = false;
    if (expr.startsWith('not.')) {
      neg = true;
      expr = expr.slice(4);
    }
    const dot = expr.indexOf('.');
    const op = expr.slice(0, dot);
    const val = expr.slice(dot + 1);
    const c = quote(col);
    let sql;
    switch (op) {
      case 'eq':
        values.push(val);
        sql = `${c} = $${values.length}`;
        break;
      case 'neq':
        values.push(val);
        sql = `${c} <> $${values.length}`;
        break;
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte': {
        values.push(val);
        const sym = { gt: '>', gte: '>=', lt: '<', lte: '<=' }[op];
        sql = `${c} ${sym} $${values.length}`;
        break;
      }
      case 'is':
        sql = val === 'null' ? `${c} is null` : `${c} is ${val === 'true' ? 'true' : 'false'}`;
        break;
      case 'in': {
        const list = val
          .replace(/^\(|\)$/g, '')
          .split(',')
          .map((x) => x.replace(/^"|"$/g, ''))
          .filter((x) => x !== '');
        values.push(list);
        sql = `${c}::text = any($${values.length}::text[])`;
        break;
      }
      default:
        throw new HttpError(400, `filter not supported by the test server: ${op}`);
    }
    parts.push(neg ? `not (${sql})` : sql);
  }
  return parts.length ? ` where ${parts.join(' and ')}` : '';
}

function orderSql(order) {
  const parts = order.split(',').map((spec) => {
    const [col, dir = 'asc', nulls] = spec.split('.');
    const d = dir === 'desc' ? 'desc' : 'asc';
    const n = nulls === 'nullslast' ? ' nulls last' : nulls === 'nullsfirst' ? ' nulls first' : '';
    return `${quote(col)} ${d}${n}`;
  });
  return ` order by ${parts.join(', ')}`;
}

export async function startPgRest({ db, serviceKey, port = 0 }) {
  const storage = new Map(); // "bucket/path" → { bytes, contentType }
  const functions = []; // { path, body } for the edge functions the bot calls
  let queue = Promise.resolve();
  const serial = (fn) => {
    const next = queue.then(fn);
    queue = next.catch(() => {});
    return next;
  };

  function principal(req) {
    const apikey = String(req.headers.apikey || '');
    const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (bearer === serviceKey || apikey === serviceKey) return { role: 'service_role', claims: { role: 'service_role' } };
    const claims = decodeJwt(bearer);
    if (claims && claims.role === 'authenticated') return { role: 'authenticated', claims };
    return { role: 'anon', claims: { role: 'anon' } };
  }

  // one transaction per request, as the requester's role; RLS and grants apply to it
  function inRole(pr, fn) {
    return serial(() =>
      db.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(pr.claims)]);
        await tx.exec(`set local role ${pr.role}`);
        return fn(tx);
      }),
    );
  }

  async function select(tx, table, params) {
    const values = [];
    const cols = params.get('select') || '*';
    if (cols.includes('(')) throw new HttpError(400, 'embedded resources are not supported by the test server');
    const colSql = cols === '*' ? '*' : cols.split(',').map((c) => quote(c.trim())).join(', ');
    let sql = `select ${colSql} from ${quote(table)}${whereSql(params, values)}`;
    if (params.get('order')) sql += orderSql(params.get('order'));
    if (params.get('limit')) sql += ` limit ${Number(params.get('limit')) | 0}`;
    if (params.get('offset')) sql += ` offset ${Number(params.get('offset')) | 0}`;
    const r = await tx.query(`select coalesce(json_agg(t), '[]'::json)::text as j from (${sql}) t`, values);
    return JSON.parse(r.rows[0].j);
  }

  async function insert(tx, table, body, params, prefer) {
    const rows = Array.isArray(body) ? body : [body];
    if (!rows.length) return [];
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const values = [];
    const tuples = rows.map((r) => {
      const cells = cols.map((c) => {
        if (!(c in r)) return 'default';
        values.push(encode(r[c]));
        return `$${values.length}`;
      });
      return `(${cells.join(', ')})`;
    });
    let conflict = '';
    const onConflict = params.get('on_conflict');
    if (onConflict) {
      const keys = onConflict.split(',').map(quote).join(', ');
      if (prefer.includes('resolution=ignore-duplicates')) conflict = ` on conflict (${keys}) do nothing`;
      else if (prefer.includes('resolution=merge-duplicates')) {
        conflict = ` on conflict (${keys}) do update set ${cols.map((c) => `${quote(c)} = excluded.${quote(c)}`).join(', ')}`;
      }
    }
    const head = `insert into ${quote(table)} (${cols.map(quote).join(', ')}) values ${tuples.join(', ')}${conflict}`;
    if (prefer.includes('return=representation')) {
      const r = await tx.query(`with ins as (${head} returning *) select coalesce(json_agg(ins), '[]'::json)::text as j from ins`, values);
      return JSON.parse(r.rows[0].j);
    }
    await tx.query(head, values);
    return null;
  }

  async function update(tx, table, body, params, prefer) {
    const values = [];
    const sets = Object.keys(body).map((c) => {
      values.push(encode(body[c]));
      return `${quote(c)} = $${values.length}`;
    });
    const sql = `update ${quote(table)} set ${sets.join(', ')}${whereSql(params, values)} returning *`;
    const r = await tx.query(`with upd as (${sql}) select coalesce(json_agg(upd), '[]'::json)::text as j from upd`, values);
    const rows = JSON.parse(r.rows[0].j);
    return prefer.includes('return=representation') ? rows : null;
  }

  async function remove(tx, table, params, prefer) {
    const values = [];
    const sql = `delete from ${quote(table)}${whereSql(params, values)} returning *`;
    const r = await tx.query(`with del as (${sql}) select coalesce(json_agg(del), '[]'::json)::text as j from del`, values);
    return prefer.includes('return=representation') ? JSON.parse(r.rows[0].j) : null;
  }

  async function rpc(tx, name, args) {
    if (!IDENT.test(name)) throw new HttpError(404, 'no such function');
    const values = [];
    const named = Object.keys(args || {}).map((k) => {
      values.push(encode(args[k]));
      return `${quote(k)} => $${values.length}`;
    });
    const r = await tx.query(`select to_json(x.r)::text as j from (select public.${name}(${named.join(', ')}) as r) x`, values);
    return r.rows[0].j;
  }

  const send = (res, status, body, type = 'application/json') => {
    res.writeHead(status, { 'content-type': type });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };

  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks);
    const url = new URL(req.url, 'http://db');
    const pr = principal(req);
    try {
      let m = /^\/rest\/v1\/rpc\/([a-z_0-9]+)$/.exec(url.pathname);
      if (m) {
        const args = raw.length ? JSON.parse(raw.toString('utf8')) : {};
        return send(res, 200, await inRole(pr, (tx) => rpc(tx, m[1], args)));
      }
      m = /^\/rest\/v1\/([a-z_0-9]+)$/.exec(url.pathname);
      if (m) {
        const table = m[1];
        const prefer = String(req.headers.prefer || '');
        const single = String(req.headers.accept || '').includes('vnd.pgrst.object');
        const body = raw.length ? JSON.parse(raw.toString('utf8')) : undefined;
        const out = await inRole(pr, async (tx) => {
          if (req.method === 'GET' || req.method === 'HEAD') return select(tx, table, url.searchParams);
          if (req.method === 'POST') return insert(tx, table, body, url.searchParams, prefer);
          if (req.method === 'PATCH') return update(tx, table, body, url.searchParams, prefer);
          if (req.method === 'DELETE') return remove(tx, table, url.searchParams, prefer);
          throw new HttpError(405, 'method not allowed');
        });
        if (single && Array.isArray(out)) {
          if (out.length !== 1) throw new HttpError(406, 'JSON object requested, multiple (or no) rows returned', 'PGRST116');
          return send(res, 200, out[0]);
        }
        return send(res, 200, out ?? []);
      }
      m = /^\/storage\/v1\/object\/([^/]+)\/(.+)$/.exec(url.pathname);
      if (m) {
        const key = `${m[1]}/${decodeURIComponent(m[2])}`;
        if (req.method === 'POST') {
          if (storage.has(key) && req.headers['x-upsert'] !== 'true') throw new HttpError(409, 'The resource already exists', 'Duplicate');
          storage.set(key, { bytes: raw, contentType: req.headers['content-type'] || 'application/octet-stream' });
          return send(res, 200, { Key: key });
        }
        if (req.method === 'GET') {
          const hit = storage.get(key);
          if (!hit) throw new HttpError(404, 'not found', 'NotFound');
          return send(res, 200, hit.bytes, hit.contentType);
        }
      }
      if (url.pathname.startsWith('/functions/v1/')) {
        functions.push({ path: url.pathname, body: raw.length ? JSON.parse(raw.toString('utf8')) : null });
        return send(res, 200, { ok: true });
      }
      throw new HttpError(404, `unknown path ${url.pathname}`);
    } catch (e) {
      const status = e.httpStatus || (e.code === '23505' ? 409 : e.code === '42501' ? 403 : 400);
      send(res, status, { code: e.code || 'PGRST', message: e.message, details: null, hint: null });
    }
  });

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}`,
    storage,
    functions,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

// A JWT for a signed-in staff member (the signature is not checked by the test server).
export function staffJwt(sub) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', aud: 'authenticated' })}.sig`;
}
