-- หน้า "แชตและออเดอร์" · รุ่น 10: ป้ายสีจัดหมวดแชต (ตามภาพอ้างอิงของเจ้าของ 7 พ.ย. 2569 — Pancake)
--
-- เพิ่มอย่างเดียว · ไม่ลบและไม่เปลี่ยนข้อมูลเดิม:
--   · sale_threads.tag  ป้ายของแชตนี้ (null = ไม่มีป้าย) จำกัดให้เป็นหนึ่งใน 4 ค่า: inquiry (สอบถาม) · problem (ปัญหา) · urgent (ด่วน) · later (ตอบกลับภายหลัง)
--     ติดป้ายได้คนเดียว ไม่ใช่หลายป้ายพร้อมกัน (ตรงไปตรงมา เหมือนขั้นสนทนา/สถานะงานที่มีอยู่แล้ว) · แชตเดิมทุกแชตไม่มีป้าย (null) จนกว่าพนักงานจะติดเอง
--   · สิทธิ์ใช้นโยบาย staff_all ของ sale_threads ที่มีอยู่แล้ว (พนักงานที่ล็อกอินแก้ได้ ไม่ต้องเพิ่มสิทธิ์ใหม่)
-- ใช้กับโปรเจกต์ Supabase ของร้าน (mamlmgixovlwnjstetkj) หลังเจ้าของอนุมัติเท่านั้น · ย้อนกลับ: 006_sale_thread_tags.reverse.sql
-- ต้องมี 002 ก่อน (ตาราง sale_threads) · ทดสอบบน PostgreSQL จริง (PGlite): db/test/sale-thread-tags.test.js
-- ใช้ซ้ำได้ (idempotent)

alter table public.sale_threads add column if not exists tag text;

do $do$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sale_threads'::regclass and conname = 'sale_threads_tag_check'
  ) then
    alter table public.sale_threads
      add constraint sale_threads_tag_check check (tag is null or tag in ('inquiry', 'problem', 'urgent', 'later'));
  end if;
end
$do$;
