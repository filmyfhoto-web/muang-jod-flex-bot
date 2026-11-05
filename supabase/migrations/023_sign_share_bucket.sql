-- ============================================================
-- นัดพอน Sign Mockup — ลิงก์ดูป้าย 3 มิติ (/sign/v/<id>)
--   bucket ส่วนตัว "sign-share" เก็บไฟล์ .glb / รูปตัวอย่าง .jpg / meta .json (ไม่เกิน 20 MB)
--   แยกจาก job-evidence ที่รับเฉพาะรูปและ PDF
-- Safe to run repeatedly.
-- ============================================================
--
-- หมายเหตุ: ไม่รันก็ใช้ได้ เซิร์ฟเวอร์จะสร้าง bucket นี้ให้เองตอนสร้างลิงก์ครั้งแรก
-- (ใช้ service role) ไฟล์นี้มีไว้ให้ตั้งค่าเองล่วงหน้า / ปรับขนาดย้อนหลัง
-- bucket ไม่เปิดสาธารณะ ลูกค้าเปิดไฟล์ผ่านเซิร์ฟเวอร์เท่านั้น จึงไม่ต้องมี storage policy

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sign-share',
  'sign-share',
  false,
  20971520,
  array['model/gltf-binary', 'image/jpeg', 'application/json']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
