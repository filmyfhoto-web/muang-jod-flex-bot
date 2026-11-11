-- Reply Studio: where the owner's edits are saved from, and the way back.
--
-- The Studio page runs `select public.studio_save(...)` through the owner's own Supabase connection, so it needs
-- no key of its own. These functions are the only things it may call to change the bot: they accept nothing but
-- the handful of "content" keys the bot reads (rules, school list, texts) and keep every previous version.
-- Nothing here is reachable from the public API: execute is granted to the service role only.

create table if not exists public.studio_history (
  id bigserial primary key,
  saved_at timestamptz not null default now(),
  note text not null default '',
  content jsonb not null
);
alter table public.studio_history enable row level security; -- no policies: only the service role and these functions can touch it
revoke all on public.studio_history from public, anon, authenticated;

-- Everything the Studio shows on opening: the bot's content, the shop's own bot settings (names, buttons) and the last
-- 20 saved versions. The LINE ids of the people are replaced by a placeholder: the page needs to know who exists,
-- never their ids.
create or replace function public.studio_load()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'faq_bot', (
      select jsonb_set(
        value - 'chatLinkTemplate',
        '{admins}',
        coalesce((select jsonb_agg(jsonb_set(a, '{userId}', to_jsonb('U' || repeat('0', 32)))) from jsonb_array_elements(coalesce(value->'admins', '[]'::jsonb)) a), '[]'::jsonb)
      )
      from public.app_config where key = 'faq_bot'
    ),
    'line_bot', (select value from public.app_config where key = 'line_bot'),
    'history', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'saved_at', saved_at, 'note', note) order by id desc) from (select * from public.studio_history order by id desc limit 20) h), '[]'::jsonb)
  );
$$;

-- Saves the owner's edits: only these keys, merged into faq_bot.content; the previous content goes to the history.
-- (The history is never trimmed here: a save is a deliberate click, so it grows by a few KB a week.)
create or replace function public.studio_save(p_content jsonb, p_note text default '')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cur jsonb;
  old jsonb;
begin
  if p_content is null or jsonb_typeof(p_content) <> 'object' then
    raise exception 'content must be an object';
  end if;
  if length(p_content::text) > 400000 then
    raise exception 'content is too large';
  end if;
  if exists (select 1 from jsonb_object_keys(p_content) as k where k not in ('rules', 'schoolSupplies', 'greeting', 'thanks', 'holiday', 'contact')) then
    raise exception 'unknown key in content';
  end if;
  if jsonb_exists(p_content, 'rules') and (jsonb_typeof(p_content->'rules') <> 'array' or jsonb_array_length(p_content->'rules') > 100) then
    raise exception 'rules must be a list of at most 100';
  end if;
  if jsonb_exists(p_content, 'schoolSupplies') and (jsonb_typeof(p_content->'schoolSupplies'->'schools') <> 'array' or jsonb_array_length(p_content->'schoolSupplies'->'schools') > 300) then
    raise exception 'schools must be a list of at most 300';
  end if;

  select value into cur from public.app_config where key = 'faq_bot' for update;
  if cur is null then
    raise exception 'faq_bot settings row is missing';
  end if;
  old := coalesce(cur->'content', '{}'::jsonb);
  insert into public.studio_history (note, content) values (left(coalesce(p_note, ''), 200), old);
  update public.app_config set value = jsonb_set(cur, '{content}', old || p_content, true), updated_at = now() where key = 'faq_bot';
  return jsonb_build_object('ok', true);
end;
$$;

-- Puts an earlier version back (the current one is kept in the history first).
create or replace function public.studio_restore(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cur jsonb;
  h jsonb;
begin
  select content into h from public.studio_history where id = p_id;
  if h is null then
    raise exception 'there is no such version';
  end if;
  select value into cur from public.app_config where key = 'faq_bot' for update;
  if cur is null then
    raise exception 'faq_bot settings row is missing';
  end if;
  insert into public.studio_history (note, content) values ('before going back to #' || p_id, coalesce(cur->'content', '{}'::jsonb));
  update public.app_config set value = jsonb_set(cur, '{content}', h, true), updated_at = now() where key = 'faq_bot';
  return jsonb_build_object('ok', true);
end;
$$;

-- off = everything goes to the old bot · admins = only the people in the list are answered here · all = everybody.
create or replace function public.studio_set_mode(p_mode text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_mode is null or p_mode not in ('off', 'admins', 'all') then
    raise exception 'mode must be off, admins or all';
  end if;
  update public.app_config set value = jsonb_set(value, '{mode}', to_jsonb(p_mode)), updated_at = now() where key = 'faq_bot';
  if not found then
    raise exception 'faq_bot settings row is missing';
  end if;
  return jsonb_build_object('ok', true, 'mode', p_mode);
end;
$$;

revoke all on function public.studio_load() from public, anon, authenticated;
revoke all on function public.studio_save(jsonb, text) from public, anon, authenticated;
revoke all on function public.studio_restore(bigint) from public, anon, authenticated;
revoke all on function public.studio_set_mode(text) from public, anon, authenticated;
grant execute on function public.studio_load() to service_role;
grant execute on function public.studio_save(jsonb, text) to service_role;
grant execute on function public.studio_restore(bigint) to service_role;
grant execute on function public.studio_set_mode(text) to service_role;
