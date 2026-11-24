/* ทีมของร้าน — ส่วนที่คุยกับฐานข้อมูล (migration 026)
 *
 * สมาชิกทีมคือบัญชีไลน์ที่เจ้าของร้านเชิญเข้ามา "ช่วยจดงาน": ทุกอย่างที่เขาทำ
 * ลงสมุดของเจ้าของร้าน ไม่ใช่สมุดของตัวเอง จุดสลับอยู่ที่ขา resolve โปรไฟล์
 * สองจุดเดียวของระบบ (webhook กับ /api) — ดู findTeamFor
 *
 * การเข้าทีมมีทางเดียว: รหัสเชิญที่เจ้าของสั่งสร้างในแชต ใช้ครั้งเดียว หมดอายุใน
 * 48 ชม. — ฝั่งคนนอกไม่มีทางสมัครเอง และสิทธิ์ของสมาชิกถูกกั้นใน teamGate.js
 */

import { supabase } from '../config/supabase.js';
import { getProfile } from './lineService.js';
import { logger } from './logger.js';
import { newInviteCode, INVITE_TTL_HOURS } from '../utils/teamGate.js';

/* เบรกเกอร์: ฐานข้อมูลทีมล่ม/ช้า ต้องไม่ลากทุกคำขอของบอทไปรอด้วย —
 * พลาดระดับ transport หนึ่งครั้ง = พัก lookup 30 วิ (ช่วงนั้นถือว่าไม่มีทีม
 * บอทเดินโหมดเจ้าของตามเดิม) แล้วค่อยลองใหม่เอง */
let skipLookupsUntil = 0;
const LOOKUP_TIMEOUT_MS = 1500;
const BREAKER_MS = 30_000;

export async function findMemberByLineId(lineUserId, client = supabase) {
  if (!lineUserId) return null;
  if (Date.now() < skipLookupsUntil) return null;
  try {
    const { data, error } = await client
      .from('team_members')
      .select('*')
      .eq('line_user_id', lineUserId)
      .abortSignal(AbortSignal.timeout(LOOKUP_TIMEOUT_MS))
      .maybeSingle();
    if (error) {
      /* ตารางยังไม่มี (ยังไม่รัน migration 026) หรือ timeout — ต้องไม่ทำให้บอท
       * ทั้งตัวล้ม: แปลว่ายังไม่มีทีม ใช้แบบเดิมไปก่อน และพัก lookup ตามเบรกเกอร์
       * (ฝั่ง supabase-js ส่ง abort/timeout มาเป็น error ไม่ throw) */
      skipLookupsUntil = Date.now() + BREAKER_MS;
      logger.warn('team.find_member_failed', { message: error.message });
      return null;
    }
    return data || null;
  } catch (err) {
    skipLookupsUntil = Date.now() + BREAKER_MS;
    logger.warn('team.find_member_failed', { message: err?.message });
    return null;
  }
}

export async function ownerProfileById(ownerId, client = supabase) {
  const { data, error } = await client.from('profiles').select('*').eq('id', ownerId).maybeSingle();
  if (error) {
    logger.error('team.owner_profile_failed', { message: error.message });
    throw error;
  }
  return data || null;
}

/* ใครคนนี้ทำงานแทนร้านไหน — null = ไม่ใช่สมาชิกทีม (ใช้สมุดตัวเองตามเดิม)
 *
 * เรียกจากขา resolve ของทุกคำขอ จึง "ห้าม throw เด็ดขาด": ระบบทีมล่ม/ยังไม่
 * ติดตั้ง = ไม่มีทีม บอทส่วนที่เหลือต้องเดินต่อได้ตามเดิม */
export async function findTeamFor(lineUserId, client = supabase) {
  try {
    const member = await findMemberByLineId(lineUserId, client);
    if (!member) return null;
    const owner = await ownerProfileById(member.owner_id, client);
    if (!owner) {
      logger.warn('team.owner_missing', { ownerId: member.owner_id });
      return null;
    }
    return { member, owner };
  } catch (err) {
    logger.warn('team.resolve_failed', { message: err?.message });
    return null;
  }
}

export async function createInvite(ownerId, client = supabase) {
  const code = newInviteCode();
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3600_000).toISOString();
  const { error } = await client.from('team_invites').insert({ code, owner_id: ownerId, expires_at: expiresAt });
  if (error) {
    logger.error('team.create_invite_failed', { message: error.message });
    throw error;
  }
  return { code, expiresAt };
}

/* แลกรหัสเข้าทีม — คืน { ok, member?, reason? }
 * reason: 'bad_code' (ไม่มี/ใช้แล้ว/หมดอายุ) · 'owner_self' (เจ้าของร้านเอง)
 */
export async function redeemInvite(code, lineUserId, client = supabase) {
  const { data: invite, error } = await client
    .from('team_invites')
    .select('*')
    .eq('code', String(code || '').toUpperCase())
    .maybeSingle();
  if (error) {
    logger.error('team.read_invite_failed', { message: error.message });
    throw error;
  }
  if (!invite || invite.used_by || new Date(invite.expires_at) < new Date()) {
    return { ok: false, reason: 'bad_code' };
  }

  const owner = await ownerProfileById(invite.owner_id, client);
  if (owner?.line_user_id === lineUserId) return { ok: false, reason: 'owner_self' };

  // เคยเข้าทีมแล้ว (unique ที่ line_user_id) = ยินดีต้อนรับกลับ ไม่เผารหัส
  const existing = await findMemberByLineId(lineUserId, client);
  if (existing) return { ok: true, member: existing, already: true };

  // ชื่อจากโปรไฟล์ไลน์ ถ้าดึงไม่ได้ก็ยังเข้าทีมได้ (เจ้าของเห็นเป็น "พนักงาน")
  let name = null;
  try {
    name = (await getProfile(lineUserId))?.displayName ?? null;
  } catch { /* ไม่เป็นไร */ }

  const { data: member, error: insErr } = await client
    .from('team_members')
    .insert({ owner_id: invite.owner_id, line_user_id: lineUserId, name })
    .select('*')
    .single();
  if (insErr) {
    logger.error('team.join_failed', { message: insErr.message });
    throw insErr;
  }

  const { error: useErr } = await client
    .from('team_invites')
    .update({ used_by: lineUserId, used_at: new Date().toISOString() })
    .eq('code', invite.code);
  if (useErr) logger.warn('team.mark_invite_failed', { message: useErr.message });

  logger.info('team.joined', { ownerId: invite.owner_id });
  return { ok: true, member };
}

export async function listMembers(ownerId, client = supabase) {
  const { data, error } = await client
    .from('team_members')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: true });
  if (error) {
    logger.error('team.list_failed', { message: error.message });
    throw error;
  }
  return data || [];
}

/* ลบตามชื่อ (ตรงทั้งชื่อ ไม่สนตัวเล็กใหญ่) — คืนจำนวนที่ลบ */
export async function removeMemberByName(ownerId, name, client = supabase) {
  const members = await listMembers(ownerId, client);
  const want = String(name || '').trim().toLowerCase();
  const hit = members.filter((m) => String(m.name || '').trim().toLowerCase() === want);
  if (!hit.length) return 0;
  const { error } = await client
    .from('team_members')
    .delete()
    .in('id', hit.map((m) => m.id));
  if (error) {
    logger.error('team.remove_failed', { message: error.message });
    throw error;
  }
  return hit.length;
}
