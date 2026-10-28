
export const DOC_WORD = 'ส่งเอกสารโครงการ'
const TRIGGER = /^\s*(?:📄\s*)?(?:ส่ง\s*)?เอกสาร\s*โครงการ\s*$|^\s*ส่ง\s*เอกสาร\s*$/
const CANCEL = /^\s*(?:ยกเลิก|cancel)\s*$/i
export const EDIT_WORD = '✏️ ขอแก้ไขเอกสาร'
const EDIT = /^\s*(?:✏️?\s*)?ขอ\s*แก้\s*ไข\s*(?:เอกสาร)?\s*(?:โครงการ)?\s*(PJ-\d{1,6})?\s*$/i
const EDIT_MS = 15 * 60e3            // หลังขอแก้ไข 15 นาที ข้อความ/รูปที่ส่งตามมา = รายละเอียดที่ต้องการแก้
const DONE = /^\s*(?:✅\s*)?(?:ส่งครบแล้ว|ครบแล้ว|เสร็จแล้ว|เสร็จ|จบ|ส่งครบ)\s*$/
const TTL_MS = 6 * 3600e3            // ค้างได้ 6 ชม. แล้วถือว่าเลิก (ข้อความต่อไปส่งต่อบอทเดิมตามปกติ)
const MAX_FILE = 25 * 1024 * 1024     // ไฟล์ละไม่เกิน 25MB (เท่าที่เก็บ)
const MAX_DRIVE = 10 * 1024 * 1024    // สำรอง Drive ไฟล์ละไม่เกิน 10MB (ใหญ่กว่านั้นเก็บในระบบอย่างเดียว)
const TM = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const str = (v, n) => String(v == null ? '' : v).slice(0, n)
const clean = (v, n) => str(String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim(), n)
const money = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
const sch = (s) => String(s || '').replace(/^\s*(?:โรงเรียน|รร\.?)\s*/, '').trim()
const norm = (s) => sch(s).toLowerCase().replace(/[\s.\-–()]/g, '')
const lbl = (s, n) => { const t = String(s || ''); return t.length > (n || 20) ? t.slice(0, (n || 20) - 1) + '…' : t }

const bk = (ms) => { const d = new Date(ms + 7 * 3600e3); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), i: d.getUTCMinutes() } }
export function drivePath(doc, fallbackMs) {
  const d = doc || {}
  const b = bk(Date.parse(d.sent_at || d.created_at || '') || fallbackMs || Date.now())
  const fy = b.y + 543 + (b.m >= 9 ? 1 : 0)
  const t = String(d.teacher_name || '').trim()
  const kru = t ? ' · ' + (/^(ครู|นาง|นาย|น\.ส\.|ผอ|ดร\.)/.test(t) ? t : 'ครู' + t) : ''
  return ['เอกสารโครงการครู · ปีงบประมาณ ' + fy, String((b.m + 3) % 12 + 1).padStart(2, '0') + ' ' + TM[b.m] + ' ' + (b.y + 543), String(d.school_name || '').trim() || 'ไม่ระบุโรงเรียน', String(d.doc_no || '') + ' ' + String(d.project_name || '').trim() + kru].map((x) => x.replace(/\s+/g, ' ').trim().slice(0, 100))
}
export const thTime = (ms) => { const b = bk(ms); return b.d + ' ' + TM[b.m] + ' ' + String((b.y + 543) % 100).padStart(2, '0') + ' · ' + String(b.h).padStart(2, '0') + ':' + String(b.i).padStart(2, '0') + ' น.' }
export const thDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '')); return m ? (+m[3]) + ' ' + TM[+m[2] - 1] + ' ' + String((+m[1] + 543) % 100).padStart(2, '0') : '' }
const todayIso = (ms) => { const b = bk(ms); return b.y + '-' + String(b.m + 1).padStart(2, '0') + '-' + String(b.d).padStart(2, '0') }

export function parseDate(t, nowMs) {
  const s = String(t || '').trim()
  const cur = bk(nowMs)
  let d = 0, m = 0, y = 0
  let x = /^(\d{1,2})\s*[/.\-]\s*(\d{1,2})(?:\s*[/.\-]\s*(\d{2,4}))?$/.exec(s)
  if (x) { d = +x[1]; m = +x[2]; y = x[3] ? +x[3] : 0 }
  else {
    x = /^(\d{1,2})\s*([ก-๙.]+?)\.?\s*(\d{2,4})?$/.exec(s.replace(/\s+/g, ' '))
    if (x) {
      const key = x[2].replace(/\./g, '')
      const i = TM.findIndex((n) => n.replace(/\./g, '') === key)
      const full = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'].indexOf(key)
      const mi = i >= 0 ? i : full
      if (mi >= 0) { d = +x[1]; m = mi + 1; y = x[3] ? +x[3] : 0 }
    }
  }
  if (!d || !m || m > 12 || d > 31) return null
  if (y) { if (y < 100) y += y >= 50 ? 2500 : 2000; if (y > 2400) y -= 543 }
  else { y = cur.y; if (m < cur.m + 1 || (m === cur.m + 1 && d < cur.d)) y += 1 }
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCMonth() !== m - 1) return null
  return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0')
}
export function parseMoney(t) {
  let s = String(t || '').replace(/,/g, '').replace(/บาท|฿|thb/gi, '').trim()
  let mul = 1
  if (/แสน\s*$/.test(s)) { mul = 1e5; s = s.replace(/แสน\s*$/, '') } else if (/หมื่น\s*$/.test(s)) { mul = 1e4; s = s.replace(/หมื่น\s*$/, '') } else if (/พัน\s*$/.test(s)) { mul = 1e3; s = s.replace(/พัน\s*$/, '') } else if (/k\s*$/i.test(s)) { mul = 1e3; s = s.replace(/k\s*$/i, '') }
  if (!/^\d+(?:\.\d+)?$/.test(s.trim())) return null
  const v = Math.round(Number(s) * mul * 100) / 100
  return v > 0 && v < 1e10 ? v : null
}
export function parsePhone(t) {
  let d = String(t || '').replace(/[^\d+]/g, '')
  if (d.startsWith('+66')) d = '0' + d.slice(3)
  if (d.startsWith('66') && d.length === 11) d = '0' + d.slice(2)
  return /^0\d{8,9}$/.test(d) ? d : null
}
const safeName = (s) => clean(s, 120).replace(/[\\/:*?"<>|#%{}^~[\]`]/g, '_') || 'file'
const extOf = (mime, name) => {
  const m = /\.([a-z0-9]{1,5})$/i.exec(String(name || ''))
  if (m) return m[1].toLowerCase()
  return { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'application/pdf': 'pdf' }[String(mime || '').split(';')[0]] || 'bin'
}
const rid = () => { let s = ''; const c = 'abcdefghijkmnpqrstuvwxyz23456789'; for (let i = 0; i < 12; i++) s += c[Math.floor(Math.random() * c.length)]; return s }

const qr = (items) => ({ items: items.filter(Boolean).slice(0, 13) })
const qMsg = (label, text) => ({ type: 'action', action: { type: 'message', label: lbl(label), text: text || label } })
const qPb = (label, data, display) => ({ type: 'action', action: { type: 'postback', label: lbl(label), data, displayText: display || label } })
const QCANCEL = qPb('ยกเลิก', 'pd:cancel', 'ยกเลิก')
const T = (text, items) => { const it = (items || []).filter(Boolean); return it.length ? { type: 'text', text: str(text, 4900), quickReply: qr(it) } : { type: 'text', text: str(text, 4900) } }

const C = { navy: '#12335F', org: '#E2572B', grn: '#13824B', mut: '#6B7280', line: '#EADFCF', cream: '#FBF6EE' }
export const PAGE_URL = 'https://www.nattagroup.com/pj.html'
const stepRow = (n, t, sub) => ({ type: 'box', layout: 'horizontal', spacing: 'md', contents: [
  { type: 'box', layout: 'vertical', width: '26px', height: '26px', cornerRadius: '13px', backgroundColor: C.navy, justifyContent: 'center', alignItems: 'center', flex: 0, contents: [{ type: 'text', text: String(n), size: 'xs', color: '#FFFFFF', weight: 'bold', align: 'center' }] },
  { type: 'box', layout: 'vertical', flex: 1, contents: [{ type: 'text', text: t, size: 'sm', weight: 'bold', color: '#111111', wrap: true }].concat(sub ? [{ type: 'text', text: sub, size: 'xs', color: C.mut, wrap: true }] : []) },
] })
export function pageFlex(n, url) {
  const body = [
    stepRow(1, 'ข้อมูลครู', 'โรงเรียน · ชื่อ · เบอร์ (ครั้งแรกครั้งเดียว)'),
    stepRow(2, 'โครงการ', 'ชื่อโครงการ · วันที่ต้องการ · งบประมาณ (ไม่บังคับ)'),
    stepRow(3, 'แนบรูป / ไฟล์ แล้วกดส่ง', 'ได้เลขที่เอกสาร PJ- กลับมาทันที'),
  ]
  if (n) body.push({ type: 'text', text: '✓ ไฟล์ที่ส่งในแชท ' + n + ' ไฟล์ แนบให้ในหน้าส่งเอกสารแล้ว', size: 'xs', color: C.grn, weight: 'bold', wrap: true, margin: 'md' })
  return {
    type: 'flex',
    altText: '📄 ส่งเอกสารโครงการ — กด “เปิดหน้าส่งเอกสาร” (3 ขั้น จบในหน้าเดียว)',
    contents: {
      type: 'bubble', size: 'kilo',
      header: { type: 'box', layout: 'vertical', paddingAll: '14px', backgroundColor: C.cream, contents: [
        { type: 'text', text: 'ร้านนัฐภรณ์ เชียงกลาง', size: 'xxs', color: C.org, weight: 'bold' },
        { type: 'text', text: 'ส่งเอกสารโครงการ 📄', size: 'md', weight: 'bold', color: C.navy, wrap: true, margin: 'xs' },
        { type: 'text', text: '3 ขั้น จบในหน้าเดียว · ร้านได้รับทันที', size: 'xs', color: C.mut, wrap: true },
      ] },
      body: { type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '14px', contents: body },
      footer: { type: 'box', layout: 'vertical', paddingAll: '12px', contents: [
        { type: 'button', style: 'primary', color: C.navy, height: 'md', action: { type: 'uri', label: 'เปิดหน้าส่งเอกสาร', uri: url || PAGE_URL } },
      ] },
    },
  }
}
const row = (k, v) => ({ type: 'box', layout: 'horizontal', spacing: 'md', contents: [
  { type: 'text', text: k, size: 'sm', color: C.mut, flex: 3 },
  { type: 'text', text: str(v || '-', 300), size: 'sm', color: '#111111', flex: 7, wrap: true },
] })
export function summaryFlex(d) {
  const need = d.need_date ? thDate(d.need_date) : d.need_text || 'ยังไม่กำหนด'
  const rows = [
    row('เลขที่', d.doc_no),
    row('โรงเรียน', d.school_name),
    row('ครู', d.teacher_name + (d.phone ? ' · ' + d.phone : '')),
    row('โครงการ', d.project_name),
    row('ต้องการ', need),
    row('งบประมาณ', d.budget != null ? money(d.budget) + ' บาท' : 'ไม่ระบุ'),
    row('ไฟล์', (d.file_count || 0) + ' ไฟล์'),
    row('เวลาส่ง', thTime(d.sent_ms)),
  ]
  const title = d.added ? 'เพิ่มไฟล์ในเอกสารโครงการแล้ว ✓' : 'ร้านได้รับเอกสารโครงการแล้ว ✓'
  return {
    type: 'flex',
    altText: str(title + ' ' + d.doc_no + ' · ' + (d.project_name || ''), 380),
    contents: {
      type: 'bubble', size: 'kilo',
      header: { type: 'box', layout: 'vertical', paddingAll: '14px', backgroundColor: C.cream, contents: [
        { type: 'text', text: 'ร้านนัฐภรณ์ เชียงกลาง', size: 'xxs', color: C.org, weight: 'bold' },
        { type: 'text', text: title, size: 'md', weight: 'bold', color: C.navy, wrap: true, margin: 'xs' },
      ] },
      body: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '14px', contents: rows },
      footer: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '12px', contents: [
        { type: 'text', text: 'แอดมินจะตรวจเอกสารและติดต่อกลับนะคะ 🙏', size: 'xs', color: C.mut, wrap: true },
        { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: 'ส่งไฟล์เพิ่ม', data: 'pd:add:' + d.id, displayText: 'ส่งไฟล์เพิ่ม ' + d.doc_no } },
      ] },
    },
  }
}

export function createDocFlow(deps) {
  const store = deps.store
  const line = deps.line
  const now = deps.now || (() => Date.now())
  const waitUntil = deps.waitUntil || ((p) => p)
  const doFetch = deps.fetch

  const uidOf = (ev) => (ev && ev.source && ev.source.type === 'user' && ev.source.userId) || ''
  const textOf = (ev) => (ev && ev.type === 'message' && ev.message && ev.message.type === 'text' ? String(ev.message.text || '') : '')
  const pbOf = (ev) => (ev && ev.type === 'postback' && ev.postback ? String(ev.postback.data || '') : '')
  const isFileEv = (ev) => ev && ev.type === 'message' && ev.message && (ev.message.type === 'image' || ev.message.type === 'file')

  async function live(uid) {
    let st = null
    try { st = await store.getDocState(uid) } catch (_e) { st = null }
    if (!st) return null
    const t = Date.parse(st.updated_at || '') || 0
    const until = st.step === 'after' || st.step === 'edit' ? Number(st.data && st.data.until) || 0 : t + TTL_MS
    if (now() > until) { try { await store.clearDocState(uid) } catch (_e) { /* ignore */ } return null }
    return st
  }
  async function known(uid) {
    try { if (await store.getTeacher(uid)) return true } catch (_e) { /* ignore */ }
    try { const h = await store.teacherHints(uid); return !!(h && h.school_id) } catch (_e) { return false }
  }

  async function owns(ev) {
    const uid = uidOf(ev)
    if (!uid) return false
    if (ev.type !== 'message' && ev.type !== 'postback') return false
    if (TRIGGER.test(textOf(ev))) return true
    if (/^pd:/.test(pbOf(ev))) return true
    const em = EDIT.exec(textOf(ev))
    if (em) {
      if (em[1]) return true
      try { return ((await store.sharedDocs(uid)) || []).length > 0 } catch (_e) { return false }
    }
    const st = await live(uid)
    if (st) return (st.step !== 'after' && st.step !== 'web') || isFileEv(ev)
    if (ev.type === 'message' && ev.message && ev.message.type === 'file' && await known(uid)) return true
    return false
  }

  async function saveFile(ev, uid, sess, docId) {
    const m = ev.message
    if (m.type === 'file' && Number(m.fileSize) > MAX_FILE) return { error: 'big' }
    let got = null
    try { got = await line.content(m.id) } catch (_e) { got = null }
    if (!got || got.status !== 200 || !got.bytes) return { error: 'download' }
    if (got.bytes.length > MAX_FILE) return { error: 'big' }
    const mime = str(got.mime || (m.type === 'image' ? 'image/jpeg' : 'application/octet-stream'), 100).split(';')[0]
    const ts = now()
    const b = bk(ts)
    const stamp = b.y + String(b.m + 1).padStart(2, '0') + String(b.d).padStart(2, '0') + '-' + String(b.h).padStart(2, '0') + String(b.i).padStart(2, '0')
    const base = m.type === 'file' ? safeName(m.fileName) : 'รูป-' + stamp + '.' + extOf(mime)
    const name = m.type === 'file' ? base : base
    const path = (docId ? 'doc/' + docId : 'sess/' + sess) + '/' + stamp + '-' + rid() + '.' + extOf(mime, m.fileName)
    try { await store.putObject(path, got.bytes, mime) } catch (_e) { return { error: 'store' } }
    const rec = await store.addFile({ doc_id: docId || null, session_id: docId ? null : sess, line_user_id: uid, path, name: str(name, 160), mime, size: got.bytes.length, received_at: new Date(ts).toISOString() })
    return { ok: true, id: rec && rec.id, path }
  }
  async function saveLink(text, uid, sess, docId) {
    const url = (String(text).match(/https?:\/\/\S+/) || [''])[0]
    if (!url) return null
    await store.addFile({ doc_id: docId || null, session_id: docId ? null : sess, line_user_id: uid, path: null, name: str(url, 500), mime: 'link', size: 0, received_at: new Date(now()).toISOString() })
    return url
  }
  const filesIn = async (d) => { try { return await store.countFiles(d.doc_id ? { doc_id: d.doc_id } : { session_id: d.sess }) } catch (_e) { return 0 } }

  async function hints(uid, d) {
    let h = null
    try { h = await store.teacherHints(uid) } catch (_e) { h = null }
    return Object.assign({ school_id: null, school_name: '', name: '', phone: '', line_name: '' }, h || {}, d && d.edit ? { school_id: d.school_id || null, school_name: d.school_name || '', name: d.teacher_name || '', phone: d.phone || '' } : {})
  }
  async function askSchool(uid, d, intro) {
    const h = await hints(uid, d)
    const items = []
    if (h.school_id && h.school_name) items.push(qPb(sch(h.school_name), 'pd:sch:' + h.school_id, h.school_name))
    items.push(QCANCEL)
    return T((intro ? intro + '\n\n' : '') + '1/3 คุณครูอยู่โรงเรียนอะไรคะ? 🏫\nพิมพ์ชื่อโรงเรียนได้เลยค่ะ' + (h.school_id ? '\n(หรือกดเลือกด้านล่าง)' : ''), items)
  }
  async function askName(uid, d) {
    const h = await hints(uid, d)
    const sug = [...new Set([h.name, h.line_name].filter((x) => x && x.length <= 60))]
    return T('2/3 ชื่อคุณครูค่ะ 👩‍🏫\n(ชื่อ-นามสกุล หรือชื่อที่ร้านเรียกได้)', [...sug.map((x) => qMsg(x)), QCANCEL])
  }
  async function askPhone(uid, d) {
    const h = await hints(uid, d)
    return T('3/3 เบอร์โทรที่ร้านติดต่อได้ค่ะ 📞', [h.phone ? qMsg(h.phone) : null, QCANCEL])
  }
  function askProject(d, recent) {
    const who = 'ส่งในนาม: ครู' + d.teacher_name + ' · ' + d.school_name + (d.phone ? ' · ' + d.phone : '')
    const items = []
    if (recent && recent.length) items.push(qPb('ส่งเพิ่มโครงการเดิม', 'pd:add', 'ส่งไฟล์เพิ่มในโครงการเดิม'))
    items.push(qPb('แก้ข้อมูลครู', 'pd:edit', 'แก้ข้อมูลครู'), QCANCEL)
    return T('📄 ส่งเอกสารโครงการ\n' + who + '\n\nชื่อโครงการคืออะไรคะ? พิมพ์ได้เลยค่ะ', items)
  }
  function askNeed(ms) {
    return T('📅 ต้องการของ / กำหนดส่ง วันไหนคะ?\nกดเลือกวันที่ หรือพิมพ์ เช่น 15/11', [
      { type: 'action', action: { type: 'datetimepicker', label: 'เลือกวันที่', data: 'pd:need', mode: 'date', min: todayIso(ms) } },
      qPb('ยังไม่กำหนด', 'pd:need:none', 'ยังไม่กำหนด'), QCANCEL,
    ])
  }
  const askBudget = () => T('💰 งบประมาณโครงการเท่าไหร่คะ? (พิมพ์ตัวเลข เช่น 15000)', [qPb('ไม่ระบุ', 'pd:budget:none', 'ไม่ระบุงบประมาณ'), QCANCEL])
  const QDONE = qPb('✅ ส่งครบแล้ว', 'pd:done', 'ส่งครบแล้ว')
  async function askFiles(d) {
    const n = await filesIn(d)
    return T('📎 ส่งไฟล์เอกสารโครงการได้เลยค่ะ\n• ถ่ายรูปเอกสาร หรือส่งไฟล์ PDF / Word / Excel\n• ส่งได้หลายไฟล์ · ไฟล์ใหญ่ส่งเป็นลิงก์ Google Drive ได้\n' + (n ? '\nได้รับแล้ว ' + n + ' ไฟล์ ✓ ' : '\n') + 'ส่งครบแล้วกด “ส่งครบแล้ว” ค่ะ', [n ? QDONE : null, QCANCEL])
  }
  async function prompt(uid, st) {
    const d = st.data || {}
    if (st.step === 'school') return askSchool(uid, d)
    if (st.step === 'name') return askName(uid, d)
    if (st.step === 'phone') return askPhone(uid, d)
    if (st.step === 'project') return askProject(d, await recentOf(uid))
    if (st.step === 'need') return askNeed(now())
    if (st.step === 'budget') return askBudget()
    if (st.step === 'files') return askFiles(d)
    if (st.step === 'pick') return askPick(uid)
    if (st.step === 'confirm') return T('เป็นเอกสารโครงการใช่ไหมคะ?', [qPb('ใช่ ส่งเอกสารโครงการ', 'pd:yes', 'ใช่ เป็นเอกสารโครงการ'), qPb('ไม่ใช่', 'pd:no', 'ไม่ใช่')])
    return T('พิมพ์ “' + DOC_WORD + '” เพื่อเริ่มส่งเอกสารได้เลยค่ะ')
  }
  async function recentOf(uid) {
    try { return ((await store.recentDocs(uid, 5)) || []).filter((x) => x && x.status !== 'cancelled') } catch (_e) { return [] }
  }
  async function askPick(uid) {
    const list = await recentOf(uid)
    if (!list.length) return T('ยังไม่มีโครงการเดิมค่ะ พิมพ์ชื่อโครงการใหม่ได้เลย', [QCANCEL])
    return T('เลือกโครงการที่จะส่งไฟล์เพิ่มค่ะ\n' + list.map((x) => '• ' + x.doc_no + ' ' + (x.project_name || '')).join('\n'), [
      ...list.map((x) => qPb(x.doc_no + ' ' + (x.project_name || ''), 'pd:add:' + x.id, 'ส่งไฟล์เพิ่ม ' + x.doc_no)), QCANCEL,
    ])
  }

  const save = (uid, step, data) => store.setDocState(uid, step, data)
  async function toPage(uid, st) {
    const d = st && st.data && st.data.sess && !st.data.doc_id && ['confirm', 'web', 'school', 'name', 'phone', 'project', 'need', 'budget', 'files'].includes(st.step) ? { sess: st.data.sess } : null
    let n = 0
    if (d) n = await filesIn(d)
    if (d && n) { try { await save(uid, 'web', d) } catch (_e) { /* ignore */ } }
    else { try { await store.clearDocState(uid) } catch (_e) { /* ignore */ } }
    return pageFlex(n)
  }
  async function begin(uid, d0) {
    const d = Object.assign({ sess: rid() }, d0 || {})
    let t = null
    try { t = await store.getTeacher(uid) } catch (_e) { t = null }
    if (t && t.teacher_name && t.school_name) {
      Object.assign(d, { school_id: t.school_id || null, school_name: t.school_name, teacher_name: t.teacher_name, phone: t.phone || '' })
      await save(uid, 'project', d)
      return askProject(d, await recentOf(uid))
    }
    await save(uid, 'school', d)
    return askSchool(uid, d, 'สวัสดีค่ะ 🙏 ร้านนัฐภรณ์รับเอกสารโครงการทาง LINE ได้เลยค่ะ\nขอข้อมูลคุณครูครั้งแรกครั้งเดียว ครั้งต่อไปไม่ต้องกรอกอีกค่ะ')
  }
  async function afterTeacher(uid, d, prof) {
    d.edit = false
    try {
      await store.saveTeacher({ line_user_id: uid, line_name: str(prof && prof.displayName, 120) || null, teacher_name: d.teacher_name, phone: d.phone || null, school_id: d.school_id || null, school_name: d.school_name, updated_at: new Date(now()).toISOString() })
    } catch (_e) { /* ignore — ไม่ทำให้ส่งเอกสารไม่ได้ */ }
    if (d.after === 'files' && d.doc_id) { await save(uid, 'files', d); return [T('บันทึกข้อมูลคุณครูแล้ว ✓'), await askFiles(d)] }
    await save(uid, 'project', d)
    return [T('บันทึกข้อมูลคุณครูแล้ว ✓ ครั้งต่อไปไม่ต้องกรอกอีกค่ะ'), askProject(d, await recentOf(uid))]
  }
  async function matchSchools(q) {
    let all = []
    try { all = (await store.listSchools()) || [] } catch (_e) { all = [] }
    const k = norm(q)
    if (!k) return []
    const exact = all.filter((s) => norm(s.name) === k)
    if (exact.length) return exact
    return all.filter((s) => { const n = norm(s.name); return n.includes(k) || (k.length >= 4 && k.includes(n)) }).slice(0, 10)
  }
  async function finish(uid, d) {
    const n = await filesIn(d)
    if (!n) return T('ยังไม่ได้รับไฟล์เลยค่ะ 📎 ส่งรูปหรือไฟล์เอกสารก่อน แล้วค่อยกด “ส่งครบแล้ว” นะคะ', [QCANCEL])
    const sentMs = now()
    let doc = null
    if (d.doc_id) {
      doc = await store.touchDoc(d.doc_id, { last_file_at: new Date(sentMs).toISOString() })
      if (doc) doc.added = true
    } else {
      doc = await store.createDoc({
        line_user_id: uid, line_name: d.line_name || null, teacher_name: d.teacher_name, phone: d.phone || null,
        school_id: d.school_id || null, school_name: d.school_name, project_name: d.project_name,
        need_date: d.need_date || null, need_text: d.need_text || null, budget: d.budget == null ? null : d.budget,
        sent_at: new Date(sentMs).toISOString(), last_file_at: new Date(sentMs).toISOString(), session_id: d.sess,
      })
    }
    if (!doc) return T('ขออภัยค่ะ บันทึกไม่สำเร็จ ลองกด “ส่งครบแล้ว” อีกครั้ง หรือรอแอดมินติดต่อกลับนะคะ', [QDONE, QCANCEL])
    try { await save(uid, 'after', { sess: d.sess, doc_id: doc.id, doc_no: doc.doc_no, until: sentMs + 180e3 }) } catch (_e) { /* ignore */ }
    const view = Object.assign({}, doc, { sent_ms: doc.added ? sentMs : (Date.parse(doc.sent_at || '') || sentMs) })
    waitUntil(afterSave(doc, d).catch(() => null))
    return summaryFlex(view)
  }

  async function afterSave(doc) {
    const jobs = []
    jobs.push(notifyShop(doc).catch(() => null))
    jobs.push(backupDrive(doc).catch(() => null))
    await Promise.all(jobs)
  }
  async function pushShop(title, body, tag) {
    if (!doFetch || !deps.pushUrl) return
    const key = await store.getSecret('push_hook_key')
    if (!key) return
    await doFetch(deps.pushUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'notify', key, title, body: str(body, 240), tag, url: '/#projdocs' }) })
  }
  async function notifyShop(doc) {
    const title = (doc.added ? '📎 ไฟล์เพิ่ม ' : '📄 เอกสารโครงการใหม่ ') + doc.doc_no
    const body = [doc.school_name, 'ครู' + (doc.teacher_name || ''), doc.project_name, (doc.file_count || 0) + ' ไฟล์'].filter(Boolean).join(' · ')
    await pushShop(title, body, 'pdoc-' + doc.doc_no)
  }

  async function editStart(uid, no, id) {
    let doc = null
    if (no || id) {
      try { doc = id ? await store.getDoc(id) : await store.docByNo(no) } catch (_e) { doc = null }
      if (doc && doc.line_user_id !== uid && !doc.share_token) doc = null
      if (!doc) return [T('ไม่พบเอกสาร ' + (no || '') + ' ค่ะ แอดมินจะตรวจสอบแล้วตอบกลับนะคะ 🙏')]
    } else {
      let list = []
      try { list = (await store.sharedDocs(uid)) || [] } catch (_e) { list = [] }
      if (!list.length) return [T('ยังไม่มีเอกสารที่ร้านส่งให้ค่ะ แอดมินจะตอบกลับนะคะ 🙏')]
      if (list.length > 1) return [T('ต้องการแก้ไขเอกสารโครงการไหนคะ?', list.slice(0, 12).map((x) => qPb(x.doc_no + ' ' + (x.project_name || ''), 'pd:ed:' + x.id, EDIT_WORD + ' ' + x.doc_no)).concat([QCANCEL]))]
      doc = list[0]
    }
    const at = new Date(now()).toISOString()
    try { await store.setEditReq(doc.id, doc.edit_req_at ? { edit_req_at: at } : { edit_req_at: at, edit_req_text: '' }) } catch (_e) { /* ignore */ }
    await save(uid, 'edit', { doc_id: doc.id, doc_no: doc.doc_no, until: now() + EDIT_MS, n: 0 })
    waitUntil(pushShop('✏️ ครูขอแก้ไข ' + doc.doc_no, [doc.school_name, 'ครู' + (doc.teacher_name || ''), doc.project_name].filter(Boolean).join(' · '), 'pdoc-' + doc.doc_no + '-edit').catch(() => null))
    return [T('รับคำขอแก้ไข ' + doc.doc_no + ' แล้วค่ะ ✏️\nพิมพ์บอกจุดที่ต้องการแก้ได้เลย (ส่งรูปที่วงไว้ก็ได้) ร้านจะแก้แล้วส่งเอกสารให้ใหม่นะคะ 🙏', [QCANCEL])]
  }
  async function editMore(ev, uid, st) {
    const d = st.data || {}
    let add = ''
    if (isFileEv(ev)) {
      const r = await saveFile(ev, uid, null, d.doc_id)
      if (r.error) return [T(r.error === 'big' ? 'ไฟล์ใหญ่เกิน 25MB ค่ะ ส่งเป็นลิงก์ Google Drive แทนได้นะคะ' : 'ขออภัยค่ะ รับไฟล์นี้ไม่สำเร็จ ลองส่งใหม่อีกครั้งนะคะ')]
      try { await store.touchDoc(d.doc_id, { last_file_at: new Date(now()).toISOString() }) } catch (_e) { /* ignore */ }
      add = '📎 แนบ' + (ev.message.type === 'image' ? 'รูป' : 'ไฟล์ ' + clean(ev.message.fileName, 80))
    } else {
      add = clean(textOf(ev), 600)
      if (!add) return []
    }
    let doc = null
    try { doc = await store.getDoc(d.doc_id) } catch (_e) { doc = null }
    const prev = String((doc && doc.edit_req_text) || '')
    try { await store.setEditReq(d.doc_id, { edit_req_text: str((prev ? prev + '\n' : '') + add, 2000), edit_req_at: (doc && doc.edit_req_at) || new Date(now()).toISOString() }) } catch (_e) { /* ignore */ }
    const n = (Number(d.n) || 0) + 1
    try { await save(uid, 'edit', Object.assign({}, d, { n, until: now() + EDIT_MS })) } catch (_e) { /* ignore */ }
    if (n > 1) return [] // ตอบครั้งเดียว ที่เหลือเก็บเงียบ ๆ (แชทยังค้างให้ร้านเห็น)
    waitUntil(pushShop('✏️ ' + d.doc_no + ' ขอแก้ไข', add, 'pdoc-' + d.doc_no + '-edit').catch(() => null))
    return [T('รับทราบค่ะ ✓ ร้านจะแก้ไขแล้วส่งเอกสารให้ใหม่ทาง LINE นะคะ 🙏\n(มีเพิ่มเติมพิมพ์ต่อได้เลยค่ะ)')]
  }
  async function editCancel(uid, st) {
    const d = st.data || {}
    try { await store.clearDocState(uid) } catch (_e) { /* ignore */ }
    try { await store.setEditReq(d.doc_id, { edit_req_at: null, edit_req_text: null }) } catch (_e) { /* ignore */ }
    return [T('ยกเลิกคำขอแก้ไข ' + (d.doc_no || '') + ' แล้วค่ะ 🙏')]
  }
  async function backupDrive(doc) {
    if (!doFetch) return
    const url = await store.getSecret('gd_url')
    const key = await store.getSecret('gd_key')
    if (!url || !key) return
    let files = []
    try { files = (await store.filesOf(doc.id)) || [] } catch (_e) { files = [] }
    const path = drivePath(doc, now())
    let folder = ''
    for (const f of files) {
      if (f.drive_url || !f.path || f.mime === 'link') continue
      if (Number(f.size) > MAX_DRIVE) { try { await store.setFileDrive(f.id, null, 'too_big') } catch (_e) { /* ignore */ } continue }
      let bytes = null
      try { bytes = await store.getObject(f.path) } catch (_e) { bytes = null }
      if (!bytes) { try { await store.setFileDrive(f.id, null, 'read') } catch (_e) { /* ignore */ } continue }
      const b = bk(Date.parse(f.received_at || '') || now())
      const stamp = b.y + '-' + String(b.m + 1).padStart(2, '0') + '-' + String(b.d).padStart(2, '0') + ' ' + String(b.h).padStart(2, '0') + '.' + String(b.i).padStart(2, '0')
      const r = await gsPut(url, { action: 'put', key, path, name: stamp + ' ' + (f.name || 'file'), mime: f.mime || 'application/octet-stream', b64: b64(bytes) })
      try { await store.setFileDrive(f.id, r.ok ? str(r.url, 600) : null, r.ok ? null : str(r.error || 'upload', 120)) } catch (_e) { /* ignore */ }
      if (r.ok && r.folder_url) folder = r.folder_url
    }
    if (folder) { try { await store.setDocFolder(doc.id, str(folder, 600)) } catch (_e) { /* ignore */ } }
  }
  async function gsPut(url, payload) {
    try {
      const r = await doFetch(url, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) })
      const t = await r.text()
      let d = null
      try { d = JSON.parse(t) } catch (_e) { d = null }
      return d && d.ok ? { ok: true, url: d.url || '', folder_url: d.folder_url || '' } : { ok: false, error: (d && d.error) || 'not_json' }
    } catch (_e) { return { ok: false, error: 'network' } }
  }
  function b64(bytes) {
    let s = ''
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
    return btoa(s)
  }

  async function step(ev) {
    const uid = uidOf(ev)
    const text = textOf(ev).trim()
    const pb = pbOf(ev)
    let st = await live(uid)

    if (TRIGGER.test(text) || pb === 'pd:start') return [await toPage(uid, st)]
    const em = EDIT.exec(text)
    const edPb = /^pd:ed:([0-9a-f-]{36})$/i.exec(pb)
    if (em || edPb) return await editStart(uid, em ? (em[1] || '').toUpperCase() : '', edPb ? edPb[1] : '')
    if (st && st.step === 'edit') {
      if (pb === 'pd:cancel' || CANCEL.test(text)) return await editCancel(uid, st)
      if (!pb) return await editMore(ev, uid, st)
      try { await store.clearDocState(uid) } catch (_e) { /* ignore */ } // กดปุ่มอื่นของบอท → ออกจากโหมดขอแก้ไข
      st = null
    }
    if (pb === 'pd:cancel' || (st && CANCEL.test(text))) {
      try { await store.clearDocState(uid) } catch (_e) { /* ignore */ }
      return [T('ยกเลิกแล้วค่ะ 🙏 พิมพ์ “' + DOC_WORD + '” เพื่อเริ่มใหม่ได้ทุกเมื่อนะคะ')]
    }
    if (pb === 'pd:no') {
      try { await store.clearDocState(uid) } catch (_e) { /* ignore */ }
      return [T('รับทราบค่ะ 🙏 แอดมินจะดูไฟล์ให้นะคะ')]
    }
    if (pb === 'pd:yes') return [await toPage(uid, st)]
    if (pb === 'pd:edit') {
      const d = Object.assign({ sess: rid() }, st ? st.data : {}, { edit: true, after: st && st.step === 'files' && st.data && st.data.doc_id ? 'files' : 'project' })
      await save(uid, 'school', d)
      return [await askSchool(uid, d)]
    }
    if (pb === 'pd:add') {
      const d = Object.assign({ sess: rid() }, st ? st.data : {})
      await save(uid, 'pick', d)
      return [await askPick(uid)]
    }
    const addM = /^pd:add:([0-9a-f-]{36})$/i.exec(pb)
    if (addM) {
      let doc = null
      try { doc = await store.getDoc(addM[1]) } catch (_e) { doc = null }
      if (!doc || doc.line_user_id !== uid) return [T('ไม่พบโครงการนี้ค่ะ พิมพ์ “' + DOC_WORD + '” เพื่อส่งใหม่ได้เลยนะคะ')]
      const d = Object.assign({ sess: rid() }, st ? st.data : {}, { doc_id: doc.id, doc_no: doc.doc_no, school_id: doc.school_id, school_name: doc.school_name, teacher_name: doc.teacher_name, phone: doc.phone, project_name: doc.project_name })
      await save(uid, 'files', d)
      return [T('ส่งไฟล์เพิ่มใน ' + doc.doc_no + ' “' + (doc.project_name || '') + '” ได้เลยค่ะ'), await askFiles(d)]
    }

    if (!st) {
      if (isFileEv(ev)) {
        const d = { sess: rid() }
        const r = await saveFile(ev, uid, d.sess, null)
        await save(uid, 'confirm', d)
        if (r.error === 'big') return [T('ไฟล์ใหญ่เกิน 25MB ค่ะ ส่งเป็นลิงก์ Google Drive แทนได้นะคะ')]
        return [T('ได้รับไฟล์แล้วค่ะ 📎 เป็นเอกสารโครงการใช่ไหมคะ?', [qPb('ใช่ ส่งเอกสารโครงการ', 'pd:yes', 'ใช่ เป็นเอกสารโครงการ'), qPb('ไม่ใช่', 'pd:no', 'ไม่ใช่')])]
      }
      return [await begin(uid)]
    }

    const d = st.data || {}
    if (st.step === 'web') {
      if (!isFileEv(ev)) return []
      const r = await saveFile(ev, uid, d.sess, null)
      if (r.error) return [T(r.error === 'big' ? 'ไฟล์ใหญ่เกิน 25MB ค่ะ แนบในหน้าส่งเอกสารแทนได้นะคะ' : 'ขออภัยค่ะ รับไฟล์นี้ไม่สำเร็จ ลองแนบในหน้าส่งเอกสารแทนนะคะ')]
      try { await save(uid, 'web', d) } catch (_e) { /* ignore */ }
      const set = ev.message.imageSet
      if (set && Number(set.index) < Number(set.total)) return []
      return [pageFlex(await filesIn(d))]
    }
    if (st.step === 'after') {
      if (!isFileEv(ev)) return []
      const r = await saveFile(ev, uid, d.sess, d.doc_id)
      if (r.error) return [T(r.error === 'big' ? 'ไฟล์ใหญ่เกิน 25MB ค่ะ ส่งเป็นลิงก์ Google Drive แทนได้นะคะ' : 'ขออภัยค่ะ รับไฟล์นี้ไม่สำเร็จ ลองส่งใหม่อีกครั้งนะคะ')]
      let doc = null
      try { doc = await store.touchDoc(d.doc_id, { last_file_at: new Date(now()).toISOString() }) } catch (_e) { doc = null }
      if (doc) waitUntil(backupDrive(doc).catch(() => null))
      const set = ev.message.imageSet
      if (set && Number(set.index) < Number(set.total)) return []
      return [T('เพิ่มไฟล์ใน ' + d.doc_no + ' แล้ว ✓ (รวม ' + ((doc && doc.file_count) || await filesIn({ doc_id: d.doc_id })) + ' ไฟล์)')]
    }
    if (isFileEv(ev)) {
      const r = await saveFile(ev, uid, d.sess, d.doc_id || null)
      if (r.error === 'big') return [T('ไฟล์ใหญ่เกิน 25MB ค่ะ ส่งเป็นลิงก์ Google Drive แทนได้นะคะ', st.step === 'files' ? [QDONE, QCANCEL] : null)]
      if (r.error) return [T('ขออภัยค่ะ รับไฟล์นี้ไม่สำเร็จ ลองส่งใหม่อีกครั้งนะคะ', st.step === 'files' ? [QDONE, QCANCEL] : null)]
      const set = ev.message.imageSet
      if (set && Number(set.index) < Number(set.total)) return [] // รูปชุดเดียวกัน — ตอบครั้งเดียวตอนรูปสุดท้าย
      const n = await filesIn(d)
      if (st.step === 'files') return [T('ได้รับไฟล์แล้ว ' + n + ' ไฟล์ ✓\nส่งเพิ่มได้อีก หรือกด “ส่งครบแล้ว” ค่ะ', [QDONE, QCANCEL])]
      if (st.step === 'confirm') return [await prompt(uid, st)]
      return [T('ได้รับไฟล์แล้ว ' + n + ' ไฟล์ ✓ (เก็บไว้ในโครงการนี้)'), await prompt(uid, st)]
    }
    if (ev.type === 'message' && ev.message && ev.message.type !== 'text') {
      if (['video', 'audio'].includes(ev.message.type)) return [T('รับเฉพาะรูปหรือไฟล์เอกสารค่ะ 🙏'), await prompt(uid, st)]
      return [await prompt(uid, st)]
    }

    if (st.step === 'confirm') return [await prompt(uid, st)]
    if (st.step === 'school') {
      const m = /^pd:sch:([0-9a-f-]{36})$/i.exec(pb)
      if (m) {
        let all = []
        try { all = (await store.listSchools()) || [] } catch (_e) { all = [] }
        const s = all.find((x) => x.id === m[1])
        if (!s) return [await askSchool(uid, d)]
        Object.assign(d, { school_id: s.id, school_name: s.name })
        await save(uid, 'name', d)
        return [T('โรงเรียน: ' + s.name + ' ✓'), await askName(uid, d)]
      }
      if (pb === 'pd:sch:new' && d.school_typed) {
        Object.assign(d, { school_id: null, school_name: d.school_typed })
        await save(uid, 'name', d)
        return [T('โรงเรียน: ' + d.school_typed + ' ✓'), await askName(uid, d)]
      }
      const q = clean(text, 120)
      if (q.length < 2) return [await askSchool(uid, d)]
      const hits = await matchSchools(q)
      if (hits.length === 1) {
        Object.assign(d, { school_id: hits[0].id, school_name: hits[0].name })
        await save(uid, 'name', d)
        return [T('โรงเรียน: ' + hits[0].name + ' ✓'), await askName(uid, d)]
      }
      const typed = /^(?:โรงเรียน|รร)/.test(q) ? q.replace(/^รร\.?\s*/, 'โรงเรียน') : 'โรงเรียน' + q
      d.school_typed = typed
      await save(uid, 'school', d)
      if (!hits.length) return [T('ไม่พบ “' + q + '” ในรายชื่อโรงเรียนของร้านค่ะ\nใช้ชื่อ “' + typed + '” เลยไหมคะ? หรือพิมพ์ชื่อใหม่ได้', [qPb('ใช้ชื่อนี้', 'pd:sch:new', typed), QCANCEL])]
      return [T('เลือกโรงเรียนของคุณครูค่ะ 🏫', [...hits.slice(0, 10).map((s) => qPb(sch(s.name), 'pd:sch:' + s.id, s.name)), qPb('ไม่มีในรายการ', 'pd:sch:new', typed), QCANCEL])]
    }
    if (st.step === 'name') {
      const v = clean(text, 80).replace(/^(?:ครู|คุณครู)\s*/, '')
      if (v.length < 2) return [await askName(uid, d)]
      d.teacher_name = v
      await save(uid, 'phone', d)
      return [await askPhone(uid, d)]
    }
    if (st.step === 'phone') {
      const p = parsePhone(text)
      if (!p) return [T('เบอร์โทรไม่ถูกต้องค่ะ พิมพ์เป็นตัวเลข 10 หลัก เช่น 0812345678'), await askPhone(uid, d)]
      d.phone = p
      let prof = null
      try { prof = line.profile ? await line.profile(uid) : null } catch (_e) { prof = null }
      if (prof && prof.displayName) d.line_name = str(prof.displayName, 120)
      return afterTeacher(uid, d, prof)
    }
    if (st.step === 'pick') {
      const v = clean(text, 200)
      if (v.length >= 2) { d.project_name = v; await save(uid, 'need', d); return [askNeed(now())] }
      return [await askPick(uid)]
    }
    if (st.step === 'project') {
      const v = clean(text, 200)
      if (v.length < 2) return [askProject(d, await recentOf(uid))]
      d.project_name = v
      await save(uid, 'need', d)
      return [askNeed(now())]
    }
    if (st.step === 'need') {
      if (pb === 'pd:need' && ev.postback.params && ev.postback.params.date) { d.need_date = String(ev.postback.params.date).slice(0, 10); d.need_text = null }
      else if (pb === 'pd:need:none' || /^ยังไม่(?:กำหนด|รู้)|^ไม่(?:รีบ|ระบุ|กำหนด)/.test(text)) { d.need_date = null; d.need_text = 'ยังไม่กำหนด' }
      else if (text) { const iso = parseDate(text, now()); if (iso) { d.need_date = iso; d.need_text = null } else { d.need_date = null; d.need_text = clean(text, 80) } }
      else return [askNeed(now())]
      await save(uid, 'budget', d)
      return [T('ต้องการ: ' + (d.need_date ? thDate(d.need_date) : d.need_text) + ' ✓'), askBudget()]
    }
    if (st.step === 'budget') {
      if (pb === 'pd:budget:none' || /^ไม่(?:ระบุ|มี|ทราบ)/.test(text)) d.budget = null
      else { const v = parseMoney(text); if (v == null) return [T('พิมพ์งบประมาณเป็นตัวเลขค่ะ เช่น 15000 (หรือกด “ไม่ระบุ”)'), askBudget()]; d.budget = v }
      await save(uid, 'files', d)
      return [await askFiles(d)]
    }
    if (st.step === 'files') {
      if (pb === 'pd:done' || DONE.test(text)) return [await finish(uid, d)]
      if (/https?:\/\//.test(text)) {
        await saveLink(text, uid, d.sess, d.doc_id || null)
        const n = await filesIn(d)
        return [T('ได้รับลิงก์แล้ว ✓ (รวม ' + n + ' รายการ)\nส่งเพิ่มได้อีก หรือกด “ส่งครบแล้ว” ค่ะ', [QDONE, QCANCEL])]
      }
      return [await askFiles(d)]
    }
    return [await prompt(uid, st)]
  }

  async function handle(ev) {
    const replies = (await step(ev)).filter(Boolean)
    if (replies.length && ev.replyToken) {
      const r = await line.reply(ev.replyToken, replies.slice(0, 5))
      return r && r.status === 200 ? 'doc:ok' : 'doc:reply_failed:' + (r && r.status)
    }
    return 'doc:silent'
  }

  return { owns, handle, step }
}
