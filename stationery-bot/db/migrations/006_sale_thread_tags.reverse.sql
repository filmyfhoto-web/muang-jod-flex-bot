-- ย้อนกลับ 006_sale_thread_tags.sql: เอาคอลัมน์ป้าย (tag) ของ sale_threads ออก
-- ก่อนถอด: ติดตั้งหน้ารุ่นก่อนหน้า (downgrade.sql) ก่อน ไม่งั้นหน้าจะเรียกคอลัมน์ที่ถูกลบ

alter table public.sale_threads drop constraint if exists sale_threads_tag_check;
alter table public.sale_threads drop column if exists tag;
