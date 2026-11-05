-- ============================================================
-- ม่วงจด — รายจ่ายของร้าน (expenses)
-- Safe to run repeatedly.
-- ============================================================
--
-- ร้านขอ (V2) "จดรายรับ–รายจ่าย": พิมพ์ "ซื้อกระดาษ A4 350" แล้วม่วงจดเป็น
-- รายจ่ายให้ สรุปยอดรายวันจะได้เห็นทั้งเงินเข้า (งานที่รับเงินแล้ว) และเงินออก
--
-- รายจ่ายเป็นของง่าย: ซื้ออะไร เท่าไหร่ จ่ายทางไหน วันไหน ร้านไหน — ไม่มีรายการย่อย
-- ไม่มีใบเสร็จให้ลูกค้า ลบ = ปิดสถานะ (ไม่ลบแถวจริง เผื่อกดพลาด)

create table if not exists public.expenses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  branch_id  uuid references public.branches (id) on delete set null,
  item       text not null,
  amount     numeric(12,2) not null default 0,
  pay_method text,                      -- 'cash' | 'transfer' | null (ไม่ได้บอก)
  note       text,
  spent_date date not null default (now() at time zone 'Asia/Bangkok')::date,
  status     text not null default 'active',  -- 'active' | 'cancelled'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expenses_user_date_idx on public.expenses (user_id, spent_date desc);

drop trigger if exists expenses_set_updated_at on public.expenses;
create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

alter table public.expenses enable row level security;

notify pgrst, 'reload schema';
