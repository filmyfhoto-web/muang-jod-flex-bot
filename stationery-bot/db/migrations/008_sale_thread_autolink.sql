-- หน้า "แชตและออเดอร์" · รุ่น 13: ผูกแชตจาก LINE กับบัญชีลูกค้าทันทีที่เห็นแชตนั้น ไม่ต้องรอบันทึกใบสั่งงานใบแรกก่อน
-- (เจ้าของขอ 8 พ.ย. 2569: "อยากให้ผูกค่ะ" ตอบคำถาม "ถ้าเพิ่มเพื่อนแล้วมันผูกให้เลยไม่ใช่เหรอคะ")
--
-- เพิ่มอย่างเดียว · ไม่ลบและไม่เปลี่ยนข้อมูลเดิม:
--   · sale_thread_autolink_customer(p_thread_id)   ถ้าแชตนั้นมาจาก LINE (มีแถวใน sale_line_links) และยังไม่ผูกกับลูกค้า (customer_id is null)
--     จะสร้างบัญชีลูกค้าใหม่โดย "ใช้ชื่อเล่นใน LINE เป็นชื่อลูกค้าเลย" (เจ้าของสั่งตรง ๆ: "ตั้งชื่อไลน์ลูกค้าเลยค่ะ" — ไม่ได้ทำกลไก
--     อัปเกรดชื่อให้เป็นชื่อจริงทีหลังเมื่อมีออเดอร์จริงเข้ามา เพราะหน้าเรียก sale_customer_upsert (migration 004) เฉพาะตอนที่ใบสั่งงาน
--     ยังไม่มี customer_id (saleorders.module.js บรรทัดราว 1184: if(!o.customer_id&&...)) — แชตที่ผูกทางนี้ไปแล้ว จะมีใบสั่งงาน
--     ให้เลือก customer_id เดิมเสมอ จึงไม่เรียก sale_customer_upsert ซ้ำ และ customers.name จะค้างเป็นชื่อเล่น LINE ต่อไป
--     แม้พนักงานจะพิมพ์ชื่อจริงไว้ในใบสั่งงานเองแล้วก็ตาม — เป็นไปตามที่เจ้าของสั่ง ไม่ใช่บั๊ก
--   · กันบัญชีซ้ำตอนพนักงานหลายคน/หลายแท็บเห็นแชตใหม่พร้อมกัน ด้วยการล็อกแถว sale_threads ของแชตนั้นเอง (select ... for update)
--     ไม่ใช่ advisory lock แยกต่างหาก — ผูกการล็อกไว้กับทรัพยากรที่ป้องกันจริง ๆ ตรง ๆ: คนที่มาทีหลังจะรอ แล้วเห็นว่า customer_id
--     ถูกตั้งไปแล้วจากคนแรก จึงไม่ทำอะไรต่อ (ไม่ใช่สร้างบัญชีซ้ำ)
--   · ถ้าแชตนั้นไม่ใช่จาก LINE (ไม่มีแถวใน sale_line_links) หรือยังไม่มีชื่อเล่น LINE ให้ใช้ ฟังก์ชันคืนค่า null ไม่ทำอะไร
--   · สิทธิ์: เฉพาะ authenticated (พนักงานที่ล็อกอิน) เรียกได้ เหมือน sale_customer_upsert เดิม
-- ใช้กับโปรเจกต์ Supabase ของร้าน (mamlmgixovlwnjstetkj) หลังเจ้าของอนุมัติเท่านั้น · ย้อนกลับ: 008_sale_thread_autolink.reverse.sql
-- ต้องมี 002 (sale_threads, customers) และ 003 (sale_line_links) ก่อน · ทดสอบบน PostgreSQL จริง (PGlite): db/test/sale-thread-autolink.test.js
-- ใช้ซ้ำได้ (idempotent — create or replace function)

create or replace function public.sale_thread_autolink_customer(p_thread_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_customer_id uuid;
  v_line_name text;
begin
  -- ล็อกแถวแชตนี้ไว้ก่อน: คนที่เรียกฟังก์ชันนี้พร้อมกันสำหรับแชตเดียวกัน คนที่สองจะรอตรงนี้
  select customer_id into v_customer_id from public.sale_threads where id = p_thread_id for update;
  if v_customer_id is not null then
    return v_customer_id; -- ผูกไปแล้ว (จากคนที่เรียกพร้อมกันไปก่อน หรือจากออเดอร์ที่บันทึกไปแล้ว)
  end if;
  select line_name into v_line_name
    from public.sale_line_links
   where thread_id = p_thread_id and line_name is not null and line_name <> ''
   limit 1;
  if v_line_name is null then
    return null; -- ไม่ใช่แชตจาก LINE หรือยังไม่มีชื่อเล่นให้ใช้ — ยังไม่มีอะไรให้ผูก
  end if;
  insert into public.customers (name, line_name, source)
  values (v_line_name, v_line_name, 'LINE OA (เพิ่มเพื่อน)')
  returning id into v_customer_id;
  update public.sale_threads set customer_id = v_customer_id, updated_at = now() where id = p_thread_id;
  return v_customer_id;
end
$fn$;

revoke all on function public.sale_thread_autolink_customer(uuid) from public, anon;
grant execute on function public.sale_thread_autolink_customer(uuid) to authenticated, service_role;
