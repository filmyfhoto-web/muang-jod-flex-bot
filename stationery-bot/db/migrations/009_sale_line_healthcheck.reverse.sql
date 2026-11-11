-- ย้อนกลับ 009_sale_line_healthcheck.sql: ถอด cron job ออก
-- ไม่ปิด extension pg_cron (อาจมี cron job อื่นใช้งานอยู่แล้วโดยไม่เกี่ยวกับเรา — ปิด extension อาจกระทบของคนอื่น)

select cron.unschedule('sale_line_healthcheck');
