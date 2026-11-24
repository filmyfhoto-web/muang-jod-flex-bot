-- ============================================================
-- ม่วงจด — ทีมของร้าน (team_members / team_invites)
-- Safe to run repeatedly.
-- ============================================================
--
-- ร้านขอ: "เพิ่มคนใช้ม่วงจดเพิ่มได้ไหม จะได้ช่วยเราจดงาน" (24 พ.ย. 69)
--
-- เดิมข้อมูลผูกกับบัญชีไลน์รายคน (profiles → user_id ทุกคิวรี) คนอื่นทักบอท
-- จะได้ "สมุดเปล่าของตัวเอง" ไม่ใช่คิวร้าน ตารางนี้คือทางเชื่อม: สมาชิกทีม
-- คือบัญชีไลน์ที่เจ้าของร้านเชิญเข้ามา แล้วทุกอย่างที่เขาทำ (จดงาน คิว เกม)
-- ลงสมุดของ "เจ้าของร้าน" แทน — จุดสลับอยู่ที่ขา resolve โปรไฟล์สองจุดเดียว
-- (webhook กับ /api) โค้ดที่เหลือไม่ต้องรู้จักทีมเลย
--
-- สมาชิกไม่มีแถวใน profiles ของตัวเอง (ปรัชญาเดิม: "คนนอกไม่ควรได้แม้แต่
-- แถวใน profiles") — ตัวตนเขาอยู่ในตารางนี้ ใต้ร่มของเจ้าของ และสิทธิ์ถูกกั้น
-- ไว้แค่ จดงาน/คิว/เกม ส่วนเรื่องเงิน-บัญชี-รายงานเป็นของเจ้าของเท่านั้น
-- (ด่านอยู่ใน src/utils/teamGate.js)
--
-- การเข้าทีมต้องผ่าน "รหัสเชิญ" ที่เจ้าของสั่งสร้างในแชตเท่านั้น ใช้ได้ครั้งเดียว
-- และหมดอายุเอง — ไม่มีทางสมัครเองจากฝั่งคนนอก

create table if not exists public.team_members (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles (id) on delete cascade,
  line_user_id text not null unique,
  name         text,
  role         text not null default 'staff',
  created_at   timestamptz not null default now()
);

create index if not exists team_members_owner_idx on public.team_members (owner_id);

create table if not exists public.team_invites (
  code       text primary key,
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null,
  used_by    text,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists team_invites_owner_idx on public.team_invites (owner_id);
