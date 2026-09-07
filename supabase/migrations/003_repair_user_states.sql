-- ============================================================
-- ม่วงจด — repair: user_states must have exactly one row per user
-- Safe to run repeatedly. Fixes databases created from a hand-edited
-- schema where user_states.user_id lost its UNIQUE constraint, which makes
-- the state upsert fail with 42P10 ("no unique or exclusion constraint
-- matching the ON CONFLICT specification").
-- ============================================================

create table if not exists public.user_states (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  state       text not null default 'idle',
  context     jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- Columns a database from an older/simplified schema may be missing.
alter table public.user_states add column if not exists context    jsonb not null default '{}'::jsonb;
alter table public.user_states add column if not exists updated_at timestamptz not null default now();

-- Collapse any duplicates (keep the most recently updated row per user).
delete from public.user_states u
using public.user_states keep
where u.user_id = keep.user_id
  and (u.updated_at, u.id) < (keep.updated_at, keep.id);

-- Add the UNIQUE constraint only if no unique index already covers user_id.
do $$
begin
  if not exists (
    select 1
    from pg_index i
    join pg_class t on t.oid = i.indrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'user_states'
      and i.indisunique
      and i.indnatts = 1
      and i.indkey[0] = (
        select attnum from pg_attribute
        where attrelid = t.oid and attname = 'user_id'
      )
  ) then
    alter table public.user_states
      add constraint user_states_user_id_key unique (user_id);
  end if;
end $$;

create index if not exists user_states_user_id_idx on public.user_states (user_id);

alter table public.user_states enable row level security;
