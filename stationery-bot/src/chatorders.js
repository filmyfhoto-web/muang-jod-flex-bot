// A customer's order typed in the chat → a job in the shop's own back office (the NATTA GROUP web app), where the staff check
// it and make the ใบสั่งจัด. Nothing new is invented: the job is a row of the app's existing `project_docs` table — the one the
// teachers' "ส่งเอกสารโครงการ" documents and the staff's own ใบสั่งจัด already use — with the list in its `items`.
//
//   the customer's words ──► picklist.js (lines) ──► catalog.js (which product?) ──► project_docs (origin 'chat', status 'new')
//
// What the bot will not do, by design: it never creates or edits a product, never writes a price (every `price` is null — the
// staff fill them, or press the app's "ใส่ราคาร้าน" button) and never touches stock. A line that is not clearly one of the
// shop's products stays the customer's own words, marked `review` — the app shows it as "รอตรวจสอบสินค้า". The staff correct
// or match it there.
//
// Off unless shop.json `chatOrders.mode` says otherwise ("off" · "pilot" = only the LINE ids listed in `pilotUserIds` · "on").
import { pick } from './catalog.js';
import { dayToDate, normUnit, parseOrderText } from './picklist.js';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const MAX_ITEMS = 200;

const within = (promise, ms) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), ms).unref?.())]);
const key = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, '');
const clip = (s, n) => {
  const t = String(s ?? '');
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};

// Is the customer's order recorded in the app? ("pilot" = only the people listed, to try it with one's own LINE first)
export function enabledFor(cfg, userId) {
  if (!userId || userId === 'anon') return false;
  if (cfg?.mode === 'on') return true;
  return cfg?.mode === 'pilot' && Array.isArray(cfg.pilotUserIds) && cfg.pilotUserIds.includes(userId);
}

// The link that opens this job in the back office: https://admin.nattagroup.com/?doc=PJ-0123#projdocs
export function docLink(appUrl, docNo) {
  if (!appUrl) return '';
  try {
    const u = new URL(appUrl);
    if (docNo) u.searchParams.set('doc', docNo);
    return u.toString();
  } catch {
    return appUrl;
  }
}

// parsed lines → the app's item rows: { name, qty, unit, price: null, product_id?, code?, said?, review?, hint?, src }
export function buildItems(lines, products, match = {}) {
  return lines.map((it) => {
    const { product, near } = pick(products, it.name, match);
    const item = { name: clip(it.name, 200), qty: it.qty, unit: it.unit || '', price: null, src: it.src || 'chat' };
    if (product) {
      item.product_id = product.id;
      if (product.code) item.code = product.code;
      item.name = product.name || item.name;
      if (key(it.name) !== key(product.name)) item.said = clip(it.name, 200); // what the customer actually wrote
      if (!item.unit) item.unit = product.unit || '';
      else if (product.unit && normUnit(product.unit) !== normUnit(item.unit)) {
        item.review = true; // "2 แพ็ค" of something the shop sells by the bottle: the quantity needs a look
        item.hint = clip(`ร้านขายเป็น “${product.unit}” — ตรวจจำนวนอีกครั้ง`, 200);
      }
    } else {
      item.review = true;
      if (near.length) item.hint = clip('ใกล้เคียง: ' + near.slice(0, 3).map((p) => p.name).join(' · '), 200);
    }
    return item;
  });
}

// Lines of a second message join the first (a customer often sends the list in two or three pieces); a line that is
// already there — same words, quantity and unit — is not added twice.
export function mergeItems(old, fresh, max = Infinity) {
  const k = (x) => `${key(x.name)}|${x.qty}|${normUnit(x.unit)}|${key(x.said)}`;
  const seen = new Set(old.map(k));
  const add = [];
  for (const x of fresh) {
    if (old.length + add.length >= max) break; // one job never grows without end
    if (seen.has(k(x))) continue;
    seen.add(k(x));
    add.push(x);
  }
  return { items: [...old, ...add], added: add.length };
}

// The customer's own message, kept in the job's "บันทึกของร้าน" so the staff can read it next to the lines (the app caps notes at 1000).
const NOTE_HEAD = 'ข้อความจากแชท LINE:';
const noteFor = (text, via) => `${NOTE_HEAD}${via === 'ai' ? ' (แยกรายการด้วย AI — ตรวจกับข้อความเดิมก่อนเสมอ)' : ''}\n${String(text ?? '').trim()}`;
const joinNotes = (old, add) => {
  if (!old) return clip(add, 1000);
  if (old.includes(add)) return old;
  const both = `${old}\n———\n${add}`;
  return both.length <= 1000 ? both : clip(old, 1000); // no room: the first message stays, the new lines are still in the items
};

export function createChatOrders({ store, catalog, now = () => Date.now(), log = console }) {
  // → { ok, doc, merged, added, linked, review, total } · { ok: true, dup: true } for a message already recorded · { ok: false, error }
  // Never throws: whatever goes wrong here leaves the customer's chat and the admins' alert exactly as they were.
  async function record(args) {
    try {
      return await within(recordNow(args), 10_000); // however the database behaves, the customer's turn is held at most this long
    } catch (e) {
      log.error?.('[chatorders]', String(e?.message ?? e).slice(0, 160));
      return { ok: false, error: String(e?.message ?? e).slice(0, 160) };
    }
  }
  async function recordNow({ userId, lineName = '', text, list, cfg = {}, messageId = null }) {
    if (messageId) {
      // "this very message again" (LINE sent it twice, or the bot restarted): once is enough. If the check itself fails, carry on —
      // a second job is easy to cancel, a lost order is not.
      const first = await within(store.claim(`chatmsg:${messageId}`, 7 * DAY), 3000).catch((e) => {
        log.error?.('[chatorders] claim', String(e?.message ?? e).slice(0, 120));
        return true;
      });
      if (!first) return { ok: true, dup: true };
    }
    const products = (await within(catalog.get(), 3000).catch(() => [])) || [];
    const via = list.via === 'ai' ? 'ai' : 'chat';
    const items = buildItems(list.items.map((i) => ({ ...i, src: via })), products, cfg.match);
    const needDate = list.day ? dayToDate(list.day, now()) : null;
    const since = new Date(now() - (Number(cfg.mergeMinutes) > 0 ? Number(cfg.mergeMinutes) : 30) * MIN).toISOString();

    const open = await within(store.chatDocOpen(userId, since), 5000);
    if (open) {
      const m = mergeItems(Array.isArray(open.items) ? open.items : [], items, MAX_ITEMS);
      const patch = { items: m.items, note: joinNotes(open.note, noteFor(text, via)), updated_at: new Date(now()).toISOString() };
      if (needDate && !open.need_date) patch.need_date = needDate;
      const doc = await within(store.chatDocUpdate(open.id, open.updated_at, patch), 5000);
      // null = the staff changed the job while we were reading it: their version wins, this message becomes a job of its own
      if (doc) return summary(doc, { merged: true, added: m.added });
    }

    const hints = await within(store.teacherHints(userId), 4000).catch(() => ({}));
    const doc = await within(
      store.chatDocCreate({
        line_user_id: userId,
        line_name: lineName || hints.line_name || null,
        teacher_name: hints.name || lineName || null,
        phone: hints.phone || null,
        school_id: hints.school_id || null,
        school_name: hints.school_name || null,
        project_name: clip(cfg.projectName || 'สั่งของทางแชท LINE', 300),
        need_date: needDate,
        status: 'new',
        origin: 'chat',
        note: noteFor(text, via).slice(0, 1000),
        items,
      }),
      6000,
    );
    return summary(doc, { merged: false, added: items.length });
  }
  // What the customer wrote right after the list ("ประมาณวันที่ 28 ครูจะมารับ") goes into the same job's note, and a "วันที่ 28"
  // in it becomes the date they need it. → the job, or null when there is none to add to (or somebody saved it first).
  async function remark({ userId, text, cfg = {} }) {
    try {
      const since = new Date(now() - (Number(cfg.mergeMinutes) > 0 ? Number(cfg.mergeMinutes) : 30) * MIN).toISOString();
      const open = await within(store.chatDocOpen(userId, since), 5000);
      if (!open) return null;
      const patch = { note: joinNotes(open.note, `ข้อความต่อมา:\n${String(text ?? '').trim()}`), updated_at: new Date(now()).toISOString() };
      const day = parseOrderText(text).day;
      if (day && !open.need_date) patch.need_date = dayToDate(day, now());
      return await within(store.chatDocUpdate(open.id, open.updated_at, patch), 5000);
    } catch (e) {
      log.error?.('[chatorders] remark', String(e?.message ?? e).slice(0, 160));
      return null;
    }
  }
  const summary = (doc, { merged, added }) => {
    const items = Array.isArray(doc.items) ? doc.items : [];
    return { ok: true, doc, merged, added, total: items.length, linked: items.filter((x) => x.product_id).length, review: items.filter((x) => x.review).length };
  };

  // One pass of "tell the customer the shop has taken the order": for every chat job the staff have picked up (status
  // working / done — a person chose it in the app, it is not something the bot decides) that the customer was not yet told
  // about, send the one sentence in cfg.ack.text. At most once per job, ever (a claim on the job number), never while
  // the customer is talking to a person (`busy`), and in "pilot" mode only to the pilot people.
  // → how many customers were told
  const settled = new Set(); // job numbers that need no more looking at (told, or told earlier): spares a query per job on every pass
  const settle = (no) => {
    if (settled.size > 5000) settled.clear();
    settled.add(no);
  };
  async function ack({ cfg = {}, push, busy = async () => false }) {
    const a = cfg.ack ?? {};
    if (!a.enabled || !cfg.mode || cfg.mode === 'off' || !a.text) return 0;
    const since = new Date(now() - (Number(a.maxAgeHours) > 0 ? Number(a.maxAgeHours) : 48) * 60 * MIN).toISOString();
    const docs = await within(store.chatDocsToAck(since), 6000);
    let told = 0;
    for (const d of docs) {
      if (settled.has(d.doc_no) || !enabledFor(cfg, d.line_user_id)) continue;
      if (await busy(d.line_user_id).catch(() => true)) continue; // a person is talking with them: try again on the next pass
      const claimKey = `chatack:${d.doc_no}`;
      if (!(await within(store.claim(claimKey, 400 * DAY), 5000))) {
        settle(d.doc_no); // told already (this run or an earlier one)
        continue;
      }
      try {
        await push(d.line_user_id, [{ type: 'text', text: clip(a.text, 1000) }]);
        settle(d.doc_no);
        told++;
      } catch (e) {
        log.error?.('[chatorders] ack', d.doc_no, String(e?.message ?? e).slice(0, 120));
        // a failed push (not a blocked customer) may be tried again on the next pass
        if (/\b(400|403)\b/.test(String(e?.status ?? e?.message ?? ''))) settle(d.doc_no);
        else await store.unclaim(claimKey).catch(() => {});
      }
    }
    return told;
  }

  return { record, remark, ack };
}
