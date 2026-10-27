// Shared by the end-to-end tests of the chat-to-order feature: LINE and the AI provider as stand-ins (both record what the bot
// sends them), the bot started as its own process pointed at those stand-ins, and signed LINE webhook calls.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url)); // stationery-bot/
const PRELOAD = fileURLToPath(new URL('../../tests/helpers/redirect-fetch.mjs', import.meta.url));
export const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);

const sign = (body, secret) => createHmac('sha256', secret).update(body).digest('base64');

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks);
  return { raw, json: raw.length ? JSON.parse(raw.toString('utf8')) : null };
}

function listen(handler) {
  const srv = createServer(handler);
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve({ port: srv.address().port, close: () => new Promise((r) => srv.close(r)) })));
}

// LINE as a stand-in: a profile per user id, a picture for any content request, and every call the bot makes is recorded in calls
export async function startLine({ names = {} } = {}) {
  const calls = [];
  const s = await listen(async (req, res) => {
    const { json } = await readBody(req);
    calls.push({ method: req.method, path: req.url, auth: String(req.headers.authorization || ''), body: json });
    if (req.url.includes('/content')) {
      res.writeHead(200, { 'content-type': 'image/jpeg' });
      return res.end(JPEG);
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    if (req.url.startsWith('/v2/bot/profile/')) {
      const uid = decodeURIComponent(req.url.split('/').pop());
      return res.end(JSON.stringify({ displayName: names[uid] ?? 'ลูกค้า', pictureUrl: 'https://example.com/p.png' }));
    }
    res.end('{}');
  });
  return { ...s, calls };
}

// The AI provider (Gemini's generateContent) as a stand-in: answer(prompt text) → the JSON the model replies with; each request is recorded
export async function startAi(answer) {
  const calls = [];
  const s = await listen(async (req, res) => {
    const { json } = await readBody(req);
    const text = json?.contents?.[0]?.parts?.[0]?.text ?? '';
    calls.push({ key: String(req.headers['x-goog-api-key'] || ''), system: json?.systemInstruction?.parts?.[0]?.text ?? '', text });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer(text)) }] } }] }));
  });
  return { ...s, calls };
}

// The bot as its own process (src/server.js) on a free port. The shell's own CHATDRAFTS_, LINE_, SUPABASE_, AI keys and TEST_ values
// are removed first, so only what the test passes in applies. Resolves once the bot says it is listening.
export async function startBot({ env = {} }) {
  const probe = await listen((req, res) => res.end());
  const port = probe.port;
  await probe.close();
  const base = { ...process.env };
  for (const k of Object.keys(base)) if (/^(GEMINI_|ANTHROPIC_|CHATDRAFTS_|CHATORDERS_|LINE_|SUPABASE_|TEST_)/.test(k)) delete base[k];
  let out = '';
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: ROOT,
    env: { ...base, PORT: String(port), RENDER_GIT_COMMIT: 'chain0001', SETTINGS_TTL_MS: '300', SETTINGS_TIMEOUT_MS: '1500', NODE_OPTIONS: `--import ${PRELOAD}`, ...env },
  });
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (out += d));
  const started = Date.now();
  while (!/listening on/.test(out)) {
    if (Date.now() - started > 15000) {
      child.kill();
      throw new Error('the bot did not start:\n' + out);
    }
    await new Promise((r) => setTimeout(r, 40));
  }
  return { port, logs: () => out, stop: () => child.kill() };
}

export const textEvent = (userId, text, id) => ({ type: 'message', mode: 'active', timestamp: Date.now(), replyToken: 'rt-' + id, source: { type: 'user', userId }, message: { id, type: 'text', text } });
export const imageEvent = (userId, id) => ({ type: 'message', mode: 'active', timestamp: Date.now(), replyToken: 'rt-' + id, source: { type: 'user', userId }, message: { id, type: 'image' } });

// one LINE webhook call, signed with the OA's channel secret (path '/webhook' for the shop's OA, '/webhook/ch/<key>' for another)
export function sendEvents(port, { path = '/webhook', secret, events }) {
  const body = JSON.stringify({ destination: 'U' + '0'.repeat(32), events });
  return fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-line-signature': sign(body, secret) }, body });
}

// waits until cond() gives a truthy value and returns it; if it never does, the bot's own log says why
export async function until(cond, { ms = 8000, logs = () => '' } = {}) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await cond();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error('timed out waiting; the bot said:\n' + logs().slice(-1200));
}

export const settle = (ms = 500) => new Promise((r) => setTimeout(r, ms));
