-- ============================================================
-- ม่วงจด — ข้อมูลร้าน (shop_profiles)
-- Safe to run repeatedly.
-- ============================================================
--
-- ใบเสร็จที่ยื่นให้ลูกค้าต้องบอกว่ามาจากร้านไหน ที่ผ่านมามันบอกแค่ว่า
-- "ม่วงจดให้" ซึ่งเป็นชื่อผู้ช่วย ไม่ใช่ชื่อร้าน ตารางนี้เก็บหัวใบเสร็จ
-- ของแต่ละร้าน หนึ่งแถวต่อหนึ่งร้าน
--
-- ทุกช่องปล่อยว่างได้ ร้านที่ยังไม่ได้ตั้งค่าต้องใช้งานได้เหมือนเดิม
-- ใบเสร็จแค่ไม่มีหัวร้านเท่านั้น

create table if not exists public.shop_profiles (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  shop_name   text,
  phone       text,
  address     text,
  tax_id      text,
  -- ข้อความท้ายใบเสร็จ เช่น "ขอบคุณที่อุดหนุนค่ะ" หรือเลขบัญชีธนาคาร
  footer_note text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ใช้ trigger เดียวกับตารางอื่นที่ 001 สร้างไว้
drop trigger if exists shop_profiles_set_updated_at on public.shop_profiles;
create trigger shop_profiles_set_updated_at
  before update on public.shop_profiles
  for each row execute function public.set_updated_at();

-- เปิด RLS โดยไม่มี policy สาธารณะ เหมือนทุกตารางใน 001 เซิร์ฟเวอร์ใช้
-- service_role ซึ่งข้าม RLS อยู่แล้ว ส่วน anon key จะอ่านอะไรไม่ได้เลย
alter table public.shop_profiles enable row level security;
