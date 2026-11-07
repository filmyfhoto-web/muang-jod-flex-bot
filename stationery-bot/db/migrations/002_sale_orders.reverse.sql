-- ย้อนกลับ 002_sale_orders.sql · ใช้ได้เฉพาะก่อนมีข้อมูลจริงในตาราง sale_order* (ลบใบสั่งงานและประวัติทั้งหมดที่สร้างจากหน้านี้)
-- ไม่แตะตาราง ฟังก์ชัน หรือข้อมูลเดิมของร้าน (sale_threads / sale_msgs / orders / doc_orders / project_docs / bucket sale-files อยู่ครบ)
-- ไฟล์ใน bucket sale-order-files ไม่ถูกลบ และตัว bucket ก็ไม่ถูกลบ (Supabase ไม่ให้ลบแถวใน storage.* ด้วย SQL — ถ้าต้องการ
-- ให้เข้า Dashboard → Storage → sale-order-files → ลบไฟล์แล้วลบ bucket เอง) · ที่ย้อนกลับให้คือนโยบายอ่าน/อัปโหลดของ bucket นี้

drop function if exists public.sale_order_log_send(uuid, text, boolean, text, text);
drop function if exists public.sale_order_school_prices(uuid, jsonb);
drop function if exists public.sale_order_save(jsonb);

drop table if exists public.sale_order_events;
drop table if exists public.sale_order_items;
drop table if exists public.sale_orders;

drop function if exists public.sale_order_next_no();
drop table if exists public.sale_order_years;

drop policy if exists "staff read sale-order-files" on storage.objects;
drop policy if exists "staff upload sale-order-files" on storage.objects;
