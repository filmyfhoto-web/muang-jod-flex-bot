-- ============================================================
-- ม่วงจด — job categories (two levels: group + type)
-- Safe to run repeatedly.
-- ============================================================

alter table public.jobs add column if not exists category      text;
alter table public.jobs add column if not exists category_type text;

-- Reports and the dashboard group by these, always within one user.
create index if not exists jobs_user_category_idx on public.jobs (user_id, category);
create index if not exists jobs_user_date_category_idx on public.jobs (user_id, job_date, category);

-- Backfill existing rows from their job_name so old jobs still chart.
update public.jobs set category = 'sign', category_type = 'vinyl'
  where category is null and job_name ilike '%ไวนิล%';
update public.jobs set category = 'sign', category_type = 'foamboard'
  where category is null and (job_name ilike '%โฟมบอร์ด%' or job_name ilike '%ฟิวเจอร์บอร์ด%');
update public.jobs set category = 'sign', category_type = 'sticker'
  where category is null and (job_name ilike '%สติกเกอร์%' or job_name ilike '%สติ๊กเกอร์%' or job_name ilike '%ฉลาก%');
update public.jobs set category = 'sign', category_type = 'standee'
  where category is null and job_name ilike '%ป้าย%';
update public.jobs set category = 'print', category_type = 'copy'
  where category is null and job_name ilike '%ถ่ายเอกสาร%';
update public.jobs set category = 'print', category_type = 'print'
  where category is null and (job_name ilike '%พิมพ์%' or job_name ilike '%ปริ้น%');
update public.jobs set category = 'design', category_type = 'artwork'
  where category is null and (job_name ilike '%ออกแบบ%' or job_name ilike '%โลโก้%');
update public.jobs set category = 'food', category_type = 'food'
  where category is null and (job_name ilike '%กาแฟ%' or job_name ilike '%อาหาร%');
update public.jobs set category = 'other' where category is null;
