// One LINE event → the "แชตและออเดอร์" page's chats. It never answers the customer and never changes what the bot does: the shop's own
// answers (server.js handleEvent, the app's cards, the Studio) run exactly as before. A customer's message becomes a message in their
// chat (the chat is opened on their first message); a picture is saved in the page's private bucket first so staff can open it later,
// because LINE only keeps what a customer sent for a limited time. Everything here is idempotent: a LINE message seen before
// (LINE retried, the bot restarted) changes nothing.
import { enabledFor } from '../chatorders.js';

const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }; // what the page's bucket accepts
const MAX_IMAGE = 10 * 1024 * 1024;
const clip = (s, n) => {
  const t = String(s ?? '');
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};

// What a LINE message looks like in the chat. Anything that is not text is shown as a short Thai note, so a staff member reading
// the chat knows the customer sent something (and where to look for it) even when the page cannot show it. → { kind, body, meta }
export function describeMessage(message = {}) {
  switch (message.type) {
    case 'text':
      return { kind: 'text', body: String(message.text ?? ''), meta: {} };
    case 'sticker':
      return {
        kind: 'sticker',
        body: '[สติกเกอร์]',
        meta: { package_id: message.packageId ?? null, sticker_id: message.stickerId ?? null, keywords: Array.isArray(message.keywords) ? message.keywords.slice(0, 10) : [] },
      };
    case 'video':
      return { kind: 'video', body: '[วิดีโอ] ดูได้ในแอป LINE OA Manager', meta: {} };
    case 'audio':
      return { kind: 'audio', body: '[ข้อความเสียง] ฟังได้ในแอป LINE OA Manager', meta: {} };
    case 'file':
      return { kind: 'file', body: `[ไฟล์] ${clip(message.fileName || 'ไม่มีชื่อ', 200)}`, meta: { name: clip(message.fileName || '', 200), size: Number(message.fileSize) || null } };
    case 'location':
      return {
        kind: 'location',
        body: `[ตำแหน่งที่ตั้ง] ${clip([message.title, message.address].filter(Boolean).join(' · '), 300)}`.trim(),
        meta: { latitude: message.latitude ?? null, longitude: message.longitude ?? null, title: clip(message.title || '', 200), address: clip(message.address || '', 300) },
      };
    default:
      return { kind: 'other', body: `[ข้อความชนิด ${clip(message.type || 'ไม่ทราบ', 30)} ที่หน้านี้ยังแสดงไม่ได้ ดูในแอป LINE OA Manager]`, meta: {} };
  }
}

// a failure that retrying cannot fix (the database refused the data) is not retried; no answer / a server error is
const transient = (e) => !e?.code || /^(5|08|53|57|XX)/.test(String(e.code));

// store → createSaleChatStore · lineApi → { profile(userId, token), content(messageId, token) } · getConfig() → the current saleChat settings
// retries → how long to wait before each new try when the database does not answer
export function createSaleChatIngest({ store, lineApi, getConfig, log = console, retries = [1000, 5000, 15000], sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  async function imagePart(messageId, token, channelKey) {
    const file = await lineApi.content(messageId, token).catch(() => null);
    const ext = file && IMAGE_TYPES[file.mimeType];
    if (!file || !ext || !file.buffer?.length || file.buffer.length > MAX_IMAGE) {
      return { kind: 'image', body: '[รูปภาพ] เอารูปจาก LINE มาไม่ได้ ดูในแอป LINE OA Manager', meta: {} };
    }
    const path = `line/${channelKey}/${messageId}.${ext}`;
    try {
      await store.putMedia(path, file.buffer, file.mimeType);
    } catch (e) {
      // the same picture delivered twice is already there; any other failure still records the message, without the picture
      if (!/exist|duplicate/i.test(String(e.message))) {
        log.error?.('[salechat] picture not saved:', e.message);
        return { kind: 'image', body: '[รูปภาพ] เก็บรูปไม่สำเร็จ ดูในแอป LINE OA Manager', meta: {} };
      }
    }
    return { kind: 'image', body: '[รูปภาพ]', meta: { path, name: 'รูปจากลูกค้า', size: file.buffer.length, type: file.mimeType } };
  }

  async function ingestWithRetry(payload) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await store.ingest(payload);
      } catch (e) {
        if (attempt >= retries.length || !transient(e)) throw e;
        await sleep(retries[attempt]);
      }
    }
  }

  // → { handled, why?, duplicate?, thread_id?, msg_id? } · throws only when the database could not take the message
  async function handle({ channelKey, token, ev }) {
    if (ev?.type !== 'message' || ev.source?.type !== 'user' || !ev.source.userId) return { handled: false, why: 'not-a-customer' };
    const userId = ev.source.userId;
    if (!enabledFor(getConfig() ?? {}, userId)) return { handled: false, why: 'off' };
    const messageId = String(ev.message?.id ?? '');
    if (!messageId) return { handled: false, why: 'no-message-id' };
    const part = ev.message.type === 'image' ? await imagePart(messageId, token, channelKey) : describeMessage(ev.message);
    const profile = await lineApi.profile(userId, token).catch(() => null);
    const res = await ingestWithRetry({
      channel_key: channelKey,
      line_user_id: userId,
      line_message_id: messageId,
      kind: part.kind,
      body: part.body,
      name: profile?.name ?? null,
      picture: profile?.picture ?? null,
      at_ms: Number(ev.timestamp) > 0 ? Number(ev.timestamp) : null,
      meta: part.meta,
    });
    return { handled: true, ...res };
  }

  return { handle };
}
