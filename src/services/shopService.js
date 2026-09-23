import { randomUUID } from 'node:crypto';
import { supabase, STORAGE_BUCKET } from '../config/supabase.js';
import { logger } from './logger.js';

// The shop's own details — what goes at the top of a receipt handed to a
// customer. Every field is optional: a shop that never opens ตั้งค่า must keep
// working exactly as before, with a receipt that simply has no letterhead.

const FIELDS = ['shop_name', 'phone', 'address', 'tax_id', 'footer_note'];
const TEXT_FIELDS = FIELDS;

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

/* QR รับเงินของร้าน — เก็บได้หลายใบ ร้านเลือกเองว่าจะใช้ใบไหน
 *
 * ร้านมีสองใบจริง ๆ: พร้อมเพย์ของกสิกร (ชื่อบุคคล) กับ Thai QR ของออมสิน
 * (ชื่อร้าน มีรหัสร้านค้า) แล้วบอกว่า "ให้ฉันกดเลือกว่าจะใส่ QR อันไหน"
 * — คนละบัญชีกัน เก็บได้ใบเดียวแปลว่าต้องเลือกทิ้งอีกใบ
 */

const QR_FIELDS = 'id, label, path, is_default, created_at';

export async function listShopQrs(userId, client = supabase) {
  if (!userId) return [];
  try {
    const { data, error } = await client
      .from('shop_qrs')
      .select(QR_FIELDS)
      .eq('user_id', userId)
      // ใบหลักขึ้นก่อนเสมอ ที่เหลือเรียงตามที่เก็บเข้ามา
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (err) {
    logger.warn('shop.qr_list_failed', { message: err?.message });
    return [];
  }
}

/* เก็บ QR ใบใหม่
 *
 * ใบแรกของร้านเป็นใบหลักเอง ไม่ต้องให้ไปกดเลือกอีกที — ร้านที่มีใบเดียวไม่ควร
 * ต้องรู้ด้วยซ้ำว่ามีเรื่อง "ใบหลัก" อยู่
 */
export async function addShopQr(userId, { buffer, fileType, label = null } = {}, client = supabase) {
  if (!userId) throw new Error('missing user');
  if (!buffer?.length) throw new Error('missing file');

  const ext = fileType === 'image/png' ? 'png' : 'jpg';
  const path = `${userId}/shop/qr-${randomUUID()}.${ext}`;

  const { error: uploadErr } = await client.storage
    .from(STORAGE_BUCKET)
    .upload(path, buffer, { contentType: fileType || 'image/jpeg', upsert: true });
  if (uploadErr) throw uploadErr;

  const existing = await listShopQrs(userId, client);
  const { data, error } = await client
    .from('shop_qrs')
    .insert({ user_id: userId, label: label || null, path, is_default: existing.length === 0 })
    .select(QR_FIELDS)
    .single();
  if (error) throw error;
  return data;
}

export async function renameShopQr(userId, qrId, label, client = supabase) {
  const name = String(label || '').trim().slice(0, 40) || null;
  const { data, error } = await client
    .from('shop_qrs')
    .update({ label: name })
    .eq('user_id', userId)
    .eq('id', qrId)
    .select(QR_FIELDS)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/* เลือกใบที่จะขึ้นท้ายใบเสร็จ
 *
 * ปลดใบเดิมก่อนแล้วค่อยตั้งใบใหม่ ฐานข้อมูลมี unique index คุมไว้ว่าใบหลักมี
 * ได้ใบเดียว — ถ้าตั้งใบใหม่ก่อนปลดใบเก่า มันจะชนกันเอง
 */
export async function setDefaultShopQr(userId, qrId, client = supabase) {
  const { error: clearErr } = await client
    .from('shop_qrs')
    .update({ is_default: false })
    .eq('user_id', userId)
    .eq('is_default', true);
  if (clearErr) throw clearErr;

  const { data, error } = await client
    .from('shop_qrs')
    .update({ is_default: true })
    .eq('user_id', userId)
    .eq('id', qrId)
    .select(QR_FIELDS)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/* ลบใบที่ไม่ใช้แล้ว
 *
 * ลบใบหลักทิ้งแล้วต้องมีใบอื่นขึ้นมาแทน ไม่งั้นใบเสร็จจะไม่มี QR เงียบ ๆ
 * โดยร้านไม่รู้ตัวว่าเพิ่งลบใบที่ใช้อยู่
 */
export async function deleteShopQr(userId, qrId, client = supabase) {
  const before = await listShopQrs(userId, client);
  const target = before.find((q) => String(q.id) === String(qrId));
  if (!target) return null;

  const { error } = await client.from('shop_qrs').delete().eq('user_id', userId).eq('id', qrId);
  if (error) throw error;

  try {
    await client.storage.from(STORAGE_BUCKET).remove([target.path]);
  } catch (err) {
    // ไฟล์ค้างอยู่ไม่ทำให้ใครเดือดร้อน แถวหายไปแล้วคือจบ
    logger.warn('shop.qr_file_remove_failed', { message: err?.message });
  }

  if (target.is_default) {
    const next = (await listShopQrs(userId, client))[0];
    if (next) await setDefaultShopQr(userId, next.id, client);
  }
  return target;
}

/* ลิงก์ที่เปิดดูรูปได้ เซ็นใหม่ทุกครั้งที่จะใช้
 *
 * เก็บลิงก์สำเร็จรูปไว้ในฐานข้อมูลไม่ได้ เพราะลิงก์ที่เซ็นไว้มีวันหมดอายุ —
 * เก็บไว้แล้ว QR จะหายไปเงียบ ๆ ตอนหมดอายุ โดยไม่มีใครรู้จนกว่าลูกค้าจะสแกนไม่ได้
 */
export async function shopQrUrl(qr, client = supabase) {
  const path = typeof qr === 'string' ? qr : qr?.path || qr?.qr_path;
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

// ใบที่ขึ้นท้ายใบเสร็จ — ใบหลัก ถ้าไม่มีก็ใบแรกที่มี
export async function defaultQrUrl(userId, client = supabase) {
  const list = await listShopQrs(userId, client);
  if (!list.length) return null;
  return shopQrUrl(list.find((q) => q.is_default) || list[0], client);
}

export { FIELDS as SHOP_FIELDS };
