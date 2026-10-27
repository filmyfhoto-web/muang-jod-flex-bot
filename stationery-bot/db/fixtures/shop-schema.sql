-- สคีมาย่อของโปรเจกต์ Supabase ของร้าน ใช้ทดสอบเท่านั้น (ไม่ใช่ของจริง)
-- คอลัมน์และชนิดข้อมูลคัดจาก information_schema ของ production (26 ต.ค. 2569); pos_checkout คัดจาก pg_get_functiondef ของ production
-- ตรวจซ้ำกับ production ก่อนใช้งานจริงทุกครั้งที่โครงสร้างเปลี่ยน

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;
create or replace function auth.uid() returns uuid
language sql stable
as $fn$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$fn$;

create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text not null,
  owner uuid,
  created_at timestamptz default now(),
  metadata jsonb
);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated, service_role;
grant select, insert, update, delete on storage.buckets to authenticated, service_role;

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  vat_rate numeric not null default 0,
  doc_prefix text,
  address text,
  phone text,
  created_at timestamptz not null default now(),
  seller_name text,
  tax_id text,
  att_files jsonb
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  barcode text,
  category_id uuid references public.categories(id) on delete set null,
  type text not null default 'ของขาย',
  cost numeric,
  price numeric,
  unit text,
  stock_qty integer not null default 0,
  reorder_point integer,
  image_url text,
  school_supply boolean not null default false,
  legacy_status text,
  image_file text,
  web_cat text,
  badge text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now(),
  brand text,
  tier_prices jsonb,
  aliases text,
  cat_review boolean not null default false,
  store_id uuid references public.stores(id) on delete set null
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  line_name text,
  email text,
  address text,
  source text,
  created_at timestamptz not null default now(),
  tax_id text
);

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null default '',
  markup_pct numeric not null default 0,
  round_to numeric not null default 1,
  active boolean not null default true,
  web_markup numeric not null default 0
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  sale_no text,
  subtotal numeric not null default 0,
  vat_amount numeric not null default 0,
  total numeric not null default 0,
  payment_method text,
  created_at timestamptz not null default now(),
  channel text default 'หน้าร้าน',
  discount numeric default 0,
  status text default 'paid',
  received numeric,
  change_amt numeric,
  note text,
  meta jsonb default '{}'::jsonb,
  paid_at timestamptz,
  cancelled_at timestamptz
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  qty numeric not null default 1,
  unit_price numeric not null default 0,
  discount numeric default 0,
  line_total numeric not null default 0,
  name text,
  unit text,
  barcode text,
  is_gift boolean default false
);

create table public.stock_moves (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  delta integer not null default 0,
  reason text,
  balance_after integer,
  note text,
  created_at timestamptz default now(),
  doc_id uuid
);

create sequence public.order_no_seq start 145;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  school_id uuid references public.schools(id) on delete set null,
  orderer_name text,
  phone text,
  project text,
  org text,
  note text,
  channel text not null default 'storefront',
  status text not null default 'pending',
  subtotal numeric not null default 0,
  total numeric not null default 0,
  created_at timestamptz not null default now(),
  line_user_id text,
  line_name text,
  line_notify text,
  attach_n integer not null default 0,
  school_name text,
  project_doc_id uuid,
  project_doc_no text,
  project_room text,
  packed_at timestamptz,
  constraint orders_school_name_len check (school_name is null or char_length(school_name) <= 200)
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text,
  qty numeric not null default 1,
  unit_price numeric not null default 0,
  line_total numeric not null default 0,
  sort integer not null default 0,
  set_id uuid,
  set_name text,
  set_qty numeric,
  set_unit numeric,
  set_grp integer
);

-- ขายหน้าร้านผ่าน POS · สำเนาจาก production (pg_get_functiondef) — ไม่ได้แก้ไขเนื้อความ
create or replace function public.pos_checkout(p jsonb)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_store public.stores; v_code text; v_pre text; v_last text; v_seq int; v_no text;
  v_d date := (now() at time zone 'Asia/Bangkok')::date;
  v_items jsonb := coalesce(p->'items','[]'::jsonb);
  it jsonb; v_gross numeric := 0; v_line numeric; v_disc numeric := greatest(coalesce((p->>'discount')::numeric,0),0);
  v_total numeric; v_vr numeric; v_vat numeric; v_status text := coalesce(nullif(p->>'status',''),'paid');
  v_sale public.sales; v_pid uuid; v_q numeric; v_old int; v_new int; v_type text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into v_store from public.stores where id = (p->>'store_id')::uuid;
  if not found then raise exception 'store not found'; end if;
  if jsonb_array_length(v_items) = 0 then raise exception 'empty cart'; end if;
  if v_status not in ('paid','credit') then raise exception 'bad status'; end if;
  if v_status = 'credit' and nullif(p->>'customer_id','') is null then raise exception 'credit sale needs a customer'; end if;

  for it in select * from jsonb_array_elements(v_items) loop
    v_line := case when coalesce((it->>'is_gift')::boolean,false) then 0
                   else greatest(coalesce((it->>'qty')::numeric,0)*coalesce((it->>'price')::numeric,0) - coalesce((it->>'discount')::numeric,0),0) end;
    v_gross := v_gross + v_line;
  end loop;
  v_total := greatest(round(v_gross - v_disc, 2), 0);
  v_vr := coalesce(v_store.vat_rate,0);
  v_vat := case when v_vr > 0 then round(v_total * v_vr / (100 + v_vr), 2) else 0 end;

  v_code := coalesce(nullif(split_part(coalesce(v_store.doc_prefix,''),'-',2),''),'ST');
  v_pre := 'POS-' || v_code || '-' || lpad(((extract(year from v_d)::int + 543) % 100)::text,2,'0') || to_char(v_d,'MMDD') || '-';
  perform pg_advisory_xact_lock(hashtext('pos_no:' || v_store.id::text));
  select sale_no into v_last from public.sales where store_id = v_store.id and sale_no like v_pre || '%' order by sale_no desc limit 1;
  v_seq := coalesce(nullif(regexp_replace(coalesce(substr(v_last, length(v_pre)+1),''),'\D','','g'),'')::int,0) + 1;
  v_no := v_pre || lpad(v_seq::text, 4, '0');

  insert into public.sales(store_id, customer_id, sale_no, subtotal, vat_amount, total, payment_method, channel, discount, status, received, change_amt, note, meta, paid_at)
  values (v_store.id, nullif(p->>'customer_id','')::uuid, v_no, v_total - v_vat, v_vat, v_total,
          coalesce(nullif(p->>'payment_method',''),'เงินสด'), coalesce(nullif(p->>'channel',''),'หน้าร้าน'), v_disc, v_status,
          nullif(p->>'received','')::numeric,
          case when nullif(p->>'received','') is not null then greatest((p->>'received')::numeric - v_total,0) end,
          nullif(p->>'note',''), coalesce(p->'meta','{}'::jsonb),
          case when v_status = 'paid' then now() end)
  returning * into v_sale;

  for it in select * from jsonb_array_elements(v_items) loop
    v_pid := nullif(it->>'product_id','')::uuid;
    v_q := coalesce((it->>'qty')::numeric,0);
    insert into public.sale_items(sale_id, product_id, name, unit, barcode, qty, unit_price, discount, line_total, is_gift)
    values (v_sale.id, v_pid, it->>'name', it->>'unit', it->>'barcode', v_q,
            case when coalesce((it->>'is_gift')::boolean,false) then 0 else coalesce((it->>'price')::numeric,0) end,
            coalesce((it->>'discount')::numeric,0),
            case when coalesce((it->>'is_gift')::boolean,false) then 0
                 else greatest(v_q*coalesce((it->>'price')::numeric,0) - coalesce((it->>'discount')::numeric,0),0) end,
            coalesce((it->>'is_gift')::boolean,false));
    if v_pid is not null then
      select stock_qty, type into v_old, v_type from public.products where id = v_pid for update;
      if found and coalesce(v_type,'') <> 'งานบริการ' and round(v_q) <> 0 then
        v_new := greatest(coalesce(v_old,0) - round(v_q)::int, 0);
        update public.products set stock_qty = v_new, updated_at = now() where id = v_pid;
        insert into public.stock_moves(product_id, delta, reason, balance_after, note)
        values (v_pid, v_new - coalesce(v_old,0), 'ขายหน้าร้าน', v_new, v_no);
      end if;
    end if;
  end loop;
  return to_jsonb(v_sale);
end $function$;

grant all on all tables in schema public to anon, authenticated, service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
