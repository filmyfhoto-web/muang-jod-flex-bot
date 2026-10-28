// Stand-ins for the app's database and LINE, for the tests of src/app/*.
import { BOT_DEFAULT } from '../../src/app/bot.js';

export const OWNER = 'U' + 'a'.repeat(32); // a customer
export const OTHER = 'U' + 'b'.repeat(32); // another customer
export const STAFF = 'U' + 'c'.repeat(32); // someone in app_secrets.line_notify

export const orderRow = (over = {}) => ({
  id: 'o1',
  order_no: 'NT-0044',
  status: 'new',
  line_user_id: OWNER,
  line_notify: '',
  orderer_name: 'ครูสมชาย',
  org: 'โรงเรียนบ้านทดสอบ',
  project: 'โครงการทดสอบ',
  total: 150,
  school_id: null,
  items: [{ name: 'ปากกา', qty: 2, product_id: 'p1', sort: 1, line_total: 30 }],
  ...over,
});

// `line_bot` as the app's back office stores it. Everything off except what a test turns on.
export const settings = (over = {}) => ({ enabled: true, relay: true, menu_card: false, admin_pick: false, docs: false, menu_style: 'both', ...over });

export function makeFakes({ line_bot = settings(), orders = [orderRow()], chat = {}, secrets = {}, now = () => Date.now() } = {}) {
  const calls = []; // every call to LINE: { path, body }
  const state = new Map(Object.entries(chat));
  const orderMap = new Map(orders.map((o) => [o.order_no, o]));
  const sec = { line_channel_token: 'test-token', line_notify: JSON.stringify([{ id: STAFF, name: 'พนักงาน' }]), ...secrets };
  const fake = {
    broken: false, // when true the settings row cannot be read
    chatBroken: false,
    line_bot,
    async getSecret(k) {
      return sec[k] ?? null;
    },
    async getConfig(k) {
      if (k === 'line_bot') {
        if (fake.broken) throw new Error('db down');
        return fake.line_bot;
      }
      return k === 'shop' ? {} : null;
    },
    async getChat(uid) {
      if (fake.chatBroken) throw new Error('db down');
      return state.get(uid) ?? null;
    },
    async setChat(uid, patch) {
      state.set(uid, { ...(state.get(uid) ?? {}), ...patch });
    },
    chatOf: (uid) => state.get(uid),
    async getOrder(no) {
      return orderMap.get(no) ?? null;
    },
    async setOrderNotify(no, v) {
      const o = orderMap.get(no);
      if (o) o.line_notify = v;
    },
    orderNotify: (no) => orderMap.get(no)?.line_notify,
    getShop: async () => ({}),
    async getDocState() {
      return null;
    },
    async setDocState() {},
    async clearDocState() {},
    async getTeacher() {
      return null;
    },
    async teacherHints() {
      return {};
    },
    async listSchools() {
      return [];
    },
    async recentDocs() {
      return [];
    },
    async sharedDocs() {
      return [];
    },
    async docByNo() {
      return null;
    },
  };
  const doFetch = async (url, init = {}) => {
    const path = String(url).replace('https://api.line.me', '');
    let body = null;
    try {
      body = init.body ? JSON.parse(init.body) : null;
    } catch {
      body = null;
    }
    calls.push({ path, body, url: String(url) });
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const replies = () => calls.filter((c) => c.path === '/v2/bot/message/reply');
  const sent = () => replies().flatMap((c) => c.body.messages);
  const marked = () => calls.filter((c) => c.path === '/v2/bot/chat/markAsRead');
  return { fake, calls, doFetch, replies, sent, marked, now };
}

let n = 0;
export const textEv = (text, userId = OWNER, extra = {}) => ({
  type: 'message',
  mode: 'active',
  replyToken: 'rt-' + ++n,
  source: { type: 'user', userId },
  message: { id: 'm' + n, type: 'text', text, markAsReadToken: 'mr-' + n },
  ...extra,
});
export const followEv = (userId = OWNER) => ({ type: 'follow', mode: 'active', replyToken: 'rt-' + ++n, source: { type: 'user', userId } });
export const imageEv = (userId = OWNER) => ({ type: 'message', mode: 'active', replyToken: 'rt-' + ++n, source: { type: 'user', userId }, message: { id: 'img' + n, type: 'image' } });
export { BOT_DEFAULT };

// What LINE sends: a body with `destination` and `events`.
export const batch = (...events) => JSON.stringify({ destination: 'U' + '0'.repeat(32), events });
