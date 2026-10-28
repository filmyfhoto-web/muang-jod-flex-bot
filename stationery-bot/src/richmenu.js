// The permanent menu under the chat (LINE calls it a "rich menu"): one picture split into
// tappable columns. An admin installs it by typing "ติดตั้งเมนู" in their own chat with the OA
// and takes it off with "ลบเมนู" — the bot holds the channel token, so nothing is typed into
// a console. Only menus carrying this bot's own name are ever touched or removed.
import { readFileSync } from 'node:fs';

const API = 'https://api.line.me/v2/bot';
const DATA = 'https://api-data.line.me/v2/bot';
export const WIDTH = 2500;
export const HEIGHT = 843; // the "compact" size LINE allows; the picture must be exactly this
export const MAX_BYTES = 1_000_000; // LINE refuses a menu picture over 1 MB
const MAX_COLUMNS = 6;

export const menuName = (shop) => String(shop.richMenu?.name || 'stationery-bot-menu').slice(0, 300);

// → the rich menu object LINE wants, built from shop.richMenu: one row of equal columns,
// each column sends its `text` as the customer's own message (so the bot answers it as usual) — or opens its `uri`.
export function buildRichMenu(shop) {
  const rm = shop.richMenu;
  const cols = Array.isArray(rm?.areas) ? rm.areas : [];
  if (cols.length === 0) throw new Error('shop.json ไม่มี richMenu.areas');
  if (cols.length > MAX_COLUMNS) throw new Error(`เมนูมีได้ไม่เกิน ${MAX_COLUMNS} ช่อง`);
  const top = Math.min(Math.max(Math.round(Number(rm.top) || 0), 0), HEIGHT - 100); // a title strip above the buttons is not tappable
  const w = Math.floor(WIDTH / cols.length);
  return {
    size: { width: WIDTH, height: HEIGHT },
    selected: rm.selected !== false, // open by default every time the chat is opened
    name: menuName(shop),
    chatBarText: String(rm.chatBarText || 'เมนู').slice(0, 14), // LINE: at most 14 characters
    areas: cols.map((c, i) => {
      const uri = String(c?.uri ?? '').trim();
      let action;
      if (uri) {
        // a column that opens a web page instead of sending a message (e.g. "สั่งซื้อสินค้า" → the shop's site)
        if (!/^https:\/\/\S{3,980}$/i.test(uri)) throw new Error(`ช่องที่ ${i + 1} uri ต้องเป็นลิงก์ https`);
        action = { type: 'uri', label: String(c.label || c.text || 'เปิดเว็บ').slice(0, 20), uri };
      } else {
        if (!c || !String(c.text ?? '').trim()) throw new Error(`ช่องที่ ${i + 1} ไม่มี text`);
        action = { type: 'message', label: String(c.label || c.text).slice(0, 20), text: String(c.text).slice(0, 300) };
      }
      return { bounds: { x: i * w, y: top, width: i === cols.length - 1 ? WIDTH - i * w : w, height: HEIGHT - top }, action };
    }),
  };
}

// → { mime, bytes } for the menu picture, checked the way LINE will check it (so the admin
// is told what is wrong instead of getting a bare "400").
export function loadMenuImage(file) {
  let bytes;
  try {
    bytes = readFileSync(file);
  } catch {
    throw new Error('ไม่พบไฟล์รูปเมนู (assets/richmenu.png)');
  }
  if (bytes.length > MAX_BYTES) throw new Error('รูปเมนูใหญ่เกิน 1 MB');
  const png = bytes.length > 24 && bytes.readUInt32BE(0) === 0x89504e47;
  const jpg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
  if (!png && !jpg) throw new Error('รูปเมนูต้องเป็น PNG หรือ JPEG');
  if (png) {
    const w = bytes.readUInt32BE(16);
    const h = bytes.readUInt32BE(20);
    if (w !== WIDTH || h !== HEIGHT) throw new Error(`รูปเมนูต้องมีขนาด ${WIDTH}×${HEIGHT} (ตอนนี้ ${w}×${h})`);
  }
  return { mime: png ? 'image/png' : 'image/jpeg', bytes };
}

async function call(fetchImpl, token, method, url, { json, body, type } = {}) {
  const headers = { Authorization: `Bearer ${token}` };
  if (json !== undefined) headers['Content-Type'] = 'application/json';
  if (type) headers['Content-Type'] = type;
  const res = await fetchImpl(url, {
    method,
    headers,
    body: json !== undefined ? JSON.stringify(json) : body,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!res.ok) {
    const what = url.replace(/^https:\/\/api(?:-data)?\.line\.me\/v2\/bot/, '');
    throw Object.assign(new Error(`LINE ${method} ${what} → ${res.status} ${text.slice(0, 160)}`), { status: res.status });
  }
  return text ? JSON.parse(text) : {};
}

const listAll = async (fetchImpl, token) => (await call(fetchImpl, token, 'GET', `${API}/richmenu/list`)).richmenus ?? [];
const listOurs = async (fetchImpl, token, name) => (await listAll(fetchImpl, token)).filter((m) => m.name === name);

// The menu everybody currently sees, if one was set through the API (404 = none).
async function currentDefault(fetchImpl, token) {
  try {
    return (await call(fetchImpl, token, 'GET', `${API}/user/all/richmenu`)).richMenuId ?? null;
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

// Thrown instead of replacing a menu that some other system (e.g. the shop's own app) put there.
export class ForeignMenuError extends Error {
  constructor(name) {
    super(`another menu is already in use: ${name}`);
    this.menuName = name;
  }
}

// Installs the menu and makes it the one everybody sees. The new menu is live before the old
// copies (same name) are removed, and a half-made one is deleted again if the picture fails.
export async function installRichMenu({ token, shop, imageFile, force = false, fetchImpl = fetch }) {
  const menu = buildRichMenu(shop);
  const image = loadMenuImage(imageFile);
  if (!force) {
    const inUse = await currentDefault(fetchImpl, token);
    if (inUse) {
      const found = (await listAll(fetchImpl, token)).find((m) => m.richMenuId === inUse);
      if (!found || found.name !== menu.name) throw new ForeignMenuError(found?.name ?? inUse);
    }
  }
  const { richMenuId } = await call(fetchImpl, token, 'POST', `${API}/richmenu`, { json: menu });
  try {
    await call(fetchImpl, token, 'POST', `${DATA}/richmenu/${richMenuId}/content`, { body: image.bytes, type: image.mime });
    await call(fetchImpl, token, 'POST', `${API}/user/all/richmenu/${richMenuId}`);
  } catch (e) {
    await call(fetchImpl, token, 'DELETE', `${API}/richmenu/${richMenuId}`).catch(() => {});
    throw e;
  }
  let replaced = 0;
  for (const old of await listOurs(fetchImpl, token, menu.name)) {
    if (old.richMenuId === richMenuId) continue;
    await call(fetchImpl, token, 'DELETE', `${API}/richmenu/${old.richMenuId}`).catch(() => {});
    replaced++;
  }
  return { richMenuId, replaced };
}

// Takes this bot's menu away (and only this bot's). → how many were removed.
export async function removeRichMenu({ token, shop, fetchImpl = fetch }) {
  const ours = await listOurs(fetchImpl, token, menuName(shop));
  if (ours.length === 0) return 0;
  const current = await call(fetchImpl, token, 'GET', `${API}/user/all/richmenu`).catch(() => ({})); // 404 = no default menu
  if (ours.some((m) => m.richMenuId === current.richMenuId)) {
    await call(fetchImpl, token, 'DELETE', `${API}/user/all/richmenu`).catch(() => {});
  }
  for (const m of ours) await call(fetchImpl, token, 'DELETE', `${API}/richmenu/${m.richMenuId}`);
  return ours.length;
}

// What an admin gets back for "ติดตั้งเมนู" / "ติดตั้งเมนู ทับ" / "ลบเมนู" — the work is done here, the text is the answer.
// Installing is OFF until the owner sets richMenu.enabled in shop.json, so the bot never replaces a menu the shop's
// other systems rely on by accident; taking OUR menu away is always allowed.
export async function menuCommandReply({ cmd, shop, token, imageFile, fetchImpl = fetch, log = console }) {
  try {
    if (cmd.type === 'menuRemove') {
      const n = await removeRichMenu({ token, shop, fetchImpl });
      return n ? 'เอาเมนูออกแล้วค่ะ ✅ ลูกค้าจะไม่เห็นเมนูใต้แชทอีก (บางเครื่องต้องปิด-เปิดแชทใหม่)' : 'ตอนนี้ไม่มีเมนูของบอทอยู่ค่ะ';
    }
    if (shop.richMenu?.enabled !== true) {
      return 'ยังไม่เปิดให้บอทติดตั้งเมนูค่ะ (กันไม่ให้ไปทับเมนูของระบบร้านที่ใช้อยู่)\nยังไม่ได้ทำอะไรกับเมนูเลย ถ้าต้องการใช้ แจ้งคนดูแลบอทให้เปิดก่อนนะคะ';
    }
    const r = await installRichMenu({ token, shop, imageFile, force: cmd.force === true, fetchImpl });
    log.log('[menu] installed', r.richMenuId, r.replaced ? `(replaced ${r.replaced})` : '');
    return 'ติดตั้งเมนูเรียบร้อยแล้วค่ะ ✅\nเมนูจะขึ้นใต้แชทของลูกค้าทุกคน (บางเครื่องต้องปิด-เปิดแชทใหม่ก่อน)\nถ้าต้องการเอาออกพิมพ์ "ลบเมนู" ค่ะ';
  } catch (e) {
    if (e instanceof ForeignMenuError) {
      return `มีเมนูอื่นของ OA ใช้อยู่แล้ว (ชื่อ "${String(e.menuName).slice(0, 60)}") ถ้าติดตั้งจะไปทับเมนูนั้น\nยังไม่ได้ทำอะไรค่ะ ถ้าแน่ใจจริง ๆ พิมพ์ "ติดตั้งเมนู ทับ"`;
    }
    log.error('[menu]', e.message);
    return `ทำเมนูไม่สำเร็จค่ะ ❌\n${String(e.message).slice(0, 220)}`;
  }
}
