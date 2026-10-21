
const str = (v, n) => String(v == null ? '' : v).slice(0, n)
const money = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })

export const ASK_RECEIPT = 'ขอใบสั่งซื้อ'
export const ASK_CONFIRM = 'ขอการ์ดยืนยัน'
export function chatUrl(basicId, text) {
  const b = String(basicId || '').trim()
  if (!b) return ''
  return 'https://line.me/R/oaMessage/' + encodeURIComponent(b.startsWith('@') ? b : '@' + b) + '/?' + encodeURIComponent(String(text == null ? '' : text))
}
const ASK_RE = /^(?:📩|📋)?\s*(?:ขอ|ดู|รับ)?\s*(ใบสั่งซื้อ|ใบรับออเดอร์|การ์ดยืนยัน(?:จากร้าน)?|การ์ดยืนยันออเดอร์)\s*(?:เลขที่)?\s*:?\s*N\s*T\s*-?\s*(\d{2,6})\s*(?:ค่ะ|คะ|ครับ|นะคะ|นะครับ|จ้า|จ้ะ|ค่า)?\s*[.!🙏]*\s*$/i
export function parseCardAsk(text) {
  const raw = String(text == null ? '' : text)
  const om = raw.length <= 3000 ? ORDER_RE.exec(raw.trim().split('\n')[0].replace(/\s+/g, ' ').trim()) : null
  if (om) return { kind: 'order', no: 'NT-' + (om[1].length < 4 ? om[1].padStart(4, '0') : om[1]) }
  const t = raw.replace(/\s+/g, ' ').trim()
  if (!t || t.length > 80) return null
  const m = ASK_RE.exec(t)
  if (!m) return null
  return { kind: /การ์ดยืนยัน/.test(m[1]) ? 'confirm' : 'receipt', no: 'NT-' + (m[2].length < 4 ? m[2].padStart(4, '0') : m[2]) }
}
export function withTag(prev, key, tag) {
  const parts = String(prev == null ? '' : prev).split(/\s+/).filter(Boolean)
  const i = parts.findIndex((x) => x.startsWith(key + ':'))
  if (i >= 0) parts[i] = tag
  else parts.push(tag)
  return parts.join(' ')
}

export function kidsOf(lines, o) {
  const out = new Map()
  const sets = (lines || []).filter((l) => l && l.set && !l.grade)
  if (!sets.length) return out
  const grades = (o && o.grades) || {}
  const text = String((o && o.studentsText) || '')
  const re = /([อปม])\.?\s*(\d)(?:\s*(?:-|–|~|ถึง)\s*(?:[อปม]\.?)?\s*(\d))?(?:\s*\/\s*\d{1,2})?[^\d,·]{0,12}?(\d{1,4})\s*คน/g
  const segs = []
  let m
  while ((m = re.exec(text))) { const n = Number(m[4]); if (n >= 1 && n <= 5000) segs.push({ g: bandGrades(m[1] + '.' + m[2] + (m[3] ? '-' + m[1] + '.' + m[3] : '')), n }) }
  const all = (text.match(/\d{1,4}(?=\s*คน)/g) || []).map(Number).filter((n) => n >= 1 && n <= 5000)
  for (const l of sets) {
    const gs = setGrades(l.band, l.name)
    let n = gs.reduce((s, g) => s + (Number(grades[g]) || 0), 0)
    if (!n && segs.length) n = segs.filter((s) => s.g.some((g) => gs.includes(g))).reduce((s, x) => s + x.n, 0)
    if (!n && sets.length === 1) n = o && Number(o.students) > 0 ? Number(o.students) : all.reduce((s, x) => s + x, 0)
    if (n > 0 && n <= 5000) out.set(l, n)
  }
  return out
}

const unitOf = (l) => Math.round((Number(l.price) || 0) / (Number(l.qty) || 1) * 100) / 100

export function setTitle(name) {
  const t = String(name == null ? '' : name)
  const m = /^\s*(?:ชุด|เซ็ท|เซท|เซต|set)\s*(?:ที่)?\s*(\d{1,2})(?!\d)/i.exec(t)
  return m ? 'ชุดที่ ' + Number(m[1]) : (str(t, 120) || 'ชุดอุปกรณ์')
}

export function setGrades(band, name) {
  const g = bandGrades(band)
  if (g.length) return g
  const rest = String(name == null ? '' : name).replace(/^\s*(?:ชุด|เซ็ท|เซท|เซต|set)\s*(?:ที่)?\s*\d{1,2}/i, '').replace(/·\s*ชั้น.*$/, '')
  const m = /[อปม]\.?\s*\d(?:\s*(?:-|–|~|ถึง)\s*(?:[อปม]\.?)?\s*\d)?/.exec(rest)
  return m ? bandGrades(m[0]) : (/อนุบาล/.test(rest) ? bandGrades('อนุบาล') : [])
}

const setName = (l, grades) => { const all = l.grade ? [l.grade] : setGrades(l.band, l.name), mine = all.filter((g) => grades && grades[g]), g = (mine.length ? mine : all).join(' / '); return setTitle(l.name) + (g ? ' (ชั้น ' + g + ')' : '') }

export const ORDER_HEAD = 'ส่งออเดอร์'

const ORDER_RE = /^(?:📦\s*)?ส่งออเดอร์\s*(?:เลขที่)?\s*:?\s*N\s*T\s*-?\s*(\d{2,6})(?!\d)/i

export function orderChatText(o) {
  const hide = !!o.hideTotal
  const L = ['📦 ' + ORDER_HEAD + ' ' + o.no]
  if (o.school) L.push('โรงเรียน: ' + str(o.school, 80))
  if (o.orderer) L.push('ผู้สั่ง: ' + str(o.orderer, 60) + (o.phone ? ' · ' + str(o.phone, 20) : ''))
  if (o.students) L.push('นักเรียน: ' + money(o.students) + ' คน')
  else if (o.studentsText) L.push('นักเรียน: ' + str(o.studentsText, 80))
  const g = gradeLine(o.grades)
  if (g) L.push(str(g, 120))
  const ls = o.lines || []
  const kids = kidsOf(ls, o)
  ls.slice(0, 8).forEach((l) => L.push(str(custLine(l, hide, o.grades, kids), 70)))
  if (ls.length > 8) L.push('…และอีก ' + (ls.length - 8) + ' รายการ')
  if (!hide && !kids.size) L.push('รวม ฿' + money(o.total))
  return str(L.join('\n'), 600)
}
export function orderView(od, shop, note) {
  const sp = splitStudents(str(od && od.project, 300))
  const sg = splitGrades(sp.project)
  return {
    no: od.order_no, total: od.total, lines: setLines(od.items, od.bands), note: str(note, 300),
    hideTotal: !!(shop && shop.line_hide_total === true) && !!(od.school_id || od.school), // ร้านเลือกซ่อนยอดของออเดอร์โรงเรียน
    orderer: str(od.orderer_name, 100), school: str(od.school || od.org, 120),
    students: sp.students, studentsText: sp.studentsText || '', grades: sg.grades, project: str(sg.project, 120),
  }
}

export function splitStudents(project) {
  const t = String(project == null ? '' : project)
  const m = /^\s*นักเรียน\s+(\d{1,4})\s+คน(?:\s*·\s*|\s*$)/.exec(t)
  if (!m) {
    const f = /^\s*นักเรียน\s*:\s*([^·]*?)\s*(?:·\s*|$)/.exec(t)
    if (f && f[1].trim()) return { students: null, studentsText: str(f[1].trim(), 160), project: t.slice(f[0].length).trim() }
    return { students: null, project: t }
  }
  const n = Number(m[1])
  if (!(n >= 1 && n <= 5000)) return { students: null, project: t }
  return { students: n, project: t.slice(m[0].length).trim() }
}

const gradeLine = (g) => { const k = GRADES.filter((x) => g && g[x]); return k.length ? 'แบ่งชั้น: ' + k.map((x) => x + ' ' + money(g[x]) + ' คน').join(' / ') : '' }
const isAdj = (it) => !it.product_id && /^ปรับราคาชุด/.test(String(it.name || ''))
export function gradeOf(name) {
  const m = /·\s*ชั้น\s+([อปม]\.\d)\s*$/.exec(String(name == null ? '' : name))
  return m && GRADES.includes(m[1]) ? m[1] : ''
}
export function setLines(items, bands) {
  const out = []
  const grp = new Map()
  for (const it of items || []) {
    if (!it || !(Number(it.qty) > 0)) continue
    if (it.set_grp != null && it.set_id) {
      let g = grp.get(it.set_grp)
      if (!g) {
        const q = Number(it.set_qty) || 1
        g = { name: str(it.set_name, 120) || 'ชุดอุปกรณ์', qty: q, price: Math.round((Number(it.set_unit) || 0) * q * 100) / 100, real: 0, set: true, band: str((bands || {})[it.set_id], 60), grade: gradeOf(it.set_name) }
        grp.set(it.set_grp, g)
        out.push(g)
      }
      if (!isAdj(it)) g.real += Number(it.line_total) || 0
      continue
    }
    if (isAdj(it)) continue
    out.push({ name: str(it.name, 120) || 'สินค้า', qty: Number(it.qty) })
  }
  out.forEach((l) => { if (l.set) l.real = Math.round(l.real * 100) / 100 })
  return out
}
function setSub(l, grades) {
  if (!l.set) return ''
  if (l.grade) return 'ชั้น ' + l.grade + ' · ' + money(l.qty) + ' คน'
  const all = setGrades(l.band, l.name)
  const mine = all.filter((g) => grades && grades[g])
  if (mine.length) return 'ชั้น ' + mine.map((g) => g + ' ' + money(grades[g]) + ' คน').join(' / ')
  return all.length ? 'ชั้น ' + all.join(' / ') : ''
}
function custRows(lines, grades, hide, kids) {
  return lines.map((l) => {
    const sub = setSub(l, grades)
    const n = kids && kids.get(l)
    if (n) {
      const u = !hide ? unitOf(l) : 0
      const row2 = [
        ...(sub ? [{ type: 'text', text: sub, size: 'xs', color: '#E2572B', wrap: true, flex: 5 }] : []),
        ...(u > 0 ? [{ type: 'text', text: 'ชุดละ ฿' + money(u), size: 'xs', color: '#12335F', weight: 'bold', align: 'end', flex: sub ? 0 : 1 }] : []),
      ]
      return { type: 'box', layout: 'vertical', spacing: 'xs', contents: [
        { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
          { type: 'text', text: setTitle(l.name), size: 'sm', color: '#333333', wrap: true, flex: 5, weight: 'bold' },
          { type: 'text', text: money(n) + ' คน', size: 'sm', color: '#12335F', weight: 'bold', align: 'end', flex: 0 },
        ] },
        ...(row2.length ? [{ type: 'box', layout: 'horizontal', spacing: 'sm', contents: row2 }] : []),
      ] }
    }
    const top = {
      type: 'box', layout: 'horizontal', spacing: 'sm',
      contents: [
        { type: 'text', text: (l.set ? setTitle(l.name) : str(l.name, 120)) || '-', size: 'sm', color: '#333333', wrap: true, flex: 5, weight: l.set ? 'bold' : 'regular' },
        { type: 'text', text: '× ' + money(l.qty) + (l.set ? ' ชุด' : ''), size: 'sm', color: '#666666', align: 'end', flex: 0 },
        ...(!hide && l.set && l.price > 0 ? [{ type: 'text', text: '฿' + money(l.price), size: 'sm', color: '#12335F', weight: 'bold', align: 'end', flex: 0 }] : []),
      ],
    }
    return sub ? { type: 'box', layout: 'vertical', spacing: 'xs', contents: [top, { type: 'text', text: sub, size: 'xs', color: '#E2572B', wrap: true }] } : top
  })
}
const custLine = (l, hide, grades, kids) => {
  const n = kids && kids.get(l)
  if (n) return '• ' + setName(l, grades) + ' · ' + money(n) + ' คน' + (!hide && unitOf(l) > 0 ? ' · ชุดละ ฿' + money(unitOf(l)) : '')
  return '• ' + (l.set ? setName(l, grades) : l.name) + ' × ' + money(l.qty) + (l.set ? ' ชุด' + (!hide && l.price > 0 ? ' ฿' + money(l.price) : '') : '')
}
const totalBox = (o) => [
  { type: 'separator' },
  {
    type: 'box', layout: 'horizontal',
    contents: [
      { type: 'text', text: 'รวมทั้งสิ้น', weight: 'bold', size: 'md', flex: 1 },
      { type: 'text', text: '฿' + money(o.total), weight: 'bold', size: 'lg', color: '#12335F', align: 'end', flex: 0 },
    ],
  },
]

export function customerMessages(o) {
  const lines = (o.lines || []).slice(0, 14)
  const more = (o.lines || []).length - lines.length
  const meta = []
  if (o.orderer) meta.push('ผู้สั่ง: ' + o.orderer)
  if (o.school) meta.push('โรงเรียน: ' + o.school)
  if (o.students) meta.push('จำนวนนักเรียน: ' + money(o.students) + ' คน')
  else if (o.studentsText) meta.push('จำนวนนักเรียน: ' + o.studentsText)
  if (gradeLine(o.grades)) meta.push(gradeLine(o.grades))
  if (o.project) meta.push('หมายเหตุ: ' + o.project)
  const hide = !!o.hideTotal
  const kids = kidsOf(o.lines, o)
  const noTotal = hide || kids.size > 0 // โชว์จำนวนนักเรียน + ราคาชุดละ แล้ว → ไม่โชว์ยอดรวม (กันครูเข้าใจว่าเป็นยอดของทั้งห้อง)
  const rows = custRows(lines, o.grades, hide, kids)
  if (more > 0) rows.push({ type: 'text', text: 'และอีก ' + more + ' รายการ', size: 'xs', color: '#888888' })
  const flex = {
    type: 'flex',
    altText: str('ได้รับคำสั่งซื้อ ' + o.no + ' แล้ว' + (noTotal ? '' : ' ยอดรวม ฿' + money(o.total)), 380),
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#12335F', paddingAll: '16px',
        contents: [
          { type: 'text', text: 'ได้รับคำสั่งซื้อแล้ว', color: '#FFFFFF', weight: 'bold', size: 'lg' },
          { type: 'text', text: 'NATTA GROUP', color: '#F4C542', size: 'xs', margin: 'xs' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '16px',
        contents: [
          { type: 'text', text: 'เลขที่ ' + o.no, weight: 'bold', size: 'md', wrap: true },
          ...meta.map((t) => ({ type: 'text', text: str(t, 200), size: 'sm', color: '#555555', wrap: true })),
          { type: 'separator' },
          ...rows,
          ...(noTotal ? [] : totalBox(o)),
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '14px', spacing: 'md',
        contents: [
          { type: 'text', text: 'ร้านจะติดต่อกลับทาง LINE หรือโทรศัพท์เพื่อยืนยันรายการ · ชำระเงินหลังร้านยืนยัน', size: 'xs', color: '#888888', wrap: true },
          ...(o.pull ? [{ type: 'button', style: 'secondary', height: 'sm', action: { type: 'message', label: 'ดูการ์ดยืนยันจากร้าน', text: ASK_CONFIRM + ' ' + o.no } }] : []),
        ],
      },
    },
  }
  const text = {
    type: 'text',
    text: str(
      'ได้รับคำสั่งซื้อแล้ว ✓\nเลขที่ ' + o.no + '\n' + meta.join('\n') + (meta.length ? '\n' : '') +
      (o.lines || []).slice(0, 20).map((l) => custLine(l, hide, o.grades, kids)).join('\n') +
      (noTotal ? '' : '\nรวมทั้งสิ้น ฿' + money(o.total)) + '\nร้านจะติดต่อกลับเพื่อยืนยันรายการ ชำระเงินหลังร้านยืนยัน' +
      (o.pull ? '\nดูการ์ดยืนยันจากร้าน: พิมพ์ "' + ASK_CONFIRM + ' ' + o.no + '"' : ''),
      4800,
    ),
  }
  return { flex, text }
}

export function confirmMessages(o) {
  const lines = (o.lines || []).slice(0, 14)
  const more = (o.lines || []).length - lines.length
  const meta = []
  if (o.orderer) meta.push('ผู้สั่ง: ' + o.orderer)
  if (o.school) meta.push('โรงเรียน: ' + o.school)
  if (o.students) meta.push('จำนวนนักเรียน: ' + money(o.students) + ' คน')
  else if (o.studentsText) meta.push('จำนวนนักเรียน: ' + o.studentsText)
  if (gradeLine(o.grades)) meta.push(gradeLine(o.grades))
  if (o.project) meta.push('โครงการ: ' + o.project)
  const hide = !!o.hideTotal
  const kids = kidsOf(o.lines, o)
  const noTotal = hide || kids.size > 0 // โชว์จำนวนนักเรียน + ราคาชุดละ แล้ว → ไม่โชว์ยอดรวม (กันครูเข้าใจว่าเป็นยอดของทั้งห้อง)
  const rows = custRows(lines, o.grades, hide, kids)
  if (more > 0) rows.push({ type: 'text', text: 'และอีก ' + more + ' รายการ', size: 'xs', color: '#888888' })
  const foot = 'ขอบคุณที่สั่งซื้อกับ NATTA GROUP · หากมีข้อสงสัยติดต่อร้านได้ทาง LINE นี้'
  const note = str(o.note, 300).trim()
  const noteBox = note ? [{ type: 'box', layout: 'vertical', backgroundColor: '#FFF6E5', cornerRadius: '10px', paddingAll: '10px', spacing: 'xs', contents: [
    { type: 'text', text: 'ข้อความจากร้าน', size: 'xs', color: '#7A4B00', weight: 'bold' },
    { type: 'text', text: note, size: 'sm', color: '#3D2A00', wrap: true },
  ] }] : []
  const flex = {
    type: 'flex',
    altText: str('ร้านยืนยันออเดอร์ ' + o.no + ' แล้ว' + (noTotal ? '' : ' ยอดรวม ฿' + money(o.total)), 380),
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#12335F', paddingAll: '16px',
        contents: [
          { type: 'text', text: 'ร้านยืนยันออเดอร์แล้ว ✓', color: '#FFFFFF', weight: 'bold', size: 'lg' },
          { type: 'text', text: 'NATTA GROUP', color: '#F4C542', size: 'xs', margin: 'xs' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '16px',
        contents: [
          { type: 'text', text: 'เลขที่ ' + o.no, weight: 'bold', size: 'md', wrap: true },
          ...meta.map((t) => ({ type: 'text', text: str(t, 200), size: 'sm', color: '#555555', wrap: true })),
          ...noteBox,
          { type: 'separator' },
          ...rows,
          ...(noTotal ? [] : totalBox(o)),
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '14px',
        contents: [{ type: 'text', text: foot, size: 'xs', color: '#888888', wrap: true }],
      },
    },
  }
  const text = {
    type: 'text',
    text: str(
      'ร้านยืนยันออเดอร์แล้ว ✓\nเลขที่ ' + o.no + '\n' + meta.join('\n') + (meta.length ? '\n' : '') +
      (note ? 'ข้อความจากร้าน: ' + note + '\n' : '') +
      (o.lines || []).slice(0, 20).map((l) => custLine(l, hide, o.grades, kids)).join('\n') +
      (noTotal ? '' : '\nรวมทั้งสิ้น ฿' + money(o.total)) + '\n' + foot,
      4800,
    ),
  }
  return { flex, text }
}

export function withConfirmTag(prev, tag) {
  return String(prev == null ? '' : prev).split(/\s+/).filter((x) => x && !x.startsWith('k:')).concat(tag).join(' ')
}

export function splitGrades(project) {
  const t = String(project == null ? '' : project)
  const m = /^\s*แบ่งชั้น\s+([^·]*?)\s*(?:·\s*|$)/.exec(t)
  if (!m) return { grades: {}, project: t }
  const grades = {}
  const re = /([อปม])\.(\d)\s*[:=]?\s*(\d{1,4})/g
  let g
  while ((g = re.exec(m[1]))) { const k = g[1] + '.' + g[2], n = Number(g[3]); if (n >= 1 && n <= 5000 && GRADES.includes(k)) grades[k] = (grades[k] || 0) + n }
  return { grades, project: t.slice(m[0].length).trim() }
}
const BAND_GRADES = { 'อนุบาล': ['อ.1', 'อ.2', 'อ.3'], 'ประถมต้น': ['ป.1', 'ป.2', 'ป.3'], 'ประถมปลาย': ['ป.4', 'ป.5', 'ป.6'], 'มัธยมต้น': ['ม.1', 'ม.2', 'ม.3'], 'มัธยมปลาย': ['ม.4', 'ม.5', 'ม.6'] }
export function bandGrades(gb) {
  const t = String(gb == null ? '' : gb).replace(/\s+/g, '')
  if (!t) return []
  for (const k of Object.keys(BAND_GRADES)) if (t.startsWith(k)) return BAND_GRADES[k].slice()
  const m = /^([อปม])\.?(\d)(?:(?:-|–|~|ถึง)([อปม])?\.?(\d))?/.exec(t)
  if (!m) return []
  const p = m[1], a = Number(m[2]), b = m[4] ? Number(m[4]) : a
  if (m[3] && m[3] !== p) return []
  const out = []
  for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (GRADES.includes(p + '.' + i)) out.push(p + '.' + i)
  return out
}
export const GRADES = ['อ.1', 'อ.2', 'อ.3', 'ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6', 'ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6']
