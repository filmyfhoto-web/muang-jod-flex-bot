-- ย้อนกลับ 003_sale_line_bridge.sql: ถอดสะพาน LINE OA ของหน้า "แชตและออเดอร์"
--
-- ลบ: ฟังก์ชัน 8 ตัว (sale_line_* และ _sale_line_mirror) กับตาราง 4 ตาราง (sale_line_out, sale_line_msgs, sale_line_links, sale_line_status)
--      พร้อมนโยบายอ่านของตารางเหล่านั้น
-- ไม่ลบ: แชตและข้อความที่สะพานนี้สร้างไว้ใน sale_threads / sale_msgs แล้ว (source = 'line') — กลายเป็นแชตธรรมดาที่ยังเปิดอ่านได้
--        รูปที่ลูกค้าส่งใน bucket sale-order-files (path line/…) · ประวัติ "ส่งสรุป" ในใบสั่งงานที่สะพานนี้เคยบันทึกไว้
-- ผลที่ตามมา: หน้าจอจะเห็น LINE OA เป็น "ยังไม่ได้เชื่อมต่อ" · ข้อความที่ค้างในคิว (queued/sending) ที่ยังไม่ถูกส่งจะหายจากคิวและไม่ถูกส่ง
--            (ข้อความนั้นยังอยู่ในแชตในหน้าจอ แต่ป้ายสถานะการส่งจะค้างตามที่เป็นอยู่ตอนถอด)
-- ก่อนถอด: ตั้ง SALECHAT_MODE=off ที่ Render ก่อน เพื่อไม่ให้บอทเรียกฟังก์ชันที่ถูกลบ (เรียกไม่ได้ก็แค่บันทึก log ไม่กระทบการตอบลูกค้า)
drop function if exists public.sale_line_beat(text, text, text, jsonb);
drop function if exists public.sale_line_finish(uuid, text, text, text);
drop function if exists public.sale_line_claim(integer, integer);
drop function if exists public.sale_line_retry(uuid, text);
drop function if exists public.sale_line_send(uuid, text, text, text, uuid);
drop function if exists public.sale_line_ingest(jsonb);
drop function if exists public._sale_line_mirror(uuid);
drop table if exists public.sale_line_out;
drop table if exists public.sale_line_msgs;
drop table if exists public.sale_line_links;
drop table if exists public.sale_line_status;
notify pgrst, 'reload schema';
