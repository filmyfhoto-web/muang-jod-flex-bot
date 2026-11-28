-- ย้อนกลับ apply.sql: ลบแถว chatorders ออกจาก app_modules · ลบเฉพาะเมื่อโค้ดยังเป็นรุ่นที่ติดตั้ง (md5 d561ea58239659449ac6c0a312f362b5)
-- ถ้ามีคนแก้โค้ดหลังติดตั้ง จะไม่ลบและแจ้งเตือน (ให้ตรวจก่อนว่าจะลบหรือไม่)
do $do$
declare c text;
begin
  select code into c from app_modules where name = 'chatorders';
  if c is null then
    raise notice 'chatorders: not installed, nothing to remove';
    return;
  end if;
  if md5(c) <> 'd561ea58239659449ac6c0a312f362b5' then
    raise exception 'chatorders: the code was changed after it was installed; not removed';
  end if;
  delete from app_modules where name = 'chatorders';
  raise notice 'chatorders: removed';
end
$do$;
