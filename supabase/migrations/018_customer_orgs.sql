-- ============================================================
-- ม่วงจด — ชื่อหน่วยงานของลูกค้า (customer_orgs)
-- Safe to run repeatedly.
-- ============================================================
--
-- ร้านขอ "เพิ่มชื่อหน่วยงานในหน้าสมุดลูกค้า" — ลูกค้าอย่าง "ครูแนน" ที่สั่งงาน
-- แทนโรงเรียน ควรเข้าบัญชีของโรงเรียน ไม่ใช่ถูกนับเป็นลูกค้าหน้าร้าน
--
-- ผูกจากชื่อลูกค้าบนงานเก่า (customer_key = ชื่อที่ตัดเว้นวรรค/จุดออก ตรงกับ
-- accountKey ในโค้ด) จึงไม่ต้องไล่แก้งานเก่าทีละใบ และแก้ชื่อหน่วยงานที่เดียว
-- ทุกใบเปลี่ยนตามทันที

create table if not exists public.customer_orgs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  customer_key  text not null,
  -- ชื่อที่ร้านพิมพ์ ไว้แสดงในรายการให้เลือก
  customer_name text not null,
  org_name      text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists customer_orgs_user_key_idx on public.customer_orgs (user_id, customer_key);

drop trigger if exists customer_orgs_set_updated_at on public.customer_orgs;
create trigger customer_orgs_set_updated_at
  before update on public.customer_orgs
  for each row execute function public.set_updated_at();

alter table public.customer_orgs enable row level security;

notify pgrst, 'reload schema';
