-- 010 · เก็บเหตุการณ์จาก LINE ไว้ก่อนตอบ LINE (สเปคข้อ 7: รับ webhook ให้ทนทาน)
-- · เหตุการณ์ของ LINE ที่มี webhookEventId จะถูกเขียนลงตารางนี้ก่อนบอทตอบ LINE ด้วย 200 ถ้าเขียนไม่ได้บอทตอบ 500 และ LINE ส่งมาใหม่
-- · LINE ส่งเหตุการณ์เดิมซ้ำได้เมื่อไม่ได้รับ 200 ทันเวลา ตารางนี้จำว่าเคยรับแล้ว บอทจึงไม่ตอบลูกค้าซ้ำ
-- · สถานะ: received = รับแล้ว ยังไม่เสร็จ · done = จัดการเสร็จ · failed = ล้มเหลว ลองใหม่ได้ · dead = ล้มเหลวครบเพดาน (DLQ ให้คนดูด้วยมือ)
-- · ยังไม่มีการรันซ้ำอัตโนมัติของ received/failed ในเฟสนี้ (เป็นงานเฟสถัดไป)
-- · ตารางนี้ไม่เปิดให้ anon/authenticated และไม่มีนโยบาย RLS — เรียกผ่านฟังก์ชันด้านล่างโดยบอท (service role) เท่านั้น
-- · บอทใช้ตารางนี้ก็ต่อเมื่อ WEBHOOK_LOG_MODE=on บน Render (ค่าเริ่มต้น off = ทำงานเหมือนเดิมทุกอย่าง)
-- · payload เก็บข้อความเต็มของลูกค้า (ข้อมูลส่วนตัว) — นโยบายการเก็บรักษาต้องให้เจ้าของกำหนด

create table if not exists public.line_webhook_events (
  channel_key text not null,
  webhook_event_id text not null,
  event_type text not null default '',
  line_user_id text,
  payload jsonb not null,
  status text not null default 'received' check (status in ('received', 'done', 'failed', 'dead')),
  attempts integer not null default 0,
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  primary key (channel_key, webhook_event_id)
);

create index if not exists line_webhook_events_open
  on public.line_webhook_events (status, received_at)
  where status in ('received', 'failed');

alter table public.line_webhook_events enable row level security;
revoke all on public.line_webhook_events from anon, authenticated;

-- เขียนเหตุการณ์ที่ยังไม่เคยรับ คืนรายการ id ของเหตุการณ์ที่เพิ่งเขียนครั้งแรก (ที่ซ้ำจะไม่อยู่ในนี้)
create or replace function public.line_webhook_record(p_channel text, p_events jsonb)
returns text[]
language sql
set search_path = public
as $$
  with ins as (
    insert into public.line_webhook_events (channel_key, webhook_event_id, event_type, line_user_id, payload)
    select p_channel, e->>'webhookEventId', coalesce(e->>'type', ''), e->'source'->>'userId', e
    from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) as e
    where coalesce(e->>'webhookEventId', '') <> ''
    on conflict (channel_key, webhook_event_id) do nothing
    returning webhook_event_id
  )
  select coalesce(array_agg(webhook_event_id), '{}'::text[]) from ins;
$$;

-- จัดการเสร็จแล้ว (dead ไม่ถูกเปลี่ยนกลับ — ต้องดูด้วยมือก่อน)
create or replace function public.line_webhook_done(p_channel text, p_ids jsonb)
returns integer
language sql
set search_path = public
as $$
  with u as (
    update public.line_webhook_events
       set status = 'done', processed_at = now(), last_error = null
     where channel_key = p_channel
       and webhook_event_id in (select jsonb_array_elements_text(p_ids))
       and status in ('received', 'failed')
    returning 1
  )
  select count(*)::integer from u;
$$;

-- ล้มเหลว: นับครั้ง เก็บเหตุผล ครบเพดาน (ค่าเริ่มต้น 5 ครั้ง) เป็น dead
create or replace function public.line_webhook_failed(p_channel text, p_ids jsonb, p_error text, p_max integer default 5)
returns integer
language sql
set search_path = public
as $$
  with u as (
    update public.line_webhook_events
       set attempts = attempts + 1,
           last_error = left(coalesce(p_error, ''), 500),
           status = case when attempts + 1 >= p_max then 'dead' else 'failed' end
     where channel_key = p_channel
       and webhook_event_id in (select jsonb_array_elements_text(p_ids))
       and status in ('received', 'failed')
    returning 1
  )
  select count(*)::integer from u;
$$;

revoke execute on function public.line_webhook_record(text, jsonb) from public, anon, authenticated;
revoke execute on function public.line_webhook_done(text, jsonb) from public, anon, authenticated;
revoke execute on function public.line_webhook_failed(text, jsonb, text, integer) from public, anon, authenticated;
grant execute on function public.line_webhook_record(text, jsonb) to service_role;
grant execute on function public.line_webhook_done(text, jsonb) to service_role;
grant execute on function public.line_webhook_failed(text, jsonb, text, integer) to service_role;
