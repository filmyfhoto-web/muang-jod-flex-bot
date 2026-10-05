import express from 'express';
import { getOrCreateProfile } from '../services/userService.js';
import { getDashboard, breakdownByCategory } from '../services/dashboardService.js';
import {
  getRecentJobs,
  getPendingJobs,
  getJobById,
  updateJob,
  cancelJob,
  recordPayment,
  getJobsInPeriod,
  getJobsByCategory,
  getQueueJobs,
  getBookJobs,
  replaceJobItems,
  buildReport,
} from '../services/jobService.js';
import { createJob } from '../services/jobService.js';
import { parseNaturalJob } from '../utils/nlParser.js';
import { splitDump, looksLikeDump } from '../utils/dumpSplit.js';
import { makeDraft } from '../utils/jobDraft.js';
import { extractDueDate } from '../utils/thaiDate.js';
import { saveAttachment } from '../services/attachmentService.js';
import { push } from '../services/lineService.js';
import { receiptFlex } from '../flex/receiptFlex.js';
import { receiptUrl } from '../flex/billFlex.js';
import { withShopKey } from '../utils/receiptLink.js';
import { createBill, getBillById } from '../services/billService.js';
import { derivePaymentFields } from '../utils/payment.js';
import { pickupPatch, jobState, stagePatch, jobStage, JOB_STAGES } from '../utils/jobState.js';
import { round2 } from '../utils/currency.js';
import { buildBook, buildAccount } from '../utils/customerBook.js';
import { buildLedger } from '../utils/ledger.js';
import { deriveJobName } from '../utils/category.js';
import { getState as readState, clearState as dropState, STATES } from '../services/stateService.js';
import { todayISO } from '../utils/dates.js';
import { safe, jobPatchSchema, jobCreateSchema, paymentAmountSchema } from '../utils/validation.js';
import { liffId, liffChannelId } from '../utils/liff.js';
import { CATEGORY_GROUPS, OTHER_GROUP, findGroup } from '../utils/category.js';
import { logger, maskUserId } from '../services/logger.js';
import { getShopProfile, saveShopProfile, SHOP_FIELDS } from '../services/shopService.js';
import { getCheckinSettings, saveCheckinSettings } from '../services/checkinService.js';
import { normalizeSettings, toMinutes, toHHMM, DEFAULT_TZ } from '../utils/checkinSchedule.js';
import { isAllowed } from '../utils/access.js';
import { listBranches, setJobBranch } from '../services/branchService.js';

// JSON API behind the LIFF dashboard. Every request carries the LIFF access
// token; LINE tells us which channel issued it and whose it is, and from that
// LINE user id we resolve the same profile the chat bot uses — so the web view
// can never see another person's jobs.

const VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify';
const PROFILE_URL = 'https://api.line.me/v2/profile';

// Short-lived cache so one screen of the dashboard doesn't re-verify per call.
const tokenCache = new Map(); // token -> { userId, until }
const CACHE_MS = 60_000;

export async function verifyLineAccessToken(token, { fetchImpl = fetch, channelId, now = Date.now() } = {}) {
  if (!token) return null;
  const hit = tokenCache.get(token);
  if (hit && hit.until > now) return { userId: hit.userId };

  const v = await fetchImpl(`${VERIFY_URL}?access_token=${encodeURIComponent(token)}`);
  if (!v.ok) return null;
  const info = await v.json();
  if (channelId && String(info.client_id) !== String(channelId)) return null;
  if (!(Number(info.expires_in) > 0)) return null;

  const p = await fetchImpl(PROFILE_URL, { headers: { Authorization: `Bearer ${token}` } });
  if (!p.ok) return null;
  const profile = await p.json();
  if (!profile?.userId) return null;

  tokenCache.set(token, { userId: profile.userId, until: now + Math.min(CACHE_MS, Number(info.expires_in) * 1000) });
  if (tokenCache.size > 500) tokenCache.delete(tokenCache.keys().next().value);
  return { userId: profile.userId, displayName: profile.displayName, pictureUrl: profile.pictureUrl };
}

function bearer(req) {
  const h = req.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

/* ฐานข้อมูลยังไม่มีช่อง picked_up_at (ยังไม่ได้รัน migration 014)
 *
 * PostgREST ตอบรหัส PGRST204 พร้อมชื่อช่องในข้อความ ดูทั้งสองอย่างเพราะรหัส
 * เดียวกันใช้กับช่องอื่นได้ และข้อความอย่างเดียวก็เปลี่ยนถ้อยคำได้ตามเวอร์ชัน
 */
export function missingPickupColumn(err) {
  return missingColumn(err, 'picked_up_at');
}

/* ช่องที่ migration เพิ่งเพิ่ม ยังไม่มีในฐานข้อมูล
 *
 * ของเดิมเคสนี้ตกไปเป็น error 500 แล้วหน้าเว็บขึ้นว่า "บันทึกไม่สำเร็จ" เฉย ๆ
 * ปุ่มเด้งกลับที่เดิมทุกครั้ง ร้านเห็นเป็น "กดไม่ได้" โดยไม่มีอะไรบอกว่าต้อง
 * ทำอะไรถึงจะกดได้ — บอกไปตรง ๆ ดีกว่าให้เดา
 */
export function missingColumn(err, ...fields) {
  const code = String(err?.code || '');
  const text = `${err?.message || ''} ${err?.details || ''}`;
  if (!fields.some((f) => text.includes(f))) return false;
  return code === 'PGRST204' || code === '42703' || /column|schema cache/i.test(text);
}

const STAGE_COLUMNS = ['done_at', 'booked_at', 'pay_method'];

// A photo from the form, as a data: URL. Only the two types the storage
// bucket already knows, and small enough that the browser must downscale
// first — the client does that, this is the backstop.
const IMAGE_TYPES = { 'image/jpeg': true, 'image/png': true };
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 4;
// ออกบิลทีละไม่เกินเท่านี้ — กันการกดพลาดที่กวาดงานทั้งปีเข้าบิลเดียว
const MAX_BILL_JOBS = 60;

export function decodeDataUrl(value) {
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(value || ''));
  if (!m) return { error: 'ไฟล์แนบไม่ถูกต้อง' };
  const fileType = m[1].toLowerCase();
  if (!IMAGE_TYPES[fileType]) return { error: 'แนบได้เฉพาะรูป JPG หรือ PNG' };
  const buffer = Buffer.from(m[2].replace(/\s+/g, ''), 'base64');
  if (!buffer.length) return { error: 'ไฟล์แนบว่างเปล่า' };
  if (buffer.length > MAX_IMAGE_BYTES) return { error: 'รูปใหญ่เกิน 5 MB' };
  return { buffer, fileType };
}

export function createApiRouter(deps = {}) {
  const verify = deps.verify || verifyLineAccessToken;
  const resolveProfile = deps.resolveProfile || getOrCreateProfile;
  const create = deps.createJob || createJob;
  const attach = deps.saveAttachment || saveAttachment;
  const send = deps.push || push;
  const replaceItems = deps.replaceJobItems || replaceJobItems;
  // Injectable like the others above, so the routes can be exercised without a
  // database standing behind them.
  const findJob = deps.getJobById || getJobById;
  const openBill = deps.createBill || createBill;
  const readBill = deps.getBillById || getBillById;
  const saveJob = deps.updateJob || updateJob;
  const queueJobs = deps.getQueueJobs || getQueueJobs;
  const bookJobs = deps.getBookJobs || getBookJobs;
  const takePayment = deps.recordPayment || recordPayment;
  const readCheckin = deps.getCheckinSettings || getCheckinSettings;
  const branchesOf = deps.listBranches || listBranches;
  const moveToBranch = deps.setJobBranch || setJobBranch;
  const writeCheckin = deps.saveCheckinSettings || saveCheckinSettings;
  // Tell the chat about a job saved from the form. Never throws: the job is
  // already saved, and a chat that missed the news must not turn into a failed
  // save the user then repeats.
  async function announce(profile, job, attachmentsFailed) {
    const to = profile?.line_user_id;
    if (!to) return;
    try {
      await send(to, [
        receiptFlex(job),
        ...(attachmentsFailed > 0
          ? [{ type: 'text', text: `บันทึกงานแล้วค่ะ แต่แนบรูปไม่สำเร็จ ${attachmentsFailed} รูป ลองส่งรูปเข้าแชตอีกครั้งได้นะคะ 💜` }]
          : []),
      ]);
    } catch (err) {
      logger.warn('api.announce_failed', { jobId: job?.id, message: err?.message });
    }
  }

  const router = express.Router();
  // Everything is small JSON except the one route that carries a photo.
  router.use((req, res, next) =>
    (req.method === 'POST' && req.path === '/jobs'
      ? express.json({ limit: '8mb' })
      : express.json({ limit: '64kb' }))(req, res, next)
  );

  router.get('/config', (req, res) => {
    res.json({
      liffId: liffId(),
      enabled: Boolean(liffId()),
      // The edit form's two dropdowns; public, so it can render before login.
      // สีมาด้วย หน้ารายการใช้ระบายชิปชื่อลูกค้าให้แยกหมวดออกจากกันแต่ไกล
      categories: CATEGORY_GROUPS.map((g) => ({
        id: g.id,
        label: g.label,
        icon: g.icon,
        color: g.color,
        types: g.types.map((t) => ({ id: t.id, label: t.label, icon: t.icon })),
      })).concat([
        { id: OTHER_GROUP.id, label: OTHER_GROUP.label, icon: OTHER_GROUP.icon, color: OTHER_GROUP.color, types: [] },
      ]),
    });
  });

  // Auth for everything below.
  router.use(async (req, res, next) => {
    try {
      if (!liffId()) return res.status(503).json({ error: 'liff_not_configured' });
      const user = await verify(bearer(req), { channelId: liffChannelId() });
      if (!user) return res.status(401).json({ error: 'unauthorized' });
      /* หลังร้านเปิดให้เฉพาะเจ้าของ — ด่านเดียวกับที่แชตใช้
       *
       * ถ้าด่านนี้มีแต่ในแชต ใครก็ตามที่รู้ URL ของ LIFF และล็อกอิน LINE ได้
       * ก็เปิดแดชบอร์ดได้ ซึ่งเป็นประตูหลังที่กว้างกว่าแชตด้วยซ้ำ
       */
      if (!isAllowed(user.userId)) {
        logger.info('api.denied', { user: maskUserId(user.userId) });
        return res.status(403).json({ error: 'forbidden' });
      }
      req.profile = await resolveProfile(user.userId);
      next();
    } catch (err) {
      next(err);
    }
  });

  router.get('/me', async (req, res, next) => {
    try {
      const dash = await getDashboard(req.profile.id, { recentLimit: 5, includePending: true });
      res.json({
        profile: { id: req.profile.id, displayName: req.profile.display_name, pictureUrl: req.profile.picture_url },
        ...dash,
      });
    } catch (err) {
      next(err);
    }
  });

  // The shop's own details, for the receipt letterhead.
  router.get('/shop', async (req, res, next) => {
    try {
      res.json({ shop: await getShopProfile(req.profile.id) });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/shop', async (req, res, next) => {
    try {
      const patch = {};
      for (const f of SHOP_FIELDS) {
        if (f in (req.body || {})) patch[f] = req.body[f];
      }
      res.json({ shop: await saveShopProfile(req.profile.id, patch) });
    } catch (err) {
      next(err);
    }
  });

  /* ตั้งค่าการทักถามงานตามเวลา
   *
   * ไม่มีแถว = ยังไม่เคยเปิด ฟีเจอร์นี้ต้องเปิดเองก่อนเสมอ การส่งข้อความหาคน
   * ที่ไม่ได้ขอ ผิดครั้งเดียวก็กลายเป็นแอปกวนใจไปแล้ว หน้าเว็บจึงได้ค่าเริ่มต้น
   * ไปแสดง แต่ enabled เป็น false จนกว่าจะกดเปิด
   */
  router.get('/checkin', async (req, res, next) => {
    try {
      const row = await readCheckin(req.profile.id);
      res.json({ checkin: { ...normalizeSettings(row || {}), enabled: Boolean(row?.enabled) }, configured: Boolean(row) });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/checkin', async (req, res, next) => {
    try {
      const body = req.body || {};
      const patch = {};

      if ('enabled' in body) patch.enabled = Boolean(body.enabled);
      if ('displayName' in body) patch.display_name = String(body.displayName || '').slice(0, 80) || null;
      if ('message' in body) patch.preferred_message = String(body.message || '').slice(0, 300) || null;
      if ('timezone' in body) patch.timezone = String(body.timezone || DEFAULT_TZ).slice(0, 64);
      if ('skipHolidays' in body) patch.skip_holidays = Boolean(body.skipHolidays);

      // เวลาที่อ่านไม่ออกทิ้งไปเงียบ ๆ ไม่ได้ — ร้านตั้งเวลาไว้แล้วมันหายคือ
      // ร้านคิดว่าตั้งแล้ว แต่ม่วงไม่เคยมา
      if ('times' in body) {
        const raw = Array.isArray(body.times) ? body.times : [];
        const bad = raw.filter((t) => toMinutes(t) === null);
        if (bad.length) return res.status(400).json({ error: 'bad_time', message: `เวลาไม่ถูกต้อง: ${bad.join(', ')}` });
        if (!raw.length) return res.status(400).json({ error: 'no_time', message: 'ต้องมีเวลาอย่างน้อยหนึ่งช่วงค่ะ' });
        patch.reminder_times = [...new Set(raw.map((t) => toHHMM(toMinutes(t))))].sort();
      }

      if ('days' in body) {
        const days = (Array.isArray(body.days) ? body.days : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
        if (!days.length) return res.status(400).json({ error: 'no_day', message: 'ต้องเลือกอย่างน้อยหนึ่งวันค่ะ' });
        patch.active_days = [...new Set(days)].sort();
      }

      const saved = await writeCheckin(req.profile.id, req.profile.line_user_id, patch);
      res.json({ checkin: { ...normalizeSettings(saved || {}), enabled: Boolean(saved?.enabled) }, configured: true });
    } catch (err) {
      next(err);
    }
  });

  // Report for a period, with the same category split the dashboard uses.
  router.get('/report', async (req, res, next) => {
    try {
      const period = ['daily', 'weekly', 'monthly'].includes(req.query.period) ? req.query.period : 'daily';
      const { rows, range } = await getJobsInPeriod(req.profile.id, period);
      const active = (rows || []).filter((j) => j.status !== 'cancelled');
      res.json({ ...buildReport(rows || [], range), categories: breakdownByCategory(active) });
    } catch (err) {
      next(err);
    }
  });

  // The draft sitting on the preview card in the chat, so ✏️ แก้ไข can open
  // the form with it already filled in.
  //
  // Before this, ✏️ threw the draft away and asked for the whole note again —
  // which on a seven-line order for a school is a punishing answer to "the
  // fourth line is wrong". It lives in user_states already; this just hands it
  // to the browser.
  router.get('/draft', async (req, res, next) => {
    try {
      const state = await readState(req.profile.id);
      const draft = state?.state === STATES.CONFIRMING_JOB ? state?.context?.draft : null;
      res.json({ draft: draft || null });
    } catch (err) {
      next(err);
    }
  });

  /* พิมพ์ทีเดียว แล้วให้ม่วงกรอกตารางให้
   *
   * ร้านบอกว่า "ขอแบบกระชับ ตารางไม่เยอะ ไม่พิมพ์หลายรอบ" — ฟอร์มจดงานมีสิบช่อง
   * ต่อหนึ่งรายการ (ชื่อ · รายละเอียด · กว้าง · ยาว · จำนวน · หน่วย · วิธีคิด ·
   * เรต · ราคาต่อชิ้น · ยอดรวม) ซึ่งร้านต้องไล่กรอกเองทุกช่อง ทั้งที่พิมพ์
   * ประโยคเดียวในแชตแล้วม่วงอ่านออกมาตั้งนานแล้ว
   *
   * ตรงนี้คือตัวอ่านเดียวกับในแชตเป๊ะ ๆ ไม่ใช่ของใหม่ที่ต้องมาไล่แก้อีกชุด —
   * พิมพ์แบบไหนในแชตได้ ก็พิมพ์แบบนั้นในฟอร์มได้
   *
   * ไม่แตะฐานข้อมูลเลย อ่านอย่างเดียวแล้วคืนร่างให้ฟอร์มเอาไปกรอกช่อง ร้านยัง
   * ตรวจและแก้ได้ก่อนกดบันทึกเหมือนเดิม
   */
  router.post('/parse', async (req, res, next) => {
    try {
      const text = String(req.body?.text || '').trim();
      if (!text) return res.status(400).json({ error: 'invalid', message: 'ยังไม่ได้พิมพ์อะไรมาค่ะ' });

      /* หลายงานหลายลูกค้าในข้อความเดียว ก็ยังเป็นฟอร์มใบเดียว
       *
       * ฟอร์มนี้กรอกได้ทีละงาน จึงเอางานแรกมาให้ แล้วบอกไปว่ายังมีอีกกี่งาน
       * เพื่อให้ฟอร์มเตือนได้ ดีกว่ากลืนงานที่เหลือหายไปเงียบ ๆ
       */
      const dump = looksLikeDump(text) ? splitDump(text) : null;
      const first = dump?.jobs?.[0];
      const parsed = first
        ? {
            jobName: first.jobName,
            customerName: first.customerName,
            items: first.items,
            subtotal: first.subtotal,
            discount: first.discount,
            total: first.total,
            paidAmount: first.paidAmount,
          }
        : parseNaturalJob(text);

      const draft = makeDraft({
        ...parsed,
        jobDate: todayISO(),
        dueDate: extractDueDate(text).date || null,
      });

      res.json({ draft, more: dump ? Math.max(0, (dump.jobs?.length || 0) - 1) : 0 });
    } catch (err) {
      next(err);
    }
  });

  // Saved from the form, so the card in the chat is answered — leaving the
  // state set would have the next message parsed as a correction to a job that
  // is already in the database.
  router.delete('/draft', async (req, res, next) => {
    try {
      await dropState(req.profile.id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // The receipt for one job, made on the spot if it has none.
  //
  // A receipt belongs to a bill, and until now a bill could only be raised
  // from the chat — so the edit screen, which is where the shop is when they
  // finish a job, had no way to print one. This is that button's endpoint: it
  // reuses the bill the job already has rather than raising a second one for
  // work that has been billed.
  router.post('/jobs/:id/receipt', async (req, res, next) => {
    try {
      const job = await findJob(req.profile.id, req.params.id);
      if (!job) return res.status(404).json({ error: 'not_found' });

      const bill = job.bill_id
        ? await readBill(req.profile.id, job.bill_id)
        : await openBill(req.profile.id, [job.id], { customerName: job.customer_name ?? null });
      if (!bill) return res.status(409).json({ error: 'bill_failed', message: 'ออกใบเสร็จไม่สำเร็จค่ะ' });

      const url = receiptUrl(bill);
      if (!url) return res.status(503).json({ error: 'no_public_url', message: 'ยังไม่ได้ตั้งค่าที่อยู่เว็บของร้านค่ะ' });

      logger.info('api.receipt_opened', { user: maskUserId(req.profile.line_user_id), billId: bill.id });
      // url คือใบของลูกค้า ส่งต่อได้เลย ส่วน shopUrl คือใบเดียวกันที่เปิดโหมดร้าน
      // เห็นราคาที่คิดได้จริงก่อนปัดด้วย — ร้านผ่าน LINE login มาแล้วถึงได้ตัวนี้
      res.json({
        url,
        shopUrl: withShopKey(url, bill.share_token),
        billNumber: bill.bill_number || null,
        reused: Boolean(job.bill_id),
      });
    } catch (err) {
      next(err);
    }
  });

  /* สมุดลูกค้า — งานย้อนหลัง แยกเก็บทีละเจ้า
   *
   * หน่วยงานเป็นบัญชีรายเจ้า (รร.สบกอนสั่งอะไรไปบ้าง ค้างเท่าไหร่) ส่วนงาน
   * หน้าร้านรวมเป็นงานทั่วไปแล้วแยกตามหมวดงาน เพราะจ่ายจบไปตั้งแต่หน้าร้าน
   * ชื่อคนจึงไม่ใช่สิ่งที่ร้านใช้ค้น
   */
  router.get('/book', async (req, res, next) => {
    try {
      const jobs = await bookJobs(req.profile.id);
      res.json(buildBook(jobs));
    } catch (err) {
      next(err);
    }
  });

  /* บัญชีของเจ้าเดียว — งานทุกใบ แยกตามหมวดงาน
   *
   * คีย์มาทาง query ไม่ใช่ส่วนของ path เพราะชื่อเจ้าเป็นภาษาไทยและมีจุด ซึ่ง
   * เป็นสิ่งที่ path segment ทำหล่นได้ง่ายกว่า
   */
  router.get('/book/account', async (req, res, next) => {
    try {
      const key = String(req.query.key || '').trim();
      if (!key) return res.status(400).json({ error: 'invalid', message: 'ต้องบอกว่าเป็นบัญชีของใคร' });

      const account = buildAccount(await bookJobs(req.profile.id), key);
      if (!account) return res.status(404).json({ error: 'not_found' });
      res.json({ account });
    } catch (err) {
      next(err);
    }
  });

  /* ออกใบจากงานที่ติ๊กเลือกไว้
   *
   *   mode = merge  งานที่เลือกรวมเป็นใบเดียว — วางบิลโรงเรียนทีเดียวจบ
   *   mode = split  งานละใบ — ใครจ่ายใบไหนก็ตัดใบนั้น
   *
   * createBill อ่านงานใหม่ทุกใบภายใต้เจ้าของคนนี้ และรับเฉพาะใบที่ยังไม่มีบิล
   * งานของคนอื่นหรือใบที่เพิ่งถูกออกบิลไปจึงหลุดเข้ามาไม่ได้
   */
  router.post('/bills', async (req, res, next) => {
    try {
      const ids = [...new Set((Array.isArray(req.body?.jobIds) ? req.body.jobIds : []).map(String).filter(Boolean))];
      if (!ids.length) return res.status(400).json({ error: 'invalid', message: 'ยังไม่ได้เลือกงานค่ะ' });
      if (ids.length > MAX_BILL_JOBS) {
        return res.status(400).json({ error: 'invalid', message: `เลือกได้ครั้งละไม่เกิน ${MAX_BILL_JOBS} งานค่ะ` });
      }

      const split = req.body?.mode === 'split';
      const customerName = typeof req.body?.customerName === 'string' ? req.body.customerName : undefined;
      const opts = customerName === undefined ? {} : { customerName: customerName || null };

      const made = [];
      for (const group of split ? ids.map((id) => [id]) : [ids]) {
        const bill = await openBill(req.profile.id, group, opts);
        if (bill) made.push(bill);
      }

      /* ไม่ได้สักใบ = งานที่เลือกถูกออกบิลไปแล้ว หรือถูกยกเลิกไปแล้ว
       * ซึ่งไม่ใช่ความผิดพลาดของระบบ แต่เป็นเรื่องที่ร้านต้องรู้ว่าเกิดอะไรขึ้น
       */
      if (!made.length) {
        return res.status(409).json({ error: 'nothing_billed', message: 'งานที่เลือกออกใบไปแล้วค่ะ' });
      }

      logger.info('api.bills_created', {
        user: maskUserId(req.profile.line_user_id),
        mode: split ? 'split' : 'merge',
        bills: made.length,
        jobs: made.reduce((n, b) => n + (b.jobs?.length || 0), 0),
      });

      res.status(201).json({
        bills: made.map((bill) => ({
          id: bill.id,
          billNumber: bill.bill_number || null,
          customerName: bill.customer_name || null,
          total: bill.total,
          jobCount: bill.jobs?.length || 0,
          url: receiptUrl(bill) || null,
        })),
        // เลือกมา 4 ใบ ได้บิล 3 ใบ = มีใบนึงถูกออกไปก่อนหน้าแล้ว บอกไว้ให้เห็น
        requested: ids.length,
        billed: made.reduce((n, b) => n + (b.jobs?.length || 0), 0),
      });
    } catch (err) {
      next(err);
    }
  });

  /* ใบลงบัญชีประจำวัน — เงินที่รับมาจริงทั้งวัน แยกเงินสดกับเงินโอน
   *
   * คนละใบกับใบเสร็จ: ใบเสร็จเป็นของลูกค้าทีละเจ้า ใบนี้เป็นของคนทำบัญชี
   */
  router.get('/ledger', async (req, res, next) => {
    try {
      const wanted = String(req.query.date || '').trim();
      const date = /^\d{4}-\d{2}-\d{2}$/.test(wanted) ? wanted : todayISO();
      res.json(buildLedger(await bookJobs(req.profile.id), date));
    } catch (err) {
      next(err);
    }
  });

  router.get('/jobs', async (req, res, next) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);

      // ?category=sign — every job of one kind, which is what the หมวดงาน
      // button opens. Only a category that exists: an unknown id would come
      // back as an empty list that looks like "you have never done this",
      // rather than "there is no such thing".
      const wanted = String(req.query.category || '').trim();
      if (wanted) {
        const group = findGroup(wanted);
        if (!group) return res.status(400).json({ error: 'unknown_category' });
        const jobs = await getJobsByCategory(req.profile.id, group.id, 60);
        return res.json({ jobs, category: { id: group.id, label: group.label, icon: group.icon } });
      }

      // queue = งานที่ยังอยู่ในมือ เรียงตามวันนัดรับ · pending = ยังไม่ได้เงิน
      // · recent = ที่จดล่าสุด
      const scope = ['pending', 'queue'].includes(req.query.scope) ? req.query.scope : 'recent';
      const jobs =
        scope === 'pending'
          ? await getPendingJobs(req.profile.id)
          : scope === 'queue'
            ? await queueJobs(req.profile.id, limit)
            : await getRecentJobs(req.profile.id, limit);
      res.json({ jobs });
    } catch (err) {
      next(err);
    }
  });

  // Create a job from the LIFF form. The browser sends the rows; the money is
  // added up here, so a tampered or simply stale total can't be saved.
  router.post('/jobs', async (req, res, next) => {
    try {
      const { image, images, ...body } = req.body || {};
      const check = safe(jobCreateSchema, body);
      if (!check.ok) return res.status(400).json({ error: 'invalid', message: check.error });

      // Decode before saving: a job with an unusable attachment should fail
      // as a whole, not leave a saved job the photo never reached.
      const sent = [...(Array.isArray(images) ? images : []), image].filter(Boolean).slice(0, MAX_IMAGES);
      const files = [];
      for (const one of sent) {
        const file = decodeDataUrl(one);
        if (file.error) return res.status(400).json({ error: 'invalid', message: file.error });
        files.push(file);
      }

      const draft = check.data;
      const items = draft.items.map((it) => ({
        ...it,
        total: round2(it.total ?? Number(it.unit_price) * Number(it.quantity)),
      }));
      // subtotal คือราคาที่คิดได้จากรายการ — เซิร์ฟเวอร์บวกเอง ไม่เชื่อเบราว์เซอร์
      // total คือราคาที่ร้านเก็บลูกค้า ซึ่งเป็นสิทธิ์ของร้านที่จะตั้ง (ปัดขึ้นเป็น
      // เลขกลม ๆ หรือลดให้) ส่วนต่างไปอยู่ที่ discount ติดลบได้ = ปัดขึ้น
      const rowsSum = round2(items.reduce((sum, it) => sum + (Number(it.total) || 0), 0));
      // ปกติราคาที่คิดได้คือผลบวกของรายการ แต่ร้านพิมพ์ทับได้ — เป็นตัวเลขของ
      // ร้านล้วน ๆ ไม่เคยขึ้นใบที่ลูกค้าถือ จึงไม่มีอะไรให้ขัดกันบนใบเสร็จ
      const subtotal = draft.listedTotal === null || draft.listedTotal === undefined ? rowsSum : round2(draft.listedTotal);
      const asked = draft.customerTotal;
      const total =
        asked === null || asked === undefined
          ? round2(subtotal - round2(Math.min(draft.discount, subtotal)))
          : round2(asked);
      const discount = round2(subtotal - total);

      const job = await create(req.profile.id, {
        jobName: draft.jobName?.trim() || deriveJobName(items),
        customerName: draft.customerName || null,
        jobDate: draft.jobDate || todayISO(),
        dueDate: draft.dueDate || null,
        items,
        subtotal,
        discount,
        total,
        paidAmount: round2(Math.min(draft.paidAmount, total)),
        note: draft.note || null,
      });

      // The job is saved by now. A failed upload must not throw that away, so
      // it is reported alongside the job rather than as an error.
      let attached = 0;
      for (const file of files) {
        try {
          await attach(req.profile.id, job, { messageId: null, buffer: file.buffer, fileType: file.fileType });
          attached += 1;
        } catch (err) {
          logger.warn('api.attachment_failed', { jobId: job.id, message: err?.message });
        }
      }

      // Saving from the form is a web request, not a chat message, so there is
      // no reply token and nothing lands in the chat by itself — the job just
      // silently exists. Push the same receipt the chat flow shows, so a job
      // looks the same wherever it was jotted, and the chat stays the record.
      const failed = files.length - attached;
      await announce(req.profile, job, failed);

      logger.info('api.job_created', { user: maskUserId(req.profile.line_user_id), jobId: job.id });
      res.status(201).json({ job, attached, attachmentsFailed: failed });
    } catch (err) {
      next(err);
    }
  });

  router.get('/jobs/:id', async (req, res, next) => {
    try {
      const job = await findJob(req.profile.id, req.params.id);
      if (!job) return res.status(404).json({ error: 'not_found' });
      res.json({ job });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/jobs/:id', async (req, res, next) => {
    try {
      const check = safe(jobPatchSchema, req.body || {});
      if (!check.ok) return res.status(400).json({ error: 'invalid', message: check.error });
      const current = await findJob(req.profile.id, req.params.id);
      if (!current) return res.status(404).json({ error: 'not_found' });

      const { items, ...patch } = check.data;

      // Rows sent means the lines themselves changed, and the price those rows
      // add up to is not the browser's to state: a stale or edited number must
      // never disagree with the lines printed under it on the receipt. That
      // computed price is `subtotal` — the one the shop keeps for itself.
      //
      // `total` is a different thing: what the shop decided to charge. Rounding
      // 4,931.43 up to 5,000 is the shop's call, so that one IS taken as sent.
      // ราคายังไม่ปัดที่ร้านพิมพ์ทับมาเอง (ถ้ามี) ชนะผลบวกของรายการ มันเป็น
      // ตัวเลขของร้าน ไม่ได้อยู่บนใบที่ลูกค้าถือ จึงไม่ทำให้อะไรบนใบเสร็จขัดกัน
      const statedListed = patch.subtotal;
      if (items) {
        const sum = round2(items.reduce((s, it) => s + round2((Number(it.unit_price) || 0) * (Number(it.quantity) || 1)), 0));
        patch.subtotal = statedListed === undefined ? sum : round2(statedListed);
        // ไม่ได้บอกราคาลูกค้ามาด้วย = ให้เท่ากับที่คิดได้ใหม่ การแก้รายการแล้ว
        // ปล่อยให้ยอดปัดของเดิมค้างอยู่ทำให้เงินกับบรรทัดไม่ตรงกัน
        if (patch.total === undefined) patch.total = patch.subtotal;
        await replaceItems(req.profile.id, req.params.id, items);
      }

      // Keep money fields consistent, the same way the chat edit flow does.
      const total = patch.total !== undefined ? round2(patch.total) : round2(current.total);
      if (patch.payment_status === 'paid') {
        Object.assign(patch, derivePaymentFields(total, total));
      } else if (patch.payment_status === 'pending') {
        Object.assign(patch, derivePaymentFields(total, 0));
      } else if (patch.paid_amount !== undefined || patch.total !== undefined) {
        const paid = patch.paid_amount !== undefined ? round2(patch.paid_amount) : round2(current.paid_amount);
        Object.assign(patch, derivePaymentFields(total, Math.min(paid, total)));
      }
      // ราคาที่คิดได้ (subtotal) กับราคาที่เก็บลูกค้า (total) เดินคู่กันเสมอ
      // ส่วนต่างคือยอดที่ร้านปัดขึ้น (ติดลบ) หรือลดให้ (เป็นบวก)
      if (patch.total !== undefined || patch.subtotal !== undefined) {
        const listed =
          patch.subtotal !== undefined
            ? round2(patch.subtotal)
            : round2(Number(current.subtotal) || Number(current.total) || 0);
        patch.subtotal = listed;
        patch.discount = round2(listed - total);
      }

      await saveJob(req.profile.id, req.params.id, patch);
      const job = await findJob(req.profile.id, req.params.id);
      logger.info('api.job_updated', { user: maskUserId(req.profile.line_user_id), jobId: req.params.id });
      res.json({ job });
    } catch (err) {
      next(err);
    }
  });

  router.post('/jobs/:id/cancel', async (req, res, next) => {
    try {
      const job = await cancelJob(req.profile.id, req.params.id);
      if (!job) return res.status(404).json({ error: 'not_found' });
      logger.info('api.job_cancelled', { user: maskUserId(req.profile.line_user_id), jobId: req.params.id });
      res.json({ job });
    } catch (err) {
      next(err);
    }
  });

  /* ปุ่มสามปุ่มบนคิวงาน: ✅ รับแล้ว · 📛 ค้างจ่าย · ❎ ยังไม่มารับ
   *
   * แยกจาก PATCH /jobs/:id เพราะนี่ไม่ใช่การแก้ข้อมูลงาน แต่เป็นการบอกว่า
   * "เกิดอะไรขึ้นกับงานนี้แล้ว" — และการกดปุ่มเดียวไม่ควรต้องรู้ว่าเบื้องหลัง
   * มันแตะสี่ช่อง (เวลาที่มารับ ยอดที่จ่าย ยอดคงเหลือ สถานะการจ่าย)
   */
  router.post('/jobs/:id/state', async (req, res, next) => {
    try {
      const want = String(req.body?.state || '');
      const current = await findJob(req.profile.id, req.params.id);
      if (!current) return res.status(404).json({ error: 'not_found' });

      const patch = pickupPatch(current, want);
      if (!patch) return res.status(400).json({ error: 'invalid', message: 'unknown state' });

      /* ช่อง picked_up_at ยังไม่มีในฐานข้อมูล = ยังไม่ได้รัน migration 014
       *
       * ของเดิมเคสนี้ตกไปเป็น error 500 แล้วหน้าเว็บขึ้นว่า "บันทึกไม่สำเร็จ"
       * เฉย ๆ ปุ่มเด้งกลับที่เดิมทุกครั้ง ร้านเห็นเป็น "กดไม่ได้" โดยไม่มีอะไร
       * บอกว่าต้องทำอะไรถึงจะกดได้ — บอกไปตรง ๆ ดีกว่าให้เดา
       */
      try {
        await saveJob(req.profile.id, req.params.id, patch);
      } catch (err) {
        if (missingPickupColumn(err)) {
          logger.warn('api.job_state_no_column', { jobId: req.params.id });
          return res.status(503).json({
            error: 'not_ready',
            message: 'ยังเปิดใช้ปุ่มนี้ไม่ได้ค่ะ — ต้องรัน migration 014_job_pickup.sql ใน Supabase ก่อน',
          });
        }
        throw err;
      }
      const job = await findJob(req.profile.id, req.params.id);
      logger.info('api.job_state', {
        user: maskUserId(req.profile.line_user_id),
        jobId: req.params.id,
        state: jobState(job),
      });
      res.json({ job });
    } catch (err) {
      next(err);
    }
  });

  /* แตะช่องในตารางสี่ขั้น — งานเดินถึงขั้นนั้น
   *
   * ส่งขั้นที่ต้องการมาทั้งตัว ไม่ใช่ "เดินหน้าหนึ่งขั้น" เพราะหน้าจอกับ
   * ฐานข้อมูลอาจไม่ตรงกันถ้าเปิดสองเครื่อง — บอกปลายทางมา แล้วผลลัพธ์จะ
   * เหมือนกันไม่ว่ากดจากที่ไหน กี่ครั้ง
   */
  router.post('/jobs/:id/stage', async (req, res, next) => {
    try {
      const current = await findJob(req.profile.id, req.params.id);
      if (!current) return res.status(404).json({ error: 'not_found' });

      const patch = stagePatch(current, req.body?.stage);
      if (!patch) {
        return res.status(400).json({ error: 'invalid', message: 'ขั้นที่ส่งมาไม่มีอยู่จริงค่ะ' });
      }

      try {
        await saveJob(req.profile.id, req.params.id, patch);
      } catch (err) {
        if (missingColumn(err, ...STAGE_COLUMNS)) {
          logger.warn('api.job_stage_no_column', { jobId: req.params.id });
          return res.status(503).json({
            error: 'not_ready',
            message: 'ยังเปิดใช้ปุ่มนี้ไม่ได้ค่ะ — ต้องรัน migration 015_job_stages.sql ใน Supabase ก่อน',
          });
        }
        throw err;
      }

      const job = await findJob(req.profile.id, req.params.id);
      logger.info('api.job_stage', {
        user: maskUserId(req.profile.line_user_id),
        jobId: req.params.id,
        stage: jobStage(job),
      });
      res.json({ job, stage: jobStage(job), stages: JOB_STAGES.map((s) => s.label) });
    } catch (err) {
      next(err);
    }
  });

  // รายชื่อร้านของเจ้าของ — หน้าแก้ไขงานใช้ทำตัวเลือก "ลงร้านไหน"
  router.get('/branches', async (req, res, next) => {
    try {
      res.json({ branches: await branchesOf(req.profile.id) });
    } catch (err) {
      next(err);
    }
  });

  /* งานนี้สังกัดร้านไหน — "ห้ามนำงานมาปนกัน"
   *
   * body.branch เป็น slug หรือ id ของร้าน หรือ null เพื่อถอดออกเป็น "ยังไม่ระบุ"
   * การตรวจว่าร้านปลายทางเป็นของบัญชีเดียวกันอยู่ใน setJobBranch แล้ว
   */
  router.post('/jobs/:id/branch', async (req, res, next) => {
    try {
      const current = await findJob(req.profile.id, req.params.id);
      if (!current) return res.status(404).json({ error: 'not_found' });

      const want = req.body?.branch ?? null;
      let job;
      try {
        job = await moveToBranch(req.profile.id, req.params.id, want);
      } catch (err) {
        if (missingColumn(err, 'branch_id')) {
          logger.warn('api.job_branch_no_column', { jobId: req.params.id });
          return res.status(503).json({
            error: 'not_ready',
            message: 'ยังย้ายร้านไม่ได้ค่ะ — ต้องรัน migration 016_branches.sql ใน Supabase ก่อน',
          });
        }
        throw err;
      }
      if (!job) return res.status(400).json({ error: 'invalid', message: 'ไม่พบร้านที่เลือกค่ะ' });

      logger.info('api.job_branch', { user: maskUserId(req.profile.line_user_id), jobId: req.params.id });
      res.json({ job });
    } catch (err) {
      next(err);
    }
  });

  router.post('/jobs/:id/payments', async (req, res, next) => {
    try {
      const check = safe(paymentAmountSchema, req.body?.amount);
      if (!check.ok) return res.status(400).json({ error: 'invalid', message: check.error });
      const job = await takePayment(req.profile.id, req.params.id, check.data);
      if (!job) return res.status(404).json({ error: 'not_found' });

      /* เงินสดหรือโอน — ใบลงบัญชีต้องแยก เพราะเงินสดอยู่ในลิ้นชัก เงินโอน
       * อยู่ในบัญชีธนาคาร คนทำบัญชีกระทบยอดคนละทาง
       *
       * ไม่ได้บอกมาก็ไม่เดา: ว่างคือ "ยังไม่ได้บอก" ซึ่งไม่เหมือนเงินสด
       */
      const method = req.body?.method;
      if (method === 'cash' || method === 'transfer') {
        try {
          const marked = await saveJob(req.profile.id, req.params.id, { pay_method: method });
          if (marked) return res.json({ job: marked });
        } catch (err) {
          // เงินลงไปแล้ว การจดวิธีจ่ายไม่ผ่านต้องไม่ทำให้ยอดที่รับมาหายไปด้วย
          if (!missingColumn(err, 'pay_method')) throw err;
          logger.warn('api.pay_method_no_column', { jobId: req.params.id });
        }
      }

      res.json({ job });
    } catch (err) {
      next(err);
    }
  });

  // Errors: log server-side, never leak internals to the browser.
  // eslint-disable-next-line no-unused-vars
  router.use((err, req, res, next) => {
    logger.error('api.failed', { path: req.path, message: err?.message });
    res.status(500).json({ error: 'internal' });
  });

  return router;
}

export default createApiRouter();
