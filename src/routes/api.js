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
  replaceJobItems,
  buildReport,
} from '../services/jobService.js';
import { createJob, getTodaySummary } from '../services/jobService.js';
import { saveAttachment } from '../services/attachmentService.js';
import { push } from '../services/lineService.js';
import { receiptFlex } from '../flex/receiptFlex.js';
import { receiptUrl } from '../flex/billFlex.js';
import { createBill, getBillById } from '../services/billService.js';
import { derivePaymentFields } from '../utils/payment.js';
import { round2 } from '../utils/currency.js';
import { deriveJobName } from '../utils/category.js';
import { getState as readState, clearState as dropState, STATES } from '../services/stateService.js';
import { todayISO } from '../utils/dates.js';
import { safe, jobPatchSchema, jobCreateSchema, paymentAmountSchema } from '../utils/validation.js';
import { liffId, liffChannelId } from '../utils/liff.js';
import { CATEGORY_GROUPS, OTHER_GROUP, findGroup } from '../utils/category.js';
import { logger, maskUserId } from '../services/logger.js';
import { getShopProfile, saveShopProfile, SHOP_FIELDS } from '../services/shopService.js';

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

// A photo from the form, as a data: URL. Only the two types the storage
// bucket already knows, and small enough that the browser must downscale
// first — the client does that, this is the backstop.
const IMAGE_TYPES = { 'image/jpeg': true, 'image/png': true };
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 4;

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
  const todaySoFar = deps.getTodaySummary || getTodaySummary;
  const replaceItems = deps.replaceJobItems || replaceJobItems;
  // Injectable like the others above, so the routes can be exercised without a
  // database standing behind them.
  const findJob = deps.getJobById || getJobById;
  const openBill = deps.createBill || createBill;
  const readBill = deps.getBillById || getBillById;
  // Tell the chat about a job saved from the form. Never throws: the job is
  // already saved, and a chat that missed the news must not turn into a failed
  // save the user then repeats.
  async function announce(profile, job, attachmentsFailed) {
    const to = profile?.line_user_id;
    if (!to) return;
    try {
      let today = null;
      try {
        today = await todaySoFar(profile.id);
      } catch (err) {
        logger.warn('api.today_failed', { message: err?.message });
      }
      await send(to, [
        receiptFlex(job, { today }),
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
      categories: CATEGORY_GROUPS.map((g) => ({
        id: g.id,
        label: g.label,
        icon: g.icon,
        types: g.types.map((t) => ({ id: t.id, label: t.label, icon: t.icon })),
      })).concat([{ id: OTHER_GROUP.id, label: OTHER_GROUP.label, icon: OTHER_GROUP.icon, types: [] }]),
    });
  });

  // Auth for everything below.
  router.use(async (req, res, next) => {
    try {
      if (!liffId()) return res.status(503).json({ error: 'liff_not_configured' });
      const user = await verify(bearer(req), { channelId: liffChannelId() });
      if (!user) return res.status(401).json({ error: 'unauthorized' });
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
      res.json({ url, billNumber: bill.bill_number || null, reused: Boolean(job.bill_id) });
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

      const scope = req.query.scope === 'pending' ? 'pending' : 'recent';
      const jobs =
        scope === 'pending' ? await getPendingJobs(req.profile.id) : await getRecentJobs(req.profile.id, limit);
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
      const subtotal = round2(items.reduce((sum, it) => sum + (Number(it.total) || 0), 0));
      const discount = round2(Math.min(draft.discount, subtotal));
      const total = round2(subtotal - discount);

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

      // Rows sent means the lines themselves changed, and then the money is
      // theirs to state, not the browser's: a stale or edited total must never
      // be able to disagree with the rows printed under it on the receipt.
      if (items) {
        const sum = round2(items.reduce((s, it) => s + round2((Number(it.unit_price) || 0) * (Number(it.quantity) || 1)), 0));
        patch.total = round2(sum - (Number(current.discount) || 0));
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
      if (patch.total !== undefined) patch.subtotal = round2(patch.total + (Number(current.discount) || 0));

      await updateJob(req.profile.id, req.params.id, patch);
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

  router.post('/jobs/:id/payments', async (req, res, next) => {
    try {
      const check = safe(paymentAmountSchema, req.body?.amount);
      if (!check.ok) return res.status(400).json({ error: 'invalid', message: check.error });
      const job = await recordPayment(req.profile.id, req.params.id, check.data);
      if (!job) return res.status(404).json({ error: 'not_found' });
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
