-- ย้อนกลับ 007_sale_thread_assignee.sql: เอาคอลัมน์ผู้รับผิดชอบ (assignee) ของ sale_threads ออก
-- ก่อนถอด: ติดตั้งหน้ารุ่นก่อนหน้า (downgrade.sql) ก่อน ไม่งั้นหน้าจะเรียกคอลัมน์ที่ถูกลบ

alter table public.sale_threads drop column if exists assignee;
