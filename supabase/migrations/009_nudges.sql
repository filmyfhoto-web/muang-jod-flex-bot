-- ============================================================
-- ม่วงจด — ม่วงทักก่อน (nudge_state)
-- Safe to run repeatedly.
-- ============================================================
--
-- ร้านหายไปหลายวันแล้วม่วงทักไปเองว่า "มีงานให้จดมั้ย" — แบบที่เพื่อนทัก
-- ไม่ใช่แบบที่แอปเตือน
--
-- ตารางนี้มีไว้เพื่อ "ไม่รบกวน" โดยเฉพาะ: จำว่าทักไปครั้งสุดท้ายเมื่อไหร่
-- (จะได้ไม่ทักซ้ำ) ทักติดกันมากี่ครั้งแล้วโดยไม่มีใครตอบ (จะได้หยุดเอง)
-- และร้านปิดมันได้ตลอดเวลา
--
-- ไม่มีแถว = ยังไม่เคยทัก และเปิดอยู่ ค่าเริ่มต้นทุกช่องจึงต้องแปลว่า
-- "ปกติ" ร้านที่ไม่เคยยุ่งกับตารางนี้เลยต้องได้พฤติกรรมที่ถูกต้อง

create table if not exists public.nudge_state (
  user_id       uuid primary key references public.profiles (id) on delete cascade,
  -- ร้านสั่งหยุดได้เอง พิมพ์ "ไม่ต้องทัก" หรือกดปุ่มบนข้อความที่ทักไป
  enabled       boolean not null default true,
  last_nudge_at timestamptz,
  -- ทักไปแล้วกี่ครั้งติดโดยที่ยังไม่มีงานใหม่เข้ามา ถึงเพดานแล้วหยุด
  -- ไม่ใช่ทุกคนที่เงียบเพราะลืม บางคนเงียบเพราะไม่อยากคุย
  streak        int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ใช้ trigger เดียวกับตารางอื่นที่ 001 สร้างไว้
drop trigger if exists nudge_state_set_updated_at on public.nudge_state;
create trigger nudge_state_set_updated_at
  before update on public.nudge_state
  for each row execute function public.set_updated_at();

-- เปิด RLS โดยไม่มี policy สาธารณะ เหมือนทุกตารางใน 001 เซิร์ฟเวอร์ใช้
-- service_role ซึ่งข้าม RLS อยู่แล้ว ส่วน anon key จะอ่านอะไรไม่ได้เลย
alter table public.nudge_state enable row level security;
