// What the assistant does with one LINE event. Everything outside this file (the HTTP handler,
// the store, the LINE client) is passed in, so the whole behaviour can be tested without a network.
//
// It answers the things the shop has set up (hours, order link, location, school lists, thanks,
// the weekly closing day), points order/question messages at the people behind the counter, goes
// quiet for a customer who chose someone, and thanks pictures/files while telling the admins.
// Anything it does not know is left unanswered on purpose: the admins see the chat and answer.
import { buildReply, welcomeMessage, thanksReply, quick, withSender } from './replies.js';
import { contactCard } from './flex.js';
import { isThanksSticker, isThanks, isMenuTap, normalize } from './matcher.js';
import { holidayNotice } from './holiday.js';
import { people, findContact, notificationCard, contactPhotos } from './contact.js';
import { readSlip, slipReply, readerOn } from './slip.js';
import { parseAdminCommand, isWhoAmI, isPaused } from './commands.js';
import { isWakeWord } from './wake.js';
import { quotaText, chatLink } from './lineapi.js';
import { MIN, HOUR } from './util.js';

export const contactCfg = (shop) => ({
  windowMs: (shop.contact?.quietMinutes ?? 20) * MIN, // how long the bot stays quiet after a customer chose someone (renewed by every message)
  alertEveryMs: (shop.contact?.alertEveryHours ?? 5) * HOUR, // the admins hear about one customer at most once per this long
  pictureReplyMs: (shop.contact?.pictureReplyMinutes ?? 10) * MIN, // pictures in a row get one thank-you per this long
  burstMs: (shop.contact?.burstSeconds ?? 6) * 1000, // several messages at once get one answer
});

const SCHOOL_WAIT = 10 * MIN; // how long "which school?" stays open

export function createEngine({ store, line, fetch: doFetch = fetch, now = () => Date.now(), env = () => undefined }) {
  const send = (shop, messages) => withSender(messages, shop.assetBase, quick(shop));

  // A reply is free; when its token has run out (400) the message goes out as a push instead,
  // which counts against the plan's monthly quota.
  async function deliver(ev, userId, shop, messages) {
    const out = send(shop, messages);
    const r = await line.reply(ev.replyToken, out);
    if (r.ok) return;
    if (r.status === 400 && userId !== 'anon') {
      const p = await line.push(userId, out);
      if (p.ok) return;
      throw new Error(`push failed ${p.status}`);
    }
    throw new Error(`reply failed ${r.status}`);
  }

  // The weekly closing-day notice goes in front of the first reply a customer gets that day.
  async function holiday(shop, userId, messages, { skip = false } = {}) {
    if (skip) return messages;
    const notice = holidayNotice(shop, new Date(now()));
    if (!notice) return messages;
    if (!(await store.claim(`hol:${userId}:${notice.key}`, 24 * HOUR))) return messages;
    return [notice.message, ...messages].slice(0, 5);
  }

  // Profiles that rarely change (the admins') are kept for an hour.
  async function profileCached(userId) {
    const hit = await store.get(`prof:${userId}`).catch(() => null);
    if (hit && now() - hit.at < HOUR && hit.data) return hit.data;
    const profile = await line.profile(userId);
    if (profile.name || profile.picture) await store.set(`prof:${userId}`, profile).catch(() => {});
    return profile;
  }
  const adminPhotos = (shop) => contactPhotos(shop, profileCached);

  // Pops up on the admins' LINE as a card from the OA. `to` = the people to tell.
  async function notifyAdmins(shop, to, { customerId, contact, said, reason }) {
    if (shop.contact?.notify === false) return;
    const customer = await line.profile(customerId);
    const link = chatLink(customerId, shop.contact?.chatLinkTemplate);
    const contactProfile = contact?.userId ? await profileCached(contact.userId) : null;
    const card = notificationCard(shop, { customer, contact: contact && { ...contact, picture: contactProfile?.picture }, said, link, reason });
    for (const p of to) {
      if (!p.userId) continue;
      const r = await line.push(p.userId, withSender([card], null, quick(shop))); // the topic buttons ride on the alert too
      if (!r.ok) console.error('[notify]', p.name, r.status);
    }
  }

  // The bot could not answer (a picture, a file): tell all the admins, once per customer per window.
  async function escalate(shop, cfg, userId, said, reason) {
    if (userId === 'anon' || !(await store.claim(`alert:${userId}`, cfg.alertEveryMs))) return;
    await notifyAdmins(shop, people(shop), { customerId: userId, contact: null, said, reason });
  }

  async function allPaused() {
    const p = await store.get('pause:all');
    return Boolean(p && Number(p.data?.until) > now());
  }

  async function adminCommand(ev, shop, cmd) {
    const reply = (text) => line.reply(ev.replyToken, [{ type: 'text', text }]);
    if (cmd.type === 'quota') {
      await reply(quotaText(await line.quota()));
      return 'admin:quota';
    }
    if (cmd.type === 'resume') {
      await store.del('pause:all');
      await reply('เปิดบอทแล้วค่ะ บอทจะกลับมาตอบลูกค้าตามปกติ 💬');
      return 'admin:resume';
    }
    const hours = cmd.hours ?? shop.adminPauseHours ?? 4;
    await store.set('pause:all', { until: now() + hours * HOUR });
    await reply(`ปิดบอทชั่วคราว ${hours} ชั่วโมง แล้วค่ะ บอทจะไม่ตอบลูกค้าเลยในช่วงนี้\nพิมพ์ "เปิดบอท" เพื่อให้บอทกลับมาตอบก่อนเวลาได้`);
    return 'admin:pause';
  }

  // Adds the "who do you want to talk to?" card (the admins with their photos) to a reply.
  const withAsk = async (shop, messages) => (people(shop).length ? [...messages, contactCard(shop, shop.contact.ask, await adminPhotos(shop))] : messages);

  // What the customer sees when the bot cannot answer: nothing, unless the shop set a short note.
  const receipt = (shop) => (shop.contact?.receivedNote ? [{ type: 'text', text: shop.contact.receivedNote }] : []);

  // → a short word describing what happened (for the log), never what anybody wrote.
  async function handle(ev, shop) {
    if (!ev || typeof ev !== 'object') return 'skip';
    if (ev.source?.type && ev.source.type !== 'user') return 'skip:source';
    if (ev.mode && ev.mode !== 'active') return 'skip:standby';
    if (!ev.replyToken) return 'skip:no-token';
    if (isPaused(shop, env('FAQ_BOT_PAUSED'))) return 'paused';
    const userId = ev.source?.userId ?? 'anon';

    if (ev.type === 'follow') {
      if (shop.welcome === false) return 'follow:off';
      await deliver(ev, userId, shop, await holiday(shop, userId, [welcomeMessage(shop)]));
      return 'follow';
    }
    if (ev.type !== 'message' || !ev.message) return 'skip:type';

    const cfg = contactCfg(shop);
    const hasContacts = people(shop).length > 0;

    // The customer is writing to a person, not the bot: say nothing, but a customer can
    // type "เมนู" (or tap a topic button) to bring the bot back.
    const quietNow = hasContacts && userId !== 'anon' && (await store.touchWithin(`quiet:${userId}`, cfg.windowMs));

    if (ev.message.type === 'text') {
      const said = String(ev.message.text ?? '');
      // Setup helper: lets an admin find the id to put in the settings row.
      if (isWhoAmI(said)) {
        await line.reply(ev.replyToken, [{ type: 'text', text: `ไอดี LINE ของคุณคือ\n${userId}` }]);
        return 'whoami';
      }
      const cmd = people(shop).some((p) => p.userId === userId) ? parseAdminCommand(said) : null;
      if (cmd) return adminCommand(ev, shop, cmd);
      if (await allPaused()) return 'paused:all'; // an admin silenced the bot for everyone

      // The customer chose whom to contact → the bot goes quiet and that person is told.
      const chosen = hasContacts ? findContact(said, shop) : null;
      if (chosen) {
        await store.set(`quiet:${userId}`, { name: chosen.name });
        // Only "the customer wants to talk to you" — no message text — and only once per customer per
        // person per window, however many times they tap the name.
        if (await store.claim(`pick:${userId}:${chosen.name}`, cfg.alertEveryMs)) await notifyAdmins(shop, [chosen], { customerId: userId, contact: chosen, said: '' });
        return 'pick';
      }
      if (quietNow) {
        if (!isWakeWord(said) && !isMenuTap(said, shop)) return 'quiet'; // a menu button is an explicit request too
        await store.del(`quiet:${userId}`);
      }

      // A customer who fires off several messages at once gets one answer: anything within a few
      // seconds of the bot's last reply is ignored (answering the school name is always allowed).
      const waiting = userId !== 'anon' ? await store.get(`await:${userId}`) : null;
      const awaitingSchool = Boolean(waiting && now() - waiting.at < SCHOOL_WAIT);
      const last = userId !== 'anon' ? await store.get(`last:${userId}`) : null;
      if (!awaitingSchool && last && now() - last.at < cfg.burstMs) {
        // …but a different menu button tapped a moment later is a new request; a repeat of the same line is not.
        if (!isMenuTap(said, shop) || normalize(said) === last.data?.said) return 'burst';
      }

      const r = buildReply(said, shop, { awaitingSchool });
      if (userId !== 'anon') {
        if (r.awaitingSchool) await store.set(`await:${userId}`, {});
        else if (waiting) await store.del(`await:${userId}`);
      }
      let messages = r.messages;
      if (r.needsPhotos) {
        // an order, a question the bot cannot answer, or "talk to the admin": show the people to choose from
        messages = hasContacts ? [contactCard(shop, r.askText ?? shop.contact.ask, await adminPhotos(shop))] : [];
      } else if (r.greeting && !shop.engineGreeting && !r.menuRequest) {
        messages = []; // the shop's own menu card already greets; a bare hello needs no second card
      } else if (r.silent && !r.quiet && hasContacts) {
        // Not understood: nobody is alerted (there are too many such questions a day). The customer
        // gets nothing, or the "who?" card / a short note if the shop switched that on.
        messages = shop.contact.askOnUnknown ? await withAsk(shop, []) : receipt(shop);
      }
      const out = await holiday(shop, userId, messages, { skip: isThanks(said, people(shop).map((p) => p.name)) });
      if (!out.length) return 'silent'; // nothing to say
      // noted before the reply goes out, so a second webhook arriving a moment later already sees it
      if (userId !== 'anon') await store.set(`last:${userId}`, { said: normalize(said) });
      await deliver(ev, userId, shop, out);
      return 'reply';
    }

    if ((await allPaused()) || quietNow) return 'quiet'; // photos, slips and stickers too
    if (ev.message.type === 'sticker') {
      // A thank-you sticker gets the same answer as a typed "ขอบคุณ". Any other sticker is
      // left alone — it is a wave or an OK, not a job.
      if (userId !== 'anon') await store.del(`await:${userId}`);
      if (!isThanksSticker(ev.message.keywords)) return 'sticker:ignored';
      await deliver(ev, userId, shop, thanksReply(shop).messages);
      return 'sticker:thanks';
    }

    // A payment slip is read and thanked; anything else the bot cannot read is passed to the admins.
    // Several pictures or files in a row get one thank-you and one alert (the first), not one each.
    const isPicture = ev.message.type === 'image';
    const isFile = ev.message.type === 'file'; // the "ส่งเอกสารโครงการ" button invites these
    if ((isPicture || isFile) && userId !== 'anon' && !(await store.claim(`img:${userId}`, cfg.pictureReplyMs))) return 'media:gate';
    if (isFile || (isPicture && !readerOn(env))) {
      // A file is never read, and with no AI key neither is a picture: it is thanked, and the admins are told to look at it.
      if (hasContacts) await escalate(shop, cfg, userId, isFile ? '(ส่งไฟล์)' : '(ส่งรูป)', isFile ? 'ลูกค้าส่งไฟล์' : 'ลูกค้าส่งรูป');
      await deliver(ev, userId, shop, await holiday(shop, userId, [slipReply(shop, { sure: false, kind: isFile ? 'file' : 'picture' })]));
      return isFile ? 'file' : 'picture';
    }
    if (isPicture) {
      const file = await line.content(ev.message.id);
      const slip = file && (await readSlip(file.bytes, file.mimeType, { env, fetchImpl: doFetch }));
      if (slip) {
        if (hasContacts) await escalate(shop, cfg, userId, '(ส่งสลิป)', 'ลูกค้าส่งสลิป'); // a payment: the admins confirm the order
        await deliver(ev, userId, shop, await holiday(shop, userId, [slipReply(shop, slip)]));
        return 'slip';
      }
      if (hasContacts) await escalate(shop, cfg, userId, '(ส่งรูป)', 'ลูกค้าส่งรูป'); // pictures may be an order
    }
    const out = await holiday(shop, userId, receipt(shop)); // a short note, and the closing-day notice if it applies
    if (out.length) await deliver(ev, userId, shop, out);
    return out.length ? 'note' : 'silent:media';
  }

  return { handle };
}
