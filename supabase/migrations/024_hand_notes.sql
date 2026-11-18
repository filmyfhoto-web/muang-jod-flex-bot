-- ============================================================
-- ม่วงจด — สมุดเขียนมือ (hand_notes)
-- Safe to run repeatedly.
-- ============================================================
--
-- ร้านขอ: "ฉันอยากสร้างสมุดจดแบบเขียนมือด้วยค่ะ ทำให้ได้ไหมคะ" — บางอย่าง
-- พิมพ์เอาไม่ได้: สเก็ตช์แบบป้าย ขีดตำแหน่งเจาะรู วาดหน้างานให้ลูกค้าดู
-- หน้ากระดาษที่เขียนเสร็จถูกเก็บเป็นรูปภาพในที่เก็บไฟล์เดียวกับหลักฐานงาน
-- แถวในตารางนี้คือ "หน้าหนึ่งของเล่ม": ของใคร อยู่ไฟล์ไหน เขียนเมื่อไหร่
--
-- เก็บ "ที่อยู่ไฟล์" (path) ไม่ใช่ลิงก์สำเร็จรูป — ลิงก์ที่เซ็นไว้มีวันหมดอายุ
-- (บทเรียนเดียวกับ QR ของร้านใน 012) ตัวโปรแกรมเซ็นลิงก์ใหม่ทุกครั้งที่เปิดเล่ม

create table if not exists public.hand_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  path       text not null,
  created_at timestamptz not null default now()
);

create index if not exists hand_notes_user_created_idx
  on public.hand_notes (user_id, created_at desc);

comment on table public.hand_notes is
  'สมุดเขียนมือ — หน้ากระดาษที่ร้านเขียนด้วยนิ้ว/ปากกาบนจอ เก็บเป็นรูปทีละหน้า';
