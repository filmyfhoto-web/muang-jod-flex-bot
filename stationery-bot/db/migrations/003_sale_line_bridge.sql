-- หน้า "แชตและออเดอร์" · สะพาน LINE OA: ข้อความลูกค้าเข้าหน้า (sale_threads / sale_msgs) และข้อความพนักงานออกไปถึงลูกค้า
--
-- เพิ่มอย่างเดียว: ตารางใหม่ 4 ตาราง ฟังก์ชันใหม่ 8 ตัว · ไม่เปลี่ยนโครงสร้างตาราง ฟังก์ชัน นโยบาย หรือ bucket เดิมแม้แต่บรรทัดเดียว
--   · แถวที่สะพานนี้เขียนลง sale_threads / sale_msgs คือแชตของลูกค้า LINE (source = 'line') เท่านั้น
--   · ตารางใหม่ผูกกับตารางเดิมด้วย foreign key (ลบแชตเดิม → ตัวผูก LINE ของแชตนั้นหายตาม · ลบใบสั่งงาน → ช่อง order_id ในคิวส่งเป็นว่าง)
-- ใช้กับโปรเจกต์ Supabase ของร้าน (mamlmgixovlwnjstetkj) หลังเจ้าของอนุมัติเท่านั้น · ย้อนกลับ: 003_sale_line_bridge.reverse.sql
-- ต้องมี 002_sale_orders.sql ก่อน (ใช้ sale_orders / sale_order_events สำหรับบันทึกผลการส่งสรุปใบ)
-- ทดสอบบน PostgreSQL จริง (PGlite): db/test/sale-line.test.js
--
-- หลักที่ยึด (คำสั่งเจ้าของ 3 พ.ย. 2569):
--   · ห้ามสมมติว่า LINE OA เชื่อมแล้ว: สถานะ "เชื่อมต่อ" มาจากสัญญาณชีพที่บอทเขียนเองทุกนาที (sale_line_status) ไม่ใช่จากการตั้งค่า
--   · ห้ามแสดงว่าส่งสำเร็จถ้ายังไม่ส่งจริง: ข้อความออกเริ่มที่ 'queued' และเป็น 'sent' ได้ทางเดียวคือบอทแจ้งกลับหลัง LINE ตอบรับ (2xx)
--   · ข้อความที่ค้างในคิวเกิน 30 นาทีไม่ถูกส่ง (กันคำตอบเก่าไปถึงลูกค้าทีหลัง) · ส่งซ้ำกันด้วยรหัสของคิว + X-Line-Retry-Key ของ LINE
--   · พนักงานส่งได้เฉพาะแชตที่ผูกกับ LINE แล้ว และผู้รับถูกอ่านจากตัวผูกฝั่งเซิร์ฟเวอร์ ไม่รับ LINE user id จากหน้าจอ
--   · เฉพาะบอท (service role) เขียนข้อความขาเข้า/ผลการส่ง/สัญญาณชีพได้ · พนักงานอ่านสถานะได้ แต่เขียนตรงลงตารางใหม่ไม่ได้ · anon ไม่ได้อะไรเลย

-- 1) สัญญาณชีพของบอท: หน้าจอใช้ตัดสินว่า "เชื่อมต่อ" จริงหรือไม่ ------------------------------------------------------
create table if not exists public.sale_line_status (
  channel_key text primary key,
  mode text not null default 'off' check (mode in ('off', 'pilot', 'on')),
  build text,
  last_seen_at timestamptz not null default now(),
  last_in_at timestamptz,
  last_out_at timestamptz,
  detail jsonb not null default '{}'::jsonb
);

-- 2) ตัวผูก: ลูกค้า LINE 1 คนต่อ OA 1 ช่อง = แชต 1 อันในหน้า -----------------------------------------------------------
create table if not exists public.sale_line_links (
  thread_id uuid primary key references public.sale_threads(id) on delete cascade,
  channel_key text not null,
  line_user_id text not null,
  line_name text,
  picture_url text,
  first_in_at timestamptz not null default now(),
  last_in_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint sale_line_links_user_uk unique (channel_key, line_user_id)
);

-- 3) สมุดบัญชีกันซ้ำ: ข้อความ LINE หนึ่งข้อความ (เลขของ LINE) เข้าหน้าได้ครั้งเดียว ---------------------------------------
create table if not exists public.sale_line_msgs (
  channel_key text not null,
  line_message_id text not null,
  msg_id uuid not null references public.sale_msgs(id) on delete cascade,
  thread_id uuid not null references public.sale_threads(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (channel_key, line_message_id)
);
create index if not exists sale_line_msgs_msg_idx on public.sale_line_msgs (msg_id);

-- 4) คิวข้อความออก: หน้าจอเข้าคิว บอทหยิบไปส่ง แล้วบอทแจ้งผลกลับ -------------------------------------------------------
--   queued  รอบอทหยิบ · sending บอทหยิบแล้วกำลังเรียก LINE · sent LINE ตอบรับแล้ว (เท่านั้นที่ถือว่าส่งถึง)
--   failed  LINE ปฏิเสธ หรือเรียกซ้ำจนครบแล้วยังไม่สำเร็จ · expired รอเกิน 30 นาทีโดยบอทไม่ได้เริ่มส่ง จึงไม่ส่ง
--   unknown บอทหยุดกลางคันหลังเริ่มส่ง ไม่ทราบว่าถึงหรือไม่ (ส่งซ้ำด้วยรหัสเดิมได้ LINE กันซ้ำให้)
create table if not exists public.sale_line_out (
  id uuid primary key default gen_random_uuid(),
  msg_id uuid not null unique references public.sale_msgs(id) on delete cascade,
  thread_id uuid not null references public.sale_threads(id) on delete cascade,
  order_id uuid references public.sale_orders(id) on delete set null,
  channel_key text not null,
  line_user_id text not null,
  body text not null check (char_length(body) between 1 and 5000),
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'expired', 'unknown')),
  attempts integer not null default 0,
  not_before timestamptz,
  error text,
  line_request_id text,
  retry_key uuid not null default gen_random_uuid(),
  ambiguous boolean not null default false,
  client_token text,
  created_by text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  claimed_at timestamptz,
  finished_at timestamptz
);
create unique index if not exists sale_line_out_token_uk on public.sale_line_out (client_token) where client_token is not null;
create index if not exists sale_line_out_work_idx on public.sale_line_out (status, created_at) where status in ('queued', 'sending');
create index if not exists sale_line_out_thread_idx on public.sale_line_out (thread_id, created_at desc);

-- 5) สิทธิ์ -----------------------------------------------------------------------------------------------------------
-- พนักงาน (authenticated) อ่านสถานะ ตัวผูก และคิวได้อย่างเดียว · การเขียนทั้งหมดผ่านฟังก์ชันด้านล่างหรือ service role ของบอท
alter table public.sale_line_status enable row level security;
alter table public.sale_line_links enable row level security;
alter table public.sale_line_msgs enable row level security;
alter table public.sale_line_out enable row level security;
revoke all on public.sale_line_status, public.sale_line_links, public.sale_line_msgs, public.sale_line_out from anon, authenticated;
grant select on public.sale_line_status, public.sale_line_links, public.sale_line_out to authenticated;
grant all on public.sale_line_status, public.sale_line_links, public.sale_line_msgs, public.sale_line_out to service_role;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sale_line_status' and policyname = 'staff read sale_line_status') then
    create policy "staff read sale_line_status" on public.sale_line_status for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sale_line_links' and policyname = 'staff read sale_line_links') then
    create policy "staff read sale_line_links" on public.sale_line_links for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sale_line_out' and policyname = 'staff read sale_line_out') then
    create policy "staff read sale_line_out" on public.sale_line_out for select to authenticated using (true);
  end if;
end $$;

-- 6) ฟังก์ชันภายใน: สะท้อนสถานะของคิวลงข้อความในแชต และบันทึกผลการส่งสรุปลงประวัติของใบ ---------------------------------
create or replace function public._sale_line_mirror(p_out uuid)
returns void
language plpgsql
set search_path = public
as $$
declare o public.sale_line_out;
begin
  select * into o from public.sale_line_out where id = p_out;
  if not found then return; end if;
  update public.sale_msgs m
     set meta = coalesce(m.meta, '{}'::jsonb)
                || jsonb_build_object('delivery', o.status, 'out_id', o.id, 'error', o.error, 'delivery_at', o.finished_at)
   where m.id = o.msg_id;
  -- สรุปของใบ: บันทึกผลลงประวัติของใบเฉพาะเมื่อได้ผลสุดท้ายแล้ว และสถานะละครั้งเดียว (ส่งซ้ำแล้วผลใหม่จึงบันทึกอีก)
  if o.order_id is not null and o.status in ('sent', 'failed', 'expired', 'unknown')
     and not exists (select 1 from public.sale_order_events e
                      where e.order_id = o.order_id and e.kind = 'send'
                        and e.detail ->> 'out_id' = o.id::text and e.detail ->> 'out_status' = o.status
                        and e.created_at >= o.created_at and (o.finished_at is null or e.created_at >= o.finished_at - interval '1 second')) then
    insert into public.sale_order_events (order_id, kind, detail, by_name)
    values (o.order_id, 'send',
      jsonb_build_object('channel', 'line', 'ok', o.status = 'sent', 'out_id', o.id, 'out_status', o.status,
        'detail', case o.status
          when 'sent' then 'ส่งสรุปทาง LINE OA ถึงลูกค้าแล้ว (LINE ตอบรับ)'
          when 'expired' then 'ไม่ได้ส่งทาง LINE OA: รอเกิน 30 นาทีโดยบอทไม่ได้เริ่มส่ง'
          when 'unknown' then 'ไม่ทราบว่าส่งทาง LINE OA ถึงลูกค้าหรือไม่ (บอทหยุดกลางคัน)'
          else 'ส่งทาง LINE OA ไม่สำเร็จ: ' || left(coalesce(o.error, 'ไม่ทราบสาเหตุ'), 300) end),
      o.created_by);
  end if;
end $$;
revoke all on function public._sale_line_mirror(uuid) from public, anon, authenticated;
grant execute on function public._sale_line_mirror(uuid) to service_role;

-- 7) บอท: ข้อความลูกค้าเข้าหน้า -----------------------------------------------------------------------------------------
-- p = { channel_key, line_user_id, line_message_id, kind, body, name, picture, at_ms, meta }
-- เรียกซ้ำด้วยข้อความ LINE เดิม = ไม่เขียนอะไรซ้ำ (duplicate: true) · ลูกค้าใหม่ = เปิดแชตใหม่ให้ (source = 'line')
create or replace function public.sale_line_ingest(p jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_ch text := nullif(btrim(coalesce(p ->> 'channel_key', '')), '');
  v_uid text := nullif(btrim(coalesce(p ->> 'line_user_id', '')), '');
  v_mid text := nullif(btrim(coalesce(p ->> 'line_message_id', '')), '');
  v_kind text := coalesce(nullif(btrim(coalesce(p ->> 'kind', '')), ''), 'text');
  v_body text := left(coalesce(p ->> 'body', ''), 5000);
  v_name text := nullif(left(btrim(coalesce(p ->> 'name', '')), 200), '');
  v_pic text := nullif(left(btrim(coalesce(p ->> 'picture', '')), 1000), '');
  v_meta jsonb := case when jsonb_typeof(p -> 'meta') = 'object' then p -> 'meta' else '{}'::jsonb end;
  v_at timestamptz;
  v_thread uuid;
  v_msg uuid;
  v_created boolean := false;
begin
  if v_ch is null or v_uid is null or v_mid is null then
    raise exception 'saleline: ต้องมีช่อง LINE ผู้ใช้ LINE และเลขข้อความ';
  end if;
  if v_kind not in ('text', 'image', 'sticker', 'file', 'video', 'audio', 'location', 'other') then
    raise exception 'saleline: ชนิดข้อความไม่ถูกต้อง';
  end if;
  -- เวลาที่ LINE บอกว่าลูกค้าส่ง (มิลลิวินาที) · ไม่มี/ผิดรูป = เวลาที่รับ · ล้ำหน้าเวลาจริงเกิน 1 นาทีไม่ได้
  v_at := case when coalesce(p ->> 'at_ms', '') ~ '^[0-9]{1,15}$' then to_timestamp((p ->> 'at_ms')::numeric / 1000.0) else now() end;
  if v_at > now() + interval '1 minute' then v_at := now(); end if;

  -- ลูกค้าคนเดียวกันทีละข้อความ (ข้อความแรกสองข้อความพร้อมกันต้องไม่เปิดแชตสองอัน)
  perform pg_advisory_xact_lock(hashtextextended('sale_line:' || v_ch || ':' || v_uid, 0));

  select l.msg_id, l.thread_id into v_msg, v_thread
    from public.sale_line_msgs l where l.channel_key = v_ch and l.line_message_id = v_mid;
  if found then
    return jsonb_build_object('duplicate', true, 'thread_id', v_thread, 'msg_id', v_msg, 'created_thread', false);
  end if;

  select k.thread_id into v_thread from public.sale_line_links k where k.channel_key = v_ch and k.line_user_id = v_uid;
  if not found then
    insert into public.sale_threads (title, source, stage, unread, last_at)
    values (coalesce(v_name, 'ลูกค้า LINE'), 'line', 'talk', 0, v_at)
    returning id into v_thread;
    insert into public.sale_line_links (thread_id, channel_key, line_user_id, line_name, picture_url, first_in_at, last_in_at)
    values (v_thread, v_ch, v_uid, v_name, v_pic, v_at, v_at);
    v_created := true;
  end if;

  insert into public.sale_msgs (thread_id, dir, kind, body, by_name, meta, created_at)
  values (v_thread, 'in', v_kind, v_body, v_name, v_meta || jsonb_build_object('src', 'line', 'line_message_id', v_mid), v_at)
  returning id into v_msg;
  insert into public.sale_line_msgs (channel_key, line_message_id, msg_id, thread_id) values (v_ch, v_mid, v_msg, v_thread);

  -- ข้อความที่มาถึงช้ากว่าที่ควร (เวลาเก่ากว่าข้อความล่าสุด) ต้องไม่ทับข้อความตัวอย่างของแชต
  update public.sale_threads
     set unread = unread + 1,
         last_text = case when v_at >= last_at then left(v_body, 120) else last_text end,
         last_at = greatest(last_at, v_at),
         title = case when title = 'ลูกค้า LINE' and v_name is not null then v_name else title end,
         updated_at = now()
   where id = v_thread;
  update public.sale_line_links
     set last_in_at = greatest(last_in_at, v_at),
         line_name = coalesce(v_name, line_name),
         picture_url = coalesce(v_pic, picture_url)
   where thread_id = v_thread;

  return jsonb_build_object('duplicate', false, 'thread_id', v_thread, 'msg_id', v_msg, 'created_thread', v_created);
end $$;
revoke all on function public.sale_line_ingest(jsonb) from public, anon, authenticated;
grant execute on function public.sale_line_ingest(jsonb) to service_role;

-- 8) พนักงาน: เข้าคิวส่งข้อความถึงลูกค้า ----------------------------------------------------------------------------------
-- ข้อความเข้าแชตทันทีในสถานะ 'queued' (ยังไม่ใช่ "ส่งแล้ว") · p_token กันกดซ้ำ/ส่งซ้ำ · p_order = ส่งสรุปของใบนี้ (ผลลงประวัติใบเอง)
-- security definer เพราะพนักงานเขียนตรงลงคิวไม่ได้ (กันระบุผู้รับเอง) · เรียกได้เฉพาะ authenticated / service_role
create or replace function public.sale_line_send(p_thread uuid, p_text text, p_token text, p_by text, p_order uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_text text := btrim(coalesce(p_text, ''));
  v_tok text := nullif(btrim(coalesce(p_token, '')), '');
  v_by text := nullif(left(btrim(coalesce(p_by, '')), 100), '');
  v_link public.sale_line_links;
  v_out public.sale_line_out;
  v_msg uuid;
begin
  if v_tok is null then raise exception 'saleline: ต้องมีรหัสกันส่งซ้ำ'; end if;
  if v_text = '' then raise exception 'saleline: ข้อความว่าง'; end if;
  if char_length(v_text) > 5000 then raise exception 'saleline: ข้อความยาวเกิน 5,000 ตัวอักษร (ข้อจำกัดของ LINE)'; end if;

  -- กดซ้ำ/ส่งซ้ำด้วยรหัสเดิม: คืนข้อความแรก ไม่เข้าคิวใหม่
  select * into v_out from public.sale_line_out where client_token = v_tok;
  if found then
    if v_out.thread_id <> p_thread then raise exception 'saleline: รหัสนี้ถูกใช้กับแชตอื่นแล้ว'; end if;
    return jsonb_build_object('duplicate', true, 'out_id', v_out.id, 'msg_id', v_out.msg_id, 'status', v_out.status);
  end if;

  select * into v_link from public.sale_line_links where thread_id = p_thread;
  if not found then raise exception 'saleline: แชตนี้ไม่ได้มาจาก LINE OA จึงส่งทาง LINE จากหน้านี้ไม่ได้'; end if;
  if p_order is not null and not exists (select 1 from public.sale_orders o where o.id = p_order and o.thread_id = p_thread) then
    raise exception 'saleline: ใบสั่งงานนี้ไม่ใช่ของแชตนี้';
  end if;

  begin
    insert into public.sale_msgs (thread_id, dir, kind, body, by_name, meta)
    values (p_thread, 'out', 'text', v_text, v_by, jsonb_build_object('src', 'line_out', 'delivery', 'queued'))
    returning id into v_msg;
    insert into public.sale_line_out (msg_id, thread_id, order_id, channel_key, line_user_id, body, client_token, created_by)
    values (v_msg, p_thread, p_order, v_link.channel_key, v_link.line_user_id, v_text, v_tok, v_by)
    returning * into v_out;
  exception when unique_violation then
    -- สองคำขอรหัสเดียวกันพร้อมกัน: อีกคำขอเข้าคิวไปแล้ว คืนอันนั้น (ข้อความที่เพิ่งใส่ถูกยกเลิกพร้อมบล็อกนี้)
    select * into v_out from public.sale_line_out where client_token = v_tok;
    return jsonb_build_object('duplicate', true, 'out_id', v_out.id, 'msg_id', v_out.msg_id, 'status', v_out.status);
  end;
  update public.sale_msgs set meta = meta || jsonb_build_object('out_id', v_out.id) where id = v_msg;
  update public.sale_threads set last_text = left(v_text, 120), last_at = now(), updated_at = now() where id = p_thread;
  return jsonb_build_object('duplicate', false, 'out_id', v_out.id, 'msg_id', v_msg, 'status', 'queued', 'expires_at', v_out.expires_at);
end $$;
revoke all on function public.sale_line_send(uuid, text, text, text, uuid) from public, anon;
grant execute on function public.sale_line_send(uuid, text, text, text, uuid) to authenticated, service_role;

-- 9) พนักงาน: ส่งซ้ำข้อความที่ส่งไม่สำเร็จ (ใช้ได้ภายใน 23 ชั่วโมง ตามอายุรหัสกันซ้ำของ LINE) ---------------------------------
-- ถ้าครั้งก่อนไม่แน่ใจว่าถึงหรือไม่ (ambiguous) ใช้รหัส LINE เดิม → ถ้าถึงไปแล้ว LINE ตอบว่ารับไว้แล้ว ไม่ส่งซ้ำ
-- ถ้าครั้งก่อนถูกปฏิเสธชัดเจน ใช้รหัสใหม่
create or replace function public.sale_line_retry(p_out uuid, p_by text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare o public.sale_line_out;
begin
  select * into o from public.sale_line_out where id = p_out for update;
  if not found then raise exception 'saleline: ไม่พบข้อความในคิวส่ง'; end if;
  if o.status in ('queued', 'sending', 'sent') then
    return jsonb_build_object('changed', false, 'status', o.status);
  end if;
  if o.created_at < now() - interval '23 hours' then
    raise exception 'saleline: ข้อความนี้เก่าเกิน 23 ชั่วโมงแล้ว ส่งซ้ำไม่ได้ ให้พิมพ์ส่งใหม่';
  end if;
  update public.sale_line_out
     set status = 'queued', attempts = 0, not_before = null, error = null, finished_at = null, claimed_at = null,
         expires_at = now() + interval '30 minutes',
         retry_key = case when ambiguous then retry_key else gen_random_uuid() end,
         ambiguous = false,
         created_by = coalesce(nullif(left(btrim(coalesce(p_by, '')), 100), ''), created_by)
   where id = p_out;
  perform public._sale_line_mirror(p_out);
  return jsonb_build_object('changed', true, 'status', 'queued');
end $$;
revoke all on function public.sale_line_retry(uuid, text) from public, anon;
grant execute on function public.sale_line_retry(uuid, text) to authenticated, service_role;

-- 10) บอท: หยิบข้อความที่รอส่ง -----------------------------------------------------------------------------------------
-- ก่อนหยิบ: ที่รอเกินเวลาโดยยังไม่เริ่มส่ง → expired (ไม่ส่ง) · ที่เริ่มส่งแล้วเงียบหายเกิน p_stale_secs และเกินเวลา → unknown
-- หยิบได้: queued ที่ถึงเวลา · sending ที่ค้างเกิน p_stale_secs (บอทเก่าหยุดกลางคัน; ส่งซ้ำปลอดภัยเพราะรหัส LINE เดิม)
-- ผลเป็น jsonb array (PostgREST คืนรูปเดียวกัน)
create or replace function public.sale_line_claim(p_limit integer default 5, p_stale_secs integer default 90)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  r record;
  v_rows jsonb;
  v_stale interval := make_interval(secs => greatest(coalesce(p_stale_secs, 90), 10));
begin
  for r in
    update public.sale_line_out
       set status = 'expired', error = 'รอเกิน 30 นาทีโดยบอทไม่ได้เริ่มส่ง จึงไม่ได้ส่ง', finished_at = now()
     where status = 'queued' and expires_at < now()
    returning id
  loop
    perform public._sale_line_mirror(r.id);
  end loop;
  for r in
    update public.sale_line_out
       set status = 'unknown', ambiguous = true, finished_at = now(),
           error = 'บอทหยุดกลางคันหลังเริ่มส่ง ไม่ทราบว่าถึงลูกค้าหรือไม่'
     where status = 'sending' and claimed_at < now() - v_stale and expires_at < now()
    returning id
  loop
    perform public._sale_line_mirror(r.id);
  end loop;

  with c as (
    select id from public.sale_line_out
     where (status = 'queued' and (not_before is null or not_before <= now()))
        or (status = 'sending' and claimed_at < now() - v_stale)
     order by created_at
     limit least(greatest(coalesce(p_limit, 5), 1), 20)
       for update skip locked
  ), u as (
    update public.sale_line_out o
       set status = 'sending', claimed_at = now(), attempts = o.attempts + 1
      from c where o.id = c.id
    returning o.id, o.thread_id, o.channel_key, o.line_user_id, o.body, o.retry_key, o.attempts, o.expires_at, o.created_at
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', u.id, 'thread_id', u.thread_id, 'channel_key', u.channel_key, 'line_user_id', u.line_user_id,
           'body', u.body, 'retry_key', u.retry_key, 'attempts', u.attempts, 'expires_at', u.expires_at) order by u.created_at), '[]'::jsonb)
    into v_rows from u;
  return v_rows;
end $$;
revoke all on function public.sale_line_claim(integer, integer) from public, anon, authenticated;
grant execute on function public.sale_line_claim(integer, integer) to service_role;

-- 11) บอท: แจ้งผลการส่ง -----------------------------------------------------------------------------------------------
-- p_result: 'sent' (LINE ตอบรับ) · 'failed' (LINE ปฏิเสธชัดเจน เช่น โควตาเต็ม/ผู้ใช้บล็อก) · 'retry' (เรียกไม่ติด/LINE ผิดพลาดชั่วคราว ไม่ทราบว่าถึงหรือไม่)
-- 'retry' = กลับเข้าคิวรอใหม่ (หน่วง 5/20/60 วินาที) จนครบ 4 ครั้งหรือหมดเวลา แล้วเป็น 'failed' แบบไม่แน่ใจ (ambiguous)
-- เปลี่ยนได้เฉพาะแถวที่อยู่ในสถานะ 'sending' (แจ้งซ้ำ/แจ้งช้าไม่ทำให้สถานะย้อนหรือเพี้ยน)
create or replace function public.sale_line_finish(p_id uuid, p_result text, p_error text, p_request_id text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  o public.sale_line_out;
  v_err text := nullif(left(btrim(coalesce(p_error, '')), 300), '');
begin
  if p_result is null or p_result not in ('sent', 'failed', 'retry') then
    raise exception 'saleline: ผลการส่งไม่ถูกต้อง';
  end if;
  select * into o from public.sale_line_out where id = p_id for update;
  if not found then raise exception 'saleline: ไม่พบข้อความในคิวส่ง'; end if;
  if o.status <> 'sending' then
    return jsonb_build_object('changed', false, 'status', o.status);
  end if;

  if p_result = 'sent' then
    update public.sale_line_out
       set status = 'sent', error = null, ambiguous = false, finished_at = now(), line_request_id = left(nullif(btrim(coalesce(p_request_id, '')), ''), 100)
     where id = p_id;
    update public.sale_line_status set last_out_at = now() where channel_key = o.channel_key;
  elsif p_result = 'failed' then
    update public.sale_line_out
       set status = 'failed', error = coalesce(v_err, 'LINE ปฏิเสธการส่ง'), ambiguous = false, finished_at = now()
     where id = p_id;
  elsif o.attempts >= 4 or o.expires_at <= now() then
    update public.sale_line_out
       set status = 'failed', ambiguous = true, finished_at = now(),
           error = coalesce(v_err, 'เรียก LINE ไม่สำเร็จ') || ' (ไม่แน่ใจว่าถึงลูกค้าหรือไม่)'
     where id = p_id;
  else
    update public.sale_line_out
       set status = 'queued', claimed_at = null, error = v_err,
           not_before = now() + case o.attempts when 1 then interval '5 seconds' when 2 then interval '20 seconds' else interval '60 seconds' end
     where id = p_id;
  end if;
  perform public._sale_line_mirror(p_id);
  select * into o from public.sale_line_out where id = p_id;
  return jsonb_build_object('changed', true, 'status', o.status);
end $$;
revoke all on function public.sale_line_finish(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.sale_line_finish(uuid, text, text, text) to service_role;

-- 12) บอท: สัญญาณชีพ (ทุกนาทีขณะบอทตื่นอยู่และต่อฐานข้อมูลได้) ------------------------------------------------------------
create or replace function public.sale_line_beat(p_channel text, p_mode text, p_build text, p_detail jsonb)
returns void
language plpgsql
set search_path = public
as $$
begin
  if nullif(btrim(coalesce(p_channel, '')), '') is null then raise exception 'saleline: ต้องมีช่อง LINE'; end if;
  insert into public.sale_line_status as s (channel_key, mode, build, last_seen_at, last_in_at, detail)
  values (btrim(p_channel), case when p_mode in ('off', 'pilot', 'on') then p_mode else 'off' end,
          nullif(left(coalesce(p_build, ''), 40), ''), now(),
          (select max(k.last_in_at) from public.sale_line_links k where k.channel_key = btrim(p_channel)),
          case when jsonb_typeof(p_detail) = 'object' then p_detail else '{}'::jsonb end)
  on conflict (channel_key) do update
     set mode = excluded.mode, build = excluded.build, last_seen_at = now(),
         last_in_at = (select max(k.last_in_at) from public.sale_line_links k where k.channel_key = excluded.channel_key),
         detail = s.detail || excluded.detail;
end $$;
revoke all on function public.sale_line_beat(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.sale_line_beat(text, text, text, jsonb) to service_role;

notify pgrst, 'reload schema';
