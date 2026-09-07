-- ============================================================
-- ม่วงจด (Muang Jod) — initial schema
-- Target: Supabase (PostgreSQL)
-- ============================================================

-- UUID generation. Supabase ships pgcrypto, which provides gen_random_uuid().
-- (uuid-ossp is not required.)
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- profiles: one row per LINE user. The security anchor —
-- every other table references profiles.id as user_id.
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
-- Money fields use numeric(12,2): exact decimal, no float rounding
-- errors, up to 9,999,999,999.99 baht.
-- ------------------------------------------------------------
create table if not exists public.jobs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  job_number     text,
  job_name       text,
  customer_name  text,
  job_date       date not null default current_date,
  subtotal       numeric(12,2) not null default 0,
  discount       numeric(12,2) not null default 0,
  total          numeric(12,2) not null default 0,
  payment_status text not null default 'pending'
                 check (payment_status in ('pending', 'paid', 'partial')),
  status         text not null default 'active'
                 check (status in ('active', 'completed', 'cancelled')),
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Indexes: every job lookup filters by user_id first (data isolation),
-- then by status / payment_status / date.
create index if not exists jobs_user_id_idx        on public.jobs (user_id);
create index if not exists jobs_user_status_idx     on public.jobs (user_id, status);
create index if not exists jobs_user_payment_idx    on public.jobs (user_id, payment_status);
create index if not exists jobs_user_job_date_idx   on public.jobs (user_id, job_date);
create index if not exists jobs_job_date_idx         on public.jobs (job_date);
create index if not exists jobs_payment_status_idx   on public.jobs (payment_status);
create index if not exists jobs_created_at_idx       on public.jobs (created_at);

-- ------------------------------------------------------------
-- job_items
-- quantity is numeric(12,2) to allow fractional units (e.g. metres).
-- ------------------------------------------------------------
create table if not exists public.job_items (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs (id) on delete cascade,
  item_name   text not null,
  size        text,
  quantity    numeric(12,2) not null default 1,
  unit        text,
  unit_price  numeric(12,2) not null default 0,
  total       numeric(12,2) not null default 0,
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
-- user_states: conversation state machine, one row per user.
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
-- updated_at triggers (jobs + user_states)
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

drop trigger if exists user_states_set_updated_at on public.user_states;
create trigger user_states_set_updated_at
  before update on public.user_states
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Row Level Security
-- The server uses the service_role key (which bypasses RLS) and enforces
-- per-user isolation in code by always filtering on user_id. RLS is enabled
-- with NO public policies, so the anon/public key cannot read anything
-- directly — a browser or leaked anon key sees nothing.
-- ------------------------------------------------------------
alter table public.profiles    enable row level security;
alter table public.jobs        enable row level security;
alter table public.job_items   enable row level security;
alter table public.attachments enable row level security;
alter table public.user_states enable row level security;

-- ------------------------------------------------------------
-- Storage bucket for job evidence (slips / documents).
-- Private bucket; the server issues signed URLs. 10 MB per file.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'job-evidence',
  'job-evidence',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;
