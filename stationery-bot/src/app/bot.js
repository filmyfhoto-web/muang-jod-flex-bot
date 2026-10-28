// ---------------------------------------------------------------------------------------------------------------
// The NATTA GROUP app's LINE bot (order cards, shop menu, "talk to an admin", project documents), copied as it runs in
// the app's Supabase function `line-bot` (v12) so the Render bot can answer the same things.
// Local changes are marked `[render]` — everything else is the app's code, unchanged:
//   1. deps.others(events)  — events this flow does not answer are handed to the Render bot's own answers
//                              (instead of being relayed over HTTP to an "old bot").
//   2. deps.onPick(ev, admin) — called after a customer picked an admin, so the chosen person can be told.
//   3. deps.skip(ev)        — the Render bot's own admin / set-up commands ("ติดตั้งเมนู", "ปิดบอท", "ไอดีฉัน") go straight to
//                              deps.others, so a menu card or an admin card never swallows them.
//   4. deps.pickList(ev)    — a customer's order written as a list in the chat goes to deps.others (the Render bot tells the admins),
//                              and counts as a visit, so the shop menu does not answer it or the note that follows it.
// ---------------------------------------------------------------------------------------------------------------
import { customerMessages, confirmMessages, parseCardAsk, orderView, withTag } from './cards.js'
import { createDocFlow } from './docs.js'

const API = 'https://api.line.me'
const K_TOKEN = 'line_channel_token'
const K_SECRET = 'line_channel_secret'
const K_HOOKPREV = 'line_webhook_prev'
const K_NOTIFY = 'line_notify'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const str = (v, n) => String(v == null ? '' : v).slice(0, n)

export const BOT_DEFAULT = {
  enabled: true,
  text: 'สวัสดีค่ะ ร้านนัฐภรณ์ยินดีให้บริการ 🙏\nดูสินค้าและสั่งซื้อได้ที่ลิงก์ด้านล่างเลยค่ะ',
  links: [{ label: 'สั่งซื้อสินค้า', url: 'https://www.nattagroup.com' }],
  admin_label: 'คุยกับแอดมิน',
  admin_reply: 'รับทราบค่ะ แอดมินจะตอบกลับโดยเร็วที่สุดนะคะ 🙏\n(ถ้าต้องการกลับไปที่เมนู พิมพ์ "เมนู")',
  silence_hours: 24,
  resume_word: 'เมนู',
  // (CR 2026-10-19 เจ้าของ: กด "คุยกับแอดมิน" → บอทให้เลือกชื่อแอดมิน แล้วพิมพ์คุยกับคนนั้นได้เลย)
  admin_pick: true,
  admins: [{ name: 'เจ้ปิ่น', note: 'ร้านเครื่องเขียน' }, { name: 'หญิง', note: 'ร้านเครื่องเขียน' }, { name: 'ฟิล์ม', note: 'ถ่ายรูป · ถ่ายเอกสาร · ไวนิล' }],
  // (CS 2026-10-19 เจ้าของ: การ์ดเมนูภาพแรกในแชท + ปุ่มลัด "โชว์ทุกครั้งถ้าลูกค้ากดไลน์เข้ามา")
  // LINE ไม่แจ้งตอนลูกค้าเปิดห้องแชท → ส่งการ์ดตอน เพิ่มเพื่อน/ปลดบล็อก · ข้อความแรกหลังเงียบไป menu_gap_min นาที · พิมพ์ "เมนู"
  menu_card: true,
  menu_gap_min: 60,
  menu_greet: 'สวัสดีค่ะ ร้านนัฐภรณ์ เชียงกลาง ยินดีให้บริการค่ะ 🙏',
  old_chips: ['เวลาเปิด - ปิด', 'ที่ตั้งร้าน'], // ปุ่มลัดด้านบน (เจ้าของ: เหลือแค่เวลาเปิด-ปิด กับที่ตั้งร้าน) · กดแล้วส่งต่อให้บอทเดิมตอบ
  // (CS ต่อ · เจ้าของเลือกแบบ ก: ข้อความทักทาย + ปุ่มลัดมีไอคอนสี) chips = แบบ ก · card = การ์ดภาพ (แบบ ข) · both = การ์ด + ปุ่มลัดแบบ ก
  menu_style: 'chips',
  menu_hint: 'เลือกเมนูด้านล่างได้เลยนะคะ',
  // (CV 2026-10-19 เจ้าของ: เลิกใช้บอทเดิม · ใช้บอทแอปทั้งหมด) คำตอบปุ่มลัดเดิม · ตอบเฉพาะตอนไม่ส่งต่อบอทเดิม (relay ปิด)
  faq: [
    { q: 'เวลาเปิดร้าน', a: 'เวลาเปิดร้านค่ะ 🕘\nจันทร์ – ศุกร์ 06.30 – 18.00 น.\nอาทิตย์ 07.00 – 17.30 น.\nหยุดทุกวันเสาร์ค่ะ 🙏' },
    { q: 'สั่งของ', a: 'สั่งซื้อสินค้าได้ที่ลิงก์นี้เลยค่ะ 🛒\nhttps://www.nattagroup.com\n\nหรือพิมพ์รายการ / ส่งรูปสินค้าที่ต้องการในแชทนี้ แอดมินจะตอบกลับนะคะ 🙏' },
    { q: 'อุปกรณ์การเรียน 2-69', a: 'สั่งอุปกรณ์การเรียน ภาคเรียนที่ 2/2569 ✏️\nเลือกโรงเรียนแล้วสั่งได้ที่ลิงก์นี้เลยค่ะ\nhttps://www.nattagroup.com/#school' },
    { q: 'ที่ตั้งร้าน', a: 'ที่ตั้งร้านนัฐภรณ์ เชียงกลาง 📍\n• นัฐภรณ์ การพิมพ์ 72/2 หมู่ 11 ต.เชียงกลาง อ.เชียงกลาง จ.น่าน 55160\n• นัฐภรณ์ คัลเลอร์แล็ป 70/1 ม.11 ต.เชียงกลาง อ.เชียงกลาง จ.น่าน\nโทร 088-224-9749 (พี่ปิ่น) · 094-779-9356 (หญิง)' },
  ],
  // relay ปิด + เปิดการ์ดเมนู: ข้อความทั่วไปที่บอทไม่ได้ตอบ → เงียบ (ไม่ส่งเมนูซ้ำ · ไม่ทำเครื่องหมายอ่าน ให้แอดมินเห็น) · 'menu' = ตอบเมนูทุกข้อความแบบเดิม
  fallback: 'quiet',
}
const URL_RE = /^https?:\/\/[^\s<>"']{3,990}$/i
export function botConfig(raw) {
  const c = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const d = BOT_DEFAULT
  const t = (v, n, def) => { const x = String(v == null ? '' : v).trim().slice(0, n); return x || def }
  const links = (Array.isArray(c.links) ? c.links : d.links).map((l) => ({ label: str(l && l.label, 40).trim(), url: str(l && l.url, 1000).trim() }))
    .filter((l) => l.label && URL_RE.test(l.url)).slice(0, 4)
  const h = Math.round(Number(c.silence_hours))
  const g = Math.round(Number(c.menu_gap_min))
  return {
    enabled: c.enabled !== false,
    text: t(c.text, 1000, d.text),
    links,
    admin_label: t(c.admin_label, 20, d.admin_label),
    admin_reply: t(c.admin_reply, 1000, d.admin_reply),
    silence_hours: h >= 1 && h <= 168 ? h : d.silence_hours,
    resume_word: t(c.resume_word, 20, d.resume_word),
    relay: c.relay !== false,
    admin_pick: c.admin_pick !== false,
    admins: (Array.isArray(c.admins) ? c.admins : d.admins).map((a) => ({ name: str(a && a.name, 20).trim(), note: str(a && a.note, 40).trim() })).filter((a) => a.name).slice(0, 6),
    docs: c.docs === 'trial' ? 'trial' : c.docs !== false, // 'trial' = เปิดเฉพาะ LINE แอดมิน (line_notify) ลองก่อน
    menu_card: c.menu_card !== false,
    menu_gap_min: g >= 1 && g <= 1440 ? g : d.menu_gap_min,
    menu_greet: t(c.menu_greet, 300, d.menu_greet),
    menu_style: ['chips', 'card', 'both'].includes(c.menu_style) ? c.menu_style : d.menu_style,
    menu_hint: t(c.menu_hint, 200, d.menu_hint),
    old_chips: (Array.isArray(c.old_chips) ? c.old_chips : d.old_chips).map((x) => str(x, 20).trim()).filter(Boolean).slice(0, 9),
    faq: (Array.isArray(c.faq) ? c.faq : d.faq).map((x) => ({ q: str(x && x.q, 20).trim(), a: str(x && x.a, 2000).trim() })).filter((x) => x.q && x.a).slice(0, 12),
    fallback: c.fallback === 'menu' ? 'menu' : d.fallback,
  }
}
const norm = (x) => String(x == null ? '' : x).toLowerCase().replace(/[\s"'“”‘’「」.!?~]+/g, '')
export function sameWord(a, b) { const x = norm(a); return !!x && x === norm(b) }
export function isAdminAsk(text, cfg) {
  const x = norm(text)
  if (!x) return false
  if (x === norm(cfg.admin_label)) return true
  return x.length <= 40 && /แอดมิน|แอดมิด|admin|ติดต่อพนักงาน|คุยกับพนักงาน|คุยกับคน/.test(x)
}
// เลือกแอดมิน: "คุยกับเจ้ปิ่น" / "ขอคุยกับเจ้ปิ่น" / "แอดมินเจ้ปิ่น" / "เจ้ปิ่น" (ทั้งข้อความ) → แอดมินคนนั้น
export function adminPickOf(text, cfg) {
  const x = norm(text)
  if (!x || x.length > 40) return null
  for (const a of cfg.admins || []) {
    const n = norm(a.name)
    if (n && [n, norm('คุยกับ' + a.name), norm('ขอคุยกับ' + a.name), norm('คุยกับแอดมิน' + a.name), norm('แอดมิน' + a.name)].includes(x)) return a
  }
  return null
}
export function adminPickMessage(cfg) {
  const L = cfg.admins || []
  const row = (a) => ({
    type: 'box', layout: 'horizontal', spacing: 'md', paddingAll: '12px', cornerRadius: '12px', backgroundColor: '#F3F5F9',
    action: { type: 'message', label: str('คุยกับ' + a.name, 20), text: 'คุยกับ' + a.name },
    contents: [
      { type: 'box', layout: 'vertical', flex: 1, contents: [{ type: 'text', text: a.name, weight: 'bold', size: 'md', color: '#12335F' }].concat(a.note ? [{ type: 'text', text: a.note, size: 'xs', color: '#6B7385', wrap: true }] : []) },
      { type: 'text', text: 'เลือก ›', size: 'sm', weight: 'bold', color: '#1F8F5B', flex: 0, gravity: 'center' },
    ],
  })
  return {
    type: 'flex',
    altText: str('เลือกแอดมินที่ต้องการคุยด้วย: ' + L.map((a) => a.name).join(' / '), 400),
    contents: {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '16px',
        contents: [
          { type: 'text', text: 'เลือกแอดมินที่ต้องการคุยด้วยค่ะ', weight: 'bold', size: 'md', color: '#12335F', wrap: true },
          { type: 'text', text: 'กดชื่อแล้วพิมพ์ข้อความได้เลย แอดมินจะตอบในแชทนี้', size: 'xs', color: '#6B7385', wrap: true },
        ].concat(L.map(row)),
      },
    },
    quickReply: { items: L.map((a) => ({ type: 'action', action: { type: 'message', label: str('คุยกับ' + a.name, 20), text: 'คุยกับ' + a.name } })) },
  }
}
export const adminPickText = (cfg) => 'เลือกแอดมินที่ต้องการคุยด้วยค่ะ 🙏\n' + (cfg.admins || []).map((a) => '• ' + a.name + (a.note ? ' (' + a.note + ')' : '')).join('\n') + '\nกดชื่อด้านล่าง หรือพิมพ์ "คุยกับ" ตามด้วยชื่อ'
export const adminPickedText = (a, cfg) => '✓ เลือกคุยกับ ' + a.name + (a.note ? ' (' + a.note + ')' : '') + ' แล้วค่ะ\nพิมพ์ข้อความหรือส่งรูปได้เลย ' + a.name + ' จะตอบในแชทนี้นะคะ 🙏\n(กลับไปที่เมนู พิมพ์ "' + cfg.resume_word + '")'
// (CS) การ์ดเมนูภาพแรก (imagemap 3 ช่อง = ภาพเดียวกับริชเมนู เดิม) · ปุ่มลัดด้านบนเหลือเฉพาะหัวข้อของร้าน
export const MENU_DOC_TEXT = 'ส่งเอกสารโครงการ'
const shopUrl = (cfg) => (cfg.links && cfg.links[0] && cfg.links[0].url) || 'https://www.nattagroup.com'
// ปุ่มลัดด้านบน = หัวข้อที่ร้านตั้งไว้เท่านั้น (old_chips) · สั่งซื้อสินค้า / ส่งเอกสารโครงการ / คุยกับแอดมิน อยู่บนริชเมนูและการ์ดรูปแล้ว
export function menuChips(cfg) {
  return (cfg.old_chips || []).map((x) => ({ type: 'action', action: { type: 'message', label: str(x, 20), text: x } })).slice(0, 13)
}
export function menuCardMessages(cfg, assets) {
  const A = String(assets || '').replace(/\/+$/, '')
  if (!A) return menuCardText(cfg, '')
  return [
    { type: 'text', text: cfg.menu_greet },
    {
      type: 'imagemap',
      baseUrl: A + '/qm/v2',
      altText: 'เมนูร้าน: สั่งซื้อสินค้า · ส่งเอกสารโครงการ · คุยกับแอดมิน',
      baseSize: { width: 1040, height: 351 },
      actions: [
        { type: 'uri', label: 'สั่งซื้อสินค้า', linkUri: shopUrl(cfg), area: { x: 0, y: 0, width: 347, height: 351 } },
        { type: 'message', label: MENU_DOC_TEXT, text: MENU_DOC_TEXT, area: { x: 347, y: 0, width: 346, height: 351 } },
        { type: 'message', label: cfg.admin_label, text: cfg.admin_label, area: { x: 693, y: 0, width: 347, height: 351 } },
      ],
      quickReply: { items: menuChips(cfg) },
    },
  ]
}
export function menuCardText(cfg, assets) {
  return [{ type: 'text', text: cfg.menu_greet + '\n' + cfg.menu_hint, quickReply: { items: menuChips(cfg) } }]
}
export function menuReply(cfg, assets) {
  if (cfg.menu_style === 'card' || cfg.menu_style === 'both') return menuCardMessages(cfg, assets)
  return menuCardText(cfg, assets)
}
export function menuMessage(cfg) {
  const btn = cfg.links.map((l, i) => ({ type: 'button', style: i === 0 ? 'primary' : 'secondary', height: 'sm', ...(i === 0 ? { color: '#12335F' } : {}), action: { type: 'uri', label: l.label, uri: l.url } }))
  btn.push({ type: 'button', style: 'link', height: 'sm', action: { type: 'message', label: cfg.admin_label, text: cfg.admin_label } })
  const alt = cfg.text + (cfg.links.length ? '\n' + cfg.links.map((l) => l.label + ': ' + l.url).join('\n') : '')
  return {
    type: 'flex',
    altText: str(alt, 400),
    contents: {
      type: 'bubble',
      body: { type: 'box', layout: 'vertical', paddingAll: '16px', contents: [{ type: 'text', text: cfg.text, wrap: true, size: 'sm', color: '#222222' }] },
      footer: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '12px', contents: btn },
    },
    quickReply: { items: menuChips(cfg) },
  }
}
async function hmacB64(secret, raw) {
  const sub = globalThis.crypto && globalThis.crypto.subtle
  if (!sub) return ''
  const enc = new TextEncoder()
  const key = await sub.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await sub.sign('HMAC', key, enc.encode(raw)))
  let b = ''
  for (const x of mac) b += String.fromCharCode(x)
  return btoa(b)
}
function sameStr(a, b) {
  a = String(a || ''); b = String(b || '')
  if (!a || a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

export function createBotHandler(deps) {
  const store = deps.store
  const doFetch = deps.fetch
  const now = deps.now || (() => Date.now())
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })
  const cache = { bot: null }
  const SELF = String(deps.selfUrl || '')
  const assets = deps.assetsUrl != null ? String(deps.assetsUrl) : (/\/line-bot\/?$/.test(SELF) ? SELF.replace(/\/line-bot\/?$/, '/line-assets') : '')

  async function call(url, init, ms = 6000) {
    const ac = typeof AbortController !== 'undefined' ? new AbortController() : null
    const t = ac ? setTimeout(() => ac.abort(), ms) : null
    try {
      const r = await doFetch(url, Object.assign({}, init || {}, ac ? { signal: ac.signal } : {}))
      let d = null
      try { d = await r.json() } catch (_e) { d = null }
      return { status: r.status, data: d }
    } catch (_e) {
      return { status: 0, data: null }
    } finally {
      if (t) clearTimeout(t)
    }
  }
  const lineGet = (path, token) => call(API + path, { headers: { Authorization: 'Bearer ' + token } })
  const lineSend = (method, path, token, body) =>
    call(API + path, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  async function botToken() {
    const t = await store.getSecret(K_TOKEN)
    return t && String(t).trim() ? String(t).trim() : ''
  }
  async function lineContent(id) {
    const token = await botToken()
    if (!token) return { status: 0 }
    const ac = typeof AbortController !== 'undefined' ? new AbortController() : null
    const t = ac ? setTimeout(() => ac.abort(), 25000) : null
    try {
      const r = await doFetch('https://api-data.line.me/v2/bot/message/' + encodeURIComponent(String(id)) + '/content', Object.assign({ headers: { Authorization: 'Bearer ' + token } }, ac ? { signal: ac.signal } : {}))
      if (r.status !== 200) return { status: r.status }
      const bytes = new Uint8Array(await r.arrayBuffer())
      return { status: 200, bytes, mime: (r.headers && r.headers.get && r.headers.get('content-type')) || '' }
    } catch (_e) {
      return { status: 0 }
    } finally { if (t) clearTimeout(t) }
  }
  const docs = createDocFlow({
    store, fetch: doFetch, now, waitUntil: deps.waitUntil, pushUrl: deps.pushUrl,
    line: {
      reply: async (rt, messages) => lineSend('POST', '/v2/bot/message/reply', await botToken(), { replyToken: rt, messages }),
      content: lineContent,
      profile: async (uid) => { const r = await lineGet('/v2/bot/profile/' + encodeURIComponent(uid), await botToken()); return r.status === 200 ? r.data : null },
    },
  })
  async function relayTarget(cfg) {
    if (!cfg.relay) return ''
    let prev = ''
    try { prev = String((await store.getSecret(K_HOOKPREV)) || '').trim() } catch (_e) { prev = '' }
    if (!URL_RE.test(prev) || (deps.selfUrl && prev === deps.selfUrl)) return ''
    return prev
  }
  async function isStaff(uid) {
    try { const a = JSON.parse((await store.getSecret(K_NOTIFY)) || '[]'); return Array.isArray(a) && a.some((x) => x && x.id === uid) } catch (_e) { return false }
  }
  function forward(url, raw, sig) {
    const t0 = now()
    const job = (async () => {
      const ac = typeof AbortController !== 'undefined' ? new AbortController() : null
      const tm = ac ? setTimeout(() => ac.abort(), 100000) : null
      let status = 0
      try {
        const r = await doFetch(url, Object.assign({ method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Line-Signature': sig || '', 'User-Agent': 'LineBotWebhook/2.0' }, body: raw }, ac ? { signal: ac.signal } : {}))
        status = r.status
        try { if (r.body && r.body.cancel) await r.body.cancel() } catch (_e) { /* ignore */ }
      } catch (_e) { status = 0 } finally { if (tm) clearTimeout(tm) }
      try { if (store.relayStat) await store.relayStat({ status, ms: now() - t0, at: new Date(now()).toISOString() }) } catch (_e) { /* ignore */ }
      return status
    })()
    if (deps.waitUntil) { try { deps.waitUntil(job) } catch (_e) { /* ignore */ } }
    return job
  }
  async function onCardAsk(ev, ask, token) {
    const isOrder = ask.kind === 'order'
    const uid = str(ev.source.userId, 64)
    const m = ev.message || {}
    const reply = (messages) => (ev.replyToken ? lineSend('POST', '/v2/bot/message/reply', token, { replyToken: ev.replyToken, messages }) : Promise.resolve({ status: 0 }))
    const say = (text) => reply([{ type: 'text', text }])
    const markRead = async () => { if (!isOrder && m.markAsReadToken) await lineSend('POST', '/v2/bot/chat/markAsRead', token, { markAsReadToken: String(m.markAsReadToken) }) }
    let od = null
    try { od = await store.getOrder(ask.no) } catch (_e) { od = null }
    const staff = await isStaff(uid)
    if (!od || (!staff && String(od.line_user_id || '') !== uid)) {
      if (isOrder) {
        await say('ร้านได้รับข้อความแล้วค่ะ 🙏\nแอดมินจะตรวจสอบออเดอร์ ' + ask.no + ' และตอบในแชทนี้นะคะ')
        return 'card:order:unmatched'
      }
      await say('ไม่พบใบสั่งซื้อ ' + ask.no + ' ของ LINE นี้ค่ะ 🙏\nตรวจเลขที่อีกครั้ง หรือรอแอดมินตอบในแชทนี้นะคะ')
      return 'card:notfound'
    }
    if (od.status === 'cancelled') { const r = await say('ออเดอร์ ' + ask.no + ' ถูกยกเลิกแล้วค่ะ หากมีข้อสงสัยพิมพ์ถามในแชทนี้ได้เลยค่ะ 🙏'); if (r.status === 200) await markRead(); return 'card:cancelled' }
    let shop = {}
    try { shop = (store.getShop ? await store.getShop() : {}) || {} } catch (_e) { shop = {} }
    const prev = od.line_notify == null ? '' : String(od.line_notify)
    if (ask.kind === 'confirm') {
      const confirmed = /(^|\s)k:/.test(prev) || od.status === 'done'
      if (!confirmed) {
        const r = await say('ร้านกำลังตรวจสอบออเดอร์ ' + ask.no + ' ค่ะ 🙏\nเมื่อร้านยืนยันแล้ว กดปุ่ม "ดูการ์ดยืนยันจากร้าน" อีกครั้งได้เลยค่ะ')
        if (r.status === 200) await markRead()
        return 'card:wait'
      }
      const msg = confirmMessages(orderView(od, shop, ''))
      let r = await reply([msg.flex])
      if (r.status !== 200) r = await reply([msg.text])
      if (r.status !== 200) return 'card:failed:' + r.status
      await markRead()
      if (!staff && !/(^|\s)k:sent(\s|$)/.test(prev)) { try { await store.setOrderNotify(od.order_no, withTag(prev, 'k', 'k:sent')) } catch (_e) { /* ignore */ } }
      return 'card:confirm'
    }
    const view = orderView(od, shop, '')
    const msg = customerMessages(Object.assign({}, view, { pull: true }))
    const cm = isOrder && (/(^|\s)k:/.test(prev) || od.status === 'done') ? confirmMessages(view) : null
    let r = await reply(cm ? [msg.flex, cm.flex] : [msg.flex])
    if (r.status !== 200) r = await reply(cm ? [msg.text, cm.text] : [msg.text])
    if (r.status !== 200) return 'card:failed:' + r.status
    await markRead()
    let tag = prev
    if (!/(^|\s)c:sent(\s|$)/.test(tag)) tag = withTag(tag, 'c', 'c:sent')
    if (cm && !/(^|\s)k:sent(\s|$)/.test(tag)) tag = withTag(tag, 'k', 'k:sent')
    if (!staff && tag !== prev) { try { await store.setOrderNotify(od.order_no, tag) } catch (_e) { /* ignore */ } }
    return isOrder ? (cm ? 'card:order+confirm' : 'card:order') : 'card:receipt'
  }
  const askOf = (ev) => (ev && ev.type === 'message' && ev.message && ev.message.type === 'text' && ev.source && ev.source.type === 'user' && ev.source.userId && ev.replyToken && (!ev.mode || ev.mode === 'active')) ? parseCardAsk(ev.message.text) : null

  // (CR) คุยกับแอดมิน: ขอคุย → การ์ดเลือกชื่อแอดมิน · เลือกแล้ว → ยืนยันชื่อ · ช่วงคุยกับแอดมิน (silence_hours) บอทเงียบ ไม่ส่งต่อบอทเดิม · พิมพ์ "เมนู" = กลับโหมดบอท
  const admOk = (ev, cfg) => !!(cfg.admin_pick && ev && ev.type === 'message' && ev.message && ev.source && ev.source.type === 'user' && ev.source.userId && (!ev.mode || ev.mode === 'active'))
  const admText = (ev) => (ev.message.type === 'text' ? String(ev.message.text || '').trim() : '')
  function adminAsk(ev, cfg) { // ขอคุย / เลือกชื่อ (ต้องมี replyToken)
    if (!admOk(ev, cfg) || !ev.replyToken) return null
    const text = admText(ev)
    if (!text) return null
    const a = adminPickOf(text, cfg)
    if (a) return { adm: 'pick', a }
    if (isAdminAsk(text, cfg)) return { adm: 'ask' }
    return null
  }
  function adminQuiet(ev, cfg, st) { // อยู่ในช่วงคุยกับแอดมิน → เงียบ · "เมนู" = จบ (เช็คหลังขั้นตอนส่งเอกสาร เพื่อให้ปุ่ม "ส่งเอกสารโครงการ" ยังใช้ได้)
    if (!admOk(ev, cfg)) return null
    const text = admText(ev)
    if (st && st.mode === 'admin' && Number(st.last_ms) > 0 && now() - Number(st.last_ms) < cfg.silence_hours * 3600000) {
      if (text && sameWord(text, cfg.resume_word)) return { adm: 'end' }
      return { adm: 'quiet' }
    }
    return null
  }
  async function onAdmin(ev, ad, cfg, token) {
    const uid = str(ev.source.userId, 64), t = now()
    const reply = (messages) => (ev.replyToken ? lineSend('POST', '/v2/bot/message/reply', token, { replyToken: ev.replyToken, messages }) : Promise.resolve({ status: 0 }))
    const save = async (patch) => { try { await store.setChat(uid, patch) } catch (_e) { /* ignore */ } }
    if (ad.adm === 'quiet') { await save({ mode: 'admin', last_ms: t }); return 'admin:quiet' }
    if (ad.adm === 'ask') {
      let r = await reply([adminPickMessage(cfg)])
      if (r.status !== 200) r = await reply([{ type: 'text', text: adminPickText(cfg), quickReply: adminPickMessage(cfg).quickReply }])
      if (r.status === 200) await save({ mode: 'admin', admin_ms: t, last_ms: t, admin_name: null })
      return r.status === 200 ? 'admin:ask' : 'admin:ask_failed:' + r.status
    }
    if (ad.adm === 'pick') {
      const r = await reply([{ type: 'text', text: adminPickedText(ad.a, cfg) }])
      if (r.status === 200) {
        await save({ mode: 'admin', admin_ms: t, last_ms: t, admin_name: ad.a.name })
        if (deps.onPick) { try { await deps.onPick(ev, ad.a) } catch (_e) { /* [render] telling the admin must never break the reply */ } } // [render]
      }
      return r.status === 200 ? 'admin:pick' : 'admin:pick_failed:' + r.status
    }
    return 'admin:skip'
  }

  // (CS) เมนูร้าน (แบบ ก ปุ่มลัดมีไอคอน / แบบ ข การ์ดภาพ): เพิ่มเพื่อน/ปลดบล็อก · ข้อความแรก (ข้อความ/สติกเกอร์) หลังเงียบไป menu_gap_min นาที · พิมพ์ "เมนู"
  //   ไม่ส่งตอนอยู่ช่วงคุยกับแอดมิน · ปุ่มลัดของบอทเดิม (old_chips) ปล่อยให้บอทเดิมตอบ
  const userEv = (ev) => !!(ev && ev.source && ev.source.type === 'user' && ev.source.userId && (!ev.mode || ev.mode === 'active'))
  function menuAsk(ev, cfg, st, t) {
    if (!cfg.menu_card || !userEv(ev) || !ev.replyToken) return null
    if (ev.type === 'follow') return { menu: 'follow' }
    if (ev.type !== 'message' || !ev.message) return null
    const m = ev.message
    if (m.type !== 'text' && m.type !== 'sticker') return null
    const text = m.type === 'text' ? String(m.text || '').trim() : ''
    if (text && sameWord(text, cfg.resume_word)) return { menu: 'word' }
    if (text && (cfg.old_chips || []).some((x) => sameWord(x, text))) return null
    const seen = st ? Number(st.seen_ms) : 0
    if (seen > 0 && t - seen < cfg.menu_gap_min * 60000) return null
    return { menu: 'visit' }
  }
  async function onMenu(ev, mc, cfg, token) {
    const uid = str(ev.source.userId, 64), t = now()
    const m = ev.message || {}
    const reply = (messages) => lineSend('POST', '/v2/bot/message/reply', token, { replyToken: ev.replyToken, messages })
    let r = await reply(menuReply(cfg, assets))
    if (r.status !== 200 && cfg.menu_style !== 'chips' && !/reply ?token/i.test(String((r.data && r.data.message) || ''))) r = await reply(menuCardText(cfg, assets))
    if (r.status !== 200) return 'menu_failed:' + r.status
    try { await store.setChat(uid, { menu_ms: t }) } catch (_e) { /* ignore */ }
    if (mc.menu === 'word' && m.markAsReadToken) await lineSend('POST', '/v2/bot/chat/markAsRead', token, { markAsReadToken: String(m.markAsReadToken) })
    return 'menu:' + mc.menu
  }

  // (CV) ปุ่มลัดเดิม (เวลาเปิดร้าน · สั่งของ · …) → บอทแอปตอบเอง (เมื่อไม่มีบอทเดิมรับต่อ) + ปุ่มลัดเมนูชุดเดิมให้กดต่อ · ไม่ทำเครื่องหมายอ่าน
  function faqOf(ev, cfg) {
    if (!userEv(ev) || !ev.replyToken || ev.type !== 'message' || !ev.message || ev.message.type !== 'text') return null
    const text = String(ev.message.text || '').trim()
    const f = text && (cfg.faq || []).find((x) => sameWord(x.q, text))
    return f ? { faq: f } : null
  }
  async function onFaq(ev, fq, cfg, token) {
    const reply = (messages) => lineSend('POST', '/v2/bot/message/reply', token, { replyToken: ev.replyToken, messages })
    const items = menuChips(cfg)
    let r = await reply([{ type: 'text', text: fq.faq.a, quickReply: { items } }])
    if (r.status !== 200 && !/reply ?token/i.test(String((r.data && r.data.message) || ''))) r = await reply([{ type: 'text', text: fq.faq.a }])
    return r.status === 200 ? 'faq' : 'faq_failed:' + r.status
  }

  async function botCfg() {
    if (cache.bot && now() - cache.bot.t < 15000) return cache.bot.v
    let raw = null
    try { raw = await store.getConfig('line_bot') } catch (_e) { raw = null }
    const v = botConfig(raw)
    cache.bot = { t: now(), v }
    return v
  }

  async function onWebhook(raw, sig) {
    const secret = String((await store.getSecret(K_SECRET)) || '').trim()
    if (secret) {
      const want = await hmacB64(secret, raw)
      if (!want || !sameStr(want, sig)) return json({ error: 'signature' }, 401)
    }
    let body = {}
    try { body = JSON.parse(raw || '{}') } catch (_e) { body = {} }
    const all = Array.isArray(body.events) ? body.events : []
    const cfg = await botCfg()
    const relay = deps.others ? 'local' : await relayTarget(cfg) // [render] events nobody here answers go to deps.others
    const token = await botToken()
    const mine = [], others = []
    const t0 = now()
    const sts = new Map(), seen = new Set()
    const stOf = async (uid) => {
      if (!sts.has(uid)) { let st = null; try { st = await store.getChat(uid) } catch (_e) { st = null } sts.set(uid, st) }
      return sts.get(uid)
    }
    for (const ev of all) {
      if (deps.skip && deps.skip(ev)) { others.push(ev); continue } // [render] the Render bot's own commands: not a customer's question
      const uid = userEv(ev) && (ev.type === 'message' || ev.type === 'follow') ? str(ev.source.userId, 64) : ''
      // ช่วงเวลาที่ลูกค้าทักล่าสุด (ไว้ดูว่าเป็นการเข้ามาใหม่หรือไม่) — อ่านก่อน แล้วค่อยบันทึกเวลาใหม่ทีหลัง
      const st = uid && token && (cfg.menu_card || cfg.admin_pick) ? await stOf(uid) : null
      const mark = () => { if (uid) { seen.add(uid); sts.set(uid, Object.assign({}, st || {}, { seen_ms: t0 })) } }
      const ask = token ? askOf(ev) : null
      if (ask) { mark(); mine.push([ev, ask]); continue }
      const ad = token ? adminAsk(ev, cfg) : null
      if (ad) { mark(); mine.push([ev, ad]); continue }
      let doc = false
      if (token && cfg.docs && (!ev.mode || ev.mode === 'active')) {
        try {
          const uid = (ev.source && ev.source.userId) || ''
          doc = cfg.docs === 'trial' && !(uid && (await isStaff(uid))) ? false : await docs.owns(ev)
        } catch (_e) { doc = false }
      }
      if (doc) { mark(); mine.push([ev, null]); continue }
      if (token && deps.pickList && deps.pickList(ev)) { mark(); others.push(ev); continue } // [render] an order list: the admins are told, the menu card stays out of it
      const fq = token && !relay ? faqOf(ev, cfg) : null
      if (fq) { mark(); mine.push([ev, fq]); continue }
      let q = null
      if (token) { try { q = adminQuiet(ev, cfg, st) } catch (_e) { q = null } }
      if (q && q.adm === 'end') {
        try { await store.setChat(str(ev.source.userId, 64), { mode: 'bot', last_ms: now() }) } catch (_e) { /* ignore */ }
        if (uid) sts.set(uid, Object.assign({}, st || {}, { mode: 'bot' }))
        const mw = token ? menuAsk(ev, cfg, null, t0) : null
        mark()
        if (mw) { mine.push([ev, mw]); continue }
        others.push(ev); continue
      }
      if (q) { mark(); mine.push([ev, q]); continue }
      const mc = token ? menuAsk(ev, cfg, st, t0) : null
      mark()
      if (mc) { mine.push([ev, mc]); continue }
      others.push(ev)
    }
    // บันทึกเวลาที่ลูกค้าทักล่าสุด (ก่อนตอบ → ข้อความถัดไปที่มาติด ๆ จะไม่ได้การ์ดซ้ำ)
    if (seen.size && cfg.menu_card) await Promise.all([...seen].map((u) => Promise.resolve().then(() => store.setChat(u, { seen_ms: t0 })).catch(() => null)))
    const r = []
    for (const [ev, ask] of mine.slice(0, 30)) {
      if (ask && ask.adm) { try { r.push(await onAdmin(ev, ask, cfg, token)) } catch (_e) { r.push('admin:error') } }
      else if (ask && ask.faq) { try { r.push(await onFaq(ev, ask, cfg, token)) } catch (_e) { r.push('faq:error') } }
      else if (ask && ask.menu) { try { r.push(await onMenu(ev, ask, cfg, token)) } catch (_e) { r.push('menu:error') } }
      else if (ask) { try { r.push(await onCardAsk(ev, ask, token)) } catch (_e) { r.push('card:error') } }
      else { try { r.push(await docs.handle(ev)) } catch (_e) { r.push('doc:error') } }
    }
    if (deps.others) { // [render]
      if (others.length) { try { await deps.others(others) } catch (_e) { r.push('others:error') } }
      return json({ ok: true, r, relay: others.length ? 'local' : 'none' })
    }
    if (relay) {
      if (!mine.length) forward(relay, raw, sig)
      else if (others.length) {
        if (secret) { const raw2 = JSON.stringify(Object.assign({}, body, { events: others })); forward(relay, raw2, await hmacB64(secret, raw2)) }
        else forward(relay, raw, sig)
      }
      return json({ ok: true, r, relay: !mine.length || others.length ? 'fwd' : 'none' })
    }
    if (!others.length) return json(r.length ? { ok: true, r } : { ok: true })
    if (!token) return json({ ok: true, r, skipped: 'no_token' })
    if (!cfg.enabled) return json({ ok: true, r, skipped: 'off' })
    for (const ev of others.slice(0, 30)) {
      try { r.push(await onEvent(ev, cfg, token)) } catch (_e) { r.push('error') }
    }
    return json({ ok: true, r })
  }
  async function onEvent(ev, cfg, token) {
    if (!ev || !ev.source || ev.source.type !== 'user' || !ev.source.userId) return 'skip'
    if (ev.mode && ev.mode !== 'active') return 'standby'
    const uid = str(ev.source.userId, 64)
    const rt = ev.replyToken
    const reply = (messages) => (rt ? lineSend('POST', '/v2/bot/message/reply', token, { replyToken: rt, messages }) : Promise.resolve({ status: 0 }))
    const t = now()
    const save = async (patch) => { try { await store.setChat(uid, patch) } catch (_e) { /* ignore */ } }
    if (ev.type === 'follow') {
      const r = await reply([menuMessage(cfg)])
      if (r.status === 200) await save({ mode: 'bot', last_ms: t })
      return 'follow'
    }
    if (ev.type !== 'message' || !ev.message) return 'skip'
    const m = ev.message
    const text = m.type === 'text' ? String(m.text || '').trim() : ''
    let st = null
    try { st = await store.getChat(uid) } catch (_e) { st = null }
    const markRead = async () => { if (m.markAsReadToken) await lineSend('POST', '/v2/bot/chat/markAsRead', token, { markAsReadToken: String(m.markAsReadToken) }) }
    if (text && sameWord(text, cfg.resume_word)) {
      const r = await reply([menuMessage(cfg)])
      if (r.status === 200) { await save({ mode: 'bot', last_ms: t }); await markRead() }
      return 'menu'
    }
    const last = st && Number(st.last_ms)
    if (st && st.mode === 'admin' && last > 0 && t - last < cfg.silence_hours * 3600000) {
      await save({ mode: 'admin', last_ms: t })
      return 'silent'
    }
    if (text && isAdminAsk(text, cfg)) {
      const r = await reply([{ type: 'text', text: cfg.admin_reply }])
      if (r.status === 200) await save({ mode: 'admin', admin_ms: t, last_ms: t })
      return 'admin'
    }
    if (cfg.menu_card && cfg.fallback === 'quiet') return 'quiet' // (CV) การ์ดเมนูดูแลการทักแล้ว → ข้อความอื่นปล่อยให้แอดมินตอบ
    const r = await reply([menuMessage(cfg)])
    if (r.status === 200) {
      if (st && st.mode === 'admin') await save({ mode: 'bot', last_ms: t })
      if (m.type === 'text' || m.type === 'sticker') await markRead()
      return 'reply'
    }
    return 'reply_failed:' + r.status
  }

  async function botStatus() {
    const token = await botToken()
    const self = deps.selfUrl || ''
    const secret = !!String((await store.getSecret(K_SECRET)) || '').trim()
    const prev = String((await store.getSecret(K_HOOKPREV)) || '')
    const cfg = await botCfg()
    const relayTo = await relayTarget(cfg)
    let stat = null
    try { stat = store.getConfig ? await store.getConfig('line_relay_stat') : null } catch (_e) { stat = null }
    if (!token) return { token: false, secret, self, prev, relay: !!relayTo, relay_to: relayTo, relay_cfg: cfg.relay, relay_stat: stat }
    const r = await lineGet('/v2/bot/channel/webhook/endpoint', token)
    const ep = r.status === 200 && r.data ? String(r.data.endpoint || '') : ''
    return { token: true, secret, self, prev, endpoint: ep, active: !!(r.data && r.data.active), using_new: !!self && ep === self, status: r.status, relay: !!relayTo, relay_to: relayTo, relay_cfg: cfg.relay, relay_stat: stat }
  }
  async function adminAction(body) {
    const a = body.action
    if (a === 'bot_status') return json(await botStatus())
    if (a === 'save_secret') {
      const t = String(body.secret || '').trim()
      if (!t) { await store.delSecret(K_SECRET); return json({ ok: true, cleared: true }) }
      if (!/^[0-9a-f]{32}$/i.test(t)) return json({ error: 'invalid_secret' })
      await store.setSecret(K_SECRET, t)
      return json({ ok: true })
    }
    if (a === 'webhook_use') {
      const token = await botToken()
      if (!token) return json({ error: 'no_token' })
      const st = await botStatus()
      let target = ''
      if (body.target === 'new') {
        if (!deps.selfUrl) return json({ error: 'no_self' })
        target = deps.selfUrl
        if (st.endpoint && st.endpoint !== target) await store.setSecret(K_HOOKPREV, st.endpoint)
      } else if (body.target === 'prev') {
        target = st.prev
        if (!URL_RE.test(target)) return json({ error: 'no_prev' })
      } else return json({ error: 'bad_request' }, 400)
      const r = await lineSend('PUT', '/v2/bot/channel/webhook/endpoint', token, { endpoint: target })
      if (r.status !== 200) return json({ error: 'line_failed', status: r.status })
      return json({ ok: true, status: await botStatus() })
    }
    return json({ error: 'bad_request' }, 400)
  }

  return async function handle(req) {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
    try {
      const raw = await req.text().catch(() => '')
      const sig = req.headers.get('x-line-signature') || ''
      let body = {}
      try { body = JSON.parse(raw || '{}') || {} } catch (_e) { body = {} }
      if (sig || (Array.isArray(body.events) && typeof body.destination === 'string')) return await onWebhook(raw, sig)
      const a = String((body && body.action) || '')
      if (['bot_status', 'save_secret', 'webhook_use'].includes(a)) {
        const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
        if (!(await store.isAdmin(jwt))) return json({ error: 'auth' }, 401)
        return await adminAction(body)
      }
      return json({ error: 'bad_request' }, 400)
    } catch (e) {
      return json({ error: 'server', message: String((e && e.message) || e).slice(0, 200) })
    }
  }
}
