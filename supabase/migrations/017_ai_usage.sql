-- ============================================================
-- ม่วงจด — บันทึกค่า AI (ai_usage)
-- Safe to run repeatedly.
-- ============================================================
--
-- ร้านถามว่า "ใช้เงินกี่บาท เอามาดูในบอตได้ไหม" — ทุกครั้งที่ม่วงอ่านรูป
-- Anthropic ตอบจำนวนโทเคนที่ใช้จริงกลับมา เก็บไว้ที่นี่แล้วคูณราคาเอง
-- ได้ยอดต่อวัน/ต่อเดือนโดยไม่ต้องเปิดเว็บ
--
-- ตารางนี้ไม่มีผลกับงานหลัก: ถ้ายังไม่ได้รัน บอตทำงานตามปกติ แค่ไม่เก็บยอด

create table if not exists public.ai_usage (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  -- vision = อ่านรูป, text = แยกข้อความ (เมื่อเปิด NLP_TEXT_AI)
  kind          text not null default 'vision',
  model         text not null,
  input_tokens  int  not null default 0,
  output_tokens int  not null default 0,
  -- ค่าใช้จ่ายเป็นดอลลาร์ ณ ราคาตอนที่เรียก
  cost_usd      numeric(12, 6) not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists ai_usage_user_created_idx on public.ai_usage (user_id, created_at desc);

alter table public.ai_usage enable row level security;

notify pgrst, 'reload schema';
