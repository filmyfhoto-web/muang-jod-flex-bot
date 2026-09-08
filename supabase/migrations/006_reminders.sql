-- ============================================================
-- ม่วงจด — reminders (ตั้งแจ้งเตือนงาน)
-- Safe to run repeatedly.
-- ============================================================

create extension if not exists "pgcrypto";

create table if not exists public.reminders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  job_id      uuid references public.jobs (id) on delete cascade,
  message     text not null,
  remind_at   timestamptz not null,
  status      text not null default 'pending'
              check (status in ('pending', 'sent', 'cancelled')),
  sent_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists reminders_user_idx    on public.reminders (user_id, status);
-- The dispatcher's only query: everything still pending and already due.
create index if not exists reminders_due_idx     on public.reminders (status, remind_at);
create index if not exists reminders_job_idx     on public.reminders (job_id);

drop trigger if exists reminders_set_updated_at on public.reminders;
create trigger reminders_set_updated_at
  before update on public.reminders
  for each row execute function public.set_updated_at();

alter table public.reminders enable row level security;
