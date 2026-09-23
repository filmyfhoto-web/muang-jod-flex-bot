import { randomUUID } from 'node:crypto';
import { supabase, STORAGE_BUCKET } from '../config/supabase.js';
import { logger } from './logger.js';

// The shop's own details — what goes at the top of a receipt handed to a
// customer. Every field is optional: a shop that never opens ตั้งค่า must keep
// working exactly as before, with a receipt that simply has no letterhead.

const FIELDS = ['shop_name', 'phone', 'address', 'tax_id', 'footer_note', 'qr_path'];

// ช่องที่ร้านพิมพ์เองในหน้าตั้งค่า — qr_path ไม่ใช่หนึ่งในนั้น มันมาจากการส่งรูป
const TEXT_FIELDS = FIELDS.filter((f) => f !== 'qr_path');

const EMPTY = Object.freeze(Object.fromEntries(FIELDS.map((f) => [f, null])));

// Blank strings mean "cleared", not the string "" — a receipt would otherwise
// render an empty line where the phone number used to be.
function clean(patch = {}) {
  const out = {};
  for (const f of TEXT_FIELDS) {
    if (!(f in patch)) continue;
    const v = patch[f];
    const s = v === null || v === undefined ? '' : String(v).trim();
    out[f] = s === '' ? null : s.slice(0, f === 'address' || f === 'footer_note' ? 500 : 200);
  }
  return out;
}

// Never throws: the letterhead is decoration on a receipt that has to render
// either way, so a database hiccup must not be able to take the receipt down.
export async function getShopProfile(userId, client = supabase) {
  if (!userId) return { ...EMPTY };
  try {
    const { data, error } = await client
      .from('shop_profiles')
      .select(FIELDS.join(','))
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return { ...EMPTY, ...(data || {}) };
  } catch (err) {
    logger.warn('shop.read_failed', { message: err?.message });
    return { ...EMPTY };
  }
}

// Upsert, so the first save creates the row and later ones patch it. Only the
// fields the caller sent are touched — clearing the phone must not wipe the
// address typed on another visit.
export async function saveShopProfile(userId, patch, client = supabase) {
  const fields = clean(patch);
  if (!userId) throw new Error('missing user');

  const { data, error } = await client
    .from('shop_profiles')
    .upsert({ user_id: userId, ...fields }, { onConflict: 'user_id' })
    .select(FIELDS.join(','))
    .single();

  if (error) throw error;
  return { ...EMPTY, ...(data || {}) };
}

// True when there is anything worth printing. A receipt asks this before it
// draws a letterhead block, rather than drawing an empty box.
export function hasShopDetails(shop) {
  // QR ไม่ใช่ "หัวใบเสร็จ" มันอยู่ท้ายใบ ตรงที่ลูกค้าจ่ายเงิน
  return TEXT_FIELDS.some((f) => shop?.[f]);
}

/* QR รับเงินของร้าน — เก็บไฟล์ไว้ที่เดียว หยิบมาใช้ได้ทุกที่
 *
 * ร้านบอกว่า "บางทีฉันหาในอัลบั้มไม่เจอ" ซึ่งเป็นปัญหาตอนลูกค้ายืนรออยู่
 * เก็บไว้ในม่วงแล้วเรียกด้วยคำเดียว หรือให้มันขึ้นท้ายใบเสร็จไปเลย
 *
 * ทับไฟล์เดิมเสมอ ร้านมี QR อันเดียว การเก็บอันเก่าไว้มีแต่จะทำให้หยิบผิดใบ
 */
export async function saveShopQr(userId, { buffer, fileType } = {}, client = supabase) {
  if (!userId) throw new Error('missing user');
  if (!buffer?.length) throw new Error('missing file');

  const ext = fileType === 'image/png' ? 'png' : 'jpg';
  const path = `${userId}/shop/qr-${randomUUID()}.${ext}`;

  const { error: uploadErr } = await client.storage
    .from(STORAGE_BUCKET)
    .upload(path, buffer, { contentType: fileType || 'image/jpeg', upsert: true });
  if (uploadErr) throw uploadErr;

  const { error } = await client
    .from('shop_profiles')
    .upsert({ user_id: userId, qr_path: path }, { onConflict: 'user_id' });
  if (error) throw error;

  return path;
}

/* ลิงก์ที่เปิดดูรูปได้ เซ็นใหม่ทุกครั้งที่จะใช้
 *
 * เก็บลิงก์สำเร็จรูปไว้ในฐานข้อมูลไม่ได้ เพราะลิงก์ที่เซ็นไว้มีวันหมดอายุ —
 * เก็บไว้แล้ว QR จะหายไปเงียบ ๆ ตอนหมดอายุ โดยไม่มีใครรู้จนกว่าลูกค้าจะสแกนไม่ได้
 */
export async function shopQrUrl(shop, client = supabase) {
  const path = typeof shop === 'string' ? shop : shop?.qr_path;
  if (!path) return null;
  try {
    const { data, error } = await client.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    if (error) throw error;
    return data?.signedUrl || null;
  } catch (err) {
    logger.warn('shop.qr_url_failed', { message: err?.message });
    return null;
  }
}

export { FIELDS as SHOP_FIELDS };
