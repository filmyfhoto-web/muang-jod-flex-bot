-- 010 reverse · ถอดตารางและฟังก์ชันเก็บเหตุการณ์ของ LINE
-- ข้อมูลที่เก็บไว้จะหายไปด้วย — ตั้ง WEBHOOK_LOG_MODE=off บน Render ก่อนรันไฟล์นี้

drop function if exists public.line_webhook_failed(text, jsonb, text, integer);
drop function if exists public.line_webhook_done(text, jsonb);
drop function if exists public.line_webhook_record(text, jsonb);
drop table if exists public.line_webhook_events;
