-- ============================================================
-- ม่วงจด — bills & receipts
--   รวมหลายงานเป็นบิลเดียว -> รับชำระ -> ออกใบเสร็จ
-- Safe to run repeatedly.
-- ============================================================

create extension if not exists "pgcrypto";

create table if not exists public.bills (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  bill_number    text,
  customer_name  text,
  subtotal       numeric(12,2) not null default 0,
  discount       numeric(12,2) not null default 0,
  total          numeric(12,2) not null default 0,
  paid_amount    numeric(12,2) not null default 0,
  balance_due    numeric(12,2) not null default 0,
  payment_status text not null default 'pending'
                 check (payment_status in ('pending', 'paid', 'partial')),
  status         text not null default 'active'
                 check (status in ('active', 'cancelled')),
  -- Capability token for the printable receipt page (/r/<token>): anyone with
  -- the link can read this one bill, which is what sharing a receipt means.
  share_token    text unique not null default encode(gen_random_bytes(24), 'hex'),
  note           text,
  issued_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists bills_user_id_idx     on public.bills (user_id);
create index if not exists bills_user_status_idx on public.bills (user_id, status, payment_status);
create index if not exists bills_share_token_idx on public.bills (share_token);

-- bill_number is unique per user, like job_number.
create unique index if not exists bills_user_bill_number_key
  on public.bills (user_id, bill_number)
  where bill_number is not null;

-- A job belongs to at most one bill.
alter table public.jobs add column if not exists bill_id uuid references public.bills (id) on delete set null;
create index if not exists jobs_bill_id_idx on public.jobs (bill_id);

drop trigger if exists bills_set_updated_at on public.bills;
create trigger bills_set_updated_at
  before update on public.bills
  for each row execute function public.set_updated_at();

-- Server uses the service_role key and filters by user_id in code; no public
-- policies, so the anon key sees nothing.
alter table public.bills enable row level security;
