import 'node:process';
import express from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { verifySignature, replyMessage } from './line.js';
import { buildReply, welcomeMessage, withSender, iconUrlFor, thanksReply } from './replies.js';
import { isThanksSticker, isThanks } from './matcher.js';
import { applyHoliday, createNoticeTracker } from './holiday.js';
import { createQuiet, parseAdminIds, parseAdminCommand, isWakeWord, isWhoAmI } from './quiet.js';

const token = (process.env.LINE_CHANNEL_ACCESS_TOKEN ?? '').trim();
const secret = (process.env.LINE_CHANNEL_SECRET ?? '').trim();
if (!token || !secret) {
  console.error('Set LINE_CHANNEL_ACCESS_TOKEN and LINE_CHANNEL_SECRET (see .env.example)');
  process.exit(1);
}

// Public https address of this server — Render sets RENDER_EXTERNAL_URL itself.
const baseUrl = process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || '';

const shopFile = fileURLToPath(new URL('../data/shop.json', import.meta.url));
// Re-read on every message so the owner can edit shop.json without a restart.
const loadShop = () => ({
  ...JSON.parse(readFileSync(shopFile, 'utf8')),
  iconUrl: iconUrlFor(baseUrl),
  assetBase: iconUrlFor(baseUrl) ? baseUrl.replace(/\/+$/, '') : null,
});
loadShop(); // fail fast on a broken file

const app = express();
app.use('/assets', express.static(fileURLToPath(new URL('../public', import.meta.url)), { maxAge: '1d' }));

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

// Who is mid-way through a two-step question ("which school?", "which subject for the
// admin?") — in memory, so a restart forgets it (the customer is simply asked again).
// Entries expire after 10 minutes.
function createAwait(ms = 10 * 60 * 1000) {
  const m = new Map();
  return {
    has(id) {
      const until = m.get(id);
      if (until && until < Date.now()) m.delete(id);
      return m.has(id);
    },
    set: (id) => m.set(id, Date.now() + ms),
    clear: (id) => m.delete(id),
  };
}
const awaitSchool = createAwait();
const awaitAdmin = createAwait();

const noticed = createNoticeTracker();
const quiet = createQuiet();
const adminIds = parseAdminIds(process.env.ADMIN_USER_IDS);
const hoursText = (h) => `${h} ชั่วโมง`;

// Admin switches (only from LINE accounts listed in ADMIN_USER_IDS).
function adminReply(cmd, shop) {
  if (cmd.type === 'resume') {
    quiet.resumeAll();
    return 'เปิดบอทแล้วค่ะ บอทจะกลับมาตอบลูกค้าตามปกติ 💬';
  }
  const hours = cmd.hours ?? shop.adminPauseHours ?? 4;
  quiet.pauseAll(hours * 3600 * 1000);
  return `ปิดบอทชั่วคราว ${hoursText(hours)} แล้วค่ะ บอทจะไม่ตอบลูกค้าเลยในช่วงนี้\nพิมพ์ "เปิดบอท" เพื่อให้บอทกลับมาตอบก่อนเวลาได้`;
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
  const userId = ev.source?.userId ?? 'anon';
  const holiday = (messages, extra = {}) => applyHoliday(messages, { shop, userId, tracker: noticed, ...extra });
  if (ev.type === 'follow') {
    return replyMessage(ev.replyToken, send(holiday([welcomeMessage(shop)])), token);
  }
  if (ev.type !== 'message') return;
  if (ev.message.type === 'text') {
    const said = ev.message.text;
    // Setup helper: lets an admin find the id to put in ADMIN_USER_IDS.
    if (isWhoAmI(said)) {
      return replyMessage(ev.replyToken, [{ type: 'text', text: `ไอดี LINE ของคุณคือ\n${userId}` }], token);
    }
    const cmd = adminIds.has(userId) ? parseAdminCommand(said) : null;
    if (cmd) return replyMessage(ev.replyToken, [{ type: 'text', text: adminReply(cmd, shop) }], token);
    // An admin is talking: say nothing. The customer can still bring the bot back
    // with "เมนู" — unless an admin silenced everyone.
    if (quiet.allPaused()) return;
    if (quiet.userQuiet(userId)) {
      if (!isWakeWord(said)) return;
      quiet.wake(userId);
    }
    const { messages, awaitingSchool, awaitingAdmin, handoff, quiet: leaveToAdmin } = buildReply(ev.message.text, shop, {
      awaitingSchool: awaitSchool.has(userId),
      awaitingAdmin: awaitAdmin.has(userId),
    });
    if (awaitingSchool) awaitSchool.set(userId);
    else awaitSchool.clear(userId);
    if (awaitingAdmin) awaitAdmin.set(userId);
    else awaitAdmin.clear(userId);
    // Once the customer has asked for the admin, leave the chat to them.
    if (leaveToAdmin || handoff) quiet.silenceUser(userId, (shop.handoffQuietMinutes ?? 180) * 60 * 1000);
    const out = holiday(messages, { handoff, skip: isThanks(ev.message.text) });
    return replyMessage(ev.replyToken, send(out), token);
  }
  if (quiet.silentFor(userId)) return; // photos, slips and stickers too: the admin sees them
  if (ev.message.type === 'sticker') {
    awaitSchool.clear(userId);
    awaitAdmin.clear(userId);
    // A thank-you sticker gets the same answer as a typed "ขอบคุณ". Any other sticker
    // is left alone — "ได้รับแล้ว แอดมินจะตรวจสอบ" is wrong for a wave or an OK.
    if (!isThanksSticker(ev.message.keywords)) return;
    return replyMessage(ev.replyToken, send(thanksReply(shop).messages), token);
  }
  // Slips and photos: acknowledge, a person follows up.
  return replyMessage(
    ev.replyToken,
    send(holiday([{ type: 'text', text: 'ได้รับแล้วค่ะ 🙏 แอดมินจะตรวจสอบและตอบกลับนะคะ' }])),
    token
  );
}

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`stationery-bot listening on :${port}`));
