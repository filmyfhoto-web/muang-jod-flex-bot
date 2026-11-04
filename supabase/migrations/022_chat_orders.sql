-- ============================================================
-- ม่วงจด — หน้า "แชตและออเดอร์"
--   - chat_messages: บันทึกข้อความของลูกค้าและการตอบกลับ (ภายในระบบ)
--   - jobs: เบอร์โทร / วิธีรับ-จัดส่ง / ผู้รับผิดชอบ / client_ref กันบันทึกซ้ำ
-- Safe to run repeatedly.
-- ============================================================
--
-- หมายเหตุ: ยังไม่มีช่องทางส่งข้อความถึงลูกค้าจริง (LINE OA / Facebook) ตารางนี้
-- จึงเก็บเฉพาะสิ่งที่พนักงานบันทึกเข้ามา ข้อความขาออกจะถูกบันทึกว่า "ยังไม่ได้ส่งถึงลูกค้า"
-- ตามกติกาในโค้ดเสมอ

create table if not exists public.chat_messages (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  -- accountKey(ชื่อลูกค้า) — ตรงกับ customer_orgs และชื่อที่ใช้จัดกลุ่มงาน
  customer_key  text not null,
  customer_name text not null,
  -- 'in' = ข้อความที่ลูกค้าพิมพ์มา (พนักงานคัดลอกเข้า) · 'out' = พนักงานตอบกลับ (บันทึกไว้)
  direction     text not null check (direction in ('in', 'out')),
  body          text not null default '',
  file_url      text,
  file_type     text,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists chat_messages_user_key_idx
  on public.chat_messages (user_id, customer_key, created_at);
create index if not exists chat_messages_user_created_idx
  on public.chat_messages (user_id, created_at desc);

alter table public.chat_messages enable row level security;

-- ------------------------------------------------ ช่องของออเดอร์
alter table public.jobs add column if not exists customer_phone text;

alter table public.jobs add column if not exists fulfillment text
  check (fulfillment is null or fulfillment in ('pickup', 'delivery'));

alter table public.jobs add column if not exists handler_name text;

-- รหัสอ้างอิงจากฟอร์ม (สร้างฝั่งเบราว์เซอร์ครั้งเดียวต่อการกดบันทึก)
-- ใช้กันการบันทึกซ้ำเมื่อส่งซ้ำ (เน็ตหลุด/กดซ้ำ) — ซ้ำกันในบัญชีเดียวไม่ได้
alter table public.jobs add column if not exists client_ref text;
create unique index if not exists jobs_user_client_ref_idx
  on public.jobs (user_id, client_ref) where client_ref is not null;

notify pgrst, 'reload schema';
