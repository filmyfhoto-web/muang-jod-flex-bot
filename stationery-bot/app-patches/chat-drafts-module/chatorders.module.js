/* ===== NATTA GROUP · ออเดอร์จากแชท (CD 2026-10-27) =====
   ร่างที่บอทบันทึกจากข้อความ LINE ของลูกค้า (chat_drafts) หรือที่พนักงานวางเอง (chat_draft_manual) ·
   พนักงานตรวจ แก้จำนวน หน่วย ราคา ผูกสินค้า แล้วยืนยันเป็นคำสั่งซื้อ NT-… (chat_draft_confirm) ·
   พิมพ์ใบจัดของด้วยหน้า “คำสั่งซื้อจากหน้าเว็บ” เดิม (window.NattaWO) · ขายผ่าน POS ได้ครั้งเดียว (chat_draft_pos).
   ทุกการเขียนผ่านฟังก์ชันฐานข้อมูล · หน้านี้ไม่ตัดสต็อกเอง และไม่ส่งข้อความถึงลูกค้า */
(function(){
  if(ROUTES.some(r=>r.id==='chatorders')) return
  const di=ROUTES.findIndex(r=>r.id==='projdocs')
  ROUTES.splice(di<0?ROUTES.length:di+1,0,{id:'chatorders',ic:'💬',name:'ออเดอร์จากแชท'})
  if(typeof MOB!=='undefined'&&!MOB.includes('chatorders')){ const mi=MOB.indexOf('docs'); MOB.splice(mi<0?MOB.length:mi+1,0,'chatorders') }

  // ---- กติกาการอ่านข้อความ: คัดลอกจาก stationery-bot/src/picklist.js และ src/orders/draft.js (ต้องแก้ทั้งสองที่พร้อมกัน) ----
  const UNIT_ALIAS={'แพค':'แพ็ค','แพ็ก':'แพ็ค','แพก':'แพ็ค','แพ๊ค':'แพ็ค','แกลอน':'แกลลอน','กป':'กระป๋อง','กล.':'กล่อง','ม.':'เมตร'}
  const UNITS='อัน|ชิ้น|ด้าม|แท่ง|กล่อง|ห่อ|แพ็ค|แพค|แพ็ก|แพก|แพ๊ค|โหล|ลัง|รีม|เล่ม|แผ่น|ม้วน|ขวด|แกลลอน|แกลอน|ถุง|ชุด|ตัว|ใบ|คู่|กระป๋อง|กป|ซอง|ก้อน|หลอด|เส้น|เมตร|หลา|ถัง|แผง|ลูก|ผืน|ตลับ|กระปุก|คัน|หัว|ลูกบาศก์|ม\\.'
  const RE_TAIL=new RegExp('^(.*?[^\\d\\s])\\s*(\\d+(?:[.,]\\d+)?)\\s*('+UNITS+')?\\s*$')
  const RE_HEAD=new RegExp('^(\\d+(?:[.,]\\d+)?)\\s*('+UNITS+')?\\s+(.+)$')
  const ASK=/(^|\s)(ขอ|เอา|สั่ง|ซื้อ|อยาก|ต้องการ|รบกวน)(?=\s|[0-9๐-๙]|$)/gm
  const NOTE_RE=/(วันที่|ฝาก|ประมาณ|รบกวน|ขอบคุณ|โทร|เบอร์|ราคา|ยอด|โอน|บาท|ส่งของ|มารับ|แวะ)/
  const THAI0='๐๑๒๓๔๕๖๗๘๙'
  const digits=s=>String(s==null?'':s).replace(/[๐-๙]/g,d=>String(THAI0.indexOf(d)))
  const keyOf=s=>digits(s).toLowerCase().replace(/[\s​ ]+/g,'')
  const normUnit=u=>{const s=String(u||'').trim().replace(/[.]+$/,'');return UNIT_ALIAS[s]||UNIT_ALIAS[s+'.']||s}
  function parsePasted(text){
    const out=[]
    for(const raw of String(text||'').split(/\r?\n/)){
      const s=digits(raw).replace(/^\s*(?:[-–•*·▪●○◦✓✔☑>]+|\d{1,2}[.)])\s*/,'').replace(ASK,'$1').replace(/\s+/g,' ').trim()
      if(!s||!/\d/.test(s)||NOTE_RE.test(s)) continue
      let m=s.match(RE_TAIL), name, qty, unit
      if(m){ name=m[1]; qty=m[2]; unit=m[3] }
      else if((m=s.match(RE_HEAD))){ qty=m[1]; unit=m[2]; name=m[3] }
      else continue
      name=name.replace(/[\s=:：＝\-–]+$/,'').replace(/^[\s=:：＝\-–]+/,'').replace(/\s+[x×X*]$/,'').trim()
      const q=Number(String(qty).replace(',','.'))
      if(!/[ก-๙A-Za-z]/.test(name)||!(q>0)||q>100000) continue
      out.push({name,qty:q,unit:normUnit(unit||''),raw:raw.trim()})
    }
    return out
  }

  // ---- ร่าง: ไม่มีรายการ / ไม่มีชื่อ / ยังมีรายการรอตรวจ / ยังไม่มีราคา ----
  const ISSUE_TEXT={name:'ยังไม่มีชื่อลูกค้า',empty:'ยังไม่มีรายการ',review:'รอตรวจสินค้า',price:'ยังไม่มีราคา',qty:'จำนวนไม่ถูก'}
  const lineIssue=x=>{
    if(x.removed) return null
    if(!x.product_id&&!x.staff_ok) return 'review'
    const p=x.price!=null&&x.price!==''?Number(x.price):(x.product_price!=null?Number(x.product_price):null)
    if(p==null) return 'price'
    if(!(Number(x.qty)>0)) return 'qty'
    return null
  }
  const draftIssues=d=>{
    const out=[]
    if(!String(d.customer_name||'').trim()) out.push('name')
    const L=(d.items||[]).filter(x=>!x.removed)
    if(!L.length) out.push('empty')
    L.forEach(x=>{const i=lineIssue(x); if(i&&!out.includes(i)) out.push(i)})
    return out
  }
  const TAB_OF=d=>d.status==='confirmed'?'done':d.status==='cancelled'?'off':(draftIssues(d).length?'todo':'ready')
  const TABS=[{id:'todo',t:'รอตรวจ'},{id:'ready',t:'พร้อมยืนยัน'},{id:'done',t:'ยืนยันแล้ว'},{id:'off',t:'ยกเลิก'}]
  const ST={open:['เปิดอยู่','warn'],confirmed:['ยืนยันแล้ว','ok'],cancelled:['ยกเลิก','bad']}
  const EV={created:'สร้างร่าง',merged:'ต่อรายการจากแชท',note:'ข้อความเพิ่มเติม',photo:'รูปจากลูกค้า',edited:'แก้ไขโดยพนักงาน',confirmed:'ยืนยันเป็นออเดอร์',pos_sold:'ขายผ่าน POS',cancelled:'ยกเลิกร่าง',ack_sent:'แจ้งลูกค้าแล้ว',ack_refused:'ลูกค้าไม่รับข้อความ'}
  const OA={main:'OA หลัก',manual:'พิมพ์เอง'}
  const oaName=k=>OA[k]||('OA '+k)
  const METHODS=['เงินสด','โอนเงิน','บัตร/QR']
  const LIST_COLS='id,draft_no,channel_key,line_user_id,line_name,customer_name,phone,school_name,need_date,note,items,status,order_no,pos_sale_no,cancel_reason,first_msg_at,last_msg_at,confirmed_at,version,ack_sent_at'

  const CSS=`
.cd-wrap{max-width:1180px}
.cd-bar2{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
.cd-tabs{display:flex;gap:6px;flex-wrap:wrap}
.cd-tab{padding:8px 13px;border-radius:999px;border:1px solid var(--line);background:#fff;font:inherit;font-weight:600;font-size:14px;color:var(--ink);cursor:pointer}
.cd-tab.on{background:var(--navy);color:#fff;border-color:var(--navy)}
.cd-tab b{margin-left:6px;font-weight:700;opacity:.8}
.cd-search{flex:1;min-width:180px;padding:9px 12px;border:1px solid var(--line);border-radius:11px;font:inherit;background:#fff;color:var(--ink)}
.cd-list{display:grid;gap:10px}
.cd-row{background:#fff;border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:12px 14px;cursor:pointer;display:flex;justify-content:space-between;gap:12px}
.cd-row:hover{border-color:var(--navy)}
.cd-main{min-width:0;flex:1}
.cd-side{text-align:right;flex-shrink:0}
.cd-no{color:var(--navy);font-size:15px}
.cd-who{font-weight:600;margin-top:2px;overflow-wrap:anywhere}
.cd-muted{color:var(--muted);font-size:13px}
.cd-warn{color:var(--amber);font-weight:600}
.cd-chip{display:inline-block;font-size:12px;font-weight:600;padding:2px 9px;border-radius:999px;background:var(--sky);color:var(--navy);margin:0 2px}
.cd-chip.warn{background:var(--amberbg);color:var(--amber)}
.cd-chip.ok{background:var(--greenbg);color:var(--green)}
.cd-chip.bad{background:var(--redbg);color:var(--red)}
.cd-empty{text-align:center;color:var(--muted);padding:34px 10px;background:#fff;border:1px dashed var(--line);border-radius:var(--radius)}
.cd-top{display:flex;gap:10px;align-items:flex-start;margin-bottom:12px;flex-wrap:wrap}
.cd-head{flex:1;min-width:0}
.cd-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:14px;align-items:start}
.cd-card{background:#fff;border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:14px 16px;margin-bottom:14px;min-width:0}
.cd-card h4{margin:0 0 10px;font-size:15px;color:var(--navy)}
.cd-f{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.cd-f label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--muted);min-width:0}
.cd-f .wide{grid-column:1/-1}
.cd-f input,.cd-f textarea,.cd-f select,.cd-ln input,.cd-add input,.cd-bar select,.cd-search,.cd-modal input,.cd-modal textarea{font:inherit;color:var(--ink);padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:#fff;min-width:0;width:100%;box-sizing:border-box}
.cd-f input:disabled,.cd-f textarea:disabled{background:var(--mist)}
.cd-line{border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin-bottom:10px;background:var(--mist)}
.cd-line.rv{border-color:#E8C77A;background:var(--amberbg)}
.cd-line.off{opacity:.55}
.cd-ln-top{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap}
.cd-ln-name{font-weight:600;overflow-wrap:anywhere;min-width:0;flex:1}
.cd-ln-row{display:grid;grid-template-columns:90px 110px minmax(0,1fr);gap:8px;margin-top:8px}
.cd-ln-row label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--muted);min-width:0}
.cd-ln-foot{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap}
.cd-chk{font-size:13px;color:var(--ink);display:flex;gap:6px;align-items:center}
.cd-sugg{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.cd-sugg button{font:inherit;font-size:13px;padding:5px 10px;border-radius:999px;border:1px solid var(--line);background:#fff;color:var(--navy);cursor:pointer}
.cd-sugg button:hover{border-color:var(--navy)}
.cd-add{border-top:1px dashed var(--line);margin-top:6px;padding-top:10px}
.cd-add .cd-ln-row{grid-template-columns:minmax(0,1fr) 90px 110px}
.cd-total{margin-top:6px;font-weight:600;color:var(--navy)}
.cd-msg{background:var(--mist);border-radius:10px;padding:8px 10px;margin-bottom:6px;font-size:14px;overflow-wrap:anywhere}
.cd-img{width:96px;height:96px;object-fit:cover;border-radius:10px;border:1px solid var(--line);margin-top:4px;display:block}
.cd-hist ul{margin:8px 0 0;padding-left:18px;font-size:13px;line-height:1.7}
.cd-hist summary{cursor:pointer;font-weight:600;color:var(--navy)}
.cd-bar{position:sticky;bottom:0;z-index:5;background:#fff;border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:10px 12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.cd-bar select{width:auto;padding:7px 9px;font-size:14px}
.cd-sp{flex:1}
.cd-err{color:var(--red);font-size:14px;font-weight:600;min-height:18px;margin:8px 2px}
.cd-modal .cd-f{grid-template-columns:1fr}
.cd-modal label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--muted);margin-top:8px}
@media (max-width:820px){
  .cd-grid{grid-template-columns:1fr}
  .cd-f{grid-template-columns:1fr}
  .cd-ln-row{grid-template-columns:76px 96px minmax(0,1fr)}
  .cd-add .cd-ln-row{grid-template-columns:1fr 80px}
  .cd-add .cd-ln-row input:last-child{grid-column:1/-1}
  .cd-bar{bottom:64px}
  .cd-row{flex-direction:column}
  .cd-side{text-align:left;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
}`
  function css(){ if(document.getElementById('cd-css')) return; const s=document.createElement('style'); s.id='cd-css'; s.textContent=CSS; document.head.appendChild(s) }

  const C={tab:'todo',q:'',rows:[],open:null,search:{},addQ:'',addProd:null,actor:null,timer:null}
  const fail=e=>toast(String((e&&e.message)||e||'เกิดข้อผิดพลาด'),'err',4200)
  const act=f=>(...a)=>Promise.resolve().then(()=>f(...a)).catch(fail)
  const prodById=id=>S.products.find(p=>p.id===id)
  const matchList=q=>{const k=keyOf(q); if(!k) return []; return S.products.filter(p=>keyOf(p.name).includes(k)||(p.code&&keyOf(p.code).includes(k))).slice(0,6)}

  async function rpc(fn,args){ const {data,error}=await sb.rpc(fn,args); if(error) throw new Error(error.message||String(error)); return data }
  async function actorName(){
    if(C.actor) return C.actor
    try{ const {data}=await sb.auth.getUser(); const e=data&&data.user&&data.user.email; C.actor='staff:'+(e?e.split('@')[0]:'เจ้าหน้าที่') }
    catch(_){ C.actor='staff' }
    return C.actor
  }
  function showErr(m){ const e=$('#cd-err'); if(e) e.textContent=m; else toast(m,'err',4200) }
  function explain(r){
    const m={
      conflict:'ร่างนี้มีการแก้ไขจากที่อื่นแล้ว — โหลดใหม่แล้วลองอีกครั้ง',
      not_open:'ร่างนี้ปิดไปแล้ว',
      not_found:'ไม่พบร่างนี้ (อาจถูกลบ)',
      need_name:'กรอกชื่อลูกค้าก่อนยืนยัน',
      unresolved:`มี ${r.count} รายการรอตรวจสินค้า — ผูกสินค้าให้ถูกต้อง หรือติ๊ก “รับรองรายการนี้” แล้วใส่ราคา`,
      missing_price:`มี ${r.count} รายการยังไม่มีราคา`,
      bad_qty:r.count?`มี ${r.count} รายการจำนวนไม่ถูกต้อง`:`รายการที่ ${r.line||''} จำนวนต้องมากกว่า 0`,
      bad_price:`รายการที่ ${r.line||''} ราคาไม่ถูกต้อง`,
      empty:'ยังไม่มีรายการสินค้า',
      bad_items:'ข้อมูลรายการไม่ถูกต้อง',
      already_sold:`ขายผ่าน POS แล้ว (${r.sale_no||''}) — ไม่ตัดสต็อกซ้ำ`,
      not_confirmed:'ต้องยืนยันเป็นออเดอร์ก่อนจึงขายผ่าน POS ได้',
      no_store:'ไม่พบร้านที่เลือก',
      unlinked:'มีรายการที่ยังไม่ได้ผูกสินค้า — ผูกก่อนขายผ่าน POS',
    }[r.error]||('ทำรายการไม่สำเร็จ'+(r.error?' ('+r.error+')':''))
    showErr(m)
    if(r.error==='conflict'||r.error==='already_sold'||r.error==='not_open') refreshOpen().catch(()=>{})
    return false
  }

  // ---- โหลดข้อมูล ----
  async function loadList(){
    const {data,error}=await sb.from('chat_drafts').select(LIST_COLS).in('status',['open','confirmed','cancelled']).order('last_msg_at',{ascending:false}).limit(300)
    if(error) throw error
    C.rows=data||[]
  }
  async function loadOpen(id){
    const [dr,ms,ev]=await Promise.all([
      sb.from('chat_drafts').select(LIST_COLS).eq('id',id).maybeSingle(),
      sb.from('chat_messages').select('id,kind,body,media_path,created_at').eq('draft_id',id).order('created_at'),
      sb.from('chat_draft_events').select('id,actor,action,detail,at').eq('draft_id',id).order('id'),
    ])
    if(dr.error) throw dr.error
    if(!dr.data) throw new Error('ไม่พบร่างนี้')
    const msgs=ms.data||[]
    const imgs={}
    await Promise.all(msgs.filter(m=>m.kind==='image'&&m.media_path).map(async m=>{
      const s=await sb.storage.from('chat-media').createSignedUrl(m.media_path,600)
      if(s.data&&s.data.signedUrl) imgs[m.id]=s.data.signedUrl
    }))
    return {d:dr.data,msgs,evs:ev.data||[],imgs}
  }
  const modelOf=v=>({...v.d,items:(v.d.items||[]).map(x=>({...x})),msgs:v.msgs,evs:v.evs,imgs:v.imgs,dirty:false})
  async function openDraft(id){
    C.open=modelOf(await loadOpen(id))
    C.addQ=''; C.addProd=null; C.search={}
    paint()
  }
  async function refreshOpen(){
    if(!C.open) return paint()
    C.open=modelOf(await loadOpen(C.open.id))
    await loadList().catch(()=>{})
    paint()
  }

  // ---- ทำให้เป็นตัวหน้าจอ ----
  function paint(){
    const root=$('#view')
    if(!root) return
    root.innerHTML=C.open?detailHTML():listHTML()
    if(!root._cd){ root._cd=true; root.addEventListener('click',onClick); root.addEventListener('input',onInput); root.addEventListener('change',onChange) }
  }
  function listHTML(){
    const counts={todo:0,ready:0,done:0,off:0}
    C.rows.forEach(d=>{counts[TAB_OF(d)]++})
    const q=C.q.trim().toLowerCase()
    const rows=C.rows.filter(d=>TAB_OF(d)===C.tab).filter(d=>!q||[d.draft_no,d.customer_name,d.line_name,d.phone,d.order_no].some(v=>String(v||'').toLowerCase().includes(q)))
    const list=rows.map(d=>{
      const L=(d.items||[]).filter(x=>!x.removed)
      const iss=d.status==='open'?draftIssues(d).map(k=>ISSUE_TEXT[k]):[]
      const who=d.customer_name||d.line_name||'ไม่ทราบชื่อ'
      const st=ST[d.status]||['','']
      return `<div class="cd-row" data-act="open" data-id="${esc(d.id)}">
        <div class="cd-main"><b class="cd-no">${esc(d.draft_no)}</b> <span class="cd-muted">${esc(oaName(d.channel_key))}</span>
          <div class="cd-who">${esc(who)}${d.phone?` <span class="cd-muted">· ${esc(d.phone)}</span>`:''}</div>
          <div class="cd-muted">${num(L.length)} รายการ${iss.length?` · <span class="cd-warn">${esc(iss.join(' · '))}</span>`:''}</div></div>
        <div class="cd-side"><span class="cd-chip ${st[1]}">${esc(st[0])}</span>${d.order_no?`<div class="cd-muted">${esc(d.order_no)}</div>`:''}<div class="cd-muted">${esc(fmtDate(d.last_msg_at))}</div></div>
      </div>`
    }).join('')
    const tabs=TABS.map(t=>`<button class="cd-tab${C.tab===t.id?' on':''}" data-act="tab" data-t="${t.id}">${t.t}<b>${num(counts[t.id])}</b></button>`).join('')
    return `<div class="cd-wrap">
      <div class="cd-bar2"><div class="cd-tabs">${tabs}</div>
        <input class="cd-search" data-f="q" placeholder="ค้นหา: เลขร่าง ชื่อ เบอร์ เลขคำสั่งซื้อ" value="${esc(C.q)}">
        <button class="btn sm primary" data-act="paste">＋ วางข้อความจากแชท</button></div>
      <div class="cd-list">${list||'<div class="cd-empty">ไม่มีรายการในหมวดนี้</div>'}</div>
    </div>`
  }
  function detailHTML(){
    const d=C.open, st=ST[d.status]||['','']
    const open=d.status==='open'
    const dis=open?'':' disabled'
    const msgs=d.msgs.map(m=>`<div class="cd-msg"><div class="cd-muted">${esc(fmtDate(m.created_at))}</div>${
      m.kind==='image'
        ? (d.imgs[m.id]?`<a href="${esc(d.imgs[m.id])}" target="_blank" rel="noopener"><img class="cd-img" src="${esc(d.imgs[m.id])}" alt="รูปจากลูกค้า"></a>`:'<span class="cd-muted">[รูป]</span>')
        : esc(m.body||'')}</div>`).join('')
    const evs=d.evs.map(e=>`<li>${esc(fmtDate(e.at))} · ${esc(EV[e.action]||e.action)} · <span class="cd-muted">${esc(e.actor)}</span></li>`).join('')
    const lines=d.items.map((x,i)=>lineHTML(x,i,open)).join('')
    return `<div class="cd-wrap">
      <div class="cd-top">
        <button class="btn sm ghost" data-act="back">← รายการ</button>
        <div class="cd-head"><b class="cd-no">${esc(d.draft_no)}</b> <span class="cd-chip ${st[1]}">${esc(st[0])}</span>
          <div class="cd-muted">${esc(oaName(d.channel_key))} · รับเมื่อ ${esc(fmtDate(d.first_msg_at))} · ล่าสุด ${esc(fmtDate(d.last_msg_at))}${d.order_no?` · คำสั่งซื้อ <b>${esc(d.order_no)}</b>`:''}${d.pos_sale_no?` · POS ${esc(d.pos_sale_no)}`:''}</div>
        </div>
      </div>
      <div class="cd-grid">
        <div class="cd-card">
          <h4>ลูกค้า</h4>
          <div class="cd-f">
            <label class="wide">ชื่อลูกค้า *<input data-f="customer_name" value="${esc(d.customer_name||'')}"${dis}></label>
            <label>เบอร์โทร<input data-f="phone" value="${esc(d.phone||'')}"${dis}></label>
            <label>โรงเรียน / หน่วยงาน<input data-f="school_name" value="${esc(d.school_name||'')}"${dis}></label>
            <label>วันที่ต้องการ<input type="date" data-f="need_date" value="${esc(d.need_date||'')}"${dis}></label>
            <label class="wide">หมายเหตุ (จากข้อความลูกค้า)<textarea rows="3" data-f="note"${dis}>${esc(d.note||'')}</textarea></label>
          </div>
          <h4 style="margin-top:16px">ข้อความจากแชท (${num(d.msgs.length)})</h4>
          ${msgs||'<div class="cd-muted">ไม่มีข้อความ</div>'}
        </div>
        <div class="cd-card">
          <h4>รายการสินค้า (${num(d.items.filter(x=>!x.removed).length)})</h4>
          ${lines||'<div class="cd-muted">ยังไม่มีรายการ</div>'}
          ${open?addHTML():''}
          <div class="cd-total">${esc(totalText(d))}</div>
        </div>
      </div>
      <details class="cd-card cd-hist"><summary>ประวัติการเปลี่ยนแปลง (${num(d.evs.length)})</summary><ul>${evs||'<li class="cd-muted">ยังไม่มี</li>'}</ul></details>
      <div class="cd-bar">${actionsHTML(d)}</div>
      <div class="cd-err" id="cd-err" aria-live="polite"></div>
    </div>`
  }
  function lineHTML(x,i,open){
    const iss=lineIssue(x)
    const cls='cd-line'+(x.removed?' off':'')+(iss==='review'?' rv':'')
    const dis=open&&!x.removed?'':' disabled'
    const price=x.price!=null&&x.price!==''?x.price:''
    const chip=x.removed?'<span class="cd-chip bad">ลบแล้ว</span>'
      :x.product_id?`<span class="cd-chip ok">✓ ${esc(x.product_name||x.name)}</span>`
      :x.staff_ok?'<span class="cd-chip">รับรองแล้ว</span>':'<span class="cd-chip warn">รอตรวจสินค้า</span>'
    const said=x.said&&x.said!==x.name?`<div class="cd-muted">ลูกค้าพิมพ์ “${esc(x.said)}”</div>`:''
    const sugg=(open&&!x.product_id&&!x.removed)?`<div class="cd-sugg">${(x.suggestions||[]).map(p=>`<button data-act="link" data-i="${i}" data-p="${esc(p.id)}">ใช้ ${esc(p.name)}</button>`).join('')}</div>
        <input class="cd-search" style="margin-top:8px" data-f="search" data-i="${i}" placeholder="หรือค้นหาสินค้าในร้าน" value="${esc(C.search[i]||'')}">
        <div class="cd-sugg" data-found="${i}">${foundHTML(i)}</div>`:''
    return `<div class="${cls}">
      <div class="cd-ln-top"><div class="cd-ln-name">${esc(x.said||x.name||'?')}</div>${chip}</div>
      ${said}
      <div class="cd-ln-row">
        <label>จำนวน<input type="number" step="any" min="0" data-f="qty" data-i="${i}" value="${esc(x.qty??'')}"${dis}></label>
        <label>หน่วย<input data-f="unit" data-i="${i}" value="${esc(x.unit||'')}"${dis}></label>
        <label>ราคา/หน่วย<input type="number" step="any" min="0" data-f="price" data-i="${i}" value="${esc(price)}" placeholder="${esc(x.product_price!=null?String(x.product_price):'ใส่ราคา')}"${dis}></label>
      </div>
      ${sugg}
      ${open?`<div class="cd-ln-foot">
        ${x.product_id?'<span class="cd-muted"></span>':`<label class="cd-chk"><input type="checkbox" data-f="staff_ok" data-i="${i}"${x.staff_ok?' checked':''}> รับรองรายการนี้ (ไม่มีในร้าน)</label>`}
        <button class="btn sm ghost" data-act="remove" data-i="${i}">${x.removed?'คืนรายการ':'ลบรายการ'}</button></div>`:''}
    </div>`
  }
  function foundHTML(i){
    const q=C.search[i]
    return q?matchList(q).map(p=>`<button data-act="link" data-i="${i}" data-p="${esc(p.id)}">${esc(p.name)}${p.code?` · ${esc(p.code)}`:''}</button>`).join(''):''
  }
  function addHTML(){
    const chosen=C.addProd?prodById(C.addProd):null
    const found=C.addQ&&!chosen?matchList(C.addQ).map(p=>`<button data-act="addpick" data-p="${esc(p.id)}">${esc(p.name)}${p.code?` · ${esc(p.code)}`:''}</button>`).join(''):''
    return `<div class="cd-add"><div class="cd-muted">เพิ่มรายการ${chosen?` · เลือก: <b>${esc(chosen.name)}</b>`:''}</div>
      <div class="cd-ln-row"><input data-f="addName" placeholder="ชื่อสินค้า" value="${esc(C.addQ)}"><input type="number" step="any" min="0" data-f="addQty" placeholder="จำนวน"><input data-f="addUnit" placeholder="หน่วย"></div>
      <div class="cd-sugg" data-addfound>${found}</div>
      <div class="cd-ln-foot"><span></span><button class="btn sm" data-act="add">เพิ่มรายการ</button></div></div>`
  }
  function totalText(d){
    let sum=0, unknown=0
    d.items.filter(x=>!x.removed).forEach(x=>{
      const p=x.price!=null&&x.price!==''?Number(x.price):(x.product_price!=null?Number(x.product_price):null)
      if(p==null) unknown++; else sum+=Number(x.qty||0)*p
    })
    return `ยอดประมาณ ${baht(sum)}${unknown?` · รอราคา ${num(unknown)} รายการ`:''}`
  }
  function actionsHTML(d){
    if(d.status==='open') return `<button class="btn" id="cd-save" data-act="save">บันทึก</button>
      <button class="btn primary" data-act="confirm">ยืนยันเป็นออเดอร์</button>
      <span class="cd-sp"></span><button class="btn ghost" style="color:var(--red)" data-act="cancel">ยกเลิกร่าง</button>`
    if(d.status==='confirmed'){
      const pos=d.pos_sale_no?`<span class="cd-chip ok">ขายแล้ว ${esc(d.pos_sale_no)}</span>`
        :`<select data-f="store">${S.stores.map(s=>`<option value="${esc(s.id)}"${s.id===S.posStore?' selected':''}>${esc(s.name)}</option>`).join('')}</select>
          <select data-f="method">${METHODS.map(m=>`<option>${esc(m)}</option>`).join('')}</select>
          <button class="btn green" data-act="pos">ขายผ่าน POS (ตัดสต็อกครั้งเดียว)</button>`
      return `<button class="btn primary" data-act="pick">🖨️ พิมพ์ใบจัดของ</button><button class="btn" data-act="order">เปิดคำสั่งซื้อ</button><span class="cd-sp"></span>${pos}`
    }
    return `<span class="cd-muted">ร่างนี้ยกเลิกแล้ว${d.cancel_reason?' · '+esc(d.cancel_reason):''}</span>`
  }

  // ---- การกระทำ ----
  function linkLine(x,p){
    x.product_id=p.id; x.product_code=p.code||null; x.product_name=p.name; x.product_unit=p.unit||null
    x.product_price=p.price!=null?Number(p.price):null; x.name=p.name; x.status='ok'
    if(!String(x.unit||'').trim()) x.unit=p.unit||''
    x.suggestions=[]
  }
  function lineFrom(said,qty,unit,raw,src){
    const q=keyOf(said)
    const exact=q&&S.products.find(p=>keyOf(p.name)===q||(p.code&&keyOf(p.code)===q))
    const near=!exact&&q?S.products.filter(p=>{const k=keyOf(p.name);return k&&(k.includes(q)||q.includes(k))}).slice(0,3):[]
    const x={id:undefined,name:said,said:null,raw:String(raw||'').slice(0,300),qty,unit:normUnit(unit||''),product_id:null,product_code:null,product_name:null,product_unit:null,product_price:null,price:null,staff_ok:false,status:'review',removed:false,src:src||'staff',
      suggestions:near.map(p=>({id:p.id,name:p.name,code:p.code||null,unit:p.unit||null,price:p.price!=null?Number(p.price):null}))}
    if(exact){ x.said=keyOf(said)!==keyOf(exact.name)?said:null; linkLine(x,exact) }
    return x
  }
  function linkTo(i,pid){
    const p=prodById(pid), x=C.open.items[i]
    if(!p||!x) return
    if(!x.product_id&&!x.said) x.said=x.name
    linkLine(x,p)
    C.search[i]=''
    C.open.dirty=true
  }
  function addLine(){
    const root=$('#view')
    const name=String(root.querySelector('[data-f="addName"]').value||'').trim()
    const qty=Number(root.querySelector('[data-f="addQty"]').value)
    const unit=String(root.querySelector('[data-f="addUnit"]').value||'').trim()
    if(!name||!(qty>0)) return showErr('ใส่ชื่อสินค้าและจำนวนก่อนเพิ่มรายการ')
    const x=lineFrom(name,qty,unit,name+' '+qty+(unit?' '+unit:''),'staff')
    if(C.addProd&&!x.product_id){ const p=prodById(C.addProd); if(p){ x.said=name; linkLine(x,p) } }
    C.open.items.push(x)
    C.open.dirty=true
    C.addQ=''; C.addProd=null
    paint()
  }
  async function save(quiet){
    const d=C.open
    // the server keeps the customer's words as "said" when they differ from the product it matched: send those words as the name
    const items=d.items.map(x=>({id:x.id||null,name:x.said||x.name,said:x.said||null,qty:x.qty===''||x.qty==null?null:Number(x.qty),unit:x.unit||'',product_id:x.product_id||null,price:x.price==null||x.price===''?null:Number(x.price),staff_ok:!!x.staff_ok,removed:!!x.removed,raw:x.raw||'',src:x.src||'staff',suggestions:x.suggestions||[]}))
    const r=await rpc('chat_draft_save',{p_draft:d.id,p_version:d.version,p_items:items,p_name:d.customer_name||null,p_phone:d.phone||null,p_school:d.school_name||null,p_need_date:d.need_date||null,p_note:d.note||null,p_actor:await actorName()})
    if(!r||!r.ok) return explain(r||{})
    d.version=r.version
    d.items=(r.items||[]).map(x=>({...x}))
    d.dirty=false
    if(!quiet) toast('บันทึกแล้ว','ok')
    await loadList().catch(()=>{})
    paint()
    return true
  }
  async function confirmDraft(){
    if(C.open.dirty&&!(await save(true))) return
    const d=C.open
    const r=await rpc('chat_draft_confirm',{p_draft:d.id,p_version:d.version,p_actor:await actorName()})
    if(!r||!r.ok) return explain(r||{})
    toast('ยืนยันเป็นออเดอร์ '+r.order_no+' แล้ว','ok')
    await refreshOpen()
  }
  async function posDraft(){
    const root=$('#view')
    const store=root.querySelector('[data-f="store"]').value
    const method=root.querySelector('[data-f="method"]').value
    const r=await rpc('chat_draft_pos',{p_draft:C.open.id,p_store:store,p_method:method,p_actor:await actorName()})
    if(!r||!r.ok) return explain(r||{})
    toast('ขายผ่าน POS '+r.sale_no+' แล้ว · ตัดสต็อกครั้งเดียว','ok')
    await refreshOpen()
  }
  async function orderRow(){
    const {data:o,error}=await sb.from('orders').select('*').eq('order_no',C.open.order_no).maybeSingle()
    if(error) throw error
    if(!o) throw new Error('ไม่พบคำสั่งซื้อ '+C.open.order_no)
    return o
  }
  async function pickSlip(){
    if(!window.NattaWO) throw new Error('หน้า “คำสั่งซื้อจากหน้าเว็บ” ยังไม่พร้อม — รีเฟรชหน้าแล้วลองใหม่')
    const o=await orderRow()
    await NattaWO.ensure()
    await NattaWO.print(o)
  }
  async function orderOpen(){
    if(!window.NattaWO) throw new Error('หน้า “คำสั่งซื้อจากหน้าเว็บ” ยังไม่พร้อม — รีเฟรชหน้าแล้วลองใหม่')
    const o=await orderRow()
    await NattaWO.ensure()
    NattaWO.open(o)
  }
  function cancelModal(){
    const d=C.open
    modal('ยกเลิกร่าง '+d.draft_no+'?',
      `<div class="cd-modal"><p class="cd-muted" style="margin:0 0 6px">ร่างจะปิดลง ไม่สร้างคำสั่งซื้อ และไม่ส่งข้อความถึงลูกค้า · ยังดูประวัติได้</p>
       <label>เหตุผล<input id="cd-reason" placeholder="เช่น ลูกค้าไม่ได้สั่ง / ซ้ำกับใบอื่น"></label></div>`,
      [{t:'ไม่ยกเลิก',f:closeModal},{t:'ยืนยันยกเลิกร่าง',danger:true,f:act(async()=>{
        const reason=String($('#cd-reason').value||'').trim()
        const r=await rpc('chat_draft_cancel',{p_draft:d.id,p_version:d.version,p_actor:await actorName(),p_reason:reason})
        if(!r||!r.ok){ closeModal(); return explain(r||{}) }
        closeModal()
        toast('ยกเลิกร่าง '+d.draft_no+' แล้ว','ok')
        C.open=null
        await loadList()
        paint()
      })}])
  }
  function pasteModal(){
    modal('วางข้อความจากแชท',
      `<div class="cd-modal"><div class="cd-f">
         <label class="wide">ข้อความจากแชท (วางทั้งก้อนได้ — ระบบจะแยกเฉพาะบรรทัดที่มีจำนวน)<textarea id="cd-paste" rows="8" placeholder="ไม้ถูพื้น 2 อัน&#10;น้ำยาล้างจาน=1แกลอน"></textarea></label>
         <label>ชื่อลูกค้า *<input id="cd-pname"></label>
         <label>เบอร์โทร<input id="cd-pphone"></label>
         <label class="wide">โรงเรียน / หน่วยงาน<input id="cd-pschool"></label>
       </div><div class="cd-err" id="cd-perr"></div></div>`,
      [{t:'ยกเลิก',f:closeModal},{t:'สร้างร่าง',c:'primary',f:act(createFromPaste)}])
  }
  async function createFromPaste(){
    const text=String($('#cd-paste').value||''), name=$('#cd-pname').value.trim(), phone=$('#cd-pphone').value.trim(), school=$('#cd-pschool').value.trim()
    const err=$('#cd-perr')
    err.textContent=''
    if(!name){ err.textContent='กรอกชื่อลูกค้าก่อน'; return }
    const parsed=parsePasted(text)
    if(!parsed.length){ err.textContent='ไม่พบรายการสินค้า — แต่ละบรรทัดต้องมีจำนวน เช่น “ไม้ถูพื้น 2 อัน”'; return }
    const items=parsed.map(p=>lineFrom(p.name,p.qty,p.unit,p.raw,'paste'))
    const r=await rpc('chat_draft_manual',{p_items:items,p_name:name,p_phone:phone||null,p_school:school||null,p_note:text.trim()||null,p_actor:await actorName()})
    if(!r||!r.ok){ err.textContent='สร้างร่างไม่สำเร็จ: '+((r&&r.error)||''); return }
    closeModal()
    toast('สร้างร่าง '+r.draft_no+' แล้ว','ok')
    await loadList()
    await openDraft(r.draft_id)
  }

  // ---- การคลิกและการพิมพ์ (มอบหมายเหตุการณ์ครั้งเดียวที่ #view) ----
  function onClick(e){
    const t=e.target.closest('[data-act]')
    if(!t) return
    const a=t.dataset.act
    if(a==='tab'){ C.tab=t.dataset.t; return paint() }
    if(a==='open') return act(openDraft)(t.dataset.id)
    if(a==='back'){ C.open=null; return act(async()=>{ await loadList(); paint() })() }
    if(a==='paste') return pasteModal()
    if(a==='remove'){ const x=C.open.items[+t.dataset.i]; x.removed=!x.removed; C.open.dirty=true; return paint() }
    if(a==='link'){ linkTo(+t.dataset.i,t.dataset.p); return paint() }
    if(a==='addpick'){ C.addProd=t.dataset.p; return paint() }
    if(a==='add') return addLine()
    if(a==='save') return act(()=>save(false))()
    if(a==='confirm') return act(confirmDraft)()
    if(a==='cancel') return cancelModal()
    if(a==='pos') return act(posDraft)()
    if(a==='pick') return act(pickSlip)()
    if(a==='order') return act(orderOpen)()
  }
  function onInput(e){
    const t=e.target, f=t.dataset.f
    if(!f) return
    if(f==='q'){ C.q=t.value; if(!C.open){ const v=t.selectionStart; paint(); const n=$('#view').querySelector('[data-f="q"]'); if(n){ n.focus(); n.setSelectionRange(v,v) } } return }
    if(f==='addName'){ C.addQ=t.value; C.addProd=null; return refreshAdd() }
    if(f==='search'){ C.search[+t.dataset.i]=t.value; const box=$('#view').querySelector(`[data-found="${t.dataset.i}"]`); if(box) box.innerHTML=foundHTML(+t.dataset.i); return }
    if(!C.open||C.open.status!=='open') return
    if(['customer_name','phone','school_name','need_date','note'].includes(f)){ C.open[f]=t.value; C.open.dirty=true; return markDirty() }
    const x=C.open.items[+t.dataset.i]
    if(!x) return
    if(f==='qty') x.qty=t.value
    if(f==='unit') x.unit=t.value
    if(f==='price') x.price=t.value===''?null:t.value
    if(f==='addQty'||f==='addUnit') return
    C.open.dirty=true
    markDirty()
  }
  function onChange(e){
    const t=e.target
    if(t.dataset.f==='staff_ok'&&C.open){ const x=C.open.items[+t.dataset.i]; x.staff_ok=t.checked; C.open.dirty=true; paint() }
  }
  function markDirty(){ const b=$('#cd-save'); if(b){ b.classList.add('primary'); b.textContent='บันทึกการแก้ไข' } }
  function refreshAdd(){
    const box=$('#view').querySelector('[data-addfound]')
    if(!box) return
    box.innerHTML=C.addQ&&!C.addProd?matchList(C.addQ).map(p=>`<button data-act="addpick" data-p="${esc(p.id)}">${esc(p.name)}${p.code?` · ${esc(p.code)}`:''}</button>`).join(''):''
  }

  // ---- การเข้าหน้า: ลิงก์จากการ์ด LINE (?chat=CH-0001#chatorders) เปิดร่างนั้นเลย ----
  function armTimer(){
    if(C.timer) return
    C.timer=setInterval(()=>{
      if(!/chatorders/.test(location.hash)) return
      const busy=document.activeElement&&$('#view')&&$('#view').contains(document.activeElement)
      if(busy) return
      if(C.open){ if(!C.open.dirty&&C.open.status==='open') refreshOpen().catch(()=>{}) }
      else loadList().then(()=>{ if(!C.open&&!busy) paint() }).catch(()=>{})
    },30000)
  }
  VIEWS.chatorders=async function(){
    css()
    armTimer()
    try{
      const q=new URLSearchParams(location.search).get('chat')
      if(q){
        history.replaceState(null,'',location.pathname+location.hash)
        C.open=null
        const {data}=await sb.from('chat_drafts').select('id').eq('draft_no',q).maybeSingle()
        if(data) return openDraft(data.id)
      }
      if(C.open) return refreshOpen()
      await loadList()
      paint()
    }catch(e){
      $('#view').innerHTML=`<div class="card"><div class="empty"><div class="em">⚠️</div><b>โหลดออเดอร์จากแชทไม่สำเร็จ</b><div class="muted" style="margin-top:6px">${esc(e.message||e)}</div></div></div>`
    }
  }
})();
