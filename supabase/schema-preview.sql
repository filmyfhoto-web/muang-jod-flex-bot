-- ม่วงจดให้ — PREVIEW ONLY
-- ยังไม่ได้รันกับฐานข้อมูลจริง ให้ตรวจชื่อโปรเจกต์เดิมก่อนนำไปใช้
-- ตารางทั้งหมดขึ้นต้นด้วย mj_ และไม่อ้างอิงตาราง Film Shop

begin;

create table if not exists public.mj_pending_batches (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null check (char_length(line_user_id) between 1 and 128),
  source_text text not null check (char_length(source_text) <= 4000),
  source_message_id text,
  entries jsonb not null check (jsonb_typeof(entries) = 'array' and jsonb_array_length(entries) between 1 and 10),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'expired')),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.mj_transactions (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null check (char_length(line_user_id) between 1 and 128),
  entry_type text not null check (entry_type in ('income', 'expense')),
  description text not null check (char_length(description) between 1 and 200),
  amount numeric(14,2) not null check (amount > 0 and amount <= 100000000),
  category text not null check (char_length(category) between 1 and 80),
  payment_method text check (payment_method is null or char_length(payment_method) <= 80),
  occurred_at timestamptz not null default now(),
  source_text text check (source_text is null or char_length(source_text) <= 4000),
  source_message_id text,
  pending_batch_id uuid references public.mj_pending_batches(id) on delete restrict,
  batch_item_index smallint not null default 0 check (batch_item_index between 0 and 9),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'active' and deleted_at is null) or (status = 'cancelled' and deleted_at is not null))
);

create unique index if not exists mj_transactions_pending_item_uidx
  on public.mj_transactions (pending_batch_id, batch_item_index)
  where pending_batch_id is not null;
create index if not exists mj_transactions_user_time_idx
  on public.mj_transactions (line_user_id, occurred_at desc)
  where deleted_at is null;
create index if not exists mj_transactions_user_category_idx
  on public.mj_transactions (line_user_id, category, occurred_at desc)
  where deleted_at is null;
create index if not exists mj_pending_batches_user_status_idx
  on public.mj_pending_batches (line_user_id, status, created_at desc);

create table if not exists public.mj_categories (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null check (char_length(line_user_id) between 1 and 128),
  name text not null check (char_length(name) between 1 and 80),
  entry_type text not null check (entry_type in ('income', 'expense', 'both')),
  monthly_budget numeric(14,2) check (monthly_budget is null or monthly_budget >= 0),
  color text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (line_user_id, name)
);

create table if not exists public.mj_transaction_events (
  id bigint generated always as identity primary key,
  transaction_id uuid not null references public.mj_transactions(id) on delete restrict,
  event_type text not null check (event_type in ('insert', 'update', 'cancel')),
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists mj_transaction_events_tx_idx
  on public.mj_transaction_events (transaction_id, created_at desc);

create or replace function public.mj_log_transaction_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.mj_transaction_events (transaction_id, event_type, before_data, after_data)
  values (
    new.id,
    case when tg_op = 'INSERT' then 'insert'
         when new.status = 'cancelled' and old.status <> 'cancelled' then 'cancel'
         else 'update' end,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    to_jsonb(new)
  );
  return new;
end;
$$;

drop trigger if exists mj_transactions_audit_trigger on public.mj_transactions;
create trigger mj_transactions_audit_trigger
after insert or update on public.mj_transactions
for each row execute function public.mj_log_transaction_change();

alter table public.mj_pending_batches enable row level security;
alter table public.mj_transactions enable row level security;
alter table public.mj_categories enable row level security;
alter table public.mj_transaction_events enable row level security;

-- LIFF ไม่เรียกตารางตรง ๆ: browser → backend → Supabase
-- จึงไม่เปิดสิทธิ์ให้ anon/authenticated เพื่อลดความเสี่ยงข้อมูลข้ามผู้ใช้
revoke all on table public.mj_pending_batches from anon, authenticated;
revoke all on table public.mj_transactions from anon, authenticated;
revoke all on table public.mj_categories from anon, authenticated;
revoke all on table public.mj_transaction_events from anon, authenticated;
revoke all on function public.mj_log_transaction_change() from public, anon, authenticated;

-- Explicit grants รองรับโปรเจกต์ที่ไม่ expose ตารางใหม่อัตโนมัติ
grant select, insert, update, delete on table public.mj_pending_batches to service_role;
grant select, insert, update, delete on table public.mj_transactions to service_role;
grant select, insert, update, delete on table public.mj_categories to service_role;
grant select, insert on table public.mj_transaction_events to service_role;
grant usage, select on sequence public.mj_transaction_events_id_seq to service_role;
grant execute on function public.mj_log_transaction_change() to service_role;

-- ข้อมูลตัวอย่าง TEST เท่านั้น
insert into public.mj_categories (line_user_id, name, entry_type, monthly_budget, color)
values
  ('TEST-U001', 'อาหาร', 'expense', 5000, '#D75287'),
  ('TEST-U001', 'งานรูป', 'income', null, '#4DAF8B'),
  ('TEST-U001', 'งานป้าย', 'income', null, '#6D3B8C')
on conflict (line_user_id, name) do nothing;

commit;
