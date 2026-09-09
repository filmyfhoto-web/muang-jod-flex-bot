/* ม่วงจดให้ — หน้าบันทึกงาน
 *
 * ฟอร์มพิมพ์ได้จริง การ์ดสรุปด้านบนอัปเดตตามที่พิมพ์ทันที กด "บันทึกงาน"
 * แล้วส่งขึ้น POST /api/jobs ด้วยโทเคนของ LIFF (งานจึงไปอยู่ในบัญชีคนที่เปิด
 * หน้านี้ ไม่ปนกับคนอื่น) เปิดนอก LINE ได้เหมือนกัน แต่จะเป็นโหมดทดลอง —
 * เก็บลงเครื่องอย่างเดียว ไม่ขึ้นเซิร์ฟเวอร์
 */

/* ---------------------------------------------------------------- helpers */

const $ = (sel, root = document) => root.querySelector(sel);
const baht = (n) => '฿' + (Number(n) || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const todayISO = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());

function toast(text, kind) {
  const el = $('#toast');
  el.textContent = text;
  el.className = 'toast on' + (kind ? ' ' + kind : '');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.className = 'toast'), 3000);
}

/* ------------------------------------------------------- ราคาต่อตารางเมตร */

/* กติกาเดียวกับที่บอทใช้ตอนอ่านข้อความ (src/utils/area.js) — แก้ที่ไหน
 * ต้องแก้อีกที่ด้วย เทสต์ tests/jotForm.test.js คุมไว้ว่าเลข 20 ต้องตรงกัน:
 * ขนาดที่ไม่ใส่หน่วย ถ้าตัวเลขตั้งแต่ 20 ขึ้นไปคือเซนติเมตร ต่ำกว่านั้นคือเมตร */
const CM_THRESHOLD = 20;
const UNIT_FACTORS = { cm: 0.01, m: 1, inch: 0.0254, ft: 0.3048 };
const UNIT_LABELS = { cm: 'ซม.', m: 'ม.', inch: 'นิ้ว', ft: 'ฟุต' };

const UNIT_RE = '(?:เซนติเมตร|ซ\\.?ม\\.?|cm|นิ้ว|inch|"|ฟุต|ft|เมตร|ม\\.?|m)';
const SIZE_RE = new RegExp(
  `(\\d+(?:\\.\\d+)?)\\s*(${UNIT_RE})?\\s*[x×X*✕]\\s*(\\d+(?:\\.\\d+)?)\\s*(${UNIT_RE})?`,
  'i'
);

function classifyUnit(token) {
  if (!token) return null;
  const t = String(token).toLowerCase().replace(/[.\s]/g, '');
  if (t === 'ซม' || t === 'เซนติเมตร' || t === 'cm') return 'cm';
  if (t === 'ม' || t === 'เมตร' || t === 'm') return 'm';
  if (t === 'นิ้ว' || t === 'inch' || t === '"') return 'inch';
  if (t === 'ฟุต' || t === 'ft') return 'ft';
  return null;
}

// อ่านขนาดจากช่อง "รายละเอียด" คืนพื้นที่ต่อชิ้นเป็นตารางเมตร
function readSize(text) {
  const m = SIZE_RE.exec(String(text || ''));
  if (!m) return null;
  const width = num(m[1]);
  const height = num(m[3]);
  if (!(width > 0) || !(height > 0)) return null;
  const unit =
    classifyUnit(m[2]) ||
    classifyUnit(m[4]) ||
    (width < CM_THRESHOLD && height < CM_THRESHOLD ? 'm' : 'cm');
  const f = UNIT_FACTORS[unit];
  return {
    width,
    height,
    unit,
    sqm: round2(width * f * (height * f)),
    label: `${width}x${height} ${UNIT_LABELS[unit]}`,
  };
}

/* -------------------------------------------------------------- โครงข้อมูล */

/* หนึ่งรายการ = หนึ่งการ์ดในฟอร์ม
 *   { id, name, detail, price, qty, rate, total, totalManual, image }
 * price  — ราคาต่อชิ้น (ถ้ากรอก "ตรมละ" และมีขนาด จะคำนวณให้)
 * total  — ราคา × จำนวน จนกว่าจะพิมพ์ทับเอง (totalManual = true)
 * image  — data URL ของรูปที่ย่อแล้ว หรือ null
 */
const DRAFT_KEY = 'muangjod.jot.draft.v1';
let seq = 0;

const state = {
  customer: '',
  date: todayISO(),
  paid: 0,
  note: '',
  items: [],
};

function blankItem() {
  seq += 1;
  return { id: 'it' + seq, name: '', detail: '', price: 0, qty: 1, rate: 0, total: 0, totalManual: false, image: null };
}

// ยอดของรายการหนึ่ง: พื้นที่ × เรต ถ้าคิดเป็นตารางเมตร ไม่งั้นราคา × จำนวน
function computeItem(item) {
  const size = item.rate > 0 ? readSize(item.detail) : null;
  const qty = item.qty > 0 ? item.qty : 1;
  const price = size ? round2(size.sqm * item.rate) : item.price;
  const total = item.totalManual ? item.total : round2(price * qty);
  return { size, qty, price, total };
}

const grandTotal = () => round2(state.items.reduce((s, it) => s + computeItem(it).total, 0));

/* ------------------------------------------------------------------ ร่าง */

function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
  } catch {
    // เต็มหรือถูกปิดไว้ — ลองใหม่โดยไม่เอารูปไปด้วย รูปเป็นของที่ใหญ่ที่สุด
    try {
      const light = { ...state, items: state.items.map((it) => ({ ...it, image: null })) };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(light));
    } catch {
      /* เก็บไม่ได้ก็ไม่เป็นไร ฟอร์มยังใช้ได้ปกติ */
    }
  }
}

function loadDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (!saved || !Array.isArray(saved.items) || !saved.items.length) return false;
    Object.assign(state, saved);
    state.items = saved.items.map((it) => ({ ...blankItem(), ...it }));
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------- รูป */

/* ย่อรูปในเครื่องก่อนส่ง: รูปจากกล้องมือถือ 4–8 MB ส่งดิบ ๆ ช้าและเปลืองเน็ต
 * ของคนใช้ ย่อด้านยาวเหลือ 1280 px แล้วบีบเป็น JPEG ได้ราว 200–400 KB */
const MAX_EDGE = 1280;

function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('ไฟล์นี้ไม่ใช่รูปภาพ'));
      img.onload = () => {
        const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ------------------------------------------------------------------ ฟอร์ม */

const itemsBox = $('#items');

function renderItems() {
  itemsBox.textContent = '';
  state.items.forEach((item, i) => itemsBox.appendChild(itemCard(item, i)));
  renderDots();
  renderSummary();
  saveDraft();
}

/* จุดใต้การ์ด: บอกว่ามีกี่รายการและอยู่ใบไหน กดกระโดดไปใบนั้นได้
 * ใบเดียวไม่ต้องมีจุด เพราะไม่มีอะไรให้เลื่อนไป */
function renderDots() {
  const dots = $('#dots');
  dots.textContent = '';
  if (state.items.length < 2) return;

  state.items.forEach((item, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.role = 'tab';
    b.setAttribute('aria-label', 'รายการที่ ' + (i + 1));
    b.setAttribute('aria-selected', String(i === currentCard()));
    b.onclick = () => scrollToCard(i);
    dots.appendChild(b);
  });
}

// การ์ดใบที่อยู่กลางจอตอนนี้
function currentCard() {
  const cards = [...itemsBox.children];
  if (cards.length < 2) return 0;
  const middle = itemsBox.scrollLeft + itemsBox.clientWidth / 2;
  let best = 0;
  let bestGap = Infinity;
  cards.forEach((card, i) => {
    const gap = Math.abs(card.offsetLeft + card.offsetWidth / 2 - middle);
    if (gap < bestGap) {
      bestGap = gap;
      best = i;
    }
  });
  return best;
}

function scrollToCard(index) {
  const card = itemsBox.children[index];
  if (card) itemsBox.scrollTo({ left: card.offsetLeft - itemsBox.offsetLeft, behavior: 'smooth' });
}

// อัปเดตจุดตอนปัด — rAF กันไม่ให้คำนวณทุกพิกเซลที่เลื่อน
let dotTick = false;
itemsBox.addEventListener('scroll', () => {
  if (dotTick) return;
  dotTick = true;
  requestAnimationFrame(() => {
    dotTick = false;
    const active = currentCard();
    [...$('#dots').children].forEach((dot, i) => dot.setAttribute('aria-selected', String(i === active)));
  });
});

function itemCard(item, index) {
  const el = $('#tpl-item').content.firstElementChild.cloneNode(true);
  const name = $('.i-name', el);
  const detail = $('.i-detail', el);
  const price = $('.i-price', el);
  const qty = $('.i-qty', el);
  const rate = $('.i-rate', el);
  const total = $('.i-total', el);
  const hint = $('.area-hint', el);
  const file = $('.i-file', el);
  const preview = $('.preview', el);

  // ใบแรกใช้พาดหัวชวนกรอกตามแบบ ใบถัด ๆ ไปบอกว่าเป็นรายการที่เท่าไหร่
  $('.item-title', el).textContent = index === 0 ? 'กรอกข้อมูลงานได้เลย' : 'รายการที่ ' + (index + 1);
  $('.del', el).hidden = state.items.length < 2;
  $('.act-save', el).onclick = save;
  $('.act-add', el).onclick = addItem;

  name.value = item.name;
  detail.value = item.detail;
  qty.value = item.qty || '';
  rate.value = item.rate || '';

  // ช่องที่ระบบคิดให้ ใส่ค่าไว้เลยและกันไม่ให้พิมพ์ทับ จะได้ไม่ขัดกันเอง
  function paint() {
    const { size, price: p, total: t } = computeItem(item);

    price.value = p || '';
    price.readOnly = Boolean(size);
    price.classList.toggle('auto', Boolean(size));

    total.value = item.totalManual ? item.total || '' : t || '';
    total.classList.toggle('auto', !item.totalManual);

    if (size) {
      hint.hidden = false;
      hint.textContent =
        `${size.label} = ${size.sqm} ตร.ม. × ${item.rate} = ${baht(round2(size.sqm * item.rate))} ต่อผืน`;
    } else if (item.rate > 0) {
      hint.hidden = false;
      hint.textContent = 'ใส่ขนาดในช่องรายละเอียด เช่น 160x300 แล้วม่วงจดจะคิดพื้นที่ให้ค่ะ';
    } else {
      hint.hidden = true;
    }

    renderSummary();
    saveDraft();
  }

  name.oninput = () => { item.name = name.value; paint(); };
  detail.oninput = () => { item.detail = detail.value; paint(); };
  qty.oninput = () => { item.qty = num(qty.value); paint(); };
  rate.oninput = () => { item.rate = num(rate.value); paint(); };
  price.oninput = () => { item.price = num(price.value); paint(); };
  total.oninput = () => {
    // พิมพ์ยอดรวมเองเมื่อไหร่ ให้ยอดนั้นชนะการคำนวณ ล้างช่องแล้วกลับมาคิดเอง
    item.totalManual = total.value.trim() !== '';
    item.total = num(total.value);
    paint();
  };

  $('.del', el).onclick = () => {
    state.items = state.items.filter((x) => x.id !== item.id);
    if (!state.items.length) state.items.push(blankItem());
    renderItems();
  };

  function showImage() {
    const img = $('img', preview);
    if (item.image) {
      img.src = item.image;
      preview.hidden = false;
    } else {
      img.removeAttribute('src');
      preview.hidden = true;
    }
  }

  file.onchange = async () => {
    const chosen = file.files && file.files[0];
    if (!chosen) return;
    try {
      item.image = await shrinkImage(chosen);
      showImage();
      saveDraft();
      toast('แนบรูปแล้วค่ะ', 'ok');
    } catch (err) {
      toast(err.message || 'แนบรูปไม่สำเร็จ', 'err');
    }
    file.value = '';
  };
  $('.rm', preview).onclick = () => {
    item.image = null;
    showImage();
    saveDraft();
  };

  showImage();
  paint();
  return el;
}

/* --------------------------------------------------------------- การ์ดสรุป */

function renderSummary() {
  const rows = $('#s-rows');
  rows.textContent = '';

  let filled = 0;
  state.items.forEach((item, i) => {
    const { size, qty, price, total } = computeItem(item);
    const label = (item.name || item.detail || '').trim();
    if (!label && !total) return;
    filled += 1;

    const li = document.createElement('li');
    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = String(i + 1);

    const t = document.createElement('span');
    t.className = 't';
    t.textContent = label || 'รายการ';
    const sub = document.createElement('small');
    sub.textContent = size
      ? `${size.label} · ${round2(size.sqm * qty)} ตร.ม. × ${item.rate}`
      : qty > 1
        ? `${qty} ชิ้น × ${baht(price)}`
        : item.detail && item.name
          ? item.detail
          : '';
    if (sub.textContent) t.appendChild(sub);

    const v = document.createElement('span');
    v.className = 'v';
    v.textContent = baht(total);

    li.append(n, t, v);
    rows.appendChild(li);
  });

  if (!filled) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'ยังไม่มีรายการ — กรอกด้านล่างได้เลยค่ะ';
    rows.appendChild(li);
  }

  const total = grandTotal();
  const paid = Math.min(state.paid, total);
  $('#s-total').textContent = baht(total);
  $('#qb-total').textContent = baht(total);
  $('#s-name').textContent =
    state.items.map((i) => i.name).find(Boolean) || (filled ? 'งานใหม่' : 'ยังไม่ได้ตั้งชื่องาน');
  $('#s-date').textContent = thaiDate(state.date);

  const cust = $('#s-customer');
  cust.textContent = 'ลูกค้า: ' + state.customer;
  cust.hidden = !state.customer.trim();

  const paidRow = $('#s-paid');
  paidRow.hidden = !(paid > 0);
  $('#s-paid-amount').textContent = baht(paid);

  const chip = $('#s-status');
  const status = total > 0 && paid >= total ? 'paid' : paid > 0 ? 'partial' : 'pending';
  chip.className = 'chip ' + status;
  chip.textContent = { paid: 'รับเงินแล้ว', partial: 'รับบางส่วน', pending: 'ค้างรับ' }[status];
}

function thaiDate(iso) {
  const d = new Date(`${iso}T00:00:00+07:00`);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

/* -------------------------------------------------------------- การบันทึก */

let token = null; // โทเคนของ LIFF — ไม่มีเมื่อเปิดนอก LINE

// แปลงสิ่งที่กรอกเป็นรูปแบบที่ API รับ (เหมือนที่บอทสร้างจากข้อความในแชต)
function toPayload() {
  const items = [];
  for (const item of state.items) {
    const { size, qty, price, total } = computeItem(item);
    const label = (item.name || item.detail || '').trim();
    if (!label && !(total > 0)) continue;
    items.push(
      size
        ? {
            item_name: label || 'งานป้าย',
            size: size.label,
            quantity: round2(size.sqm * qty),
            unit: 'ตร.ม.',
            unit_price: round2(item.rate),
            total,
          }
        : {
            item_name: label || 'รายการ',
            size: item.name && item.detail ? item.detail.slice(0, 100) : null,
            quantity: qty,
            unit: null,
            unit_price: round2(price),
            total,
          }
    );
  }
  return {
    jobName: null, // ให้เซิร์ฟเวอร์ตั้งชื่อจากหมวดของรายการ เหมือนทางแชต
    customerName: state.customer.trim() || null,
    jobDate: state.date,
    items,
    paidAmount: Math.min(state.paid, grandTotal()),
    note: state.note.trim() || null,
    images: state.items.map((i) => i.image).filter(Boolean).slice(0, 4),
  };
}

async function save() {
  const payload = toPayload();
  if (!payload.items.length) return toast('ยังไม่มีรายการให้บันทึกค่ะ', 'err');
  if (!payload.items.some((i) => i.total > 0)) return toast('ยังไม่ได้ใส่ราคาเลยค่ะ', 'err');

  const restore = busySaveButtons();

  try {
    if (!token) {
      // เปิดนอก LINE — เก็บลงเครื่องไว้ให้ ไม่ขึ้นเซิร์ฟเวอร์
      const kept = JSON.parse(localStorage.getItem('muangjod.jot.saved') || '[]');
      kept.unshift({ ...payload, images: undefined, savedAt: new Date().toISOString() });
      localStorage.setItem('muangjod.jot.saved', JSON.stringify(kept.slice(0, 50)));
      toast('บันทึกลงเครื่องแล้ว (โหมดทดลอง ยังไม่ขึ้นระบบ)', 'ok');
      return clearForm();
    }

    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || body.error || 'บันทึกไม่สำเร็จ');

    const n = body.job?.job_number ? ' ' + body.job.job_number : '';
    toast(
      body.attachmentsFailed ? `บันทึกแล้ว${n} แต่แนบรูปไม่สำเร็จ` : `บันทึกงานแล้วค่ะ${n} 💜`,
      body.attachmentsFailed ? 'err' : 'ok'
    );
    clearForm();
    // ปิดหน้าต่างให้เอง เพื่อให้กลับไปเห็นการ์ดในแชตต่อ
    setTimeout(() => {
      if (window.liff && liff.isInClient && liff.isInClient()) liff.closeWindow();
    }, 1200);
  } catch (err) {
    toast(err.message || 'บันทึกไม่สำเร็จค่ะ', 'err');
  } finally {
    restore();
  }
}

// ปุ่มบันทึกมีสองที่ — บนการ์ดสรุป และบนแถบล่างของโหมดด่วน กดค้างทั้งคู่
// ระหว่างส่ง แล้วคืนป้ายเดิมให้ทีหลัง
function busySaveButtons() {
  const before = [$('#btn-save'), $('#qb-save')].map((el) => ({ el, label: el.textContent }));
  for (const { el } of before) {
    el.disabled = true;
    el.textContent = 'กำลังบันทึก…';
  }
  return () => {
    for (const { el, label } of before) {
      el.disabled = false;
      el.textContent = label;
    }
  };
}

function clearForm() {
  state.customer = '';
  state.date = todayISO();
  state.paid = 0;
  state.note = '';
  state.items = [blankItem()];
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ไม่เป็นไร */ }
  syncHeaderFields();
  renderItems();
}

function syncHeaderFields() {
  $('#f-customer').value = state.customer;
  $('#f-date').value = state.date;
  $('#f-paid').value = state.paid || '';
  $('#f-note').value = state.note;
}

/* ------------------------------------------------------------------- เริ่ม */

$('#f-customer').oninput = (e) => { state.customer = e.target.value; renderSummary(); saveDraft(); };
$('#f-date').onchange = (e) => { state.date = e.target.value || todayISO(); renderSummary(); saveDraft(); };
$('#f-paid').oninput = (e) => { state.paid = num(e.target.value); renderSummary(); saveDraft(); };
$('#f-note').oninput = (e) => { state.note = e.target.value; saveDraft(); };

// เพิ่มการ์ดใบใหม่แล้วเลื่อนไปหาเลย ไม่ต้องปัดเอง
function addItem() {
  state.items.push(blankItem());
  renderItems();
  scrollToCard(state.items.length - 1);
}

$('#btn-save').onclick = save;
$('#btn-edit').onclick = () => {
  itemsBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('.i-name', itemsBox.children[currentCard()])?.focus();
};
$('#btn-reset').onclick = () => {
  if (confirm('ล้างที่กรอกไว้ทั้งหมดไหมคะ?')) {
    clearForm();
    toast('ล้างแล้วค่ะ');
  }
};
$('#btn-close').onclick = () => {
  if (window.liff && liff.isInClient && liff.isInClient()) liff.closeWindow();
  else history.length > 1 ? history.back() : (location.href = '/app/');
};

$('#qb-save').onclick = save;

/* โหมดด่วน (?quick=1) — ตั้งใจให้เปิดผ่าน LIFF ขนาด Tall จะได้เด้งขึ้นมาเป็น
 * แผ่นการ์ดทับแชต ไม่ต้องออกไปหน้าเต็ม ตัดแชตกับการ์ดสรุปออก เหลือฟอร์มกับ
 * แถบยอดรวมด้านล่าง */
const params = new URLSearchParams(location.search);
const quick = params.get('quick') === '1';
if (quick) {
  document.body.classList.add('quick');
  $('#quickbar').hidden = false;
  $('#more').open = false;
  document.title = 'จดด่วน — ม่วงจดให้';
}

// ธีม: ขาว-น้ำเงินเป็นค่าเริ่มต้น ให้เข้าชุดกับการ์ดในแชตที่กดเข้ามา
// ?theme=night ได้โทนกรมท่ากลางคืน
if (params.get('theme') === 'night') {
  document.body.classList.add('night');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#0b1524');
}

(async function start() {
  if (!loadDraft()) state.items = [blankItem()];
  syncHeaderFields();
  renderItems();

  // LIFF: ถ้าเปิดใน LINE จะได้โทเคนไว้ยิง API ถ้าไม่ใช่ก็ยังกรอกได้ตามปกติ
  try {
    const cfg = await (await fetch('/api/config')).json();
    if (!cfg.liffId) throw new Error('ยังไม่ได้ตั้งค่า LIFF_ID');
    await liff.init({ liffId: cfg.liffId });
    if (!liff.isLoggedIn()) return liff.login({ redirectUri: location.href });
    token = liff.getAccessToken();
    $('#bar-sub').textContent = 'บันทึกเข้าบัญชีของคุณ';
  } catch {
    $('#bar-sub').textContent = 'โหมดทดลอง — ยังไม่เชื่อมกับ LINE';
    $('#foot').textContent = 'เปิดนอก LINE อยู่ กด "บันทึกงาน" จะเก็บลงเครื่องเท่านั้นค่ะ';
  }
})();
