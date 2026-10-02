import 'node:process';
import express from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { verifySignature, replyMessage } from './line.js';
import { buildReply, welcomeMessage, withSender } from './replies.js';

const token = (process.env.LINE_CHANNEL_ACCESS_TOKEN ?? '').trim();
const secret = (process.env.LINE_CHANNEL_SECRET ?? '').trim();
if (!token || !secret) {
  console.error('Set LINE_CHANNEL_ACCESS_TOKEN and LINE_CHANNEL_SECRET (see .env.example)');
  process.exit(1);
}

const shopFile = fileURLToPath(new URL('../data/shop.json', import.meta.url));
// Re-read on every message so the owner can edit shop.json without a restart.
const loadShop = () => JSON.parse(readFileSync(shopFile, 'utf8'));
loadShop(); // fail fast on a broken file

const app = express();
app.use('/assets', express.static(fileURLToPath(new URL('../public', import.meta.url)), { maxAge: '1d' }));

// Public https address of this server — Render sets RENDER_EXTERNAL_URL itself.
const baseUrl = process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || '';
const send = (messages) => withSender(messages, baseUrl);
app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/webhook', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifySignature(req.body, req.get('x-line-signature'), secret)) return res.sendStatus(401);
  res.sendStatus(200); // answer LINE first; replies happen after
  let events = [];
  try {
    events = JSON.parse(req.body.toString('utf8')).events ?? [];
  } catch {
    return;
  }
  for (const ev of events) handleEvent(ev).catch((e) => console.error('[event]', e.message));
});

// Who is mid-way through "which school?" — in memory, so a restart forgets it
// (the customer is simply asked again). Entries expire after 10 minutes.
const awaiting = new Map();
const AWAIT_MS = 10 * 60 * 1000;
function isAwaiting(userId) {
  const until = awaiting.get(userId);
  if (until && until < Date.now()) awaiting.delete(userId);
  return awaiting.has(userId);
}

async function handleEvent(ev) {
  if (!ev.replyToken) return;
  let shop;
  try {
    shop = loadShop();
  } catch (e) {
    console.error('[shop.json]', e.message);
    return;
  }
  if (ev.type === 'follow') {
    return replyMessage(ev.replyToken, send([welcomeMessage(shop)]), token);
  }
  if (ev.type !== 'message') return;
  if (ev.message.type === 'text') {
    const userId = ev.source?.userId ?? 'anon';
    const { messages, awaitingSchool } = buildReply(ev.message.text, shop, { awaitingSchool: isAwaiting(userId) });
    if (awaitingSchool) awaiting.set(userId, Date.now() + AWAIT_MS);
    else awaiting.delete(userId);
    return replyMessage(ev.replyToken, send(messages), token);
  }
  // Slips, photos, stickers: acknowledge, a person follows up.
  return replyMessage(
    ev.replyToken,
    send([{ type: 'text', text: 'ได้รับแล้วค่ะ 🙏 แอดมินจะตรวจสอบและตอบกลับนะคะ' }]),
    token
  );
}

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`stationery-bot listening on :${port}`));
