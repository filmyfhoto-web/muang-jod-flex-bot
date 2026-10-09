import { supabase } from '../config/supabase.js';
import { accountKey } from '../utils/customerBook.js';
import { round2 } from '../utils/currency.js';
import { todayISO, rangeForPeriod } from '../utils/dates.js';
import { derivePaymentFields } from '../utils/payment.js';
import { categoryFields } from '../utils/category.js';
import { ensureTaxonomy } from './categoryService.js';
import { formatJobNumber } from '../utils/jobNumber.js';
import { logger } from './logger.js';

const ACTIVE_STATUSES = ['active', 'completed'];

// เลขงาน: MJ-STP-0007 — รันแยกตามหมวด ตั้งครั้งเดียวตอนสร้าง ไม่คิดใหม่อีกเลย
// (รายละเอียดและเหตุผลอยู่ใน utils/jobNumber.js)
export { formatJobNumber };

// Pure aggregation for the "today" summary — extracted so it is unit-testable.
export function summarizeJobs(rows, dateStr) {
  let total = 0;
  let paid = 0;
  let pending = 0;
  for (const j of rows) {
    const t = Number(j.total) || 0;
    total += t;
    const p = j.paid_amount != null ? Number(j.paid_amount) || 0 : j.payment_status === 'paid' ? t : 0;
    const b = j.balance_due != null ? Number(j.balance_due) || 0 : Math.max(t - p, 0);
    paid += p;
    pending += b;
  }
  return {
    date: dateStr,
    jobCount: rows.length,
    total: round2(total),
    paid: round2(paid),
    pending: round2(pending),
  };
}

// A PostgREST error that means the RPC isn't installed (migration 002 not run).
function isMissingFunction(error) {
  if (!error) return false;
  const code = error.code || '';
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    /find the function|does not exist|schema cache/i.test(error.message || '')
  );
}

/* งานของหมวดนี้มีไปแล้วกี่ใบ — ตัวตั้งของเลขถัดไป
 *
 * นับทุกใบรวมที่ยกเลิกไปแล้วด้วย เลขที่เคยออกไปต้องไม่ถูกเอามาใช้ซ้ำ ใบที่ยื่นให้
 * ลูกค้าไปแล้วกับใบใหม่จะได้ไม่ชนกัน ส่วนการชนกันจากสองเครื่องพร้อมกัน มี unique
 * ที่ฐานข้อมูลกับการลองใหม่ข้างล่างรับไว้อยู่แล้ว
 */
async function categoryCount(userId, category, client) {
  const { count } = await client
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('category', category);
  return count || 0;
}

// Create a job plus its items. All rows are scoped to userId (profile.id).
// Prefers the atomic RPC (create_job_with_items); falls back to a JS insert
// with compensating rollback if the RPC is not installed.
export async function createJob(userId, payload, client = supabase) {
  const {
    jobName,
    items = [],
    subtotal = 0,
    discount = 0,
    total = 0,
    customerName = null,
    note = null,
    paidAmount = 0,
  } = payload;

  const jobDate = payload.jobDate || todayISO();
  const name = jobName || `งานวันที่ ${jobDate}`;
  const pay = derivePaymentFields(total, paidAmount);
  // หมวดของร้าน (ที่ร้านเพิ่ม/แก้เอง) ต้องอยู่ในหน่วยความจำก่อน — ทั้งตอนจัดหมวดจากคำค้น
  // และตอนทำเลขงาน (หมวดที่ร้านเพิ่มเองมีรหัสของตัวเอง ถ้าไม่รู้จักจะตกไปชนเลข GEN)
  await ensureTaxonomy(userId, { client });
  const auto = categoryFields(items, userId);
  const cat = {
    category: payload.category ?? auto.category,
    category_type: payload.categoryType ?? auto.category_type,
  };

  // The pickup date is stamped on AFTER the row exists rather than inserted
  // with it. The RPC does not know the column, and neither does a database
  // where migration 007 has not been run yet — and a job must not be lost
  // over a date the shop can always fill in later.
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(payload.dueDate || '')) ? payload.dueDate : null;

  // ร้านที่งานนี้สังกัด — แสตมป์ทีหลังแบบเดียวกับ due_date: RPC รุ่นเก่าไม่รู้จัก
  // ช่องนี้ และฐานข้อมูลที่ยังไม่รันไมเกรชัน 016 ก็ต้องจดงานได้เหมือนเดิม
  const branchId = payload.branchId || null;

  /* ช่องทางเงินที่พูดมาในประโยค ("อัดรูป 150 เงินสด") — แสตมป์ทีหลังเหมือนกัน
   *
   *   เงินสด/โอน + จ่ายครบ → pay_method + booked_at วันนี้: เป็น "รายรับวันนี้"
   *                           ของใบลงบัญชีทันที ไม่ต้องไปกดลงบัญชีซ้ำอีกรอบ
   *   เงินสด/โอน + มัดจำ   → จดแค่ช่องทาง ยอดยังค้าง ยังไม่ใช่รายรับเต็มวันนี้
   *   ลงบัญชี              → booked_at อย่างเดียว (ยังไม่ได้เงิน รอวางบิล)
   */
  const method = ['cash', 'transfer'].includes(payload.payMethod) ? payload.payMethod : null;
  const bookNow = payload.payMethod === 'account' || (method && pay.payment_status === 'paid');
  const moneyStamp = {
    ...(method ? { pay_method: method } : {}),
    ...(bookNow ? { booked_at: new Date().toISOString() } : {}),
  };

  const itemRows = items.map((it) => ({
    item_name: it.item_name,
    size: it.size ?? null,
    quantity: it.quantity ?? 1,
    unit: it.unit ?? null,
    unit_price: round2(it.unit_price ?? 0),
    total: round2(it.total ?? 0),
  }));

  /* เลขงานคิดที่นี่ที่เดียว แล้วส่งเข้า RPC ไปด้วย
   *
   * ของเดิม RPC เป็นคนตั้งเลขเอง (แบบรันตามวัน) ถ้าปล่อยไว้ งานที่สร้างผ่าน RPC
   * กับผ่านทางสำรองจะได้เลขคนละแบบ ตอนนี้ทั้งสองทางใช้เลขเดียวกันจากที่นี่
   *
   * ฐานข้อมูลที่ยังไม่ได้รันไมเกรชัน 011 จะไม่มี RPC ที่รับพารามิเตอร์นี้ การเรียก
   * จึงกลายเป็น "ไม่พบฟังก์ชัน" แล้วตกไปทางสำรองข้างล่าง ซึ่งตั้งเลขแบบเดียวกัน —
   * ยังไม่ได้รันไมเกรชันก็ยังได้เลขที่ถูก แค่เสียความเป็น atomic ไปชั่วคราว
   */
  const seed = await categoryCount(userId, cat.category, client);
  const firstNumber = formatJobNumber(cat.category, seed + 1);

  // 1) Preferred: atomic RPC.
  const rpc = await client.rpc('create_job_with_items', {
    p_job_number: firstNumber,
    p_category: cat.category,
    p_category_type: cat.category_type,
    p_user_id: userId,
    p_job_name: name,
    p_customer_name: customerName,
    p_job_date: jobDate,
    p_subtotal: round2(subtotal),
    p_discount: round2(discount),
    p_total: round2(total),
    p_payment_status: pay.payment_status,
    p_paid_amount: pay.paid_amount,
    p_note: note,
    p_items: itemRows,
  });

  if (!rpc.error && rpc.data) {
    let job = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
    // The RPC predates categories; stamp them on afterwards. Derived metadata,
    // so a failure here must never lose the job that was just created.
    const stamp = {
      ...(job && !job.category ? cat : {}),
      ...(dueDate ? { due_date: dueDate } : {}),
      ...(branchId ? { branch_id: branchId } : {}),
      ...moneyStamp,
    };
    if (job && Object.keys(stamp).length) {
      const { data: restamped, error: stampErr } = await client
        .from('jobs')
        .update(stamp)
        .eq('id', job.id)
        .eq('user_id', userId)
        .select('*')
        .maybeSingle();
      if (stampErr) logger.warn('job.stamp_failed', { message: stampErr.message });
      else if (restamped) job = restamped;
      else job = { ...job, ...stamp };
    }
    const [withItems] = await attachItems([job], client);
    logger.info('job.created', { via: 'rpc', jobNumber: job.job_number });
    return withItems || { ...job, items: itemRows };
  }
  if (rpc.error && !isMissingFunction(rpc.error)) {
    logger.error('job.rpc_failed', { code: rpc.error.code, message: rpc.error.message });
    throw rpc.error;
  }

  // 2) Fallback: JS insert with job_number retry + compensating rollback.
  let seq = seed;
  let job = null;
  let attempt = 0;
  while (!job) {
    attempt += 1;
    seq += 1;
    const jobNumber = formatJobNumber(cat.category, seq);
    const { data, error } = await client
      .from('jobs')
      .insert({
        user_id: userId,
        job_number: jobNumber,
        job_name: name,
        customer_name: customerName,
        job_date: jobDate,
        subtotal: round2(subtotal),
        discount: round2(discount),
        total: round2(total),
        payment_status: pay.payment_status,
        status: 'active',
        paid_amount: pay.paid_amount,
        balance_due: pay.balance_due,
        note,
        ...cat,
      })
      .select('*')
      .single();

    if (!error) {
      job = data;
      break;
    }
    if (error.code === '23505' && attempt < 25) continue; // job_number race — retry
    logger.error('job.insert_failed', { code: error.code, message: error.message });
    throw error;
  }

  const extras = { ...(dueDate ? { due_date: dueDate } : {}), ...(branchId ? { branch_id: branchId } : {}), ...moneyStamp };
  if (Object.keys(extras).length) {
    const { data: dated, error: dueErr } = await client
      .from('jobs')
      .update(extras)
      .eq('id', job.id)
      .eq('user_id', userId)
      .select('*')
      .maybeSingle();
    if (dueErr) logger.warn('job.due_stamp_failed', { message: dueErr.message });
    else if (dated) job = dated;
  }

  let insertedItems = [];
  if (itemRows.length) {
    const rows = itemRows.map((it) => ({ ...it, job_id: job.id }));
    const { data: itemData, error: itemErr } = await client
      .from('job_items')
      .insert(rows)
      .select('*');
    if (itemErr) {
      logger.error('job.items_failed_rollback', { code: itemErr.code, message: itemErr.message });
      await client.from('jobs').delete().eq('id', job.id).eq('user_id', userId);
      throw itemErr;
    }
    insertedItems = itemData;
  }

  logger.info('job.created', { via: 'fallback', jobNumber: job.job_number });
  return { ...job, items: insertedItems };
}

// Recent non-cancelled jobs (default 5), newest first, with items.
export async function getRecentJobs(userId, limit = 5, client = supabase) {
  const { data: jobs, error } = await client
    .from('jobs')
    .select('*')
    .eq('user_id', userId)
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('job.getRecent_failed', { message: error.message });
    throw error;
  }
  return attachItems(jobs || [], client);
}

/* งานทุกใบที่ยังไม่ถูกยกเลิก — ของสมุดลูกค้า
 *
 * สมุดลูกค้าจัดกลุ่มเองในเครื่อง (utils/customerBook.js) เพราะ "เจ้าเดียวกัน"
 * ตัดสินจากชื่อที่สะกดได้หลายแบบ ซึ่งเป็นกฎของร้าน ไม่ใช่ของฐานข้อมูล — ถาม
 * ฐานข้อมูลให้จัดกลุ่มให้ จะได้ รร.สบกอน สามบัญชีจากการเว้นวรรคคนละที่
 *
 * ไม่ดึง items มาด้วย: หน้าสมุดโชว์แค่ชื่องานกับยอด และงานสี่ร้อยใบคูณรายการ
 * ย่อยคือข้อมูลที่โหลดไปทิ้งเกือบทั้งหมด
 */
export async function getBookJobs(userId, limit = 400, client = supabase) {
  const { data, error } = await client
    .from('jobs')
    .select('*')
    .eq('user_id', userId)
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('job.book_failed', { message: error.message });
    throw error;
  }
  return data || [];
}

// Replace the lines inside a job.
//
// Job items were write-once: created with the job and never touched again, so
// a job entered as two lines could only ever be corrected as one lump sum.
//
// Delete-then-insert rather than a diff: the rows carry no identity the form
// could send back, and two lines that read the same are genuinely the same
// line twice. The job is re-read under this user first, so an id belonging to
// somebody else matches nothing and nothing is deleted.
export async function replaceJobItems(userId, jobId, items = [], client = supabase) {
  const { data: job, error: jobErr } = await client
    .from('jobs')
    .select('id')
    .eq('id', jobId)
    .eq('user_id', userId)
    .maybeSingle();
  if (jobErr) throw jobErr;
  if (!job) return null;

  const rows = items.map((it) => ({
    job_id: jobId,
    item_name: it.item_name,
    size: it.size ?? null,
    quantity: Number(it.quantity) || 1,
    unit: it.unit ?? null,
    unit_price: round2(Number(it.unit_price) || 0),
    total: round2(Number(it.total ?? (Number(it.unit_price) || 0) * (Number(it.quantity) || 1))),
  }));

  const { error: delErr } = await client.from('job_items').delete().eq('job_id', jobId);
  if (delErr) {
    logger.error('job.items_clear_failed', { jobId, message: delErr.message });
    throw delErr;
  }

  if (!rows.length) return [];

  const { data, error } = await client.from('job_items').insert(rows).select('*');
  if (error) {
    // The old rows are already gone. Saying so is the only honest thing left:
    // a silent failure here leaves a job whose lines have vanished and whose
    // total still claims they were there.
    logger.error('job.items_replace_failed', { jobId, message: error.message });
    throw error;
  }
  return data || [];
}

// Every job in one category, newest first — "who has ordered what" for a kind
// of work, which is the question the menu's หมวดงาน button asks.
export async function getJobsByCategory(userId, category, limit = 60, client = supabase) {
  const { data: jobs, error } = await client
    .from('jobs')
    .select('*')
    .eq('user_id', userId)
    .eq('category', category)
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('job.byCategory_failed', { message: error.message });
    throw error;
  }
  return attachItems(jobs || [], client);
}

// The single most recent non-cancelled job (with items), or null.
export async function getLatestJob(userId, client = supabase) {
  const { data: jobs, error } = await client
    .from('jobs')
    .select('*')
    .eq('user_id', userId)
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    logger.error('job.getLatest_failed', { message: error.message });
    throw error;
  }
  if (!jobs || !jobs.length) return null;
  const [withItems] = await attachItems(jobs, client);
  return withItems;
}

// หางานจากเลขงาน — เลขงานคือชื่อที่ร้านใช้เรียกใบงาน ("ย้าย MJ-SGN-0001 …")
export async function getJobByNumber(userId, jobNumber, client = supabase) {
  const number = String(jobNumber ?? '').trim();
  if (!number) return null;
  const { data, error } = await client
    .from('jobs')
    .select('*')
    .eq('user_id', userId)
    .eq('job_number', number)
    .maybeSingle();
  if (error) {
    logger.error('job.by_number_failed', { message: error.message });
    throw error;
  }
  return data || null;
}

// Fetch one job by id, verifying ownership via userId.
export async function getJobById(userId, jobId, client = supabase) {
  const { data: job, error } = await client
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    logger.error('job.getById_failed', { message: error.message });
    throw error;
  }
  if (!job) return null;
  const [withItems] = await attachItems([job], client);
  return withItems;
}

// Patch a job, always constrained by userId so users can't edit others' jobs.
export async function updateJob(userId, jobId, patch, client = supabase) {
  const allowed = {};
  const fields = [
    'job_name',
    'customer_name',
    'subtotal',
    'discount',
    'total',
    'payment_status',
    'status',
    'paid_amount',
    'balance_due',
    'job_date',
    'category',
    'category_type',
    'note',
    'picked_up_at',
    // ขั้นของงาน (ทำเสร็จ/ลงบัญชี) และวิธีรับเงิน — เดิมไม่อยู่ในรายการนี้ จึงถูกทิ้งเงียบ ๆ
    // ปุ่ม "ลงบัญชี" ตอบสำเร็จแต่ไม่เคยบันทึกลงฐานข้อมูลจริง
    'done_at',
    'booked_at',
    'pay_method',
  ];
  for (const f of fields) {
    if (patch[f] !== undefined) allowed[f] = patch[f];
  }
  allowed.updated_at = new Date().toISOString();

  const { data, error } = await client
    .from('jobs')
    .update(allowed)
    .eq('id', jobId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();

  if (error) {
    logger.error('job.update_failed', { message: error.message });
    throw error;
  }
  return data;
}

// Soft-delete: mark cancelled. Never physically DELETE.
export async function cancelJob(userId, jobId, client = supabase) {
  return updateJob(userId, jobId, { status: 'cancelled' }, client);
}

export async function updateLatestJob(userId, patch, client = supabase) {
  const latest = await getLatestJob(userId, client);
  if (!latest) return null;
  return updateJob(userId, latest.id, patch, client);
}

export async function cancelLatestJob(userId, client = supabase) {
  const latest = await getLatestJob(userId, client);
  if (!latest) return null;
  return cancelJob(userId, latest.id, client);
}

// Record a payment (increment paid_amount) and recalculate status/balance.
export async function recordPayment(userId, jobId, amount, client = supabase) {
  const job = await getJobById(userId, jobId, client);
  if (!job) return null;
  const newPaid = round2((Number(job.paid_amount) || 0) + (Number(amount) || 0));
  const fields = derivePaymentFields(job.total, newPaid);
  const updated = await updateJob(userId, jobId, fields, client);
  if (!updated) return null;
  return { ...updated, items: job.items || [] };
}

// Aggregate today's numbers for a user (Bangkok day).
export async function getTodaySummary(userId, client = supabase) {
  const date = todayISO();
  const { data: jobs, error } = await client
    .from('jobs')
    .select('total, payment_status, paid_amount, balance_due, status')
    .eq('user_id', userId)
    .in('status', ACTIVE_STATUSES)
    .eq('job_date', date);

  if (error) {
    logger.error('job.summary_failed', { message: error.message });
    throw error;
  }
  return summarizeJobs(jobs || [], date);
}

// Jobs with an outstanding balance (pending or partial), newest first.
export async function getPendingJobs(userId, client = supabase) {
  const { data: jobs, error } = await client
    .from('jobs')
    .select('*')
    .eq('user_id', userId)
    .in('payment_status', ['pending', 'partial'])
    .in('status', ACTIVE_STATUSES)
    .order('job_date', { ascending: false });

  if (error) {
    logger.error('job.pending_failed', { message: error.message });
    throw error;
  }
  return attachItems(jobs || [], client);
}

export const getPendingPayments = getPendingJobs;

// คิวงาน — งานที่ยังอยู่ในมือร้าน เรียงตามวันที่นัดรับ
//
// ร้านขอ "หน้าล่าสุด ... เป็นงานรันคิวงาน" ซึ่งไม่ใช่ "งานที่จดล่าสุด" แต่คือ
// "งานไหนต้องเสร็จก่อน" งานที่ปิดแล้ว (completed / cancelled) ออกจากคิว
//
// เรียงในโค้ดไม่ใช่ในฐานข้อมูล เพราะกติกาคือ "ไม่ได้นัดวันไว้ไปท้ายแถว" ซึ่ง
// ORDER BY ของ postgrest เขียนได้ก็จริงแต่ต่างกันไปตามเวอร์ชัน — เรียงเองอ่านง่าย
// กว่าและเทสต์ได้ตรง ๆ
export function queueOrder(jobs = []) {
  return [...jobs].sort((a, b) => {
    const da = a.due_date || '';
    const db = b.due_date || '';
    if (da !== db) {
      if (!da) return 1;
      if (!db) return -1;
      return da < db ? -1 : 1;
    }
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });
}

/* งานที่ยังไม่ลงบัญชี เรียงจากเก่าสุด — ไว้ไล่ทบทวนงานเก่าทีละหน้า
 *
 * คืน null ถ้าอ่านไม่ได้ (ยังไม่ได้รันไมเกรชัน 015 ที่เพิ่มช่อง booked_at)
 * ขอเกินหนึ่งใบเพื่อรู้ว่ามีหน้าถัดไปไหม ไม่ต้องนับทั้งตาราง
 */
export async function getUnbookedJobs(userId, { offset = 0, limit = 8 } = {}, client = supabase) {
  const { data, error } = await client
    .from('jobs')
    .select('*')
    .eq('user_id', userId)
    .in('status', ACTIVE_STATUSES)
    .is('booked_at', null)
    .order('created_at', { ascending: true })
    .range(offset, offset + limit);

  if (error) {
    logger.warn('job.unbooked_failed', { message: error.message });
    return null;
  }
  const rows = data || [];
  return { jobs: rows.slice(0, limit), hasMore: rows.length > limit };
}

// ชื่อลูกค้าที่เพิ่งจดล่าสุด ไม่ซ้ำ — ไว้ทำปุ่มเลือกชื่อ (ล้มเหลว = ไม่มีปุ่ม ไม่ใช่ error)
export async function getRecentCustomerNames(userId, limit = 8, client = supabase) {
  const { data, error } = await client
    .from('jobs')
    .select('customer_name')
    .eq('user_id', userId)
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: false })
    .limit(80);
  if (error) {
    logger.warn('job.recent_names_failed', { message: error.message });
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const row of data || []) {
    const name = String(row.customer_name || '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
    if (out.length >= limit) break;
  }
  return out;
}

/* สมุดรายชื่อลูกค้าแบบย่อ — ไว้เติมชื่อให้อัตโนมัติตอนพิมพ์
 *
 * ร้านขอ "พิมพ์ลูกค้าคนไหนที่เคยจดไว้ แสดงให้อัตโนมัติ จะได้ไม่ต้องพิมพ์" —
 * ฟอร์มจดงานและแชตใช้รายชื่อนี้เสนอชื่อเต็มแบบที่เคยจด สะกดเดียวกันทุกใบ
 * สมุดลูกค้าจึงรวมเจ้าถูก (สะกดต่างกันคือคนละบัญชี)
 *
 * ชื่อเดียวกันหลายสะกด ("รร.สบกอน" / "รร สบกอน") นับเป็นเจ้าเดียว ใช้สะกด
 * ที่จดบ่อยที่สุด เรียงเจ้าที่จดล่าสุดไว้บนสุด
 */
export async function getCustomerDirectory(userId, limit = 30, client = supabase) {
  const { data, error } = await client
    .from('jobs')
    .select('customer_name, created_at')
    .eq('user_id', userId)
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: false })
    .limit(400);
  if (error) {
    logger.warn('job.customers_failed', { message: error.message });
    return [];
  }

  const byKey = new Map(); // key -> { spellings: Map(ชื่อ -> ครั้ง), jobCount, lastAt }
  for (const row of data || []) {
    const name = String(row.customer_name || '').trim();
    const key = accountKey(name);
    if (!key) continue;
    const entry = byKey.get(key) || { spellings: new Map(), jobCount: 0, lastAt: '' };
    entry.spellings.set(name, (entry.spellings.get(name) || 0) + 1);
    entry.jobCount += 1;
    if (!entry.lastAt) entry.lastAt = row.created_at || ''; // เรียงใหม่→เก่า ตัวแรกคือล่าสุด
    byKey.set(key, entry);
  }

  return [...byKey.values()].slice(0, limit).map((e) => ({
    name: [...e.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0],
    jobCount: e.jobCount,
    lastAt: e.lastAt,
  }));
}

export async function getQueueJobs(userId, limit = 60, client = supabase) {
  const { data: jobs, error } = await client
    .from('jobs')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('job.queue_failed', { message: error.message });
    throw error;
  }
  return attachItems(queueOrder(jobs || []), client);
}


// Search a user's own jobs by job_number / job_name / customer_name.
// The DB query is scoped to the user (and non-cancelled by default); the free
// text is matched in-app so user input never becomes part of a filter string.
export async function searchJobs(userId, query, opts = {}, client = supabase) {
  const { limit = 10, includeCancelled = false } = opts;
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];

  let builder = client.from('jobs').select('*').eq('user_id', userId);
  if (!includeCancelled) builder = builder.in('status', ACTIVE_STATUSES);
  builder = builder.order('created_at', { ascending: false }).limit(500);

  const { data, error } = await builder;
  if (error) {
    logger.error('job.search_failed', { message: error.message });
    throw error;
  }

  const matched = (data || [])
    .filter((j) => {
      const hay = `${j.job_number || ''} ${j.job_name || ''} ${j.customer_name || ''}`.toLowerCase();
      return hay.includes(q);
    })
    .slice(0, limit);

  return attachItems(matched, client);
}

// Fetch all of a user's jobs (any status) recorded within a reporting period.
export async function getJobsInPeriod(userId, period = 'daily', client = supabase) {
  const range = rangeForPeriod(period);
  const { data, error } = await client
    .from('jobs')
    .select('*')
    .eq('user_id', userId)
    .gte('created_at', range.start)
    .lte('created_at', range.end)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('job.period_failed', { message: error.message, period });
    throw error;
  }
  return { rows: data || [], range };
}

// Pure report aggregation over a set of job rows. Cancelled jobs are counted
// separately and excluded from sales/averages.
export function buildReport(rows, meta = {}) {
  const active = rows.filter((j) => j.status !== 'cancelled');
  const cancelledCount = rows.length - active.length;

  let totalSales = 0;
  let paid = 0;
  let pending = 0;
  for (const j of active) {
    const t = Number(j.total) || 0;
    totalSales += t;
    const p = j.paid_amount != null ? Number(j.paid_amount) || 0 : j.payment_status === 'paid' ? t : 0;
    const b = j.balance_due != null ? Number(j.balance_due) || 0 : Math.max(t - p, 0);
    paid += p;
    pending += b;
  }

  const jobCount = active.length;
  const byCreated = [...active].sort((a, b) =>
    String(b.created_at).localeCompare(String(a.created_at))
  );
  const byValue = [...active].sort((a, b) => (Number(b.total) || 0) - (Number(a.total) || 0));

  return {
    label: meta.label || '',
    period: meta.period || null,
    periodKey: meta.periodKey || null,
    jobCount,
    cancelledCount,
    totalSales: round2(totalSales),
    paid: round2(paid),
    pending: round2(pending),
    avgPerBill: jobCount ? round2(totalSales / jobCount) : 0,
    recent: byCreated.slice(0, 5),
    top: byValue.slice(0, 5),
  };
}

// Fetch + aggregate a report for a user and period.
export async function getReport(userId, period = 'daily', client = supabase) {
  const { rows, range } = await getJobsInPeriod(userId, period, client);
  return buildReport(rows, range);
}

// Helper: load items for a list of jobs in one query, then group.
// Exported because a bill needs them too: a job holding three lines shows on
// the receipt as one amount unless the receipt can see what it is made of.
export async function attachItems(jobs, client = supabase) {
  if (!jobs.length) return [];
  const ids = jobs.map((j) => j.id);
  const { data: items, error } = await client
    .from('job_items')
    .select('*')
    .in('job_id', ids)
    .order('created_at', { ascending: true });

  if (error) {
    logger.error('job.attachItems_failed', { message: error.message });
    return jobs.map((j) => ({ ...j, items: [] }));
  }

  const byJob = new Map();
  for (const it of items || []) {
    if (!byJob.has(it.job_id)) byJob.set(it.job_id, []);
    byJob.get(it.job_id).push(it);
  }
  return jobs.map((j) => ({ ...j, items: byJob.get(j.id) || [] }));
}
