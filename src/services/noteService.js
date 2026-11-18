import { randomUUID } from 'node:crypto';
import { supabase, STORAGE_BUCKET } from '../config/supabase.js';
import { logger } from './logger.js';

/* สมุดเขียนมือ — หน้ากระดาษที่ร้านเขียนด้วยนิ้ว/ปากกาบนจอ เก็บเป็นรูปทีละหน้า
 *
 * ร้านขอ: "ฉันอยากสร้างสมุดจดแบบเขียนมือด้วยค่ะ ทำให้ได้ไหมคะ" — บางอย่างพิมพ์
 * เอาไม่ได้: สเก็ตช์แบบป้าย ขีดตำแหน่งเจาะรู วาดหน้างานให้ลูกค้าดู หน้าที่เขียน
 * เสร็จเก็บเป็นรูปในที่เก็บไฟล์เดียวกับหลักฐานงาน แล้วจดที่อยู่ไฟล์ไว้ใน hand_notes
 *
 * เก็บ path ไม่เก็บลิงก์ — ลิงก์ที่เซ็นแล้วมีวันหมดอายุ (บทเรียน QR ใน 012)
 * เซ็นลิงก์ใหม่ทุกครั้งที่เปิดเล่ม
 * ตารางยังไม่ได้สร้าง (ไมเกรชัน 024) = บอกตรง ๆ ไม่ใช่เงียบหรือล่ม
 */

export const NOTE_NOT_READY =
  'ยังเก็บหน้าสมุดไม่ได้ค่ะ — ต้องรัน migration 024_hand_notes.sql ใน Supabase ก่อน';

const missingTable = (err) =>
  /relation .*hand_notes.* does not exist|schema cache/i.test(String(err?.message || ''));

// ลิงก์เปิดดูรูป อายุ 7 วัน — เซ็นสดทุกครั้ง เซ็นไม่ได้หน้านั้นขึ้นรูปแตก ไม่พาเล่มล่ม
async function signedUrl(client, path) {
  try {
    const { data, error } = await client.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    if (error) throw error;
    return data?.signedUrl || null;
  } catch (err) {
    logger.warn('note.sign_failed', { message: err?.message });
    return null;
  }
}

// เก็บหน้าที่เขียนเสร็จเข้าเล่ม — รูปขึ้นที่เก็บไฟล์ก่อน แถวค่อยตามไป
export async function saveHandNote(userId, { buffer, fileType } = {}, client = supabase) {
  if (!userId) throw new Error('missing user');
  if (!buffer?.length) throw new Error('missing file');

  const ext = fileType === 'image/jpeg' ? 'jpg' : 'png';
  const path = `${userId}/notes/page-${randomUUID()}.${ext}`;

  const { error: uploadErr } = await client.storage
    .from(STORAGE_BUCKET)
    .upload(path, buffer, { contentType: fileType || 'image/png', upsert: true });
  if (uploadErr) throw uploadErr;

  const { data, error } = await client
    .from('hand_notes')
    .insert({ user_id: userId, path })
    .select('id, path, created_at')
    .single();
  if (error) {
    if (missingTable(error)) return { ok: false, status: 503, message: NOTE_NOT_READY };
    logger.error('note.insert_failed', { message: error.message });
    throw error;
  }
  return {
    ok: true,
    note: { id: data.id, created_at: data.created_at, url: await signedUrl(client, data.path) },
  };
}

// เปิดเล่ม (หน้าใหม่ก่อน) — อ่านพังให้รู้ว่าพัง ไม่โชว์เล่มว่างหลอกว่าหน้าหาย
export async function listHandNotes(userId, limit = 60, client = supabase) {
  const { data, error } = await client
    .from('hand_notes')
    .select('id, path, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    if (missingTable(error)) return { ok: false, status: 503, message: NOTE_NOT_READY };
    throw error;
  }
  const notes = [];
  for (const row of data || []) {
    notes.push({ id: row.id, created_at: row.created_at, url: await signedUrl(client, row.path) });
  }
  return { ok: true, notes };
}

// ฉีกหน้าออกจากเล่ม — ของใครของมัน แถวหายก่อนแล้วค่อยลบไฟล์ (ไฟล์ค้างไม่ทำให้ใครเดือดร้อน)
export async function deleteHandNote(userId, noteId, client = supabase) {
  const { data, error } = await client
    .from('hand_notes')
    .select('id, path')
    .eq('user_id', userId)
    .eq('id', noteId)
    .maybeSingle();
  if (error) {
    if (missingTable(error)) return { ok: false, status: 503, message: NOTE_NOT_READY };
    throw error;
  }
  if (!data) return { ok: false, status: 404, message: 'ไม่เจอหน้านี้ในเล่มค่ะ' };

  const { error: delErr } = await client
    .from('hand_notes')
    .delete()
    .eq('user_id', userId)
    .eq('id', noteId);
  if (delErr) throw delErr;

  try {
    await client.storage.from(STORAGE_BUCKET).remove([data.path]);
  } catch (err) {
    logger.warn('note.file_remove_failed', { message: err?.message });
  }
  return { ok: true };
}
