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
  buildReport,
} from '../services/jobService.js';
import { createJob } from '../services/jobService.js';
import { saveAttachment } from '../services/attachmentService.js';
import { derivePaymentFields } from '../utils/payment.js';
import { round2 } from '../utils/currency.js';
import { deriveJobName } from '../utils/category.js';
import { todayISO } from '../utils/dates.js';
import { safe, jobPatchSchema, jobCreateSchema, paymentAmountSchema } from '../utils/validation.js';
import { liffId, liffChannelId } from '../utils/liff.js';
import { CATEGORY_GROUPS, OTHER_GROUP } from '../utils/category.js';
import { logger, maskUserId } from '../services/logger.js';

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

  router.get('/jobs', async (req, res, next) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
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

      logger.info('api.job_created', { user: maskUserId(req.profile.line_user_id), jobId: job.id });
      res.status(201).json({ job, attached, attachmentsFailed: files.length - attached });
    } catch (err) {
      next(err);
    }
  });

  router.get('/jobs/:id', async (req, res, next) => {
    try {
      const job = await getJobById(req.profile.id, req.params.id);
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
      const current = await getJobById(req.profile.id, req.params.id);
      if (!current) return res.status(404).json({ error: 'not_found' });

      const patch = { ...check.data };
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
      const job = await getJobById(req.profile.id, req.params.id);
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
