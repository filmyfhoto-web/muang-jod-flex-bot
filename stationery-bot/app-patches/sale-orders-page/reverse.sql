-- ย้อนกลับ apply.sql: ลบแถว saleorders ออกจาก app_modules · ลบเฉพาะเมื่อโค้ดยังเป็นรุ่นที่รู้จัก (md5 5a8b8f0730e5f4958c07e590e5df5545 · b78b1655aaa4eccd9bc97f9f92ee5ff1 · 6bdd44fa4e6cdd40fffbeb1a5b6bdc3c · 144675bed448432bea634bd6abbc8223 · 9f5e3e414a69ce2f89c2ab0e135af1a1 · 021d0e36d3e31cb66c46c58e62a7ea7e · 9559832beab918cf7261079338771178)
-- ถ้ามีคนแก้โค้ดหลังติดตั้ง จะไม่ลบและแจ้งเตือน (ให้ตรวจก่อนว่าจะลบหรือไม่)
do $do$
declare c text;
begin
  select code into c from app_modules where name = 'saleorders';
  if c is null then
    raise notice 'saleorders: not installed, nothing to remove';
    return;
  end if;
  if md5(c) not in ('5a8b8f0730e5f4958c07e590e5df5545', 'b78b1655aaa4eccd9bc97f9f92ee5ff1', '6bdd44fa4e6cdd40fffbeb1a5b6bdc3c', '144675bed448432bea634bd6abbc8223', '9f5e3e414a69ce2f89c2ab0e135af1a1', '021d0e36d3e31cb66c46c58e62a7ea7e', '9559832beab918cf7261079338771178') then
    raise exception 'saleorders: the code was changed after it was installed; not removed';
  end if;
  delete from app_modules where name = 'saleorders';
  raise notice 'saleorders: removed';
end
$do$;
