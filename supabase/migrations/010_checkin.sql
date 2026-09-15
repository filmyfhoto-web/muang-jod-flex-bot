-- ============================================================
-- ม่วงจด — ม่วงทักถามงานตามเวลา (notification_settings / notification_logs)
-- Safe to run repeatedly.
-- ============================================================
--
-- คนละเรื่องกับ nudge_state ที่มีอยู่แล้ว: อันนั้นคือ "ร้านหายไปหลายวัน
-- แล้วม่วงทักตาม" ส่วนอันนี้คือ "ทุกวันตอนเที่ยงกับหกโมงเย็น ม่วงแวะมาถาม
-- ว่ามีงานให้จดไหม" เป็นนัดประจำ ไม่ใช่การตามหา
--
-- ของสองอย่างที่ตารางพวกนี้ต้องทำให้ได้
--   1. ไม่ทักคนที่ไม่ได้อยากให้ทัก — ทุกค่าเริ่มต้นจึงต้องปลอดภัยเมื่อไม่มีแถว
--   2. ไม่ทักซ้ำ — ระบบตั้งเวลาเดินซ้ำ โปรเซสรีสตาร์ต หรือมีหลายอินสแตนซ์
--      พร้อมกันได้ ตัวกันคือ unique_send_key ที่ฐานข้อมูลบังคับให้ไม่ซ้ำ
--      ไม่ใช่ความระมัดระวังของโค้ด

-- ------------------------------------------------------------ การตั้งค่า

create table if not exists public.notification_settings (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null unique references public.profiles (id) on delete cascade,
  -- เก็บไว้ด้วยเพราะตอนส่งต้องใช้ ID นี้ยิงตรง ไม่ได้ใช้ชื่อ
  line_user_id   text not null,
  -- ชื่อที่ม่วงใช้เรียก ("ฟิล์มคะ ...") ว่างได้ ไม่มีชื่อก็ทักได้
  display_name   text,
  -- ปิดได้ตลอดเวลา และเป็นค่าที่ชนะทุกอย่าง
  enabled        boolean not null default true,
  -- เวลาที่จะทัก เก็บเป็น 'HH:MM' ตามเขตเวลาข้างล่าง เพิ่ม/ลบช่วงได้เอง
  reminder_times text[] not null default array['12:00', '18:00'],
  -- วันที่ให้ทัก 0 = อาทิตย์ ตามเลขวันของ JS
  active_days    int[]  not null default array[0, 1, 2, 3, 4, 5, 6],
  timezone       text   not null default 'Asia/Bangkok',
  skip_holidays  boolean not null default false,
  -- เลือกโทนข้อความได้ ว่างแปลว่าใช้ข้อความประจำรอบนั้น
  preferred_message text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists notification_settings_set_updated_at on public.notification_settings;
create trigger notification_settings_set_updated_at
  before update on public.notification_settings
  for each row execute function public.set_updated_at();

alter table public.notification_settings enable row level security;

-- --------------------------------------------------------- ประวัติการส่ง

create table if not exists public.notification_logs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references public.profiles (id) on delete cascade,
  line_user_id      text not null,
  -- 'checkin' คือรอบถามงานประจำวัน เผื่อไว้ให้ประเภทอื่นใช้ตารางเดียวกัน
  notification_type text not null default 'checkin',
  -- รอบไหนของวันไหน เก็บไว้เพื่ออ่านย้อนหลังได้ว่าตั้งใจส่งตอนกี่โมง
  scheduled_at      timestamptz,
  sent_at           timestamptz,
  -- sent | failed | skipped
  status            text not null default 'sent',
  -- ร้านกดอะไรตอบมา (has_work / no_work / snooze / mute / view) — null คือยัง
  -- ไม่ได้ตอบ ซึ่ง "ไม่ได้แปลว่าไม่มีงาน" ต้องไม่มีที่ไหนอ่านค่านี้ว่าไม่มีงาน
  user_response     text,
  responded_at      timestamptz,
  error_message     text,
  -- กันส่งซ้ำ: line_user_id + วันที่ + รอบเวลา + ประเภท
  -- unique จริง ๆ ที่ฐานข้อมูล ไม่ใช่แค่เช็คในโค้ดก่อนเขียน — สองโปรเซสที่
  -- เช็คพร้อมกันจะผ่านทั้งคู่ แต่เขียนสำเร็จได้แค่ตัวเดียว
  unique_send_key   text not null unique,
  created_at        timestamptz not null default now()
);

create index if not exists notification_logs_user_idx
  on public.notification_logs (line_user_id, created_at desc);

alter table public.notification_logs enable row level security;

-- ------------------------------------------------- เลื่อนไปทักใหม่ทีหลัง
--
-- "เตือนอีกที ตอน 17:00" กับ "วันนี้ไม่ต้องเตือนแล้ว" เป็นของชั่วคราวประจำวัน
-- ไม่ใช่การตั้งค่า จึงไม่ควรไปทับ notification_settings ที่เป็นของถาวร

create table if not exists public.checkin_day_state (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  -- วันตามเขตเวลาของร้าน ไม่ใช่วัน UTC
  day         date not null,
  -- ตอบแล้วว่ามีงาน/ไม่มีงาน — วันนี้ไม่ต้องถามอีก
  answered_at timestamptz,
  answer      text,
  -- กด "ไม่ต้องเตือนวันนี้" — เงียบเฉพาะวันนี้ พรุ่งนี้ทักตามปกติ
  muted       boolean not null default false,
  -- กด "เตือนอีกที" — ก่อนเวลานี้ห้ามทัก
  snooze_until timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, day)
);

drop trigger if exists checkin_day_state_set_updated_at on public.checkin_day_state;
create trigger checkin_day_state_set_updated_at
  before update on public.checkin_day_state
  for each row execute function public.set_updated_at();

alter table public.checkin_day_state enable row level security;
