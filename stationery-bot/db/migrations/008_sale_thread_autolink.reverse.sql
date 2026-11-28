-- ย้อนกลับ 008_sale_thread_autolink.sql: เอาฟังก์ชัน sale_thread_autolink_customer ออก
-- ก่อนถอด: ติดตั้งหน้ารุ่นก่อนหน้า (downgrade.sql) ก่อน ไม่งั้นหน้าจะเรียกฟังก์ชันที่ถูกลบ
-- ไม่แตะ customers หรือ sale_threads.customer_id ที่ผูกไปแล้ว — ฟังก์ชันหายไป แต่บัญชีลูกค้าที่สร้างไว้แล้วยังอยู่ครบ

drop function if exists public.sale_thread_autolink_customer(uuid);
