import { supabase } from '../config/supabase.js';
import { buildTaxonomy, normalizeConfig, emptyConfig, addCustomGroup } from '../utils/taxonomy.js';
import { registerTaxonomy, taxonomyOf } from '../utils/category.js';
import { logger } from './logger.js';

/* หมวดงานของร้าน — โหลด เก็บ และจำไว้ในหน่วยความจำ
 *
 * ทุกที่ที่โชว์หมวด (การ์ด ใบเสร็จ สรุป สมุดลูกค้า) เรียกฟังก์ชันที่ไม่ต้องรอ (sync) ของ
 * category.js ไม่มีใครอยากรอฐานข้อมูลเพื่ออ่านชื่อหมวดทีละการ์ด ชุดหมวดของร้านจึงถูก
 * "อุ่น" ไว้ในหน่วยความจำก่อน:
 *   - ตอนเซิร์ฟเวอร์เริ่ม (preloadTaxonomies) และทุก 10 นาที
 *   - ตอนมีคนเรียกเข้ามา (ensureTaxonomy จาก webhook / API / ก่อนสร้างงาน)
 *   - ทันทีที่ร้านกดบันทึกหมวด
 *
 * ตารางยังไม่ได้สร้าง (ไมเกรชัน 019) = ใช้ชุดตั้งต้นของระบบตามเดิม ไม่ throw
 */

export const NOT_READY_MESSAGE = 'ยังบันทึกหมวดงานไม่ได้ค่ะ — ต้องรัน migration 019_category_settings.sql ใน Supabase ก่อน';

const TTL_MS = 5 * 60_000;
const RETRY_MS = 30_000;

const loadedAt = new Map(); // userId -> เวลาที่โหลดล่าสุด (หรือเวลาที่ควรลองใหม่)
const pending = new Map(); // userId -> คำขอที่กำลังวิ่ง ไม่ยิงซ้ำซ้อน
let loadingEnabled = true;
let warned = false;

// ตัวทดสอบปิดไว้: การยิงฐานข้อมูลปลอมใช้เวลาหลายวินาทีกว่าจะล้ม และทุกเทสต์ไม่ต้องการ
// ใครอยากทดสอบจริงส่ง client มาเอง
export function setTaxonomyLoading(on) {
  loadingEnabled = Boolean(on);
}

function warnOnce(message) {
  if (warned) return;
  warned = true;
  logger.warn('category.load_failed', { message });
}

// { config } เมื่ออ่านได้ (config เป็น null ถ้ายังไม่เคยแก้) หรือ null เมื่ออ่านไม่ได้
export async function loadCategoryConfig(userId, client = supabase) {
  try {
    const { data, error } = await client
      .from('category_settings')
      .select('config')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      warnOnce(error.message);
      return null;
    }
    return { config: data?.config || null };
  } catch (err) {
    warnOnce(err?.message);
    return null;
  }
}

export async function saveCategoryConfig(userId, config, client = supabase) {
  const { error } = await client
    .from('category_settings')
    .upsert({ user_id: userId, config, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw error;
}

// จดชุดหมวดของร้านลงหน่วยความจำ (ไม่แตะฐานข้อมูล)
export function applyConfig(userId, config) {
  registerTaxonomy(userId, config ? buildTaxonomy(config) : null);
  loadedAt.set(String(userId), Date.now());
}

/* ให้แน่ใจว่าชุดหมวดของร้านนี้อยู่ในหน่วยความจำและไม่เก่าเกินไป
 *
 * ไม่เคย throw — ชุดหมวดพังต้องไม่พาการจดงานล่มไปด้วย
 */
export async function ensureTaxonomy(userId, { client, force = false } = {}) {
  if (!userId) return taxonomyOf(userId);
  const id = String(userId);
  if (!client && !loadingEnabled) return taxonomyOf(id);

  const age = Date.now() - (loadedAt.get(id) || 0);
  if (!force && loadedAt.has(id) && age < TTL_MS) return taxonomyOf(id);

  if (pending.has(id)) return pending.get(id);
  const run = (async () => {
    const got = await loadCategoryConfig(id, client);
    if (got) {
      applyConfig(id, got.config);
    } else {
      // อ่านไม่ได้ (ตารางยังไม่มี/เน็ตสะดุด): ลองใหม่อีกครั้งในไม่กี่สิบวินาที ไม่ใช่ทุกคำขอ
      loadedAt.set(id, Date.now() - TTL_MS + RETRY_MS);
    }
    return taxonomyOf(id);
  })().finally(() => pending.delete(id));
  pending.set(id, run);
  return run;
}

// ตอนเซิร์ฟเวอร์เริ่ม: โหลดชุดหมวดของทุกร้านที่เคยแก้ไว้ — ข้อความที่ร้านไม่ได้พิมพ์เอง
// (เตือนงาน ทักทาย เช็กอิน) ก็ต้องโชว์ชื่อหมวดที่ร้านตั้งไว้ ไม่ใช่ชื่อตั้งต้น
export async function preloadTaxonomies(client = supabase) {
  try {
    const { data, error } = await client.from('category_settings').select('user_id, config');
    if (error) {
      warnOnce(error.message);
      return 0;
    }
    for (const row of data || []) applyConfig(row.user_id, row.config);
    return (data || []).length;
  } catch (err) {
    warnOnce(err?.message);
    return 0;
  }
}

let timer = null;
export function startTaxonomyRefresh(everyMs = 10 * 60_000) {
  if (timer) return;
  preloadTaxonomies();
  timer = setInterval(() => preloadTaxonomies(), everyMs);
  timer.unref?.();
}

/* กี่งานที่ยังใช้หมวด/ประเภทเหล่านี้อยู่ — ใช้ก่อนยอมให้ลบหมวดที่ร้านเพิ่มเอง
 *
 * ลบหมวดที่ยังมีงานอยู่ งานพวกนั้นจะตกไปโชว์เป็น "งานทั่วไป" เงียบ ๆ และเลขงานเก่า
 * ไม่ตรงกับหมวดอีกต่อไป จึงไม่ยอมให้ลบ ซ่อนแทนได้เสมอ
 */
export async function countJobsUsing(userId, { groupIds = [], typeIds = [] } = {}, client = supabase) {
  const used = [];
  for (const id of groupIds) {
    const { count, error } = await client
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('category', id);
    if (error) throw error;
    if (count) used.push({ kind: 'group', id, count });
  }
  for (const id of typeIds) {
    const { count, error } = await client
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('category_type', id);
    if (error) throw error;
    if (count) used.push({ kind: 'type', id, count });
  }
  return used;
}

/* บันทึกหมวดทั้งชุดจากหน้าแก้ไข: ตรวจ → ไม่ให้ลบของที่ยังมีงานใช้ → เก็บ → อุ่นหน่วยความจำ
 *
 * คืน { ok: true, config } หรือ { ok: false, status, message }
 */
export async function updateCategories(userId, input, deps = {}) {
  const load = deps.loadCategoryConfig || loadCategoryConfig;
  const save = deps.saveCategoryConfig || saveCategoryConfig;
  const countUsing = deps.countJobsUsing || countJobsUsing;

  const got = await load(userId);
  if (!got) {
    return { ok: false, status: 503, message: NOT_READY_MESSAGE };
  }

  const result = normalizeConfig(input, got.config || emptyConfig());
  if (!result.ok) return { ok: false, status: 400, message: result.message };

  const { groupIds, typeIds } = result.removed;
  if (groupIds.length || typeIds.length) {
    const used = await countUsing(userId, { groupIds, typeIds });
    if (used.length) {
      const labels = labelsOf(got.config, used);
      return {
        ok: false,
        status: 409,
        message: `ลบไม่ได้ค่ะ ${labels} ยังมีงานใช้อยู่ — กด "ซ่อน" แทนได้ งานเก่ายังโชว์ชื่อหมวดเดิม`,
      };
    }
  }

  await save(userId, result.config);
  applyConfig(userId, result.config);
  return { ok: true, config: result.config };
}

/* เพิ่มหมวดเปล่าหนึ่งหมวดต่อท้าย — ตอนร้านพิมพ์ "เพิ่มหมวด …" ในแชต
 *
 * ชื่อหมวดเป็นคำค้นให้เองด้วย ("แก้วสกรีน" → พิมพ์ "แก้วสกรีน 12 ใบ 300" ก็เข้าหมวดนี้เลย)
 * ส่วนสี ไอคอน ประเภทย่อย และคำค้นอื่นปรับต่อได้ที่หน้าแก้ไขหมวด
 *
 * คืน { ok: true, group, config } หรือ { ok: false, status, message }
 */
export async function addCategory(userId, { label, icon, keys } = {}, deps = {}) {
  const load = deps.loadCategoryConfig || loadCategoryConfig;
  const save = deps.saveCategoryConfig || saveCategoryConfig;

  const got = await load(userId);
  if (!got) return { ok: false, status: 503, message: NOT_READY_MESSAGE };

  const before = new Set((got.config?.groups || []).map((g) => g.id));
  const added = addCustomGroup(got.config || emptyConfig(), { label, icon, keys: keys ?? [label] });
  if (!added.ok) return { ok: false, status: 400, message: added.message };

  await save(userId, added.config);
  applyConfig(userId, added.config);
  const group = added.config.groups.find((g) => g.custom && !before.has(g.id));
  return { ok: true, group, config: added.config };
}

function labelsOf(prevConfig, used) {
  const names = new Map();
  for (const g of prevConfig?.groups || []) {
    if (g.label) names.set(g.id, g.label);
    for (const t of g.types || []) if (t.label) names.set(t.id, t.label);
  }
  return used.map((u) => `"${names.get(u.id) || u.id}" (${u.count} งาน)`).join(', ');
}
