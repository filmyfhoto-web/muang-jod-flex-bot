-- ============================================================
-- ม่วงจด — เลขงานรันแยกตามหมวด (MJ-STP-0007)
-- Safe to run repeatedly.
-- ============================================================
--
-- ร้านขอว่า "เลขรหัส รันตามหมวดงานได้มั้ย ต่อให้แก้กี่รอบก็ไม่เปลี่ยน" และ
-- "ต้องการแยก ทั้งเก่าด้วย"
--
-- ของเดิม MJ-YYYYMMDD-XXXX รันตามวัน บอกแค่ว่าจดวันไหน งานตรายางกับงานป้ายของ
-- วันเดียวกันได้เลขติดกัน แยกกองกันไม่ได้เลย
--
-- ของใหม่ MJ-STP-0007 = ตรายางใบที่เจ็ดของร้าน เลขถูกตั้งครั้งเดียวตอนสร้าง
-- ไม่มีใครคำนวณใหม่อีก แก้ราคา แก้ชื่อลูกค้า หรือย้ายหมวดทีหลัง เลขก็ยังเป็น
-- เลขเดิม — เลขงานคือ "ชื่อ" ของใบงาน ไม่ใช่ผลลัพธ์ที่คิดใหม่ได้ ใบที่ยื่นให้
-- ลูกค้าไปแล้วต้องตามหาเจอตลอดไป
--
-- ไฟล์นี้ทำสองอย่าง
--   1. เปลี่ยนเลขของงานเก่าทั้งหมดมาเป็นแบบใหม่ (ครั้งเดียว)
--   2. เปลี่ยน RPC ให้รับเลขที่ฝั่งแอปคิดมาแล้ว จะได้ไม่มีสองที่ที่ตั้งเลข

-- ------------------------------------------------ รหัสของแต่ละหมวด
--
-- ต้องตรงกับ CATEGORY_CODES ใน src/utils/jobNumber.js เป๊ะ ๆ
-- สามตัวเพราะสองตัวชนกันเอง (สติ๊กเกอร์ ตรายาง ส่งของ ขึ้นต้นด้วย ส เหมือนกัน)

create or replace function public.muangjod_category_code(p_category text)
returns text
language sql
immutable
as $$
  select case coalesce(p_category, 'other')
    when 'print'    then 'PRN'
    when 'sign'     then 'SGN'
    when 'stamp'    then 'STP'
    when 'sticker'  then 'STK'
    when 'photo'    then 'PIC'
    when 'design'   then 'DSG'
    when 'shipping' then 'SHP'
    else 'GEN'
  end;
$$;

-- ------------------------------------------------ เปลี่ยนเลขของงานเก่า
--
-- เรียงตามลำดับที่จดจริง (created_at แล้วค่อย id กันกรณีเวลาเท่ากันเป๊ะ) เพื่อให้
-- ใบที่จดก่อนได้เลขน้อยกว่าเสมอ นับรวมงานที่ยกเลิกไปแล้วด้วย เลขที่เคยออกไปจะได้
-- ไม่ถูกเอามาใช้ซ้ำ
--
-- ทำเฉพาะแถวที่ยังเป็นรูปแบบเก่า แถวที่เป็นแบบใหม่แล้วไม่ถูกแตะ — รันซ้ำกี่รอบ
-- ก็ได้ผลเดิม และงานที่ออกเลขใหม่ไปแล้วจะไม่ถูกเปลี่ยนเลขซ้ำสอง

do $$
declare
  v_updated int;
begin
  -- ไม่มีแถวไหนเป็นรูปแบบเก่าแล้ว = เคยรันไปแล้ว ไม่ต้องทำอะไร
  if not exists (select 1 from public.jobs where job_number ~ '^MJ-[0-9]{8}-') then
    raise notice 'ม่วงจด: เลขงานเป็นแบบใหม่อยู่แล้ว ไม่มีอะไรต้องแปลง';
    return;
  end if;

  with numbered as (
    select
      id,
      'MJ-'
        || public.muangjod_category_code(category)
        || '-'
        || lpad(
             row_number() over (
               partition by user_id, public.muangjod_category_code(category)
               order by created_at, id
             )::text,
             4, '0'
           ) as new_number
      from public.jobs
  )
  update public.jobs j
     set job_number = n.new_number
    from numbered n
   where j.id = n.id
     and j.job_number is distinct from n.new_number;

  get diagnostics v_updated = row_count;
  raise notice 'ม่วงจด: เปลี่ยนเลขงานเป็นแบบหมวด % ใบ', v_updated;
end $$;

-- ------------------------------------------------ RPC รับเลขจากฝั่งแอป
--
-- เลขงานคิดที่ src/services/jobService.js ที่เดียว แล้วส่งเข้ามาทางนี้ ไม่งั้น
-- งานที่สร้างผ่าน RPC กับผ่านทางสำรองใน JS จะได้เลขคนละแบบ
--
-- p_job_number เป็น null ได้ เผื่อมีคนเรียกแบบเก่า — กรณีนั้นตั้งเลขให้เองแบบใหม่
-- โดยนับจากหมวด ไม่ใช่จากวันอีกแล้ว

create or replace function public.create_job_with_items(
  p_user_id        uuid,
  p_job_name       text,
  p_customer_name  text,
  p_job_date       date,
  p_subtotal       numeric,
  p_discount       numeric,
  p_total          numeric,
  p_payment_status text,
  p_paid_amount    numeric,
  p_note           text,
  p_items          jsonb,
  p_job_number     text default null,
  p_category       text default null,
  p_category_type  text default null
) returns public.jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date       date := coalesce(p_job_date, current_date);
  v_category   text := coalesce(p_category, 'other');
  v_code       text := public.muangjod_category_code(v_category);
  v_seq        int;
  v_job_number text;
  v_job        public.jobs;
  v_item       jsonb;
  v_attempt    int := 0;
  v_total      numeric := coalesce(p_total, 0);
  v_paid       numeric := coalesce(p_paid_amount, 0);
begin
  -- นับใบที่มีอยู่ของหมวดนี้ ใช้เป็นตัวตั้งเมื่อฝั่งแอปไม่ได้ส่งเลขมา และเป็น
  -- ตัวตั้งของการลองเลขถัดไปเมื่อเลขที่ส่งมาชนกับของคนอื่นพอดี
  select count(*) into v_seq
    from public.jobs
   where user_id = p_user_id and coalesce(category, 'other') = v_category;

  loop
    v_attempt := v_attempt + 1;

    if v_attempt = 1 and p_job_number is not null then
      v_job_number := p_job_number;
    else
      v_seq := v_seq + 1;
      v_job_number := 'MJ-' || v_code || '-' || lpad(v_seq::text, 4, '0');
    end if;

    begin
      insert into public.jobs (
        user_id, job_number, job_name, customer_name, job_date,
        subtotal, discount, total, payment_status, status,
        paid_amount, balance_due, note, category, category_type
      ) values (
        p_user_id, v_job_number, p_job_name, p_customer_name, v_date,
        coalesce(p_subtotal, 0), coalesce(p_discount, 0), v_total,
        coalesce(p_payment_status, 'pending'), 'active',
        v_paid, greatest(v_total - v_paid, 0), p_note, v_category, p_category_type
      )
      returning * into v_job;
      exit;
    exception when unique_violation then
      if v_attempt >= 25 then raise; end if;
      -- อีกเครื่องหนึ่งจองเลขนี้ไปพอดี ลองเลขถัดไป
    end;
  end loop;

  if p_items is not null then
    for v_item in select * from jsonb_array_elements(p_items)
    loop
      insert into public.job_items (job_id, item_name, size, quantity, unit, unit_price, total)
      values (
        v_job.id,
        coalesce(v_item->>'item_name', 'รายการ'),
        nullif(v_item->>'size', ''),
        coalesce((v_item->>'quantity')::numeric, 1),
        nullif(v_item->>'unit', ''),
        coalesce((v_item->>'unit_price')::numeric, 0),
        coalesce((v_item->>'total')::numeric, 0)
      );
    end loop;
  end if;

  return v_job;
end $$;
