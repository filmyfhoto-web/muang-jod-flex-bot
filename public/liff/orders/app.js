// หน้า "แชตและออเดอร์" — ส่วนที่คุยกับ DOM และ API
// ตรรกะคำนวณทั้งหมดอยู่ใน logic.js ที่นี่แค่ต่อ state เข้ากับหน้าจอ
// ข้อความทุกอันที่มาจากผู้ใช้/ลูกค้าใส่ด้วย textContent ไม่ใช้ innerHTML

import {
  NOT_CONNECTED_TEXT,
  TAX_NOTE,
  filterCounts,
  filterCustomers,
  FILTERS,
  blankForm,
  jobToForm,
  draftToForm,
  validateOrder,
  toCreatePayload,
  toPatchPayload,
  orderTotals,
  lineTotal,
  money,
  snapshot,
  workLabel,
  closeWarnings,
  summaryText,
  timeLabel,
  customerKeyOf,
} from './logic.js';

const DISCARD_CONFIRM = 'มีข้อมูลออเดอร์ที่ยังไม่บันทึก ต้องการเปลี่ยนไปดูลูกค้าอีกคนไหมคะ? (ข้อมูลที่แก้ไว้จะหาย)';
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ORDER_FILES = 4;

const S = {
  token: null,
  channels: [],
  chatReady: true,
  customers: [],
  loadError: '',
  selKey: null,
  selName: '',
  filter: 'all',
  query: '',
  messages: [],
  dir: 'in',
  pendingImage: null,
  busyChat: false,
  orders: [],
  job: null,
  form: null,
  saved: null,
  draftRef: null,
  files: [],
  busyOrder: false,
  orderMsg: null,
  view: 'list',
};

const $ = (id) => document.getElementById(id);

/* ---------- ตัวช่วยสร้าง DOM ---------- */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'text') node.textContent = String(v);
    else if (k === 'class') node.className = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) node.addEventListener(ev, fn);
    else if (k === 'attrs') for (const [a, av] of Object.entries(v)) node.setAttribute(a, av);
    else if (k in node && typeof v !== 'string') node[k] = v;
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

function setStatus(node, kind, text) {
  node.className = `status-line ${kind || ''}`;
  node.textContent = text || '';
}

/* ---------- เครือข่าย ---------- */
const ERR_BY_STATUS = {
  401: 'เซสชันหมดอายุ ลองปิดแล้วเปิดหน้านี้ใหม่ค่ะ',
  403: 'บัญชีนี้ไม่มีสิทธิ์ใช้หน้านี้ค่ะ',
  503: 'ระบบยังไม่พร้อมค่ะ ลองใหม่ภายหลัง',
};

async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch('/api' + path, {
      method,
      headers: {
        Authorization: 'Bearer ' + S.token,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    const err = new Error('เชื่อมต่อไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่ ข้อมูลยังอยู่ในช่องค่ะ');
    err.network = true;
    throw err;
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) {
    const err = new Error(data.message || ERR_BY_STATUS[res.status] || 'ระบบขัดข้องชั่วคราว ยังไม่ได้บันทึก ลองอีกครั้งค่ะ');
    err.status = res.status;
    err.code = data.error;
    throw err;
  }
  return data;
}

function newRef() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID().replace(/-/g, '');
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}

function todayISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
}

/* ---------- โหลดข้อมูล ---------- */
async function refreshCustomers() {
  const data = await api('/chat/customers');
  S.channels = data.channels || [];
  S.chatReady = data.chatReady !== false;
  // ลูกค้าที่เพิ่งเริ่มแชตแต่ยังไม่มีข้อความ ยังไม่อยู่บนเซิร์ฟเวอร์ — เก็บไว้ไม่ให้หายจากรายชื่อ
  const serverKeys = new Set((data.customers || []).map((c) => c.key));
  const temps = S.customers.filter((c) => c.temp && !serverKeys.has(c.key));
  S.customers = [...(data.customers || []), ...temps];
  S.loadError = '';
}

async function refreshOrders() {
  if (!S.selKey) return;
  const { jobs } = await api(`/chat/orders?key=${encodeURIComponent(S.selKey)}`);
  S.orders = jobs || [];
}

async function openOrder(id) {
  const { job } = await api(`/jobs/${encodeURIComponent(id)}`);
  S.job = job;
  S.form = jobToForm(job);
  S.saved = snapshot(S.form);
  S.draftRef = null;
  S.files = [];
}

function newOrder(name) {
  S.job = null;
  S.form = blankForm({ customerName: name, jobDate: todayISO() });
  S.saved = snapshot(S.form);
  S.draftRef = newRef();
  S.files = [];
}

// S.saved เก็บเป็นข้อความ snapshot อยู่แล้ว จึงเทียบกับ snapshot ของฟอร์มตรง ๆ
// (ห้ามส่งเข้า isDirty ซึ่งจะ stringify ซ้ำและเทียบไม่มีวันเท่ากัน)
function hasUnsaved() {
  return Boolean(S.form && S.saved !== null && snapshot(S.form) !== S.saved);
}

/* ---------- เลือกลูกค้า ---------- */
async function selectCustomer(key) {
  const c = S.customers.find((x) => x.key === key);
  if (!c) return;
  if (key !== S.selKey && hasUnsaved() && !confirm(DISCARD_CONFIRM)) return;

  S.selKey = key;
  S.selName = c.name;
  S.messages = [];
  S.orders = [];
  S.pendingImage = null;
  S.dir = 'in';
  S.orderMsg = null;
  S.form = null;
  S.saved = null;
  S.loadError = '';
  if (window.matchMedia('(max-width: 1023px)').matches) setView('chat');
  renderAll();

  try {
    const [{ messages }, { jobs }] = await Promise.all([
      api(`/chat/messages?key=${encodeURIComponent(key)}`),
      api(`/chat/orders?key=${encodeURIComponent(key)}`),
    ]);
    if (S.selKey !== key) return; // เปลี่ยนลูกค้าไปแล้วระหว่างรอ
    S.messages = messages;
    S.orders = jobs;
    const open = jobs.find((j) => j.status === 'active');
    if (open) await openOrder(open.id);
    else newOrder(c.name);

    if (c.unread > 0) {
      await api('/chat/read', { method: 'POST', body: { customerKey: key } });
      c.unread = 0;
    }
  } catch (err) {
    if (S.selKey !== key) return;
    S.loadError = err.message;
    if (!S.form) newOrder(c.name);
  }
  renderAll();
}

/* ---------- เริ่มแชตลูกค้าใหม่ ---------- */
function startNewCustomer() {
  const input = $('newName');
  const name = input.value.trim();
  if (!name) {
    input.focus();
    return;
  }
  const key = customerKeyOf(name);
  if (!key) return;
  if (!S.customers.some((c) => c.key === key)) {
    S.customers.unshift({
      key, name, orgName: null, jobCount: 0, openJobs: 0, balanceDue: 0, unread: 0, lastMessage: null, lastAt: '', temp: true,
    });
  }
  input.value = '';
  selectCustomer(key);
}

/* ---------- ห้องแชต ---------- */
async function sendChat() {
  if (S.busyChat || !S.selKey) return;
  const text = $('msgText').value.trim();
  if (!text && !S.pendingImage) return;

  S.busyChat = true;
  $('sendBtn').disabled = true;
  setStatus($('sendStatus'), '', 'กำลังบันทึก…');
  try {
    const payload = { customerName: S.selName, direction: S.dir, body: text };
    if (S.pendingImage) payload.image = S.pendingImage;
    const { message } = await api('/chat/messages', { method: 'POST', body: payload });
    S.messages.push(message);
    $('msgText').value = '';
    S.pendingImage = null;
    $('imgInput').value = '';
    const c = S.customers.find((x) => x.key === S.selKey);
    if (c) c.temp = false;
    setStatus(
      $('sendStatus'),
      'ok',
      S.dir === 'out' ? 'บันทึกการตอบแล้ว · ' + NOT_CONNECTED_TEXT : 'บันทึกข้อความลูกค้าแล้ว'
    );
    renderThread();
    renderPendingImage();
    await refreshCustomers();
    renderList();
    renderChips();
  } catch (err) {
    setStatus($('sendStatus'), 'err', `บันทึกไม่สำเร็จ ข้อความยังอยู่ในช่อง — ${err.message}`);
  } finally {
    S.busyChat = false;
    $('sendBtn').disabled = false;
  }
}

function readImage(file) {
  return new Promise((resolve, reject) => {
    if (!['image/jpeg', 'image/png'].includes(file.type)) return reject(new Error('แนบได้เฉพาะรูป JPG หรือ PNG ค่ะ'));
    if (file.size > MAX_FILE_BYTES) return reject(new Error('รูปใหญ่เกิน 5 MB ค่ะ'));
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่ได้ ลองเลือกใหม่อีกครั้งค่ะ'));
    reader.readAsDataURL(file);
  });
}

function renderPendingImage() {
  const box = $('pendingImg');
  box.replaceChildren();
  if (!S.pendingImage) return;
  box.append(
    el('div', { class: 'attach-chip' }, '🖼️ รูปพร้อมบันทึก',
      el('button', { type: 'button', 'aria-label': 'เอารูปออก', on: { click: () => { S.pendingImage = null; $('imgInput').value = ''; renderPendingImage(); } } }, '✕'))
  );
}

/* ---------- สร้างรายการจากแชต (ร้านต้องตรวจก่อนบันทึกเสมอ) ---------- */
async function draftFromMessage(text) {
  if (!text || !text.trim()) {
    S.orderMsg = { kind: 'warn', text: 'ยังไม่มีข้อความลูกค้าให้ดึงรายการ — วางข้อความที่ลูกค้าพิมพ์มาในแชตก่อนค่ะ' };
    renderOrderPanel();
    return;
  }
  if (hasUnsaved() && !confirm('ฟอร์มออเดอร์มีข้อมูลที่ยังไม่บันทึก ต้องการแทนที่ด้วยรายการจากข้อความนี้ไหมคะ?')) return;
  try {
    const { draft, more } = await api('/parse', { method: 'POST', body: { text } });
    S.job = null;
    S.form = draftToForm(draft, { customerName: S.selName });
    // ตั้งให้เป็นฉบับที่ยังไม่บันทึก เพื่อให้ปุ่มเตือนและยืนยันทำงานถูกต้อง
    S.saved = snapshot(blankForm({ customerName: S.selName }));
    S.draftRef = newRef();
    S.files = [];
    S.orderMsg = {
      kind: 'warn',
      text:
        'ดึงรายการจากแชตแล้ว กรุณาตรวจชื่อ จำนวน และราคาก่อนกดบันทึก' +
        (more > 0 ? ` · ข้อความนี้มีอีก ${more} งาน ให้บันทึกทีละใบค่ะ` : ''),
    };
    if (window.matchMedia('(max-width: 1023px)').matches) setView('order');
    renderOrderPanel();
  } catch (err) {
    setStatus($('sendStatus'), 'err', `สร้างรายการไม่สำเร็จ — ${err.message}`);
  }
}

/* ---------- ใบสั่งงาน ---------- */
async function saveOrder() {
  if (S.busyOrder || !S.form) return;
  const errors = validateOrder(S.form);
  if (errors.length) {
    S.orderMsg = { kind: 'err', list: errors };
    renderOrderPanel();
    return;
  }
  S.busyOrder = true;
  S.orderMsg = null;
  renderOrderFoot();
  try {
    let job;
    if (!S.job) {
      const payload = toCreatePayload(S.form, { clientRef: S.draftRef });
      if (S.files.length) payload.images = S.files;
      const res = await api('/jobs', { method: 'POST', body: payload });
      job = res.job;
      const notes = [];
      if (res.duplicate) notes.push('ออเดอร์นี้เคยบันทึกไปแล้ว จึงแสดงใบเดิมให้ค่ะ');
      if (res.attachmentsFailed > 0) notes.push(`แนบรูปไม่สำเร็จ ${res.attachmentsFailed} รูป`);
      if (res.orderFieldsSaved === false) notes.push('ยังไม่ได้บันทึกเบอร์ / วิธีรับ / ผู้รับผิดชอบ — ต้องรัน migration 022 ก่อน');
      S.orderMsg = notes.length
        ? { kind: 'warn', text: notes.join(' · ') }
        : { kind: 'ok', text: `บันทึกออเดอร์ ${job.job_number || ''} แล้วค่ะ` };
      S.draftRef = null;
    } else {
      const res = await api(`/jobs/${encodeURIComponent(S.job.id)}`, { method: 'PATCH', body: toPatchPayload(S.form) });
      job = res.job;
      S.orderMsg = { kind: 'ok', text: 'บันทึกการแก้ไขแล้วค่ะ' };
    }
    S.job = job;
    S.form = jobToForm(job);
    S.saved = snapshot(S.form);
    S.files = [];
    await refreshOrders();
    await refreshCustomers();
    renderList();
    renderChips();
  } catch (err) {
    S.orderMsg = { kind: 'err', text: `${err.message} — ข้อมูลยังอยู่ในฟอร์ม กดบันทึกอีกครั้งได้เลยค่ะ` };
  } finally {
    S.busyOrder = false;
    renderOrderPanel();
  }
}

async function reloadJob() {
  if (!S.job) return;
  const { job } = await api(`/jobs/${encodeURIComponent(S.job.id)}`);
  S.job = job;
}

async function statusChange(body) {
  if (!S.job || S.busyOrder) return;
  S.busyOrder = true;
  renderOrderFoot();
  try {
    await api(`/jobs/${encodeURIComponent(S.job.id)}/status`, { method: 'POST', body });
    await reloadJob();
    await refreshOrders();
    await refreshCustomers();
    renderList();
    S.orderMsg = { kind: 'ok', text: 'อัปเดตสถานะแล้วค่ะ' };
  } catch (err) {
    S.orderMsg = { kind: 'err', text: `อัปเดตสถานะไม่สำเร็จ — ${err.message}` };
  } finally {
    S.busyOrder = false;
    renderOrderPanel();
  }
}

async function markDelivered(toDeliver) {
  if (!S.job) return;
  if (toDeliver) {
    const warnings = closeWarnings({ delivered: true, balanceDue: S.job.balance_due });
    const money_ = warnings.filter((w) => w.startsWith('ยังมียอด'));
    if (money_.length && !confirm(`${money_.join(' · ')}\nยืนยันส่งมอบงานนี้ไหมคะ?`)) return;
  }
  await statusChange({ picked: toDeliver });
}

async function recordPayment(amount, method) {
  if (!S.job || S.busyOrder) return;
  const value = Number(amount);
  if (!(value > 0)) {
    S.orderMsg = { kind: 'err', text: 'กรุณาพิมพ์จำนวนเงินที่รับมาให้มากกว่า 0 ค่ะ' };
    renderOrderPanel();
    return;
  }
  S.busyOrder = true;
  renderOrderFoot();
  try {
    await api(`/jobs/${encodeURIComponent(S.job.id)}/payments`, { method: 'POST', body: { amount: value, method } });
    await reloadJob();
    await refreshOrders();
    await refreshCustomers();
    renderList();
    S.orderMsg = { kind: 'ok', text: `บันทึกรับเงิน ${money(value)} บาทแล้วค่ะ` };
  } catch (err) {
    S.orderMsg = { kind: 'err', text: `บันทึกรับเงินไม่สำเร็จ — ${err.message}` };
  } finally {
    S.busyOrder = false;
    renderOrderPanel();
  }
}

function copySummary() {
  const text = summaryText(S.form, { jobNumber: S.job?.job_number || null });
  const done = () => {
    S.orderMsg = { kind: 'warn', text: 'คัดลอกสรุปแล้วค่ะ — ' + NOT_CONNECTED_TEXT + ' นำไปวางส่งในแชตของร้านเองได้เลย' };
    renderOrderPanel();
  };
  const fail = () => {
    S.orderMsg = { kind: 'err', text: 'คัดลอกไม่ได้ในเบราว์เซอร์นี้ ลองเลือกข้อความด้วยตัวเองค่ะ' };
    renderOrderPanel();
  };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, fail);
  else fail();
}

/* ---------- การแสดงผล ---------- */
function setView(view) {
  S.view = view;
  $('app').dataset.view = view;
  for (const b of document.querySelectorAll('.tabs [data-tab]')) {
    b.setAttribute('aria-selected', String(b.dataset.tab === view));
  }
}

function renderChips() {
  const counts = filterCounts(S.customers);
  const box = $('chips');
  box.replaceChildren(
    ...FILTERS.map((f) =>
      el('button', {
        type: 'button',
        class: 'chip',
        'aria-pressed': String(S.filter === f.id),
        on: { click: () => { S.filter = f.id; renderChips(); renderList(); } },
      }, f.label, el('b', {}, String(counts[f.id] ?? 0)))
    )
  );
}

function renderList() {
  const list = $('list');
  if (!S.customers.length && !S.loadError) {
    list.replaceChildren(el('div', { class: 'state' }, el('b', {}, 'ยังไม่มีลูกค้า'), 'พิมพ์ชื่อลูกค้าด้านบนเพื่อเริ่มแชตได้เลยค่ะ'));
    return;
  }
  const rows = filterCustomers(S.customers, { filter: S.filter, query: S.query });
  if (!rows.length) {
    list.replaceChildren(el('div', { class: 'state' }, el('b', {}, 'ไม่พบลูกค้าที่ตรงกับตัวกรอง'), 'ลองเปลี่ยนคำค้นหรือตัวกรองค่ะ'));
    return;
  }
  list.replaceChildren(
    ...rows.map((c) => {
      const preview = c.lastMessage
        ? (c.lastMessage.direction === 'out' ? 'ร้าน: ' : '') + (c.lastMessage.body || (c.lastMessage.hasImage ? '📷 รูปภาพ' : ''))
        : 'ยังไม่มีข้อความ';
      return el(
        'button',
        {
          type: 'button',
          class: 'row',
          'aria-selected': String(c.key === S.selKey),
          on: { click: () => selectCustomer(c.key) },
        },
        el('div', { class: 'avatar', text: [...c.name][0] || '?' }),
        el('div', { class: 'row-main' },
          el('div', { class: 'row-top' },
            el('span', { class: 'row-name', text: c.name }),
            el('span', { class: 'row-time', text: timeLabel(c.lastAt) })),
          c.orgName ? el('div', { class: 'row-org', text: '🏫 ' + c.orgName }) : null,
          el('div', { class: 'row-prev', text: preview }),
          el('div', { style: 'display:flex;gap:4px;margin-top:4px;' },
            c.unread > 0 ? el('span', { class: 'badge', text: String(c.unread) }) : null,
            c.openJobs > 0 ? el('span', { class: 'badge soft', text: `กำลังสั่ง ${c.openJobs}` }) : null)),
      );
    })
  );
  if (S.loadError && !S.customers.length) {
    list.replaceChildren(el('div', { class: 'state' }, el('b', {}, 'โหลดรายชื่อไม่สำเร็จ'), S.loadError));
  }
}

function renderChatHead() {
  const head = $('chatHead');
  const c = S.customers.find((x) => x.key === S.selKey);
  if (!c) {
    head.replaceChildren(el('div', { class: 'who' }, el('b', { text: 'ยังไม่ได้เลือกลูกค้า' }), el('span', { text: 'เลือกจากรายชื่อทางซ้าย หรือเริ่มแชตลูกค้าใหม่' })));
    $('chatNotice').replaceChildren();
    return;
  }
  head.replaceChildren(
    el('div', { class: 'avatar', text: [...c.name][0] || '?' }),
    el('div', { class: 'who' },
      el('b', { text: c.name }),
      el('span', { text: c.orgName ? `🏫 ${c.orgName}` : 'ลูกค้าทั่วไป' })),
    el('button', {
      type: 'button',
      class: 'btn small ghost',
      on: { click: () => draftFromMessage(lastInbound()?.body || '') },
      title: 'สร้างรายการจากข้อความล่าสุดของลูกค้า แล้วตรวจก่อนบันทึก',
    }, 'สร้างรายการจากแชต'),
  );
  const notes = [];
  if (!S.chatReady) notes.push('ยังไม่ได้รัน migration 022 — ข้อความที่พิมพ์ตอนนี้จะยังไม่ถูกเก็บ');
  notes.push(NOT_CONNECTED_TEXT);
  $('chatNotice').replaceChildren(el('div', { class: 'notice', text: notes.join(' · ') }));
}

function lastInbound() {
  for (let i = S.messages.length - 1; i >= 0; i--) if (S.messages[i].direction === 'in') return S.messages[i];
  return null;
}

function renderThread() {
  const box = $('thread');
  if (!S.selKey) {
    box.replaceChildren(el('div', { class: 'empty' }, el('b', { text: 'ยังไม่ได้เลือกแชต' }), 'เลือกลูกค้าจากรายชื่อเพื่อดูข้อความ'));
    return;
  }
  if (S.loadError && !S.messages.length) {
    box.replaceChildren(el('div', { class: 'empty' }, el('b', { text: 'โหลดข้อความไม่สำเร็จ' }), S.loadError));
    return;
  }
  if (!S.messages.length) {
    box.replaceChildren(el('div', { class: 'empty' }, el('b', { text: 'ยังไม่มีข้อความ' }), 'วางข้อความที่ลูกค้าพิมพ์มาด้านล่างได้เลยค่ะ'));
    return;
  }
  box.replaceChildren(
    ...S.messages.map((m) => {
      const isOut = m.direction === 'out';
      const bubble = el('div', { class: 'bubble' }, m.body || null,
        m.file_url ? el('a', { href: m.file_url, target: '_blank', rel: 'noopener' }, el('img', { src: m.file_url, alt: 'รูปในแชต' })) : null);
      const meta = el('div', { class: 'meta' }, timeLabel(m.created_at),
        isOut
          ? el('span', { text: 'บันทึกไว้ · ยังไม่ได้ส่งถึงลูกค้า' })
          : el('button', { type: 'button', on: { click: () => draftFromMessage(m.body || '') } }, 'สร้างรายการจากข้อความนี้'));
      return el('div', { class: `msg ${isOut ? 'out' : 'in'}` }, bubble, meta);
    })
  );
  box.scrollTop = box.scrollHeight;
}

function renderComposer() {
  $('composer').hidden = !S.selKey;
  $('dirIn').setAttribute('aria-pressed', String(S.dir === 'in'));
  $('dirOut').setAttribute('aria-pressed', String(S.dir === 'out'));
  $('sendBtn').textContent = S.dir === 'out' ? 'บันทึกการตอบ' : 'บันทึกข้อความ';
  renderPendingImage();
}

function renderAll() {
  renderChips();
  renderList();
  renderChatHead();
  renderThread();
  renderComposer();
  renderOrderPanel();
}

/* ---------- คอลัมน์ขวา ---------- */
function renderOrderPanel() {
  const pick = $('orderPick');
  pick.hidden = !S.selKey;
  if (S.selKey) {
    const sel = $('orderSelect');
    const options = [el('option', { value: 'new', text: '+ ออเดอร์ใหม่' })];
    for (const j of S.orders) {
      options.push(el('option', { value: j.id, text: `${j.job_number || 'งาน'} · ${workLabel(j)}` }));
    }
    sel.replaceChildren(...options);
    sel.value = S.job ? S.job.id : 'new';
  }
  renderOrderBody();
  renderOrderFoot();
  $('dirtyBadge').hidden = !hasUnsaved();
}

function renderOrderBody() {
  const body = $('orderBody');
  if (!S.selKey) {
    body.replaceChildren(el('div', { class: 'empty' }, el('b', { text: 'ยังไม่ได้เลือกลูกค้า' }), 'เลือกลูกค้าเพื่อดูหรือสร้างใบสั่งงานค่ะ'));
    return;
  }
  if (!S.form) {
    body.replaceChildren(el('div', { class: 'state' }, 'กำลังโหลดใบสั่งงาน…'));
    return;
  }
  const f = S.form;
  const isNew = !S.job;

  const input = (value, onInput, props = {}) =>
    el('input', { value: value ?? '', on: { input: (e) => onInput(e.target.value) }, ...props });

  const customer = el('div', { class: 'field-grid' },
    el('label', { class: 'field full' }, el('span', { text: 'ชื่อลูกค้า' }),
      input(f.customerName, (v) => { f.customerName = v; updateDerived(); }, { maxLength: 200 })),
    el('label', { class: 'field' }, el('span', { text: 'เบอร์โทร (ไม่บังคับ)' }),
      input(f.customerPhone, (v) => { f.customerPhone = v; updateDerived(); }, { maxLength: 30, inputMode: 'tel' })),
    el('div', { class: 'field' }, el('span', { text: 'หน่วยงาน' }),
      el('div', { class: 'hint', style: 'padding-top:8px;', text: S.customers.find((c) => c.key === S.selKey)?.orgName || 'ไม่ได้ผูกหน่วยงาน' })),
  );

  const dateField = (label, value, onInput) =>
    el('label', { class: 'field' }, el('span', { text: label }),
      el('input', { type: 'date', value: value || '', on: { input: (e) => { onInput(e.target.value); updateDerived(); } } }));

  const radios = el('div', { class: 'radio-row', role: 'radiogroup', 'aria-label': 'วิธีรับ' },
    ...[['pickup', 'รับเองที่ร้าน'], ['delivery', 'จัดส่ง']].map(([val, label]) =>
      el('label', {},
        el('input', { type: 'radio', name: 'fulfillment', value: val, checked: f.fulfillment === val, on: { change: () => { f.fulfillment = val; updateDerived(); } } }),
        label)));

  const meta = el('div', { class: 'field-grid' },
    el('div', { class: 'field' }, el('span', { text: 'เลขออเดอร์' }),
      el('div', { class: 'hint', style: 'padding-top:8px;font-weight:600;color:var(--ink);', text: f.jobNumber || 'ยังไม่บันทึก' })),
    dateField('วันที่สั่ง', f.jobDate, (v) => { f.jobDate = v; }),
    dateField('กำหนดรับ / ส่งงาน', f.dueDate, (v) => { f.dueDate = v; }),
    el('label', { class: 'field' }, el('span', { text: 'ผู้รับผิดชอบ' }),
      input(f.handlerName, (v) => { f.handlerName = v; updateDerived(); }, { maxLength: 100 })),
    el('div', { class: 'field full' }, el('span', { text: 'วิธีรับหรือจัดส่ง' }), radios),
  );

  const rows = f.items.map((it, idx) => {
    const qty = el('input', { class: 'qty', type: 'number', min: '0', step: 'any', value: it.quantity ?? '', inputMode: 'decimal',
      on: { input: (e) => { it.quantity = e.target.value === '' ? 0 : Number(e.target.value); updateDerived(); } }, 'aria-label': `จำนวนรายการที่ ${idx + 1}` });
    const price = el('input', { class: 'price', type: 'number', min: '0', step: 'any', value: it.unit_price ?? '', inputMode: 'decimal',
      on: { input: (e) => { it.unit_price = e.target.value === '' ? 0 : Number(e.target.value); updateDerived(); } }, 'aria-label': `ราคาต่อหน่วยรายการที่ ${idx + 1}` });
    const unit = el('input', { class: 'unit', type: 'text', maxLength: 50, value: it.unit || '',
      on: { input: (e) => { it.unit = e.target.value; } }, 'aria-label': `หน่วยรายการที่ ${idx + 1}` });
    const name = el('input', { type: 'text', maxLength: 200, value: it.item_name || '', placeholder: 'ชื่อรายการ',
      on: { input: (e) => { it.item_name = e.target.value; } }, 'aria-label': `ชื่อรายการที่ ${idx + 1}` });
    const lt = el('td', { class: 'lt', 'data-lt': '' }, money(lineTotal(it.quantity, it.unit_price)));
    return el('tr', {},
      el('td', {}, name),
      el('td', {}, qty),
      el('td', {}, unit),
      el('td', {}, price),
      lt,
      el('td', {}, el('button', { type: 'button', class: 'del', 'aria-label': `ลบรายการที่ ${idx + 1}`,
        on: { click: () => { if (f.items.length > 1) f.items.splice(idx, 1); else f.items[0] = { item_name: '', size: '', quantity: 1, unit: '', unit_price: 0 }; renderOrderBody(); updateDerived(); } } }, '🗑')));
  });
  const itemsTable = el('div', { class: 'items-wrap' },
    el('table', { class: 'items' },
      el('thead', {}, el('tr', {}, el('th', {}, 'รายการ'), el('th', {}, 'จำนวน'), el('th', {}, 'หน่วย'), el('th', {}, 'ราคา/หน่วย'), el('th', { class: 'num' }, 'รวม'), el('th', {}, ''))),
      el('tbody', {}, ...rows)));

  const items = el('div', {},
    el('div', { class: 'section-title' }, el('span', { text: 'รายการสินค้า / งาน' }),
      el('button', { type: 'button', class: 'btn small ghost', on: { click: () => { f.items.push({ item_name: '', size: '', quantity: 1, unit: '', unit_price: 0 }); renderOrderBody(); updateDerived(); } } }, '+ เพิ่มรายการ')),
    itemsTable);

  const note = el('label', { class: 'field' }, el('span', { text: 'หมายเหตุ / รายละเอียดงาน' }),
    el('textarea', { maxLength: 500, value: '', on: { input: (e) => { f.note = e.target.value; updateDerived(); } } }, ''));
  note.querySelector('textarea').value = f.note || '';

  const attach = isNew
    ? el('div', {},
        el('div', { class: 'section-title' }, el('span', { text: 'ไฟล์แนบ (สลิป / ใบสั่งงาน)' })),
        el('div', { class: 'fileline' },
          el('label', { class: 'btn small ghost', style: 'display:inline-flex;align-items:center;cursor:pointer;' }, 'แนบรูป',
            el('input', { type: 'file', accept: 'image/jpeg,image/png', multiple: true, hidden: true, on: { change: (e) => addOrderFiles(e.target) } })),
          ...S.files.map((_, i) => el('span', { class: 'attach-chip' }, `รูปที่ ${i + 1}`,
            el('button', { type: 'button', 'aria-label': `เอารูปที่ ${i + 1} ออก`, on: { click: () => { S.files.splice(i, 1); renderOrderBody(); } } }, '✕')))),
        el('div', { class: 'hint', text: 'แนบสลิปแล้วไม่ได้เปลี่ยนสถานะการชำระเงินให้อัตโนมัติ ต้องรับเงินเองในส่วนชำระเงิน' }))
    : el('div', { class: 'hint', text: 'ไฟล์แนบของงานที่บันทึกแล้วดูได้จากรายการเดิม (เพิ่มภายหลังยังไม่รองรับในหน้านี้)' });

  const totals = el('div', { class: 'totals' },
    el('div', { class: 'row-line' }, el('span', { text: 'รวมเป็นเงิน' }), el('span', { 'data-sub': '' }, '')),
    el('div', { class: 'row-line' }, el('span', { text: 'ยอดที่เก็บลูกค้า' }),
      el('input', { type: 'number', min: '0', step: 'any', inputMode: 'decimal', value: f.customerTotal ?? '', placeholder: 'เท่ากับยอดรวม',
        'aria-label': 'ยอดที่เก็บลูกค้า', on: { input: (e) => { f.customerTotal = e.target.value; updateDerived(); } } })),
    el('div', { class: 'row-line' }, el('span', { text: 'ส่วนลด / ปัดของร้าน' }), el('span', { 'data-adj': '' }, '')),
    el('div', { class: 'row-line big' }, el('span', { text: 'ยอดสุทธิ (ยังไม่รวมภาษี)' }), el('span', { 'data-total': '' }, '')),
    el('div', { class: 'tax', text: TAX_NOTE }));

  const sections = [
    el('div', {}, el('div', { class: 'section-title', text: 'ลูกค้า' }), customer),
    el('div', {}, el('div', { class: 'section-title', text: 'ข้อมูลออเดอร์' }), meta),
    items,
    el('div', {}, note),
    attach,
    el('div', {}, el('div', { class: 'section-title', text: 'ยอดเงิน' }), totals),
  ];

  if (!isNew) sections.push(statusSection(), paymentSection());

  body.replaceChildren(...sections);
  updateDerived();
}

function orderMsgNode() {
  const m = S.orderMsg;
  if (!m) return null;
  if (m.list) return el('div', { class: 'errors' }, ...m.list.map((t) => el('div', { text: '• ' + t })));
  const cls = m.kind === 'ok' ? 'ok-box' : m.kind === 'err' ? 'errors' : 'warn-box';
  return el('div', { class: cls, text: m.text, role: m.kind === 'err' ? 'alert' : 'status' });
}

// อัปเดตตัวเลขที่คำนวณได้โดยไม่ต้องวาดฟอร์มใหม่ (กันเคอร์เซอร์หลุดตอนพิมพ์)
function updateDerived() {
  if (!S.form) return;
  const t = orderTotals(S.form.items, S.form.customerTotal);
  const body = $('orderBody');
  const set = (sel, value) => { const n = body.querySelector(sel); if (n) n.textContent = value; };
  set('[data-sub]', money(t.subtotal) + ' บาท');
  set('[data-adj]', (t.adjust === 0 ? '0.00' : (t.adjust > 0 ? '+' : '') + money(t.adjust)) + ' บาท');
  set('[data-total]', money(t.total) + ' บาท');
  body.querySelectorAll('[data-lt]').forEach((node, i) => {
    const it = S.form.items[i];
    if (it) node.textContent = money(lineTotal(it.quantity, it.unit_price));
  });
  $('dirtyBadge').hidden = !hasUnsaved();
  renderOrderFoot();
}

async function addOrderFiles(input) {
  const picked = [...(input.files || [])];
  input.value = '';
  for (const file of picked) {
    if (S.files.length >= MAX_ORDER_FILES) {
      S.orderMsg = { kind: 'err', text: `แนบได้สูงสุด ${MAX_ORDER_FILES} รูปค่ะ` };
      break;
    }
    try {
      S.files.push(await readImage(file));
    } catch (err) {
      S.orderMsg = { kind: 'err', text: err.message };
      break;
    }
  }
  renderOrderBody();
}

function statusSection() {
  const j = S.job;
  const done = Boolean(j.done_at || j.picked_up_at);
  const picked = Boolean(j.picked_up_at);
  return el('div', {},
    el('div', { class: 'section-title' }, el('span', { text: 'สถานะงาน' }), el('span', { class: 'hint', style: 'font-weight:500;', text: workLabel(j) })),
    el('div', { class: 'pillset' },
      el('button', { type: 'button', class: 'pill ok', 'aria-pressed': String(done), disabled: S.busyOrder,
        on: { click: () => statusChange({ done: !done }) } }, done ? '✓ ทำเสร็จแล้ว' : 'ทำเสร็จแล้ว'),
      el('button', { type: 'button', class: 'pill ok', 'aria-pressed': String(picked), disabled: S.busyOrder || (!done && !picked),
        on: { click: () => markDelivered(!picked) } }, picked ? '✓ ส่งมอบแล้ว' : 'ส่งมอบแล้ว')),
    el('div', { class: 'hint', text: 'ส่งมอบแล้วจะเตือนก่อนถ้ายังมียอดค้าง' }));
}

function paymentSection() {
  const j = S.job;
  const balance = Number(j.balance_due) || 0;
  // ปุ่มที่กดค้างอยู่ = สถานะเงินปัจจุบัน (ตรงกับ jobStatus ฝั่งเซิร์ฟเวอร์)
  let current = 'unpaid';
  if (Number(j.total) > 0 && balance <= 0) current = j.pay_method === 'transfer' ? 'transfer' : 'cash';
  else if (j.booked_at) current = 'account';
  else if (Number(j.paid_amount) > 0) current = 'partial';
  const choices = [['cash', 'เงินสด'], ['transfer', 'โอน'], ['account', 'ลงบัญชี'], ['unpaid', 'ยังไม่ได้รับ']];
  let amountInput = null;
  let methodSel = null;
  const payBtn = el('button', { type: 'button', class: 'btn small', disabled: S.busyOrder || balance <= 0,
    on: { click: () => recordPayment(amountInput.value, methodSel.value) } }, 'รับเงิน');
  amountInput = el('input', { type: 'number', min: '0', step: 'any', inputMode: 'decimal', placeholder: 'จำนวนที่รับ', 'aria-label': 'จำนวนเงินที่รับ', disabled: balance <= 0 });
  methodSel = el('select', { 'aria-label': 'วิธีรับเงิน', disabled: balance <= 0 },
    el('option', { value: 'cash', text: 'เงินสด' }), el('option', { value: 'transfer', text: 'โอน' }));
  return el('div', {},
    el('div', { class: 'section-title' }, el('span', { text: 'สถานะการชำระเงิน' }),
      el('span', { class: 'hint', style: 'font-weight:500;', text: `รับแล้ว ${money(j.paid_amount)} · ค้าง ${money(balance)} บาท` })),
    el('div', { class: 'pillset' }, ...choices.map(([val, label]) =>
      el('button', { type: 'button', class: 'pill', 'aria-pressed': String(current === val), disabled: S.busyOrder,
        on: { click: () => statusChange({ money: val }) } }, label))),
    el('div', { class: 'pay-line', style: 'margin-top:8px;' }, amountInput, methodSel, payBtn),
    el('div', { class: 'hint', text: 'แนบสลิปอย่างเดียวไม่ได้เปลี่ยนเป็นชำระครบ ต้องกดรับเงินหรือเลือกวิธีชำระเอง' }));
}

function renderOrderFoot() {
  const foot = $('orderFoot');
  if (!S.selKey || !S.form) {
    foot.hidden = true;
    return;
  }
  foot.hidden = false;
  const saveBtn = el('button', { type: 'button', class: 'btn', disabled: S.busyOrder, on: { click: saveOrder } },
    S.busyOrder ? 'กำลังบันทึก…' : 'บันทึกออเดอร์');
  const sendBtn = el('button', { type: 'button', class: 'btn ghost', disabled: S.busyOrder, on: { click: copySummary } }, 'ส่งสรุปให้ลูกค้า');
  // ข้อความผลการกระทำอยู่ที่ท้ายแผง ใกล้ปุ่มที่เพิ่งกด — วาดครั้งเดียวต่อการเรนเดอร์
  const msg = orderMsgNode();
  foot.replaceChildren(
    ...(msg ? [msg] : []),
    el('div', { class: 'foot-actions' }, saveBtn, sendBtn),
    el('div', { class: 'foot-note', text: 'ส่งสรุปยังไม่ได้เชื่อมต่อถึงลูกค้า — ระบบคัดลอกข้อความให้ไปวางส่งเองได้' }),
  );
}

/* ---------- เริ่มต้น ---------- */
function bindEvents() {
  $('search').addEventListener('input', (e) => { S.query = e.target.value; renderList(); });
  $('newBtn').addEventListener('click', startNewCustomer);
  $('newName').addEventListener('keydown', (e) => { if (e.key === 'Enter') startNewCustomer(); });
  $('dirIn').addEventListener('click', () => { S.dir = 'in'; renderComposer(); });
  $('dirOut').addEventListener('click', () => { S.dir = 'out'; renderComposer(); });
  $('sendBtn').addEventListener('click', sendChat);
  $('msgText').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendChat(); }
  });
  $('imgInput').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      S.pendingImage = await readImage(file);
      renderPendingImage();
    } catch (err) {
      setStatus($('sendStatus'), 'err', err.message);
      e.target.value = '';
    }
  });
  $('orderSelect').addEventListener('change', async (e) => {
    const value = e.target.value;
    if (hasUnsaved() && !confirm('มีข้อมูลที่ยังไม่บันทึก ต้องการเปลี่ยนออเดอร์ไหมคะ?')) {
      e.target.value = S.job ? S.job.id : 'new';
      return;
    }
    try {
      if (value === 'new') newOrder(S.selName);
      else await openOrder(value);
      S.orderMsg = null;
    } catch (err) {
      S.orderMsg = { kind: 'err', text: err.message };
    }
    renderOrderPanel();
  });
  for (const b of document.querySelectorAll('.tabs [data-tab]')) {
    b.addEventListener('click', () => setView(b.dataset.tab));
  }
  window.addEventListener('beforeunload', (e) => {
    if (hasUnsaved()) { e.preventDefault(); e.returnValue = ''; }
  });
}

async function boot() {
  bindEvents();
  renderAll();
  $('list').replaceChildren(el('div', { class: 'skeleton' }), el('div', { class: 'skeleton' }), el('div', { class: 'skeleton' }));
  try {
    const cfg = await (await fetch('/api/config')).json();
    if (!cfg.enabled || !cfg.liffId) throw new Error('ยังไม่ได้ตั้งค่า LIFF ของระบบ — ติดต่อผู้ดูแลค่ะ');
    await liff.init({ liffId: cfg.liffId });
    if (!liff.isLoggedIn()) return liff.login({ redirectUri: location.href });
    S.token = liff.getAccessToken();
    await refreshCustomers();
    renderAll();
  } catch (err) {
    S.loadError = err.message || 'เปิดหน้าไม่สำเร็จ';
    $('list').replaceChildren(el('div', { class: 'state' }, el('b', {}, 'เปิดหน้าไม่สำเร็จ'), S.loadError, el('div', { style: 'margin-top:10px;' },
      el('button', { type: 'button', class: 'btn small ghost', on: { click: () => location.reload() } }, 'ลองใหม่'))));
  }
}

boot();
