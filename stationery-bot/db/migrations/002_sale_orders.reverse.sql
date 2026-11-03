-- ย้อนกลับ 002_sale_orders.sql · ใช้ได้เฉพาะก่อนมีข้อมูลจริงในตาราง sale_order* (ลบใบสั่งงานและประวัติทั้งหมดที่สร้างจากหน้านี้)
-- ไม่แตะตาราง ฟังก์ชัน หรือข้อมูลเดิมของร้าน (sale_threads / sale_msgs / orders / doc_orders / project_docs อยู่ครบ)
-- ไฟล์ที่อัปโหลดไว้ใน bucket sale-files ใต้ sale-orders/ ไม่ถูกลบ (ลบเองใน Storage ถ้าต้องการ)

drop function if exists public.sale_order_log_send(uuid, text, boolean, text, text);
drop function if exists public.sale_order_school_prices(uuid, jsonb);
drop function if exists public.sale_order_save(jsonb);

drop table if exists public.sale_order_events;
drop table if exists public.sale_order_items;
drop table if exists public.sale_orders;

drop function if exists public.sale_order_next_no();
drop table if exists public.sale_order_years;

-- คืนเพดานไฟล์ของ bucket sale-files เป็นค่าเดิม (ไม่จำกัด) เฉพาะเมื่อยังเป็นค่าที่ 002 ตั้งไว้
update storage.buckets
   set file_size_limit = null, allowed_mime_types = null
 where id = 'sale-files' and file_size_limit = 5242880
   and allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'];
