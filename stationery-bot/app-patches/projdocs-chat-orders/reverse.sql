-- Takes the chat-orders changes back out of the module `projdocs` (app_modules). Every piece must occur exactly once,
-- otherwise nothing is changed. After it the module is byte-for-byte the live copy md5 2bcd643224cf521798b2a4da679b5c06 (if nobody changed it since).
do $do$
declare c text;
begin
  select code into c from app_modules where name = 'projdocs' for update;
  if c is null then raise exception 'module projdocs not found'; end if;
  if position('(EH 2026-10-26)' in c) = 0 then raise notice 'not applied'; return; end if;
    if (length(c) - length(replace(c, $q$        if(r.origin==='chat'&&r.updated_at){try{const{data:cur}=await sb.from('project_docs').select('updated_at').eq('id',r.id).maybeSingle();if(cur&&cur.updated_at&&Date.parse(cur.updated_at)!==Date.parse(r.updated_at)){toast('ใบนี้เพิ่งมีการเปลี่ยนแปลง (เช่น ลูกค้าส่งรายการเพิ่มทางแชท) — ปิดแล้วเปิดใหม่เพื่อดูรายการล่าสุดก่อนบันทึก','err',8000);return}}catch(e){}}
        const btn=document.querySelector('.modal-f .green');if(btn){btn.disabled=true;btn.textContent='กำลังบันทึก…'}
        const {error}=await sb.from('project_docs').update(patch).eq('id',r.id)
$q$, '')) <> length($q$        if(r.origin==='chat'&&r.updated_at){try{const{data:cur}=await sb.from('project_docs').select('updated_at').eq('id',r.id).maybeSingle();if(cur&&cur.updated_at&&Date.parse(cur.updated_at)!==Date.parse(r.updated_at)){toast('ใบนี้เพิ่งมีการเปลี่ยนแปลง (เช่น ลูกค้าส่งรายการเพิ่มทางแชท) — ปิดแล้วเปิดใหม่เพื่อดูรายการล่าสุดก่อนบันทึก','err',8000);return}}catch(e){}}
        const btn=document.querySelector('.modal-f .green');if(btn){btn.disabled=true;btn.textContent='กำลังบันทึก…'}
        const {error}=await sb.from('project_docs').update(patch).eq('id',r.id)
$q$) * 1) then raise exception 'anchor not found exactly once: P10 save guard'; end if;
    if (length(c) - length(replace(c, $q$  // (EH) ลิงก์จากการ์ด LINE ของบอท https://admin.nattagroup.com/?doc=PJ-0123#projdocs → เปิดเอกสารนั้นเลย (ครั้งเดียว แล้วเอา ?doc ออกจากที่อยู่)
  function pdDeep(){
    try{
      const no=new URLSearchParams(location.search).get('doc')
      if(!no||P.deep===no||!P.loaded||P.err)return
      P.deep=no
      history.replaceState(null,'',location.pathname+location.hash)
      const r=P.rows.find(x=>x.doc_no===no)
      if(r)openDoc(r.id);else toast('ไม่พบเอกสาร '+no,'err',5000)
    }catch(e){}
  }
  async function signed(paths){$q$, '')) <> length($q$  // (EH) ลิงก์จากการ์ด LINE ของบอท https://admin.nattagroup.com/?doc=PJ-0123#projdocs → เปิดเอกสารนั้นเลย (ครั้งเดียว แล้วเอา ?doc ออกจากที่อยู่)
  function pdDeep(){
    try{
      const no=new URLSearchParams(location.search).get('doc')
      if(!no||P.deep===no||!P.loaded||P.err)return
      P.deep=no
      history.replaceState(null,'',location.pathname+location.hash)
      const r=P.rows.find(x=>x.doc_no===no)
      if(r)openDoc(r.id);else toast('ไม่พบเอกสาร '+no,'err',5000)
    }catch(e){}
  }
  async function signed(paths){$q$) * 1) then raise exception 'anchor not found exactly once: P9 deep link fn'; end if;
    if (length(c) - length(replace(c, $q$P.loaded=true;paint();pdDeep()
$q$, '')) <> length($q$P.loaded=true;paint();pdDeep()
$q$) * 1) then raise exception 'anchor not found exactly once: P8 load calls deep link'; end if;
    if (length(c) - length(replace(c, $q$.pd-ir .nm small.cu{color:#B25E00;font-weight:600}
.pd-ir .nm small.rv{color:#B42318}
.pd-ir .nm small .rvh{color:#B25E00;font-weight:600}$q$, '')) <> length($q$.pd-ir .nm small.cu{color:#B25E00;font-weight:600}
.pd-ir .nm small.rv{color:#B42318}
.pd-ir .nm small .rvh{color:#B25E00;font-weight:600}$q$) * 1) then raise exception 'anchor not found exactly once: P7b css label'; end if;
    if (length(c) - length(replace(c, $q$.pd-shop{font-size:11px;border-radius:999px;padding:1px 8px;background:rgba(18,51,95,.08);color:var(--navy,#12335F);font-weight:600;white-space:nowrap;margin-left:4px}
.pd-chat{background:#E7F3EB;color:#1E6F3C}$q$, '')) <> length($q$.pd-shop{font-size:11px;border-radius:999px;padding:1px 8px;background:rgba(18,51,95,.08);color:var(--navy,#12335F);font-weight:600;white-space:nowrap;margin-left:4px}
.pd-chat{background:#E7F3EB;color:#1E6F3C}$q$) * 1) then raise exception 'anchor not found exactly once: P7a css tag'; end if;
    if (length(c) - length(replace(c, $q$${sub}${x.said?' · ลูกค้าพิมพ์ “'+esc(x.said)+'”':''}${x.review&&x.hint?' · <span class="rvh">⚠️ '+esc(x.hint)+'</span>':''}</small>`:(x.review?'<small class="cu rv">⚠️ รอตรวจสอบสินค้า'+(x.hint?' · '+esc(x.hint):'')+'</small>':'<small class="cu">ครูพิมพ์เอง · ไม่มีในร้าน</small>')}$q$, '')) <> length($q$${sub}${x.said?' · ลูกค้าพิมพ์ “'+esc(x.said)+'”':''}${x.review&&x.hint?' · <span class="rvh">⚠️ '+esc(x.hint)+'</span>':''}</small>`:(x.review?'<small class="cu rv">⚠️ รอตรวจสอบสินค้า'+(x.hint?' · '+esc(x.hint):'')+'</small>':'<small class="cu">ครูพิมพ์เอง · ไม่มีในร้าน</small>')}$q$) * 1) then raise exception 'anchor not found exactly once: P6 item label'; end if;
    if (length(c) - length(replace(c, $q$' · '+money(r.items_total)+' บาท':''}${rv?' · รอตรวจสอบสินค้า '+num(rv):''}</span>`}$q$, '')) <> length($q$' · '+money(r.items_total)+' บาท':''}${rv?' · รอตรวจสอบสินค้า '+num(rv):''}</span>`}$q$) * 1) then raise exception 'anchor not found exactly once: P5 badge text'; end if;
    if (length(c) - length(replace(c, $q$const wait=L.filter(x=>x.price==null).length,rv=L.filter(x=>x.review).length
$q$, '')) <> length($q$const wait=L.filter(x=>x.price==null).length,rv=L.filter(x=>x.review).length
$q$) * 1) then raise exception 'anchor not found exactly once: P4 badge count'; end if;
    if (length(c) - length(replace(c, $q$${(r.origin==='shop'||r.origin==='chat')&&!r.file_count?'':$q$, '')) <> length($q$${(r.origin==='shop'||r.origin==='chat')&&!r.file_count?'':$q$) * 1) then raise exception 'anchor not found exactly once: P3 no 0 files'; end if;
    if (length(c) - length(replace(c, $q$<span>${r.origin==='shop'?'สร้าง':r.origin==='chat'?'สั่ง':'ส่ง'} ${esc(dShort(docT(r)))}</span>$q$, '')) <> length($q$<span>${r.origin==='shop'?'สร้าง':r.origin==='chat'?'สั่ง':'ส่ง'} ${esc(dShort(docT(r)))}</span>$q$) * 1) then raise exception 'anchor not found exactly once: P2 card word'; end if;
    if (length(c) - length(replace(c, $q$${r.origin==='shop'?'<span class="pd-shop">ร้านสร้าง</span>':r.origin==='chat'?'<span class="pd-shop pd-chat">สั่งทางแชท</span>':''}$q$, '')) <> length($q$${r.origin==='shop'?'<span class="pd-shop">ร้านสร้าง</span>':r.origin==='chat'?'<span class="pd-shop pd-chat">สั่งทางแชท</span>':''}$q$) * 1) then raise exception 'anchor not found exactly once: P1 card tag'; end if;
    if (length(c) - length(replace(c, $q$/* (EH 2026-10-26) ออเดอร์ที่ลูกค้าพิมพ์ในแชท LINE → บอท (Render) สร้างเป็นเอกสารโครงการเอง (origin='chat' · สถานะ ใหม่ · ไม่ใส่ราคา ไม่ตัดสต็อก)
   รายการที่ไม่ตรงสินค้าในร้านมี review:true → ป้าย “รอตรวจสอบสินค้า” · ลิงก์จากการ์ด LINE ?doc=PJ-xxxx เปิดเอกสารนั้นเลย
   ใบที่บอทสร้าง: ถ้าลูกค้าส่งรายการเพิ่มระหว่างที่เปิดค้างอยู่ จะไม่ให้บันทึกทับ (ต้องเปิดใหม่) */
(function(){
  if(!ROUTES.some(r=>r.id==='projdocs')){$q$, '')) <> length($q$/* (EH 2026-10-26) ออเดอร์ที่ลูกค้าพิมพ์ในแชท LINE → บอท (Render) สร้างเป็นเอกสารโครงการเอง (origin='chat' · สถานะ ใหม่ · ไม่ใส่ราคา ไม่ตัดสต็อก)
   รายการที่ไม่ตรงสินค้าในร้านมี review:true → ป้าย “รอตรวจสอบสินค้า” · ลิงก์จากการ์ด LINE ?doc=PJ-xxxx เปิดเอกสารนั้นเลย
   ใบที่บอทสร้าง: ถ้าลูกค้าส่งรายการเพิ่มระหว่างที่เปิดค้างอยู่ จะไม่ให้บันทึกทับ (ต้องเปิดใหม่) */
(function(){
  if(!ROUTES.some(r=>r.id==='projdocs')){$q$) * 1) then raise exception 'anchor not found exactly once: P0 header note'; end if;
  update app_modules set code = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(code, $q$        if(r.origin==='chat'&&r.updated_at){try{const{data:cur}=await sb.from('project_docs').select('updated_at').eq('id',r.id).maybeSingle();if(cur&&cur.updated_at&&Date.parse(cur.updated_at)!==Date.parse(r.updated_at)){toast('ใบนี้เพิ่งมีการเปลี่ยนแปลง (เช่น ลูกค้าส่งรายการเพิ่มทางแชท) — ปิดแล้วเปิดใหม่เพื่อดูรายการล่าสุดก่อนบันทึก','err',8000);return}}catch(e){}}
        const btn=document.querySelector('.modal-f .green');if(btn){btn.disabled=true;btn.textContent='กำลังบันทึก…'}
        const {error}=await sb.from('project_docs').update(patch).eq('id',r.id)
$q$, $q$        const btn=document.querySelector('.modal-f .green');if(btn){btn.disabled=true;btn.textContent='กำลังบันทึก…'}
        const {error}=await sb.from('project_docs').update(patch).eq('id',r.id)
$q$), $q$  // (EH) ลิงก์จากการ์ด LINE ของบอท https://admin.nattagroup.com/?doc=PJ-0123#projdocs → เปิดเอกสารนั้นเลย (ครั้งเดียว แล้วเอา ?doc ออกจากที่อยู่)
  function pdDeep(){
    try{
      const no=new URLSearchParams(location.search).get('doc')
      if(!no||P.deep===no||!P.loaded||P.err)return
      P.deep=no
      history.replaceState(null,'',location.pathname+location.hash)
      const r=P.rows.find(x=>x.doc_no===no)
      if(r)openDoc(r.id);else toast('ไม่พบเอกสาร '+no,'err',5000)
    }catch(e){}
  }
  async function signed(paths){$q$, $q$  async function signed(paths){$q$), $q$P.loaded=true;paint();pdDeep()
$q$, $q$P.loaded=true;paint()
$q$), $q$.pd-ir .nm small.cu{color:#B25E00;font-weight:600}
.pd-ir .nm small.rv{color:#B42318}
.pd-ir .nm small .rvh{color:#B25E00;font-weight:600}$q$, $q$.pd-ir .nm small.cu{color:#B25E00;font-weight:600}$q$), $q$.pd-shop{font-size:11px;border-radius:999px;padding:1px 8px;background:rgba(18,51,95,.08);color:var(--navy,#12335F);font-weight:600;white-space:nowrap;margin-left:4px}
.pd-chat{background:#E7F3EB;color:#1E6F3C}$q$, $q$.pd-shop{font-size:11px;border-radius:999px;padding:1px 8px;background:rgba(18,51,95,.08);color:var(--navy,#12335F);font-weight:600;white-space:nowrap;margin-left:4px}$q$), $q$${sub}${x.said?' · ลูกค้าพิมพ์ “'+esc(x.said)+'”':''}${x.review&&x.hint?' · <span class="rvh">⚠️ '+esc(x.hint)+'</span>':''}</small>`:(x.review?'<small class="cu rv">⚠️ รอตรวจสอบสินค้า'+(x.hint?' · '+esc(x.hint):'')+'</small>':'<small class="cu">ครูพิมพ์เอง · ไม่มีในร้าน</small>')}$q$, $q$${sub}</small>`:'<small class="cu">ครูพิมพ์เอง · ไม่มีในร้าน</small>'}$q$), $q$' · '+money(r.items_total)+' บาท':''}${rv?' · รอตรวจสอบสินค้า '+num(rv):''}</span>`}$q$, $q$' · '+money(r.items_total)+' บาท':''}</span>`}$q$), $q$const wait=L.filter(x=>x.price==null).length,rv=L.filter(x=>x.review).length
$q$, $q$const wait=L.filter(x=>x.price==null).length
$q$), $q$${(r.origin==='shop'||r.origin==='chat')&&!r.file_count?'':$q$, $q$${r.origin==='shop'&&!r.file_count?'':$q$), $q$<span>${r.origin==='shop'?'สร้าง':r.origin==='chat'?'สั่ง':'ส่ง'} ${esc(dShort(docT(r)))}</span>$q$, $q$<span>${r.origin==='shop'?'สร้าง':'ส่ง'} ${esc(dShort(docT(r)))}</span>$q$), $q$${r.origin==='shop'?'<span class="pd-shop">ร้านสร้าง</span>':r.origin==='chat'?'<span class="pd-shop pd-chat">สั่งทางแชท</span>':''}$q$, $q$${r.origin==='shop'?'<span class="pd-shop">ร้านสร้าง</span>':''}$q$), $q$/* (EH 2026-10-26) ออเดอร์ที่ลูกค้าพิมพ์ในแชท LINE → บอท (Render) สร้างเป็นเอกสารโครงการเอง (origin='chat' · สถานะ ใหม่ · ไม่ใส่ราคา ไม่ตัดสต็อก)
   รายการที่ไม่ตรงสินค้าในร้านมี review:true → ป้าย “รอตรวจสอบสินค้า” · ลิงก์จากการ์ด LINE ?doc=PJ-xxxx เปิดเอกสารนั้นเลย
   ใบที่บอทสร้าง: ถ้าลูกค้าส่งรายการเพิ่มระหว่างที่เปิดค้างอยู่ จะไม่ให้บันทึกทับ (ต้องเปิดใหม่) */
(function(){
  if(!ROUTES.some(r=>r.id==='projdocs')){$q$, $q$(function(){
  if(!ROUTES.some(r=>r.id==='projdocs')){$q$), updated_at = now() where name = 'projdocs';
end $do$;
