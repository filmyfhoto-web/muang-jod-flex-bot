import { supabase } from '../config/supabase.js';
import { DEFAULT_BRANCHES, matchBranch } from '../utils/branch.js';
import { logger } from './logger.js';

/* ร้านของเจ้าของ — อ่าน สร้างครั้งแรก และย้ายงานเข้าร้าน
 *
 * ทุกฟังก์ชันผูกกับ userId เหมือนทุกอย่างในบอทนี้ ร้านของบัญชีหนึ่งไม่มีทางถูก
 * อ่านด้วย userId ของอีกบัญชี
 */

const FIELDS = 'id, name, slug, sort';

function sortBranches(rows = []) {
  return [...rows].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || String(a.name).localeCompare(String(b.name), 'th'));
}

/* รายชื่อร้าน สร้างร้านตั้งต้นให้ถ้ายังไม่มี
 *
 * สร้างตอนอ่านครั้งแรก ไม่ใช่ในไมเกรชัน เพราะไมเกรชันไม่รู้ว่า profile ไหนคือ
 * เจ้าของ — และบัญชีที่สมัครทีหลังก็ต้องได้ร้านตั้งต้นเหมือนกันโดยไม่ต้องรัน
 * ไมเกรชันใหม่
 */
export async function listBranches(userId, client = supabase) {
  if (!userId) return [];

  const { data, error } = await client.from('branches').select(FIELDS).eq('user_id', userId);
  if (error) {
    // ยังไม่ได้รันไมเกรชัน 016 — บอทต้องทำงานต่อได้แบบร้านเดียวเหมือนเดิม
    logger.warn('branch.list_failed', { message: error.message });
    return [];
  }
  if (data?.length) return sortBranches(data);

  return seedBranches(userId, client);
}

export async function seedBranches(userId, client = supabase) {
  const rows = DEFAULT_BRANCHES.map((b) => ({ user_id: userId, name: b.name, slug: b.slug, sort: b.sort }));
  const { data, error } = await client
    .from('branches')
    // สองเครื่องเปิดพร้อมกันแล้วสร้างชนกัน ถือว่าอีกฝั่งสร้างสำเร็จก็พอ
    .upsert(rows, { onConflict: 'user_id,slug', ignoreDuplicates: true })
    .select(FIELDS);

  if (error) {
    logger.warn('branch.seed_failed', { message: error.message });
    return [];
  }
  if (data?.length) return sortBranches(data);

  const { data: after } = await client.from('branches').select(FIELDS).eq('user_id', userId);
  return sortBranches(after || []);
}

// หาร้านจาก id, slug หรือชื่อที่พิมพ์มา — ทางเดียวที่โค้ดอื่นควรใช้
export async function resolveBranch(userId, hint, client = supabase) {
  const branches = await listBranches(userId, client);
  return pickBranch(branches, hint);
}

// ตัวเดียวกันแบบไม่แตะฐานข้อมูล สำหรับที่ที่มีรายชื่อร้านอยู่แล้ว
export function pickBranch(branches = [], hint) {
  const key = String(hint ?? '').trim();
  if (!key) return null;
  return (
    branches.find((b) => String(b.id) === key) ||
    branches.find((b) => String(b.slug).toLowerCase() === key.toLowerCase()) ||
    matchBranch(key, branches)
  );
}

/* ย้ายงานเข้าร้าน
 *
 * ตรวจว่าร้านปลายทางเป็นของเจ้าของคนเดียวกันก่อนเสมอ ไม่งั้น id ที่เดามาจาก
 * ปุ่มจะย้ายงานข้ามบัญชีได้
 */
export async function setJobBranch(userId, jobId, branchId, client = supabase) {
  if (!userId || !jobId) return null;

  let value = null;
  if (branchId) {
    const branch = await resolveBranch(userId, branchId, client);
    if (!branch) return null;
    value = branch.id;
  }

  const { data, error } = await client
    .from('jobs')
    .update({ branch_id: value })
    .eq('user_id', userId)
    .eq('id', jobId)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export { DEFAULT_BRANCHES };
