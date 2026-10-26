import 'node:process';
import express from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { verifySignature, replyMessage, pushMessage, getProfile, getProfileCached, getBotUserId, getMessageContent, getQuota, quotaText, chatLink, describeEvent } from './line.js';
import { buildReply, welcomeMessage, withSender, iconUrlFor, thanksReply, quick } from './replies.js';
import { contactCard, pickListCard } from './flex.js';
import { isThanksSticker, isThanks, isMenuTap, normalize, matchIntent } from './matcher.js';
import { applyHoliday, createNoticeTracker } from './holiday.js';
import { createContactState, findContact, notificationCard, contactPhotos, people } from './contact.js';
import { readSlip, slipReply, readerOn } from './slip.js';
import { waitFor } from './delay.js';
import { isPaused, createQuiet, parseAdminIds, parseAdminCommand, isWhoAmI } from './quiet.js';
import { isWakeWord } from './wake.js';
import { createVisitTracker, HOUR } from './visit.js';
import { createSerial } from './serial.js';
import { menuCommandReply } from './richmenu.js';
import { parsePickList, pickListKey, pickListAltText, pickListPushText } from './picklist.js';
import { createAppFlow } from './app/flow.js';
import { sameAdmin } from './app/names.js';
import { createAssistStage } from './assist-stage.js';

const token = (process.env.LINE_CHANNEL_ACCESS_TOKEN ?? '').trim();
const secret = (process.env.LINE_CHANNEL_SECRET ?? '').trim();
if (!token || !secret) {
  console.error('Set LINE_CHANNEL_ACCESS_TOKEN and LINE_CHANNEL_SECRET (see .env.example)');
  process.exit(1);
}

// Public https address of this server — Render sets RENDER_EXTERNAL_URL itself.
const baseUrl = process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || '';

// The NATTA GROUP app's features (order cards, shop menu, "talk to an admin", project documents) — see app/flow.js.
// null = off (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set); it is created at the bottom of this file.
let appFlow = null;
let assist = null; // the Studio-editable answering engine (assist-stage.js); null = the Render bot's own answers only
const appMenuOn = () => Boolean(appFlow?.status().menu); // the app's menu card greets every first message of a visit

const shopFile = fileURLToPath(new URL('../data/shop.json', import.meta.url));
// Re-read on every message so the owner can edit shop.json without a restart.
const loadShop = () => {
  const shop = {
    ...JSON.parse(readFileSync(shopFile, 'utf8')),
    iconUrl: iconUrlFor(baseUrl),
    assetBase: iconUrlFor(baseUrl) ? baseUrl.replace(/\/+$/, '') : null,
  };
  // While the app's menu card is on, this bot does not also ask "who do you want to talk to?" on a first hello
  // (two menus in a row).
  if (appMenuOn()) shop.contact = { ...(shop.contact ?? {}), sessionAsk: false };
  return shop;
};
loadShop(); // fail fast on a broken file

const app = express();
app.use('/assets', express.static(fileURLToPath(new URL('../public', import.meta.url)), { maxAge: '1d' }));

const lastReply = new Map(); // userId → { at: when the bot last answered a text, said: what it was } (for the burst limit)
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
// "app": off = SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set · no-db = set, but the database cannot be read with them · on = working
// "build": the commit this deploy is running (Render sets RENDER_GIT_COMMIT), so a push can be told apart from the one before it
app.get('/health', async (_req, res) => {
  let state = 'off';
  if (appFlow) state = (await appFlow.check().catch(() => false)) ? 'on' : 'no-db';
  const build = String(process.env.RENDER_GIT_COMMIT ?? '').trim().slice(0, 7);
  res.json({ ok: true, app: state, assist: assist ? 'ready' : 'off', ...(build ? { build } : {}) });
});

app.post('/webhook', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifySignature(req.body, req.get('x-line-signature'), secret)) return res.sendStatus(401);
  res.sendStatus(200); // answer LINE first; replies happen after
  let events = [];
  try {
    events = JSON.parse(req.body.toString('utf8')).events ?? [];
  } catch {
    return;
  }
  if (appFlow) {
    // The app's features answer first; what they do not answer comes back to runOthers (below) one event at a time.
    for (const ev of events) console.log(describeEvent(ev));
    const who = events.find((e) => e.source?.userId)?.source.userId;
    const job = () => appFlow.handle(req.body.toString('utf8'), req.get('x-line-signature'), events);
    (who ? serial.run(who, job) : job()).catch((e) => console.error('[app]', e.message));
    return;
  }
  for (const ev of events) {
    console.log(describeEvent(ev)); // even while paused
    const who = ev.source?.userId;
    const job = () => handleEvent(ev);
    (who ? serial.run(who, job) : job()).catch((e) => console.error('[event]', e.message));
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

// The menu picture lives inside the project (shop.richMenu.image, e.g. "assets/richmenu.png").
const menuImageFile = (shop) => {
  const rel = String(shop.richMenu?.image || 'assets/richmenu.png');
  if (rel.includes('..') || rel.startsWith('/')) throw new Error('richMenu.image ต้องเป็นไฟล์ในโปรเจกต์');
  return fileURLToPath(new URL(`../${rel}`, import.meta.url));
};

// "ติดตั้งเมนู" / "ลบเมนู" from an admin (see richmenu.js).
const menuCommand = async (cmd, shop) => {
  try {
    return await menuCommandReply({ cmd, shop, token, imageFile: menuImageFile(shop) });
  } catch (e) {
    return `ทำเมนูไม่สำเร็จค่ะ ❌\n${String(e.message).slice(0, 220)}`;
  }
};

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
const visits = createVisitTracker();
const serial = createSerial(); // one customer's messages are handled one at a time, in order
const MIN = 60 * 1000;
const contactCfg = (shop) => ({
  windowMs: (shop.contact?.quietMinutes ?? 20) * MIN,
  alertEveryMs: (shop.contact?.alertEveryHours ?? 5) * HOUR, // the admins are told about one customer at most once per this long
  pictureReplyMs: (shop.contact?.pictureReplyMinutes ?? 10) * MIN, // pictures in a row get one thank-you per this long
  visitGapMs: (shop.contact?.sessionGapHours ?? 4) * HOUR, // a new visit starts after this long without a message (or on a new day)
  sessionAsk: shop.contact?.sessionAsk !== false,
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

// The customer's LINE profile (name, picture) and the link that opens their chat in the OA app.
function customerAndLink(shop, customerId) {
  const template = shop.contact?.chatLinkTemplate;
  return Promise.all([
    getProfile(customerId, token),
    template?.includes('{bot}') ? getBotUserId(token).then((b) => chatLink(b, customerId, template)) : chatLink(null, customerId, template),
  ]);
}

// Pops up on the admins' LINE as a card from the OA. `to` = the people to tell.
async function notifyAdmins(to, shop, { customerId, contact, said, reason }) {
  if (shop.contact?.notify === false) return; // the shop relies on the OA app's own alerts
  const [customer, link] = await customerAndLink(shop, customerId);
  const contactProfile = contact?.userId ? await getProfileCached(contact.userId, token) : null;
  const card = notificationCard(shop, { customer, contact: contact && { ...contact, picture: contactProfile?.picture }, said, link, reason });
  for (const p of to) {
    if (!p.userId) continue; // no LINE id set yet for this person
    try {
      await pushMessage(p.userId, withSender([card], null, quick(shop)), token); // the topic buttons ride on the alert too, so they show in the admin's own thread
    } catch (e) {
      console.error('[notify]', p.name, e.message);
    }
  }
}

// ---- a customer's order written as a list in the chat (picklist.js) ----------------------------------------------------
const recentLists = new Map(); // userId → { at, notes }: a list the admins were just told about (a remark that follows it goes to them too)

// A card with the tidied list on every admin's LINE, and a note on the staff phones that use the shop's web app.
async function notifyPickList(shop, { customerId, list }) {
  const cfg = shop.pickList ?? {};
  const [customer, link] = await customerAndLink(shop, customerId);
  const shown = list.items.slice(0, Math.max(1, Math.min(Number(cfg.maxLines) || 12, 20)));
  const appUrl = cfg.appUrl === '' ? '' : cfg.appUrl || 'https://admin.nattagroup.com/#projdocs'; // the back office, not the shop (www)
  if (shop.contact?.notify !== false) {
    const card = pickListCard(shop, {
      customerName: customer?.name,
      customerPhoto: customer?.picture,
      items: shown,
      more: list.items.length - shown.length,
      note: list.note,
      link,
      appUrl,
      altText: pickListAltText({ customer: customer?.name, count: list.items.length }),
    });
    for (const p of people(shop)) {
      if (!p.userId) continue;
      try {
        await pushMessage(p.userId, withSender([card], null, quick(shop)), token);
      } catch (e) {
        console.error('[picklist]', p.name, e.message);
      }
    }
  }
  const tag = `pick${Date.now().toString(36)}`; // one notification per list (a fixed tag would replace the one before)
  await appFlow?.notifyApp({ title: '📋 มีรายการสั่งจัดของ', body: pickListPushText({ customer: customer?.name, items: list.items }), path: '/#projdocs', tag }).catch(() => false);
}

// What the customer wrote right after the list ("ประมาณวันที่ 28 ครูจะมารับ"): one line to the admins.
async function notifyPickNote(shop, { customerId, said }) {
  if (shop.contact?.notify === false) return;
  const customer = await getProfile(customerId, token);
  const msg = { type: 'text', text: `📝 ข้อความต่อจากรายการสั่งจัดของ — ไลน์ชื่อ ${customer?.name || 'ไม่ทราบชื่อ'}\n“${String(said).replace(/\s+/g, ' ').trim().slice(0, 300)}”` };
  for (const p of people(shop)) {
    if (!p.userId) continue;
    try {
      await pushMessage(p.userId, [msg], token);
    } catch (e) {
      console.error('[picklist]', p.name, e.message);
    }
  }
}

// true = `said` is an order list and has been dealt with: the admins are told, the customer gets nothing (unless
// shop.pickList.reply holds a sentence for them) and the other answers stay out of it.
async function pickListIfAny(ev, shop, userId, said) {
  const cfg = shop.pickList ?? {};
  if (cfg.enabled === false || !userId || userId === 'anon' || ev._pickChecked) return false;
  ev._pickChecked = true; // runOthers checks first and then hands the event to handleEvent: one look per message
  const list = parsePickList(said);
  if (!list) {
    // a remark the bot cannot answer, within a few minutes after a list, goes to the admins as well
    const rec = recentLists.get(userId);
    if (rec && Date.now() - rec.at < (Number(cfg.followMinutes) || 10) * 60_000 && rec.notes < 3 && matchIntent(said, shop).type === 'fallback') {
      rec.notes++;
      void notifyPickNote(shop, { customerId: userId, said });
    }
    return false;
  }
  if (!contacts.alertDue(`picklist:${userId}:${pickListKey(said)}`, 10 * 60_000)) return true; // the same list again: the admins know
  recentLists.set(userId, { at: Date.now(), notes: 0 });
  if (recentLists.size > 2000) for (const [k, v] of recentLists) if (Date.now() - v.at > 3_600_000) recentLists.delete(k);
  void notifyPickList(shop, { customerId: userId, list }).catch((e) => console.error('[picklist]', e.message));
  if (cfg.reply) await replyMessage(ev.replyToken, [{ type: 'text', text: String(cfg.reply).slice(0, 1000) }], token).catch((e) => console.error('[picklist]', e.message));
  return true;
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
    if (shop.welcome === false) return; // the OA's own greeting message is used instead
    return replyMessage(ev.replyToken, send(holiday(shop, [welcomeMessage(shop)])), token);
  }
  if (ev.type !== 'message') return;

  const cfg = contactCfg(shop);
  const hasContacts = people(shop).length > 0;
  if (userId !== 'anon') visits.touch(userId, cfg.visitGapMs);

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
    if (cmd?.type === 'menuInstall' || cmd?.type === 'menuRemove') return replyMessage(ev.replyToken, [{ type: 'text', text: await menuCommand(cmd, shop) }], token);
    if (cmd?.type === 'quota') return replyMessage(ev.replyToken, [{ type: 'text', text: quotaText(await getQuota(token)) }], token);
    if (cmd) return replyMessage(ev.replyToken, [{ type: 'text', text: adminReply(cmd, shop) }], token);
    // An admin silenced the bot for everyone: say nothing.
    if (quiet.allPaused()) return;

    // An order written as a list: the admins are told (even while the customer is talking to one of them).
    if (await pickListIfAny(ev, shop, userId, said)) return;

    // The customer chose whom to contact → the bot goes quiet and that person is told.
    const chosen = hasContacts ? findContact(said, shop) : null;
    if (chosen) {
      contacts.choose(userId);
      visits.done(userId); // they picked someone: nothing more to ask this visit
      // Only "the customer wants to talk to you" — no message text — and only once per customer per admin
      // per window, however many times they tap the name.
      if (contacts.alertDue(`pick:${userId}:${chosen.name}`, cfg.alertEveryMs)) void notifyAdmins([chosen], shop, { customerId: userId, contact: chosen, said: '' });
      return; // no reply at all
    }
    if (quietNow) {
      if (!isWakeWord(said) && !isMenuTap(said, shop)) return; // a menu button is an explicit request too
      contacts.wake(userId);
    }

    // A customer who fires off several messages at once gets one answer: anything within a few
    // seconds of the bot's last reply is ignored (answering the school name is always allowed).
    const burstMs = (shop.contact?.burstSeconds ?? 6) * 1000;
    const last = lastReply.get(userId);
    if (userId !== 'anon' && !awaitSchool.has(userId) && last && Date.now() - last.at < burstMs) {
      // …but a different menu button tapped a moment later is a new request; a repeat of the same line is not.
      if (!isMenuTap(said, shop) || normalize(said) === last.said) return;
    }

    const secs = waitFor(shop, said, { awaitingSchool: awaitSchool.has(userId), env: process.env });
    return later(secs, async () => {
      const shopNow = secs > 0 ? loadShop() : shop; // the shop file may have changed while waiting
      if (isPaused(shopNow, process.env) || quiet.allPaused()) return;
      const r = buildReply(said, shopNow, { awaitingSchool: awaitSchool.has(userId) });
      if (r.awaitingSchool) awaitSchool.set(userId);
      else awaitSchool.clear(userId);
      let messages = r.messages;
      // The "who do you want to talk to?" card goes out once per visit, with the first plain
      // hello (instead of the menu card). A message the bot does not understand stays unanswered
      // — it is often a reply to an admin who is already talking with the customer.
      const askNow = cfg.sessionAsk && hasContacts && userId !== 'anon' && visits.owed(userId);
      if (r.needsPhotos) {
        messages = [contactCard(shopNow, r.askText ?? shopNow.contact.ask, await adminPhotos(shopNow))];
        visits.done(userId);
      } else if (askNow && r.pureHello && !r.menuRequest) {
        messages = await withAsk(shopNow, []);
        visits.done(userId);
      }
      if (appMenuOn() && r.greeting && !r.menuRequest) messages = []; // the app's menu card already greets; a bare hello needs no second menu
      if (r.alertAdmins && hasContacts) escalate(userId, said, shopNow, cfg, 'ลูกค้าสั่งงาน/สั่งของ'); // an order: the admins are told too
      if (r.silent && !r.quiet && hasContacts) {
        // Not understood: nobody is alerted (there are too many such questions a day). The
        // customer gets nothing, or the "who?" card / a short note if the shop switched that on.
        messages = shopNow.contact.askOnUnknown ? await withAsk(shopNow, []) : receipt(shopNow);
      }
      const out = holiday(shopNow, messages, { skip: isThanks(said, people(shopNow).map((p) => p.name)) });
      if (!out.length) return; // nothing to say
      lastReply.set(userId, { at: Date.now(), said: normalize(said) });
      if (lastReply.size > 5000) for (const [k, v] of lastReply) if (Date.now() - v.at > 60_000) lastReply.delete(k);
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
  // Several pictures or files in a row get one thank-you and one alert (the first), not one each.
  const isPicture = ev.message.type === 'image';
  const isFile = ev.message.type === 'file'; // the "ส่งเอกสารโครงการ" button invites these
  if ((isPicture || isFile) && userId !== 'anon' && !contacts.alertDue(`img:${userId}`, cfg.pictureReplyMs)) return;
  if (isFile || (isPicture && !readerOn())) {
    // A file is never read, and with no AI key neither is a picture: it is thanked, and the admins are told to look at it.
    if (hasContacts) escalate(userId, isFile ? '(ส่งไฟล์)' : '(ส่งรูป)', shop, cfg, isFile ? 'ลูกค้าส่งไฟล์' : 'ลูกค้าส่งรูป');
    return deliver(ev, userId, holiday(shop, [slipReply(shop, { sure: false, kind: isFile ? 'file' : 'picture' })]));
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

// ---- the app's features (app/flow.js) ----------------------------------------------------------------------------
// What the app's features do not answer comes back here, one event at a time, still inside that customer's turn.
async function runOthers(events) {
  try {
    if (isPaused(loadShop(), process.env)) return; // the master switch: no replies, no welcome, nothing — the Studio's engine included
  } catch {
    /* an unreadable shop file is reported by handleEvent below */
  }
  for (const ev of events) {
    try {
      if (ev?.type === 'message' && ev.message?.type === 'text' && ev.source?.type === 'user' && (await pickListIfAny(ev, loadShop(), ev.source.userId, ev.message.text))) continue;
    } catch (e) {
      console.error('[picklist]', e.message);
    }
    let viaAssist = false;
    try {
      viaAssist = assist ? await assist.takes(ev) : false; // the Reply Studio's engine, per faq_bot.mode (off / admins / all)
    } catch (e) {
      console.error('[assist]', e.message); // settings unreadable: the Render bot's own answers
    }
    try {
      await (viaAssist ? assist.run(ev) : handleEvent(ev));
    } catch (e) {
      console.error('[event]', e.message);
    }
  }
}

// The Render bot's own set-up and admin commands ("ติดตั้งเมนู", "ปิดบอท", "ไอดีฉัน" …) go straight to it, past the app's cards:
// otherwise an admin's first message of the day would get the shop menu, and "แอดมินออนไลน์" would open the admin picker.
function isOwnCommand(ev) {
  if (ev?.type !== 'message' || ev.message?.type !== 'text' || ev.source?.type !== 'user' || !ev.source.userId) return false;
  const said = ev.message.text;
  if (isWhoAmI(said)) return true; // anybody may ask for their own id (that is how a new admin finds theirs)
  if (!parseAdminCommand(said)) return false;
  if (adminIds.has(ev.source.userId)) return true;
  try {
    return people(loadShop()).some((p) => p.userId && p.userId === ev.source.userId);
  } catch {
    return false;
  }
}

// Is this an order written as a list? (the app flow lets the shop menu stay out of it, see app/bot.js)
function isPickListEvent(ev) {
  if (ev?.type !== 'message' || ev.message?.type !== 'text' || ev.source?.type !== 'user' || !ev.source.userId) return false;
  try {
    return loadShop().pickList?.enabled !== false && Boolean(parsePickList(ev.message.text));
  } catch {
    return false;
  }
}

// A customer picked an admin in the app's card: the chosen person is told (a push), like when they pick in this bot's own card.
async function onPick(ev, admin) {
  const customerId = ev.source?.userId;
  if (customerId && assist && (await assist.takesUser(customerId).catch(() => false))) return assist.alertPick(customerId, admin.name);
  let shop;
  try {
    shop = loadShop();
  } catch {
    return;
  }
  if (!customerId || shop.contact?.notify === false) return;
  const person = people(shop).find((p) => sameAdmin(p.name, admin.name));
  if (!person) return; // no LINE id for that name in shop.json
  const cfg = contactCfg(shop);
  if (!contacts.alertDue(`pick:${customerId}:${person.name}`, cfg.alertEveryMs)) return;
  await notifyAdmins([person], shop, { customerId, contact: person, said: '' });
}

try {
  appFlow = await createAppFlow({
    env: process.env,
    others: runOthers,
    onPick,
    skip: isOwnCommand,
    pickList: isPickListEvent,
    paused: () => {
      try {
        return isPaused(loadShop(), process.env) || quiet.allPaused();
      } catch {
        return false;
      }
    },
  });
} catch (e) {
  console.error('[app] failed to start, the app features stay off:', e.message); // never stops the bot itself from starting
  appFlow = null;
}
if (appFlow) {
  try {
    assist = await createAssistStage({ env: process.env });
  } catch (e) {
    console.error('[assist] failed to start:', e.message);
    assist = null;
  }
}

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`stationery-bot listening on :${port}`));
