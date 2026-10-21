-- line-assist (OPTIONAL): tell the person a customer chose them.
--
-- When a customer taps a name in the shop's own picker, line-bot answers it itself and goes quiet for that
-- customer (it writes mode = 'admin' and admin_name = <name> to line_chat_state). Nobody else is told. This
-- trigger notices that write and asks line-assist (through pg_net, after the write has committed) to send the
-- chosen person the same short card the old bot sent: "a customer wants to talk to you" — no message text,
-- at most once per customer per person per few hours.
--
-- Safe by construction:
--   · it only reads the row being written plus one secret, and only calls out when a choice was made
--     (admin_ms changed and admin_name is set); the shop's other writes (menu_ms, seen_ms, last_ms…) pass untouched
--   · every failure is swallowed — a missing pg_net, a missing secret or an unreachable function never blocks or
--     rolls back the shop's own write
--   · it does nothing until the secret 'faq_notify_url' exists; delete that secret (or drop the trigger) to stop it
--
--   insert into app_secrets(key, value, updated_at)
--   values ('faq_notify_url', 'https://<project>.supabase.co/functions/v1/line-assist?k=<faq_hook_key>', now())
--   on conflict (key) do update set value = excluded.value, updated_at = now();
--
-- Needs the pg_net extension (Database → Extensions). Remove with:  drop trigger st_pick_alert on public.line_chat_state;

create or replace function public.st_pick_alert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare u text;
begin
  if new.mode = 'admin'
     and new.admin_name is not null
     and (tg_op = 'INSERT' or new.admin_ms is distinct from old.admin_ms or old.admin_name is distinct from new.admin_name)
  then
    begin
      select value into u from public.app_secrets where key = 'faq_notify_url';
      if u is not null and u <> '' then
        perform net.http_post(
          url := u,
          body := jsonb_build_object('action', 'pick_alert', 'user_id', new.user_id, 'admin_name', new.admin_name),
          headers := jsonb_build_object('Content-Type', 'application/json')
        );
      end if;
    exception when others then
      null; -- never get in the way of the shop's own write
    end;
  end if;
  return new;
end $$;

revoke all on function public.st_pick_alert() from public, anon, authenticated;

drop trigger if exists st_pick_alert on public.line_chat_state;
create trigger st_pick_alert
  after insert or update on public.line_chat_state
  for each row execute function public.st_pick_alert();
