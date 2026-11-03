-- หน้า "แชตและออเดอร์" · ชั้นฐานข้อมูล: ใบสั่งงาน/คำสั่งซื้อที่เปิดจากแชท (sale_threads)
--
-- เพิ่มอย่างเดียว: ตารางใหม่ 4 ตาราง ฟังก์ชันใหม่ 4 ตัว · ไม่แก้ตาราง ฟังก์ชัน หรือข้อมูลเดิมแม้แต่แถวเดียว
--   (ข้อ 5 ตั้งขนาด/ชนิดไฟล์ของ bucket sale-files ที่มีอยู่แล้ว — มีผลกับไฟล์ที่อัปโหลดใหม่เท่านั้น)
-- ใช้กับโปรเจกต์ Supabase ของร้าน (mamlmgixovlwnjstetkj) หลังเจ้าของอนุมัติเท่านั้น · ย้อนกลับ: 002_sale_orders.reverse.sql
-- ทดสอบบน PostgreSQL จริง (PGlite): db/test/sale-orders.test.js
--
-- หลักที่ยึด (คำสั่งเจ้าของ 3 พ.ย. 2569):
--   · ใบสั่งงานจากแชทเป็นระบบของตัวเอง ไม่ยุ่งกับ "คำสั่งซื้อเพื่อจัดสินค้า" (orders) และ "คำสั่งซื้อเพื่อจัดทำเอกสาร"
--     (doc_orders / project_docs): ไม่สร้าง ไม่แก้ ไม่ผูกแถวในระบบเหล่านั้น · ไม่ตัดสต็อก · ไม่ออกเอกสาร
--   · ใบหนึ่งเป็นประเภทเดียว (จัดสินค้า หรือ จัดทำเอกสาร) เปลี่ยนประเภทหลังบันทึกไม่ได้ จึงรวมข้ามประเภทไม่ได้
--   · ยอดเงินและการปัดเศษคิดใหม่ฝั่งเซิร์ฟเวอร์ทุกครั้ง · VAT ใช้ stores.vat_rate จริงเท่านั้น (คิดแยกนอกแบบเอกสารเดิมของร้าน)
--   · ราคาโรงเรียนใช้สูตรเดิมของร้าน (_school_item_price แบบเดียวกับ _write_order) · ราคาที่บันทึกคือราคา ณ เวลาสั่ง
--   · สถานะงานกับสถานะชำระเงินแยกกัน · แนบสลิปอย่างเดียวไม่เปลี่ยนสถานะชำระ (เปลี่ยนเฉพาะที่พนักงานเลือกเอง)
--   · กันบันทึกซ้ำ (client_token) · กันเขียนทับกันระหว่างพนักงาน (version) · ปิดงานที่ยังไม่ส่งมอบ/ค้างชำระต้องยืนยัน (force)
--   · สิทธิ์: เฉพาะพนักงานที่ล็อกอิน (role authenticated + RLS แบบเดียวกับตารางอื่นของหลังร้าน) · anon ไม่ได้อะไรเลย

-- 1) เลขที่ใบสั่งงาน ORD-<ปี พ.ศ.>-NNNNN นับแยกปี ----------------------------------------------------------------
create table if not exists public.sale_order_years (
  yr integer primary key,
  n integer not null default 0
);
alter table public.sale_order_years enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sale_order_years' and policyname = 'staff_all') then
    create policy staff_all on public.sale_order_years for all to authenticated using (true) with check (true);
  end if;
end $$;
revoke all on public.sale_order_years from anon;
grant all on public.sale_order_years to authenticated, service_role;

create or replace function public.sale_order_next_no()
returns text
language plpgsql
set search_path = public
as $$
declare v_yr integer; v_n integer;
begin
  v_yr := extract(year from (now() at time zone 'Asia/Bangkok'))::integer + 543;
  insert into public.sale_order_years as y (yr, n) values (v_yr, 1)
  on conflict (yr) do update set n = y.n + 1
  returning n into v_n;
  return 'ORD-' || v_yr || '-' || lpad(v_n::text, 5, '0');
end $$;
revoke all on function public.sale_order_next_no() from public, anon;
grant execute on function public.sale_order_next_no() to authenticated, service_role;

-- 2) ใบสั่งงาน / คำสั่งซื้อจากแชท -------------------------------------------------------------------------------
create table if not exists public.sale_orders (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.sale_threads(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete set null,
  order_no text not null unique,
  order_type text not null default 'goods' check (order_type in ('goods', 'docs')),
  customer_name text not null,
  phone text,
  order_date date not null default (now() at time zone 'Asia/Bangkok')::date,
  note text,
  fulfil text not null default 'pickup' check (fulfil in ('pickup', 'delivery')),
  need_date date,
  assignee text,
  price_school_id uuid references public.schools(id) on delete set null,
  vat_store_id uuid references public.stores(id) on delete set null,
  vat_rate numeric(5,2) not null default 0 check (vat_rate >= 0 and vat_rate <= 20),
  subtotal numeric(12,2) not null default 0,
  vat_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  job_status text not null default 'pending'
    check (job_status in ('pending', 'awaiting', 'working', 'ready', 'delivered', 'closed', 'canceled')),
  pay_status text not null default 'unpaid'
    check (pay_status in ('unpaid', 'deposit', 'partial', 'paid')),
  paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0),
  attach jsonb not null default '[]'::jsonb,
  client_token text unique,
  version integer not null default 1,
  created_by text,
  updated_by text,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sale_orders_thread_idx on public.sale_orders (thread_id, updated_at desc);
create index if not exists sale_orders_status_idx on public.sale_orders (job_status, updated_at desc);

create table if not exists public.sale_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.sale_orders(id) on delete cascade,
  seq integer not null,
  product_id uuid references public.products(id) on delete set null,
  kind text not null default 'goods' check (kind in ('goods', 'service')),
  name text not null,
  qty numeric(12,2) not null check (qty > 0),
  unit text,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null
);
create index if not exists sale_order_items_order_idx on public.sale_order_items (order_id, seq);

-- ประวัติทุกเหตุการณ์ของใบ (สร้าง/บันทึก/ส่งสรุป) — ไว้ตรวจย้อนหลัง หน้าจอไม่ลบไม่แก้
create table if not exists public.sale_order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.sale_orders(id) on delete cascade,
  kind text not null check (kind in ('create', 'save', 'send')),
  detail jsonb not null default '{}'::jsonb,
  by_name text,
  created_at timestamptz not null default now()
);
create index if not exists sale_order_events_order_idx on public.sale_order_events (order_id, created_at);
create index if not exists sale_order_events_token_idx on public.sale_order_events ((detail ->> 'token'));

alter table public.sale_orders enable row level security;
alter table public.sale_order_items enable row level security;
alter table public.sale_order_events enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sale_orders' and policyname = 'staff_all') then
    create policy staff_all on public.sale_orders for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sale_order_items' and policyname = 'staff_all') then
    create policy staff_all on public.sale_order_items for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sale_order_events' and policyname = 'staff_all') then
    create policy staff_all on public.sale_order_events for all to authenticated using (true) with check (true);
  end if;
end $$;
revoke all on public.sale_orders, public.sale_order_items, public.sale_order_events from anon;
grant all on public.sale_orders, public.sale_order_items, public.sale_order_events to authenticated, service_role;

-- 3) บันทึกใบสั่งงาน: ตรวจทุกอย่างและคิดเงินใหม่ฝั่งเซิร์ฟเวอร์ ----------------------------------------------------
-- p ต้องมี: thread_id, client_token, customer_name, items (1–200 รายการ), by_name
-- แก้ใบเดิม: ส่ง id + version ที่ถืออยู่ (ไม่ตรง = มีคนแก้ก่อนหน้า → error ให้โหลดใหม่) · order_type เปลี่ยนไม่ได้
-- เงิน: รับเฉพาะ qty/unit_price ต่อรายการ ยอดทุกชั้นคิดในนี้ · VAT: vat_on=true ต้องส่ง vat_store_id ของสโตร์ที่มีอัตรา VAT
-- สถานะ: paid → paid_amount = total · unpaid → 0 · deposit/partial → ต้อง 0 < paid < total
-- ปิดงาน (closed) ต้องส่งมอบแล้วและชำระครบ ไม่งั้นต้อง force=true (หน้าจอให้พนักงานยืนยันก่อน) · ยกเลิกครั้งแรกต้องมี reason
-- client_token ที่เคยใช้สำเร็จแล้ว (ทั้งตอนสร้างและตอนแก้) → คืนสภาพปัจจุบันของใบนั้นโดยไม่เขียนอะไรเพิ่ม (duplicate = true)
create or replace function public.sale_order_save(p jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_old public.sale_orders;
  v_dup uuid;
  v_id uuid;
  v_no text;
  v_token text;
  v_thread uuid;
  v_type text;
  v_name text;
  v_by text;
  v_vat_on boolean;
  v_store public.stores;
  v_rate numeric(5,2) := 0;
  v_store_id uuid := null;
  v_school uuid := null;
  v_sub numeric(12,2) := 0;
  v_vat numeric(12,2) := 0;
  v_total numeric(12,2);
  v_job text;
  v_pay text;
  v_paid numeric(12,2);
  v_force boolean;
  v_reason text;
  v_attach jsonb;
  v_items jsonb;
  it jsonb;
  f jsonb;
  v_n integer := 0;
  v_qty numeric;
  v_price numeric;
  v_rows jsonb;
  v_order jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'saleorders: payload ว่าง'; end if;

  v_token := btrim(coalesce(p->>'client_token', ''));
  if length(v_token) < 8 or length(v_token) > 100 then raise exception 'saleorders: client_token ไม่ถูกต้อง'; end if;
  select e.order_id into v_dup from public.sale_order_events e where e.detail->>'token' = v_token limit 1;
  if v_dup is not null then
    select to_jsonb(o) into v_order from public.sale_orders o where o.id = v_dup;
    select jsonb_agg(to_jsonb(i) order by i.seq) into v_rows from public.sale_order_items i where i.order_id = v_dup;
    return jsonb_build_object('duplicate', true, 'order', v_order, 'items', coalesce(v_rows, '[]'::jsonb));
  end if;

  v_thread := nullif(p->>'thread_id', '')::uuid;
  if v_thread is null or not exists (select 1 from public.sale_threads t where t.id = v_thread) then
    raise exception 'saleorders: ไม่พบแชทของใบนี้';
  end if;

  v_name := left(btrim(coalesce(p->>'customer_name', '')), 200);
  if v_name = '' then raise exception 'saleorders: ต้องมีชื่อลูกค้า'; end if;
  v_by := left(btrim(coalesce(p->>'by_name', '')), 100);
  if v_by = '' then raise exception 'saleorders: ต้องมีชื่อพนักงาน (by_name)'; end if;

  v_items := p->'items';
  if v_items is null or jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) < 1 then
    raise exception 'saleorders: ต้องมีรายการอย่างน้อย 1 รายการ';
  end if;
  if jsonb_array_length(v_items) > 200 then raise exception 'saleorders: รายการเกิน 200 แถว'; end if;

  -- VAT: ใช้อัตราจริงของสโตร์ที่เลือกเท่านั้น (ไม่รับอัตราจากหน้าจอ)
  v_vat_on := coalesce((p->>'vat_on')::boolean, false);
  if v_vat_on then
    select * into v_store from public.stores where id = nullif(p->>'vat_store_id', '')::uuid;
    if not found then raise exception 'saleorders: เลือกสโตร์สำหรับ VAT ไม่ถูกต้อง'; end if;
    if coalesce(v_store.vat_rate, 0) <= 0 then raise exception 'saleorders: สโตร์นี้ไม่ได้ตั้งอัตรา VAT ไว้'; end if;
    v_store_id := v_store.id;
    v_rate := v_store.vat_rate;
  end if;

  -- ราคาโรงเรียน: เก็บไว้ว่าใบนี้ใช้ราคาของโรงเรียนไหน (ราคาต่อหน่วยที่บันทึกคือราคา ณ เวลาสั่ง)
  v_school := nullif(p->>'price_school_id', '')::uuid;
  if v_school is not null and not exists (select 1 from public.schools s where s.id = v_school) then
    raise exception 'saleorders: ไม่พบโรงเรียนที่เลือกสำหรับราคา';
  end if;

  v_job := coalesce(nullif(p->>'job_status', ''), 'pending');
  v_pay := coalesce(nullif(p->>'pay_status', ''), 'unpaid');
  v_paid := round(coalesce(nullif(p->>'paid_amount', '')::numeric, 0), 2);
  v_force := coalesce((p->>'force')::boolean, false);
  v_reason := left(btrim(coalesce(p->>'reason', '')), 500);

  -- ไฟล์แนบ: เฉพาะไฟล์ใน bucket sale-files ใต้โฟลเดอร์ของแชทนี้ · ชนิด/ขนาดตามที่หน้าจออนุญาต
  v_attach := coalesce(p->'attach', '[]'::jsonb);
  if jsonb_typeof(v_attach) <> 'array' or jsonb_array_length(v_attach) > 30 then
    raise exception 'saleorders: ไฟล์แนบไม่ถูกต้อง (ไม่เกิน 30 ไฟล์)';
  end if;
  for f in select * from jsonb_array_elements(v_attach) loop
    if jsonb_typeof(f) <> 'object'
       or coalesce(f->>'path', '') !~ ('^sale-orders/' || v_thread::text || '/[^/]{1,120}$')
       or position('..' in coalesce(f->>'path', '')) > 0
       or length(coalesce(f->>'name', '')) > 200
       or coalesce(f->>'type', '') !~ '^(image/(png|jpeg|webp|gif)|application/pdf)$'
       or coalesce(nullif(f->>'size', '')::numeric, 0) > 5242880 then
      raise exception 'saleorders: ไฟล์แนบไม่ถูกต้อง (%)', left(coalesce(f->>'name', f->>'path', '?'), 80);
    end if;
  end loop;

  -- ใบเดิมหรือใบใหม่
  v_id := nullif(p->>'id', '')::uuid;
  if v_id is not null then
    select * into v_old from public.sale_orders where id = v_id for update;
    if not found then raise exception 'saleorders: ไม่พบใบที่จะแก้'; end if;
    -- คำขอเดียวกันที่ส่งซ้ำพร้อมกัน: อีกคำขอแก้ใบไปแล้วระหว่างที่รอแถวนี้ → คืนสภาพปัจจุบัน ไม่แก้ซ้ำ
    if exists (select 1 from public.sale_order_events e where e.order_id = v_id and e.detail->>'token' = v_token) then
      select jsonb_agg(to_jsonb(i) order by i.seq) into v_rows from public.sale_order_items i where i.order_id = v_id;
      return jsonb_build_object('duplicate', true, 'order', to_jsonb(v_old), 'items', coalesce(v_rows, '[]'::jsonb));
    end if;
    if v_old.thread_id <> v_thread then raise exception 'saleorders: ใบนี้อยู่กับแชทอื่น'; end if;
    if coalesce(nullif(p->>'version', '')::integer, -1) <> v_old.version then
      raise exception 'saleorders: ใบนี้ถูกแก้โดยคนอื่นแล้ว (version % ไม่ตรงกับ %) โหลดใหม่ก่อนบันทึก',
        coalesce(p->>'version', '-'), v_old.version;
    end if;
    if nullif(p->>'order_type', '') is not null and p->>'order_type' <> v_old.order_type then
      raise exception 'saleorders: เปลี่ยนประเภทใบหลังบันทึกไม่ได้ (เปิดใบใหม่แทน)';
    end if;
    v_type := v_old.order_type;
  else
    v_type := coalesce(nullif(p->>'order_type', ''), 'goods');
    if v_type not in ('goods', 'docs') then raise exception 'saleorders: ประเภทใบไม่ถูกต้อง'; end if;
  end if;

  -- คิดเงินใหม่ทั้งใบ: ปัดจำนวนและราคาเป็น 2 ตำแหน่ง → รวมต่อบรรทัด (ปัดเป็นสตางค์) → รวมทั้งใบ → VAT แยกนอก
  for it in select * from jsonb_array_elements(v_items) loop
    v_n := v_n + 1;
    if jsonb_typeof(it) <> 'object' or btrim(coalesce(it->>'name', '')) = '' then
      raise exception 'saleorders: รายการที่ % ไม่มีชื่อ', v_n;
    end if;
    v_qty := round(nullif(it->>'qty', '')::numeric, 2);
    v_price := round(nullif(it->>'unit_price', '')::numeric, 2);
    if v_qty is null or v_qty <= 0 or v_qty > 1000000 then raise exception 'saleorders: จำนวนของรายการที่ % ไม่ถูกต้อง', v_n; end if;
    if v_price is null or v_price < 0 or v_price > 10000000 then raise exception 'saleorders: ราคาของรายการที่ % ไม่ถูกต้อง', v_n; end if;
    if coalesce(nullif(it->>'kind', ''), 'goods') not in ('goods', 'service') then
      raise exception 'saleorders: ชนิดของรายการที่ % ไม่ถูกต้อง', v_n;
    end if;
    if nullif(it->>'product_id', '') is not null
       and not exists (select 1 from public.products pr where pr.id = (it->>'product_id')::uuid) then
      raise exception 'saleorders: รายการที่ % ผูกกับสินค้าที่ไม่มีในระบบ', v_n;
    end if;
    v_sub := v_sub + round(v_qty * v_price, 2);
  end loop;
  v_vat := round(v_sub * v_rate / 100, 2);
  v_total := v_sub + v_vat;

  -- สถานะชำระเงินต้องสอดคล้องกับยอด (สถานะมาจากที่พนักงานเลือกเท่านั้น ไฟล์แนบไม่มีผล)
  if v_job not in ('pending', 'awaiting', 'working', 'ready', 'delivered', 'closed', 'canceled') then
    raise exception 'saleorders: สถานะงานไม่ถูกต้อง';
  end if;
  if v_pay = 'paid' then v_paid := v_total;
  elsif v_pay = 'unpaid' then v_paid := 0;
  elsif v_pay in ('deposit', 'partial') then
    if v_paid <= 0 or v_paid >= v_total then
      raise exception 'saleorders: มัดจำ/ชำระบางส่วน ต้องมียอดมากกว่า 0 และน้อยกว่ายอดรวม (ชำระครบให้เลือก "ชำระครบ")';
    end if;
  else
    raise exception 'saleorders: สถานะการชำระเงินไม่ถูกต้อง';
  end if;

  -- กันปิดงานทั้งที่ยังไม่ส่งมอบหรือยังค้างชำระ: หน้าจอถามยืนยันก่อนแล้วส่ง force=true
  if v_job = 'closed' and coalesce(v_old.job_status, '') <> 'closed' and not v_force then
    if v_pay <> 'paid' then raise exception 'saleorders: ยังค้างชำระ ปิดงานต้องยืนยัน (force)'; end if;
    if coalesce(v_old.job_status, '') <> 'delivered' then raise exception 'saleorders: ยังไม่ได้ส่งมอบ ปิดงานต้องยืนยัน (force)'; end if;
  end if;
  if v_job = 'canceled' and coalesce(v_old.job_status, '') <> 'canceled' and v_reason = '' then
    raise exception 'saleorders: ยกเลิกใบต้องบอกเหตุผล';
  end if;

  if v_id is null then
    begin
      v_no := public.sale_order_next_no();
      insert into public.sale_orders (
        thread_id, customer_id, order_no, order_type, customer_name, phone, order_date, note,
        fulfil, need_date, assignee, price_school_id, vat_store_id, vat_rate, subtotal, vat_amount, total,
        job_status, pay_status, paid_amount, attach, client_token, version, created_by, updated_by, closed_at)
      values (
        v_thread, nullif(p->>'customer_id', '')::uuid, v_no, v_type, v_name, nullif(left(btrim(coalesce(p->>'phone', '')), 50), ''),
        coalesce(nullif(p->>'order_date', '')::date, (now() at time zone 'Asia/Bangkok')::date),
        nullif(left(coalesce(p->>'note', ''), 4000), ''),
        coalesce(nullif(p->>'fulfil', ''), 'pickup'), nullif(p->>'need_date', '')::date,
        nullif(left(btrim(coalesce(p->>'assignee', '')), 100), ''),
        v_school, v_store_id, v_rate, v_sub, v_vat, v_total,
        v_job, v_pay, v_paid, v_attach, v_token, 1, v_by, v_by,
        case when v_job in ('closed', 'canceled') then now() end)
      returning id into v_id;
    exception when unique_violation then
      -- คำขอเดียวกันที่ส่งซ้ำพร้อมกัน (token เดียวกัน) — อีกคำขอบันทึกไปแล้ว คืนใบนั้น
      select o.id into v_dup from public.sale_orders o where o.client_token = v_token;
      if v_dup is null then raise; end if;
      select to_jsonb(o) into v_order from public.sale_orders o where o.id = v_dup;
      select jsonb_agg(to_jsonb(i) order by i.seq) into v_rows from public.sale_order_items i where i.order_id = v_dup;
      return jsonb_build_object('duplicate', true, 'order', v_order, 'items', coalesce(v_rows, '[]'::jsonb));
    end;
    insert into public.sale_order_events (order_id, kind, detail, by_name)
    values (v_id, 'create', jsonb_build_object('token', v_token, 'order_no', v_no, 'type', v_type,
      'total', v_total, 'job', v_job, 'pay', v_pay, 'paid', v_paid), v_by);
  else
    update public.sale_orders set
      customer_id = nullif(p->>'customer_id', '')::uuid,
      customer_name = v_name,
      phone = nullif(left(btrim(coalesce(p->>'phone', '')), 50), ''),
      order_date = coalesce(nullif(p->>'order_date', '')::date, order_date),
      note = nullif(left(coalesce(p->>'note', ''), 4000), ''),
      fulfil = coalesce(nullif(p->>'fulfil', ''), 'pickup'),
      need_date = nullif(p->>'need_date', '')::date,
      assignee = nullif(left(btrim(coalesce(p->>'assignee', '')), 100), ''),
      price_school_id = v_school,
      vat_store_id = v_store_id, vat_rate = v_rate,
      subtotal = v_sub, vat_amount = v_vat, total = v_total,
      job_status = v_job, pay_status = v_pay, paid_amount = v_paid,
      attach = v_attach,
      version = version + 1, updated_by = v_by, updated_at = now(),
      closed_at = case when v_job in ('closed', 'canceled') then coalesce(closed_at, now()) else null end
    where id = v_id;
    insert into public.sale_order_events (order_id, kind, detail, by_name)
    values (v_id, 'save',
      jsonb_build_object('token', v_token, 'total', v_total, 'job', v_job, 'pay', v_pay, 'paid', v_paid, 'force', v_force)
        || case when v_reason <> '' then jsonb_build_object('reason', v_reason) else '{}'::jsonb end
        || case when v_old.job_status is distinct from v_job then jsonb_build_object('job_from', v_old.job_status) else '{}'::jsonb end
        || case when v_old.pay_status is distinct from v_pay then jsonb_build_object('pay_from', v_old.pay_status) else '{}'::jsonb end
        || case when v_old.total is distinct from v_total then jsonb_build_object('total_from', v_old.total) else '{}'::jsonb end,
      v_by);
  end if;

  -- เขียนรายการใหม่ทั้งชุด (ใบหนึ่งมีรายการไม่มาก เขียนทับทั้งชุดตรงไปตรงมาและตรวจง่าย) · ราคาที่เก็บคือราคา ณ เวลานี้
  delete from public.sale_order_items where order_id = v_id;
  v_n := 0;
  for it in select * from jsonb_array_elements(v_items) loop
    v_n := v_n + 1;
    v_qty := round((it->>'qty')::numeric, 2);
    v_price := round((it->>'unit_price')::numeric, 2);
    insert into public.sale_order_items (order_id, seq, product_id, kind, name, qty, unit, unit_price, line_total)
    values (v_id, v_n, nullif(it->>'product_id', '')::uuid, coalesce(nullif(it->>'kind', ''), 'goods'),
      left(btrim(it->>'name'), 300), v_qty, nullif(left(btrim(coalesce(it->>'unit', '')), 40), ''), v_price, round(v_qty * v_price, 2));
  end loop;

  select to_jsonb(o) into v_order from public.sale_orders o where o.id = v_id;
  select jsonb_agg(to_jsonb(i) order by i.seq) into v_rows from public.sale_order_items i where i.order_id = v_id;
  return jsonb_build_object('duplicate', false, 'order', v_order, 'items', coalesce(v_rows, '[]'::jsonb));
end $$;
revoke all on function public.sale_order_save(jsonb) from public, anon;
grant execute on function public.sale_order_save(jsonb) to authenticated, service_role;

-- 4) ราคาโรงเรียนของสินค้า (สูตรเดิมของร้าน — แบบเดียวกับ _write_order ของหน้าสั่งของโรงเรียน) --------------------------
-- p_ids = JSON array ของ id สินค้า · คืน [{id, base, price}] · base = ราคาปกติ · price = ราคาโรงเรียน · ไม่บันทึกอะไร
create or replace function public.sale_order_school_prices(p_school uuid, p_ids jsonb)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare s public.schools; v_ids uuid[]; r jsonb;
begin
  select * into s from public.schools where id = p_school and active;
  if not found then raise exception 'saleorders: ไม่พบโรงเรียนนี้ หรือโรงเรียนปิดใช้งาน'; end if;
  if p_ids is null or jsonb_typeof(p_ids) <> 'array' or jsonb_array_length(p_ids) = 0 then return '[]'::jsonb; end if;
  if jsonb_array_length(p_ids) > 200 then raise exception 'saleorders: ขอราคาได้ครั้งละไม่เกิน 200 รายการ'; end if;
  select array_agg(x::uuid) into v_ids from jsonb_array_elements_text(p_ids) x;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', pr.id,
           'base', pr.price,
           'price', public._school_item_price(pr.price, pr.tier_prices, s.markup_pct, s.round_to, s.price_special))), '[]'::jsonb)
    into r
    from public.products pr where pr.id = any(v_ids);
  return r;
end $$;
revoke all on function public.sale_order_school_prices(uuid, jsonb) from public, anon;
grant execute on function public.sale_order_school_prices(uuid, jsonb) to authenticated, service_role;

-- 5) บันทึกผลการส่งสรุปให้ลูกค้า ตามที่เกิดขึ้นจริงเท่านั้น -----------------------------------------------------------
-- channel: 'copy' = พนักงานคัดลอกข้อความไปส่งเอง · 'chat' = บันทึกลงแชทในระบบ (ยังไม่ถึงลูกค้า) · 'line' = ส่งผ่าน LINE (เผื่อเชื่อมภายหลัง)
create or replace function public.sale_order_log_send(p_order uuid, p_channel text, p_ok boolean, p_detail text, p_by text)
returns uuid
language plpgsql
set search_path = public
as $$
declare v_id uuid;
begin
  if p_channel is null or p_channel not in ('copy', 'chat', 'line') then raise exception 'saleorders: ช่องทางส่งไม่ถูกต้อง'; end if;
  if not exists (select 1 from public.sale_orders o where o.id = p_order) then
    raise exception 'saleorders: ไม่พบใบสั่งงาน';
  end if;
  insert into public.sale_order_events (order_id, kind, detail, by_name)
  values (p_order, 'send',
    jsonb_build_object('channel', p_channel, 'ok', coalesce(p_ok, false), 'detail', left(coalesce(p_detail, ''), 500)),
    nullif(left(btrim(coalesce(p_by, '')), 100), ''))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.sale_order_log_send(uuid, text, boolean, text, text) from public, anon;
grant execute on function public.sale_order_log_send(uuid, text, boolean, text, text) to authenticated, service_role;

-- 6) ไฟล์แนบของหน้านี้อยู่ใน bucket sale-files (มีอยู่แล้ว · ส่วนตัว · พนักงานอัป/อ่าน/ลบได้ตามนโยบายเดิม)
-- ตั้งเพดานฝั่งเซิร์ฟเวอร์: ไม่เกิน 5 MB และเฉพาะรูป/PDF — มีผลกับไฟล์ที่อัปโหลดใหม่เท่านั้น (ไฟล์เดิม 1 ไฟล์เป็น JPEG 95 KB)
-- ย้อนกลับใน reverse: คืนเป็นไม่จำกัด (ค่าเดิม null)
update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf']
 where id = 'sale-files' and file_size_limit is null and allowed_mime_types is null;
