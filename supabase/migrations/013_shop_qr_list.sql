-- ============================================================
-- ม่วงจด — QR รับเงินหลายอัน เลือกได้ (shop_qrs)
-- Safe to run repeatedly. รันอันนี้อันเดียวพอ ไม่ต้องรัน 012 ก่อน
-- ============================================================
--
-- ร้านมี QR สองใบ: พร้อมเพย์ของกสิกร (ชื่อบุคคล) กับ Thai QR ของออมสิน
-- (ชื่อร้าน มีรหัสร้านค้า) แล้วบอกว่า "ให้ฉันกดเลือกว่าจะใส่ QR อันไหน"
--
-- คนละบัญชีกันจริง ๆ ไม่ใช่รูปซ้ำ — บางงานเก็บเข้าบัญชีร้าน บางงานเข้าบัญชี
-- ตัวเอง เก็บได้ใบเดียวแปลว่าต้องเลือกทิ้งอีกใบ

create table if not exists public.shop_qrs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  -- ชื่อที่ร้านเรียกเอง เช่น "กสิกร" "ออมสิน" — ว่างได้
  label      text,
  -- ที่อยู่ไฟล์ในที่เก็บไฟล์ ไม่ใช่ URL (ลิงก์ที่เซ็นไว้มีวันหมดอายุ)
  path       text not null,
  -- ใบที่ขึ้นท้ายใบเสร็จอัตโนมัติ — มีได้ใบเดียวต่อร้าน
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists shop_qrs_user_id_idx on public.shop_qrs (user_id);

-- ใบหลักมีได้ใบเดียวต่อร้าน ให้ฐานข้อมูลเป็นคนคุม ไม่ใช่หวังว่าโค้ดจะจำ
create unique index if not exists shop_qrs_one_default_idx
  on public.shop_qrs (user_id) where is_default;

-- ย้าย QR ใบเดิมที่ 012 เก็บไว้เข้ามาเป็นใบหลัก
-- (ข้ามไปเฉย ๆ ถ้ายังไม่เคยรัน 012 — คอลัมน์นั้นจะไม่มีอยู่)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'shop_profiles' and column_name = 'qr_path'
  ) then
    insert into public.shop_qrs (user_id, label, path, is_default)
    select p.user_id, 'QR รับเงิน', p.qr_path, true
    from public.shop_profiles p
    where p.qr_path is not null
      and not exists (select 1 from public.shop_qrs q where q.user_id = p.user_id);
  end if;
end $$;

alter table public.shop_qrs enable row level security;
