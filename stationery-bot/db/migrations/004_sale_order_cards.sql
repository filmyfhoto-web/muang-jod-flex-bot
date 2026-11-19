-- หน้า "แชตและออเดอร์" · รุ่น 4: บัญชีลูกค้าจากใบสั่งงาน + การ์ดคำสั่งงาน (ส่งลูกค้า และทีมงาน)
--
-- เพิ่มอย่างเดียว · ไม่ลบและไม่เปลี่ยนข้อมูลเดิม:
--   · sale_orders.team_card_at  เวลาที่บอทส่งการ์ดให้ทีมงานแล้ว (null = ยังไม่ส่ง) · ใบที่มีอยู่แล้วถูกตั้งเป็นส่งแล้ว (ไม่ยิงย้อนหลัง)
--   · sale_customer_upsert()    เก็บชื่อกับเบอร์ลูกค้าลงตาราง customers (ตารางเดิมของร้าน) · เบอร์ที่มีอยู่แล้วผูกกับบัญชีเดิม ไม่สร้างซ้ำ
--                               แล้วผูกบัญชีนั้นกับแชตนี้ (sale_threads.customer_id) ถ้าแชตยังไม่มีบัญชี
--   · การ์ดส่งลูกค้าใช้ sale_line_send ที่มีอยู่แล้ว (มี p_order) — ไม่ต้องเปลี่ยนฟังก์ชันเดิม
-- ใช้กับโปรเจกต์ Supabase ของร้าน (mamlmgixovlwnjstetkj) หลังเจ้าของอนุมัติเท่านั้น · ย้อนกลับ: 004_sale_order_cards.reverse.sql
-- ต้องมี 002 และ 003 ก่อน · ทดสอบบน PostgreSQL จริง (PGlite): db/test/sale-order-cards.test.js
-- ใช้ซ้ำได้ (idempotent)

alter table public.sale_orders add column if not exists team_card_at timestamptz;

-- ใบที่มีอยู่แล้วถือว่าส่งการ์ดทีมงานแล้ว: บอทจะส่งเฉพาะใบที่สร้างหลังติดตั้งนี้
update public.sale_orders set team_card_at = coalesce(created_at, now()) where team_card_at is null;

create index if not exists sale_orders_team_card_pending on public.sale_orders (created_at) where team_card_at is null;

create or replace function public.sale_customer_upsert(p_thread uuid, p_name text, p_phone text, p_source text)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_name text := left(btrim(coalesce(p_name, '')), 200);
  v_phone text := left(btrim(coalesce(p_phone, '')), 40);
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_id uuid;
begin
  if v_name = '' and v_phone = '' then
    return null;
  end if;
  -- เบอร์เดิมผูกกับบัญชีเดิม (เทียบเฉพาะตัวเลข เพราะบันทึกมาไม่เหมือนกัน เช่น 053-000000 กับ 053000000)
  if length(v_digits) >= 6 then
    select c.id into v_id
      from public.customers c
     where regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = v_digits
     order by c.created_at nulls last
     limit 1;
  end if;
  if v_id is null then
    insert into public.customers (name, phone, source)
    values (coalesce(nullif(v_name, ''), v_phone), nullif(v_phone, ''), coalesce(nullif(btrim(coalesce(p_source, '')), ''), 'หน้าร้าน/โทร'))
    returning id into v_id;
  end if;
  if p_thread is not null then
    update public.sale_threads set customer_id = v_id where id = p_thread and customer_id is null;
  end if;
  return v_id;
end
$fn$;

revoke all on function public.sale_customer_upsert(uuid, text, text, text) from public, anon;
grant execute on function public.sale_customer_upsert(uuid, text, text, text) to authenticated, service_role;
