// One LINE event → the chat-order drafts. It never answers the customer: the bot stays silent while orders are gathered, and the
// shop's own answers (app/bot.js, the Render bot's replies) run as before. Everything here is idempotent: a LINE message seen
// before changes nothing, and a draft's items are merged by content, so a retry after a restart cannot double an order.
import { classifyText, itemsFromLines, mergeItems, noteAppend } from './draft.js';
import { dayToDate } from '../picklist.js';
import { enabledFor } from '../chatorders.js';
import { looksLikeOrder } from '../chatai.js';

const MIN = 60_000;
const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_PHOTO = 8 * 1024 * 1024;
const iso = (ms) => new Date(ms).toISOString();
const clip = (s, n) => {
  const t = String(s ?? '');
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};

// getConfig() → the current chatDrafts settings (read per event, so a change in shop.json or on Render applies at once).
// ai → { read(texts) } or null · lineApi → { profile(userId, token), content(messageId, token) }.
export function createOrderIngest({ store, catalog, lineApi, getConfig, ai = null, now = () => Date.now(), log = console, notify = async () => {} }) {
  const cfg0 = () => getConfig() ?? {};
  const windowMs = () => (Number(cfg0().windowMinutes) > 0 ? Number(cfg0().windowMinutes) : 30) * MIN;
  const cardEveryMs = () => (Number(cfg0().cardEveryMinutes) > 0 ? Number(cfg0().cardEveryMinutes) : 3) * MIN;
  const maxItems = () => (Number(cfg0().maxItems) > 0 ? Number(cfg0().maxItems) : 200);
  const cardAt = new Map(); // draft id → when its last card went to the admins

  const openDraft = (channelKey, userId) => store.openDraft(channelKey, userId, iso(now() - windowMs()));

  // items join the customer's open draft, or open a new one (its number from the database). → { draft, created, added }
  async function addItems(ctx, fresh, { note, day, via }) {
    const { channelKey, userId } = ctx;
    for (let attempt = 0; attempt < 4; attempt++) {
      const cur = attempt === 0 && ctx.open ? ctx.open : await openDraft(channelKey, userId);
      if (cur) {
        const m = mergeItems(cur.items ?? [], fresh, maxItems());
        const patch = { items: m.items, note: noteAppend(cur.note, note), last_msg_at: iso(now()), updated_at: iso(now()) };
        if (day && !cur.need_date) patch.need_date = dayToDate(day, now());
        const draft = await store.casUpdateDraft(cur.id, cur.version, patch);
        if (draft) {
          await store.addEvent(cur.id, 'bot', 'merged', { added: m.added, via });
          return { draft, created: false, added: m.added };
        }
        continue; // the draft changed a moment ago: read it again
      }
      if (ctx.lineName === undefined) ctx.lineName = (await lineApi.profile(userId, ctx.token).catch(() => null))?.name ?? null;
      const hints = await store.customerHints(userId).catch(() => ({}));
      const row = {
        draft_no: await store.nextDraftNo(),
        channel_key: channelKey,
        line_user_id: userId,
        line_name: ctx.lineName,
        customer_name: hints.name || ctx.lineName || null,
        phone: hints.phone || null,
        school_name: hints.school_name ? clip(hints.school_name, 200) : null,
        need_date: day ? dayToDate(day, now()) : null,
        note: noteAppend(null, note),
        items: fresh,
        status: 'open',
        version: 1,
        first_msg_at: iso(now()),
        last_msg_at: iso(now()),
      };
      const made = await store.createDraft(row);
      if (made) {
        await store.addEvent(made.id, 'bot', 'created', { lines: fresh.length, via, channel: channelKey });
        return { draft: made, created: true, added: fresh.length };
      }
      // another message of this customer opened the draft a moment earlier: merge into that one on the next round
    }
    throw new Error('the draft kept changing while this message was being added');
  }

  // a message with no items, sent while a draft is open: its words go into the note and a day into the need date
  async function addRemark(ctx, text, day) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const cur = attempt === 0 && ctx.open ? ctx.open : await openDraft(ctx.channelKey, ctx.userId);
      if (!cur) return null;
      const patch = { note: noteAppend(cur.note, text), last_msg_at: iso(now()), updated_at: iso(now()) };
      if (day && !cur.need_date) patch.need_date = dayToDate(day, now());
      const draft = await store.casUpdateDraft(cur.id, cur.version, patch);
      if (draft) {
        await store.addEvent(cur.id, 'bot', 'note', { chars: text.length });
        return { draft, created: false, added: 0 };
      }
    }
    throw new Error('the draft kept changing while this note was being added');
  }

  async function onText(ctx, text, messageId) {
    const conf = cfg0();
    let c = classifyText(text, { open: Boolean(ctx.open) });
    let via = 'chat';
    if (!['list', 'single', 'follow'].includes(c.kind) && ai && ctx.useAi && looksLikeOrder(text)) {
      const recent = ctx.open ? await store.recentTexts(ctx.open.id, 6).catch(() => []) : [];
      const r = await ai.read([...recent, text]).catch(() => null);
      if (r) {
        c = { kind: 'ai', items: r.items, day: r.day, notes: [] };
        via = 'ai';
      }
    }
    if (c.kind === 'ignore') return { handled: false, why: 'general' };
    const outcome =
      c.items.length
        ? await addItems(ctx, itemsFromLines(c.items, await catalog.get(), { src: via, match: conf.match }), { note: text, day: c.day, via })
        : await addRemark(ctx, text, c.day);
    if (!outcome) return { handled: false, why: 'no-draft' };
    const saved = await store.insertMessage({
      channel_key: ctx.channelKey,
      line_message_id: messageId,
      line_user_id: ctx.userId,
      kind: 'text',
      body: clip(text, 1000),
      draft_id: outcome.draft.id,
    });
    return { handled: true, ...outcome, duplicate: !saved };
  }

  async function onImage(ctx, messageId) {
    if (!ctx.open) return { handled: false, why: 'no-draft' };
    const file = await lineApi.content(messageId, ctx.token).catch(() => null);
    const ext = file && PHOTO_TYPES[file.mimeType];
    if (!ext || file.buffer.length > MAX_PHOTO) return { handled: false, why: 'photo-type' };
    const path = `${ctx.channelKey}/${ctx.open.draft_no}/${messageId}.${ext}`;
    try {
      await store.putMedia(path, file.buffer, file.mimeType);
    } catch (e) {
      if (!/exist|duplicate/i.test(String(e.message))) throw e; // the same photo delivered twice
    }
    const saved = await store.insertMessage({
      channel_key: ctx.channelKey,
      line_message_id: messageId,
      line_user_id: ctx.userId,
      kind: 'image',
      media_path: path,
      draft_id: ctx.open.id,
    });
    await store.addEvent(ctx.open.id, 'bot', 'photo', { path });
    return { handled: true, draft: ctx.open, created: false, added: 0, photo: true, duplicate: !saved };
  }

  // the admins get a card for a new draft at once, and for more items at most once per cardEveryMinutes
  function maybeNotify(out, ctx) {
    const last = cardAt.get(out.draft.id) ?? 0;
    if (!out.created && now() - last < cardEveryMs()) return;
    cardAt.set(out.draft.id, now());
    if (cardAt.size > 5000) cardAt.clear();
    Promise.resolve()
      .then(() => notify({ draft: out.draft, created: out.created, added: out.added, label: ctx.label, channelKey: ctx.channelKey, userId: ctx.userId }))
      .catch((e) => log.error?.('[orders] card:', e.message));
  }

  async function handle({ channelKey, label, token, ev }) {
    if (ev?.type !== 'message' || ev.source?.type !== 'user' || !ev.source.userId) return { handled: false, why: 'not-a-customer' };
    const userId = ev.source.userId;
    const conf = cfg0();
    if (!enabledFor(conf, userId)) return { handled: false, why: 'off' };
    const messageId = String(ev.message?.id ?? '');
    if (!messageId) return { handled: false, why: 'no-message-id' };
    if (await store.messageSeen(channelKey, messageId)) return { handled: true, duplicate: true };
    const ctx = {
      channelKey,
      label,
      token,
      userId,
      open: await openDraft(channelKey, userId),
      lineName: undefined,
      useAi: Boolean(ai) && enabledFor({ mode: conf.ai?.mode, pilotUserIds: conf.pilotUserIds }, userId),
    };
    let out;
    if (ev.message.type === 'text') out = await onText(ctx, String(ev.message.text ?? ''), messageId);
    else if (ev.message.type === 'image') out = await onImage(ctx, messageId);
    else return { handled: false, why: 'kind' };
    if (out.handled && (out.created || out.added > 0)) maybeNotify(out, ctx);
    return out;
  }

  return { handle };
}
