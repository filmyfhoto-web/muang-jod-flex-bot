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
// 4.80 -> "4.8", 160 -> "160" — ขนาดบนใบเสร็จไม่ควรมีศูนย์ห้อยท้าย
const numText = (n) => String(round2(n));
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
 * ขนาดที่ไม่ใส่หน่วย ถ้าตัวเลขตั้งแต่ 20 ขึ้นไปคือเซนติเมตร ต่ำกว่านั้นคือเมตร
 * ในฟอร์มมีช่องหน่วยให้เลือกอยู่แล้ว กติกานี้จึงเหลือไว้เป็นค่าตั้งต้นเท่านั้น */
const CM_THRESHOLD = 20;
const UNIT_FACTORS = { cm: 0.01, m: 1, inch: 0.0254, ft: 0.3048 };
const UNIT_LABELS = { cm: 'ซม.', m: 'ม.', inch: 'นิ้ว', ft: 'ฟุต' };

// ขนาดมาจากช่อง กว้าง/ยาว/หน่วย ตรง ๆ — ไม่ต้องพิมพ์ x ให้ระบบเดาอีกแล้ว
function readSize(item) {
  const width = num(item.w);
  const height = num(item.h);
  if (!(width > 0) || !(height > 0)) return null;
  const unit = UNIT_FACTORS[item.unit] ? item.unit : 'cm';
  const f = UNIT_FACTORS[unit];
  return {
    width,
    height,
    unit,
    sqm: round2(width * f * (height * f)),
    // ป้ายบนใบเสร็จ: กว้าง คูณ ยาว เท่านั้น ไม่มีเรตต่อตารางเมตรติดไปด้วย
    label: `${numText(width)} × ${numText(height)} ${UNIT_LABELS[unit]}`,
  };
}

/* -------------------------------------------------------------- โครงข้อมูล */

/* หนึ่งรายการ = หนึ่งการ์ดในฟอร์ม
 *   { id, name, detail, w, h, unit, qty, rate, price, priceManual, total, totalManual, image }
 *
 * แยกให้ชัดว่าเลขไหนของใคร:
 *   rate   — "ตรมละ" ของร้าน ใช้คิดว่าควรตั้งราคาเท่าไหร่ ไม่ขึ้นใบเสร็จ
 *   price  — ราคาต่อชิ้นที่ร้านตั้งเอง อันนี้แหละที่ลูกค้าเห็น
 * ตอนยังไม่แตะช่องราคา ระบบเติมยอดที่คิดจากเรตให้เป็นตัวตั้งต้น พอพิมพ์ทับ
 * (priceManual = true) ของร้านชนะตลอด เรตจะเปลี่ยนยังไงก็ไม่ไปยุ่งกับมันอีก
 *
 * total  — ราคา × จำนวน จนกว่าจะพิมพ์ทับเอง (totalManual = true)
 * image  — data URL ของรูปที่ย่อแล้ว หรือ null
 */
const DRAFT_KEY = 'muangjod.jot.draft.v1';
let seq = 0;

const state = {
  customer: '',
  date: todayISO(),
  due: '', // วันนัดรับงาน — ว่างได้ แปลว่าไม่ได้นัดวันไว้
  paid: 0,
  note: '',
  items: [],
};

function blankItem() {
  seq += 1;
  return {
    id: 'it' + seq,
    name: '',
    detail: '',
    w: 0,
    h: 0,
    unit: 'cm',
    qty: 1,
    rate: 0,
    price: 0,
    priceManual: false,
    total: 0,
    totalManual: false,
    image: null,
  };
}

// ยอดของรายการหนึ่ง
//
// suggested คือยอดที่คิดจากเรตต่อตารางเมตร — ตัวช่วยของร้าน ไม่ใช่ราคาขาย
// ราคาขายคือ price เสมอ (ตั้งต้นด้วย suggested จนกว่าร้านจะพิมพ์ทับ)
function computeItem(item) {
  const size = readSize(item);
  const qty = item.qty > 0 ? item.qty : 1;
  const suggested = size && item.rate > 0 ? round2(size.sqm * item.rate) : 0;
  const price = item.priceManual ? item.price : suggested || item.price;
  const total = item.totalManual ? item.total : round2(price * qty);
  return { size, qty, suggested, price, total };
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
  const w = $('.i-w', el);
  const h = $('.i-h', el);
  const unit = $('.i-unit', el);
  const price = $('.i-price', el);
  const qty = $('.i-qty', el);
  const rate = $('.i-rate', el);
  const total = $('.i-total', el);
  const hint = $('.area-hint', el);
  const file = $('.i-file', el);
  const preview = $('.preview', el);

  // ใบแรกใช้พาดหัวชวนกรอกตามแบบ ใบถัด ๆ ไปบอกว่าเป็นรายการที่เท่าไหร่
  const count = state.items.length;
  $('.item-title', el).textContent = index === 0 ? 'กรอกข้อมูลงานได้เลย' : 'รายการที่ ' + (index + 1);
  // มีหลายรายการแล้วต้องบอกว่ากี่รายการ ไม่งั้นการ์ดที่เลื่อนหายไปข้าง ๆ
  // เท่ากับไม่มีอยู่จริงสำหรับคนกรอก
  $('.item-sub', el).textContent =
    count > 1 ? `รายการที่ ${index + 1} จาก ${count}` : 'บันทึกงานพิมพ์ / ป้ายโฆษณา ของคุณ';
  $('.del', el).hidden = count < 2;
  // น้องหมานั่งทับมุมที่ปุ่มลบอยู่ พอมีหลายรายการปุ่มลบจึงอ่านไม่ออก — คำชวน
  // กรอกมีค่าตอนใบแรกใบเดียว ปุ่มลบมีค่ากว่าเมื่อมีรายการให้ลบ
  $('.mascot', el).hidden = count > 1;
  $('.act-save', el).onclick = save;
  // ปุ่มเพิ่มรายการมีสองที่ — บนหัวการ์ดและท้ายการ์ด — ต้องผูกให้ครบทั้งคู่
  el.querySelectorAll('.act-add').forEach((b) => (b.onclick = addItem));

  name.value = item.name;
  detail.value = item.detail;
  w.value = item.w || '';
  h.value = item.h || '';
  unit.value = item.unit || 'cm';
  qty.value = item.qty || '';
  rate.value = item.rate || '';

  // ราคาพิมพ์ทับได้เสมอ — มันคือราคาขายของร้าน ไม่ใช่ช่องที่ระบบยึดไว้
  function paint() {
    const { size, suggested, price: p, total: t } = computeItem(item);

    if (!item.priceManual) price.value = p || '';
    price.classList.toggle('auto', !item.priceManual && suggested > 0);

    total.value = item.totalManual ? item.total || '' : t || '';
    total.classList.toggle('auto', !item.totalManual);

    // บรรทัดนี้เป็นของร้านล้วน ๆ ไม่มีอะไรจากตรงนี้ไปโผล่บนใบเสร็จ
    if (size && suggested > 0) {
      hint.hidden = false;
      hint.textContent =
        `🔒 ร้านเห็นคนเดียว · ${size.sqm} ตร.ม. × ${numText(item.rate)} = ${baht(suggested)} ต่อชิ้น` +
        (item.priceManual ? ' (ตั้งราคาเองแล้ว)' : ' — เติมให้ในช่องราคาแล้ว');
    } else if (item.rate > 0) {
      hint.hidden = false;
      hint.textContent = '🔒 ใส่กว้างกับยาวด้วยนะคะ ม่วงจดจะคิดพื้นที่ให้';
    } else if (size) {
      hint.hidden = false;
      hint.textContent = `${size.label} · ${size.sqm} ตร.ม. ต่อชิ้น`;
    } else {
      hint.hidden = true;
    }

    renderSummary();
    saveDraft();
  }

  name.oninput = () => { item.name = name.value; paint(); };
  detail.oninput = () => { item.detail = detail.value; paint(); };
  w.oninput = () => { item.w = num(w.value); paint(); };
  h.oninput = () => { item.h = num(h.value); paint(); };
  unit.onchange = () => { item.unit = unit.value; paint(); };
  qty.oninput = () => { item.qty = num(qty.value); paint(); };
  rate.oninput = () => { item.rate = num(rate.value); paint(); };
  price.oninput = () => {
    // ล้างช่องราคาทิ้ง = กลับไปใช้ยอดที่คิดจากเรตให้เป็นตัวตั้งต้นอีกครั้ง
    item.priceManual = price.value.trim() !== '';
    item.price = num(price.value);
    paint();
  };
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
    // สรุปพูดภาษาเดียวกับใบเสร็จ: ขนาดกับจำนวน ไม่มีเรตต่อตารางเมตร
    sub.textContent = [size ? size.label : '', qty > 1 ? `${qty} ชิ้น × ${baht(price)}` : '']
      .filter(Boolean)
      .join(' · ') || (item.detail && item.name ? item.detail : '');
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
  // วันนัดรับสำคัญกว่าวันที่จดในสายตาคนทำงาน จึงขึ้นก่อนเมื่อมี
  $('#s-date').textContent = state.due
    ? `📅 นัดรับ ${thaiDate(state.due)} · จดวันที่ ${thaiDate(state.date)}`
    : thaiDate(state.date);

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
  const workings = [];
  for (const item of state.items) {
    const { size, qty, suggested, price, total } = computeItem(item);
    const label = (item.name || item.detail || '').trim();
    if (!label && !(total > 0)) continue;

    // ใบเสร็จเห็นแค่นี้: ชื่อ · ขนาด (กว้าง × ยาว) · จำนวนชิ้น · ราคาที่ร้านตั้ง
    items.push({
      item_name: label || 'รายการ',
      size: size ? size.label : item.name && item.detail ? item.detail.slice(0, 100) : null,
      quantity: qty,
      unit: null,
      unit_price: round2(price),
      total,
    });

    // ส่วนวิธีคิดของร้านไปอยู่ในหมายเหตุ ซึ่งไม่ขึ้นทั้งใบเสร็จและบิลลูกค้า
    if (size && item.rate > 0) {
      workings.push(`${label || 'รายการ'}: ${size.sqm} ตร.ม. × ${numText(item.rate)} = ${suggested}`);
    }
  }

  const note = [state.note.trim(), workings.length ? 'คิดตาม ตร.ม. — ' + workings.join(' | ') : '']
    .filter(Boolean)
    .join('\n');

  return {
    jobName: null, // ให้เซิร์ฟเวอร์ตั้งชื่อจากหมวดของรายการ เหมือนทางแชต
    customerName: state.customer.trim() || null,
    jobDate: state.date,
    dueDate: state.due || null,
    items,
    paidAmount: Math.min(state.paid, grandTotal()),
    note: note || null,
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
  state.due = '';
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
  $('#f-due').value = state.due || '';
  $('#f-paid').value = state.paid || '';
  $('#f-note').value = state.note;
}

/* ------------------------------------------------------------------- เริ่ม */

$('#f-customer').oninput = (e) => { state.customer = e.target.value; renderSummary(); saveDraft(); };
$('#f-date').onchange = (e) => { state.date = e.target.value || todayISO(); renderSummary(); saveDraft(); };
$('#f-due').onchange = (e) => { state.due = e.target.value || ''; renderSummary(); saveDraft(); };
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

  // ?customer=… — มาจากปุ่ม "เพิ่มงานอีก" บนการ์ดที่เพิ่งบันทึก ลูกค้าคนเดิม
  // สั่งหลายงานในรอบเดียวจะได้ไม่ต้องพิมพ์ชื่อซ้ำ ชื่อที่ส่งมาชนะร่างเก่าเสมอ
  // เพราะเป็นการบอกชัด ๆ ว่ากำลังจดของใคร
  const fromCard = (params.get('customer') || '').trim();
  if (fromCard) {
    state.customer = fromCard.slice(0, 200);
    saveDraft();
  }

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
