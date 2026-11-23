import { randomUUID } from 'node:crypto';
import { supabase, STORAGE_BUCKET } from '../config/supabase.js';

const EXT_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
};

function extFor(fileType, fallback = 'bin') {
  return EXT_BY_TYPE[fileType] || fallback;
}

// Upload a downloaded LINE file to Supabase Storage and link it to a job.
// Storage path is namespaced by userId so files are isolated per user, and
// the filename is a random UUID — never the user's own filename.
export async function saveAttachment(userId, job, { messageId, buffer, fileType }) {
  const ext = extFor(fileType);
  const path = `${userId}/${job.id}/${randomUUID()}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, buffer, {
      contentType: fileType || 'application/octet-stream',
      upsert: true,
    });

  if (uploadErr) {
    console.error('[attachmentService] upload failed:', uploadErr.message);
    throw uploadErr;
  }

  // Signed URL valid for ~1 year so it renders even from a private bucket.
  let fileUrl = path;
  const { data: signed } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  if (signed?.signedUrl) fileUrl = signed.signedUrl;

  const { data, error } = await supabase
    .from('attachments')
    .insert({
      job_id: job.id,
      line_message_id: messageId,
      file_url: fileUrl,
      file_type: fileType || null,
    })
    .select('*')
    .single();

  if (error) {
    console.error('[attachmentService] insert failed:', error.message);
    throw error;
  }

  console.log(`[attachmentService] saved attachment for job ${job.job_number}`);
  return data;
}

// Count attachments for a job (used for friendly messaging).
export async function countAttachments(jobId) {
  const { count, error } = await supabase
    .from('attachments')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', jobId);
  if (error) return 0;
  return count || 0;
}

// รูปที่แนบในงาน (ไว้ให้แอปจำลองป้ายเลือกเป็นไฟล์งาน) — เก่าสุดก่อน: ไฟล์งานที่ลูกค้าส่งมักมาก่อนสลิป
// เรียกหลังเช็กแล้วว่างานเป็นของคนที่ถือตั๋ว (attachments ไม่มีช่อง user_id ผูกผ่านงาน)
export async function listJobImages(jobId, client = supabase) {
  const { data, error } = await client
    .from('attachments')
    .select('id, file_url, file_type, created_at')
    .eq('job_id', jobId)
    .in('file_type', ['image/jpeg', 'image/png'])
    .order('created_at', { ascending: true })
    .limit(12);
  if (error) {
    console.error('[attachmentService] list images failed:', error.message);
    return [];
  }
  return data || [];
}

// ไฟล์รูปหนึ่งรูปของงาน → { buffer, fileType } หรือ null
// file_url เป็นลิงก์ลายเซ็นอายุ 1 ปี (หรือ path ถ้าเซ็นไม่ได้ตอนบันทึก) → ดาวน์โหลดผ่าน storage ด้วย path เสมอ
export async function readJobImage(jobId, attachmentId, client = supabase) {
  const { data: row, error } = await client
    .from('attachments')
    .select('id, file_url, file_type')
    .eq('job_id', jobId)
    .eq('id', attachmentId)
    .maybeSingle();
  if (error || !row || !/^image\/(jpeg|png)$/.test(row.file_type || '')) return null;
  const path = storagePathOf(row.file_url);
  if (!path) return null;
  const { data: blob, error: dlErr } = await client.storage.from(STORAGE_BUCKET).download(path);
  if (dlErr || !blob) return null;
  return { buffer: Buffer.from(await blob.arrayBuffer()), fileType: row.file_type };
}

// ".../object/sign/job-evidence/<path>?token=..." หรือ "<path>" → "<path>"
export function storagePathOf(fileUrl) {
  const s = String(fileUrl || '');
  const m = /\/object\/(?:sign|public|authenticated)\/([^/?]+)\/([^?]+)/.exec(s);
  if (m) return m[1] === STORAGE_BUCKET ? decodeURIComponent(m[2]) : null;
  return /^[\w-]+\/[\w-]+\/[\w-]+\.(jpg|png)$/.test(s) ? s : null;
}
