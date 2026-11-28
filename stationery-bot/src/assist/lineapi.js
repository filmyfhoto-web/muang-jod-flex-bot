// The few LINE Messaging API calls the assistant makes. `fetch` is injected so tests can fake it.
const API = 'https://api.line.me/v2/bot';

export function createLine({ fetch: doFetch = fetch, token }) {
  const auth = { Authorization: `Bearer ${token}` };

  async function send(path, body) {
    try {
      const res = await doFetch(`${API}/message/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) return { ok: true, status: res.status };
      return { ok: false, status: res.status, error: (await res.text().catch(() => '')).slice(0, 200) };
    } catch (e) {
      return { ok: false, status: 0, error: String(e?.message ?? e).slice(0, 200) };
    }
  }

  return {
    // A reply is free. The token is single-use and only good for a short while.
    reply: (replyToken, messages) => send('reply', { replyToken, messages: messages.slice(0, 5) }),
    // A push counts against the plan's monthly quota — only for the admin alerts, and as the
    // fallback when a reply token has run out.
    push: (to, messages) => send('push', { to, messages: messages.slice(0, 5) }),

    // A LINE profile: { name, picture } (picture is an https URL or null). Never throws.
    async profile(userId) {
      try {
        const res = await doFetch(`${API}/profile/${encodeURIComponent(userId)}`, { headers: auth, signal: AbortSignal.timeout(8000) });
        if (!res.ok) return { name: null, picture: null };
        const j = await res.json();
        const picture = typeof j.pictureUrl === 'string' && j.pictureUrl.startsWith('https://') ? j.pictureUrl : null;
        return { name: j.displayName ?? null, picture };
      } catch {
        return { name: null, picture: null };
      }
    },

    // The bytes of a picture the customer sent. Never throws; null when it cannot be had.
    async content(messageId) {
      try {
        const res = await doFetch(`https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`, {
          headers: auth,
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) return null;
        const mimeType = (res.headers.get('content-type') ?? '').split(';')[0].trim();
        return { bytes: new Uint8Array(await res.arrayBuffer()), mimeType };
      } catch {
        return null;
      }
    },

    // This month's push quota: { type: 'none' | 'limited', limit, used } — null when LINE cannot be asked.
    async quota() {
      try {
        const [q, c] = await Promise.all([
          doFetch(`${API}/message/quota`, { headers: auth, signal: AbortSignal.timeout(8000) }),
          doFetch(`${API}/message/quota/consumption`, { headers: auth, signal: AbortSignal.timeout(8000) }),
        ]);
        if (!q.ok || !c.ok) return null;
        const quota = await q.json();
        const used = (await c.json()).totalUsage;
        return { type: quota.type, limit: quota.value ?? null, used };
      } catch {
        return null;
      }
    },
  };
}

export function quotaText(info) {
  if (!info) return 'ดูโควตาไม่ได้ในตอนนี้ค่ะ ลองดูใน LINE Official Account Manager แทนนะคะ';
  if (info.type !== 'limited' || info.limit == null) return `เดือนนี้ส่งข้อความ (push) ไปแล้ว ${info.used} ข้อความ แผนนี้ไม่จำกัดจำนวนค่ะ`;
  const left = Math.max(info.limit - info.used, 0);
  return `โควตาข้อความเดือนนี้\nใช้ไปแล้ว ${info.used} จาก ${info.limit}\nเหลือ ${left} ข้อความ${left === 0 ? '\n⚠️ เต็มแล้ว ข้อความ push (เช่น แจ้งเตือนออเดอร์) จะไม่ถูกส่งจนกว่าจะขึ้นเดือนใหม่' : ''}`;
}

// A link to this customer's chat, built from the shop's own template, e.g.
//   "https://example/{bot}/chat/{customer}"
// There is no default: a link that does not open is worse than none. Returns null unless a
// template is set.
export function chatLink(customerId, template) {
  if (!template || !customerId || customerId === 'anon') return null;
  return String(template).replace('{customer}', customerId);
}

// One log line per webhook event — what kind it is, never what anyone wrote.
export function describeEvent(ev) {
  const parts = [
    `type=${ev?.type}`,
    `source=${ev?.source?.type ?? '-'}`,
    `message=${ev?.message?.type ?? '-'}`,
    `mode=${ev?.mode ?? '-'}`,
  ];
  const extra = Object.keys(ev ?? {}).filter(
    (k) => !['type', 'source', 'message', 'mode', 'timestamp', 'replyToken', 'webhookEventId', 'deliveryContext', 'postback'].includes(k)
  );
  if (extra.length) parts.push(`other=${extra.join(',')}`);
  return `[webhook] ${parts.join(' ')}`;
}
