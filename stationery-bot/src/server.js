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
import { createChatOrders, enabledFor, docLink, chatOrdersFromEnv } from './chatorders.js';
import { createCatalog } from './catalog.js';
import { looksLikeOrder, readOrder, readThreadOrder, aiOn } from './chatai.js';
import { createOrdersStore } from './orders/store.js';
import { createOrderIngest } from './orders/ingest.js';
import { createChannelRegistry } from './orders/channels.js';
import { createDraftAck } from './orders/ack.js';
import { chatDraftsFromEnv } from './orders/config.js';
import { summarize } from './orders/draft.js';
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
let chatOrders = null; // an order typed in the chat → a job in the shop's app (chatorders.js); null = the admins are only told
// the order drafts (orders/): every message of every OA is kept apart by its channel; null until the database answers
let orderIngest = null;
let draftAck = null;
let draftStore = null; // the drafts' own database connection (CHATDRAFTS_SUPABASE_URL); independent of the app's
let channelRegistry = null;
const appMenuOn = () => Boolean(appFlow?.status().menu); // the app's menu card greets every first message of a visit

const shopFile = process.env.SHOP_FILE || fileURLToPath(new URL('../data/shop.json', import.meta.url)); // SHOP_FILE: tests point it at their own copy
// Re-read on every message so the owner can edit shop.json without a restart.
const loadShop = () => {
  const shop = {
    ...JSON.parse(readFileSync(shopFile, 'utf8')),
    iconUrl: iconUrlFor(baseUrl),
    assetBase: iconUrlFor(baseUrl) ? baseUrl.replace(/\/+$/, '') : null,
  };
  shop.chatOrders = chatOrdersFromEnv(shop.chatOrders ?? {}, process.env);
  shop.chatDrafts = chatDraftsFromEnv(shop.chatDrafts ?? {}, process.env);
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
  // "orders": whether an order typed in the chat is saved in the shop's app — off · pilot · on · no-db (switched on, but no database)
  let orders = 'off';
  try {
    const mode = loadShop().chatOrders?.mode;
    if (mode === 'pilot' || mode === 'on') orders = chatOrders ? mode : 'no-db';
  } catch {
    /* an unreadable shop file is reported by the message handler */
  }
  // "drafts": the same for the order drafts (orders/) — off · pilot · on · no-db
  let drafts = 'off';
  try {
    const dm = loadShop().chatDrafts?.mode;
    if (dm === 'pilot' || dm === 'on') drafts = orderIngest ? dm : 'no-db';
  } catch {
    /* reported by the message handler */
  }
  res.json({ ok: true, app: state, assist: assist ? 'ready' : 'off', orders, drafts, ...(build ? { build } : {}) });
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
  for (const ev of events) recordChatEvent('main', ev); // the order drafts take the shop's own OA's messages (silently)
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

// Another LINE official account (line_channels): its own webhook, verified with its own secret. Its messages go to the drafts
// and are never answered — the customer gets nothing from the bot there.
app.post('/webhook/ch/:key', express.raw({ type: '*/*' }), async (req, res) => {
  const key = String(req.params.key || '');
  const row = channelRegistry ? await channelRegistry.get(key).catch(() => null) : null;
  if (!row || !row.channel_secret) return res.sendStatus(404);
  if (!verifySignature(req.body, req.get('x-line-signature'), row.channel_secret)) return res.sendStatus(401);
  res.sendStatus(200);
  let events = [];
  try {
    events = JSON.parse(req.body.toString('utf8')).events ?? [];
  } catch {
    return;
  }
  for (const ev of events) recordChatEvent(key, ev, { label: row.shop_label || row.name || key, token: row.channel_token });
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
  windowMs: (shop.contact?.quietMinutes ?? 60) * MIN, // after a name is tapped: an hour with no customer message (the bot cannot see the admin's replies)
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

// ---- order drafts (orders/) -----------------------------------------------------------------------------------------------
// One message → the drafts, one customer at a time, never answered. The main OA's token and name come from the environment and
// shop.json; another OA brings its own.
function recordChatEvent(channelKey, ev, { label, token: channelToken } = {}) {
  if (!orderIngest || !ev?.source?.userId) return;
  const who = ev.source.userId;
  const useLabel = label ?? (loadShop().chatDrafts?.mainLabel || 'นัฐภรณ์ เชียงกลาง');
  const useToken = channelToken ?? token;
  serial
    .run(who, () => orderIngest.handle({ channelKey, label: useLabel, token: useToken, ev }))
    .catch((e) => console.error('[orders]', e.message));
}

// add a query value to an address, keeping its #hash (…/#chatorders → …/?chat=CH-0001#chatorders)
function withParam(address, name, value) {
  try {
    const u = new URL(address);
    u.searchParams.set(name, value);
    return u.toString();
  } catch {
    return address;
  }
}

// The staff's phone note: the app's own push function (push-notify), with the key the app keeps. With the app's answers on, the app
// sends it; without them, the same request goes out through the drafts' own connection.
async function notifyPhone({ title, body, path, tag }) {
  if (appFlow) return appFlow.notifyApp({ title, body, path, tag }).catch(() => false);
  if (!draftStore || !draftDbUrl) return false;
  try {
    const key = await draftStore.getSecret('push_hook_key');
    if (!key) return false;
    const res = await fetch(`${draftDbUrl}/functions/v1/push-notify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'notify', key, title, body, url: path, tag }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// The admins' card for a chat order: its number, the lines, what needs a look, and a button that opens it in the back office.
async function notifyDraftCard({ draft, created, added, label, channelKey, userId }) {
  const shop = loadShop();
  if (shop.contact?.notify === false) return;
  const live = (draft.items ?? []).filter((x) => !x.removed);
  const maxLines = Math.max(1, Math.min(Number(shop.pickList?.maxLines) || 12, 20));
  const shown = live.slice(0, maxLines).map((x) => ({ name: x.name, qty: Number(x.qty), unit: x.unit || '' }));
  const name = draft.customer_name || draft.line_name || 'ไม่ทราบชื่อ';
  const link = channelKey === 'main' ? (await customerAndLink(shop, userId).catch(() => [null, null]))[1] : null;
  const lastNote = String(draft.note ?? '').split('———').pop().trim().slice(0, 120);
  const card = pickListCard(shop, {
    customerName: name,
    items: shown,
    more: live.length - shown.length,
    note: lastNote,
    link,
    appUrl: withParam(shop.chatDrafts?.appUrl || 'https://admin.nattagroup.com/#chatorders', 'chat', draft.draft_no),
    altText: `📋 ออเดอร์จากแชท ${draft.draft_no} — ${name} (${live.length} รายการ)`,
    docNo: draft.draft_no,
    merged: !created,
    added: added ?? 0,
    review: summarize(draft.items).review,
    source: label,
  });
  for (const p of people(shop)) {
    if (!p.userId) continue;
    try {
      await pushMessage(p.userId, withSender([card], null, quick(shop)), token);
    } catch (e) {
      console.error('[orders] card', p.name, e.message);
    }
  }
  await notifyPhone({ title: `💬 ออเดอร์จากแชท ${draft.draft_no}`, body: `${name} · ${live.length} รายการ`, path: '/#chatorders', tag: `chat-${draft.draft_no}` });
}

// a person is with this customer: the bot stays out of it (the same test as the other answers)
async function draftAckBusy(userId) {
  if (contacts.peekQuiet(userId, contactCfg(loadShop()).windowMs)) return true;
  // the same "talking with a person" state the app keeps (line_chat_state), read from whichever connection is up
  const read = appFlow ? appFlow.store.getChat(userId) : draftStore ? draftStore.getChat(userId) : Promise.resolve(null);
  const chat = await read.catch(() => null);
  const hours = appFlow ? appFlow.silenceHours() : 24;
  return Boolean(chat && chat.mode === 'admin' && Date.now() - Number(chat.last_ms || 0) < hours * HOUR);
}

// ---- a customer's order written as a list in the chat (picklist.js) ----------------------------------------------------
const recentLists = new Map(); // userId → { at, notes }: a list the admins were just told about (a remark that follows it goes to them too)

// A card with the tidied list on every admin's LINE, and a note on the staff phones that use the shop's web app.
// `saved` = what chatorders.js made of it in the app (the job's number, whether it joined an earlier one), if it did.
async function notifyPickList(shop, { customerId, list, saved = null }) {
  const cfg = shop.pickList ?? {};
  const [customer, link] = await customerAndLink(shop, customerId);
  const shown = list.items.slice(0, Math.max(1, Math.min(Number(cfg.maxLines) || 12, 20)));
  const appBase = cfg.appUrl === '' ? '' : cfg.appUrl || 'https://admin.nattagroup.com/#projdocs'; // the back office, not the shop (www)
  const docNo = saved?.doc?.doc_no || '';
  const appUrl = docNo ? docLink(appBase, docNo) : appBase; // …opening this very job when there is one
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
      docNo,
      merged: Boolean(saved?.merged),
      added: saved?.added ?? 0,
      review: saved?.review ?? 0,
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
  const title = docNo ? `📋 มีรายการสั่งจัดของ ${docNo}` : '📋 มีรายการสั่งจัดของ';
  // (the app's push-notify only accepts "/" or "/#word" as the page to open, so the phone note opens the list of jobs; the number is in its title)
  await appFlow?.notifyApp({ title, body: pickListPushText({ customer: customer?.name, items: list.items }), path: '/#projdocs', tag }).catch(() => false);
}

// Saves the list as a job in the shop's app (chatorders.js) when that is switched on for this customer. Awaited inside the
// customer's own turn, so a second piece of the same order finds the first one already there. → the result, or null.
async function saveToApp(shop, userId, said, list, ev) {
  const co = shop.chatOrders ?? {};
  if (!chatOrders || !enabledFor(co, userId) || !appFlow?.dbOk()) return null; // (a database that is known to be down is not waited for)
  const profile = await getProfileCached(userId, token).catch(() => null);
  const r = await chatOrders.record({ userId, lineName: profile?.name ?? '', text: said, list, cfg: co, messageId: ev?.message?.id ?? null });
  if (r.dup) return r;
  if (r.ok && r.doc) console.log(`[chatorders] ${r.doc.doc_no}: ${r.merged ? `+${r.added}` : r.total} lines, ${r.review} to check`);
  else if (!r.ok) console.error('[chatorders] not saved:', r.error);
  return r.ok && r.doc ? r : null;
}

// Sentence-form orders ("ขอสั่งไม้กวาด 10 อัน แล้วก็น้ำยาล้างจาน 2 แกลลอนนะคะ") are read by the AI — only when the shop switched it
// on for this customer (chatOrders.ai.mode "on", or "pilot" for the pilot people) and the server has an AI key.
const aiAllowed = (co, userId) => {
  const m = co.ai?.mode;
  return aiOn(process.env) && (m === 'on' || (m === 'pilot' && enabledFor({ mode: 'pilot', pilotUserIds: co.pilotUserIds }, userId)));
};

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
  // the order drafts keep the list and send its card; this path only keeps the bot silent about it
  if (orderIngest && enabledFor(shop.chatDrafts ?? {}, userId)) return parsePickList(said) !== null;
  const co = shop.chatOrders ?? {};
  let list = parsePickList(said);
  // not a list the rules can read: an order in a sentence, if the AI is switched on for this customer
  if (!list && chatOrders && enabledFor(co, userId) && aiAllowed(co, userId) && looksLikeOrder(said) && contacts.alertDue(`airead:${userId}:${pickListKey(said)}`, 10 * 60_000)) {
    list = await readOrder(said); // (the same sentence sent twice is read once)
  }
  if (!list) {
    // a remark the bot cannot answer, within a few minutes after a list, goes into the job's note; the admins' phones get one
    // of them an hour, so a burst of remarks does not buzz them one by one (the rest are in the app's note)
    const rec = recentLists.get(userId);
    if (rec && Date.now() - rec.at < (Number(cfg.followMinutes) || 10) * 60_000 && rec.notes < 3 && matchIntent(said, shop).type === 'fallback') {
      rec.notes++;
      if (contacts.alertDue(`remark:${userId}`, (Number(cfg.remarkEveryMinutes) || 60) * 60_000)) void notifyPickNote(shop, { customerId: userId, said });
      if (chatOrders && enabledFor(co, userId)) await chatOrders.remark({ userId, text: said, cfg: co });
    }
    return false;
  }
  if (!contacts.alertDue(`picklist:${userId}:${pickListKey(said)}`, 10 * 60_000)) return true; // the same list again: the admins know
  recentLists.set(userId, { at: Date.now(), notes: 0 });
  if (recentLists.size > 2000) for (const [k, v] of recentLists) if (Date.now() - v.at > 3_600_000) recentLists.delete(k);
  const saved = await saveToApp(shop, userId, said, list, ev);
  if (saved?.dup) return true; // LINE sent this very message twice (or the bot restarted mid-way): it is already in the app
  if (saved?.merged && saved.added === 0) return true; // every line was already in the job: the admins know
  void notifyPickList(shop, { customerId: userId, list, saved }).catch((e) => console.error('[picklist]', e.message));
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
    const shop = loadShop();
    if (shop.pickList?.enabled === false) return false;
    if (parsePickList(ev.message.text)) return true;
    const co = shop.chatOrders ?? {};
    return Boolean(chatOrders && enabledFor(co, ev.source.userId) && aiAllowed(co, ev.source.userId) && looksLikeOrder(ev.message.text));
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
  // an order typed in the chat → a job in the shop's app. It does nothing until shop.json `chatOrders.mode` says so.
  const catalog = createCatalog({ load: () => appFlow.store.loadProducts() });
  chatOrders = createChatOrders({ store: appFlow.store, catalog });
  try {
    if (['pilot', 'on'].includes(loadShop().chatOrders?.mode)) void catalog.get(); // the first customer does not wait for the product list
  } catch {
    /* an unreadable shop file is reported by the message handler */
  }
  setInterval(() => void ackTick(), Number(process.env.CHATORDERS_ACK_TICK_MS) > 0 ? Number(process.env.CHATORDERS_ACK_TICK_MS) : 60_000).unref();
}

// The order drafts have their own database connection (CHATDRAFTS_SUPABASE_URL + CHATDRAFTS_SERVICE_ROLE_KEY). They do not use the
// app's SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY: those switch on the app's own answers to customers, which stay off here.
// They answer nobody; they only record the messages and tell the admins.
const draftDbUrl = String(process.env.CHATDRAFTS_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
const draftDbKey = String(process.env.CHATDRAFTS_SERVICE_ROLE_KEY ?? '').trim();
if (draftDbUrl && draftDbKey) {
  draftStore = createOrdersStore({ url: draftDbUrl, key: draftDbKey });
  channelRegistry = createChannelRegistry({ store: draftStore });
  const draftCatalog = createCatalog({ load: () => draftStore.loadProducts() });
  orderIngest = createOrderIngest({
    store: draftStore,
    catalog: draftCatalog,
    lineApi: { profile: (uid, tok) => getProfileCached(uid, tok), content: (mid, tok) => getMessageContent(mid, tok) },
    getConfig: () => loadShop().chatDrafts,
    ai: aiOn(process.env) ? { read: (texts) => readThreadOrder(texts) } : null,
    notify: notifyDraftCard,
  });
  draftAck = createDraftAck({
    store: draftStore,
    getConfig: () => loadShop().chatDrafts,
    push: (uid, messages) => pushMessage(uid, send(messages), token),
    busy: draftAckBusy,
  });
  setInterval(() => void draftAckTick(), Number(process.env.CHATDRAFTS_ACK_TICK_MS) > 0 ? Number(process.env.CHATDRAFTS_ACK_TICK_MS) : 60_000).unref();
}

// the drafts' own "we have the order" pass (shop.json chatDrafts.ack, off by default)
let draftAcking = false;
async function draftAckTick() {
  if (draftAcking || !draftAck) return;
  draftAcking = true;
  try {
    const shop = loadShop();
    if (isPaused(shop, process.env) || quiet.allPaused()) return;
    await draftAck();
  } catch (e) {
    console.error('[orders] ack:', e.message);
  } finally {
    draftAcking = false;
  }
}

// Tells a customer "ได้รับรายการสั่งซื้อแล้วค่ะ ร้านกำลังดำเนินการจัดสินค้า" once the staff have picked their order up in the app
// (shop.json chatOrders.ack, off by default) — never while the customer is talking with a person, and once per order.
let acking = false;
async function ackTick() {
  if (acking || !chatOrders || !appFlow?.dbOk()) return;
  acking = true;
  try {
    const shop = loadShop();
    const co = shop.chatOrders ?? {};
    if (!co.ack?.enabled || (co.mode !== 'on' && co.mode !== 'pilot')) return;
    if (isPaused(shop, process.env) || quiet.allPaused()) return;
    const windowMs = contactCfg(shop).windowMs;
    // "talking with an admin" lasts as long as the app's own silence window (24 h unless the shop changed it); busyHours overrides
    const busyMs = (Number(co.ack.busyHours) > 0 ? Number(co.ack.busyHours) : appFlow.silenceHours()) * HOUR;
    await chatOrders.ack({
      cfg: co,
      push: (uid, messages) => pushMessage(uid, send(messages), token),
      busy: async (uid) => {
        if (contacts.peekQuiet(uid, windowMs)) return true; // the customer chose a person to talk to: the bot stays out of it
        const chat = await appFlow.store.getChat(uid); // the app's own "talking with an admin" state
        return Boolean(chat && chat.mode === 'admin' && Date.now() - Number(chat.last_ms || 0) < busyMs);
      },
    });
  } catch (e) {
    console.error('[chatorders] ack:', e.message);
  } finally {
    acking = false;
  }
}

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`stationery-bot listening on :${port}`));
