-- ย้อนกลับ 004_sale_order_cards.sql: เอาฟังก์ชันลูกค้าอัตโนมัติและคอลัมน์ team_card_at ออก
-- ไม่ลบรายชื่อลูกค้าที่ถูกเพิ่มไปแล้ว (ยังเป็นแถวในตาราง customers ตามปกติ) และไม่ลบใบสั่งงานใด ๆ
-- ก่อนถอด: ตั้งให้บอทหยุดส่งการ์ดทีมงานก่อน (SALECHAT ... และ SALECHAT_TEAMCARD=off ที่ Render) ไม่งั้นบอทจะเรียกคอลัมน์ที่ถูกลบ

drop function if exists public.sale_customer_upsert(uuid, text, text, text);
drop index if exists public.sale_orders_team_card_pending;
alter table public.sale_orders drop column if exists team_card_at;
