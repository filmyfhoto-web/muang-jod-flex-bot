// แอปจำลองป้าย ↔ งานในม่วงจด (ใช้ตั๋วจาก src/utils/mockupTicket.js — ร้านกด "ทำภาพ 3 มิติ" บนงานในม่วงจด)
//
//   GET  /sign/api/job/:ticket              ข้อมูลงานสำหรับเติมแอปให้เอง: เลขงาน ชื่องาน ลูกค้า ขนาด (ซม.) รูปที่แนบ
//   GET  /sign/api/job/:ticket/image/:id    รูปที่แนบในงาน (ส่งผ่านเซิร์ฟเวอร์ แคนวาสในแอปอ่านพิกเซลได้)
//   POST /sign/api/job/:ticket/mockup       { image: data:image/jpeg…, link? } → แนบภาพจำลองเข้างาน + ลิงก์ 3 มิติลงหมายเหตุงาน
//
// ตั๋วใช้ได้กับงานเดียว เจ้าของเดียว (ตรวจซ้ำกับฐานข้อมูลทุกครั้ง — งานที่ถูกลบ/ไม่ใช่ของเจ้าของตั๋วเปิดไม่ได้)

import express from 'express';
import { getJobById, updateJob } from '../services/jobService.js';
import { listJobImages, readJobImage, saveAttachment } from '../services/attachmentService.js';
import { readTicket, jobForMockup, noteWithLink } from '../utils/mockupTicket.js';
import { rateLimiter } from '../utils/signShare.js';

const MESSAGES = {
  bad_ticket: 'ลิงก์งานนี้ไม่ถูกต้อง — เปิดใหม่จากปุ่ม “ทำภาพ 3 มิติ” ในม่วงจด',
  expired: 'ลิงก์งานหมดอายุแล้ว (3 วัน) — เปิดใหม่จากปุ่ม “ทำภาพ 3 มิติ” ในม่วงจด',
  not_found: 'ไม่พบงานนี้ในม่วงจดแล้ว (อาจถูกยกเลิก)',
  bad_image: 'ภาพจำลองไม่ถูกต้อง ลองกดบันทึกอีกครั้ง',
  too_large: 'ภาพใหญ่เกินไป',
  rate_limited: 'บันทึกถี่เกินไป รอสักครู่แล้วลองใหม่',
  save_failed: 'บันทึกเข้างานไม่สำเร็จ ลองใหม่อีกครั้ง',
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// data:image/jpeg|png;base64,… → { buffer, fileType } หรือ { error }
export function decodeImage(value) {
  const m = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(String(value || ''));
  if (!m) return { error: 'bad_image' };
  const buffer = Buffer.from(m[2], 'base64');
  if (buffer.length < 100) return { error: 'bad_image' };
  if (buffer.length > MAX_IMAGE_BYTES) return { error: 'too_large' };
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
  const png = buffer[0] === 0x89 && buffer[1] === 0x50;
  if ((m[1] === 'image/jpeg' && !jpeg) || (m[1] === 'image/png' && !png)) return { error: 'bad_image' };
  return { buffer, fileType: m[1] };
}

function clientKey(req) {
  return String(req.get('x-forwarded-for') || req.ip || '').split(',')[0].trim() || 'unknown';
}

export function createSignJobRouter(deps = {}) {
  const read = deps.readTicket || readTicket;
  const findJob = deps.getJobById || getJobById;
  const imagesOf = deps.listJobImages || listJobImages;
  const imageOf = deps.readJobImage || readJobImage;
  const attach = deps.saveAttachment || saveAttachment;
  const saveJob = deps.updateJob || updateJob;
  const allow = deps.allow || rateLimiter({ perHour: 60, perDay: 2000 });
  const router = express.Router();

  router.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    next();
  });

  // ตั๋ว → งานของเจ้าของตั๋ว (ตอบข้อความไทยเองเมื่อใช้ไม่ได้)
  async function jobOf(req, res) {
    const t = read(req.params.ticket);
    if (!t) {
      res.status(403).json({ error: 'bad_ticket', message: MESSAGES.bad_ticket });
      return null;
    }
    if (t.expired) {
      res.status(410).json({ error: 'expired', message: MESSAGES.expired });
      return null;
    }
    const job = await findJob(t.userId, t.jobId);
    if (!job || job.status === 'cancelled') {
      res.status(404).json({ error: 'not_found', message: MESSAGES.not_found });
      return null;
    }
    return { t, job };
  }

  router.get('/:ticket', async (req, res, next) => {
    try {
      const got = await jobOf(req, res);
      if (!got) return;
      const images = await imagesOf(got.job.id);
      res.json({ job: jobForMockup(got.job, images), expires: got.t.expires });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:ticket/image/:id', async (req, res, next) => {
    try {
      if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(404).end();
      const got = await jobOf(req, res);
      if (!got) return;
      const img = await imageOf(got.job.id, req.params.id);
      if (!img) return res.status(404).end();
      res.set('Cache-Control', 'private, max-age=600').type(img.fileType).send(img.buffer);
    } catch (err) {
      next(err);
    }
  });

  router.post('/:ticket/mockup', express.json({ limit: '8mb' }), async (req, res, next) => {
    try {
      if (!allow(clientKey(req))) return res.status(429).json({ error: 'rate_limited', message: MESSAGES.rate_limited });
      const got = await jobOf(req, res);
      if (!got) return;
      const img = decodeImage(req.body?.image);
      if (img.error) return res.status(img.error === 'too_large' ? 413 : 400).json({ error: img.error, message: MESSAGES[img.error] });
      try {
        await attach(got.t.userId, got.job, { messageId: null, buffer: img.buffer, fileType: img.fileType });
      } catch (e) {
        console.error('[signJob] attach failed:', e?.message || e);
        return res.status(502).json({ error: 'save_failed', message: MESSAGES.save_failed });
      }
      // ลิงก์ดู 3 มิติ → ต่อท้ายหมายเหตุงาน (ส่งลูกค้าจากงานได้ภายหลัง) · บันทึกไม่ได้ก็ไม่ทำให้ภาพที่แนบแล้วเสีย
      let linked = false;
      const note = noteWithLink(got.job.note, req.body?.link);
      if (note) {
        try {
          await saveJob(got.t.userId, got.job.id, { note });
          linked = true;
        } catch (e) {
          console.error('[signJob] note failed:', e?.message || e);
        }
      }
      res.status(201).json({ ok: true, number: got.job.job_number || '', linked });
    } catch (err) {
      next(err);
    }
  });

  router.use((err, req, res, next) => {
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'too_large', message: MESSAGES.too_large });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_image', message: MESSAGES.bad_image });
    next(err);
  });

  return router;
}

export default createSignJobRouter();
