import { randomBytes } from 'node:crypto';
import { CATEGORY_GROUPS, OTHER_GROUP, createTaxonomy } from './category.js';
import { CATEGORY_CODES } from './jobNumber.js';

/* หมวดงานที่ร้านแก้เองได้
 *
 * ร้านขอ "แก้ไขหมวดงานเองได้ เพราะมันจะมีเพิ่มเติม" — ชุดตั้งต้นของระบบ (category.js)
 * เป็นแค่จุดเริ่ม ร้านเปลี่ยนชื่อ/ไอคอน/สี ซ่อนที่ไม่ใช้ เพิ่มหมวดและประเภทของตัวเอง
 * และเพิ่มคำค้นให้ม่วงจัดงานเข้าหมวดเองได้
 *
 * ที่เก็บคือเอกสารเดียวต่อร้าน (category_settings.config) เก็บเฉพาะ "สิ่งที่ร้านแก้"
 * ไม่ใช่สำเนาทั้งชุด — ชื่อ/ไอคอน/คำค้นตั้งต้นที่ร้านไม่ได้แตะ ยังตามระบบไปเรื่อย ๆ
 * เมื่อระบบปรับปรุง ไม่ถูกแช่แข็งไว้ตามวันที่ร้านกดบันทึกครั้งแรก
 *
 *   { v: 1, groups: [
 *       { id: 'print', label?, icon?, color?, hidden?, keys?, types?: [{ id, label?, icon?, hidden?, keys? }] },
 *       { id: 'c_ab12cd', custom: true, code: 'XAA', label, icon, color, hidden?, keys?, types?: [...] },
 *       { id: 'other', label?, icon?, color? } ] }
 *
 *  - ลำดับใน groups คือลำดับที่ร้านเห็น (หมวดตั้งต้นที่ไม่อยู่ในรายการ ต่อท้ายตามลำดับเดิม)
 *  - หมวดตั้งต้นลบไม่ได้ ซ่อนได้ — งานเก่าในหมวดนั้นต้องโชว์ชื่อหมวดถูกต่อไป
 *  - หมวด/ประเภทที่ร้านเพิ่มเอง ลบได้ต่อเมื่อไม่มีงานใช้อยู่ (ตรวจที่ categoryService)
 */

export const LIMITS = {
  groups: 40,
  typesPerGroup: 30,
  label: 40,
  icon: 8, // จำนวนอักขระ (code point) ไอคอนอีโมจิธรรมดา 1-2 ตัว เผื่อไว้สำหรับอีโมจิประกอบ
  keys: 20,
  keyLength: 40,
  keyMin: 2, // คำค้นหนึ่งตัวอักษรจะไปชนทุกงาน
  priceUnit: 10, // คำนับของหน่วยราคา เช่น บาน/ใบ/ผืน — คำเดียวสั้น ๆ
};

// วิธีคิดเงินที่ร้านเลือกเองได้ในหน้าแก้หมวด — tier (ตารางราคาสติ๊กเกอร์) ไม่อยู่ในนี้
// เพราะเป็นตารางเงินที่ต้องเลือกมือในฟอร์มเท่านั้น ห้ามหมวดไหนตั้งอัตโนมัติ
export const PRICE_MODES = ['sqm', 'sheet', 'piece'];

// ค่าตั้งต้นของหมวด/ประเภทที่ร้านเพิ่มเอง — ระบบไม่รู้จักงานนั้น จึงคิดต่อชิ้นไว้ก่อน
const DEFAULT_PRICE = Object.freeze({ mode: 'piece', unit: 'ชิ้น' });

// สีให้เลือกในหน้าแก้หมวด — เข้มพอที่ตัวหนังสือขาว/เทาบนพื้นสีอ่านออก
export const PALETTE = [
  '#EF4444', '#F59E0B', '#84CC16', '#14B8A6', '#06B6D4', '#6366F1',
  '#A855F7', '#EC4899', '#78716C', '#0EA5E9', '#F97316', '#10B981',
];

export const DEFAULT_ICON = '📦';

const BASE_BY_ID = new Map(CATEGORY_GROUPS.map((g) => [g.id, g]));
const BASE_CODES = new Set(Object.values(CATEGORY_CODES));
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const CUSTOM_GROUP_ID = /^c_[a-z0-9]{6}$/;
const CUSTOM_TYPE_ID = /^t_[a-z0-9]{6}$/;

export function emptyConfig() {
  return { v: 1, groups: [] };
}

// --- ทำความสะอาดค่าที่รับมา --------------------------------------------------

const asText = (v) => (typeof v === 'string' ? v.trim() : '');

function cleanLabel(v) {
  return asText(v).replace(/\s+/g, ' ').slice(0, LIMITS.label);
}

function cleanIcon(v) {
  return Array.from(asText(v)).slice(0, LIMITS.icon).join('');
}

function cleanColor(v) {
  const c = asText(v);
  return COLOR_RE.test(c) ? c.toUpperCase() : '';
}

// คำนับของหน่วยราคา เช่น "บาน" — คำสั้น ๆ คำเดียว ไม่เอาจุลภาค/ขึ้นบรรทัดใหม่
export function cleanPriceUnit(v) {
  const t = asText(v).replace(/[,\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(t).slice(0, LIMITS.priceUnit).join('').trim();
}

// หน่วยราคาที่เก็บไว้ในฐานข้อมูล → เอาเฉพาะส่วนที่ใช้ได้ ({ mode?, unit? } หรือ null)
function cleanPrice(v) {
  if (!v || typeof v !== 'object') return null;
  const out = {};
  if (PRICE_MODES.includes(v.mode)) out.mode = v.mode;
  const unit = cleanPriceUnit(v.unit);
  if (unit) out.unit = unit;
  return Object.keys(out).length ? out : null;
}

// รับทั้งอาร์เรย์และข้อความคั่นด้วยจุลภาค/ขึ้นบรรทัดใหม่ คืนเฉพาะคำที่ใช้ได้ ไม่ซ้ำ
export function cleanKeys(v) {
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,\n]/) : [];
  const out = [];
  for (const item of raw) {
    const k = asText(item).toLowerCase().replace(/\s+/g, ' ').slice(0, LIMITS.keyLength);
    if (Array.from(k).length < LIMITS.keyMin || out.includes(k)) continue;
    out.push(k);
    if (out.length >= LIMITS.keys) break;
  }
  return out;
}

function randomId(prefix, taken) {
  for (let i = 0; i < 50; i += 1) {
    const id = prefix + randomBytes(5).toString('hex').slice(0, 6).replace(/[^a-z0-9]/g, 'x');
    if (!taken.has(id)) return id;
  }
  return prefix + Date.now().toString(36).slice(-6);
}

// รหัสสามตัวทำเลขงาน MJ-XAA-0001 — ขึ้นต้นด้วย X เสมอ ไม่ชนกับหมวดตั้งต้นที่เป็นรหัสคนอ่านออก
export function allocateCode(taken) {
  const A = 'A'.charCodeAt(0);
  for (let i = 0; i < 26; i += 1) {
    for (let j = 0; j < 26; j += 1) {
      const code = 'X' + String.fromCharCode(A + i) + String.fromCharCode(A + j);
      if (!taken.has(code) && !BASE_CODES.has(code)) return code;
    }
  }
  return null;
}

// สีถัดไปที่ยังไม่มีหมวดไหนใช้ ถ้าใช้หมดแล้วก็วนกลับ
export function nextColor(used = []) {
  const taken = new Set(used.map((c) => String(c).toUpperCase()));
  return PALETTE.find((c) => !taken.has(c)) || PALETTE[taken.size % PALETTE.length];
}

// --- อ่านของที่เก็บไว้ (ทนข้อมูลเพี้ยน — ฐานข้อมูลไม่ใช่ที่ที่ไว้ใจได้เต็มที่) ----------

export function parseStored(config) {
  const groups = Array.isArray(config?.groups) ? config.groups : [];
  return {
    v: 1,
    groups: groups
      .filter((g) => g && typeof g === 'object' && typeof g.id === 'string' && g.id)
      .map((g) => ({
        ...g,
        types: Array.isArray(g.types) ? g.types.filter((t) => t && typeof t === 'object' && typeof t.id === 'string') : [],
      })),
  };
}

const pick = (v, fallback) => {
  const t = asText(v);
  return t || fallback;
};

function mergeBaseType(bt, ct = {}) {
  const priceStored = cleanPrice(ct.price); // หน่วยราคาที่ร้านตั้งทับ (เก็บเฉพาะส่วนที่ต่าง)
  return {
    ...bt,
    label: pick(ct.label, bt.label),
    icon: pick(ct.icon, bt.icon),
    hidden: ct.hidden === true,
    custom: false,
    extraKeys: cleanKeys(ct.keys),
    price: bt.price || priceStored ? { ...(bt.price || DEFAULT_PRICE), ...(priceStored || {}) } : null,
    priceStored,
    priceBase: bt.price || null,
    base: { label: bt.label, icon: bt.icon },
  };
}

// groupPrice: หน่วยราคาของหมวดที่ร้านเพิ่มเอง — ประเภทข้างในที่ไม่ได้ตั้งเองตามหมวดไป
function customType(ct, groupPrice) {
  const priceStored = cleanPrice(ct.price);
  const priceBase = groupPrice || DEFAULT_PRICE;
  return {
    id: ct.id,
    label: pick(ct.label, 'ประเภทใหม่'),
    icon: pick(ct.icon, DEFAULT_ICON),
    hint: '',
    keys: [],
    extraKeys: cleanKeys(ct.keys),
    hidden: ct.hidden === true,
    custom: true,
    priority: 100, // คำที่ร้านตั้งเองชนะคำตั้งต้นของระบบเมื่อซ้อนกัน
    price: { ...priceBase, ...(priceStored || {}) },
    priceStored,
    priceBase,
  };
}

function mergeBaseGroup(base, cg = {}) {
  const stored = new Map((cg.types || []).map((t) => [t.id, t]));
  const baseTypes = base.types.map((bt) => mergeBaseType(bt, stored.get(bt.id)));
  const baseIds = new Set(base.types.map((t) => t.id));
  const customs = (cg.types || []).filter((t) => !baseIds.has(t.id) && CUSTOM_TYPE_ID.test(t.id)).map((t) => customType(t));
  return {
    id: base.id,
    label: pick(cg.label, base.label),
    icon: pick(cg.icon, base.icon),
    color: cleanColor(cg.color) || base.color,
    hidden: cg.hidden === true,
    custom: false,
    keys: cleanKeys(cg.keys),
    base: { label: base.label, icon: base.icon, color: base.color },
    types: [...baseTypes, ...customs],
  };
}

function customGroup(cg) {
  const priceStored = cleanPrice(cg.price);
  const price = { ...DEFAULT_PRICE, ...(priceStored || {}) };
  return {
    id: cg.id,
    label: pick(cg.label, 'หมวดใหม่'),
    icon: pick(cg.icon, DEFAULT_ICON),
    color: cleanColor(cg.color) || PALETTE[0],
    hidden: cg.hidden === true,
    custom: true,
    code: typeof cg.code === 'string' ? cg.code : null,
    keys: cleanKeys(cg.keys),
    price,
    priceStored,
    priceBase: DEFAULT_PRICE,
    types: (cg.types || []).filter((t) => CUSTOM_TYPE_ID.test(t.id)).map((t) => customType(t, price)),
  };
}

// ชุดหมวดที่ใช้งานจริง = ค่าตั้งต้นของระบบ + สิ่งที่ร้านแก้ไว้
export function effective(config) {
  const cfg = parseStored(config);
  const groups = [];
  const seen = new Set();

  for (const cg of cfg.groups) {
    if (seen.has(cg.id) || cg.id === OTHER_GROUP.id) continue;
    const base = BASE_BY_ID.get(cg.id);
    if (base) groups.push(mergeBaseGroup(base, cg));
    else if (cg.custom === true && CUSTOM_GROUP_ID.test(cg.id)) groups.push(customGroup(cg));
    else continue;
    seen.add(cg.id);
  }
  for (const base of CATEGORY_GROUPS) {
    if (!seen.has(base.id)) groups.push(mergeBaseGroup(base));
  }

  const og = cfg.groups.find((g) => g.id === OTHER_GROUP.id) || {};
  const other = {
    ...OTHER_GROUP,
    label: pick(og.label, OTHER_GROUP.label),
    icon: pick(og.icon, OTHER_GROUP.icon),
    color: cleanColor(og.color) || OTHER_GROUP.color,
    base: { label: OTHER_GROUP.label, icon: OTHER_GROUP.icon, color: OTHER_GROUP.color },
  };
  return { groups, other };
}

export function buildTaxonomy(config) {
  const { groups, other } = effective(config);
  return createTaxonomy({ groups, other });
}

// --- โมเดลสำหรับหน้าแก้ไข (ส่งออก API) ------------------------------------------

export function editorModel(config) {
  const { groups, other } = effective(config);
  const typeOut = (t) => ({
    id: t.id,
    label: t.label,
    icon: t.icon,
    hidden: Boolean(t.hidden),
    custom: Boolean(t.custom),
    keys: t.extraKeys || [],
    builtinKeys: t.custom ? [] : (t.keys || []).slice(0, 8),
    base: t.base || null,
  });
  /* หน่วยราคาแยกเป็นแผนที่ของตัวเอง ไม่ปนใน groups — unit/mode คือค่าที่ร้านตั้งทับ
   * ('' = ตามค่าตั้งต้น builtinUnit/builtinMode) หมวดกับประเภทแยกกันเพราะ id ซ้ำกันได้
   * (เช่น print เป็นทั้งหมวดและประเภท) หมวดตั้งต้นไม่มีหน่วยราคาระดับหมวดจึงไม่อยู่ในนี้
   */
  const priceOut = (x) => ({
    unit: x.priceStored?.unit || '',
    builtinUnit: x.priceBase?.unit || '',
    mode: x.priceStored?.mode || '',
    builtinMode: x.priceBase?.mode || '',
  });
  const priceUnits = { groups: {}, types: {} };
  for (const g of groups) {
    if (g.custom) priceUnits.groups[g.id] = priceOut(g);
    for (const t of g.types) priceUnits.types[t.id] = priceOut(t);
  }
  return {
    groups: [
      ...groups.map((g) => ({
        id: g.id,
        label: g.label,
        icon: g.icon,
        color: g.color,
        hidden: Boolean(g.hidden),
        custom: Boolean(g.custom),
        code: g.code || CATEGORY_CODES[g.id] || null,
        keys: g.keys || [],
        base: g.base || null,
        types: g.types.map(typeOut),
      })),
      { id: other.id, label: other.label, icon: other.icon, color: other.color, hidden: false, custom: false, locked: true, code: CATEGORY_CODES.other, keys: [], base: other.base, types: [] },
    ],
    priceUnits,
    limits: LIMITS,
    palette: PALETTE,
  };
}

// --- ตรวจและทำความสะอาดก่อนบันทึก -----------------------------------------------

const fail = (message) => ({ ok: false, message });

/* หน่วยราคาที่ส่งมากับหน้าแก้ไข (ฟิลด์ unit / priceMode ข้าง ๆ label)
 *
 * เก็บเฉพาะส่วนที่ต่างจากค่าตั้งต้นของรายการนั้น — ว่างหรือเท่าค่าตั้งต้น = ตามระบบ
 * ส่วนทางที่ไม่ได้ส่งฟิลด์มาเลย (เช่น "เพิ่มหมวด" จากแชตที่วนผ่าน editorModel)
 * แปลว่าไม่ได้แตะ ให้คงของเดิมที่เก็บไว้ ไม่ใช่ล้างทิ้ง
 */
function priceOverride(raw, fallback, prevStored) {
  if (raw.unit === undefined && raw.priceMode === undefined) return cleanPrice(prevStored);
  const fb = fallback || DEFAULT_PRICE;
  const out = {};
  const mode = asText(raw.priceMode);
  if (PRICE_MODES.includes(mode) && mode !== fb.mode) out.mode = mode;
  const unit = cleanPriceUnit(raw.unit);
  if (unit && unit !== fb.unit) out.unit = unit;
  return Object.keys(out).length ? out : null;
}

/* รับโมเดลจากหน้าแก้ไข (ทั้งรายการ) → config ที่เก็บเฉพาะสิ่งที่ร้านแก้
 *
 * prev คือของเดิมในฐานข้อมูล ใช้ยืนยันว่า id ที่ส่งมาเป็นของจริง (ไม่ให้หน้าเว็บ/ใครก็ตาม
 * แต่ง id เอง) และเก็บรหัสเลขงานของหมวดเดิมไว้ — รหัสห้ามเปลี่ยน เพราะเลขงานเก่าอ้างถึง
 */
export function normalizeConfig(input, prev = emptyConfig()) {
  const list = Array.isArray(input?.groups) ? input.groups : null;
  if (!list) return fail('ข้อมูลหมวดงานไม่ถูกต้องค่ะ');
  if (list.length > LIMITS.groups + 1) return fail(`มีหมวดมากเกินไปค่ะ (ไม่เกิน ${LIMITS.groups} หมวด)`);

  const before = parseStored(prev);
  const prevCustom = new Map(before.groups.filter((g) => g.custom === true).map((g) => [g.id, g]));

  const usedGroupIds = new Set([...BASE_BY_ID.keys(), OTHER_GROUP.id, ...prevCustom.keys()]);
  const usedTypeIds = new Set([...CATEGORY_GROUPS.flatMap((g) => g.types.map((t) => t.id))]);
  for (const g of prevCustom.values()) for (const t of g.types || []) usedTypeIds.add(t.id);
  const usedCodes = new Set([...BASE_CODES, ...[...prevCustom.values()].map((g) => g.code).filter(Boolean)]);
  const usedColors = list.map((g) => cleanColor(g?.color)).filter(Boolean);

  const groups = [];
  const seenGroupIds = new Set();
  const labels = new Map(); // ป้องกันชื่อซ้ำ (ตัวพิมพ์เล็ก/ใหญ่ไม่ต่างกัน)
  let otherOut = null;

  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const sentId = asText(raw.id);

    if (sentId === OTHER_GROUP.id) {
      const o = { id: OTHER_GROUP.id };
      const label = cleanLabel(raw.label);
      if (label && label !== OTHER_GROUP.label) o.label = label;
      const icon = cleanIcon(raw.icon);
      if (icon && icon !== OTHER_GROUP.icon) o.icon = icon;
      const color = cleanColor(raw.color);
      if (color && color !== OTHER_GROUP.color) o.color = color;
      const shown = (o.label || OTHER_GROUP.label).toLowerCase();
      if (labels.has(shown)) return fail(`มีหมวดชื่อ "${o.label || OTHER_GROUP.label}" ซ้ำกันค่ะ`);
      labels.set(shown, OTHER_GROUP.id);
      otherOut = o;
      continue;
    }

    const base = BASE_BY_ID.get(sentId);
    const existingCustom = prevCustom.get(sentId);
    if (seenGroupIds.has(sentId) && sentId) return fail('มีหมวดซ้ำกันในรายการค่ะ ลองรีเฟรชหน้าแล้วทำใหม่');

    let out;
    if (base) {
      out = { id: base.id };
      const label = cleanLabel(raw.label);
      if (label && label !== base.label) out.label = label;
      const icon = cleanIcon(raw.icon);
      if (icon && icon !== base.icon) out.icon = icon;
      const color = cleanColor(raw.color);
      if (color && color !== base.color) out.color = color;
    } else {
      // หมวดที่ร้านเพิ่มเอง: ใช้ id เดิมถ้าเป็นของเดิมจริง ไม่งั้นออก id ใหม่ให้เอง
      const id = existingCustom ? sentId : randomId('c_', usedGroupIds);
      usedGroupIds.add(id);
      const label = cleanLabel(raw.label);
      if (!label) return fail('หมวดใหม่ต้องมีชื่อค่ะ');
      const code = existingCustom?.code || allocateCode(usedCodes);
      if (!code) return fail('เพิ่มหมวดไม่ได้แล้วค่ะ รหัสเลขงานเต็ม');
      usedCodes.add(code);
      out = {
        id,
        custom: true,
        code,
        label,
        icon: cleanIcon(raw.icon) || DEFAULT_ICON,
        color: cleanColor(raw.color) || nextColor([...usedColors, ...groups.map((g) => g.color).filter(Boolean)]),
      };
      const gPrice = priceOverride(raw, DEFAULT_PRICE, existingCustom?.price);
      if (gPrice) out.price = gPrice;
    }
    seenGroupIds.add(out.id);
    // ประเภทในหมวดที่ร้านเพิ่มเอง ตั้งต้นตามหมวด (หมวดตั้งต้นมีหน่วยราคาที่ประเภทอยู่แล้ว)
    const groupPrice = base ? null : { ...DEFAULT_PRICE, ...(out.price || {}) };

    if (raw.hidden === true) out.hidden = true;
    const keys = cleanKeys(raw.keys);
    if (keys.length) out.keys = keys;

    // ประเภทย่อย
    const rawTypes = Array.isArray(raw.types) ? raw.types : [];
    if (rawTypes.length > LIMITS.typesPerGroup) return fail(`หมวด "${out.label || base.label}" มีประเภทมากเกินไปค่ะ (ไม่เกิน ${LIMITS.typesPerGroup})`);
    const types = [];
    const typeLabels = new Set();
    const prevGroup = before.groups.find((g) => g.id === out.id);
    const prevTypes = new Map((prevGroup?.types || []).map((t) => [t.id, t]));
    const seenTypeIds = new Set();

    for (const rt of rawTypes) {
      if (!rt || typeof rt !== 'object') continue;
      const tid = asText(rt.id);
      const baseType = base?.types.find((t) => t.id === tid);
      let tOut;
      if (baseType) {
        tOut = { id: baseType.id };
        const label = cleanLabel(rt.label);
        if (label && label !== baseType.label) tOut.label = label;
        const icon = cleanIcon(rt.icon);
        if (icon && icon !== baseType.icon) tOut.icon = icon;
      } else {
        const known = prevTypes.has(tid);
        const label = cleanLabel(rt.label);
        if (!label) return fail('ประเภทใหม่ต้องมีชื่อค่ะ');
        const id = known ? tid : randomId('t_', usedTypeIds);
        usedTypeIds.add(id);
        tOut = { id, custom: true, label, icon: cleanIcon(rt.icon) || DEFAULT_ICON };
      }
      if (seenTypeIds.has(tOut.id)) continue;
      seenTypeIds.add(tOut.id);
      if (rt.hidden === true) tOut.hidden = true;
      const tkeys = cleanKeys(rt.keys);
      if (tkeys.length) tOut.keys = tkeys;
      const tPrice = priceOverride(rt, baseType ? baseType.price : groupPrice, prevTypes.get(tOut.id)?.price);
      if (tPrice) tOut.price = tPrice;

      const shown = (tOut.label || baseType?.label || '').toLowerCase();
      if (typeLabels.has(shown)) return fail(`หมวด "${out.label || base.label}" มีประเภท "${tOut.label || baseType.label}" ซ้ำกันค่ะ`);
      typeLabels.add(shown);
      // ประเภทตั้งต้นที่ร้านไม่ได้แตะ ไม่ต้องเก็บ (ตามระบบไปเรื่อย ๆ)
      if (baseType && Object.keys(tOut).length === 1) continue;
      types.push(tOut);
    }
    if (types.length) out.types = types;

    const shownLabel = (out.label || base?.label || '').toLowerCase();
    if (labels.has(shownLabel)) return fail(`มีหมวดชื่อ "${out.label || base.label}" ซ้ำกันค่ะ`);
    labels.set(shownLabel, out.id);

    groups.push(out);
  }

  const config = { v: 1, groups: [...groups, ...(otherOut && Object.keys(otherOut).length > 1 ? [otherOut] : [])] };

  // อะไรที่เคยเป็นของร้านเองแต่ตอนนี้หายไป = ร้านลบ
  const keptGroups = new Set(groups.map((g) => g.id));
  const keptTypes = new Set(groups.flatMap((g) => (g.types || []).map((t) => t.id)));
  const removedGroupIds = [...prevCustom.keys()].filter((id) => !keptGroups.has(id));
  const removedTypeIds = [];
  for (const g of prevCustom.values()) {
    for (const t of g.types || []) if (!keptTypes.has(t.id)) removedTypeIds.push(t.id);
  }
  // ประเภทที่ร้านเพิ่มเองใต้หมวดตั้งต้น
  for (const g of before.groups) {
    if (g.custom === true) continue;
    for (const t of g.types || []) if (CUSTOM_TYPE_ID.test(t.id) && !keptTypes.has(t.id)) removedTypeIds.push(t.id);
  }

  return { ok: true, config, removed: { groupIds: removedGroupIds, typeIds: removedTypeIds } };
}

// หมวดเปล่า ๆ ที่ร้านเพิ่มจากแชต: "เพิ่มหมวด 🥤 แก้วสกรีน"
export function parseNewCategoryName(text) {
  const raw = asText(text);
  if (!raw) return null;
  // อีโมจิหน้าชื่อ (ถ้ามี) เป็นไอคอน
  const m = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)\s*(.*)$/u.exec(raw);
  const icon = m ? m[1] : '';
  const label = cleanLabel(m ? m[2] : raw);
  if (!label) return null;
  return { label, icon: icon || DEFAULT_ICON };
}

// เพิ่มหมวดเปล่าหนึ่งหมวดต่อท้ายของเดิม — ใช้ตอนร้านพิมพ์ "เพิ่มหมวด …" ในแชต
export function addCustomGroup(config, { label, icon = DEFAULT_ICON, keys = [] }) {
  const model = editorModel(config);
  const groups = model.groups.filter((g) => !g.locked);
  const other = model.groups.find((g) => g.locked);
  const next = { id: '', label, icon, color: '', keys, types: [] };
  return normalizeConfig({ groups: [...groups, next, other] }, config);
}
