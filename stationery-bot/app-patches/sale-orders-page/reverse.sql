-- ย้อนกลับ apply.sql: ลบแถว saleorders ออกจาก app_modules · ลบเฉพาะเมื่อโค้ดยังเป็นรุ่นที่รู้จัก (md5 5f839f81e02795e4fef24c252f1d03a1 · 70a1a2dba93ccb8a886cff5b2a427e80 · 7fdbca68a1d462f83410a8e70db67f80 · 787ac08bc3127734a790ad819b602829 · 94897ce42e38bd38939f63072feb4b96 · 00d486ee6556e47e95203879d4f96360 · 6750d33a90a9c62659d82deef4168205 · 5a8b8f0730e5f4958c07e590e5df5545 · b78b1655aaa4eccd9bc97f9f92ee5ff1 · 6bdd44fa4e6cdd40fffbeb1a5b6bdc3c · 144675bed448432bea634bd6abbc8223 · 9f5e3e414a69ce2f89c2ab0e135af1a1 · 021d0e36d3e31cb66c46c58e62a7ea7e · 9559832beab918cf7261079338771178)
-- ถ้ามีคนแก้โค้ดหลังติดตั้ง จะไม่ลบและแจ้งเตือน (ให้ตรวจก่อนว่าจะลบหรือไม่)
do $do$
declare c text;
begin
  select code into c from app_modules where name = 'saleorders';
  if c is null then
    raise notice 'saleorders: not installed, nothing to remove';
    return;
  end if;
  if md5(c) not in ('5f839f81e02795e4fef24c252f1d03a1', '70a1a2dba93ccb8a886cff5b2a427e80', '7fdbca68a1d462f83410a8e70db67f80', '787ac08bc3127734a790ad819b602829', '94897ce42e38bd38939f63072feb4b96', '00d486ee6556e47e95203879d4f96360', '6750d33a90a9c62659d82deef4168205', '5a8b8f0730e5f4958c07e590e5df5545', 'b78b1655aaa4eccd9bc97f9f92ee5ff1', '6bdd44fa4e6cdd40fffbeb1a5b6bdc3c', '144675bed448432bea634bd6abbc8223', '9f5e3e414a69ce2f89c2ab0e135af1a1', '021d0e36d3e31cb66c46c58e62a7ea7e', '9559832beab918cf7261079338771178') then
    raise exception 'saleorders: the code was changed after it was installed; not removed';
  end if;
  delete from app_modules where name = 'saleorders';
  raise notice 'saleorders: removed';
end
$do$;
