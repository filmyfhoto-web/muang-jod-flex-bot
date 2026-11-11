-- ย้อนกลับ 005_sale_order_account.sql: เอาสถานะ 'account' ออก
-- ไม่ทำถ้ายังมีใบสถานะ "ลงบัญชี" อยู่ (ต้องเปลี่ยนเป็นสถานะอื่นก่อน — ไม่แก้ข้อมูลให้เอง)

do $r$
begin
  if exists (select 1 from public.sale_orders where pay_status = 'account') then
    raise exception 'ยังมีใบสถานะลงบัญชีอยู่ ต้องเปลี่ยนสถานะก่อน จึงย้อนกลับได้';
  end if;
end
$r$;

alter table public.sale_orders drop constraint if exists sale_orders_pay_status_check;
alter table public.sale_orders add constraint sale_orders_pay_status_check
  check (pay_status in ('unpaid', 'deposit', 'partial', 'paid'));

do $r2$
declare
  d text := pg_get_functiondef('public.sale_order_save(jsonb)'::regprocedure);
  inserted text := $a$elsif v_pay = 'account' then
    v_paid := 0;
  elsif v_pay in ('deposit', 'partial') then$a$;
  original text := $a$elsif v_pay in ('deposit', 'partial') then$a$;
begin
  if position($a$v_pay = 'account'$a$ in d) = 0 then
    return; -- not in place
  end if;
  execute replace(d, inserted, original);
end
$r2$;
