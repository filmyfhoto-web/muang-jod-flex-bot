-- ============================================================
-- ม่วงจด — หมวดงานที่ร้านแก้เองได้ (category_settings)
-- Safe to run repeatedly.
-- ============================================================
--
-- ร้านขอ "แก้ไขหมวดงานเองได้ เพราะมันจะมีเพิ่มเติม" — เปลี่ยนชื่อ/ไอคอน/สี ซ่อนหมวดที่ไม่ใช้
-- เพิ่มหมวดและประเภทของตัวเอง และเพิ่มคำค้นให้ม่วงจัดงานเข้าหมวดเอง
--
-- เก็บเป็นเอกสารเดียวต่อร้าน (jsonb) เฉพาะ "สิ่งที่ร้านแก้" ไม่ใช่สำเนาทั้งชุด — ชื่อและคำค้น
-- ตั้งต้นที่ร้านไม่ได้แตะยังตามระบบไปเรื่อย ๆ เมื่อระบบปรับปรุง
--
-- ตารางนี้ไม่มีผลกับงานหลัก: ถ้ายังไม่ได้รัน บอตใช้หมวดตั้งต้นของระบบตามเดิม แค่ยังแก้หมวดไม่ได้

create table if not exists public.category_settings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  config     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists category_settings_user_idx on public.category_settings (user_id);

drop trigger if exists category_settings_set_updated_at on public.category_settings;
create trigger category_settings_set_updated_at
  before update on public.category_settings
  for each row execute function public.set_updated_at();

alter table public.category_settings enable row level security;

notify pgrst, 'reload schema';
