-- หน้า "แชตและออเดอร์" · รุ่น 5: สถานะการชำระเงิน "ลงบัญชี" (ลูกค้าชำระทีหลัง · ยังไม่ได้รับเงิน)
--
-- · sale_orders.pay_status ยอมรับค่า 'account' เพิ่ม (เดิม: unpaid · deposit · partial · paid) · แถวเดิมไม่เปลี่ยน
-- · sale_order_save: เพิ่มกรณี 'account' = ยังไม่ได้รับเงิน (paid_amount = 0) · ส่วนอื่นของฟังก์ชันไม่เปลี่ยน
--   แก้โดยแทรกกรณีเดียวลงในข้อความของฟังก์ชันที่ติดตั้งอยู่ ถ้าข้อความไม่ตรงตามที่คาด จะหยุดโดยไม่แก้อะไร
-- ใช้กับโปรเจกต์ Supabase ของร้าน (mamlmgixovlwnjstetkj) หลังเจ้าของอนุมัติเท่านั้น · ย้อนกลับ: 005_sale_order_account.reverse.sql
-- ต้องมี 002 ก่อน · ทดสอบบน PostgreSQL จริง (PGlite): db/test/sale-order-account.test.js · ใช้ซ้ำได้

alter table public.sale_orders drop constraint if exists sale_orders_pay_status_check;
alter table public.sale_orders add constraint sale_orders_pay_status_check
  check (pay_status in ('unpaid', 'deposit', 'partial', 'paid', 'account'));

do $mig$
declare
  d text := pg_get_functiondef('public.sale_order_save(jsonb)'::regprocedure);
  anchor text := $a$elsif v_pay in ('deposit', 'partial') then$a$;
  inserted text := $a$elsif v_pay = 'account' then
    v_paid := 0;
  elsif v_pay in ('deposit', 'partial') then$a$;
  hits int;
begin
  if position($a$v_pay = 'account'$a$ in d) > 0 then
    return; -- already in place
  end if;
  hits := (length(d) - length(replace(d, anchor, ''))) / length(anchor);
  if hits <> 1 then
    raise exception 'sale_order_save: the payment branch was found % times, expected once; not changed', hits;
  end if;
  execute replace(d, anchor, inserted);
end
$mig$;
