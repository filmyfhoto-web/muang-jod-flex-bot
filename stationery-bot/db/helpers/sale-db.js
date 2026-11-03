// A PostgreSQL (PGlite) shaped like the shop's production project for the "แชตและออเดอร์" page: the shared fixture
// (fixtures/shop-schema.sql) plus what this page touches that the fixture does not have, copied from production on 3 Nov 2569:
// the chat tables sale_threads / sale_msgs (columns, defaults and checks as in information_schema / pg_constraint), the
// school columns price_special / short_code, the shop's own price function _school_item_price (both overloads, verbatim from
// pg_get_functiondef), the private bucket sale-files, and RLS with the one policy production has on every back-office table
// ("staff_all", for authenticated). Supabase's default privileges (anon/authenticated get everything new in public) are switched
// on before the migration, so the tests prove that 002 itself takes anon's access away.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const file = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
export const migration002 = () => file('migrations/002_sale_orders.sql');
export const reverse002 = () => file('migrations/002_sale_orders.reverse.sql');

export const PRODUCTION_EXTRAS = `
alter table public.schools add column if not exists price_special boolean not null default false;
alter table public.schools add column if not exists short_code text;

create table public.sale_threads (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id),
  title text not null default '',
  phone text,
  source text not null default 'manual' check (source = any (array['line'::text, 'web'::text, 'manual'::text])),
  stage text not null default 'talk' check (stage = any (array['talk'::text, 'quote'::text, 'confirm'::text, 'work'::text, 'done'::text, 'closed'::text])),
  unread integer not null default 0,
  last_text text,
  last_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.sale_msgs (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.sale_threads(id),
  dir text not null check (dir = any (array['in'::text, 'out'::text, 'note'::text])),
  kind text not null default 'text',
  body text not null default '',
  by_name text,
  meta jsonb,
  created_at timestamptz not null default now()
);
grant all on public.sale_threads, public.sale_msgs to anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public._school_item_price(p_price numeric, p_tiers jsonb, p_markup numeric, p_round numeric)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case
    when p_tiers ? trim(to_char(coalesce(p_markup,0),'FM999999.###'))
      then round((p_tiers ->> trim(to_char(coalesce(p_markup,0),'FM999999.###')))::numeric, 0)
    else round(coalesce(p_price,0) * (1 + coalesce(p_markup,0)/100), 0)
  end
$function$;
CREATE OR REPLACE FUNCTION public._school_item_price(p_price numeric, p_tiers jsonb, p_markup numeric, p_round numeric, p_special boolean)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    select case
      when coalesce(p_special,false) and nullif(p_tiers ->> '20s','') is not null then round((p_tiers ->> '20s')::numeric, 0)
      else public._school_item_price(p_price, p_tiers, p_markup, p_round)
    end
$function$;

insert into storage.buckets (id, name, public) values ('sale-files', 'sale-files', false) on conflict (id) do nothing;

do $$
declare t text;
begin
  foreach t in array array['sale_threads', 'sale_msgs', 'customers', 'products', 'stores', 'schools', 'orders', 'order_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy staff_all on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

// The production-shaped database. migrate: false leaves 002 out (to test it being applied and taken back).
export async function openSaleDb({ migrate = true } = {}) {
  const db = new PGlite();
  await db.exec(file('fixtures/shop-schema.sql'));
  await db.exec(PRODUCTION_EXTRAS);
  if (migrate) await db.exec(migration002());
  return db;
}

// Runs fn(tx) as the anon role (a visitor with no login), the way PostgREST does for the public key.
export function asAnon(db, fn) {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: 'anon' })]);
    await tx.exec('set local role anon');
    return fn(tx);
  });
}
