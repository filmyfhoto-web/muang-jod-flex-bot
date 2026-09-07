-- ============================================================
-- ม่วงจด — Phase 2: hardening
--   - webhook_events (idempotency)
--   - jobs.paid_amount / balance_due (partial payments)
--   - atomic create_job_with_items() RPC + job_number uniqueness
--   - search indexes
-- Safe to run on top of 001 (idempotent).
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Idempotency: one row per processed LINE event id.
-- ------------------------------------------------------------
create table if not exists public.webhook_events (
  id             uuid primary key default gen_random_uuid(),
  line_event_id  text unique not null,
  event_type     text,
  processed_at   timestamptz not null default now()
);

create index if not exists webhook_events_line_event_id_idx
  on public.webhook_events (line_event_id);

alter table public.webhook_events enable row level security;

-- ------------------------------------------------------------
-- Partial payments on jobs.
-- ------------------------------------------------------------
alter table public.jobs add column if not exists paid_amount  numeric(12,2) not null default 0;
alter table public.jobs add column if not exists balance_due  numeric(12,2) not null default 0;

-- Backfill balance_due for rows created before this migration.
update public.jobs
   set balance_due = greatest(total - paid_amount, 0)
 where balance_due = 0 and total > 0;

-- ------------------------------------------------------------
-- job_number: unique per user so MJ-YYYYMMDD-XXXX never collides.
-- ------------------------------------------------------------
do $$
begin
  alter table public.jobs
    add constraint jobs_user_job_number_key unique (user_id, job_number);
exception
  when duplicate_object then null;
end $$;

create index if not exists jobs_job_number_idx on public.jobs (job_number);

-- ------------------------------------------------------------
-- Atomic job creation. Runs in a single transaction (function body),
-- generates a unique MJ-YYYYMMDD-XXXX job_number, and inserts the job
-- together with all its items — so items can never leave an orphan job.
-- ------------------------------------------------------------
create or replace function public.create_job_with_items(
  p_user_id        uuid,
  p_job_name       text,
  p_customer_name  text,
  p_job_date       date,
  p_subtotal       numeric,
  p_discount       numeric,
  p_total          numeric,
  p_payment_status text,
  p_paid_amount    numeric,
  p_note           text,
  p_items          jsonb
) returns public.jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date       date := coalesce(p_job_date, current_date);
  v_seq        int;
  v_job_number text;
  v_job        public.jobs;
  v_item       jsonb;
  v_attempt    int := 0;
  v_total      numeric := coalesce(p_total, 0);
  v_paid       numeric := coalesce(p_paid_amount, 0);
begin
  select count(*) into v_seq
    from public.jobs
   where user_id = p_user_id and job_date = v_date;

  loop
    v_attempt := v_attempt + 1;
    v_seq := v_seq + 1;
    v_job_number := 'MJ-' || to_char(v_date, 'YYYYMMDD') || '-' || lpad(v_seq::text, 4, '0');
    begin
      insert into public.jobs (
        user_id, job_number, job_name, customer_name, job_date,
        subtotal, discount, total, payment_status, status,
        paid_amount, balance_due, note
      ) values (
        p_user_id, v_job_number, p_job_name, p_customer_name, v_date,
        coalesce(p_subtotal, 0), coalesce(p_discount, 0), v_total,
        coalesce(p_payment_status, 'pending'), 'active',
        v_paid, greatest(v_total - v_paid, 0), p_note
      )
      returning * into v_job;
      exit;
    exception when unique_violation then
      if v_attempt >= 25 then raise; end if;
      -- another concurrent insert took this number; try the next one
    end;
  end loop;

  if p_items is not null then
    for v_item in select * from jsonb_array_elements(p_items)
    loop
      insert into public.job_items (job_id, item_name, size, quantity, unit, unit_price, total)
      values (
        v_job.id,
        coalesce(v_item->>'item_name', 'รายการ'),
        nullif(v_item->>'size', ''),
        coalesce((v_item->>'quantity')::numeric, 1),
        nullif(v_item->>'unit', ''),
        coalesce((v_item->>'unit_price')::numeric, 0),
        coalesce((v_item->>'total')::numeric, 0)
      );
    end loop;
  end if;

  return v_job;
end;
$$;
