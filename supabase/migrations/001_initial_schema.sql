-- ============================================================
-- ม่วงจด (Muang Jod) — initial schema
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- profiles: one row per LINE user. The security anchor.
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key default gen_random_uuid(),
  line_user_id  text unique not null,
  display_name  text,
  picture_url   text,
  created_at    timestamptz not null default now()
);

create index if not exists profiles_line_user_id_idx on public.profiles (line_user_id);

-- ------------------------------------------------------------
-- jobs
-- ------------------------------------------------------------
create table if not exists public.jobs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  job_number     text,
  job_name       text,
  customer_name  text,
  job_date       date not null default current_date,
  subtotal       numeric not null default 0,
  discount       numeric not null default 0,
  total          numeric not null default 0,
  payment_status text not null default 'pending'
                 check (payment_status in ('pending', 'paid', 'partial')),
  status         text not null default 'active'
                 check (status in ('active', 'completed', 'cancelled')),
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists jobs_user_id_idx on public.jobs (user_id);
create index if not exists jobs_user_status_idx on public.jobs (user_id, status);
create index if not exists jobs_user_payment_idx on public.jobs (user_id, payment_status);
create index if not exists jobs_created_at_idx on public.jobs (created_at);

-- ------------------------------------------------------------
-- job_items
-- ------------------------------------------------------------
create table if not exists public.job_items (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs (id) on delete cascade,
  item_name   text not null,
  size        text,
  quantity    numeric not null default 1,
  unit        text,
  unit_price  numeric not null default 0,
  total       numeric not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists job_items_job_id_idx on public.job_items (job_id);

-- ------------------------------------------------------------
-- attachments
-- ------------------------------------------------------------
create table if not exists public.attachments (
  id               uuid primary key default gen_random_uuid(),
  job_id           uuid not null references public.jobs (id) on delete cascade,
  line_message_id  text,
  file_url         text not null,
  file_type        text,
  created_at       timestamptz not null default now()
);

create index if not exists attachments_job_id_idx on public.attachments (job_id);

-- ------------------------------------------------------------
-- user_states: conversation state machine per user
-- ------------------------------------------------------------
create table if not exists public.user_states (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid unique not null references public.profiles (id) on delete cascade,
  state       text not null default 'idle',
  context     jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

create index if not exists user_states_user_id_idx on public.user_states (user_id);

-- ------------------------------------------------------------
-- updated_at trigger for jobs
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists jobs_set_updated_at on public.jobs;
create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Row Level Security
-- The server uses the service_role key (bypasses RLS) and enforces
-- per-user isolation in code via user_id. RLS is enabled with no public
-- policies so that the anon/public key cannot read anything directly.
-- ------------------------------------------------------------
alter table public.profiles    enable row level security;
alter table public.jobs        enable row level security;
alter table public.job_items   enable row level security;
alter table public.attachments enable row level security;
alter table public.user_states enable row level security;

-- ------------------------------------------------------------
-- Storage bucket for evidence (create if not exists)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('evidence', 'evidence', false)
on conflict (id) do nothing;
