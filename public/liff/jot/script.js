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
  // ราคาที่คิดได้ก่อนปัด null = ไม่ได้แก้ ให้เท่ากับผลบวกของรายการ
  listed: null,
  // ราคาที่จะเก็บลูกค้าจริง null = ไม่ได้แก้ ให้เท่ากับราคายังไม่ปัด
  charge: null,
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
    // 'sqm' = คิดตามพื้นที่ (งานป้าย) | 'sheet'/'piece'/'unit'/'set' = ราคาต่อชิ้น
    // ตั้งต้นเป็น sqm เหมือนเดิมทุกประการ ร้านที่ทำป้ายเป็นหลักจะไม่รู้สึกว่าอะไรเปลี่ยน
    rateMode: 'sqm',
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
  /* สูตรอยู่ที่ rate.js ที่เดียว หน้าฟอร์มกับเทสต์จึงคิดเลขเหมือนกันเสมอ
   *
   * โหมดช่วงราคาดูยอดรวม ตร.ม. ของ "ทั้งงาน" ไม่ใช่ของรายการเดียว เพราะตาราง
   * ของร้านเขียนว่า "เมื่อยอดรวมถึงแต่ละช่วง จะคิดราคาตามเรตของช่วงนั้น" —
   * สั่งสองแบบ แบบละ 2 ตร.ม. ต้องได้เรตของ 4 ตร.ม. เหมือนที่ร้านสัญญากับลูกค้าไว้
   */
  const q = MJRate.quote(item, { tierSqm: MJRate.tierSqmOf(state.items) });
  const suggested = q.price;
  const price = item.priceManual ? item.price : suggested || item.price;
  // ยอดของช่วงราคาคิดจาก ตร.ม. × เรต ตรง ๆ ไม่ใช่ราคาต่อแผ่นคูณจำนวน
  // ไม่งั้น 24 แผ่นจะได้ 1,000.08 แทนที่จะเป็น 1,000 พอดีตามตารางของร้าน
  const auto = item.priceManual ? round2(price * qty) : q.total;
  const total = item.totalManual ? item.total : auto;
  return { size, qty, suggested, price, total, quote: q };
}

const grandTotal = () => round2(state.items.reduce((s, it) => s + computeItem(it).total, 0));

// ราคายังไม่ปัด — ผลบวกของรายการ จนกว่าร้านจะพิมพ์ทับ
const listedAmount = () => (state.listed === null || state.listed === undefined ? grandTotal() : round2(state.listed));

// ราคาที่จะเก็บลูกค้า — เท่ากับราคายังไม่ปัด จนกว่าร้านจะปัดเอง
const chargeAmount = () => (state.charge === null || state.charge === undefined ? listedAmount() : round2(state.charge));

// บล็อก "เฉพาะร้าน": สองช่องราคาที่ร้านพิมพ์เองได้ทั้งคู่ กับส่วนต่างระหว่างมัน
function paintMine(listed, charged) {
  const box = $('#s-mine');
  if (!box) return;
  const rows = grandTotal();
  box.hidden = !(listed > 0 || rows > 0);
  if (box.hidden) return;

  const fill = (sel, value, placeholder) => {
    const el = $(sel);
    if (document.activeElement !== el) el.value = value || '';
    el.placeholder = String(placeholder);
  };
  fill('#f-listed', listed, rows);
  fill('#f-charge', charged, listed);

  const gap = round2(charged - listed);
  // ราคายังไม่ปัดที่พิมพ์ทับแล้วหนีจากบรรทัดย่อย ต้องเห็นว่าหนีไปเท่าไหร่
  const drift = Math.abs(rows - listed) >= 0.01 ? ` · รายการย่อยรวมได้ ${baht(rows)}` : '';
  const gapEl = $('#s-gap');
  gapEl.textContent =
    (Math.abs(gap) < 0.01 ? 'ยังไม่ได้ปัด' : `${gap > 0 ? 'ปัดขึ้น +' : 'ลดให้ −'}${baht(Math.abs(gap))}`) + drift;
  gapEl.className = 'mine-gap' + (Math.abs(gap) < 0.01 ? '' : gap > 0 ? ' up' : ' down');
}

/* ------------------------------------------------------------------ ร่าง */

function saveDraft() {
  // กำลังแก้งานที่บันทึกไปแล้ว (?job=…) ห้ามเขียนลงร่างเด็ดขาด
  //
  // ตอนเปิดงานเก่ามาแก้ โค้ดตั้งใจไม่เก็บลงร่างอยู่แล้ว แต่พอแตะช่องไหนก็ตาม
  // paint() กับ oninput ของหัวฟอร์มเรียก saveDraft() ทุกครั้ง งานที่บันทึกไป
  // แล้วจึงถูกเขียนทับร่างเงียบ ๆ แล้วครั้งต่อไปที่กด "จดด่วน" มันก็เด้งงานเก่า
  // กลับขึ้นมาทั้งใบ ซึ่งคือสิ่งที่ร้านเจอ
  if (editingJobId) return;
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...state, savedAt: Date.now() }));
  } catch {
    // เต็มหรือถูกปิดไว้ — ลองใหม่โดยไม่เอารูปไปด้วย รูปเป็นของที่ใหญ่ที่สุด
    try {
      const light = { ...state, savedAt: Date.now(), items: state.items.map((it) => ({ ...it, image: null })) };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(light));
    } catch {
      /* เก็บไม่ได้ก็ไม่เป็นไร ฟอร์มยังใช้ได้ปกติ */
    }
  }
}

// อ่านร่างที่ค้างไว้โดยยังไม่เอาเข้าฟอร์ม
//
// คืน null เมื่อไม่มีอะไรให้กู้จริง ๆ — ร่างที่เป็นฟอร์มเปล่า (เปิดแล้วปิดเฉย ๆ)
// ไม่นับ ไม่งั้นจะมีแถบ "มีงานค้างไว้" โผล่มาทั้งที่ไม่มีอะไรค้าง
function peekDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (!saved || !Array.isArray(saved.items) || !saved.items.length) return null;
    const written = saved.items.some((it) => String(it.name || '').trim() || num(it.total) || num(it.price));
    if (!written && !String(saved.customer || '').trim() && !String(saved.note || '').trim()) return null;
    return saved;
  } catch {
    return null;
  }
}

function loadDraft(saved) {
  if (!saved) return false;
  Object.assign(state, saved);
  state.items = saved.items.map((it) => ({ ...blankItem(), ...it }));
  return true;
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
  renderSummary();
  saveDraft();
}

/* รายการเรียงลงมาเป็นบรรทัด ไม่ใช่การ์ดที่ต้องปัดหา
 *
 * ร้านบอกว่า "เพิ่มเป็นบรรทัดเหมือนใบเสร็จธรรมดาได้มั้ย ไม่ต้องข้ามหน้าอ้ะ" —
 * ของเดิมหนึ่งรายการคือการ์ดเต็มจอที่ต้องปัดซ้าย-ขวาถึงจะเจอใบถัดไป งานที่มีสาม
 * รายการจึงมองไม่เห็นพร้อมกันเลยสักครั้ง ทั้งที่ใบเสร็จจริงอ่านทีเดียวจบ
 *
 * พอเรียงลงมาแล้ว จุดบอกหน้ากับการเลื่อนไปทีละใบก็ไม่มีความหมาย เหลือแค่เลื่อน
 * ไปให้เห็นบรรทัดที่เพิ่งเพิ่ม
 */
/* บรรทัดไหนกางอยู่ — เก็บไว้นอก state เพราะเป็นเรื่องของการมอง ไม่ใช่ข้อมูลงาน
 * ที่ต้องเซฟลงร่างหรือส่งขึ้นเซิร์ฟเวอร์ */
let openId = null;

function scrollToCard(index) {
  const card = itemsBox.children[index];
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// บรรทัดที่อยู่ใกล้กลางจอที่สุด — ใช้ตอนกด "แก้ไข" เพื่อโฟกัสช่องชื่อ
function currentCard() {
  const cards = [...itemsBox.children];
  if (cards.length < 2) return 0;
  const middle = window.innerHeight / 2;
  let best = 0;
  let bestGap = Infinity;
  cards.forEach((el, i) => {
    const box = el.getBoundingClientRect();
    const gap = Math.abs(box.top + box.height / 2 - middle);
    if (gap < bestGap) {
      bestGap = gap;
      best = i;
    }
  });
  return best;
}

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
  const rateMode = $('.i-ratemode', el);
  const qtyLabel = $('.qty-label', el);
  const rateLabel = $('.rate-label', el);
  const total = $('.i-total', el);
  const hint = $('.area-hint', el);
  const yieldHint = $('.yield-hint', el);
  const file = $('.i-file', el);
  const preview = $('.preview', el);

  const count = state.items.length;
  const rowNo = $('.row-no', el);
  const rowTitle = $('.item-title', el);
  const rowAmt = $('.row-amt', el);
  rowNo.textContent = String(index + 1);
  // ลบบรรทัดสุดท้ายทิ้งไม่ได้ ฟอร์มต้องเหลืออย่างน้อยหนึ่งบรรทัดให้กรอก
  $('.del', el).hidden = count < 2;

  // บรรทัดเดียวกางไว้เสมอ (ไม่มีอะไรให้ยุบหนี) หลายบรรทัดกางเฉพาะอันที่กำลังแก้
  if (openId === null && count === 1) openId = item.id;
  el.open = count === 1 || openId === item.id;
  el.ontoggle = () => {
    if (el.open) {
      openId = item.id;
      // กางอันใหม่แล้วยุบอันอื่น ไม่งั้นก็กลับไปเป็นกองยาวเหมือนเดิม
      [...itemsBox.children].forEach((other) => {
        if (other !== el) other.open = false;
      });
    } else if (openId === item.id) {
      openId = null;
    }
  };
  // ปุ่มลบอยู่บนหัวบรรทัด ซึ่งเป็นตัวกางเอง — กดลบต้องไม่กางไปด้วย
  $('.del', el).onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    state.items = state.items.filter((x) => x.id !== item.id);
    if (!state.items.length) state.items.push(blankItem());
    if (openId === item.id) openId = null;
    renderItems();
  };

  name.value = item.name;
  detail.value = item.detail;
  w.value = item.w || '';
  h.value = item.h || '';
  unit.value = item.unit || 'cm';
  qty.value = item.qty || '';
  rateMode.innerHTML = MJRate.MODES
    .map((m) => `<option value="${m.id}">${m.label}</option>`)
    .join('');
  // ร่างเก่าที่เก็บไว้ก่อนมีช่องนี้ ไม่มี rateMode — ให้ตกมาที่ sqm เหมือนเดิม
  rateMode.value = MJRate.mode(item.rateMode).id;
  rate.value = item.rate || '';
  // ราคาที่ตั้งเองต้องขึ้นมาให้เห็นตั้งแต่แรก paint() ข้ามช่องนี้เมื่อ
  // priceManual เพราะหน้าที่มันคือ "อย่าคิดทับของร้าน" ไม่ใช่ "อย่าโชว์" —
  // ร่างที่เปิดกลับมาจึงเคยมียอดรวมถูกแต่ช่องราคาว่างเปล่า
  price.value = item.price || '';

  // ราคาพิมพ์ทับได้เสมอ — มันคือราคาขายของร้าน ไม่ใช่ช่องที่ระบบยึดไว้
  function paint() {
    const { size, suggested, price: p, total: t, quote: q, qty: n } = computeItem(item);

    // หัวบรรทัดอ่านได้เหมือนใบเสร็จ: ชื่อกับยอด โดยไม่ต้องกวาดตาหาในช่องกรอก
    rowTitle.textContent = (item.name || item.detail || '').trim() || 'รายการที่ ' + (index + 1);
    rowAmt.textContent = baht(t);

    if (!item.priceManual) price.value = p || '';
    price.classList.toggle('auto', !item.priceManual && suggested > 0);

    total.value = item.totalManual ? item.total || '' : t || '';
    total.classList.toggle('auto', !item.totalManual);

    const mode = MJRate.mode(item.rateMode);
    const tiered = mode.id === 'tier';

    /* โหมดช่วงราคา เรตมาจากตารางของร้าน ไม่ใช่ตัวเลขที่พิมพ์เอง
     *
     * ช่องเรตจึงกลายเป็นที่ "แสดงผล" ไม่ใช่ที่กรอก — ปล่อยให้พิมพ์ได้ทั้งที่
     * พิมพ์ไปก็ไม่มีผล คือหลอกให้เสียเวลา
     */
    rate.disabled = tiered;
    rate.classList.toggle('auto', tiered);
    if (tiered) {
      rateLabel.textContent = `เรตตามช่วง (บาท/ตร.ม.)`;
      rate.value = q.tier.rate;
    } else {
      rateLabel.textContent = `${mode.label} (บาท)`;
      rate.placeholder = mode.id === 'sqm' ? 'เช่น 165' : 'เช่น 50';
      if (rate.value !== String(item.rate || '')) rate.value = item.rate || '';
    }

    // ป้ายช่องจำนวนบอกหน่วยที่กำลังนับอยู่ — "จำนวน" เฉย ๆ ตอนคิดเป็นแผ่น
    // ทำให้ไม่รู้ว่าใส่แผ่นหรือใส่ตารางเมตร
    qtyLabel.textContent = tiered || mode.id !== 'sqm' ? `จำนวน (${mode.piece})` : 'จำนวน';

    /* บรรทัดนี้เป็นของร้านล้วน ๆ ไม่มีอะไรจากตรงนี้ไปโผล่บนใบเสร็จ
     *
     * สองโหมดต้องพูดคนละภาษา — โหมดพื้นที่อธิบายว่าคูณมาจากอะไร ส่วนโหมดต่อแผ่น
     * ราคาคือเรตตรง ๆ ไม่มีอะไรให้อธิบาย เหลือแค่บอกว่าขนาดกินพื้นที่เท่าไหร่
     * ซึ่งเป็นสเปกที่ต้องจดไว้ให้ถูก ไม่ใช่ตัวคูณราคา
     */
    if (tiered) {
      const sheetSqm = Math.round(q.sqmPerSheet * 10000) / 10000;
      hint.hidden = false;
      hint.textContent =
        `${q.sqm} ตร.ม. (${numText(n)} แผ่น × ${sheetSqm} ตร.ม.)` +
        ` · ช่วง ${q.tier.label} = ${numText(q.tier.rate)} บาท/ตร.ม.` +
        ` · เฉลี่ยแผ่นละ ${baht(suggested)}`;
    } else if (mode.id !== 'sqm') {
      const per = `${baht(suggested)} ต่อ${mode.piece}`;
      hint.hidden = !(suggested > 0 || size);
      hint.textContent = size
        ? `${size.label} · ${size.sqm} ตร.ม. ต่อ${mode.piece}` + (suggested > 0 ? ` · ${per}` : '')
        : `🔒 ร้านเห็นคนเดียว · ${per}`;
    } else if (size && suggested > 0) {
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

    /* "ตรมละ ....... ได้กี่แผ่น" — คำถามของร้าน ตอบตรงนั้นเลย
     *
     * วัสดุซื้อเป็นตารางเมตร แต่ตัดขายเป็นแผ่น พอรู้ขนาดแผ่นก็บอกได้ว่าหนึ่ง
     * ตารางเมตรได้กี่แผ่น และถ้าใส่เรตต่อตารางเมตรมาด้วย ก็บอกต้นทุนต่อแผ่นได้
     *
     * เขียนกำกับว่า "ไม่รวมเศษตัด" เพราะของจริงตัดจากม้วนกว้างคงที่ ย่อมเหลือ
     * เศษ — ตัวเลขนี้เป็นเพดานบน ปล่อยให้ร้านตั้งราคาจากเลขที่ดีกว่าความจริง
     * ไม่ได้
     */
    if (tiered) {
      const all = MJRate.tierSqmOf(state.items);
      const next = MJRate.STICKER_TIERS.find((x) => x.min > all);
      yieldHint.hidden = false;
      yieldHint.textContent =
        (all > q.sqm ? `🔒 รวมสติ๊กเกอร์ทั้งงาน ${all} ตร.ม. — ช่วงคิดจากยอดรวม` : '🔒 คิดจากยอดรวมของทั้งงาน') +
        (next
          ? ` · อีก ${round2(next.min - all)} ตร.ม. ถึงช่วง ${numText(next.rate)} บาท/ตร.ม.`
          : ' · ถึงช่วงถูกที่สุดแล้ว');
      renderSummary();
      saveDraft();
      return;
    }

    const y = MJRate.yieldPerSqm(item);
    if (y && y.sheets >= 1) {
      const piece = mode.id === 'sqm' ? 'แผ่น' : mode.piece;
      yieldHint.hidden = false;
      yieldHint.textContent =
        `🔒 1 ตร.ม. ได้ราว ${y.sheets} ${piece} (${y.sqmPerSheet} ตร.ม./${piece} · ไม่รวมเศษตัด)` +
        (mode.id === 'sqm' && y.costPerSheet > 0 ? ` · ต้นทุน${piece}ละ ${baht(y.costPerSheet)}` : '');
    } else {
      yieldHint.hidden = true;
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
  rateMode.onchange = () => {
    item.rateMode = MJRate.mode(rateMode.value).id;
    // เปลี่ยนวิธีคิดแล้วเรตเดิมไม่มีความหมาย (165/ตร.ม. ไม่ใช่ 165/แผ่น) —
    // ราคาที่ร้านพิมพ์เองไว้ยังอยู่ ของที่ระบบเติมให้ต้องคิดใหม่
    if (!item.priceManual) item.price = 0;
    paint();
  };
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
    const pieceWord = MJRate.mode(item.rateMode).piece;
    sub.textContent = [size ? size.label : '', qty > 1 ? `${qty} ${pieceWord} × ${baht(price)}` : '']
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

  // ยอดรวม = ราคาที่คิดได้จากรายการ ส่วนยอดที่เก็บจริงคือ charge ถ้าร้านแก้ไว้
  const listed = listedAmount();
  const total = chargeAmount();
  const paid = Math.min(state.paid, total);
  $('#s-total').textContent = baht(total);
  $('#qb-total').textContent = baht(total);
  paintMine(listed, total);
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

    /* บรรทัดย่อยบนใบเสร็จ: ขนาด และรายละเอียดที่ร้านพิมพ์
     *
     * ร้านบอกว่า "พิมพ์รายละเอียดงานก็ไม่ขึ้นในใบเสร็จนะ" — ของเดิมเลือกอย่างใด
     * อย่างหนึ่ง มีขนาดเมื่อไหร่รายละเอียดหายทันที ทั้งที่คนละเรื่องกัน ขนาดคือ
     * กว้างคูณยาว ส่วนรายละเอียดคือสิ่งที่ร้านตั้งใจพิมพ์ให้ลูกค้าอ่าน
     * ("ตอกตาไก่ 4 มุม", "เคลือบด้าน") ซึ่งไม่มีทางเดาได้จากตัวเลขขนาด
     *
     * ช่อง size ของรายการคือ "บรรทัดย่อย" ของใบเสร็จ ไม่ใช่ขนาดอย่างเดียว —
     * ของเดิมก็ใช้มันใส่รายละเอียดอยู่แล้วตอนไม่มีขนาด เอามาต่อกันให้ครบ
     * ไม่ใช่ทิ้งอันใดอันหนึ่ง
     *
     * รายละเอียดที่พิมพ์ซ้ำกับชื่องานไม่ต้องขึ้นสองรอบ
     */
    const sub = MJRate.subLine(size ? size.label : null, item.detail, label);

    // ใบเสร็จเห็นแค่นี้: ชื่อ · ขนาด/รายละเอียด · จำนวนชิ้น · ราคาที่ร้านตั้ง
    items.push({
      item_name: label || 'รายการ',
      size: sub,
      quantity: qty,
      // โหมดต่อแผ่น/ชิ้น/อัน บอกหน่วยได้ตรง ๆ และหน่วยนี้ขึ้นใบเสร็จ
      // โหมดพื้นที่ไม่บอก เพราะ "ชิ้น" ของงานป้ายคือผืน ซึ่งขนาดข้างหลังบอกแล้ว
      unit: MJRate.mode(item.rateMode).id === 'sqm' ? null : MJRate.mode(item.rateMode).piece,
      unit_price: round2(price),
      total,
    });

    // ส่วนวิธีคิดของร้านไปอยู่ในหมายเหตุ ซึ่งไม่ขึ้นทั้งใบเสร็จและบิลลูกค้า
    if (size && item.rate > 0 && MJRate.mode(item.rateMode).id === 'sqm') {
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
    // ส่งไปเฉพาะตอนร้านแก้เอง ไม่งั้นปล่อยให้เซิร์ฟเวอร์ใช้ยอดที่บวกจากรายการ
    listedTotal: state.listed === null || state.listed === undefined ? null : round2(state.listed),
    customerTotal: state.charge === null || state.charge === undefined ? null : round2(state.charge),
    paidAmount: Math.min(state.paid, chargeAmount()),
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

    // แก้งานที่มีอยู่ ต้องเป็นการแก้ ไม่ใช่สร้างงานใหม่ใบที่สอง
    // ราคาที่คิดได้ไม่ส่งไป เซิร์ฟเวอร์บวกจากรายการเอง ตัวเลขบนใบเสร็จกับบรรทัด
    // ใต้มันจะได้ไม่มีทางขัดกัน ส่วนราคาที่เก็บลูกค้าเป็นสิทธิ์ของร้าน จึงส่งไป
    // เมื่อร้านปัดเองเท่านั้น
    const res = editingJobId
      ? await fetch('/api/jobs/' + encodeURIComponent(editingJobId), {
          method: 'PATCH',
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: payload.items,
            ...(payload.customerName !== undefined ? { customer_name: payload.customerName || null } : {}),
            ...(payload.listedTotal !== null ? { subtotal: payload.listedTotal } : {}),
            ...(payload.customerTotal !== null ? { total: payload.customerTotal } : {}),
            ...(payload.note ? { note: payload.note } : {}),
          }),
        })
      : await fetch('/api/jobs', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || body.error || 'บันทึกไม่สำเร็จ');

    // งานเข้าระบบแล้ว ร่างที่ค้างบนการ์ดในแชตจึงต้องจบไปด้วย ไม่งั้นข้อความ
    // ถัดไปที่พิมพ์จะถูกอ่านเป็นการแก้งานที่บันทึกไปเรียบร้อยแล้ว
    if (params.get('draft') === '1') {
      await fetch('/api/draft', { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } }).catch(() => {});
    }

    const n = body.job?.job_number ? ' ' + body.job.job_number : '';
    toast(
      editingJobId
        ? `แก้ไขงานแล้วค่ะ${n} 💜`
        : body.attachmentsFailed
          ? `บันทึกแล้ว${n} แต่แนบรูปไม่สำเร็จ`
          : `บันทึกงานแล้วค่ะ${n} 💜`,
      !editingJobId && body.attachmentsFailed ? 'err' : 'ok'
    );
    // แก้งานเก่าไม่ได้ล้างฟอร์ม เพราะฟอร์มนี้ไม่ใช่ที่ร่างงานใหม่ตอนนี้ — ล้าง
    // แล้วจอจะว่างเปล่าหนึ่งวินาทีก่อนปิด ซึ่งอ่านเหมือนงานหายไป
    if (!editingJobId) clearForm();
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
  state.listed = null;
  state.charge = null;
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
  $('#f-listed').value = state.listed === null || state.listed === undefined ? '' : state.listed;
  $('#f-charge').value = state.charge === null || state.charge === undefined ? '' : state.charge;
}

/* ------------------------------------------------------------------- เริ่ม */

$('#f-customer').oninput = (e) => { state.customer = e.target.value; renderSummary(); saveDraft(); };
$('#f-date').onchange = (e) => { state.date = e.target.value || todayISO(); renderSummary(); saveDraft(); };
$('#f-due').onchange = (e) => { state.due = e.target.value || ''; renderSummary(); saveDraft(); };
$('#f-paid').oninput = (e) => { state.paid = num(e.target.value); renderSummary(); saveDraft(); };
$('#f-note').oninput = (e) => { state.note = e.target.value; saveDraft(); };

// สองช่องนี้ลบทิ้งจนว่าง = กลับไปเดินตามตัวที่อยู่เหนือมัน ไม่ใช่ศูนย์บาท
// (ราคายังไม่ปัดกลับไปตามรายการ ราคาที่เก็บกลับไปตามราคายังไม่ปัด)
$('#f-listed').oninput = (e) => {
  state.listed = e.target.value.trim() === '' ? null : num(e.target.value);
  renderSummary();
  saveDraft();
};
$('#f-charge').oninput = (e) => {
  state.charge = e.target.value.trim() === '' ? null : num(e.target.value);
  renderSummary();
  saveDraft();
};
$('#s-mine').onclick = (e) => {
  const b = e.target.closest('button[data-round]');
  if (!b) return;
  const step = Number(b.dataset.round) || 0;
  const listed = listedAmount();
  state.charge = step ? Math.ceil(listed / step) * step : null;
  renderSummary();
  saveDraft();
};

/* ---------------------------------------- ร่างที่ค้างอยู่บนการ์ดในแชต */

/* ปุ่ม ✏️ แก้ไข บนการ์ด "ตรวจสอบก่อนบันทึก" เปิดหน้านี้มาพร้อม ?draft=1
 *
 * เดิมปุ่มนั้นทิ้งร่างทั้งก้อนแล้วขอให้พิมพ์มาใหม่ ซึ่งกับออเดอร์โรงเรียน
 * เจ็ดบรรทัดเป็นคำตอบที่โหดมากสำหรับคำว่า "บรรทัดที่สี่ผิด" — ตอนนี้ของเดิม
 * มาอยู่ในฟอร์มให้แก้ตรงจุด แล้วกดบันทึกทีเดียวจบ
 *
 * ฝั่งแชตเก็บรายการเป็นรูปแบบของฐานข้อมูล (item_name / size / quantity)
 * ส่วนฟอร์มคิดเป็น กว้าง-ยาว-หน่วย จึงต้องแปลงกลับ */
const UNIT_FROM_LABEL = { 'ซม.': 'cm', 'ม.': 'm', 'นิ้ว': 'inch', 'ฟุต': 'ft' };

// "150 × 300 ซม." -> { w: 150, h: 300, unit: 'cm' }
function parseSizeLabel(label) {
  const m = /^\s*([\d.]+)\s*[×x*]\s*([\d.]+)\s*(\S+)?\s*$/.exec(String(label || ''));
  if (!m) return null;
  return { w: num(m[1]), h: num(m[2]), unit: UNIT_FROM_LABEL[m[3]] || 'cm' };
}

/* งานที่บันทึกไปแล้ว เปิดมาแก้รายการย่อย (?job=<id>)
 *
 * ฟอร์มแก้ไขในแดชบอร์ดมีช่อง "จำนวนเงิน" ช่องเดียว งานที่พิมพ์ไปสองรายการ
 * จึงแก้ได้แค่ยอดรวมก้อนเดียว แก้บรรทัดไหนไม่ได้เลย — ร้านเจอเข้าเต็ม ๆ ว่า
 * "พิมพ์ไป 2 งาน แก้ไขได้แค่งานเดียว"
 *
 * หน้านี้แก้รายการย่อยได้อยู่แล้ว ก็ให้มันรับงานที่บันทึกแล้วด้วย รูปแบบ
 * รายการเหมือนกับร่างเป๊ะ (มาจากฐานข้อมูลเหมือนกัน) จึงใช้ตัวแปลงตัวเดียวกัน */
let editingJobId = null;

function fromDraft(draft) {
  const items = (draft.items || []).map((it) => {
    const size = parseSizeLabel(it.size);
    return {
      ...blankItem(),
      name: it.item_name || '',
      ...(size ? { w: size.w, h: size.h, unit: size.unit } : {}),
      qty: num(it.quantity) || 1,
      price: num(it.unit_price),
      total: num(it.total),
      // ราคาต่อชิ้นมาจากแชต เป็นราคาที่คิดเสร็จแล้ว ไม่ใช่ค่าตั้งต้นให้ฟอร์ม
      // คำนวณทับ — ไม่ปักไว้ เปิดหน้ามาปุ๊บฟอร์มคิดใหม่จากเรตที่ว่าง ราคาหาย
      priceManual: true,
      // แต่ "ยอดของบรรทัด" ต้องไม่ปัก ไม่งั้นแก้จำนวนหรือราคาแล้วยอดไม่ขยับ
      // ซึ่งคือการแก้ที่เงียบ ๆ แล้วได้เลขผิด — ร้ายกว่าไม่ให้แก้เลย
      // ยกเว้นบรรทัดที่ยอดไม่เท่ากับ ราคา × จำนวน อยู่แต่แรก อันนั้นมีที่มา
      // ของมันเอง จึงเก็บไว้ตามเดิม
      totalManual: Math.abs(num(it.unit_price) * (num(it.quantity) || 1) - num(it.total)) > 0.01,
    };
  });

  state.customer = draft.customerName || '';
  state.date = draft.jobDate || todayISO();
  state.due = draft.dueDate || '';
  state.paid = num(draft.paidAmount);
  state.note = draft.note || '';
  // ราคายังไม่ปัดที่ร้านเคยพิมพ์ทับไว้ ติดมาเฉพาะตอนที่มันไม่เท่ากับผลบวกของ
  // รายการ ไม่งั้นแก้จำนวนแล้วยอดค้างอยู่ที่เลขเก่า
  const rowsSum = round2((draft.items || []).reduce((s, it) => s + num(it.total), 0));
  state.listed =
    draft.listedTotal !== undefined && draft.listedTotal !== null && Math.abs(num(draft.listedTotal) - rowsSum) > 0.01
      ? num(draft.listedTotal)
      : null;
  // ราคาที่เก็บลูกค้า ติดมาเฉพาะงานที่ร้านเคยปัดไว้ — เท่ากับที่คิดได้ก็ปล่อย
  // null ไว้ ไม่งั้นแก้จำนวนแล้วยอดค้างอยู่ที่เลขเก่า
  state.charge =
    draft.customerTotal !== undefined && draft.customerTotal !== null && Math.abs(num(draft.customerTotal) - num(draft.listedTotal)) > 0.01
      ? num(draft.customerTotal)
      : null;
  state.items = items.length ? items : [blankItem()];
}

// เพิ่มการ์ดใบใหม่แล้วเลื่อนไปหาเลย ไม่ต้องปัดเอง
function addItem() {
  const fresh = blankItem();
  state.items.push(fresh);
  openId = fresh.id;
  renderItems();
  scrollToCard(state.items.length - 1);
}

/* ค่าส่งเป็นบรรทัดหนึ่งบนใบเสร็จ ไม่ใช่งานหนึ่งชิ้น
 *
 * ร้านถามถึง "ค่าส่ง ....." ต่อจากราคาสติ๊กเกอร์ ซึ่งของเดิมต้องเพิ่มรายการเปล่า
 * แล้วพิมพ์ชื่อเอง ข้ามช่องขนาดกับช่องเรตที่ไม่เกี่ยวไปห้าช่อง กว่าจะถึงช่องราคา
 *
 * มันไม่มีขนาดและไม่ได้คิดตามพื้นที่ จึงมาเป็นโหมด "ชิ้นละ" ที่เอาเรตเป็นราคาตรง ๆ
 * ชื่อเติมให้แล้ว เหลือใส่ตัวเลขช่องเดียว
 */
function addShipping() {
  const ship = blankItem();
  ship.name = 'ค่าส่ง';
  ship.rateMode = 'piece';
  ship.qty = 1;
  state.items.push(ship);
  openId = ship.id;
  renderItems();
  const index = state.items.length - 1;
  scrollToCard(index);
  // โฟกัสไปที่ช่องเดียวที่ยังต้องกรอก ไม่ใช่ช่องชื่อที่เติมให้แล้ว
  setTimeout(() => $('.i-rate', itemsBox.children[index])?.focus(), 350);
}

$('#btn-add').onclick = addItem;
$('#btn-ship').onclick = addShipping;
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

/* เปิดฟอร์มมาเจอหน้าใหม่เสมอ ไม่ใช่ของเมื่อวาน
 *
 * ร้านถามว่า "ทำไมจดด่วนถึงไม่ขึ้นหน้าใหม่ ไปขึ้นหน้าเดิมทำไม" — ของเดิมเอาร่าง
 * ที่ค้างในเครื่องกลับขึ้นมาให้ทันทีทุกครั้งที่เปิด กด "จดด่วน" ตั้งใจจะจดงานใหม่
 * แต่ได้งานเก่ามาทั้งใบ แล้วต้องมานั่งลบทีละรายการก่อน
 *
 * แต่จะทิ้งร่างไปเฉย ๆ ก็ไม่ได้ บางทีมันคืองานที่พิมพ์ค้างไว้จริง ๆ แล้วเผลอปิด
 * ไป ทางที่ได้ทั้งสองอย่างคือ: เริ่มที่ฟอร์มเปล่า แล้วยื่นของเก่าให้เป็นปุ่มกู้คืน
 */
function offerDraft(saved) {
  const bar = $('#resume');
  if (!bar || !saved) return;
  const n = saved.items.filter((it) => String(it.name || '').trim() || num(it.total)).length;
  $('#resume-text').textContent = `มีงานที่ค้างไว้ ${n || saved.items.length} รายการ`;
  $('#resume-when').textContent = saved.savedAt ? whenText(saved.savedAt) : '';
  bar.hidden = false;

  $('#resume-yes').onclick = () => {
    loadDraft(saved);
    bar.hidden = true;
    syncHeaderFields();
    renderItems();
    toast('เอางานที่ค้างไว้กลับมาให้แล้วค่ะ 💜');
  };
  $('#resume-no').onclick = () => {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ไม่เป็นไร */ }
    bar.hidden = true;
  };
}

function whenText(ts) {
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 1) return 'เมื่อครู่นี้';
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} ชั่วโมงที่แล้ว`;
  return `${Math.round(hrs / 24)} วันที่แล้ว`;
}

(async function start() {
  // ?draft=1 กับ ?job=… ไปดึงของจริงมาใส่ทีหลังอยู่แล้ว ไม่ต้องมีแถบกู้คืนมากวน
  const pending = params.get('draft') === '1' || params.get('job') ? null : peekDraft();
  state.items = [blankItem()];
  if (pending) offerDraft(pending);

  // ?customer=… — มาจากปุ่ม "เพิ่มงานอีก" บนการ์ดที่เพิ่งบันทึก ลูกค้าคนเดิม
  // สั่งหลายงานในรอบเดียวจะได้ไม่ต้องพิมพ์ชื่อซ้ำ ชื่อที่ส่งมาชนะร่างเก่าเสมอ
  // เพราะเป็นการบอกชัด ๆ ว่ากำลังจดของใคร
  const fromCard = (params.get('customer') || '').trim();
  if (fromCard) {
    state.customer = fromCard.slice(0, 200);
    saveDraft();
  }

  // ?name=… — มาจากปุ่มลัด "งานกรอบรูป / งานป้าย / งานโฟมบอร์ด" เหนือช่องพิมพ์
  // เปิดมาชื่อรายการใส่ไว้ให้แล้ว เหลือใส่ขนาดกับราคา ไม่ใช่เริ่มจากฟอร์มเปล่า
  // ใส่เฉพาะตอนรายการแรกยังว่าง ไม่งั้นจะไปทับงานที่ร้านค้างไว้
  const preset = (params.get('name') || '').trim();
  if (preset && state.items.length === 1 && !state.items[0].name && !state.items[0].total) {
    state.items[0].name = preset.slice(0, 200);
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

    // ?draft=1 — มาจากปุ่ม ✏️ แก้ไข บนการ์ดในแชต ของที่จดไว้ต้องมาอยู่ในฟอร์ม
    // ให้ครบ ไม่ใช่ให้พิมพ์ใหม่ ร่างที่ค้างในเครื่องแพ้เสมอ เพราะอันนี้คือ
    // สิ่งที่เขากำลังมองอยู่บนจอ
    if (params.get('draft') === '1') {
      try {
        const res = await fetch('/api/draft', { headers: { Authorization: 'Bearer ' + token } });
        const body = await res.json();
        if (body?.draft) {
          fromDraft(body.draft);
          saveDraft();
          syncHeaderFields();
          renderItems();
          toast('ดึงงานจากแชตมาให้แล้วค่ะ แก้ได้เลย ✏️');
        } else {
          toast('ไม่เจอร่างที่ค้างไว้ค่ะ กรอกใหม่ได้เลยนะคะ', 'err');
        }
      } catch {
        toast('ดึงงานจากแชตไม่สำเร็จค่ะ', 'err');
      }
    }

    // ?job=<id> — งานที่บันทึกไปแล้ว มาแก้รายการย่อย ร่างที่ค้างในเครื่อง
    // แพ้เสมอ เพราะอันนี้คืองานจริงที่เขาเลือกมาแก้
    const jobId = (params.get('job') || '').trim();
    if (jobId) {
      try {
        const res = await fetch('/api/jobs/' + encodeURIComponent(jobId), {
          headers: { Authorization: 'Bearer ' + token },
        });
        const body = await res.json();
        if (res.ok && body?.job) {
          editingJobId = jobId;
          fromDraft({
            items: body.job.items,
            customerName: body.job.customer_name,
            jobDate: body.job.job_date,
            dueDate: body.job.due_date,
            paidAmount: body.job.paid_amount,
            note: body.job.note,
            customerTotal: body.job.total,
            listedTotal: body.job.subtotal,
          });
          // ไม่เก็บลงร่างในเครื่อง: นี่คืองานจริง ไม่ใช่ของที่กำลังร่างอยู่
          // เผลอเก็บทับ ร่างที่เขาค้างไว้จริง ๆ จะหายไปเฉย ๆ
          syncHeaderFields();
          renderItems();
          document.title = 'แก้ไขงาน — ม่วงจดให้';
          $('#bar-sub').textContent = 'แก้ไขงาน ' + (body.job.job_number || '');
          $('#foot').textContent = 'แก้รายการแล้วกด "บันทึกงาน" ยอดรวมจะคิดใหม่ให้ค่ะ';
          toast('เปิดงานนี้มาให้แล้วค่ะ แก้รายการได้เลย ✏️');
        } else {
          toast('ไม่พบงานนี้ค่ะ', 'err');
        }
      } catch {
        toast('เปิดงานไม่สำเร็จค่ะ', 'err');
      }
    }
  } catch {
    $('#bar-sub').textContent = 'โหมดทดลอง — ยังไม่เชื่อมกับ LINE';
    $('#foot').textContent = 'เปิดนอก LINE อยู่ กด "บันทึกงาน" จะเก็บลงเครื่องเท่านั้นค่ะ';
  }
})();
