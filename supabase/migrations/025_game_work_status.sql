-- ม่วงจด — ขั้นผลิตของเกมหน้าร้าน (NATTAPRON 8-BIT AUTO SHOP)
--
-- เกมที่ /app/game อ่านคิวงานจริง และจดได้เฉพาะ "ขั้นผลิตละเอียด" ที่ระบบหลัก
-- ไม่มีช่องอยู่แล้ว (เตรียมไฟล์ / กำลังผลิต / ตรวจงาน / ส่งบ้านไวนิล-กำลังผลิต-
-- กลับถึงร้าน) ส่วน "ทำเสร็จ" กับ "ลูกค้ารับแล้ว" ใช้ done_at / picked_up_at
-- ช่องจริงเดิมจาก migration 014/015 — ไม่เก็บซ้ำให้มีวันขัดกันเอง
-- เรื่องเงินทุกช่องเกมแตะไม่ได้โดยออกแบบ (ดู src/utils/gameBridge.js)
alter table public.jobs add column if not exists work_status text;
alter table public.jobs add column if not exists work_history jsonb not null default '[]'::jsonb;
