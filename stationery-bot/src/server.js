import 'node:process';
import express from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { verifySignature, replyMessage, pushMessage, describeEvent } from './line.js';
import { buildReply, welcomeMessage, withSender, iconUrlFor, thanksReply } from './replies.js';
import { isThanksSticker, isThanks } from './matcher.js';
import { applyHoliday, createNoticeTracker } from './holiday.js';
import { createIntake, intakeMessages, intakeWindowMs } from './intake.js';
import { waitFor } from './delay.js';
import { isPaused, createQuiet, parseAdminIds, parseAdminCommand, isWhoAmI } from './quiet.js';

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
  for (const ev of events) {
    console.log(describeEvent(ev)); // even while paused
    handleEvent(ev).catch((e) => console.error('[event]', e.message));
  }
});

// Who is mid-way through a two-step question ("which school?") — in memory, so a restart forgets it (the customer is simply asked again).
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

const intake = createIntake();

// A reply token is only good for a short while; after the 90 s wait it may be gone, and
// then the message goes out as a push (which counts against the plan's monthly quota).
async function deliver(ev, userId, messages) {
  const out = send(messages);
  try {
    await replyMessage(ev.replyToken, out, token);
  } catch (e) {
    if (e.status === 400 && userId !== 'anon') return pushMessage(userId, out, token);
    throw e;
  }
}

// Runs now, or after the shop's wait. Everything is decided when it runs, so an admin
// pausing the bot during the wait cancels the answer.
function later(secs, fn) {
  if (secs <= 0) return fn();
  setTimeout(() => fn().catch((e) => console.error('[event]', e.message)), secs * 1000);
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
  if (isPaused(shop, process.env)) return; // paused: no replies, no welcome, nothing
  const userId = ev.source?.userId ?? 'anon';
  const holiday = (shopNow, messages, extra = {}) =>
    applyHoliday(messages, { shop: shopNow, userId, tracker: noticed, ...extra });
  if (ev.type === 'follow') {
    return replyMessage(ev.replyToken, send(holiday(shop, [welcomeMessage(shop)])), token);
  }
  if (ev.type !== 'message') return;

  // Something the shop has no ready answer for: ask for the job details once, thank
  // once, then leave it to the admin (see intake.js).
  const unknownMessages = (shopNow) => intakeMessages(shopNow, intake.next(userId, intakeWindowMs(shopNow)));

  if (ev.message.type === 'text') {
    const said = ev.message.text;
    // Setup helper: lets an admin find the id to put in ADMIN_USER_IDS.
    if (isWhoAmI(said)) {
      return replyMessage(ev.replyToken, [{ type: 'text', text: `ไอดี LINE ของคุณคือ\n${userId}` }], token);
    }
    const cmd = adminIds.has(userId) ? parseAdminCommand(said) : null;
    if (cmd) return replyMessage(ev.replyToken, [{ type: 'text', text: adminReply(cmd, shop) }], token);
    // An admin silenced the bot for everyone: say nothing.
    if (quiet.allPaused()) return;
    const secs = waitFor(shop, said, { awaitingSchool: awaitSchool.has(userId), env: process.env });
    return later(secs, async () => {
      const shopNow = secs > 0 ? loadShop() : shop; // the shop file may have changed while waiting
      if (isPaused(shopNow, process.env) || quiet.allPaused()) return;
      const r = buildReply(said, shopNow, { awaitingSchool: awaitSchool.has(userId) });
      if (r.awaitingSchool) awaitSchool.set(userId);
      else awaitSchool.clear(userId);
      const messages = r.silent ? unknownMessages(shopNow) : r.messages;
      const out = holiday(shopNow, messages, { skip: isThanks(said) });
      if (!out.length) return; // nothing to say: the admin sees the chat
      await deliver(ev, userId, out);
    });
  }
  if (quiet.allPaused()) return; // photos, slips and stickers too
  if (ev.message.type === 'sticker') {
    awaitSchool.clear(userId);
    // A thank-you sticker gets the same answer as a typed "ขอบคุณ". Any other sticker
    // is left alone — it is a wave or an OK, not a job.
    if (!isThanksSticker(ev.message.keywords)) return;
    return replyMessage(ev.replyToken, send(thanksReply(shop).messages), token);
  }
  // Slips and photos count as "the customer sent something" for the intake cycle, and
  // wait like free text does.
  return later(waitFor(shop, '', { env: process.env }), async () => {
    const shopNow = loadShop();
    if (isPaused(shopNow, process.env) || quiet.allPaused()) return;
    const out = holiday(shopNow, unknownMessages(shopNow));
    if (!out.length) return;
    await deliver(ev, userId, out);
  });
}

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`stationery-bot listening on :${port}`));
