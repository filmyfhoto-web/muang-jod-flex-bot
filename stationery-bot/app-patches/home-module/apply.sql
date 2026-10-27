-- NATTA GROUP · ติดตั้งโมดูล "ภาพรวม" (overview) แบบปิดไว้ · สร้างจาก make-sql.mjs (อย่าแก้มือ)
-- ต้องรัน db/migrations/002_home_summary.sql ก่อน (โมดูลนี้เรียกฟังก์ชัน home_summary)
insert into app_modules (name, code, seq, enabled)
select 'overview', $ov$/* ===== NATTA GROUP · ภาพรวม (overview, CD 2026-10-27) =====
   หน้าภาพรวมสำหรับมือถือ: ตัวเลขจาก home_summary() (อ่านอย่างเดียว) · การ์ดเลื่อนได้ · สินค้าใกล้หมด · ออเดอร์ล่าสุด.
   ไม่เขียนข้อมูล ไม่ตัดสต็อก และไม่แทนที่หน้าหลัก (home) ของเดิม · ไม่ตั้งเป็นหน้าเริ่มต้น. */
(function(){
  if(ROUTES.some(r=>r.id==='overview')) return
  const hi=ROUTES.findIndex(r=>r.id==='home')
  ROUTES.splice(hi<0?0:hi+1,0,{id:'overview',ic:'📊',name:'ภาพรวม'})
  if(typeof MOB!=='undefined'&&!MOB.includes('overview')){ const mi=MOB.indexOf('home'); MOB.splice(mi<0?0:mi+1,0,'overview') }

  const CSS=`
.ov-wrap{max-width:1180px}
.ov-hello{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px;flex-wrap:wrap}
.ov-hello h3{margin:0;font-size:18px;color:var(--navy);overflow-wrap:anywhere}
.ov-hello p{margin:2px 0 0;color:var(--muted);font-size:13px}
.ov-btn{font:inherit;font-size:14px;font-weight:600;padding:8px 14px;border-radius:999px;border:1px solid var(--line);background:#fff;color:var(--navy);cursor:pointer;min-height:40px}
.ov-hero{background:linear-gradient(135deg,var(--navy),var(--navy2));color:#fff;border-radius:20px;padding:18px 18px 16px;box-shadow:var(--shadow)}
.ov-hero small{opacity:.85;font-size:13px}
.ov-hero b{display:block;font-size:34px;line-height:1.2;margin:4px 0 2px;overflow-wrap:anywhere}
.ov-hero .ov-sub{font-size:13px;opacity:.9}
.ov-acts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:12px 0 4px}
.ov-act{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:12px;font:inherit;font-weight:600;color:var(--navy);cursor:pointer;min-height:56px;box-shadow:var(--shadow);text-align:left}
.ov-ico{width:36px;height:36px;border-radius:50%;background:var(--navy);color:#fff;display:grid;place-items:center;font-size:20px;line-height:1;flex-shrink:0}
.ov-sec{margin:18px 0 8px}
.ov-sec h4{margin:0;font-size:15px;color:var(--navy)}
.ov-cards{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:6px}
.ov-card{flex:0 0 190px;scroll-snap-align:start;display:grid;gap:4px;align-content:start;background:#fff;border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:14px;text-align:left;font:inherit;color:var(--ink);cursor:pointer;min-height:120px}
.ov-card b{font-size:26px;color:var(--navy);line-height:1.2;margin-top:4px;overflow-wrap:anywhere}
.ov-card.warn b{color:var(--amber)}
.ov-lbl{font-size:13px;color:var(--muted)}
.ov-list{background:#fff;border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden}
.ov-row{display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;padding:12px 14px;min-height:56px;border:0;border-top:1px solid var(--line);background:#fff;font:inherit;color:var(--ink);text-align:left;cursor:pointer}
.ov-row:first-child{border-top:0}
.ov-main{min-width:0;flex:1;display:grid;gap:2px}
.ov-who{font-weight:600;overflow-wrap:anywhere}
.ov-meta{font-size:12px;color:var(--muted)}
.ov-side{flex-shrink:0;display:grid;gap:4px;justify-items:end;text-align:right}
.ov-amt{font-weight:700;color:var(--navy);white-space:nowrap}
.ov-chip{display:inline-block;font-size:12px;font-weight:600;padding:2px 9px;border-radius:999px;background:var(--sky);color:var(--navy)}
.ov-chip.warn{background:var(--amberbg);color:var(--amber)}
.ov-chip.ok{background:var(--greenbg);color:var(--green)}
.ov-chip.bad{background:var(--redbg);color:var(--red)}
.ov-empty{text-align:center;color:var(--muted);padding:22px 10px;background:#fff;border:1px dashed var(--line);border-radius:var(--radius);font-size:14px}
.ov-err{color:var(--red);font-weight:600;padding:12px 14px;background:var(--redbg);border-radius:var(--radius)}
@media (min-width:821px){
  .ov-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));overflow:visible}
  .ov-card{flex:initial}
}`
  function css(){ if(document.getElementById('ov-css')) return; const s=document.createElement('style'); s.id='ov-css'; s.textContent=CSS; document.head.appendChild(s) }

  const ST={pending:['รอดำเนินการ','warn'],done:['เสร็จแล้ว','ok'],cancelled:['ยกเลิก','bad']}
  const chip=s=>{ const x=ST[s]||[s||'—','']; return `<span class="ov-chip ${x[1]}">${esc(x[0])}</span>` }
  const greet=()=>{ const h=new Date().getHours(), t=h<12?'สวัสดียามเช้า':h<17?'สวัสดียามบ่าย':'สวัสดียามเย็น', e=(typeof AUTH!=='undefined'&&AUTH&&AUTH.email)||''; return esc(t)+(e?' · '+esc(e.split('@')[0]):'') }
  const dateTh=()=>new Date().toLocaleDateString('th-TH',{weekday:'long',day:'numeric',month:'long',year:'numeric'})
  const card=(to,lbl,val,sub,warn)=>`<button type="button" class="ov-card${warn?' warn':''}" data-go="${to}"><span class="ov-lbl">${esc(lbl)}</span><b>${val}</b><span class="ov-lbl">${esc(sub)}</span></button>`
  const row=(to,main,side)=>`<button type="button" class="ov-row" data-go="${to}">${main}${side}</button>`

  function body(d){
    const m=d.month||{orders:0,amount:0}, t=d.today||{orders:0,amount:0}, pos=d.pos_month||{sales:0,amount:0}
    const low=d.low_stock_items||[], rec=d.recent_orders||[]
    const cards=[
      card('weborders','ออเดอร์รอดำเนินการ',num(d.pending_orders),'กดเพื่อดูคำสั่งซื้อ',(d.pending_orders||0)>0),
      card('weborders','ใบจัดของยังไม่เก็บ',num(d.unarchived_slips),'คำสั่งซื้อจากหน้าเว็บ',false),
      card('stock','สินค้าใกล้หมด',num(d.low_stock),'ถึงจุดสั่งซื้อแล้ว',(d.low_stock||0)>0),
      card('pos','ขายหน้าร้านเดือนนี้',baht(pos.amount),num(pos.sales)+' รายการ',false),
      d.chat_open==null?'':card('chatorders','รอตรวจจากแชท',num(d.chat_open),'ร่างจาก LINE',(d.chat_open||0)>0)
    ].join('')
    const lowRows=low.length
      ? `<div class="ov-list">${low.map(p=>row('stock',`<span class="ov-main"><span class="ov-who">${esc(p.name)}</span><span class="ov-meta">จุดสั่งซื้อ ${num(p.reorder_point)} ${esc(p.unit||'')}</span></span>`,`<span class="ov-amt">${num(p.stock_qty)} ${esc(p.unit||'')}</span>`)).join('')}</div>`
      : `<div class="ov-empty">ไม่มีสินค้าที่ถึงจุดสั่งซื้อ</div>`
    const recRows=rec.length
      ? `<div class="ov-list">${rec.map(o=>row('weborders',`<span class="ov-main"><span class="ov-who">${esc(o.who)}</span><span class="ov-meta">${esc(o.order_no||'')} · ${esc(fmtDate(o.created_at))}</span></span>`,`<span class="ov-side"><span class="ov-amt">${baht(o.total)}</span>${chip(o.status)}</span>`)).join('')}</div>`
      : `<div class="ov-empty">ยังไม่มีออเดอร์</div>`
    return `<div class="ov-wrap">
      <div class="ov-hello"><div><h3>${greet()}</h3><p>${esc(dateTh())}</p></div><button type="button" class="ov-btn" id="ov-refresh">↻ รีเฟรช</button></div>
      <section class="ov-hero" aria-label="ยอดออเดอร์เดือนนี้"><small>ยอดออเดอร์เดือนนี้</small><b>${baht(m.amount)}</b><div class="ov-sub">${num(m.orders)} ออเดอร์ · วันนี้ ${num(t.orders)} ออเดอร์ (${baht(t.amount)})</div></section>
      <div class="ov-acts">
        <button type="button" class="ov-act" data-go="pos"><span class="ov-ico">+</span><span>ขายหน้าร้าน</span></button>
        <button type="button" class="ov-act" data-go="weborders"><span class="ov-ico">⇄</span><span>ใบจัดของ</span></button>
      </div>
      <div class="ov-sec"><h4>ภาพรวมการทำงาน</h4></div>
      <div class="ov-cards">${cards}</div>
      <div class="ov-sec"><h4>สินค้าใกล้หมด</h4></div>
      ${lowRows}
      <div class="ov-sec"><h4>ออเดอร์ล่าสุด</h4></div>
      ${recRows}
    </div>`
  }

  async function load(){
    const { data, error } = await sb.rpc('home_summary')
    if(error) throw error
    return data||{}
  }
  function onClick(e){
    if(e.target.closest('#ov-refresh')) return VIEWS.overview()
    const b=e.target.closest('[data-go]'); if(b) go(b.dataset.go)
  }
  function paintInto(box,html){ box.innerHTML=html; box.querySelector('.ov-wrap').addEventListener('click',onClick) }
  VIEWS.overview=function(){
    css()
    const box=$('#view')
    paintInto(box,'<div class="ov-wrap"><div class="ov-empty">กำลังโหลดภาพรวม…</div></div>')
    load().then(d=>paintInto(box,body(d))).catch(e=>{
      const msg=String((e&&e.message)||e||'')
      const hint=/home_summary/.test(msg)?'ยังไม่ได้ติดตั้งฟังก์ชัน home_summary (migration 002)':'โหลดภาพรวมไม่ได้ ลองกดรีเฟรช'
      paintInto(box,`<div class="ov-wrap"><div class="ov-err">${esc(hint)}</div><p class="ov-meta">${esc(msg)}</p><button type="button" class="ov-btn" id="ov-refresh">↻ รีเฟรช</button></div>`)
    })
  }
})()
$ov$, 66, false
where not exists (select 1 from app_modules where name = 'overview');
