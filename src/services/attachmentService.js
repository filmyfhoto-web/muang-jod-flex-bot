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
