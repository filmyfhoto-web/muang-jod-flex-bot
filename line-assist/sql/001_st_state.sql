-- line-assist: a small memory for the LINE assistant (additive only — nothing existing is touched).
--   st_state      one row per thing worth remembering about a customer, e.g.
--                   quiet:<userId>        the customer chose a person to talk to; the bot stays quiet
--                   alert:<userId>        the admins were told about this customer (once per few hours)
--                   pick:<userId>:<name>  that person was told the customer wants them
--                   img:<userId>          a picture/file was thanked recently
--                   last:<userId>         the bot's last reply (so several messages at once get one answer)
--                   hol:<userId>:<day>    told about the weekly closing day today
--                   await:<userId>        the bot asked "which school?" and waits for the answer
--                   pause:all             an admin switched the bot off for a while
--                   prof:<userId>         a LINE profile kept for an hour
--   st_claim / st_touch_within   the two atomic checks the code needs
-- Only the service role (edge functions) can read or write: RLS is on and there are no policies.

create table if not exists public.st_state (
  key  text primary key,
  at   bigint not null,                    -- ms since epoch of the last write
  data jsonb  not null default '{}'::jsonb
);
create index if not exists st_state_at_idx on public.st_state (at);
alter table public.st_state enable row level security;

-- true for the first caller within p_ms of the last claim (a second webhook arriving at the same
-- moment gets false), and records the claim.
create or replace function public.st_claim(p_key text, p_now bigint, p_ms bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare ok boolean;
begin
  insert into public.st_state as s (key, at) values (p_key, p_now)
  on conflict (key) do update set at = excluded.at where s.at <= p_now - p_ms
  returning true into ok;
  return coalesce(ok, false);
end $$;

-- true when p_key was written less than p_ms ago, and renews it (a sliding window).
create or replace function public.st_touch_within(p_key text, p_now bigint, p_ms bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare ok boolean;
begin
  update public.st_state set at = p_now where key = p_key and at > p_now - p_ms returning true into ok;
  return coalesce(ok, false);
end $$;

revoke all on function public.st_claim(text, bigint, bigint) from public, anon, authenticated;
revoke all on function public.st_touch_within(text, bigint, bigint) from public, anon, authenticated;
grant execute on function public.st_claim(text, bigint, bigint) to service_role;
grant execute on function public.st_touch_within(text, bigint, bigint) to service_role;
