-- หน้า "แชตและออเดอร์" · เช็กการเชื่อมต่อ LINE อัตโนมัติ (เจ้าของขอ 10 พ.ย. 2569: "ฉันอยากให้ใช้ร่วม oa ได้แบบสเถียร")
--
-- ที่มา: Webhook ของ LINE OA เคยถูกเปลี่ยนไปชี้ที่ระบบอื่น (Botcake) โดยไม่มีใครรู้ตัว ทำให้ข้อความลูกค้าหายไปจากระบบ 3 วันเต็ม
-- กว่าจะมีคนสังเกตเห็น เพราะบอทเองยังทำงานปกติ (heartbeat ยังส่ง) เพียงแต่ LINE ไม่ส่งข้อความมาที่บอทแล้ว
--
-- เพิ่มอย่างเดียว: เปิด extension pg_cron (ยังไม่เคยเปิดในโปรเจกต์นี้) + 1 cron job ใหม่ · ไม่แตะตาราง ฟังก์ชัน หรือ cron job เดิม
--   · ทุก 30 นาที เรียก edge function line-richmenu action 'health_check' (เพิ่มแยกต่างหาก ดู app-patches/line-richmenu/index.ts)
--     ซึ่งจะเช็ค 2 จุด: (1) Webhook ของ LINE ยังชี้มาที่บอทเราไหม (2) มีข้อความลูกค้าเข้ามานานผิดปกติไหม (เกิน 20 ชม.)
--     ถ้าผิดปกติจุดใดจุดหนึ่ง จะส่ง Web Push แจ้งเตือนไปยังอุปกรณ์ที่เปิดแจ้งเตือนหลังร้านไว้ (ใช้ push-notify ที่มีอยู่แล้ว ไม่สร้างระบบแจ้งเตือนใหม่)
--     กันแจ้งถี่เกินไปด้วยการเว้นอย่างน้อย 4 ชม. ต่อการแจ้งเตือนหนึ่งครั้ง (เก็บเวลาแจ้งล่าสุดใน app_config คีย์ 'sale_line_health_alert')
--   · เช็คอย่างเดียว ไม่แก้ไข Webhook ให้เอง (แก้ URL ของ OA เป็นเรื่องใหญ่ ต้องให้คนตัดสินใจ ไม่ใช่ให้บอทแก้เงียบ ๆ)
-- ใช้กับโปรเจกต์ Supabase ของร้าน (mamlmgixovlwnjstetkj) หลังเจ้าของอนุมัติเท่านั้น · ย้อนกลับ: 009_sale_line_healthcheck.reverse.sql
-- ต้องมี 003 (sale_line_status) ก่อน · ต้อง deploy edge function line-richmenu รุ่นที่มี action 'health_check' ก่อนเปิด cron นี้ ไม่งั้น cron จะยิงไปเจอ bad_request เฉย ๆ (ไม่กระทบอะไร แค่ไม่ได้ผล)
-- ใช้ซ้ำได้ (idempotent — cron.schedule ชื่อซ้ำจะแทนที่ตัวเดิม ไม่ซ้อนกัน)

create extension if not exists pg_cron;

select cron.schedule(
  'sale_line_healthcheck',
  '*/30 * * * *',
  $cron$
  select net.http_post(
    url := 'https://mamlmgixovlwnjstetkj.supabase.co/functions/v1/line-richmenu',
    body := jsonb_build_object(
      'key', (select value from app_secrets where key = 'push_hook_key'),
      'action', 'health_check'
    )
  );
  $cron$
);
