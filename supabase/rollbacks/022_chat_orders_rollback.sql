-- ============================================================
-- ย้อนกลับ 022_chat_orders.sql (ถอนหน้า "แชตและออเดอร์")
-- ============================================================
--
-- ⚠️ ไม่ได้รันอัตโนมัติ และ "ทำลายข้อมูล" ต้องรันด้วยมือใน Supabase SQL Editor เท่านั้น
--   - ตาราง chat_messages จะหายพร้อมบันทึกแชตทั้งหมด
--   - คอลัมน์ customer_phone / fulfillment / handler_name / client_ref ของงานจะหาย
--   - ไฟล์รูปในแชตที่ bucket job-evidence (โฟลเดอร์ <user>/chat/) ไม่ถูกลบ ต้องลบเองถ้าต้องการ
--
-- ก่อนรัน: export ตาราง chat_messages และคอลัมน์ข้างบนเก็บไว้ก่อน
-- หลังรัน: โค้ดยังทำงานได้ — หน้าแชตจะแจ้งว่ายังไม่ได้รัน migration และเส้นทางงานเดิมไม่เสีย

drop index if exists public.jobs_user_client_ref_idx;

alter table public.jobs drop column if exists client_ref;
alter table public.jobs drop column if exists handler_name;
alter table public.jobs drop column if exists fulfillment;
alter table public.jobs drop column if exists customer_phone;

drop table if exists public.chat_messages;

notify pgrst, 'reload schema';
