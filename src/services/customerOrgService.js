import { supabase } from '../config/supabase.js';
import { accountKey } from '../utils/customerBook.js';
import { logger } from './logger.js';

/* ชื่อหน่วยงานของลูกค้า — "ครูแนน" → "โรงเรียนพระธาตุพิทยาคม"
 *
 * อ่านไม่ได้ (ยังไม่ได้รันไมเกรชัน 018) = ไม่มีการผูกเลย สมุดลูกค้ายังเปิดได้
 * เหมือนเดิม
 */

// Map: customer_key -> org_name
export async function listCustomerOrgs(userId, client = supabase) {
  const out = new Map();
  if (!userId) return out;
  try {
    const { data, error } = await client.from('customer_orgs').select('customer_key, org_name').eq('user_id', userId);
    if (error) {
      logger.warn('customer_org.list_failed', { message: error.message });
      return out;
    }
    for (const row of data || []) out.set(row.customer_key, row.org_name);
  } catch (err) {
    logger.warn('customer_org.list_failed', { message: err?.message });
  }
  return out;
}

// orgName ว่าง = เลิกผูก
export async function setCustomerOrg(userId, { customerName, orgName }, client = supabase) {
  const key = accountKey(customerName);
  if (!userId || !key) return { ok: false, message: 'ต้องบอกชื่อลูกค้าก่อนค่ะ' };

  const org = String(orgName ?? '').trim().slice(0, 200);
  if (!org) {
    const { error } = await client.from('customer_orgs').delete().eq('user_id', userId).eq('customer_key', key);
    if (error) throw error;
    return { ok: true, orgName: null };
  }

  const { error } = await client.from('customer_orgs').upsert(
    { user_id: userId, customer_key: key, customer_name: String(customerName).trim().slice(0, 200), org_name: org },
    { onConflict: 'user_id,customer_key' }
  );
  if (error) throw error;
  return { ok: true, orgName: org };
}
