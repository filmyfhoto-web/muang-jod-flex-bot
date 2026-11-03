import { randomUUID } from 'node:crypto';
import { supabase, STORAGE_BUCKET } from '../config/supabase.js';
import { accountKey } from '../utils/customerBook.js';
import { missingColumn } from '../utils/dbErrors.js';
import { listCustomerOrgs } from './customerOrgService.js';
import { logger } from './logger.js';

/* หน้า "แชตและออเดอร์" — ฝั่งข้อมูล
 *
 * ความจริงของช่องทาง: ยังไม่มีการเชื่อม LINE OA หรือ Facebook เข้ากับระบบ บอทนี้
 * รับข้อความเฉพาะจากเจ้าของ และไม่เก็บ LINE user id ของลูกค้า จึงส่งข้อความถึงลูกค้า
 * ไม่ได้ ข้อความที่ร้านบันทึกไว้ในหน้านี้ = บันทึกภายในเท่านั้น จนกว่าจะมีช่องทางจริง
 *
 * ลูกค้าไม่มีตารางของตัวเอง: ดึงจากชื่อลูกค้าบนงาน (jobs.customer_name) ตามกติกาเดิม
 * ของสมุดลูกค้า (accountKey) และผูกหน่วยงานจาก customer_orgs ตามเดิม
 */

// ช่องทางแชตทั้งหมดที่หน้าจอต้องแสดง — ตอนนี้ไม่มีช่องไหนเชื่อมจริง
export const CHAT_CHANNELS = Object.freeze([
  { id: 'line_oa', label: 'LINE OA', connected: false, note: 'ยังไม่ได้เชื่อมต่อ' },
  { id: 'facebook', label: 'Facebook', connected: false, note: 'ยังไม่ได้เชื่อมต่อ' },
]);

const JOB_COLUMNS = 'id, job_number, job_name, customer_name, status, total, balance_due, created_at, done_at, picked_up_at';
const MAX_JOBS = 400;
const MAX_MESSAGES = 500;
const IMAGE_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png' };

// ชื่อที่ร้านพิมพ์บ่อยที่สุดเป็นชื่อที่โชว์ (ตรงกับตรรกะของสมุดลูกค้า)
function pickName(spellings) {
  return [...spellings.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}

/* รายชื่อลูกค้าสำหรับคอลัมน์ซ้าย
 *
 * คืนรายการเรียงจากคนที่มีความเคลื่อนไหวล่าสุด พร้อมตัวนับที่หน้าจอใช้ทำชิป:
 *   unread     = ข้อความจากลูกค้าที่ยังไม่ได้อ่าน (รอตอบ)
 *   openJobs   = งานที่ยังเปิดอยู่ (กำลังสั่งงาน)
 *   jobCount   = งานทั้งหมดที่เคยจดให้ลูกค้าคนนี้
 * ตาราง chat_messages ยังไม่ถูกสร้าง → chatReady=false และรายชื่อยังมาจากงานตามเดิม
 */
export async function listChatCustomers(userId, { client = supabase, orgsOf = listCustomerOrgs } = {}) {
  const byKey = new Map();
  const entryFor = (key) => {
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        spellings: new Map(),
        jobCount: 0,
        openJobs: 0,
        balanceDue: 0,
        unread: 0,
        lastJobAt: '',
        lastMessage: null,
      });
    }
    return byKey.get(key);
  };

  const { data: jobs, error: jobErr } = await client
    .from('jobs')
    .select(JOB_COLUMNS)
    .eq('user_id', userId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(MAX_JOBS);
  if (jobErr) throw jobErr;

  for (const job of jobs || []) {
    const name = String(job.customer_name || '').trim();
    const key = accountKey(name);
    if (!key) continue;
    const e = entryFor(key);
    e.spellings.set(name, (e.spellings.get(name) || 0) + 1);
    e.jobCount += 1;
    if (!e.lastJobAt) e.lastJobAt = job.created_at || '';
    if (job.status === 'active') {
      e.openJobs += 1;
      e.balanceDue += Number(job.balance_due) || 0;
    }
  }

  let chatReady = true;
  try {
    const { data: messages, error: msgErr } = await client
      .from('chat_messages')
      .select('customer_key, customer_name, direction, body, file_url, created_at, read_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(MAX_MESSAGES);
    if (msgErr) throw msgErr;

    for (const m of messages || []) {
      const e = entryFor(m.customer_key);
      if (!e.spellings.size && m.customer_name) e.spellings.set(m.customer_name, 1);
      if (!e.lastMessage) {
        e.lastMessage = {
          direction: m.direction,
          body: m.body || '',
          hasImage: Boolean(m.file_url),
          at: m.created_at,
        };
      }
      if (m.direction === 'in' && !m.read_at) e.unread += 1;
    }
  } catch (err) {
    chatReady = false;
    logger.warn('chat.messages_unavailable', { message: err?.message });
  }

  const orgs = await orgsOf(userId);
  const customers = [...byKey.values()]
    .map((e) => {
      const lastAt = [e.lastMessage?.at || '', e.lastJobAt].sort().reverse()[0] || '';
      return {
        key: e.key,
        name: pickName(e.spellings),
        orgName: orgs.get(e.key) || null,
        jobCount: e.jobCount,
        openJobs: e.openJobs,
        balanceDue: Math.round(e.balanceDue * 100) / 100,
        unread: e.unread,
        lastMessage: e.lastMessage,
        lastAt,
      };
    })
    .filter((c) => c.name)
    .sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)));

  return { customers, channels: CHAT_CHANNELS, chatReady };
}

// ข้อความของลูกค้าคนหนึ่ง เรียงจากเก่าไปใหม่ (ล่าสุดอยู่ท้ายสุด)
export async function listChatMessages(userId, customerKey, { client = supabase, limit = 200 } = {}) {
  const { data, error } = await client
    .from('chat_messages')
    .select('id, direction, body, file_url, file_type, created_at, read_at')
    .eq('user_id', userId)
    .eq('customer_key', customerKey)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).reverse();
}

// งานทั้งหมดของลูกค้าคนหนึ่ง (ใหม่สุดก่อน) — ใช้ทำรายการเลือกออเดอร์ในหน้า
export async function listCustomerJobs(userId, customerKey, { client = supabase, limit = 50 } = {}) {
  const { data, error } = await client
    .from('jobs')
    .select(JOB_COLUMNS)
    .eq('user_id', userId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(MAX_JOBS);
  if (error) throw error;
  return (data || []).filter((j) => accountKey(j.customer_name) === customerKey).slice(0, limit);
}

// บันทึกข้อความหนึ่งรายการ ข้อความขาออกถูกทำเครื่องหมายว่าอ่านแล้วตั้งแต่ตอนบันทึก
export async function addChatMessage(userId, { customerName, direction, body = '', fileUrl = null, fileType = null }, { client = supabase } = {}) {
  const key = accountKey(customerName);
  if (!key) throw new Error('customer name required');
  const now = new Date().toISOString();
  const { data, error } = await client
    .from('chat_messages')
    .insert({
      user_id: userId,
      customer_key: key,
      customer_name: String(customerName).trim().slice(0, 200),
      direction,
      body,
      file_url: fileUrl,
      file_type: fileType,
      read_at: direction === 'out' ? now : null,
    })
    .select('id, direction, body, file_url, file_type, created_at, read_at')
    .single();
  if (error) throw error;
  return data;
}

// อ่านแล้ว = ลูกค้าคนนี้ไม่เหลือข้อความรอตอบ
export async function markChatRead(userId, customerKey, { client = supabase } = {}) {
  const { error } = await client
    .from('chat_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('customer_key', customerKey)
    .eq('direction', 'in')
    .is('read_at', null);
  if (error) throw error;
  return { ok: true };
}

/* รูปในแชต — เก็บในที่เดียวกับรูปหลักฐานของงาน แต่คนละโฟลเดอร์
 * ชื่อไฟล์เป็น UUID เสมอ และ path ขึ้นต้นด้วย user id เหมือนของเดิม
 */
export async function saveChatImage(userId, buffer, fileType, { client = supabase } = {}) {
  const ext = IMAGE_EXT[fileType] || 'bin';
  const path = `${userId}/chat/${randomUUID()}.${ext}`;
  const { error: uploadErr } = await client.storage
    .from(STORAGE_BUCKET)
    .upload(path, buffer, { contentType: fileType, upsert: true });
  if (uploadErr) throw uploadErr;

  let fileUrl = path;
  const { data: signed } = await client.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  if (signed?.signedUrl) fileUrl = signed.signedUrl;
  return { fileUrl, fileType };
}

// งานที่มี client_ref นี้อยู่แล้ว (ส่งซ้ำ) — คืน null ถ้าไม่มี หรือยังไม่มีคอลัมน์
export async function findJobByClientRef(userId, clientRef, { client = supabase } = {}) {
  if (!clientRef) return null;
  try {
    const { data, error } = await client
      .from('jobs')
      .select('id')
      .eq('user_id', userId)
      .eq('client_ref', clientRef)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  } catch (err) {
    if (missingColumn(err, 'client_ref')) return null;
    throw err;
  }
}

export const ORDER_COLUMNS = ['customer_phone', 'fulfillment', 'handler_name', 'client_ref'];
