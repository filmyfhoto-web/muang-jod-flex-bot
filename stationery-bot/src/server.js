import 'node:process';
import express from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { verifySignature, replyMessage, pushMessage, getProfile, getProfileCached, getBotUserId, getMessageContent, getQuota, quotaText, chatLink, describeEvent } from './line.js';
import { buildReply, welcomeMessage, withSender, iconUrlFor, thanksReply, quick } from './replies.js';
import { contactCard } from './flex.js';
import { isThanksSticker, isThanks } from './matcher.js';
import { applyHoliday, createNoticeTracker } from './holiday.js';
import { createContactState, findContact, notificationCard, contactPhotos, people } from './contact.js';
import { readSlip, slipReply, readerOn } from './slip.js';
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

const send = (messages) => {
  let qr;
  try {
    qr = quick(loadShop()); // the topic buttons come from the current shop file
  } catch (e) {
    console.error('[send] no quick replies:', e.message);
  }
  return withSender(messages, baseUrl, qr);
};
app.get('/', (_req, res) => res.type('text/plain; charset=utf-8').send('บอทร้านนัฐภรณ์ เชียงกลาง ทำงานอยู่ ✅'));
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
  alertEveryMs: (shop.contact?.notifyAllMinutes ?? 10) * MIN, // one "bot did not understand" alert per customer per this long
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
async function notifyAdmins(to, shop, { customerId, contact, said, reason }) {
  if (shop.contact?.notify === false) return; // the shop relies on the OA app's own alerts
  const template = shop.contact?.chatLinkTemplate;
  const [customer, link] = await Promise.all([
    getProfile(customerId, token),
    template?.includes('{bot}') ? getBotUserId(token).then((b) => chatLink(b, customerId, template)) : chatLink(null, customerId, template),
  ]);
  const contactProfile = contact?.userId ? await getProfileCached(contact.userId, token) : null;
  const card = notificationCard(shop, { customer, contact: contact && { ...contact, picture: contactProfile?.picture }, said, link, reason });
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
    if (cmd?.type === 'quota') return replyMessage(ev.replyToken, [{ type: 'text', text: quotaText(await getQuota(token)) }], token);
    if (cmd) return replyMessage(ev.replyToken, [{ type: 'text', text: adminReply(cmd, shop) }], token);
    // An admin silenced the bot for everyone: say nothing.
    if (quiet.allPaused()) return;

    // The customer chose whom to contact → the bot goes quiet and that person is told.
    const chosen = hasContacts ? findContact(said, shop) : null;
    if (chosen) {
      contacts.choose(userId);
      void notifyAdmins([chosen], shop, { customerId: userId, contact: chosen, said: '' }); // only "the customer wants to talk to you" — no message text
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
      if (r.needsPhotos) messages = [contactCard(shopNow, r.askText ?? shopNow.contact.ask, await adminPhotos(shopNow))];
      if (r.alertAdmins && hasContacts) escalate(userId, said, shopNow, cfg, 'ลูกค้าสั่งงาน/สั่งของ'); // an order: the admins are told too
      if (r.silent && !r.quiet && hasContacts) {
        // Not understood: nobody is alerted (there are too many such questions a day). The
        // customer gets nothing, or the "who?" card / a short note if the shop switched that on.
        messages = shopNow.contact.askOnUnknown ? await withAsk(shopNow, []) : receipt(shopNow);
      }
      const out = holiday(shopNow, messages, { skip: isThanks(said, people(shopNow).map((p) => p.name)) });
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
  // A payment slip is read and thanked; anything else the bot cannot read is passed to the
  // admins (and the customer gets nothing from the bot).
  // Several pictures in a row get one thank-you and one alert (the first), not one each.
  if (ev.message.type === 'image' && userId !== 'anon' && !contacts.alertDue(`img:${userId}`, cfg.alertEveryMs)) return;
  if (ev.message.type === 'image' && !readerOn()) {
    // Free mode (no AI key): any picture is thanked, and the admins are told to look at it.
    if (hasContacts) escalate(userId, '(ส่งรูป)', shop, cfg, 'ลูกค้าส่งรูป');
    return deliver(ev, userId, holiday(shop, [slipReply(shop, { sure: false })]));
  }
  if (ev.message.type === 'image') {
    const file = await getMessageContent(ev.message.id, token);
    const slip = file && (await readSlip(file.buffer, file.mimeType));
    if (slip) {
      if (hasContacts) escalate(userId, '(ส่งสลิป)', shop, cfg, 'ลูกค้าส่งสลิป'); // a payment: the admins confirm the order
      return deliver(ev, userId, holiday(shop, [slipReply(shop, slip)]));
    }
  }
  if (hasContacts && ev.message.type === 'image') escalate(userId, '(ส่งรูป)', shop, cfg, 'ลูกค้าส่งรูป'); // pictures may be an order
  const out = holiday(shop, receipt(shop)); // a short note, and the Saturday notice if it is Saturday
  if (out.length) await deliver(ev, userId, out);
}

// Adds the "who do you want to talk to?" card (the admins with their photos) to a reply.
const withAsk = async (shopNow, messages) =>
  (shopNow.contact?.people ?? []).length ? [...messages, contactCard(shopNow, shopNow.contact.ask, await adminPhotos(shopNow))] : messages;

// What the customer sees when the bot cannot answer: a short note, so the topic buttons show.
const receipt = (shopNow) => (shopNow.contact?.receivedNote ? [{ type: 'text', text: shopNow.contact.receivedNote }] : []);

// The bot did not understand: tell all the admins, once per customer per window.
function escalate(userId, said, shop, cfg, reason) {
  if (userId === 'anon' || !contacts.alertDue(userId, cfg.alertEveryMs)) return;
  void notifyAdmins(people(shop), shop, { customerId: userId, contact: null, said, reason });
}

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`stationery-bot listening on :${port}`));
