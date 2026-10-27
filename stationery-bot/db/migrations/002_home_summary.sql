-- NATTA GROUP · ภาพรวมบนมือถือ (002) — ฟังก์ชันอ่านอย่างเดียว ไม่เขียนข้อมูล ไม่ตัดสต็อก
-- home_summary() ให้ตัวเลขของหน้า "ภาพรวม" (โมดูล overview) ในหน้าหลังร้าน
-- security invoker: ใช้สิทธิ์และ RLS ของผู้ใช้ที่ล็อกอิน ไม่ยกสิทธิ์ · การ์ดร่างจากแชทเป็น null ถ้ายังไม่ได้ติดตั้ง 001
-- ไม่แตะตาราง ฟังก์ชัน หรือโมดูลเดิม

create or replace function public.home_summary()
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'public'
as $fn$
declare
  v_day   timestamptz := date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok';
  v_month timestamptz := date_trunc('month', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok';
  v_chat  int;
begin
  if to_regclass('public.chat_drafts') is not null then
    execute $q$ select count(*)::int from public.chat_drafts where status = 'open' $q$ into v_chat;
  end if;

  return jsonb_build_object(
    'today', (select jsonb_build_object('orders', count(*), 'amount', coalesce(sum(total), 0))
              from public.orders where created_at >= v_day and status <> 'cancelled'),
    'month', (select jsonb_build_object('orders', count(*), 'amount', coalesce(sum(total), 0))
              from public.orders where created_at >= v_month and status <> 'cancelled'),
    'pending_orders', (select count(*) from public.orders where status = 'pending'),
    'unarchived_slips', (select count(*) from public.pick_slips where archived_at is null),
    'pos_month', (select jsonb_build_object('sales', count(*), 'amount', coalesce(sum(total), 0))
                  from public.sales where created_at >= v_month and cancelled_at is null),
    'low_stock', (select count(*) from public.products
                  where reorder_point is not null and stock_qty <= reorder_point and coalesce(type, '') <> 'งานบริการ'),
    'low_stock_items', coalesce((select jsonb_agg(x) from (
                  select id, name, unit, stock_qty, reorder_point from public.products
                  where reorder_point is not null and stock_qty <= reorder_point and coalesce(type, '') <> 'งานบริการ'
                  order by stock_qty - reorder_point, name limit 5) x), '[]'::jsonb),
    'recent_orders', coalesce((select jsonb_agg(x) from (
                  select id, order_no, coalesce(nullif(orderer_name, ''), nullif(school_name, ''), '—') as who,
                         total, status, created_at
                  from public.orders order by created_at desc limit 5) x), '[]'::jsonb),
    'chat_open', v_chat
  );
end
$fn$;

revoke all on function public.home_summary() from public, anon;
grant execute on function public.home_summary() to authenticated;
