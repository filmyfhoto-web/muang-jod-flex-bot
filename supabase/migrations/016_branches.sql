-- ============================================================
-- ม่วงจด — ร้านสองร้าน (branches)
-- Safe to run repeatedly.
-- ============================================================
--
-- ร้านบอกว่า "ม่วงจดต้องช่วยดูและจัดการงานของฉันเฉพาะ 2 ร้านนี้เท่านั้น
-- 1. นัฐภรณ์ ปริ้นงาน  2. นัฐภรณ์ เชียงกลาง ... ห้ามนำงานมาปนกัน"
--
-- ชื่อตารางเป็น branches ไม่ใช่ shops เพราะ shop_profiles (ไมเกรชัน 008) ถูกใช้
-- ไปแล้วในความหมาย "หัวใบเสร็จ" — ถ้าตั้งชื่อ shops อีกตัว โค้ดจะมีคำว่าร้าน
-- สองความหมายปนกันทุกไฟล์ ส่วนข้อความที่ร้านเห็นยังเรียกว่า "ร้าน" เหมือนเดิม

create table if not exists public.branches (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  -- ชื่อที่ร้านเห็นและพิมพ์ เช่น "นัฐภรณ์ ปริ้นงาน"
  name       text not null,
  -- ชื่อสั้นแบบอังกฤษ ใช้เป็นคีย์ในโค้ดและใน URL ของแดชบอร์ด
  slug       text not null,
  -- ลำดับที่แสดง ร้านแรกของเจ้าของคือร้านตั้งต้น
  sort       int  not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ชื่อสั้นห้ามซ้ำกันในบัญชีเดียว ไม่งั้น "ปริ้นงาน" จะชี้ได้สองที่
create unique index if not exists branches_user_slug_idx on public.branches (user_id, slug);
create index if not exists branches_user_sort_idx on public.branches (user_id, sort);

drop trigger if exists branches_set_updated_at on public.branches;
create trigger branches_set_updated_at
  before update on public.branches
  for each row execute function public.set_updated_at();

alter table public.branches enable row level security;

-- ------------------------------------------------ งานสังกัดร้านไหน
--
-- เปิดให้ว่างได้ และต้องว่างได้ตลอดไป: งานเก่าทั้งหมดถูกจดก่อนที่จะมีสองร้าน
-- การเดาแทนร้านว่าใบไหนเป็นของร้านไหนคือการกรอกบัญชีคนอื่นให้เขา — ผิดแล้ว
-- ยอดเงินของทั้งสองร้านผิดตามทันที งานที่ยังไม่ระบุร้านจึงขึ้นเป็น "ยังไม่ระบุร้าน"
-- ให้ร้านกดย้ายเอง
--
-- on delete set null: ลบร้านทิ้งต้องไม่ลบงานตามไปด้วย

alter table public.jobs
  add column if not exists branch_id uuid references public.branches (id) on delete set null;

create index if not exists jobs_user_branch_idx on public.jobs (user_id, branch_id);
create index if not exists jobs_user_branch_date_idx on public.jobs (user_id, branch_id, job_date);

notify pgrst, 'reload schema';
