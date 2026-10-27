-- ย้อน 002: ลบฟังก์ชัน home_summary() · ถอดโมดูล overview ก่อนเสมอ (ไม่งั้นหน้าภาพรวมจะเรียกฟังก์ชันที่ไม่มี)

drop function if exists public.home_summary();
