-- ย้อนกลับ apply.sql: ลบแถว saleorders ออกจาก app_modules · ลบเฉพาะเมื่อโค้ดยังเป็นรุ่นที่ติดตั้ง (md5 9559832beab918cf7261079338771178)
-- ถ้ามีคนแก้โค้ดหลังติดตั้ง จะไม่ลบและแจ้งเตือน (ให้ตรวจก่อนว่าจะลบหรือไม่)
do $do$
declare c text;
begin
  select code into c from app_modules where name = 'saleorders';
  if c is null then
    raise notice 'saleorders: not installed, nothing to remove';
    return;
  end if;
  if md5(c) <> '9559832beab918cf7261079338771178' then
    raise exception 'saleorders: the code was changed after it was installed; not removed';
  end if;
  delete from app_modules where name = 'saleorders';
  raise notice 'saleorders: removed';
end
$do$;
