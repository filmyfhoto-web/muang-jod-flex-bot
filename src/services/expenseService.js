import { supabase } from '../config/supabase.js';
import { round2 } from '../utils/currency.js';
import { todayISO } from '../utils/dates.js';
import { logger } from './logger.js';

/* รายจ่ายของร้าน — "ซื้อกระดาษ A4 350"
 *
 * เก็บแยกจากตารางงาน: งานคือเงินเข้า (มีลูกค้า มีใบเสร็จ มีสถานะ) รายจ่ายคือ
 * เงินออก (ซื้ออะไร เท่าไหร่ จบ) ยัดลงตารางเดียวกันแล้วทุก query ของงานต้อง
 * คอยกรองรายจ่ายออกไปตลอดกาล
 *
 * ตารางยังไม่ได้สร้าง (ไมเกรชัน 020) = บอกตรง ๆ ไม่ใช่เงียบหรือล่ม
 */

export const EXPENSE_NOT_READY =
  'ยังจดรายจ่ายไม่ได้ค่ะ — ต้องรัน migration 020_expenses.sql ใน Supabase ก่อน';

const missingTable = (err) =>
  /relation .*expenses.* does not exist|schema cache/i.test(String(err?.message || ''));

export async function addExpense(userId, { item, amount, payMethod = null, branchId = null, spentDate }, client = supabase) {
  const { data, error } = await client
    .from('expenses')
    .insert({
      user_id: userId,
      item: String(item || '').trim(),
      amount: round2(amount),
      pay_method: payMethod === 'cash' || payMethod === 'transfer' ? payMethod : null,
      branch_id: branchId,
      spent_date: spentDate || todayISO(),
    })
    .select('*')
    .single();
  if (error) {
    if (missingTable(error)) return { ok: false, status: 503, message: EXPENSE_NOT_READY };
    logger.error('expense.insert_failed', { message: error.message });
    throw error;
  }
  return { ok: true, expense: data };
}

// รายจ่ายของวันหนึ่ง (ใหม่ก่อน) — อ่านพังได้ลิสต์ว่าง ไม่พาอย่างอื่นล่ม
export async function listExpenses(userId, { date = todayISO(), limit = 50 } = {}, client = supabase) {
  const { data, error } = await client
    .from('expenses')
    .select('*')
    .eq('user_id', userId)
    .eq('spent_date', date)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    if (!missingTable(error)) logger.warn('expense.list_failed', { message: error.message });
    return [];
  }
  return data || [];
}

export function sumExpenses(rows = []) {
  return round2(rows.reduce((t, r) => t + (Number(r.amount) || 0), 0));
}

// ลบ = ปิดสถานะ ไม่ลบแถวจริง (กดพลาดเอาคืนได้จากฐานข้อมูล)
export async function cancelExpense(userId, id, client = supabase) {
  const { data, error } = await client
    .from('expenses')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('user_id', userId)
    .eq('status', 'active')
    .select('*')
    .maybeSingle();
  if (error) {
    logger.warn('expense.cancel_failed', { message: error.message });
    return null;
  }
  return data || null;
}
