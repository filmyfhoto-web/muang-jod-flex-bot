import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readConfig } from './config.mjs';
import { createStore } from './lib/store.mjs';
import { LineClient } from './lib/line.mjs';
import { handleLineEvent } from './lib/handlers.mjs';
import { buildConfirmFlex, buildSavedBatchFlex, buildSummaryFlex } from './lib/flex.mjs';
import { parseTransactions } from './lib/parser.mjs';
import { resolveLineUser, signOpaqueId, verifyLineSignature, verifyOpaqueId } from './lib/security.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const config = readConfig();
const store = createStore(config);
const line = new LineClient(config.line.accessToken);
const deps = { config, store, line };

const TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'], ['.svg', 'image/svg+xml'], ['.ico', 'image/x-icon']
]);

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

function text(res, status, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': contentType, 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

async function readRaw(req, maxBytes = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('ข้อมูลมีขนาดใหญ่เกินกำหนด');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req) {
  const raw = await readRaw(req);
  if (!raw.length) return {};
  try { return JSON.parse(raw.toString('utf8')); }
  catch { throw new Error('รูปแบบ JSON ไม่ถูกต้อง'); }
}

function validateTransactionPatch(input) {
  const patch = {};
  if (input.description !== undefined) {
    const description = String(input.description).trim();
    if (!description || description.length > 200) throw new Error('รายละเอียดต้องมี 1-200 ตัวอักษร');
    patch.description = description;
  }
  if (input.amount !== undefined) {
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) throw new Error('จำนวนเงินไม่ถูกต้อง');
    patch.amount = amount;
  }
  if (input.type !== undefined) {
    if (!['income', 'expense'].includes(input.type)) throw new Error('ประเภทรายการไม่ถูกต้อง');
    patch.type = input.type;
  }
  if (input.category !== undefined) {
    const category = String(input.category).trim();
    if (!category || category.length > 80) throw new Error('หมวดไม่ถูกต้อง');
    patch.category = category;
  }
  if (input.paymentMethod !== undefined) patch.paymentMethod = String(input.paymentMethod || '').trim() || null;
  if (input.occurredAt !== undefined) {
    const date = new Date(input.occurredAt);
    if (Number.isNaN(date.valueOf())) throw new Error('วันที่ไม่ถูกต้อง');
    patch.occurredAt = date.toISOString();
  }
  return patch;
}

async function serveStatic(urlPath, res) {
  const aliases = new Map([
    ['/', '/index.html'], ['/edit', '/edit.html'], ['/summary', '/summary.html'],
    ['/transactions', '/transactions.html'], ['/categories', '/categories.html']
  ]);
  const requested = aliases.get(urlPath) || urlPath;
  const safePath = path.resolve(PUBLIC_DIR, `.${requested}`);
  if (!safePath.startsWith(PUBLIC_DIR + path.sep)) return false;
  try {
    const body = await fs.readFile(safePath);
    res.writeHead(200, { 'content-type': TYPES.get(path.extname(safePath)) || 'application/octet-stream', 'content-length': body.length });
    res.end(body);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') return false;
    throw error;
  }
}

async function apiAuth(req) {
  return resolveLineUser(req, config);
}

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/runtime-config') {
    return json(res, 200, { demoMode: config.demoMode, liffId: config.line.liffId, testUserId: config.demoMode ? 'TEST-U001' : null });
  }
  if (req.method === 'POST' && url.pathname === '/api/demo/preview') {
    if (!config.demoMode) return json(res, 404, { error: 'not_found' });
    const lineUserId = await apiAuth(req);
    const body = await readJson(req);
    const parsed = parseTransactions(body.text);
    if (!parsed.entries.length || parsed.issues.length) return json(res, 422, parsed);
    const batch = await store.createPending({ lineUserId, sourceText: body.text, sourceMessageId: `TEST-MSG-${Date.now()}`, entries: parsed.entries });
    return json(res, 200, { batch, flex: buildConfirmFlex(batch) });
  }
  if (req.method === 'POST' && url.pathname === '/api/demo/confirm') {
    if (!config.demoMode) return json(res, 404, { error: 'not_found' });
    const lineUserId = await apiAuth(req);
    const body = await readJson(req);
    const transactions = await store.confirmPending(body.batchId, lineUserId);
    const first = transactions[0];
    const total = first ? await store.getMonthCategoryTotal(lineUserId, first.category) : 0;
    return json(res, 200, {
      transactions: transactions.map((item) => ({ ...item, editToken: signOpaqueId(item.id, config.signingSecret) })),
      flex: buildSavedBatchFlex(transactions, {
        baseUrl: config.publicBaseUrl, liffId: config.line.liffId,
        signedId: first ? signOpaqueId(first.id, config.signingSecret) : '', monthCategoryTotal: total
      })
    });
  }
  if (req.method === 'POST' && url.pathname === '/api/demo/cancel') {
    if (!config.demoMode) return json(res, 404, { error: 'not_found' });
    const lineUserId = await apiAuth(req);
    const body = await readJson(req);
    const cancelled = await store.cancelPending(body.batchId, lineUserId);
    return json(res, cancelled ? 200 : 409, { success: cancelled });
  }

  const lineUserId = await apiAuth(req);
  if (req.method === 'GET' && url.pathname === '/api/transactions') {
    const items = await store.listTransactions(lineUserId, { limit: Number(url.searchParams.get('limit') || 100) });
    return json(res, 200, { items: items.map((item) => ({ ...item, editToken: signOpaqueId(item.id, config.signingSecret) })) });
  }
  if (req.method === 'GET' && url.pathname.startsWith('/api/transactions/token/')) {
    const token = decodeURIComponent(url.pathname.slice('/api/transactions/token/'.length));
    const id = verifyOpaqueId(token, config.signingSecret);
    if (!id) return json(res, 400, { error: 'ลิงก์แก้ไขไม่ถูกต้อง' });
    const item = await store.getTransaction(id, lineUserId);
    return item ? json(res, 200, { item }) : json(res, 404, { error: 'ไม่พบรายการ' });
  }
  const txMatch = url.pathname.match(/^\/api\/transactions\/([^/]+)$/);
  if (txMatch && req.method === 'PATCH') {
    const body = await readJson(req);
    const item = await store.updateTransaction(decodeURIComponent(txMatch[1]), lineUserId, validateTransactionPatch(body));
    return json(res, 200, { item });
  }
  if (txMatch && req.method === 'DELETE') {
    const deleted = await store.softDeleteTransaction(decodeURIComponent(txMatch[1]), lineUserId);
    return json(res, deleted ? 200 : 404, { success: deleted });
  }
  if (req.method === 'GET' && url.pathname === '/api/summary') {
    const period = url.searchParams.get('period') === 'month' ? 'month' : 'today';
    const summary = await store.getSummary(lineUserId, period);
    return json(res, 200, { summary, flex: buildSummaryFlex(summary, { liffId: config.line.liffId }) });
  }
  return json(res, 404, { error: 'ไม่พบ API' });
}

async function handleWebhook(req, res) {
  const raw = await readRaw(req);
  if (!config.demoMode && !verifyLineSignature(raw, req.headers['x-line-signature'], config.line.channelSecret)) {
    return json(res, 401, { error: 'invalid_signature' });
  }
  let payload;
  try { payload = JSON.parse(raw.toString('utf8') || '{}'); }
  catch { return json(res, 400, { error: 'invalid_json' }); }
  for (const event of payload.events || []) {
    try {
      const messages = await handleLineEvent(event, deps);
      if (messages.length && event.replyToken) {
        if (config.demoMode) console.log('[TEST LINE REPLY]', JSON.stringify(messages));
        else await line.reply(event.replyToken, messages);
      }
    } catch (error) {
      console.error('LINE event error:', error.message);
      if (!config.demoMode && event.replyToken) {
        await line.reply(event.replyToken, [{ type: 'text', text: 'ระบบขัดข้องชั่วคราว กรุณาลองอีกครั้งค่ะ' }]).catch(() => {});
      }
    }
  }
  return json(res, 200, { ok: true, mode: config.demoMode ? 'TEST' : 'production' });
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    try {
      if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true, mode: config.demoMode ? 'TEST' : 'production' });
      if (req.method === 'POST' && url.pathname === '/webhook/line') return handleWebhook(req, res);
      if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
      if (req.method === 'GET' && await serveStatic(url.pathname, res)) return;
      return text(res, 404, 'Not found');
    } catch (error) {
      console.error(error);
      const status = /ตัวตน|token|TEST/.test(error.message) ? 401 : 400;
      return json(res, status, { error: error.message || 'เกิดข้อผิดพลาด' });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createServer().listen(config.port, () => {
    console.log(`ม่วงจดให้ ${config.demoMode ? 'TEST' : 'PRODUCTION'}: ${config.publicBaseUrl}`);
  });
}
