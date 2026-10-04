import 'node:process';
import express from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { verifySignature, replyMessage, pushMessage, getProfile, getProfileCached, getBotUserId, chatLink, describeEvent } from './line.js';
import { buildReply, welcomeMessage, withSender, iconUrlFor, thanksReply, contactMessages } from './replies.js';
import { isThanksSticker, isThanks } from './matcher.js';
import { applyHoliday, createNoticeTracker } from './holiday.js';
import { createContactState, findContact, notificationCard, contactPhotos, people } from './contact.js';
import { waitFor } from './delay.js';
import { isPaused, createQuiet, parseAdminIds, parseAdminCommand, isWhoAmI } from './quiet.js';
import { isWakeWord } from './wake.js';

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

const contacts = createContactState();
const MIN = 60 * 1000;
const contactCfg = (shop) => ({
  windowMs: (shop.contact?.quietMinutes ?? 20) * MIN,
  gapMs: 60 * 1000, // not more than one reminder card a minute
  reminderMs: (shop.contact?.reminderMinutes ?? 3) * MIN,
});

// A reply token is only good for a short while; when it is gone the message goes out as
// a push (which counts against the plan's monthly quota).
async function deliver(ev, userId, messages) {
  const out = send(messages);
  try {
    await replyMessage(ev.replyToken, out, token);
  } catch (e) {
    if (e.status === 400 && userId !== 'anon') return pushMessage(userId, out, token);
    throw e;
  }
}

// Runs now, or after the shop's wait (replyDelaySeconds; 0 = at once).
function later(secs, fn) {
  if (secs <= 0) return fn();
  setTimeout(() => fn().catch((e) => console.error('[event]', e.message)), secs * 1000);
}

const adminPhotos = (shop) => contactPhotos(shop, (id) => getProfileCached(id, token));

// Pops up on the admins' LINE as a card from the OA. `to` = the people to tell.
async function notifyAdmins(to, shop, { customerId, contact, said }) {
  const [customer, link] = await Promise.all([getProfile(customerId, token), getBotUserId(token).then((b) => chatLink(b, customerId))]);
  const contactProfile = contact?.userId ? await getProfileCached(contact.userId, token) : null;
  const card = notificationCard(shop, { customer, contact: contact && { ...contact, picture: contactProfile?.picture }, said, link });
  for (const p of to) {
    if (!p.userId) continue; // no LINE id set yet for this person
    try {
      await pushMessage(p.userId, [card], token);
    } catch (e) {
      console.error('[notify]', p.name, e.message);
    }
  }
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

  const cfg = contactCfg(shop);
  const hasContacts = people(shop).length > 0;

  // The customer is writing to a person, not the bot: say nothing, but a customer can
  // type "เมนู" to bring the bot back. (Media and stickers are left alone too.)
  const quietNow = hasContacts && contacts.isQuiet(userId, cfg.windowMs);

  if (ev.message.type === 'text') {
    const said = ev.message.text;
    // Setup helper: lets an admin find the id to put in the shop file / ADMIN_USER_IDS.
    if (isWhoAmI(said)) {
      return replyMessage(ev.replyToken, [{ type: 'text', text: `ไอดี LINE ของคุณคือ\n${userId}` }], token);
    }
    const cmd = adminIds.has(userId) || people(shop).some((p) => p.userId && p.userId === userId) ? parseAdminCommand(said) : null;
    if (cmd) return replyMessage(ev.replyToken, [{ type: 'text', text: adminReply(cmd, shop) }], token);
    // An admin silenced the bot for everyone: say nothing.
    if (quiet.allPaused()) return;

    // The customer chose whom to contact → the bot goes quiet and that person is told.
    const chosen = hasContacts ? findContact(said, shop) : null;
    if (chosen) {
      contacts.choose(userId, cfg.windowMs);
      void notifyAdmins([chosen], shop, { customerId: userId, contact: chosen, said });
      return; // no reply at all
    }
    if (quietNow) {
      if (!isWakeWord(said)) return;
      contacts.wake(userId);
    }

    const secs = waitFor(shop, said, { awaitingSchool: awaitSchool.has(userId), env: process.env });
    return later(secs, async () => {
      const shopNow = secs > 0 ? loadShop() : shop; // the shop file may have changed while waiting
      if (isPaused(shopNow, process.env) || quiet.allPaused()) return;
      const r = buildReply(said, shopNow, { awaitingSchool: awaitSchool.has(userId) });
      if (r.awaitingSchool) awaitSchool.set(userId);
      else awaitSchool.clear(userId);
      let messages = r.messages;
      if (r.silent && hasContacts) {
        // nothing ready to say: put the names in front of the customer
        const kind = contacts.onUnknown(userId, cfg);
        messages = kind === 'silent' ? [] : contactMessages(shopNow, kind, await adminPhotos(shopNow));
        if (kind === 'card') scheduleReminder(userId, said, shopNow, cfg);
      }
      const out = holiday(shopNow, messages, { skip: isThanks(said) });
      if (!out.length) return; // nothing to say
      await deliver(ev, userId, out);
    });
  }
  if (quiet.allPaused() || quietNow) return; // photos, slips and stickers too
  if (ev.message.type === 'sticker') {
    awaitSchool.clear(userId);
    // A thank-you sticker gets the same answer as a typed "ขอบคุณ". Any other sticker
    // is left alone — it is a wave or an OK, not a job.
    if (!isThanksSticker(ev.message.keywords)) return;
    return replyMessage(ev.replyToken, send(thanksReply(shop).messages), token);
  }
  // A slip or photo with nobody chosen yet: show the names.
  if (!hasContacts) return;
  const kind = contacts.onUnknown(userId, cfg);
  if (kind === 'silent') return;
  if (kind === 'card') scheduleReminder(userId, '(ส่งรูป/ไฟล์)', shop, cfg);
  const out = holiday(shop, contactMessages(shop, kind, await adminPhotos(shop)));
  if (out.length) await deliver(ev, userId, out);
}

// Still no choice a few minutes after the card: remind the customer once, and tell the
// admins that somebody is waiting. Both go out as pushes — the reply token is long gone.
function scheduleReminder(userId, said, shop, cfg) {
  if (userId === 'anon') return;
  setTimeout(async () => {
    try {
      if (!contacts.dueReminder(userId)) return;
      const shopNow = loadShop();
      if (isPaused(shopNow, process.env) || quiet.allPaused()) return;
      await pushMessage(userId, send(contactMessages(shopNow, 'remind', await adminPhotos(shopNow))), token);
      await notifyAdmins(people(shopNow), shopNow, { customerId: userId, contact: null, said });
    } catch (e) {
      console.error('[reminder]', e.message);
    }
  }, cfg.reminderMs);
}

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`stationery-bot listening on :${port}`));
