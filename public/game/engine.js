/* NATTAPRON 8-BIT AUTO SHOP — game/queue engine (pure module, no DOM/no storage).
 * Imported by the browser page AND by node:test — keep every function side-effect free.
 * Real order state changes happen ONLY through applyTransition() after a staff confirm
 * in the UI; the walking/route simulation never calls into this file's transition API. */

// ---------- statuses (durable, machine-meaningful) ----------

export const STATUSES = [
  { id: 'queued', label: 'รอคิว', chip: 'wait' },
  { id: 'preparing', label: 'เตรียมไฟล์', chip: 'work' },
  { id: 'producing', label: 'กำลังผลิต', chip: 'work' },
  { id: 'quality_check', label: 'ตรวจงาน', chip: 'work' },
  { id: 'out_to_vinyl', label: 'ส่งไปบ้านไวนิล', chip: 'vinyl' },
  { id: 'vinyl_production', label: 'ผลิตที่บ้านไวนิล', chip: 'vinyl' },
  { id: 'back_at_shop', label: 'กลับถึงร้าน', chip: 'work' },
  { id: 'ready_for_pickup', label: 'พร้อมรับ', chip: 'ready' },
  { id: 'picked_up', label: 'รับแล้ว', chip: 'done' },
  { id: 'canceled', label: 'ยกเลิก', chip: 'off' },
];

export const STATUS = Object.fromEntries(STATUSES.map((s) => [s.id, s]));

/* Which statuses a staff member may move a job to, from each status.
 * Every move needs an explicit confirm in the UI; nothing here fires on its own. */
export const TRANSITIONS = {
  queued: ['preparing', 'canceled'],
  preparing: ['producing', 'out_to_vinyl', 'canceled'],
  producing: ['quality_check', 'out_to_vinyl', 'canceled'],
  quality_check: ['ready_for_pickup', 'producing', 'out_to_vinyl', 'canceled'],
  out_to_vinyl: ['vinyl_production', 'canceled'],
  vinyl_production: ['back_at_shop', 'canceled'],
  back_at_shop: ['quality_check', 'ready_for_pickup', 'canceled'],
  ready_for_pickup: ['picked_up', 'quality_check', 'canceled'],
  picked_up: [],
  canceled: ['queued'],
};

export const VINYL_STAGES = ['out_to_vinyl', 'vinyl_production', 'back_at_shop'];
export const OPEN_END = ['picked_up', 'canceled']; // terminal-ish for queue counting

// ---------- job kinds (match the real shop's stations) ----------

export const KINDS = [
  { id: 'print', label: 'ปริ้น / ถ่ายเอกสาร', icon: '🖨️', zone: 'printer' },
  { id: 'vinyl', label: 'ไวนิล / งานป้าย', icon: '🪧', zone: 'counter' },
  { id: 'photo', label: 'อัดรูป / ถ่ายรูป', icon: '📷', zone: 'photo' },
  { id: 'frame', label: 'กรอบรูป', icon: '🖼️', zone: 'frame' },
  { id: 'sticker', label: 'สติ๊กเกอร์', icon: '🏷️', zone: 'printer' },
  { id: 'stamp', label: 'ตรายาง', icon: '🪪', zone: 'prep' },
  { id: 'design', label: 'งานออกแบบ', icon: '🎨', zone: 'prep' },
];

export const KIND = Object.fromEntries(KINDS.map((k) => [k.id, k]));

// ---------- Bangkok dates ----------

export function bkkTodayISO(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function bkkTimeHM(now = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function addDaysISO(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  return t.toISOString().slice(0, 10);
}

/* 23/11/2569 BE — the way the shop writes dates. */
export function thaiDate(iso) {
  if (!ISO_DATE.test(iso || '')) return '—';
  return `${Number(iso.slice(8))}/${Number(iso.slice(5, 7))}/${Number(iso.slice(0, 4)) + 543}`;
}

const WEEKDAYS_TH = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];

export function thaiWeekday(iso) {
  if (!ISO_DATE.test(iso || '')) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return WEEKDAYS_TH[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/* A pickup timestamp is shown exactly as recorded — Bangkok date + HH:mm. */
export function thaiDateTime(isoTs) {
  if (!isoTs) return '—';
  const t = new Date(isoTs);
  if (Number.isNaN(t.getTime())) return '—';
  return `${thaiDate(bkkTodayISO(t))} ${bkkTimeHM(t)} น.`;
}

// ---------- ids ----------

export function makeNextId(orders) {
  let max = 0;
  for (const j of orders || []) {
    const m = /^NP-(\d{4,})$/.exec(j?.id || '');
    if (m) max = Math.max(max, Number(m[1]));
  }
  return 'NP-' + String(max + 1).padStart(4, '0');
}

// ---------- orders ----------

const str = (v, n) => String(v ?? '').trim().slice(0, n);

export function newOrder(fields, { now = new Date(), orders = [] } = {}) {
  const today = bkkTodayISO(now);
  const received = ISO_DATE.test(fields.received || '') ? fields.received : today;
  const due = ISO_DATE.test(fields.due || '') ? fields.due : received;
  const qty = Number(fields.qty);
  return {
    id: makeNextId(orders),
    customer: str(fields.customer, 100),
    kind: KIND[fields.kind] ? fields.kind : 'print',
    title: str(fields.title, 200),
    qty: Number.isFinite(qty) && qty > 0 ? Math.min(99999, Math.round(qty)) : '',
    unit: str(fields.unit, 10),
    received,
    due,
    pickedAt: '',
    pickedDate: '',
    priority: fields.priority === 'urgent' ? 'urgent' : 'normal',
    note: str(fields.note, 500),
    assignee: str(fields.assignee, 50),
    status: 'queued',
    sample: fields.sample === true,
    rank: Number.isFinite(fields.rank) ? fields.rank : 0,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    history: [{ at: now.toISOString(), from: '', to: 'queued', by: str(fields.assignee, 50) }],
  };
}

export function canGo(order, to) {
  return (TRANSITIONS[order?.status] || []).includes(to);
}

export function nextActions(order) {
  return (TRANSITIONS[order?.status] || []).map((id) => STATUS[id]);
}

/* The ONLY way an order's status changes. Returns a NEW object (never mutates),
 * so the caller must store the result explicitly — an animation holding a
 * reference can't flip anything by accident. Throws on an illegal move. */
export function applyTransition(order, to, { now = new Date(), by = '' } = {}) {
  if (!canGo(order, to)) {
    const err = new Error(`ย้ายสถานะไม่ได้: ${order?.status} → ${to}`);
    err.code = 'BAD_TRANSITION';
    throw err;
  }
  const next = {
    ...order,
    status: to,
    updatedAt: now.toISOString(),
    history: [...(order.history || []), { at: now.toISOString(), from: order.status, to, by: str(by, 50) }].slice(-60),
  };
  if (to === 'picked_up') {
    next.pickedAt = now.toISOString(); // exact confirmed moment, never invented
    next.pickedDate = bkkTodayISO(now);
  }
  if (order.status === 'picked_up' && to !== 'picked_up') {
    next.pickedAt = '';
    next.pickedDate = '';
  }
  return next;
}

export function isOpen(j) {
  return !OPEN_END.includes(j.status);
}

export function isOverdue(j, todayISO) {
  return isOpen(j) && ISO_DATE.test(j.due || '') && j.due < todayISO;
}

export function statBuckets(orders) {
  const b = { wait: 0, doing: 0, done: 0 };
  for (const j of orders) {
    if (j.status === 'queued') b.wait += 1;
    else if (j.status === 'ready_for_pickup' || j.status === 'picked_up') b.done += 1;
    else if (j.status !== 'canceled') b.doing += 1;
  }
  return b;
}

// ---------- queue sorting / filtering ----------

/* mode 'smart' (default): open jobs first, urgent before normal, earliest due
 * date first, then manual rank, then id. mode 'manual': rank alone decides
 * (open jobs still before picked/canceled). */
export function sortQueue(orders, mode = 'smart') {
  const terminal = (j) => (isOpen(j) ? 0 : 1);
  return [...orders].sort((a, b) => {
    const t = terminal(a) - terminal(b);
    if (t) return t;
    if (mode === 'manual') {
      return (a.rank || 0) - (b.rank || 0) || a.id.localeCompare(b.id);
    }
    return (
      (b.priority === 'urgent') - (a.priority === 'urgent') ||
      String(a.due).localeCompare(String(b.due)) ||
      (a.rank || 0) - (b.rank || 0) ||
      a.id.localeCompare(b.id)
    );
  });
}

/* Re-number ranks 10,20,30… in the given display order, then swap the job one
 * step up/down. Returns a NEW orders array (same objects except changed ranks). */
export function moveInQueue(orders, visibleIds, id, dir) {
  const i = visibleIds.indexOf(id);
  const j = i + (dir === 'up' ? -1 : 1);
  if (i < 0 || j < 0 || j >= visibleIds.length) return orders;
  const rank = new Map(visibleIds.map((vid, idx) => [vid, (idx + 1) * 10]));
  const a = rank.get(visibleIds[i]);
  rank.set(visibleIds[i], rank.get(visibleIds[j]));
  rank.set(visibleIds[j], a);
  return orders.map((o) => (rank.has(o.id) ? { ...o, rank: rank.get(o.id) } : o));
}

export function filterQueue(orders, { q = '', filter = 'open', todayISO = '' } = {}) {
  const needle = q.trim().toLowerCase();
  return orders.filter((j) => {
    if (filter === 'open' && !isOpen(j)) return false;
    if (filter === 'urgent' && (j.priority !== 'urgent' || !isOpen(j))) return false;
    if (filter === 'vinyl' && !(j.kind === 'vinyl' || VINYL_STAGES.includes(j.status))) return false;
    if (filter === 'today' && j.due !== todayISO) return false;
    if (filter === 'overdue' && !isOverdue(j, todayISO)) return false;
    if (filter === 'ready' && j.status !== 'ready_for_pickup') return false;
    if (filter === 'done' && j.status !== 'picked_up') return false;
    if (filter === 'canceled' && j.status !== 'canceled') return false;
    if (!needle) return true;
    return `${j.id} ${j.customer} ${j.title} ${j.note || ''} ${j.assignee || ''}`.toLowerCase().includes(needle);
  });
}

// ---------- Thai quick-entry parser (prefills the form; staff reviews before save) ----------

const KIND_WORDS = [
  ['vinyl', /ไวนิล|อิงค์เจ็?ท/],
  ['sticker', /สติ๊?กเกอร์|สติกเกอร์|ฉลากสินค้า/],
  ['stamp', /ตรายาง|ปั๊?มยาง|หมึกในตัว/],
  ['photo', /อัดรูป|ถ่ายรูป|ล้างรูป|รูปด่วน|รูปติดบัตร/],
  ['frame', /กรอบรูป|ใส่กรอบ|กรอบ/],
  ['design', /ออกแบบ|ดีไซน์|อาร์ตเวิร์?ค|โลโก้/],
  ['vinyl', /งานป้าย|ป้าย/],
  ['print', /ปริ้น|พิมพ์|ถ่ายเอกสาร|เข้าเล่ม|เคลือบ|โปสเตอร์|ใบปลิว|นามบัตร|การ์ด|เกียรติบัตร/],
];

const CUSTOMER_PREFIX =
  /(?:^|[\s,])((?:โรงเรียน|ร\.ร\.|อนุบาล|วิทยาลัย|มหาวิทยาลัย|อบต\.?|เทศบาล|วัด|สพป\.?|โรงพยาบาล|รพ\.?สต\.?|บริษัท|หจก\.?|ร้าน|ครู|คุณ|พี่|ป้า(?!ย)|ลุง)\s*[^\s,]+)/;

const WEEKDAY_WORDS = [
  ['อาทิตย์', 0], ['จันทร์', 1], ['อังคาร', 2], ['พุธ', 3], ['พฤหัส', 4], ['ศุกร์', 5], ['เสาร์', 6],
];

function dueFromWeekday(todayISO, wd) {
  const [y, m, d] = todayISO.split('-').map(Number);
  const todayWd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  let diff = (wd - todayWd + 7) % 7;
  if (diff === 0) diff = 7; // "รับศุกร์" said on a Friday = next Friday
  return addDaysISO(todayISO, diff);
}

function dueFromDMY(todayISO, d, m, y) {
  let year;
  if (!y) {
    year = Number(todayISO.slice(0, 4));
    const guess = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (guess < todayISO) year += 1; // a passed date means next year
  } else if (y >= 2400) year = y - 543; // พ.ศ. 4 หลัก
  else if (y >= 2000) year = y; // ค.ศ.
  else if (y >= 100) return ''; // 3 หลัก อ่านไม่ออก
  else year = y + 2500 - 543; // "68" = พ.ศ. 2568
  const iso = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const [yy, mm, dd] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(yy, mm - 1, dd));
  if (t.getUTCFullYear() !== yy || t.getUTCMonth() !== mm - 1 || t.getUTCDate() !== dd) return '';
  return iso;
}

export function parseThaiOrder(text, { todayISO } = {}) {
  const today = ISO_DATE.test(todayISO || '') ? todayISO : bkkTodayISO();
  const src = String(text || '').replace(/\s+/g, ' ').trim();
  const out = { customer: '', kind: '', qty: '', unit: '', due: '', priority: 'normal', title: src };
  if (!src) return out;
  let rest = src;

  if (/ด่วน|เร่ง(?:ด่วน)?|รีบ/.test(rest)) {
    out.priority = 'urgent';
    rest = rest.replace(/งาน?ด่วนมาก|ด่วนมาก|งาน?ด่วน|ด่วน|เร่งด่วน|รีบมาก|รีบ/g, ' ');
  }

  for (const [id, re] of KIND_WORDS) {
    if (re.test(src)) { out.kind = id; break; }
  }

  const qm = /(\d+)\s*(ผืน|แผ่น|ใบ|อัน|ชิ้น|ชุด|เล่ม|ดวง|กรอบ|หน้า|ตัว|รูป)/.exec(rest);
  if (qm) { out.qty = Number(qm[1]); out.unit = qm[2]; }

  const cm = CUSTOMER_PREFIX.exec(rest);
  if (cm) {
    out.customer = cm[1].replace(/\s+/g, ' ').trim(); // keep exactly how staff wrote it
    rest = rest.replace(cm[0], ' ');
  }

  let due = '';
  if (/มะรืน/.test(rest)) { due = addDaysISO(today, 2); rest = rest.replace(/รับ\s*มะรืน(นี้)?|มะรืน(นี้)?/g, ' '); }
  else if (/พรุ่งนี้/.test(rest)) { due = addDaysISO(today, 1); rest = rest.replace(/รับ\s*พรุ่งนี้|พรุ่งนี้/g, ' '); }
  else if (/รับ\s*วันนี้|เอา\s*วันนี้/.test(rest)) { due = today; rest = rest.replace(/(รับ|เอา)\s*วันนี้/g, ' '); }
  if (!due) {
    const dm = /(?:รับ|นัด|ส่ง)?\s*(\d{1,2})\s*[\/\-]\s*(\d{1,2})(?:\s*[\/\-]\s*(\d{2,4}))?/.exec(rest);
    if (dm) {
      const iso = dueFromDMY(today, Number(dm[1]), Number(dm[2]), dm[3] ? Number(dm[3]) : 0);
      if (iso) { due = iso; rest = rest.replace(dm[0], ' '); }
    }
  }
  if (!due) {
    const wm = new RegExp(`(?:รับ|นัด|ส่ง)\\s*(?:วัน)?(${WEEKDAY_WORDS.map(([w]) => w).join('|')})`).exec(rest);
    if (wm) {
      due = dueFromWeekday(today, WEEKDAY_WORDS.find(([w]) => w === wm[1])[1]);
      rest = rest.replace(wm[0], ' ');
    }
  }
  out.due = due;

  const title = rest.replace(/\s+/g, ' ').replace(/^[,\s]+|[,\s]+$/g, '').trim();
  out.title = title || (out.kind ? KIND[out.kind].label : src);
  return out;
}

// ---------- demo data (clearly labeled; never presented as real jobs) ----------

export function demoOrders(now = new Date()) {
  const today = bkkTodayISO(now);
  const base = (over, extra) =>
    newOrder({ ...extra, sample: true, note: 'ข้อมูลตัวอย่างของเกม ลบได้ที่หน้าตั้งค่า' }, { now, orders: over });
  const walk = (j, steps) => steps.reduce((o, s) => applyTransition(o, s, { now, by: 'ตัวอย่าง' }), j);
  const list = [];
  list.push(walk(
    base(list, { customer: 'ตัวอย่าง • โรงเรียนอนุบาลเมืองจอด', kind: 'vinyl', title: 'ป้ายไวนิลงานกีฬาสี 3×1 ม.', qty: 2, unit: 'ผืน', received: today, due: addDaysISO(today, 1), priority: 'urgent' }),
    ['preparing', 'out_to_vinyl']));
  list.push(walk(
    base(list, { customer: 'ตัวอย่าง • คุณฝน', kind: 'print', title: 'ปริ้นรายงาน A4 เข้าเล่ม', qty: 3, unit: 'เล่ม', received: today, due: today }),
    ['preparing']));
  list.push(walk(
    base(list, { customer: 'ตัวอย่าง • วัดโพธิ์ทอง', kind: 'photo', title: 'อัดรูป 4×6 พร้อมกรอบ', qty: 12, unit: 'รูป', received: addDaysISO(today, -1), due: addDaysISO(today, 2) }),
    ['preparing', 'producing', 'quality_check', 'ready_for_pickup']));
  list.push(base(list, { customer: 'ตัวอย่าง • ร้านก๋วยเตี๋ยวป้าแดง', kind: 'stamp', title: 'ตรายางหมึกในตัว ชื่อร้าน', qty: 1, unit: 'อัน', received: today, due: addDaysISO(today, 2) }));
  return list;
}

// ---------- backup / restore ----------

export function serializeBackup(orders, now = new Date()) {
  return JSON.stringify({ app: 'nattapron-8bit', version: 4, exported: now.toISOString(), orders }, null, 2);
}

const OLD_STATUS_MAP = {
  'รอเริ่ม': 'queued',
  'เตรียมไฟล์': 'preparing',
  'กำลังผลิต': 'producing',
  'ส่งไปบ้านทำไวนิล': 'out_to_vinyl',
  'ผลิตไวนิลที่บ้าน': 'vinyl_production',
  'รับกลับร้าน': 'back_at_shop',
  'ตรวจงาน': 'quality_check',
  'พร้อมรับ': 'ready_for_pickup',
  'รับแล้ว': 'picked_up',
};

function sanitizeOne(j, { todayISO, fallbackId }) {
  if (!j || typeof j !== 'object') return null;
  const status = STATUS[j.status] ? j.status : OLD_STATUS_MAP[j.status] || 'queued';
  const qty = Number(j.qty);
  const pickedAt = typeof j.pickedAt === 'string' && !Number.isNaN(new Date(j.pickedAt).getTime()) ? j.pickedAt : '';
  /* Old prototype stored only the pickup DATE ("picked"); keep the date and leave
   * the clock time empty rather than inventing one. */
  const pickedDate = ISO_DATE.test(j.pickedDate || '') ? j.pickedDate
    : pickedAt ? bkkTodayISO(new Date(pickedAt))
    : ISO_DATE.test(j.picked || '') && status === 'picked_up' ? j.picked
    : '';
  return {
    id: str(j.id, 40) || fallbackId,
    customer: str(j.customer, 100) || 'ไม่ระบุ',
    kind: KIND[j.kind] ? j.kind : 'print',
    title: str(j.title, 200),
    qty: Number.isFinite(qty) && qty > 0 ? Math.min(99999, Math.round(qty)) : '',
    unit: str(j.unit, 10),
    received: ISO_DATE.test(j.received || '') ? j.received : todayISO,
    due: ISO_DATE.test(j.due || '') ? j.due : todayISO,
    pickedAt: status === 'picked_up' ? pickedAt : '',
    pickedDate: status === 'picked_up' ? pickedDate : '',
    priority: j.priority === 'urgent' ? 'urgent' : 'normal',
    note: str(j.note, 500),
    assignee: str(j.assignee, 50),
    status,
    sample: j.sample === true,
    rank: Number.isFinite(Number(j.rank)) ? Number(j.rank) : 0,
    createdAt: typeof j.createdAt === 'string' ? j.createdAt : '',
    updatedAt: typeof j.updatedAt === 'string' ? j.updatedAt : '',
    history: Array.isArray(j.history)
      ? j.history.slice(-60).map((h) => ({ at: str(h?.at, 40), from: str(h?.from, 24), to: str(h?.to, 24), by: str(h?.by, 50) }))
      : [],
  };
}

/* Accepts our v4 backup, a bare array, or the old prototype's v3 export. */
export function validateImport(raw, { todayISO } = {}) {
  const today = ISO_DATE.test(todayISO || '') ? todayISO : bkkTodayISO();
  let data = raw;
  if (typeof raw === 'string') {
    try { data = JSON.parse(raw); } catch { return { ok: false, error: 'ไฟล์ไม่ใช่ JSON ที่ถูกต้อง' }; }
  }
  const arr = Array.isArray(data) ? data : Array.isArray(data?.orders) ? data.orders : null;
  if (!arr) return { ok: false, error: 'ไม่พบรายการงานในไฟล์' };
  if (arr.length > 5000) return { ok: false, error: 'ไฟล์ใหญ่เกินไป (เกิน 5,000 งาน)' };
  const orders = [];
  for (let i = 0; i < arr.length; i++) {
    const s = sanitizeOne(arr[i], { todayISO: today, fallbackId: `NP-IM${String(i + 1).padStart(3, '0')}` });
    if (s) orders.push(s);
  }
  return { ok: true, orders };
}

// ---------- report ----------

export function reportData(orders, todayISO) {
  const open = orders.filter(isOpen);
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s.id, 0]));
  const byKind = Object.fromEntries(KINDS.map((k) => [k.id, 0]));
  for (const j of orders) {
    byStatus[j.status] = (byStatus[j.status] || 0) + 1;
    if (isOpen(j)) byKind[j.kind] = (byKind[j.kind] || 0) + 1;
  }
  return {
    openCount: open.length,
    dueToday: open.filter((j) => j.due === todayISO),
    overdue: open.filter((j) => isOverdue(j, todayISO)).sort((a, b) => a.due.localeCompare(b.due)),
    ready: open.filter((j) => j.status === 'ready_for_pickup'),
    pickedToday: orders.filter((j) => j.status === 'picked_up' && j.pickedDate === todayISO),
    atVinyl: open.filter((j) => VINYL_STAGES.includes(j.status)),
    byStatus,
    byKind,
  };
}

// ---------- path math for the simulation (positions only; knows nothing about orders) ----------

export function pathLength(points) {
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return sum;
}

export function pointAt(points, t) {
  if (!points.length) return [0, 0];
  if (t <= 0) return [...points[0]];
  if (t >= 1) return [...points[points.length - 1]];
  const total = pathLength(points);
  let target = t * total;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    if (target <= d) {
      const f = d === 0 ? 0 : target / d;
      return [points[i - 1][0] + (points[i][0] - points[i - 1][0]) * f, points[i - 1][1] + (points[i][1] - points[i - 1][1]) * f];
    }
    target -= d;
  }
  return [...points[points.length - 1]];
}
