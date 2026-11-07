import { createClient } from 'npm:@supabase/supabase-js@2'

// ตั้งเมนูด่วน (rich menu) LINE OA — เรียกจาก SQL เท่านั้น (ต้องมี push_hook_key) · token อ่านในฟังก์ชันนี้เท่านั้น
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
const sec = async (k: string) => { const { data } = await db.from('app_secrets').select('value').eq('key', k).maybeSingle(); return data?.value ? String(data.value).trim() : '' }
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } })
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
// รูปเมนู v1 เก็บใน app_config.rm_menu_img.b64 (ใส่ทีละท่อนผ่าน SQL + ตรวจ md5) — ใช้เมื่อไม่ส่ง image_url
async function bytes() {
  const { data } = await db.from('app_config').select('value').eq('key', 'rm_menu_img').maybeSingle()
  const s = atob(String((data?.value as any)?.b64 || ''))
  const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i)
  return u
}
// รูปเมนู v2 ดึงจากเว็บของบอท (เฉพาะ https://nattagroup-y.onrender.com/assets/… เท่านั้น ไม่ตาม redirect) แล้วบอก SHA-256 ให้ตรวจก่อนอัปโหลดขึ้น LINE
const IMG_HOST = 'https://nattagroup-y.onrender.com'
async function remote(raw: unknown): Promise<any> {
  let u: URL
  try { u = new URL(String(raw || '')) } catch (_e) { return { error: 'image_url' } }
  if (u.origin !== IMG_HOST || !u.pathname.startsWith('/assets/') || u.pathname.includes('..') || u.search || u.hash || u.username || u.password) return { error: 'image_url' }
  let r: Response
  try { r = await fetch(u.href, { redirect: 'error', signal: AbortSignal.timeout(45000) }) } catch (_e) { return { error: 'fetch' } } // เว็บบอทอาจต้องปลุกก่อน (ช้าได้เป็นสิบวินาที)
  if (r.status !== 200) return { error: 'fetch', status: r.status }
  const img = new Uint8Array(await r.arrayBuffer())
  if (img.length > 1_000_000) return { error: 'too_big', n: img.length }
  const png = img.length > 24 && img[0] === 0x89 && img[1] === 0x50 && img[2] === 0x4e && img[3] === 0x47
  const dv = new DataView(img.buffer, img.byteOffset, img.byteLength)
  return { img, n: img.length, png, w: png ? dv.getUint32(16) : 0, h: png ? dv.getUint32(20) : 0, sha: hex(await crypto.subtle.digest('SHA-256', img)) }
}
// ที่อยู่ webhook ที่อนุญาตให้ตั้ง/ทดสอบ: https เท่านั้น และต้องอยู่บน host เหล่านี้ (บอท Render หรือ Botcake) — ถ้ากุญแจหลุดก็ตั้งไปที่อื่นไม่ได้
const WEBHOOK_HOSTS = new Set(['nattagroup-y.onrender.com', 'wa.botcake.io'])
const LINE_WEBHOOK = 'https://api.line.me/v2/bot/channel/webhook'
function webhookUrl(raw: unknown): string | null {
  let u: URL
  try { u = new URL(String(raw || '')) } catch (_e) { return null }
  if (u.protocol !== 'https:' || !WEBHOOK_HOSTS.has(u.hostname) || u.port || u.username || u.password || u.search || u.hash) return null
  return u.href
}
// v1 = เมนูเดิม 1600×540 (3 ช่อง) — เก็บไว้ให้สร้างกลับได้
const MENU1 = {
  size: { width: 1600, height: 540 }, selected: true, name: 'NATTA เมนูหลัก v1', chatBarText: 'เมนูร้าน',
  areas: [
    { bounds: { x: 0, y: 0, width: 533, height: 540 }, action: { type: 'uri', label: 'สั่งซื้อสินค้า', uri: 'https://www.nattagroup.com' } },
    { bounds: { x: 533, y: 0, width: 534, height: 540 }, action: { type: 'message', label: 'ส่งเอกสารโครงการ', text: 'ส่งเอกสารโครงการ' } },
    { bounds: { x: 1067, y: 0, width: 533, height: 540 }, action: { type: 'message', label: 'คุยกับแอดมิน', text: 'คุยกับแอดมิน' } },
  ],
}
// v2 = 2500×843 · แถบหัวบนสุด 150px ไม่ใช่ปุ่ม · 3 ช่องเท่ากัน:
//   1 ต้องการพิมพ์คุย กดเลย → ข้อความ "คุยกับแอดมิน" (บอทถามว่าคุยกับแอดมินคนไหน แล้วโชว์ชื่อ)
//   2 กดสั่งสินค้าเพื่อจัดของ → เปิดเว็บร้าน
//   3 กดสั่งสินค้าเพื่อออกเอกสาร → ข้อความ "ส่งเอกสารโครงการ"
const MENU2 = {
  size: { width: 2500, height: 843 }, selected: true, name: 'NATTA เมนูหลัก v2', chatBarText: 'เมนูร้าน',
  areas: [
    { bounds: { x: 0, y: 150, width: 833, height: 693 }, action: { type: 'message', label: 'คุยกับแอดมิน', text: 'คุยกับแอดมิน' } },
    { bounds: { x: 833, y: 150, width: 833, height: 693 }, action: { type: 'uri', label: 'สั่งสินค้าจัดของ', uri: 'https://www.nattagroup.com' } },
    { bounds: { x: 1666, y: 150, width: 834, height: 693 }, action: { type: 'message', label: 'สั่งสินค้าออกเอกสาร', text: 'ส่งเอกสารโครงการ' } },
  ],
}

// v3 = เหมือน v2 แต่ปุ่มที่ 1 เป็น postback: LINE เปิดแป้นพิมพ์ทันที + โชว์ "ต้องการคุยกับแอดมิน" เป็นฟองข้อความของลูกค้า
//   บอทรับ postback 'talk-admin' แล้วตอบเหมือนลูกค้าพิมพ์ "คุยกับแอดมิน" (การ์ดเลือกแอดมิน) — ตรงกับ shop.json richMenu.areas[0] ของบอท
const MENU3 = {
  ...MENU2, name: 'NATTA เมนูหลัก v3',
  areas: [
    { bounds: MENU2.areas[0].bounds, action: { type: 'postback', label: 'คุยกับแอดมิน', data: 'talk-admin', displayText: 'ต้องการคุยกับแอดมิน', inputOption: 'openKeyboard' } },
    MENU2.areas[1], MENU2.areas[2],
  ],
}

// v4 = 5 ปุ่ม 2 แถว (รูป 2500×1301): แถวบน = 3 ปุ่ม (ปุ่มแรกเป็น postback เหมือน v3 · ปุ่มที่ 3 "สั่งสินค้าออกเอกสาร" เปิดหน้า #order-docs ของเว็บ ไม่ส่งข้อความ "ส่งเอกสารโครงการ" แล้ว — เจ้าของสั่ง 2 พ.ย.) · แถวล่าง = "อุปกรณ์การเรียน" (#school ของเว็บ = หน้าร้านซื้อของโรงเรียน) + "บริการงานพิมพ์" (#services)
//   ตรงกับ shop.json richMenu ของบอท (tests/richmenu.test.js เทียบลิงก์ ขนาด และขอบของแต่ละปุ่มให้)
const MENU4 = {
  size: { width: 2500, height: 1301 }, selected: true, name: 'NATTA เมนูหลัก v4', chatBarText: 'เมนูร้าน',
  areas: [
    { bounds: { x: 0, y: 150, width: 833, height: 654 }, action: MENU3.areas[0].action },
    { bounds: { x: 833, y: 150, width: 833, height: 654 }, action: MENU2.areas[1].action },
    { bounds: { x: 1666, y: 150, width: 834, height: 654 }, action: { type: 'uri', label: 'สั่งสินค้าออกเอกสาร', uri: 'https://www.nattagroup.com/#order-docs' } },
    { bounds: { x: 0, y: 804, width: 1250, height: 497 }, action: { type: 'uri', label: 'อุปกรณ์การเรียน', uri: 'https://www.nattagroup.com/#school' } },
    { bounds: { x: 1250, y: 804, width: 1250, height: 497 }, action: { type: 'uri', label: 'บริการงานพิมพ์', uri: 'https://www.nattagroup.com/#services' } },
  ],
}
const LAYOUTS: Record<string, any> = { v2: MENU2, v3: MENU3, v4: MENU4 }

Deno.serve(async (req) => {
  let b: any = {}
  try { b = await req.json() } catch (_e) { b = {} }
  const key = await sec('push_hook_key')
  if (!key || b.key !== key) return json({ error: 'auth' }, 401)
  // ดูรูป v2 ที่เว็บบอทให้ไว้ (ไม่แตะ LINE): ขนาด · PNG หรือไม่ · SHA-256
  if (b.action === 'fetch_check') {
    const r = await remote(b.image_url)
    if (!r.img) return json(r, 400)
    return json({ n: r.n, png: r.png, w: r.w, h: r.h, sha: r.sha })
  }
  const img = await bytes()
  const sha = img.length ? hex(await crypto.subtle.digest('SHA-256', img)) : ''
  if (b.action === 'check') {
    const parts: string[] = []
    for (let i = 0; i < img.length; i += 2048) parts.push(hex(await crypto.subtle.digest('SHA-256', img.slice(i, i + 2048))).slice(0, 8))
    return json({ n: img.length, sha, parts })
  }
  const tok = await sec('line_channel_token')
  if (!tok) return json({ error: 'no_token' }, 400)
  const H = { Authorization: 'Bearer ' + tok }
  if (b.action === 'status') {
    const r1 = await fetch('https://api.line.me/v2/bot/richmenu/list', { headers: H })
    const r2 = await fetch('https://api.line.me/v2/bot/user/all/richmenu', { headers: H })
    return json({ list: await r1.json().catch(() => null), def: await r2.json().catch(() => null) })
  }
  if (b.action === 'webhook') {
    // อ่านอย่างเดียว: ที่อยู่ webhook ของ OA + ข้อมูลบัญชี · ใส่ test:true = ให้ LINE ลองยิงไปที่ webhook (ส่ง events ว่าง ไม่มีข้อความถึงลูกค้า)
    // ใส่ url ด้วย = ลองยิงไปที่ที่อยู่นั้นแทน (ใช้ลองก่อนตั้งจริง · ไม่เปลี่ยนค่าที่ตั้งไว้) — ต้องเป็น host ที่อนุญาต
    const e: any = await (await fetch(LINE_WEBHOOK + '/endpoint', { headers: H })).json().catch(() => null)
    let test: any = null
    let tested: string | null = null
    if (b.test) {
      tested = b.url ? webhookUrl(b.url) : null
      if (b.url && !tested) return json({ error: 'webhook_url' }, 400)
      test = await (await fetch(LINE_WEBHOOK + '/test', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(tested ? { endpoint: tested } : {}) })).json().catch(() => null)
    }
    const i: any = await (await fetch('https://api.line.me/v2/bot/info', { headers: H })).json().catch(() => null)
    return json({ endpoint: e, test, tested, info: i && { displayName: i.displayName, basicId: i.basicId, chatMode: i.chatMode, markAsReadMode: i.markAsReadMode } })
  }
  if (b.action === 'set_webhook') {
    // ตั้งที่อยู่ webhook ของ OA (LINE ตั้งได้ที่เดียว) — ให้ LINE ลองยิงที่อยู่ใหม่ก่อน ถ้าไม่ผ่านจะไม่เปลี่ยน (force:true = ข้ามการทดสอบ)
    // คืน prev = ที่อยู่เดิม ไว้ย้อนกลับ (เรียก set_webhook อีกครั้งด้วย url เดิม) · เปลี่ยนเฉพาะที่อยู่ ไม่แตะสวิตช์ "ใช้ webhook"
    const u = webhookUrl(b.url)
    if (!u) return json({ error: 'webhook_url' }, 400)
    const cur: any = await (await fetch(LINE_WEBHOOK + '/endpoint', { headers: H })).json().catch(() => null)
    const t: any = await (await fetch(LINE_WEBHOOK + '/test', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: u }) })).json().catch(() => null)
    if (t?.success !== true && b.force !== true) return json({ error: 'test_failed', test: t, prev: cur?.endpoint || null }, 409)
    const r = await fetch(LINE_WEBHOOK + '/endpoint', { method: 'PUT', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: u }) })
    const detail = (await r.text()).slice(0, 300)
    const now: any = await (await fetch(LINE_WEBHOOK + '/endpoint', { headers: H })).json().catch(() => null)
    return json({ ok: r.status === 200, status: r.status, detail, prev: cur?.endpoint || null, now, test: t })
  }
  if (b.action === 'validate') {
    // ให้ LINE ตรวจรูปแบบเมนู (ไม่สร้างอะไร): ส่ง menu เอง หรือ layout:'v4' / 'v3' / 'v2'
    const m = b.menu && typeof b.menu === 'object' ? b.menu : LAYOUTS[b.layout] ?? MENU2
    const r = await fetch('https://api.line.me/v2/bot/richmenu/validate', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(m) })
    return json({ ok: r.status === 200, status: r.status, detail: (await r.text()).slice(0, 600) })
  }
  if (b.action === 'link' && /^U[0-9a-f]{32}$/.test(String(b.user || '')) && /^richmenu-[0-9a-f]{32}$/.test(String(b.id || ''))) {
    // ให้ผู้ใช้คนเดียวเห็นเมนูนี้ (ใช้ทดลองก่อนเปลี่ยนให้ทุกคน) · เอาออกด้วย unlink
    const r = await fetch('https://api.line.me/v2/bot/user/' + b.user + '/richmenu/' + b.id, { method: 'POST', headers: H })
    return json({ ok: r.status === 200, status: r.status, detail: (await r.text()).slice(0, 300) })
  }
  if (b.action === 'unlink' && /^U[0-9a-f]{32}$/.test(String(b.user || ''))) {
    const r = await fetch('https://api.line.me/v2/bot/user/' + b.user + '/richmenu', { method: 'DELETE', headers: H })
    return json({ ok: r.status === 200, status: r.status, detail: (await r.text()).slice(0, 300) })
  }
  if (b.action === 'delete' && /^richmenu-[0-9a-f]{32}$/.test(String(b.id || ''))) {
    // ลบเมนูที่ไม่ใช้แล้ว — ไม่ยอมลบเมนูที่ทุกคนเห็นอยู่
    const cur: any = await (await fetch('https://api.line.me/v2/bot/user/all/richmenu', { headers: H })).json().catch(() => null)
    if (cur?.richMenuId === b.id) return json({ error: 'is_default' }, 409)
    const r = await fetch('https://api.line.me/v2/bot/richmenu/' + b.id, { method: 'DELETE', headers: H })
    return json({ ok: r.status === 200, status: r.status, detail: (await r.text()).slice(0, 300) })
  }
  if (b.action === 'off') {
    // เลิกแสดงเมนูด่วนเริ่มต้น (ตัวเมนูยังเก็บไว้ · เปิดใหม่ได้ด้วย on + id)
    const r = await fetch('https://api.line.me/v2/bot/user/all/richmenu', { method: 'DELETE', headers: H })
    return json({ ok: r.status === 200, status: r.status, detail: (await r.text()).slice(0, 300) })
  }
  if (b.action === 'on' && /^richmenu-[0-9a-f]{32}$/.test(String(b.id || ''))) {
    const r = await fetch('https://api.line.me/v2/bot/user/all/richmenu/' + b.id, { method: 'POST', headers: H })
    return json({ ok: r.status === 200, status: r.status, detail: (await r.text()).slice(0, 300) })
  }
  if (b.action === 'apply') {
    // ไม่ส่ง image_url = เมนู v1 กับรูปใน DB (เหมือนเดิม) · ส่ง image_url = เมนู v2 (หรือ layout:'v3' / 'v4') กับรูปจากเว็บบอท (ต้อง PNG ขนาดเท่าเมนู: v2/v3 = 2500×843, v4 = 2500×1301) · default:false = ไม่ตั้งเป็นของทุกคน
    let menu: any = MENU1, pic: Uint8Array = img, picSha = sha
    if (b.image_url) {
      const r = await remote(b.image_url)
      if (!r.img) return json(r, 400)
      menu = LAYOUTS[b.layout] ?? MENU2
      if (!r.png || r.w !== menu.size.width || r.h !== menu.size.height) return json({ error: 'size', png: r.png, w: r.w, h: r.h, want: menu.size }, 400)
      pic = r.img; picSha = r.sha
    }
    if (!picSha || b.sha !== picSha) return json({ error: 'sha', sha: picSha }, 400)
    const rp = await fetch('https://api.line.me/v2/bot/user/all/richmenu', { headers: H }) // เมนูที่ทุกคนเห็นอยู่ตอนนี้ (ไว้ย้อนกลับ)
    const prev: any = await rp.json().catch(() => null)
    const r1 = await fetch('https://api.line.me/v2/bot/richmenu', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(menu) })
    const j1: any = await r1.json().catch(() => ({}))
    if (r1.status !== 200 || !j1.richMenuId) return json({ error: 'create', status: r1.status, detail: j1 }, 502)
    const id = j1.richMenuId
    const r2 = await fetch('https://api-data.line.me/v2/bot/richmenu/' + id + '/content', { method: 'POST', headers: { ...H, 'Content-Type': 'image/png' }, body: pic })
    const t2 = await r2.text()
    if (r2.status !== 200) return json({ error: 'upload', status: r2.status, detail: t2.slice(0, 300), id }, 502)
    if (b.default === false) return json({ ok: true, id, prev: prev?.richMenuId || null, default: false }) // สร้างและอัปรูปแล้ว แต่ยังไม่ตั้งเป็นของทุกคน (ใช้ link ให้คนทดลอง หรือ on + id ภายหลัง)
    const r3 = await fetch('https://api.line.me/v2/bot/user/all/richmenu/' + id, { method: 'POST', headers: H })
    const t3 = await r3.text()
    return json({ ok: r3.status === 200, id, prev: prev?.richMenuId || null, status: r3.status, detail: t3.slice(0, 300) })
  }
  return json({ error: 'bad_request' }, 400)
})
