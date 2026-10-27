-- LINE OA Chat to Order · ชั้นฐานข้อมูล
--
-- เพิ่มอย่างเดียว: ตารางใหม่ 4 ตาราง ฟังก์ชัน 5 ตัว และ bucket ส่วนตัว 1 อัน · ไม่แก้ตาราง ฟังก์ชัน หรือโมดูลเดิมแม้แต่บรรทัดเดียว
-- ใช้กับโปรเจกต์ Supabase ของร้าน (mamlmgixovlwnjstetkj) หลังเจ้าของอนุมัติเท่านั้น · ย้อนกลับ: 001_chat_drafts.reverse.sql
-- ทดสอบบน PostgreSQL จริง (PGlite) กับสคีมาย่อที่คัดจาก production: db/fixtures/shop-schema.sql และ db/test/*.test.js
--
-- ผังข้อมูล:
--   line_channels      ช่อง LINE OA ที่รับข้อความ (ช่องหลักใช้ค่าจาก Render; ความลับเข้าถึงได้เฉพาะ service role)
--   chat_drafts        ออเดอร์ร่างจากแชท 1 ใบ = ลูกค้า 1 คนใน 1 OA ในช่วงเวลาหนึ่ง (เปิดได้ 1 ใบต่อคู่นี้)
--   chat_messages      ข้อความ/รูปที่เกี่ยวกับออเดอร์ (ไม่ซ้ำด้วย LINE message id) · รูปอยู่ bucket chat-media
--   chat_draft_events  ประวัติการเปลี่ยนแปลงทุกครั้ง (สร้าง/ต่อ/แก้/ยืนยัน/ยกเลิก/ขาย POS/ส่งแจ้งลูกค้า)

-- 1) ช่อง LINE OA ----------------------------------------------------------------------------------------------
create table if not exists public.line_channels (
  key text primary key,
  name text not null,
  shop_label text,
  bot_user_id text,
  channel_secret text,
  channel_token text,
  enabled boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.line_channels enable row level security;
revoke all on public.line_channels from anon, authenticated;
grant all on public.line_channels to service_role;

insert into public.line_channels (key, name, shop_label, enabled)
values ('main', 'OA หลัก (นัฐภรณ์ เชียงกลาง)', 'นัฐภรณ์ เชียงกลาง', true)
on conflict (key) do nothing;

-- 2) ออเดอร์ร่างจากแชท -----------------------------------------------------------------------------------------
create sequence if not exists public.chat_draft_seq;

create table if not exists public.chat_drafts (
  id uuid primary key default gen_random_uuid(),
  draft_no text not null unique,
  channel_key text not null references public.line_channels(key),
  line_user_id text not null,
  line_name text,
  customer_name text,
  phone text,
  school_name text,
  need_date date,
  note text,
  items jsonb not null default '[]'::jsonb,
  status text not null default 'open' check (status in ('open', 'confirmed', 'cancelled')),
  order_id uuid references public.orders(id) on delete set null,
  order_no text,
  pos_sale_id uuid references public.sales(id) on delete set null,
  pos_sale_no text,
  version integer not null default 1,
  first_msg_at timestamptz not null default now(),
  last_msg_at timestamptz not null default now(),
  confirmed_at timestamptz,
  confirmed_by text,
  cancelled_at timestamptz,
  cancel_reason text,
  ack_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- ลูกค้าคนเดียวกันใน OA เดียวกันมีร่างที่เปิดอยู่ได้ไม่เกิน 1 ใบ: ข้อความใหม่ต่อเข้าใบนั้น ไม่สร้างใบซ้ำ
create unique index if not exists chat_drafts_one_open_per_customer
  on public.chat_drafts (channel_key, line_user_id) where status = 'open';
create index if not exists chat_drafts_status_idx on public.chat_drafts (status, updated_at desc);
create index if not exists chat_drafts_ack_idx on public.chat_drafts (status, ack_sent_at);

-- 3) ข้อความและรูปที่เกี่ยวกับออเดอร์ ----------------------------------------------------------------------------
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  channel_key text not null references public.line_channels(key),
  line_message_id text not null,
  line_user_id text not null,
  kind text not null check (kind in ('text', 'image')),
  body text,
  media_path text,
  draft_id uuid references public.chat_drafts(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (channel_key, line_message_id)
);
create index if not exists chat_messages_draft_idx on public.chat_messages (draft_id, created_at);

-- 4) ประวัติการเปลี่ยนแปลง -------------------------------------------------------------------------------------
create table if not exists public.chat_draft_events (
  id bigserial primary key,
  draft_id uuid not null references public.chat_drafts(id) on delete cascade,
  at timestamptz not null default now(),
  actor text not null,
  action text not null,
  detail jsonb not null default '{}'::jsonb
);
create index if not exists chat_draft_events_draft_idx on public.chat_draft_events (draft_id, at);

-- 5) รูปแนบ: bucket ส่วนตัว (เปิดดูด้วยลิงก์ชั่วคราวเท่านั้น) ------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-media', 'chat-media', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- 6) สิทธิ์ ----------------------------------------------------------------------------------------------------
-- พนักงาน (authenticated) อ่านได้อย่างเดียว · การเขียนทั้งหมดผ่านฟังก์ชันด้านล่าง หรือ service role ของบอทเท่านั้น
alter table public.chat_drafts enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_draft_events enable row level security;
revoke all on public.chat_drafts, public.chat_messages, public.chat_draft_events from anon, authenticated;
grant select on public.chat_drafts, public.chat_messages, public.chat_draft_events to authenticated;
grant all on public.chat_drafts, public.chat_messages, public.chat_draft_events to service_role;
grant usage, select on sequence public.chat_draft_seq to service_role;
grant usage, select on sequence public.chat_draft_events_id_seq to service_role;

drop policy if exists "staff read chat_drafts" on public.chat_drafts;
create policy "staff read chat_drafts" on public.chat_drafts for select to authenticated using (true);
drop policy if exists "staff read chat_messages" on public.chat_messages;
create policy "staff read chat_messages" on public.chat_messages for select to authenticated using (true);
drop policy if exists "staff read chat_draft_events" on public.chat_draft_events;
create policy "staff read chat_draft_events" on public.chat_draft_events for select to authenticated using (true);
drop policy if exists "staff read chat-media" on storage.objects;
create policy "staff read chat-media" on storage.objects for select to authenticated using (bucket_id = 'chat-media');

-- 7) ฟังก์ชัน ---------------------------------------------------------------------------------------------------

-- เลขร่างถัดไป (CH-0001…) · เรียกได้เฉพาะบอท (service role)
create or replace function public.chat_next_draft_no()
returns text
language sql
security definer
set search_path = public
as $fn$
  select 'CH-' || lpad(nextval('public.chat_draft_seq')::text, 4, '0');
$fn$;

-- บันทึกรายการในร่าง (พนักงาน) · ต้องส่งเลขเวอร์ชันที่อ่านมาด้วย ถ้ามีคนแก้ก่อนจะได้ conflict กลับไป ไม่เขียนทับ
create or replace function public.chat_draft_save(
  p_draft uuid, p_version integer, p_items jsonb,
  p_name text, p_phone text, p_school text, p_need_date date, p_note text, p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  d public.chat_drafts%rowtype;
  it jsonb;
  out_items jsonb := '[]'::jsonb;
  n integer := 0;
  v_id text;
  v_pid uuid;
  v_name text;
  v_unit text;
  v_qty numeric;
  v_price numeric;
  v_removed boolean;
  v_pname text;
  v_pcode text;
  v_punit text;
  v_pprice numeric;
  v_linked integer := 0;
  v_removed_n integer := 0;
begin
  if auth.uid() is null then raise exception 'auth'; end if;
  select * into d from public.chat_drafts where id = p_draft for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if d.status <> 'open' then return jsonb_build_object('ok', false, 'error', 'not_open', 'status', d.status); end if;
  if d.version <> p_version then return jsonb_build_object('ok', false, 'error', 'conflict', 'version', d.version); end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 200 then
    return jsonb_build_object('ok', false, 'error', 'bad_items');
  end if;

  for it in select value from jsonb_array_elements(p_items) loop
    n := n + 1;
    v_id := coalesce(nullif(it->>'id', ''), gen_random_uuid()::text);
    v_name := left(btrim(coalesce(it->>'name', '')), 200);
    v_unit := left(btrim(coalesce(it->>'unit', '')), 30);
    v_removed := coalesce(lower(it->>'removed') = 'true', false);
    begin v_qty := (it->>'qty')::numeric; exception when others then v_qty := null; end;
    begin v_price := nullif(it->>'price', '')::numeric; exception when others then v_price := null; end;
    begin v_pid := nullif(it->>'product_id', '')::uuid; exception when others then v_pid := null; end;
    v_pname := null; v_pcode := null; v_punit := null; v_pprice := null;
    if v_pid is not null then
      select p.name, p.code, p.unit, p.price into v_pname, v_pcode, v_punit, v_pprice
        from public.products p where p.id = v_pid;
      if not found then v_pid := null; end if;
    end if;
    if v_removed then
      v_removed_n := v_removed_n + 1;
    else
      if v_qty is null or v_qty <= 0 or v_qty > 100000 then
        return jsonb_build_object('ok', false, 'error', 'bad_qty', 'line', n);
      end if;
      if v_price is not null and v_price < 0 then
        return jsonb_build_object('ok', false, 'error', 'bad_price', 'line', n);
      end if;
      if v_pid is not null then v_linked := v_linked + 1; end if;
    end if;
    out_items := out_items || jsonb_build_array(jsonb_build_object(
      'id', v_id,
      'sort', n,
      'raw', left(coalesce(it->>'raw', ''), 300),
      'name', case when v_pid is not null then v_pname else coalesce(nullif(v_name, ''), '?') end,
      'said', case when v_pid is not null and v_name <> '' and v_name <> v_pname then v_name else null end,
      'qty', v_qty,
      'unit', case when v_pid is not null and v_unit = '' then coalesce(v_punit, '') else v_unit end,
      'product_id', v_pid,
      'product_code', v_pcode,
      'product_name', v_pname,
      'product_unit', v_punit,
      'product_price', v_pprice,
      'price', v_price,
      'staff_ok', coalesce(lower(it->>'staff_ok') = 'true', false),
      'status', case when v_pid is not null then 'ok' else 'review' end,
      'removed', v_removed,
      'suggestions', case when jsonb_typeof(it->'suggestions') = 'array' then it->'suggestions' else '[]'::jsonb end,
      'src', coalesce(nullif(it->>'src', ''), 'staff')
    ));
  end loop;

  update public.chat_drafts set
    items = out_items,
    customer_name = nullif(btrim(coalesce(p_name, '')), ''),
    phone = nullif(btrim(coalesce(p_phone, '')), ''),
    school_name = nullif(btrim(coalesce(p_school, '')), ''),
    need_date = p_need_date,
    note = nullif(left(coalesce(p_note, ''), 1000), ''),
    version = d.version + 1,
    updated_at = now()
  where id = d.id;

  insert into public.chat_draft_events (draft_id, actor, action, detail)
  values (d.id, coalesce(nullif(p_actor, ''), 'staff'), 'edited',
          jsonb_build_object('lines', n - v_removed_n, 'linked', v_linked, 'removed', v_removed_n));

  return jsonb_build_object('ok', true, 'version', d.version + 1, 'items', out_items);
end
$fn$;

-- ยืนยันร่างเป็นออเดอร์จริง: ตรวจทุกบรรทัดก่อน (ไม่ผูกสินค้า = ต้องให้พนักงานรับรอง และต้องมีราคา) แล้วสร้าง orders + order_items
-- ราคาคิดจากสินค้าในฐานข้อมูลตอนยืนยัน (หรือราคาที่พนักงานพิมพ์เอง) · ไม่ตัดสต็อก · ไม่ส่งอะไรให้ลูกค้า
create or replace function public.chat_draft_confirm(p_draft uuid, p_version integer, p_actor text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  d public.chat_drafts%rowtype;
  it jsonb;
  priced jsonb := '[]'::jsonb;
  v_pid uuid;
  v_qty numeric;
  v_name text;
  v_unit text;
  v_price numeric;
  v_live numeric;
  v_pname text;
  v_line numeric;
  v_removed boolean;
  v_total numeric := 0;
  v_lines integer := 0;
  v_bad integer := 0;
  v_unres integer := 0;
  v_missing integer := 0;
  v_oid uuid;
  v_ono text;
begin
  if auth.uid() is null then raise exception 'auth'; end if;
  select * into d from public.chat_drafts where id = p_draft for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if d.status <> 'open' then
    return jsonb_build_object('ok', false, 'error', 'not_open', 'status', d.status, 'order_no', d.order_no);
  end if;
  if d.version <> p_version then return jsonb_build_object('ok', false, 'error', 'conflict', 'version', d.version); end if;
  if btrim(coalesce(d.customer_name, '')) = '' then return jsonb_build_object('ok', false, 'error', 'need_name'); end if;

  -- ตรวจทุกบรรทัดก่อนเขียนอะไรทั้งนั้น
  for it in select value from jsonb_array_elements(d.items) loop
    v_removed := coalesce(lower(it->>'removed') = 'true', false);
    if v_removed then continue; end if;
    v_lines := v_lines + 1;
    begin v_qty := (it->>'qty')::numeric; exception when others then v_qty := null; end;
    if v_qty is null or v_qty <= 0 or v_qty > 100000 then v_bad := v_bad + 1; continue; end if;
    begin v_pid := nullif(it->>'product_id', '')::uuid; exception when others then v_pid := null; end;
    begin v_price := nullif(it->>'price', '')::numeric; exception when others then v_price := null; end;
    v_name := left(btrim(coalesce(it->>'name', '')), 200);
    v_unit := left(btrim(coalesce(it->>'unit', '')), 30);
    if v_pid is not null then
      select p.name, p.price into v_pname, v_live from public.products p where p.id = v_pid;
      if not found then v_unres := v_unres + 1; continue; end if;
      v_price := coalesce(v_price, v_live);
      v_name := v_pname;
    elsif not coalesce(lower(it->>'staff_ok') = 'true', false) then
      v_unres := v_unres + 1;
    end if;
    if v_price is null or v_price < 0 then v_missing := v_missing + 1; continue; end if;
    v_line := round(v_price * v_qty, 2);
    v_total := v_total + v_line;
    priced := priced || jsonb_build_array(jsonb_build_object(
      'product_id', v_pid,
      'name', v_name || case when v_unit <> '' then ' · ' || v_unit else '' end,
      'qty', v_qty,
      'unit_price', v_price,
      'line_total', v_line));
  end loop;

  if v_lines = 0 then return jsonb_build_object('ok', false, 'error', 'empty'); end if;
  if v_bad > 0 then return jsonb_build_object('ok', false, 'error', 'bad_qty', 'count', v_bad); end if;
  if v_unres > 0 then return jsonb_build_object('ok', false, 'error', 'unresolved', 'count', v_unres); end if;
  if v_missing > 0 then return jsonb_build_object('ok', false, 'error', 'missing_price', 'count', v_missing); end if;

  -- เขียนจริง: ออเดอร์ (NT-xxxx เลขเดียวกับหน้าเว็บ) + รายการ
  v_ono := 'NT-' || lpad(nextval('public.order_no_seq')::text, 4, '0');
  insert into public.orders (order_no, school_id, orderer_name, phone, org, project, note, channel, status,
                             subtotal, total, line_user_id, line_name, school_name)
  values (v_ono, null, d.customer_name, d.phone, left(d.school_name, 200), null, left(d.note, 500), 'line_chat', 'pending',
          v_total, v_total,
          case when d.channel_key = 'main' then d.line_user_id end,
          d.line_name, left(d.school_name, 200))
  returning id into v_oid;

  insert into public.order_items (order_id, product_id, name, qty, unit_price, line_total, sort)
  select v_oid, nullif(x->>'product_id', '')::uuid, x->>'name', (x->>'qty')::numeric,
         (x->>'unit_price')::numeric, (x->>'line_total')::numeric, ord - 1
    from jsonb_array_elements(priced) with ordinality as t(x, ord);

  update public.chat_drafts set
    status = 'confirmed',
    order_id = v_oid,
    order_no = v_ono,
    confirmed_at = now(),
    confirmed_by = coalesce(nullif(p_actor, ''), 'staff'),
    version = d.version + 1,
    updated_at = now()
  where id = d.id;

  insert into public.chat_draft_events (draft_id, actor, action, detail)
  values (d.id, coalesce(nullif(p_actor, ''), 'staff'), 'confirmed',
          jsonb_build_object('order_no', v_ono, 'total', v_total, 'lines', v_lines));

  return jsonb_build_object('ok', true, 'order_id', v_oid, 'order_no', v_ono, 'total', v_total, 'lines', v_lines);
end
$fn$;

-- ยกเลิกร่างที่ยังไม่ยืนยัน (ออเดอร์ที่ยืนยันแล้วยกเลิกที่หน้าคำสั่งซื้อเดิม)
create or replace function public.chat_draft_cancel(p_draft uuid, p_version integer, p_actor text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  d public.chat_drafts%rowtype;
begin
  if auth.uid() is null then raise exception 'auth'; end if;
  select * into d from public.chat_drafts where id = p_draft for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if d.status <> 'open' then return jsonb_build_object('ok', false, 'error', 'not_open', 'status', d.status); end if;
  if d.version <> p_version then return jsonb_build_object('ok', false, 'error', 'conflict', 'version', d.version); end if;
  update public.chat_drafts set
    status = 'cancelled', cancelled_at = now(), cancel_reason = left(coalesce(p_reason, ''), 200),
    version = d.version + 1, updated_at = now()
  where id = d.id;
  insert into public.chat_draft_events (draft_id, actor, action, detail)
  values (d.id, coalesce(nullif(p_actor, ''), 'staff'), 'cancelled', jsonb_build_object('reason', left(coalesce(p_reason, ''), 200)));
  return jsonb_build_object('ok', true, 'version', d.version + 1);
end
$fn$;

-- ขายผ่าน POS เดิม (pos_checkout) จากออเดอร์ที่ยืนยันแล้ว · ตัดสต็อกครั้งเดียวตรงนี้ · ร่างเดียวขายได้ครั้งเดียว (ล็อกด้วย FOR UPDATE)
create or replace function public.chat_draft_pos(p_draft uuid, p_store uuid, p_method text, p_actor text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  d public.chat_drafts%rowtype;
  v_items jsonb;
  v_sale jsonb;
begin
  if auth.uid() is null then raise exception 'auth'; end if;
  select * into d from public.chat_drafts where id = p_draft for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if d.status <> 'confirmed' then return jsonb_build_object('ok', false, 'error', 'not_confirmed', 'status', d.status); end if;
  if d.pos_sale_id is not null then
    return jsonb_build_object('ok', false, 'error', 'already_sold', 'sale_no', d.pos_sale_no);
  end if;
  if not exists (select 1 from public.stores where id = p_store) then
    return jsonb_build_object('ok', false, 'error', 'no_store');
  end if;
  if exists (select 1 from public.order_items where order_id = d.order_id and product_id is null) then
    return jsonb_build_object('ok', false, 'error', 'unlinked');
  end if;

  select jsonb_agg(jsonb_build_object('product_id', oi.product_id, 'name', oi.name, 'qty', oi.qty,
                                      'price', oi.unit_price, 'discount', 0, 'is_gift', false) order by oi.sort)
    into v_items
    from public.order_items oi where oi.order_id = d.order_id;
  if v_items is null then return jsonb_build_object('ok', false, 'error', 'empty'); end if;

  v_sale := public.pos_checkout(jsonb_build_object(
    'store_id', p_store,
    'payment_method', coalesce(nullif(p_method, ''), 'เงินสด'),
    'items', v_items,
    'note', 'ออเดอร์ ' || d.order_no || ' · ' || d.draft_no,
    'meta', jsonb_build_object('source', 'line_chat', 'chat_draft_no', d.draft_no,
                               'order_no', d.order_no, 'order_id', d.order_id)));

  update public.chat_drafts set pos_sale_id = (v_sale->>'id')::uuid, pos_sale_no = v_sale->>'sale_no', updated_at = now()
   where id = d.id;
  insert into public.chat_draft_events (draft_id, actor, action, detail)
  values (d.id, coalesce(nullif(p_actor, ''), 'staff'), 'pos_sold',
          jsonb_build_object('sale_no', v_sale->>'sale_no', 'total', v_sale->>'total'));

  return jsonb_build_object('ok', true, 'sale_no', v_sale->>'sale_no', 'sale_id', v_sale->>'id', 'total', v_sale->>'total');
end
$fn$;

-- 8) ใครเรียกฟังก์ชันไหนได้ ----------------------------------------------------------------------------------------
revoke all on function public.chat_next_draft_no() from public, anon, authenticated;
grant execute on function public.chat_next_draft_no() to service_role;

revoke all on function public.chat_draft_save(uuid, integer, jsonb, text, text, text, date, text, text) from public, anon;
grant execute on function public.chat_draft_save(uuid, integer, jsonb, text, text, text, date, text, text) to authenticated, service_role;

revoke all on function public.chat_draft_confirm(uuid, integer, text) from public, anon;
grant execute on function public.chat_draft_confirm(uuid, integer, text) to authenticated, service_role;

revoke all on function public.chat_draft_cancel(uuid, integer, text, text) from public, anon;
grant execute on function public.chat_draft_cancel(uuid, integer, text, text) to authenticated, service_role;

revoke all on function public.chat_draft_pos(uuid, uuid, text, text) from public, anon;
grant execute on function public.chat_draft_pos(uuid, uuid, text, text) to authenticated, service_role;
