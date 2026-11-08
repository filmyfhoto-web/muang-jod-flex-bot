-- ย้อนหน้า v12 กลับเป็น v11 ตรงทุกไบต์ (md5 787ac08bc3127734a790ad819b602829)
-- · เปลี่ยนเฉพาะคอลัมน์ code (กับ updated_at) ของแถว saleorders · enabled และ seq ไม่เปลี่ยน · โมดูลอื่นไม่ถูกแตะ
-- · ทำเฉพาะเมื่อโค้ดที่เก็บอยู่ตรงกับ v12 ทุกไบต์ (md5 7fdbca68a1d462f83410a8e70db67f80) — ถ้ามีคนแก้ไว้ จะไม่ทับและแจ้งเตือน · รันซ้ำได้
do $do$
declare c text;
begin
  select code into c from app_modules where name = 'saleorders';
  if c is null then
    raise exception 'saleorders: not installed; use apply.sql';
  end if;
  if md5(c) = '787ac08bc3127734a790ad819b602829' then
    raise notice 'saleorders: already v11, nothing changed';
    return;
  end if;
  if md5(c) <> '7fdbca68a1d462f83410a8e70db67f80' then
    raise exception 'saleorders: the stored code is neither v12 nor v11 (it was changed); not overwritten';
  end if;
  update app_modules set code = $so$/* NATTA GROUP · แชตและออเดอร์ (โมดูล saleorders · ตามภาพตัวอย่างของเจ้าของ 3 พ.ย. 2569)
   ซ้าย: แชตลูกค้า (sale_threads) · กลาง: ห้องแชต (sale_msgs + ไฟล์ใน bucket sale-order-files) · ขวา: ใบสั่งงาน/คำสั่งซื้อ (sale_orders)
   ต้องติดตั้ง db/migrations/002_sale_orders.sql ก่อน (sale_order_save ตรวจยอด สถานะ และสิทธิ์ฝั่งเซิร์ฟเวอร์)
   หลัก: ใบจากแชทเป็นระบบของตัวเอง ไม่แตะคำสั่งซื้อจัดสินค้า (orders) หรือคำสั่งซื้อจัดทำเอกสาร (doc_orders/project_docs)
         ไม่ตัดสต็อก ไม่ออกเอกสาร · Facebook ยังไม่ได้เชื่อมต่อ
   LINE OA (ต้องติดตั้ง db/migrations/003_sale_line_bridge.sql และเปิดสะพานที่บอท): ข้อความลูกค้าเข้าแชตเอง และพนักงานตอบจากหน้านี้ได้
         สถานะ "LINE OA: เชื่อมต่อแล้ว" มาจากสัญญาณชีพที่บอทเขียนเองทุกนาที (sale_line_status) ไม่ใช่การสมมติ · ไม่มีสัญญาณ = "ยังไม่ได้เชื่อมต่อ"
         ข้อความที่ตอบทาง LINE ขึ้น "ส่งถึง LINE แล้ว" ได้ทางเดียวคือบอทแจ้งว่า LINE รับแล้ว · นอกนั้นเป็น รอส่ง / ส่งไม่สำเร็จ / ไม่ได้ส่ง
         แชตที่ไม่ได้มาจาก LINE และโน้ตภายใน "บันทึกในระบบ" เท่านั้น และหน้าจอไม่แสดงว่าส่งสำเร็จถ้ายังไม่ได้ส่งจริง */
(function(){
  // เชลล์หลังร้านประกาศ ROUTES / VIEWS / sb ด้วย const ในสคริปต์ธรรมดา จึงไม่เป็นคุณสมบัติของ window (window.ROUTES = undefined)
  // อ่านผ่านชื่อตรง ๆ ก่อน แล้วค่อยลอง window — แบบเดียวกับโมดูล iosnav · ห้ามใช้ window.ROUTES เป็นเงื่อนไขเดี่ยว ๆ เพราะหน้าจะไม่ขึ้นเงียบ ๆ
  const R=typeof ROUTES!=='undefined'?ROUTES:window.ROUTES
  const V=typeof VIEWS!=='undefined'?VIEWS:window.VIEWS
  if(!R||!V)return
  if(!R.some(r=>r.id==='saleorders')){
    const i=R.findIndex(r=>r.id==='salechat')
    R.splice(i<0?R.length:i+1,0,{id:'saleorders',ic:'inbox',name:'แชตและออเดอร์'})
  }
  try{if(typeof buildNav==='function')buildNav()}catch(e){}

  // ---------- เครื่องมือ ----------
  const $=id=>document.getElementById(id)
  const E=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
  const TM=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
  const p2=n=>String(n).padStart(2,'0')
  const bkk=ms=>new Date(ms+7*36e5)
  const dayOf=ms=>Math.floor((ms+7*36e5)/864e5)
  const tms=t=>{const n=Date.parse(t||'');return Number.isFinite(n)?n:0}
  const hm=n=>{const d=bkk(n);return p2(d.getUTCHours())+':'+p2(d.getUTCMinutes())}
  const tShort=t=>{const n=tms(t);if(!n)return '';const dd=dayOf(n),td=dayOf(Date.now());if(dd===td)return hm(n);if(dd===td-1)return 'เมื่อวาน';const d=bkk(n);return d.getUTCDate()+' '+TM[d.getUTCMonth()]}
  const tFull=t=>{const n=tms(t);if(!n)return '-';const d=bkk(n);return d.getUTCDate()+' '+TM[d.getUTCMonth()]+' '+hm(n)}
  const dSep=t=>{const n=tms(t);if(!n)return '';const dd=dayOf(n),td=dayOf(Date.now());if(dd===td)return 'วันนี้';if(dd===td-1)return 'เมื่อวาน';const d=bkk(n);return d.getUTCDate()+' '+TM[d.getUTCMonth()]+' '+(d.getUTCFullYear()+543)}
  const dTH=s=>{const m=String(s||'').match(/^(\d{4})-(\d{2})-(\d{2})/);return m?(+m[3])+' '+TM[+m[2]-1]+' '+((+m[1])+543):'-'}
  const todayISO=()=>{const d=bkk(Date.now());return d.getUTCFullYear()+'-'+p2(d.getUTCMonth()+1)+'-'+p2(d.getUTCDate())}
  const thd=s=>String(s==null?'':s).replace(/[๐-๙]/g,d=>String(d.charCodeAt(0)-0x0E50))
  const num=v=>{const n=Number(thd(v).replace(/,/g,'').trim());return Number.isFinite(n)?n:0}
  const r2=x=>Math.round((Number(x)+Number.EPSILON)*100)/100
  const money=v=>Number(v||0).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2})
  const qtyTxt=v=>{const n=num(v);return Number.isInteger(n)?String(n):String(r2(n))}
  const uuid=()=>(window.crypto&&crypto.randomUUID)?crypto.randomUUID():'t'+Date.now().toString(36)+Math.random().toString(36).slice(2,12)
  const initial=s=>Array.from(String(s||'?').trim())[0]||'?'
  const COL=['#2F6FE4','#8A5CC2','#C2572F','#2E8B57','#B5862A','#4B6478']
  const colorOf=t=>{let h=0;String(t&&t.id||'').split('').forEach(c=>{h=(h+c.charCodeAt(0))%997});return COL[h%COL.length]}
  const clean=s=>String(s||'').replace(/[,()*%_\\]/g,' ').trim()

  const I={
    chat:'<path d="M4 5h16v11H9l-5 4z"/>',
    cart:'<circle cx="9" cy="20" r="1.3"/><circle cx="18" cy="20" r="1.3"/><path d="M2 3h3l2.4 12h11.2L21 7H6"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    clip:'<path d="M21 11.5l-8.6 8.6a5 5 0 01-7.1-7.1l8.6-8.6a3.4 3.4 0 014.8 4.8l-8.6 8.6a1.7 1.7 0 01-2.4-2.4l7.9-7.9"/>',
    send:'<path d="M3 11l18-8-8 18-2-8z"/>',
    save:'<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h8V3"/><rect x="8" y="13" width="8" height="6"/>',
    gear:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    card:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    wand:'<path d="M4 20L15 9M14 4v3M19 9h-3M17.5 5.5l-2 2"/>',
    file:'<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/>'
  }
  const ic=(k,s)=>`<svg width="${s||18}" height="${s||18}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[k]||''}</svg>`

  // ---------- ค่าคงที่ของงาน ----------
  const STG={talk:{t:'พูดคุย',c:'#7A8394'},quote:{t:'รอเสนอราคา',c:'#E8832A'},confirm:{t:'รอยืนยัน',c:'#1F9D55'},work:{t:'กำลังทำงาน',c:'#2F6FE4'},done:{t:'ปิดการขาย',c:'#0F7B45'},closed:{t:'จบการสนทนา',c:'#9AA3B2'}}
  const JOB=[['pending','รอดำเนินการ','#E8832A'],['awaiting','รอลูกค้ายืนยัน','#B5862A'],['working','กำลังทำ/จัดสินค้า','#2F6FE4'],['ready','พร้อมส่ง/พร้อมรับ','#8A5CC2'],['delivered','ส่งมอบแล้ว','#1F9D55'],['closed','ปิดออเดอร์','#0F7B45'],['canceled','ยกเลิก','#B42318']]
  const PAY=[['unpaid','ยังไม่ชำระ','#B42318'],['deposit','มัดจำแล้ว','#E8832A'],['partial','ชำระบางส่วน','#B5862A'],['paid','ชำระครบ','#0F7B45'],['account','ลงบัญชี','#5B4BC2']]
  const TAG=[['inquiry','สอบถาม','#2F6FE4'],['problem','ปัญหา','#B42318'],['urgent','ด่วน','#E8832A'],['later','ตอบกลับภายหลัง','#6B7587']]
  const JN=Object.fromEntries(JOB.map(([k,t,c])=>[k,{t,c}]))
  const PN=Object.fromEntries(PAY.map(([k,t,c])=>[k,{t,c}]))
  const TAGN=Object.fromEntries(TAG.map(([k,t,c])=>[k,{t,c}]))
  const OTYPE={goods:'สั่งเพื่อจัดสินค้า',docs:'สั่งเพื่อจัดทำเอกสาร'}
  const isOpenJob=s=>!['closed','canceled'].includes(s)
  const UNIT_LIST='รีม โหล แพ็ค แพค กล่อง เล่ม ด้าม แท่ง อัน ชิ้น ขวด ชุด ใบ ม้วน คู่ ห่อ ถุง ตัว แผ่น เมตร งาน หลอด ก้อน แผง ลัง'.split(' ')
  // ปุ่มข้อความด่วน: ตามลำดับขั้นงานจริง (ภาพอ้างอิงของเจ้าของ 7 พ.ย. 2569) — กดแล้วแทรกข้อความลงช่องพิมพ์ ไม่ส่งเอง ตรวจก่อนกดส่งได้เสมอ
  const TPL=[['รับรายละเอียดแล้ว','รับรายละเอียดงานแล้วนะคะ เดี๋ยวแอดมินดำเนินการให้ค่ะ'],['ขอไฟล์เพิ่ม','รบกวนขอไฟล์หรือรายละเอียดเพิ่มเติมอีกนิดนะคะ เพื่อให้ร้านจัดการได้ตรงตามที่ต้องการค่ะ'],['กำลังประเมินราคา','กำลังประเมินราคาให้อยู่นะคะ เดี๋ยวแจ้งกลับเร็ว ๆ นี้ค่ะ'],['ส่งแบบให้ตรวจ','ส่งแบบงานให้ตรวจสอบแล้วนะคะ รบกวนดูและแจ้งกลับด้วยค่ะ'],['งานพร้อมรับ','งานเสร็จเรียบร้อย พร้อมส่งมอบ/ให้รับแล้วนะคะ']]
  // ผู้รับผิดชอบแชต: ข้อความอิสระเหมือน sale_orders.assignee เดิม (ไม่มีตารางรายชื่อพนักงานในระบบนี้) — 3 ชื่อนี้คือรายชื่อลัดเดียวกับช่อง "ผู้รับผิดชอบ" ในใบสั่งงาน (so_staff), พิมพ์ชื่ออื่นก็ได้
  const STAFF=['หญิง','ฟิล์ม','พี่ปิ่น']
  const BUCKET='sale-order-files'
  const MAXF=10*1024*1024
  const OKTYPE=/^(image\/(png|jpeg|webp|gif)|application\/pdf)$/
  const ordsOf=t=>S.idx[t.id]||[]
  const hasOpen=t=>ordsOf(t).some(o=>isOpenJob(o.job_status))
  const TABS=[['all','ทั้งหมด',()=>true],['unread','รอตอบ',t=>t.unread>0],['working','กำลังสั่งงาน',t=>hasOpen(t)||['quote','confirm','work'].includes(t.stage)],['done','เสร็จแล้ว',t=>['done','closed'].includes(t.stage)||(ordsOf(t).length>0&&!hasOpen(t))]]

  const S={tab:'all',q:'',sel:'',mode:'list',list:[],idx:{},msgs:[],cust:null,ords:[],ord:null,stores:[],schools:[],
    listLoading:false,msgsLoading:false,ordLoading:false,errList:'',errMsgs:'',errOrd:'',
    flash:'',flashErr:false,flashTok:0,busySend:false,busySave:false,attachBusy:false,chatAttachBusy:false,
    drafts:{},odrafts:{},urls:{},tok:0,ctok:0,ptok:0,picker:false,pick:[],pickQ:'',creating:false,note:false,oaLog:false,
    prodOpen:false,prodQ:'',prodRows:[],prodPrice:{},prodBusy:false,modal:null,staff:'ทีมขาย',conflict:false,stageMenu:false,tagMenu:false,assignMenu:false,
    custStats:null,custLink:false,custLinkQ:'',custLinkRows:[],
    line:null,links:{},sendTok:{},busyRetry:{},poll:null,pollN:0,sig:'',probe:'',openStamp:'',linksOffUntil:0,statusOffUntil:0}

  // ---------- หน้าตา ----------
  const CSS=`
#so_root{--so-navy:#12335F;--so-ink:#0F2A4F;--so-blue:#2F6FE4;--so-sky:#DCEBFB;--so-sky2:#EEF5FE;--so-cream:#F3E0B8;--so-cream2:#FCF2DD;--so-bg:#EEF2F7;--so-line:#E3E9F1;--so-fg:#1B2433;--so-mut:#6B7587;--so-bad:#B42318;height:calc(100vh - 90px);min-height:560px;display:flex;flex-direction:column;background:var(--so-bg);color:var(--so-fg);font-size:14.5px;line-height:1.45}
#so_root *{box-sizing:border-box}
#so_root :focus-visible{outline:2px solid var(--so-blue);outline-offset:2px}
#so_root .so-cols{flex:1;min-height:0;display:grid;grid-template-columns:minmax(250px,.72fr) minmax(320px,1fr) minmax(380px,1.06fr);gap:12px;padding:12px}
#so_root .so-mtabs{display:none}
#so_root .so-col{min-width:0;min-height:0;display:flex;flex-direction:column;background:#fff;border:1px solid var(--so-line);border-radius:16px;box-shadow:0 1px 2px rgba(16,42,67,.06);overflow:hidden}
#so_root .so-chat{background:#F6F8FB}
#so_root .ttl{display:flex;align-items:center;gap:8px;font-weight:700;font-size:17px;color:var(--so-ink)}
#so_root .so-lhd{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:14px 14px 6px}
#so_root .so-chan{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 6px}
#so_root .so-srch{margin:4px 12px 8px;display:flex;align-items:center;gap:8px;border:1px solid var(--so-line);border-radius:12px;padding:0 12px;background:#fff;color:var(--so-mut)}
#so_root .so-srch input{flex:1;min-width:0;border:0;outline:0;padding:10px 0;font:inherit;background:transparent;color:var(--so-fg)}
#so_root .so-tabs{display:flex;flex-wrap:wrap;gap:6px;padding:2px 12px 10px;border-bottom:1px solid var(--so-line)}
#so_root .so-list>*:not(.so-items),#so_root .so-chat>*:not(.so-msgs),#so_root .so-ord>*:not(.so-ob),#so_root .so-ob>*{flex-shrink:0}
#so_root .so-tabs::-webkit-scrollbar{display:none}
#so_root .so-tab{flex:0 0 auto;border:1px solid var(--so-line);background:#fff;border-radius:999px;padding:5px 12px;font:inherit;font-size:12.5px;color:var(--so-fg);cursor:pointer;white-space:nowrap}
#so_root .so-tab.on{background:var(--so-navy);border-color:var(--so-navy);color:#fff}
#so_root .so-btn{border:1px solid var(--so-line);background:#fff;border-radius:10px;padding:8px 12px;font:inherit;font-size:13px;color:var(--so-fg);cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;justify-content:center;gap:6px}
#so_root .so-btn.pri{background:var(--so-navy);border-color:var(--so-navy);color:#fff}
#so_root .so-btn.sky{background:var(--so-sky);border-color:var(--so-sky);color:var(--so-ink);font-weight:600}
#so_root .so-btn.sm{padding:5px 10px;font-size:12.5px;border-radius:9px}
#so_root .so-btn:disabled{opacity:.5;cursor:default}
#so_root .so-items{flex:1;overflow:auto;min-height:0}
#so_root .so-row{display:flex;gap:12px;padding:12px 14px;border:0;border-left:4px solid transparent;border-bottom:1px solid var(--so-line);width:100%;background:#fff;text-align:left;font:inherit;color:inherit;cursor:pointer;align-items:center}
#so_root .so-row.on{background:var(--so-sky2)}
#so_root .so-row.tagged{border-left-color:var(--tc,transparent)}
#so_root .so-av{flex:0 0 44px;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:600;font-size:17px;background:#7A8394}
#so_root .so-av.sm{flex-basis:40px;width:40px;height:40px;font-size:15px}
#so_root .so-rw{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
#so_root .so-r1{display:flex;justify-content:space-between;gap:8px;align-items:center;min-width:0}
#so_root .so-nm{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;color:var(--so-ink)}
#so_root .so-tm{font-size:12px;color:var(--so-mut);flex:0 0 auto}
#so_root .so-pv{font-size:13px;color:var(--so-mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
#so_root .so-chip{display:inline-flex;align-items:center;border-radius:999px;padding:1px 9px;font-size:11.5px;color:#fff;background:var(--c,#7A8394);white-space:nowrap;flex:0 0 auto}
#so_root .so-chip.lite{background:#EDF1F7;color:var(--so-mut)}
#so_root .so-unread{display:inline-grid;place-items:center;min-width:20px;height:20px;border-radius:10px;background:var(--so-blue);color:#fff;font-size:11.5px;font-weight:700;padding:0 6px;flex:0 0 auto}
#so_root .so-ch{display:flex;align-items:center;gap:10px;padding:12px 14px;background:#fff;border-bottom:1px solid var(--so-line);position:relative}
#so_root .so-chn{flex:1;min-width:0}
#so_root .so-chn h2{margin:0;font-size:17px;color:var(--so-ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#so_root .so-chn small{color:var(--so-mut)}
#so_root .so-ic{width:40px;height:40px;border-radius:12px;border:1px solid var(--so-line);background:#fff;font:inherit;cursor:pointer;flex:0 0 auto;display:grid;place-items:center;color:var(--so-ink);padding:0}
#so_root .so-ic:disabled{opacity:.5}
#so_root .so-stgbtn{border:0;border-radius:999px;padding:5px 11px;font:inherit;font-size:12.5px;color:#fff;background:var(--c,#7A8394);cursor:pointer;white-space:nowrap;flex:0 0 auto}
#so_root .so-stgmenu{position:absolute;right:10px;top:54px;z-index:40;background:#fff;border:1px solid var(--so-line);border-radius:12px;box-shadow:0 10px 30px rgba(16,42,67,.18);padding:6px;display:flex;flex-direction:column;min-width:170px}
#so_root .so-stgmenu button{border:0;background:none;text-align:left;font:inherit;font-size:13.5px;padding:8px 10px;border-radius:8px;cursor:pointer;color:var(--so-fg)}
#so_root .so-stgmenu button:hover{background:var(--so-bg)}
#so_root .so-msgs{flex:1;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:8px;min-height:0}
#so_root .so-day{align-self:center;background:#E6EBF2;color:var(--so-mut);font-size:12px;border-radius:8px;padding:2px 12px}
#so_root .so-m{max-width:78%;display:flex;flex-direction:column;gap:3px}
#so_root .so-m.in{align-self:flex-start}
#so_root .so-m.out{align-self:flex-end;align-items:flex-end}
#so_root .so-bub a{color:inherit;text-decoration:underline}
#so_root .so-bub{padding:10px 13px;border-radius:16px;white-space:pre-wrap;word-break:break-word;background:#fff;color:var(--so-fg);box-shadow:0 1px 1px rgba(16,42,67,.05)}
#so_root .so-m.in .so-bub{border-top-left-radius:5px}
#so_root .so-m.out .so-bub{background:var(--so-sky);color:var(--so-ink);border-top-right-radius:5px}
#so_root .so-m.note{align-self:stretch;max-width:100%}
#so_root .so-m.note .so-bub{background:#FFF4CC;border:1px dashed #E8CF73;font-size:13px}
#so_root .so-m.sys{align-self:center;max-width:90%}
#so_root .so-m.sys .so-bub{background:rgba(255,255,255,.8);color:var(--so-mut);font-size:12.5px;border-radius:999px;padding:4px 12px;text-align:center}
#so_root .so-meta{font-size:11.5px;color:var(--so-mut);padding:0 4px}
#so_root .so-img{max-width:220px;max-height:220px;border-radius:12px;display:block;cursor:pointer;background:#fff;border:1px solid var(--so-line)}
#so_root .so-file{display:inline-flex;align-items:center;gap:8px;background:#fff;border:1px solid var(--so-line);border-radius:12px;padding:8px 12px;cursor:pointer;font:inherit;color:var(--so-ink)}
#so_root .so-empty{margin:auto;text-align:center;color:var(--so-mut);padding:28px;max-width:420px}
#so_root .so-err{color:var(--so-bad);font-size:12.5px;padding:6px 12px}
#so_root .so-flash{margin:8px 12px 0;padding:8px 12px;border-radius:12px;background:#E7F7EE;color:#0F6B3A;font-size:13px}
#so_root .so-flash.bad{background:#FDECEC;color:var(--so-bad)}
#so_root .so-qa{display:flex;gap:6px;overflow-x:auto;padding:8px 12px 0;background:#fff;border-top:1px solid var(--so-line);scrollbar-width:none}
#so_root .so-qa::-webkit-scrollbar{display:none}
#so_root .so-tplb{flex:0 0 auto;border:1px solid var(--so-line);background:var(--so-bg);border-radius:999px;padding:5px 12px;font:inherit;font-size:12.5px;color:var(--so-fg);cursor:pointer;white-space:nowrap}
#so_root .so-honest{font-size:11.5px;color:var(--so-mut);padding:6px 14px 0;background:#fff}
#so_root .so-comp{display:flex;gap:8px;align-items:flex-end;padding:8px 12px 12px;background:#fff}
#so_root .so-mode{flex:0 0 auto;height:40px;border:1px solid var(--so-line);background:#fff;border-radius:12px;padding:0 10px;font:inherit;font-size:12.5px;cursor:pointer;color:var(--so-fg)}
#so_root .so-mode.on{background:#FFF4CC;border-color:#E8CF73}
#so_root .so-comp textarea{flex:1;min-width:0;resize:none;border:1px solid var(--so-line);border-radius:12px;padding:9px 12px;font:inherit;height:40px;max-height:120px;background:#fff;color:var(--so-fg)}
#so_root .so-send{flex:0 0 auto;width:44px;height:40px;border:0;border-radius:12px;background:var(--so-navy);color:#fff;cursor:pointer;display:grid;place-items:center}
#so_root .so-send:disabled{opacity:.5}
#so_root .so-ohd{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:14px 16px 10px}
#so_root .so-ob{flex:1;overflow:auto;min-height:0;padding:2px 16px 0;display:flex;flex-direction:column;gap:12px}
#so_root .so-frow{display:grid;grid-template-columns:96px 1fr;gap:8px;align-items:center}
#so_root .so-frow>label{font-size:13px;color:var(--so-mut)}
#so_root .so-frow2{display:grid;grid-template-columns:96px minmax(0,1fr) auto minmax(0,.9fr);gap:8px;align-items:center}
#so_root .so-frow2>label{font-size:13px;color:var(--so-mut)}
#so_root .so-in,#so_root .so-sel{border:1px solid var(--so-line);border-radius:10px;padding:8px 10px;font:inherit;background:#fff;color:var(--so-fg);min-width:0;width:100%}
#so_root .so-in:disabled{background:#F6F8FB;color:var(--so-ink)}
#so_root .so-sel{cursor:pointer}
#so_root .so-seg{display:grid;grid-template-columns:1fr 1fr;gap:4px;background:var(--so-bg);border-radius:12px;padding:4px}
#so_root .so-seg button{border:0;background:transparent;border-radius:9px;padding:7px 6px;font:inherit;font-size:13px;color:var(--so-mut);cursor:pointer}
#so_root .so-seg button.on{background:#fff;color:var(--so-ink);font-weight:700;box-shadow:0 1px 2px rgba(16,42,67,.1)}
#so_root .so-osel{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}
#so_root .so-osel::-webkit-scrollbar{display:none}
#so_root .so-sech{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
#so_root .so-sech b{color:var(--so-ink);font-size:15px}
#so_root .so-tbw{border:1px solid var(--so-line);border-radius:12px;overflow:hidden}
#so_root table.so-tb{width:100%;border-collapse:collapse;font-size:13px}
#so_root .so-tb th{font-size:12px;color:var(--so-ink);font-weight:600;text-align:left;padding:8px 6px;border-bottom:1px solid var(--so-line);background:#F2F6FB;white-space:nowrap}
#so_root .so-tb td{padding:4px 4px;border-bottom:1px solid var(--so-line);vertical-align:middle}
#so_root .so-tb tr:last-child td{border-bottom:0}
#so_root .so-tb .r{text-align:right}
#so_root .so-tb .c{text-align:center;color:var(--so-mut)}
#so_root .so-tb input,#so_root .so-tb textarea{width:100%;border:1px solid transparent;border-radius:8px;padding:6px 6px;font:inherit;font-size:13px;line-height:1.35;background:transparent;color:var(--so-fg);min-width:0}
#so_root .so-tb textarea{display:block;resize:none;field-sizing:content;min-height:32px}
#so_root .so-tb input:hover,#so_root .so-tb textarea:hover{border-color:var(--so-line)}
#so_root .so-tb input:focus,#so_root .so-tb textarea:focus{border-color:var(--so-blue);background:#fff}
#so_root .so-tb .w-no{width:34px}
#so_root .so-tb .w-qty{width:54px}
#so_root .so-tb .w-unit{width:64px}
#so_root .so-tb .w-price{width:80px}
#so_root .so-tb .w-sum{width:84px;padding-right:8px}
#so_root .so-tb .w-del{width:30px}
#so_root .so-tb input.n{text-align:right}
#so_root .so-tb small{display:block;color:var(--so-mut);padding:0 6px;font-size:11px}
#so_root .so-del{border:0;background:none;color:var(--so-mut);cursor:pointer;padding:4px;display:grid;place-items:center}
#so_root .so-del:hover{color:var(--so-bad)}
#so_root .so-two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;align-items:start}
#so_root .so-sum{display:flex;flex-direction:column;gap:8px;font-size:13.5px}
#so_root .so-sum .ln{display:flex;justify-content:space-between;gap:10px;align-items:center}
#so_root .so-total{background:var(--so-cream2);border:1px solid var(--so-cream);border-radius:12px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;font-weight:700;color:var(--so-ink);font-size:15.5px}
#so_root .so-hint{font-size:11.5px;color:var(--so-mut)}
#so_root .so-stat{display:grid;grid-template-columns:1fr 1fr;gap:12px}
#so_root .so-stat h4{display:flex;align-items:center;gap:6px;margin:0 0 6px;font-size:14px;color:var(--so-ink)}
#so_root .so-sel.job{background:var(--so-sky);border-color:var(--so-sky);color:var(--so-ink);font-weight:600}
#so_root .so-sel.pay{background:var(--so-cream2);border-color:var(--so-cream);color:#6B4A12;font-weight:600}
#so_root .so-grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
#so_root .so-fld{display:flex;flex-direction:column;gap:4px;min-width:0}
#so_root .so-fld>span{font-size:12px;color:var(--so-mut)}
#so_root .so-att{display:flex;flex-direction:column;gap:6px}
#so_root .so-att .f{display:flex;align-items:center;gap:8px;border:1px solid var(--so-line);border-radius:10px;padding:6px 10px;font-size:12.5px}
#so_root .so-att .f b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}
#so_root .so-act2{display:grid;grid-template-columns:1fr 1fr;gap:10px;position:sticky;bottom:0;background:#fff;padding:10px 0 14px;border-top:1px solid var(--so-line);margin-top:2px}
#so_root .so-act2 .so-btn{width:100%;padding:13px 8px;font-size:14.5px;border-radius:12px}
#so_root .so-dirty{font-size:12px;color:#8A5B00;background:#FFF4CC;border-radius:10px;padding:6px 10px}
#so_root .so-prod{position:relative}
#so_root .so-prodbox{position:absolute;z-index:35;top:calc(100% + 4px);right:0;width:min(360px,80vw);background:#fff;border:1px solid var(--so-line);border-radius:12px;box-shadow:0 10px 30px rgba(16,42,67,.18);padding:8px;display:flex;flex-direction:column;gap:6px;max-height:320px;overflow:auto}
#so_root .so-prodbox .pr{border:1px solid var(--so-line);background:#fff;border-radius:10px;padding:7px 10px;text-align:left;font:inherit;font-size:13px;cursor:pointer;color:var(--so-fg)}
#so_root .so-picker{padding:8px 12px;border-bottom:1px solid var(--so-line);background:#FAFBFD;display:flex;flex-direction:column;gap:6px}
#so_root .so-picker .pk{border:1px solid var(--so-line);background:#fff;border-radius:10px;padding:7px 10px;text-align:left;font:inherit;font-size:13px;cursor:pointer;color:var(--so-fg)}
#so_root .so-more{border:1px solid var(--so-line);border-radius:12px;background:#fff;margin-top:2px}
#so_root .so-more>summary{cursor:pointer;padding:10px 12px;font-weight:600;color:var(--so-ink);font-size:13.5px;list-style:none}
#so_root .so-more>summary::-webkit-details-marker{display:none}
#so_root .so-more[open]>summary{border-bottom:1px solid var(--so-line)}
#so_root .so-morebody{padding:10px 12px;display:flex;flex-direction:column;gap:10px}
#so_root .so-sug{display:flex;flex-direction:column;gap:4px;background:#fff;border:1px solid var(--so-line);border-radius:12px;padding:6px;box-shadow:0 8px 24px rgba(15,42,79,.12)}
#so_root .so-sug[hidden]{display:none}
#so_root .so-sug .pk{border:1px solid var(--so-line);background:#fff;border-radius:10px;padding:8px 10px;text-align:left;font:inherit;font-size:13.5px;cursor:pointer;color:var(--so-fg)}
#so_modalwrap{position:fixed;inset:0;z-index:95;display:grid;place-items:center;background:rgba(10,24,44,.45);padding:14px}
#so_modal{background:#fff;border-radius:16px;max-width:600px;width:100%;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 18px 60px rgba(0,0,0,.3);color:#1B2433;font-size:14px}
#so_modal .mh{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:14px 16px;border-bottom:1px solid #E3E9F1}
#so_modal .mh b{color:#0F2A4F;font-size:15.5px}
#so_modal .mb{padding:14px 16px;overflow:auto;min-height:0;font-size:13.5px}
#so_modal .mf{display:flex;gap:8px;justify-content:flex-end;padding:12px 16px;border-top:1px solid #E3E9F1;flex-wrap:wrap}
#so_modal .so-btn{border:1px solid #E3E9F1;background:#fff;border-radius:10px;padding:8px 14px;font:inherit;font-size:13.5px;color:#1B2433;cursor:pointer}
#so_modal .so-btn.pri{background:#12335F;border-color:#12335F;color:#fff}
#so_modal .so-btn.danger{background:#B42318;border-color:#B42318;color:#fff}
#so_modal .so-btn:disabled{opacity:.5;cursor:default}
#so_modal textarea{width:100%;font:inherit;font-size:13px;border:1px solid #E3E9F1;border-radius:10px;padding:10px;white-space:pre-wrap;color:#1B2433}
#so_modal table{width:100%;border-collapse:collapse;font-size:13px}
#so_modal th{font-size:11.5px;color:#6B7587;text-align:left;padding:5px 6px;border-bottom:1px solid #E3E9F1;white-space:nowrap}
#so_modal td{padding:4px 4px;border-bottom:1px solid #EEF2F7;vertical-align:top}
#so_modal td input[type=text]{width:100%;border:1px solid #E3E9F1;border-radius:8px;padding:5px 6px;font:inherit;font-size:13px;min-width:0}
#so_modal .warn{background:#FDECEC;color:#B42318;border-radius:10px;padding:8px 12px;margin-bottom:10px}
#so_modal .okx{background:#E7F7EE;color:#0F6B3A;border-radius:10px;padding:8px 12px;margin-bottom:10px}
#so_modal .mut{color:#6B7587}
#so_modal .rcpt{background:#F2F6FB;border-radius:10px;padding:8px 12px;margin-bottom:10px}
#so_modal .chan{display:flex;flex-direction:column;gap:8px;margin-top:10px}
#so_modal .chan .c{display:flex;align-items:center;gap:10px;border:1px solid #E3E9F1;border-radius:12px;padding:10px 12px}
#so_modal .chan .c.off{background:#F7FAFD}
#so_modal .chan .c b{flex:1;font-weight:600}
#so_modal .bound{color:#0F6B3A;font-size:11px}
#so_root .so-av{position:relative;overflow:hidden}
#so_root .so-av img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
#so_root .so-src{display:inline-block;margin-right:6px;padding:0 6px;border-radius:6px;background:#E3F6EA;color:#0F6B3A;font-size:10.5px;font-weight:700;letter-spacing:.2px;vertical-align:1px}
#so_root .so-chip.ok{background:#1F9D55;color:#fff}
#so_root .so-chip.warn{background:#E8832A;color:#fff}
#so_root .so-lnote{font-size:11.5px;color:var(--so-mut);padding:6px 14px;background:#F2F6FB;border-bottom:1px solid var(--so-line)}
#so_root .so-m.in .so-bub.ph{background:#F2F6FB;color:var(--so-mut);font-style:italic}
#so_root .so-dl{font-size:11.5px;padding:0 4px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}
#so_root .so-dl.wait{color:#B5862A}
#so_root .so-dl.ok{color:#0F6B3A}
#so_root .so-dl.bad{color:var(--so-bad)}
#so_root .so-dl.off{color:var(--so-mut)}
#so_root .so-dl button{border:1px solid currentColor;background:#fff;color:inherit;border-radius:999px;padding:1px 10px;font:inherit;font-size:11.5px;cursor:pointer}
#so_root .so-dl button:disabled{opacity:.5;cursor:default}
#so_modal .lstat{margin-top:8px;padding:8px 12px;border-radius:10px;font-size:13px}
#so_modal .lstat.wait{background:#FFF4CC;color:#7A5A00}
#so_modal .lstat.ok{background:#E7F7EE;color:#0F6B3A}
#so_modal .lstat.bad{background:#FDECEC;color:#B42318}
@media (max-width:900px){
  #so_root{height:auto;min-height:0;display:block}
  #so_root .so-cols{display:flex;flex-direction:column;padding:0;gap:0}
  #so_root .so-mtabs{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:6px;background:#fff;border-bottom:1px solid var(--so-line);flex:0 0 auto}
  #so_root .so-mtabs button{border:0;background:var(--so-bg);border-radius:10px;padding:9px 4px;font:inherit;font-size:13px;color:var(--so-mut);cursor:pointer;position:relative}
  #so_root .so-mtabs button.on{background:var(--so-navy);color:#fff;font-weight:700}
  #so_root .so-mtabs .dot{position:absolute;top:6px;right:10px;width:8px;height:8px;border-radius:50%;background:#E8832A}
  #so_root .so-col{display:none;border-radius:0;border:0;box-shadow:none}
  #so_root.m-list .so-list{display:flex}
  #so_root.m-list .so-items{overflow:visible}
  #so_root.m-chat .so-cols,#so_root.m-order .so-cols{position:fixed;inset:0;z-index:60;background:#fff}
  #so_root.m-chat .so-chat,#so_root.m-order .so-ord{display:flex;flex:1;min-height:0}
  #so_root .so-m{max-width:88%}
  #so_root .so-two,#so_root .so-stat{grid-template-columns:1fr}
  #so_root .so-grid3{grid-template-columns:1fr 1fr}
  #so_root .so-frow2{grid-template-columns:96px minmax(0,1fr)}
  #so_root .so-frow2>label:nth-of-type(2){grid-column:1}
  #so_root .so-ohd,#so_root .so-ob{padding-left:12px;padding-right:12px}
  #so_root .so-ch .so-chip.lite{display:none}
  #so_root .so-tb thead{display:none}
  #so_root .so-tb,#so_root .so-tb tbody{display:block}
  #so_root .so-tb tr{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,.8fr) minmax(0,1fr) minmax(0,1fr) 30px;gap:2px 6px;padding:8px 6px;border-bottom:1px solid var(--so-line);align-items:end}
  #so_root .so-tb tr:last-child{border-bottom:0}
  #so_root .so-tb td{display:block;border:0;padding:0;width:auto}
  #so_root .so-tb td.w-no{display:none}
  #so_root .so-tb td.w-name,#so_root .so-tb td[colspan]{grid-column:1/-1}
  #so_root .so-tb td[data-l]::before{content:attr(data-l);display:block;font-size:10.5px;color:var(--so-mut);padding:0 6px}
  #so_root .so-tb td.w-sum{padding:0 0 7px 6px;text-align:left}
  #so_root .so-tb td.w-sum::before{padding:0 0 6px}
  #so_root .so-tb input.n{text-align:left}
  #so_root .so-tb td.w-del{padding-bottom:2px}
}`

  function css(){if($('so_css'))return;const s=document.createElement('style');s.id='so_css';s.textContent=CSS;document.head.appendChild(s)}

  function mount(){
    const v=$('view')||document.body
    v.innerHTML=''
    const root=document.createElement('div')
    root.id='so_root'
    root.innerHTML=`
      <div class="so-cols">
        <nav class="so-mtabs" id="so_mtabs" aria-label="สลับส่วนของหน้า"></nav>
        <aside class="so-col so-list" aria-label="แชตลูกค้า">
          <div class="so-lhd"><span class="ttl">${ic('chat',22)} แชตลูกค้า</span><button type="button" class="so-btn sm pri" data-a="picker">${ic('plus',14)} แชตใหม่</button><button type="button" class="so-btn sm" data-a="closedsum" title="ยอดงานที่ปิดแล้ว แยกตามผู้รับผิดชอบ">ยอดปิดงาน</button></div>
          <div class="so-chan" id="so_chan"></div>
          <label class="so-srch">${ic('search',16)}<input id="so_q" type="search" placeholder="ค้นหาชื่อลูกค้า ข้อความ หรือเลขออเดอร์…" aria-label="ค้นหาแชต" autocomplete="off" value="${E(S.q)}"></label>
          <div class="so-tabs" id="so_tabs" role="tablist"></div>
          <div id="so_picker"></div>
          <div class="so-items" id="so_items"></div>
        </aside>
        <section class="so-col so-chat" id="so_chat" aria-label="ห้องแชต"></section>
        <aside class="so-col so-ord" id="so_ord" aria-label="ใบสั่งงาน"></aside>
      </div>
      <div id="so_modalhost"></div>
      <input id="so_chatfile" type="file" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" hidden>
      <input id="so_ordfile" type="file" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" hidden>`
    v.appendChild(root)
    root.addEventListener('click',onClick)
    root.addEventListener('input',onInput)
    root.addEventListener('change',onChange)
    root.addEventListener('keydown',onKey)
    // รูปโปรไฟล์ LINE โหลดไม่ได้ (ลิงก์หมดอายุ/ถูกบล็อก): เอารูปออก ตัวอักษรย่อด้านล่างยังอยู่ (error ไม่ bubble จึงดักตอน capture)
    root.addEventListener('error',e=>{const el=e.target;if(el&&el.tagName==='IMG'&&el.closest&&el.closest('.so-av'))el.remove()},true)
  }

  function applyMode(){const r=$('so_root');if(r)r.className='m-'+S.mode;paintMTabs()}
  function setMode(m){S.mode=m;applyMode()}
  // แจ้งผลในช่องที่พนักงานกำลังทำงานอยู่: 'chat' = ห้องแชต · 'ord' = ใบสั่งงาน · ไม่ระบุ = ทั้งสองช่อง
  function flash(msg,bad,where){S.flash=msg;S.flashErr=!!bad;S.flashWhere=where||'';const tk=++S.flashTok;paintFlash();setTimeout(()=>{if(S.flashTok===tk){S.flash='';paintFlash()}},bad?7000:4500)}
  function paintFlash(){
    document.querySelectorAll('#so_root .so-flashbox').forEach(el=>{el.innerHTML=S.flash&&(!S.flashWhere||el.dataset.where===S.flashWhere)?`<div class="so-flash${S.flashErr?' bad':''}" role="status">${E(S.flash)}</div>`:''})
  }
  async function q(fn){try{const r=await fn();return r&&typeof r==='object'?r:{data:null,error:null}}catch(e){return {data:null,error:{message:String((e&&e.message)||e||'เกิดข้อผิดพลาด')}}}}
  const errMsg=r=>(r&&r.error&&(r.error.message||r.error.msg||String(r.error)))||''
  const niceErr=m=>String(m||'').replace(/^(saleorders|saleline):\s*/,'')

  async function loadStaff(){
    try{
      if(typeof sb==='undefined'||!(sb&&sb.auth&&sb.auth.getUser))return
      const r=await sb.auth.getUser()
      const u=r&&r.data&&r.data.user
      if(!u)return
      const md=u.user_metadata||{}
      S.staff=md.name||md.full_name||(u.email||'').split('@')[0]||S.staff
    }catch(e){}
  }
  async function loadRefs(){
    const [st,sc]=await Promise.all([
      q(()=>sb.from('stores').select('id,name,vat_rate').order('name')),
      q(()=>sb.from('schools').select('id,name,short_code').eq('active',true).order('name').limit(300))])
    S.stores=errMsg(st)?[]:(st.data||[])
    S.storesErr=errMsg(st)
    S.schools=errMsg(sc)?[]:(sc.data||[])
  }
  const vatStores=()=>S.stores.filter(s=>num(s.vat_rate)>0)

  function paintAll(){paintChan();paintTabs();paintList();paintPicker();paintChat();paintOrd();applyMode()}

  // ---------- สถานะช่องทาง LINE: มาจากสัญญาณชีพที่บอทเขียนเอง ไม่ใช่การสมมติ ----------
  const LINE_FRESH_MS=3*60*1000 // บอทรายงานตัวทุกนาที: เงียบเกิน 3 นาที = ขาดการติดต่อ
  function quotaInfo(){
    const q=S.line&&S.line.detail&&S.line.detail.quota
    if(!q)return null
    if(q.type==='limited'&&q.limit!=null&&q.used!=null)return {left:Math.max(0,num(q.limit)-num(q.used)),limit:num(q.limit),at:q.at}
    return {left:null,limit:null,at:q.at}
  }
  // → { k: none|stale|off|pilot|on, t: ข้อความป้าย, tip, ok: ส่งผ่านบอทได้ตอนนี้ }
  function lineState(){
    const s=S.line
    if(!s)return {k:'none',t:'LINE OA: ยังไม่ได้เชื่อมต่อ',tip:'บอท LINE ยังไม่เคยรายงานตัวเข้าหน้านี้ ข้อความจาก LINE จะไม่เข้ามาและส่งตอบจากหน้านี้ไม่ได้',ok:false}
    const age=Date.now()-tms(s.last_seen_at)
    if(!(age<LINE_FRESH_MS))return {k:'stale',t:'LINE OA: ขาดการติดต่อ',tip:'บอทรายงานตัวล่าสุด '+tFull(s.last_seen_at)+' — อาจกำลังพักหรือหยุดทำงาน ข้อความที่ส่งจากหน้านี้จะรอส่งได้ไม่เกิน 30 นาที',ok:false}
    if(s.mode==='off')return {k:'off',t:'LINE OA: ปิดการรับ-ส่ง',tip:'บอทเชื่อมฐานข้อมูลแล้ว แต่ยังปิดสวิตช์ข้อความจากหน้านี้ (SALECHAT_MODE=off)',ok:false}
    const qi=quotaInfo()
    const qt=qi&&qi.left!=null?' · โควตาข้อความ LINE เหลือประมาณ '+qi.left+' จาก '+qi.limit+(qi.at?' (ตรวจ '+tFull(qi.at)+')':''):''
    if(s.mode==='pilot')return {k:'pilot',t:'LINE OA: ทดลอง',tip:'เปิดทดลอง — รับและส่งเฉพาะลูกค้าที่อยู่ในรายชื่อทดสอบ'+qt,ok:true}
    return {k:'on',t:'LINE OA: เชื่อมต่อแล้ว',tip:'บอทรายงานตัวล่าสุด '+tFull(s.last_seen_at)+qt,ok:true}
  }
  function chanChip(){
    const st=lineState()
    const cls=st.k==='on'?'ok':st.k==='pilot'?'warn':'lite'
    return `<span class="so-chip ${cls}" title="${E(st.tip)}">${E(st.t)}</span>`
  }
  function paintChan(){
    const b=$('so_chan');if(!b)return
    const html=chanChip()+'<span class="so-chip lite" title="ยังไม่ได้เชื่อมต่อ Facebook">Facebook: ยังไม่ได้เชื่อมต่อ</span>'
    if(b.dataset.html!==html){b.innerHTML=html;b.dataset.html=html}
  }
  async function loadLine(force){
    // ตารางยังไม่มี (ยังไม่ได้ติดตั้ง 003) หรืออ่านไม่ได้ = "ยังไม่ได้เชื่อมต่อ" ไม่ใช่ข้อผิดพลาดที่ต้องขึ้นเตือน
    // และไม่ถามซ้ำทุกไม่กี่วินาที (เว้น 2 นาที) · force = ถามเดี๋ยวนี้
    if(!force&&Date.now()<S.statusOffUntil)return
    const r=await q(()=>sb.from('sale_line_status').select('*').eq('channel_key','main').limit(1))
    if(errMsg(r)){S.line=null;S.statusOffUntil=Date.now()+120000}
    else{S.line=(r.data&&r.data[0])||null;S.statusOffUntil=0}
    paintChan();paintLineBits()
  }
  const isLine=t=>!!t&&t.source==='line'
  // รูปโปรไฟล์ LINE ของลูกค้า (ถ้าโหลดไม่ได้ ตัวอักษรย่อด้านล่างยังอยู่ — ดู capture ของ error ใน mount)
  const avImg=t=>{const l=S.links[t&&t.id];return l&&/^https:\/\//.test(l.picture_url||'')?`<img src="${E(l.picture_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:''}

  function keepDraft(){const old=$('so_txt');if(old&&old.dataset.id)S.drafts[old.dataset.id]=old.value}
  function setDraft(id,v){S.drafts[id]=v;const ta=$('so_txt');if(ta&&ta.dataset.id===id)ta.value=v}

  function paintMTabs(){
    const b=$('so_mtabs');if(!b)return
    const t=S.list.find(x=>x.id===S.sel)
    const dirty=!!(S.ord&&isDirty())
    const unread=S.list.reduce((a,x)=>a+(x.unread>0?1:0),0)
    const html=[['list','รายชื่อแชต',unread>0],['chat','แชต',false],['order','ออเดอร์',dirty]].map(([k,lb,dot])=>`<button type="button" data-a="mmode" data-k="${k}" class="${S.mode===k?'on':''}"${k!=='list'&&!t?' disabled':''}>${lb}${dot?'<span class="dot"></span>':''}</button>`).join('')
    // วาดใหม่เฉพาะเมื่อเปลี่ยนจริง: ถ้าวาดทับตอนช่องที่แก้เสียโฟกัส (กดแท็บต่อทันที) ปุ่มที่กำลังกดจะหายและการกดหาย
    if(b.dataset.html!==html){b.innerHTML=html;b.dataset.html=html}
  }

  // ---------- รายชื่อแชต ----------
  function paintTabs(){
    const t=$('so_tabs');if(!t)return
    t.innerHTML=TABS.map(([k,lb,f])=>`<button type="button" role="tab" aria-selected="${S.tab===k}" class="so-tab${S.tab===k?' on':''}" data-a="tab" data-k="${k}">${lb} (${S.list.filter(f).length})</button>`).join('')
  }

  function rowChip(t){
    const os=ordsOf(t)
    const open=os.find(o=>isOpenJob(o.job_status))
    if(open){const j=JN[open.job_status]||{};return `<span class="so-chip" style="--c:${j.c||'#7A8394'}" title="${E(open.order_no)}">${E(j.t||open.job_status)}</span>`}
    const st=STG[t.stage]||STG.talk
    return `<span class="so-chip" style="--c:${st.c}">${st.t}</span>`
  }

  function paintList(){
    const box=$('so_items');if(!box)return
    paintTabs()
    if(S.listLoading){box.innerHTML='<div class="so-empty">กำลังโหลดรายชื่อแชต…</div>';return}
    const f=(TABS.find(x=>x[0]===S.tab)||TABS[0])[2]
    const qq=S.q.trim().toLowerCase()
    const rows=S.list.filter(f).filter(t=>!qq||`${t.title||''} ${t.phone||''} ${t.last_text||''} ${ordsOf(t).map(o=>o.order_no).join(' ')}`.toLowerCase().includes(qq))
    const errHtml=S.errList?`<div class="so-err">${E(S.errList)} <button type="button" class="so-btn sm" data-a="retrylist">ลองใหม่</button></div>`:''
    if(!rows.length){box.innerHTML=errHtml+`<div class="so-empty">${S.list.length?'ไม่มีแชตในแท็บนี้':(lineState().ok?'ยังไม่มีแชตในระบบ — ข้อความจากลูกค้าทาง LINE จะเข้ามาที่นี่เอง หรือกด "แชตใหม่" เพื่อเปิดแชตจากรายชื่อลูกค้า':'ยังไม่มีแชตในระบบ — กด "แชตใหม่" เพื่อเปิดแชตจากรายชื่อลูกค้า (LINE OA ยังไม่ได้เชื่อมต่อ ข้อความลูกค้าจึงยังไม่เข้ามาที่นี่)')}</div>`;return}
    box.innerHTML=errHtml+rows.map(t=>`
      <button type="button" class="so-row${S.sel===t.id?' on':''}${t.tag?' tagged':''}" style="${t.tag?'--tc:'+TAGN[t.tag].c:''}" data-a="open" data-id="${E(t.id)}" title="${t.tag?TAGN[t.tag].t:''}">
        <span class="so-av" style="background:${colorOf(t)}">${E(initial(t.title))}${avImg(t)}</span>
        <span class="so-rw">
          <span class="so-r1"><span class="so-nm">${isLine(t)?'<span class="so-src">LINE</span>':''}${E(t.title||'ไม่มีชื่อ')}</span><span class="so-tm">${E(tShort(t.last_at))}</span></span>
          <span class="so-r1"><span class="so-pv">${E(t.last_text||'ยังไม่มีข้อความ')}</span>${t.unread>0?`<span class="so-unread" aria-label="ยังไม่ได้อ่าน ${E(t.unread)} ข้อความ">${E(t.unread)}</span>`:rowChip(t)}</span>
        </span>
      </button>`).join('')
  }

  function paintPicker(){
    const p=$('so_picker');if(!p)return
    if(!S.picker){p.innerHTML='';return}
    const nm=S.pickQ.trim()
    p.innerHTML=`<div class="so-picker"><input id="so_cq" class="so-in" type="search" placeholder="พิมพ์ชื่อลูกค้า หรือเบอร์โทร" aria-label="ค้นหาลูกค้า" autocomplete="off" value="${E(S.pickQ)}">
      <div style="display:flex;flex-direction:column;gap:6px">${S.pick.map(c=>`<button type="button" class="pk" data-a="pickc" data-id="${E(c.id)}">${E(c.name||'ไม่มีชื่อ')} <small style="color:var(--so-mut)">${E(c.phone||'')}</small></button>`).join('')}
      ${nm?`<button type="button" class="pk" data-a="picknew">+ เปิดแชตชื่อ "${E(nm)}" (ยังไม่ผูกกับฐานลูกค้า)</button>`:'<small style="color:var(--so-mut)">ค้นหาลูกค้าเดิม หรือพิมพ์ชื่อเพื่อเปิดแชตใหม่</small>'}</div></div>`
  }

  async function searchCust(text){
    S.pickQ=text
    const tk=++S.ctok
    const s=clean(text)
    if(!s){S.pick=[];paintPickerKeep();return}
    const r=await q(()=>sb.from('customers').select('id,name,phone,line_name').or(`name.ilike.*${s}*,phone.ilike.*${s}*`).limit(8))
    if(tk!==S.ctok)return
    S.pick=errMsg(r)?[]:(r.data||[])
    paintPickerKeep()
  }
  function paintPickerKeep(){
    const i=$('so_cq');const pos=i?i.selectionStart:null
    paintPicker()
    const j=$('so_cq');if(j){j.focus();if(pos!=null)j.setSelectionRange(pos,pos)}
  }

  // ลูกค้าในช่อง "ลูกค้า" ของใบสั่งงาน: พิมพ์ชื่อหรือเบอร์ (2 ตัวอักษรขึ้นไป) แล้วขึ้นรายชื่อลูกค้าที่มีอยู่ให้เลือก · พิมพ์ชื่อใหม่เองก็ได้
  async function searchOrdCust(text){
    const tk=S.octok=(S.octok||0)+1
    const s=clean(text)
    const b=$('so_cnsug');if(!b)return
    if(s.length<2){b.hidden=true;b.innerHTML='';return}
    const r=await q(()=>sb.from('customers').select('id,name,phone').or(`name.ilike.*${s}*,phone.ilike.*${s}*`).limit(6))
    if(tk!==S.octok||!S.ord)return
    const rows=errMsg(r)?[]:(r.data||[])
    const box=$('so_cnsug');if(!box)return
    if(!rows.length){box.hidden=true;box.innerHTML='';return}
    box.hidden=false
    box.innerHTML=rows.map(c=>`<button type="button" class="pk" data-a="pickordcust" data-id="${E(c.id)}" data-n="${E(c.name||'')}" data-p="${E(c.phone||'')}"><b>${E(c.name||'ไม่มีชื่อ')}</b> <small style="color:var(--so-mut)">${E(c.phone||'ไม่มีเบอร์')}</small></button>`).join('')
  }
  // เลือกลูกค้าที่มีอยู่: ผูกใบนี้กับบัญชีนั้น และเติมชื่อกับเบอร์ให้ (แก้ต่อได้)
  function pickOrdCust(id,name,phone){
    if(!S.ord)return
    S.ord.customer_id=id||null;S.ord.linkedName=name||''
    S.ord.customer_name=name||'';S.ord.phone=phone||''
    const b=$('so_cnsug');if(b){b.hidden=true;b.innerHTML=''}
    paintOrd()
  }

  // การ์ดลูกค้าด้านบนใบสั่งงาน: ผูกแล้ว (t.customer_id มีค่า) → โชว์ชื่อ/เบอร์/ยอดซื้อรวม-จำนวนงาน-งานกำลังทำ (ทุกแชตของลูกค้ารายนี้)
  // ยังไม่ผูก → โชว์ปุ่ม "ผูกกับลูกค้า" ให้ค้นหาและเลือกบัญชีเดิมได้ทันที ไม่ต้องรอให้มีใบสั่งงานก่อน (ปกติผูกอัตโนมัติตอนบันทึกใบแรก)
  function custCard(t){
    if(t.customer_id&&S.cust){
      const cu=S.cust,st=S.custStats
      return `<div style="border:1px solid var(--so-line);border-radius:12px;padding:10px 12px;margin-bottom:10px;display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><b>${E(cu.name||'ลูกค้า')}</b><span class="so-hint">${E(cu.phone||'ไม่มีเบอร์')}</span></div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;text-align:center">
          <div><b style="display:block;font-size:16px">${st?st.n:'-'}</b><span class="so-hint">งานทั้งหมด</span></div>
          <div><b style="display:block;font-size:16px">${st?money(st.sum):'-'}</b><span class="so-hint">ยอดซื้อรวม (฿)</span></div>
          <div><b style="display:block;font-size:16px">${st?st.open:'-'}</b><span class="so-hint">งานกำลังทำ</span></div>
        </div>
      </div>`
    }
    return `<div style="border:1px dashed var(--so-line);border-radius:12px;padding:10px 12px;margin-bottom:10px;display:flex;flex-direction:column;gap:8px">
      <span class="so-hint">ยังไม่ผูกกับลูกค้าในระบบ (ผูกอัตโนมัติตอนบันทึกใบสั่งงานใบแรก หรือผูกเองตอนนี้ก็ได้)</span>
      ${S.custLink?`<input id="so_clq" class="so-in" type="search" placeholder="ค้นหาชื่อหรือเบอร์ลูกค้า…" value="${E(S.custLinkQ)}" autocomplete="off" aria-label="ค้นหาลูกค้า"><div id="so_clsug" class="so-sug" hidden></div>`
        :`<button type="button" class="so-btn sm" data-a="custlinktoggle">ผูกกับลูกค้า</button>`}
    </div>`
  }
  async function searchThreadCust(text){
    S.custLinkQ=text
    const tk=S.cltok=(S.cltok||0)+1
    const s=clean(text)
    if(s.length<2){S.custLinkRows=[];const b=$('so_clsug');if(b){b.hidden=true;b.innerHTML=''}return}
    const r=await q(()=>sb.from('customers').select('id,name,phone').or(`name.ilike.*${s}*,phone.ilike.*${s}*`).limit(6))
    if(tk!==S.cltok)return
    S.custLinkRows=errMsg(r)?[]:(r.data||[])
    const b=$('so_clsug');if(!b)return
    if(!S.custLinkRows.length){b.hidden=true;b.innerHTML='';return}
    b.hidden=false
    b.innerHTML=S.custLinkRows.map(c=>`<button type="button" class="pk" data-a="pickthreadcust" data-id="${E(c.id)}" data-n="${E(c.name||'')}" data-p="${E(c.phone||'')}"><b>${E(c.name||'ไม่มีชื่อ')}</b> <small style="color:var(--so-mut)">${E(c.phone||'ไม่มีเบอร์')}</small></button>`).join('')
  }
  async function pickThreadCust(id,name,phone){
    const tid=S.sel,t=S.list.find(x=>x.id===tid)
    if(!tid||!t||!id)return
    const now=new Date().toISOString()
    const r=await q(()=>sb.from('sale_threads').update({customer_id:id,updated_at:now}).eq('id',tid))
    if(errMsg(r)){flash('ผูกกับลูกค้าไม่สำเร็จ: '+errMsg(r),true,'ord');return}
    await q(()=>sb.from('sale_msgs').insert({thread_id:tid,dir:'note',kind:'system',body:'ผูกแชตนี้กับลูกค้า "'+(name||'')+'"',by_name:S.staff}))
    t.customer_id=id
    S.cust={id,name:name||'',phone:phone||''}
    S.custLink=false;S.custLinkQ='';S.custLinkRows=[]
    const cs=await q(()=>sb.from('sale_orders').select('total,job_status').eq('customer_id',id).limit(2000))
    S.custStats=errMsg(cs)?null:{n:(cs.data||[]).length,sum:(cs.data||[]).reduce((a,r)=>a+num(r.total),0),open:(cs.data||[]).filter(r=>isOpenJob(r.job_status)).length}
    paintOrd()
    flash('ผูกกับลูกค้า "'+(name||'')+'" แล้ว',false,'ord')
  }

  // ---------- ห้องแชต ----------
  // สถานะการส่งของข้อความที่ตอบทาง LINE — มาจากคิวส่ง (บอทแจ้งผลหลัง LINE ตอบ) ไม่ใช่จากหน้าจอ
  function deliveryHtml(m,t){
    if(m.dir!=='out')return ''
    const meta=m.meta||{}
    if(meta.src==='oa_manager')return '<div class="so-dl off">ตอบจาก LINE OA Manager · บันทึกไว้ในแชต (ไม่ได้ส่งจากหน้านี้)</div>'
    const d=meta.delivery
    if(!d)return isLine(t)?'<div class="so-dl off">บันทึกในระบบ · ไม่ได้ส่งถึงลูกค้า</div>':''
    const again=`<button type="button" data-a="resend" data-o="${E(meta.out_id||'')}"${S.busyRetry[meta.out_id]?' disabled':''}>ส่งใหม่</button>`
    if(d==='sent')return '<div class="so-dl ok">ส่งถึง LINE แล้ว (LINE รับข้อความแล้ว)</div>'
    if(d==='queued'||d==='sending')return `<div class="so-dl wait">${meta.error?'รอส่งทาง LINE · ครั้งก่อนไม่สำเร็จ ('+E(meta.error)+') กำลังลองใหม่':'รอส่งทาง LINE… ยังไม่ถือว่าส่งถึงลูกค้า'}</div>`
    if(d==='expired')return `<div class="so-dl bad">ไม่ได้ส่ง: รอเกิน 30 นาทีโดยบอทไม่ได้เริ่มส่ง ${again}</div>`
    if(d==='unknown')return `<div class="so-dl bad">ไม่ทราบว่าถึงลูกค้าหรือไม่ (บอทหยุดกลางคัน) · ตรวจใน LINE OA Manager ก่อน กด "ส่งใหม่" ได้ LINE กันไม่ให้ส่งซ้ำ ${again}</div>`
    return `<div class="so-dl bad">ส่งไม่สำเร็จ: ${E(meta.error||'ไม่ทราบสาเหตุ')} ${again}</div>`
  }

  // a link in a text message (http or https only) opens in a new tab; everything else stays the plain text it is (escaped)
  function linkHtml(s){
    const t=String(s==null?'':s);const re=/https?:\/\/[^\s<>"']+/g;let out='',last=0,mm;
    while((mm=re.exec(t))){
      const url=mm[0].replace(/[.,;:!?)\]]+$/,'');
      if(!url.replace(/^https?:\/\//,''))continue;
      out+=E(t.slice(last,mm.index))+`<a href="${E(url)}" target="_blank" rel="noopener noreferrer">${E(url)}</a>`;
      last=mm.index+url.length;re.lastIndex=last
    }
    return out+E(t.slice(last))
  }

  function msgHtml(m,t){
    const cls=m.kind==='system'?'sys':(m.dir==='note'?'note':(m.dir==='out'?'out':'in'))
    const who=cls==='sys'?'ระบบ':(m.dir==='note'?'โน้ตภายใน · '+(m.by_name||S.staff):(m.dir==='out'?(m.by_name||S.staff)+(((m.meta||{}).src==='oa_manager')?' · ตอบใน LINE OA Manager':isLine(t)?'':' · บันทึกในระบบ'):(t.title||'ลูกค้า')))
    const meta=m.meta||{}
    let body
    if((m.kind==='image'||m.kind==='file')&&meta.path){
      const u=S.urls[meta.path]
      body=m.kind==='image'&&u?`<img class="so-img" src="${E(u)}" alt="${E(meta.name||'รูป')}" data-a="openfile" data-p="${E(meta.path)}">`
        :`<button type="button" class="so-file" data-a="openfile" data-p="${E(meta.path)}">${ic(m.kind==='image'?'file':'clip',16)} ${E(meta.name||'ไฟล์แนบ')}${meta.size?` <small>(${Math.max(1,Math.round(meta.size/1024))} KB)</small>`:''}</button>`
    }else{
      // ข้อความของลูกค้าที่ไม่ใช่ตัวอักษร (สติกเกอร์ ไฟล์ เสียง ตำแหน่ง) บอทบันทึกเป็นโน้ตสั้น ๆ — แสดงเป็นป้ายจาง ไม่ให้ปะปนกับข้อความจริง
      const ph=m.dir==='in'&&['sticker','video','audio','location','other','file','image'].includes(m.kind)
      body=`<div class="so-bub${ph?' ph':''}">${m.kind==='text'?linkHtml(m.body):E(m.body)}</div>`
      const la=Number(meta.latitude),lo=Number(meta.longitude)
      if(m.kind==='location'&&meta.latitude!=null&&meta.longitude!=null&&Number.isFinite(la)&&Number.isFinite(lo)&&Math.abs(la)<=90&&Math.abs(lo)<=180)
        body+=`<a class="so-file" href="https://www.google.com/maps?q=${la},${lo}" target="_blank" rel="noopener noreferrer">เปิดแผนที่</a>`
    }
    return `<div class="so-m ${cls}">${body}<div class="so-meta">${E(who)} · ${E(tFull(m.created_at))}</div>${deliveryHtml(m,t)}</div>`
  }

  // ข้อความใต้ช่องพิมพ์: บอกตรง ๆ ว่าข้อความที่พิมพ์จะไปไหน
  function honestText(t){
    if(S.note)return 'โหมดโน้ตภายใน — ลูกค้าไม่เห็นข้อความนี้'
    if(S.oaLog&&isLine(t))return 'โหมดบันทึกจาก LINE OA Manager — ข้อความนี้ไม่ถูกส่งถึงลูกค้าจากหน้านี้ (คุณตอบไปแล้วใน OA Manager) ไม่นับโควตา ใช้เพื่อให้ทุกคนเห็นคำตอบนั้น'
    if(!isLine(t))return 'ข้อความบันทึกในระบบเท่านั้น ยังไม่ถูกส่งถึงลูกค้า (แชตนี้ไม่ได้มาจาก LINE OA)'
    const st=lineState(),qi=quotaInfo()
    const q=qi&&qi.left!=null?(qi.left<=0?' (โควตาเดือนนี้น่าจะเต็มแล้ว ส่งอาจไม่สำเร็จ)':' (เหลือประมาณ '+qi.left+' ข้อความ)'):''
    if(st.ok)return 'ข้อความนี้จะถูกส่งถึงลูกค้าทาง LINE OA และนับเป็น 1 ข้อความจากโควตา'+q+' · ขึ้นว่า "ส่งถึง LINE แล้ว" ก็ต่อเมื่อ LINE รับข้อความแล้วเท่านั้น'
    return st.t+' — ข้อความจะรอส่งได้ไม่เกิน 30 นาที ถ้าบอทไม่มาหยิบทันจะไม่ถูกส่งและแจ้งไว้ที่ข้อความนั้น'
  }
  function lineChip(t){
    return isLine(t)?chanChip():'<span class="so-chip lite" title="แชตนี้เปิดในหลังร้าน ไม่ได้มาจาก LINE OA จึงส่งถึงลูกค้าจากหน้านี้ไม่ได้">บันทึกในระบบเท่านั้น</span>'
  }
  // อัปเดตเฉพาะป้ายสถานะกับข้อความใต้ช่องพิมพ์ (ไม่แตะช่องพิมพ์ ไม่ให้เคอร์เซอร์หลุดระหว่างพนักงานกำลังพิมพ์)
  function paintLineBits(){
    const t=S.list.find(x=>x.id===S.sel);if(!t)return
    const c=$('so_lchip');if(c){const h=lineChip(t);if(c.dataset.html!==h){c.innerHTML=h;c.dataset.html=h}}
    const h=$('so_honest');if(h){const x=honestText(t);if(h.textContent!==x)h.textContent=x}
  }

  function msgsInner(t){
    if(S.msgsLoading)return '<div class="so-empty">กำลังโหลดข้อความ…</div>'
    if(S.errMsgs)return `<div class="so-empty"><b>โหลดข้อความไม่สำเร็จ</b><p>${E(S.errMsgs)}</p><button type="button" class="so-btn" data-a="retrythread">ลองใหม่</button></div>`
    if(!S.msgs.length)return `<div class="so-empty"><b>ยังไม่มีข้อความในแชตนี้</b><p>${isLine(t)?'ข้อความจากลูกค้าทาง LINE จะเข้ามาที่นี่เอง · ':''}บันทึกการคุยด้านล่าง หรือกด "สร้างรายการจากแชต" ในใบสั่งงาน แล้ววางข้อความรายการจากลูกค้า</p></div>`
    let last=''
    return S.msgs.map(m=>{const d=dSep(m.created_at);const sep=d&&d!==last?`<div class="so-day">${E(d)}</div>`:'';if(d)last=d;return sep+msgHtml(m,t)}).join('')
  }
  // วาดเฉพาะรายการข้อความ (ตอนรีเฟรชอัตโนมัติ): ไม่แตะช่องพิมพ์ และไม่ดึงหน้าลงล่างถ้าพนักงานกำลังเลื่อนอ่านข้อความเก่า
  function paintMsgs(){
    const t=S.list.find(x=>x.id===S.sel),ms=$('so_msgs')
    if(!t||!ms||ms.dataset.id!==t.id){paintChat();return}
    const stick=ms.scrollHeight-ms.scrollTop-ms.clientHeight<80,top=ms.scrollTop
    ms.innerHTML=msgsInner(t)
    ms.scrollTop=stick?ms.scrollHeight:top
    paintLineBits()
  }

  function paintChat(){
    const box=$('so_chat');if(!box)return
    keepDraft()
    const t=S.list.find(x=>x.id===S.sel)
    if(!t){box.innerHTML=`<div class="so-empty"><b>เลือกแชตทางซ้ายเพื่อเริ่มงาน</b><p>ข้อความ ใบสั่งงาน และสถานะของลูกค้าแต่ละรายจะอยู่ด้วยกันในหน้านี้</p></div>`;return}
    const old=$('so_msgs')
    const keep=old&&old.dataset.id===t.id?{top:old.scrollTop,stick:old.scrollHeight-old.scrollTop-old.clientHeight<80}:null
    const inner=msgsInner(t)
    const st=STG[t.stage]||STG.talk
    const src=t.source==='line'?'LINE':t.source==='web'?'หน้าเว็บ':'เปิดในหลังร้าน'
    const line=isLine(t)
    box.innerHTML=`
      <div class="so-ch">
        <span class="so-av sm" style="background:${colorOf(t)}">${E(initial(t.title))}${avImg(t)}</span>
        <div class="so-chn"><h2>${E(t.title||'ไม่มีชื่อ')}</h2><small>${E(t.phone||'ยังไม่มีเบอร์')} · ${E(src)}</small></div>
        <span id="so_lchip">${lineChip(t)}</span>
        <button type="button" class="so-stgbtn" style="--c:${st.c}" data-a="stagemenu" aria-haspopup="true" aria-expanded="${S.stageMenu}">${st.t} ▾</button>
        ${S.stageMenu?`<div class="so-stgmenu" role="menu">${Object.entries(STG).map(([k,v])=>`<button type="button" role="menuitem" data-a="stage" data-k="${k}">${t.stage===k?'✓ ':''}${v.t}</button>`).join('')}</div>`:''}
        <button type="button" class="so-stgbtn" style="--c:${t.tag?TAGN[t.tag].c:'#9AA3B2'}" data-a="tagmenu" aria-haspopup="true" aria-expanded="${S.tagMenu}" title="ป้ายจัดหมวดแชต">${t.tag?TAGN[t.tag].t:'ป้าย'} ▾</button>
        ${S.tagMenu?`<div class="so-stgmenu" role="menu">${TAG.map(([k,lb])=>`<button type="button" role="menuitem" data-a="tag" data-k="${k}">${t.tag===k?'✓ ':''}${lb}</button>`).join('')}<button type="button" role="menuitem" data-a="tag" data-k="">${!t.tag?'✓ ':''}ไม่มีป้าย</button></div>`:''}
        <button type="button" class="so-stgbtn" style="--c:${t.assignee?'#5B4BC2':'#9AA3B2'}" data-a="assignmenu" aria-haspopup="true" aria-expanded="${S.assignMenu}" title="ผู้รับผิดชอบแชตนี้">${E(t.assignee||'ผู้รับผิดชอบ')} ▾</button>
        ${S.assignMenu?`<div class="so-stgmenu" role="menu">${STAFF.map(nm=>`<button type="button" role="menuitem" data-a="assign" data-k="${E(nm)}">${t.assignee===nm?'✓ ':''}${E(nm)}</button>`).join('')}<button type="button" role="menuitem" data-a="assign" data-k="">${!t.assignee?'✓ ':''}ไม่ระบุ</button><div style="display:flex;gap:6px;padding:6px 4px 2px;border-top:1px solid var(--so-line);margin-top:4px"><input id="so_assignc" class="so-in" type="text" placeholder="ชื่ออื่น…" style="flex:1;padding:6px 8px;font-size:13px" value=""><button type="button" class="so-btn sm" data-a="assigncustom">ตั้งชื่อ</button></div></div>`:''}
      </div>
      ${line?'<div class="so-lnote">แชตจาก LINE OA · หน้านี้แสดงข้อความของลูกค้า คำตอบของบอท และข้อความที่ส่งจากหน้านี้ — คำตอบที่พิมพ์ตรงใน LINE OA Manager ไม่ขึ้นเอง — กดปุ่ม "จาก OA Manager" แล้ววางคำตอบนั้นเพื่อบันทึกให้ทุกคนเห็น หรือตอบจากหน้านี้เลย</div>':''}
      <div class="so-flashbox" data-where="chat"></div>
      <div class="so-msgs" id="so_msgs" data-id="${E(t.id)}">${inner}</div>
      <div class="so-qa">${TPL.map((x,i)=>`<button type="button" class="so-tplb" data-a="tplpick" data-k="${i}">${E(x[0])}</button>`).join('')}</div>
      <div class="so-honest" id="so_honest">${E(honestText(t))}</div>
      <div class="so-comp">
        <button type="button" class="so-mode${S.note?' on':''}" data-a="note" aria-pressed="${S.note}" title="สลับเป็นโน้ตภายใน">${S.note?'โน้ต':'ข้อความ'}</button>
        ${line?`<button type="button" class="so-mode${S.oaLog?' on':''}" data-a="oalog" aria-pressed="${S.oaLog}" title="คำตอบที่คุณตอบไปแล้วใน LINE OA Manager — บันทึกเข้าแชตนี้ให้ทุกคนเห็น (ไม่ส่งถึงลูกค้าอีก ไม่นับโควตา)">${S.oaLog?'บันทึก OA Manager':'จาก OA Manager'}</button>`:''}
        <button type="button" class="so-ic" data-a="chatattach" title="${line?'แนบรูปหรือ PDF เป็นโน้ตภายใน (ยังส่งรูปถึงลูกค้าทาง LINE จากหน้านี้ไม่ได้) · ไม่เกิน 10 MB':'แนบรูปหรือ PDF (ไม่เกิน 10 MB)'}" aria-label="แนบไฟล์" ${S.chatAttachBusy?'disabled':''}>${ic('clip')}</button>
        <textarea id="so_txt" data-id="${E(t.id)}" rows="1" placeholder="พิมพ์ข้อความ…" title="Enter ${line&&!S.note?'ส่ง':'บันทึก'} · Shift+Enter ขึ้นบรรทัดใหม่" aria-label="ข้อความ">${E(S.drafts[t.id]||'')}</textarea>
        <button type="button" class="so-send" data-a="send" aria-label="${S.oaLog&&line&&!S.note?'บันทึกคำตอบจาก LINE OA Manager':line&&!S.note?'ส่งข้อความทาง LINE':'บันทึกข้อความ'}" ${S.busySend?'disabled':''}>${ic('send')}</button>
      </div>`
    paintFlash()
    const ms=$('so_msgs')
    if(ms)ms.scrollTop=!keep||keep.stick?ms.scrollHeight:keep.top
    paintMTabs()
  }

  async function loadImages(){
    const need=S.msgs.filter(m=>m.kind==='image'&&m.meta&&m.meta.path&&!S.urls[m.meta.path]).slice(-30)
    if(!need.length)return
    const sel=S.sel
    await Promise.all(need.map(async m=>{
      const r=await q(()=>sb.storage.from(BUCKET).createSignedUrl(m.meta.path,3600))
      if(!errMsg(r)&&r.data&&r.data.signedUrl)S.urls[m.meta.path]=r.data.signedUrl
    }))
    if(S.sel===sel)paintChat()
  }
  async function openFile(path){
    const r=await q(()=>sb.storage.from(BUCKET).createSignedUrl(path,600))
    if(errMsg(r)||!(r.data&&r.data.signedUrl)){flash('เปิดไฟล์ไม่สำเร็จ: '+(errMsg(r)||'ไม่ทราบสาเหตุ'),true);return}
    window.open(r.data.signedUrl,'_blank','noopener')
  }

  // ---------- โหลดข้อมูล ----------
  // quiet = การรีเฟรชอัตโนมัติ: ไม่ขึ้นข้อความกำลังโหลด ไม่ขึ้นแถบผิดพลาดซ้ำ ๆ และไม่วาดทับถ้าไม่มีอะไรเปลี่ยน (ไม่ให้คลิกพลาดหรือรายการกระตุก)
  async function loadList(quiet){
    if(!quiet){S.listLoading=!S.list.length;paintList()}
    const [r,o,k]=await Promise.all([
      q(()=>sb.from('sale_threads').select('*').order('last_at',{ascending:false}).limit(300)),
      q(()=>sb.from('sale_orders').select('id,thread_id,order_no,job_status,pay_status,updated_at').order('updated_at',{ascending:false}).limit(1000)),
      // ตัวผูก LINE (รูปโปรไฟล์): ตารางยังไม่มีหรืออ่านไม่ได้ = ไม่มีรูป ไม่ขึ้นเตือน และไม่ถามซ้ำทุกไม่กี่วินาที (เว้น 2 นาที)
      Date.now()<S.linksOffUntil?Promise.resolve({data:null,error:{message:'skipped'}}):q(()=>sb.from('sale_line_links').select('thread_id,picture_url,line_name,last_in_at').limit(1000))])
    S.listLoading=false
    if(errMsg(r)){if(!quiet||!S.list.length)S.errList='โหลดแชตไม่ได้: '+errMsg(r)}else{S.errList='';S.list=Array.isArray(r.data)?r.data:[]}
    if(!errMsg(o)){
      const idx={}
      ;(o.data||[]).forEach(x=>{(idx[x.thread_id]=idx[x.thread_id]||[]).push(x)})
      S.idx=idx
    }
    if(Date.now()>=S.linksOffUntil){
      if(errMsg(k))S.linksOffUntil=Date.now()+120000
      else{const links={};(k.data||[]).forEach(x=>{links[x.thread_id]=x});S.links=links}
    }
    const sig=S.errList+'#'+S.list.map(t=>[t.id,t.last_at,t.unread,t.stage,t.title,t.last_text].join('|')).join(';')+'#'+Object.keys(S.idx).map(i=>S.idx[i].map(x=>[x.id,x.job_status,x.pay_status].join('|')).join(',')).join(';')+'#'+Object.keys(S.links).length
    const top=S.list.reduce((a,t)=>!a||tms(t.updated_at)>tms(a.updated_at)?t:a,null)
    S.probe=top?top.id+'|'+top.updated_at:'none'
    if(quiet&&sig===S.sig)return false
    S.sig=sig
    paintList();paintMTabs()
    return true
  }

  async function reloadMsgs(id){
    const m=await q(()=>sb.from('sale_msgs').select('*').eq('thread_id',id).order('created_at',{ascending:true}).limit(400))
    if(S.sel!==id)return
    if(!errMsg(m)){S.msgs=m.data||[];S.errMsgs=''}
    paintChat()
    loadImages()
  }

  async function openThread(id,force){
    if(!id)return
    if(!force&&S.sel&&S.sel!==id&&S.ord&&isDirty()){
      openModal({kind:'confirm',title:'ยังไม่ได้บันทึกใบสั่งงาน',
        body:'ใบสั่งงานของแชตนี้มีการแก้ไขที่ยังไม่ได้กด "บันทึกออเดอร์" — ระบบเก็บร่างไว้ให้ในหน้านี้ (หายเมื่อปิดหรือรีเฟรชหน้า) ย้ายไปแชตอื่นเลยหรือไม่?',
        yes:'เก็บร่างแล้วย้าย',no:'อยู่ต่อ',onYes:()=>openThread(id,true)})
      return
    }
    const tok=++S.tok
    if(S.sel&&S.ord&&S.ord.thread_id===S.sel&&isDirty())S.odrafts[S.sel]=S.ord
    if(id!==S.sel){S.msgs=[];S.cust=null;S.custStats=null;S.custLink=false;S.custLinkQ='';S.custLinkRows=[];S.note=false;S.oaLog=false;S.stageMenu=false;S.tagMenu=false;S.assignMenu=false;S.prodOpen=false}
    S.sel=id;S.ord=null;S.ords=[];S.errMsgs='';S.errOrd='';S.conflict=false;S.openStamp=''
    S.msgsLoading=true;S.ordLoading=true
    if(S.mode==='list')S.mode='chat'
    paintAll()
    const t=S.list.find(x=>x.id===id)
    if(t&&t.unread>0){q(()=>sb.from('sale_threads').update({unread:0}).eq('id',id)).then(r=>{if(!errMsg(r)){t.unread=0;paintList();paintMTabs()}})}
    const [m,c,o,cs]=await Promise.all([
      q(()=>sb.from('sale_msgs').select('*').eq('thread_id',id).order('created_at',{ascending:true}).limit(400)),
      t&&t.customer_id?q(()=>sb.from('customers').select('id,name,phone,line_name,address,tax_id').eq('id',t.customer_id).limit(1)):Promise.resolve({data:[]}),
      q(()=>sb.from('sale_orders').select('*').eq('thread_id',id).order('updated_at',{ascending:false}).limit(30)),
      // การ์ดลูกค้า: ยอดซื้อรวม/จำนวนงาน/งานกำลังทำ นับจากออเดอร์ทุกใบของลูกค้ารายนี้ (ทุกแชต ไม่ใช่แค่แชตนี้) — เงียบถ้าพลาด การ์ดแค่โชว์ "-" ไม่บล็อกหน้า
      t&&t.customer_id?q(()=>sb.from('sale_orders').select('total,job_status').eq('customer_id',t.customer_id).limit(2000)):Promise.resolve({data:[]})])
    if(tok!==S.tok)return
    S.msgsLoading=false
    S.errMsgs=errMsg(m)
    S.msgs=errMsg(m)?[]:(m.data||[])
    S.cust=(c&&Array.isArray(c.data)&&c.data[0])||null
    S.custStats=errMsg(cs)?null:{n:(cs.data||[]).length,sum:(cs.data||[]).reduce((a,r)=>a+num(r.total),0),open:(cs.data||[]).filter(r=>isOpenJob(r.job_status)).length}
    if(errMsg(o)){S.errOrd='โหลดใบสั่งงานไม่ได้: '+errMsg(o);S.ords=[];S.ordLoading=false}
    else{
      S.ords=o.data||[]
      const stash=S.odrafts[id]
      if(stash){S.ord=stash;delete S.odrafts[id];S.ordLoading=false}
      else{
        const open=S.ords.find(x=>isOpenJob(x.job_status))||S.ords[0]
        if(open)await loadOrd(open.id,tok)
        else{S.ord=newOrd(t);S.ordLoading=false}
      }
    }
    if(tok!==S.tok)return
    paintChat();paintOrd()
    loadImages()
  }

  async function loadOrd(orderId,tok){
    S.ordLoading=true
    const r=await q(()=>sb.from('sale_order_items').select('*').eq('order_id',orderId).order('seq'))
    if(tok!=null&&tok!==S.tok)return
    S.ordLoading=false
    const row=S.ords.find(x=>x.id===orderId)
    // รายการโหลดไม่ได้ = ห้ามแสดงใบว่าง (กดบันทึกแล้วรายการจะหาย) → แสดงข้อผิดพลาดและปุ่มลองใหม่แทน
    if(errMsg(r)||!row){S.ord=null;S.errOrd='โหลดรายการของใบไม่สำเร็จ: '+(errMsg(r)||'ไม่พบใบ');return}
    S.errOrd=''
    S.ord=ordFromRow(row,r.data||[])
    S.conflict=false
  }

  // ---------- ใบสั่งงาน: ข้อมูล ----------
  function newOrd(t){
    const c=S.cust||{}
    const o={id:null,version:null,order_no:'',order_type:'goods',thread_id:t?t.id:S.sel,customer_id:c.id||(t&&t.customer_id)||null,
      customer_name:c.name||(t&&t.title)||'',phone:c.phone||(t&&t.phone)||'',order_date:todayISO(),note:'',
      fulfil:'pickup',need_date:'',assignee:'',price_school_id:null,vat_on:false,vat_store_id:null,
      job_status:'pending',pay_status:'unpaid',paid_amount:0,attach:[],items:[],token:null,reason:'',_force:false,saved:null}
    o.base=serializeOrd(o)
    return o
  }
  function ordFromRow(row,items){
    const o={id:row.id,version:row.version,order_no:row.order_no,order_type:row.order_type||'goods',thread_id:row.thread_id,customer_id:row.customer_id,
      customer_name:row.customer_name||'',phone:row.phone||'',order_date:String(row.order_date||'').slice(0,10)||todayISO(),
      note:row.note||'',fulfil:row.fulfil||'pickup',need_date:String(row.need_date||'').slice(0,10),assignee:row.assignee||'',
      price_school_id:row.price_school_id||null,vat_on:!!row.vat_store_id,vat_store_id:row.vat_store_id||null,
      job_status:row.job_status,pay_status:row.pay_status,paid_amount:num(row.paid_amount),
      attach:Array.isArray(row.attach)?row.attach.slice():[],
      items:(items||[]).map(i=>({product_id:i.product_id||null,kind:i.kind||'goods',name:i.name||'',qty:num(i.qty),unit:i.unit||'',unit_price:num(i.unit_price)})),
      token:null,reason:'',_force:false,
      saved:{job_status:row.job_status,vat_rate:num(row.vat_rate),subtotal:num(row.subtotal),vat_amount:num(row.vat_amount),total:num(row.total),updated_at:row.updated_at,updated_by:row.updated_by}}
    o.base=serializeOrd(o)
    return o
  }
  function serializeOrd(o){
    const partial=o.pay_status==='deposit'||o.pay_status==='partial'
    return JSON.stringify([o.order_type,o.customer_name.trim(),o.phone.trim(),o.order_date,o.note,o.fulfil,o.need_date,o.assignee.trim(),o.price_school_id||null,
      o.vat_on?o.vat_store_id:null,o.job_status,o.pay_status,partial?r2(num(o.paid_amount)):0,o.attach.map(f=>f.path),
      o.items.map(i=>[i.product_id||null,i.kind,String(i.name).trim(),r2(num(i.qty)),String(i.unit||'').trim(),r2(num(i.unit_price))])])
  }
  function isDirty(){const o=S.ord;return !!o&&serializeOrd(o)!==o.base}
  function vatRate(o){if(!o.vat_on)return 0;const st=S.stores.find(s=>s.id===o.vat_store_id);return st?num(st.vat_rate):0}
  function calc(o){
    const sub=r2(o.items.reduce((a,i)=>a+r2(r2(num(i.qty))*r2(num(i.unit_price))),0))
    const rate=vatRate(o)
    const vat=r2(sub*rate/100)
    return {sub,rate,vat,total:r2(sub+vat)}
  }
  const schoolName=id=>{const s=S.schools.find(x=>x.id===id);return s?s.name:'โรงเรียนที่เลือก'}

  // ราคาตามฐานราคาของใบ: ราคาโรงเรียน (สูตรเดิมของร้านผ่าน sale_order_school_prices) หรือราคาปกติของสินค้า
  async function priceMap(ids,schoolId){
    const out={}
    if(!ids.length)return {map:out}
    if(schoolId){
      const r=await q(()=>sb.rpc('sale_order_school_prices',{p_school:schoolId,p_ids:ids}))
      if(errMsg(r))return {error:niceErr(errMsg(r))}
      ;(Array.isArray(r.data)?r.data:[]).forEach(x=>{out[x.id]=num(x.price)})
      return {map:out}
    }
    const r=await q(()=>sb.from('products').select('id,price').in('id',ids))
    if(errMsg(r))return {error:errMsg(r)}
    ;(r.data||[]).forEach(x=>{out[x.id]=num(x.price)})
    return {map:out}
  }

  // ---------- ใบสั่งงาน: วาด ----------
  function paintOrd(){
    const box=$('so_ord');if(!box)return
    paintMTabs()
    const t=S.list.find(x=>x.id===S.sel)
    if(!t){box.innerHTML=`<div class="so-ohd"><span class="ttl">${ic('cart',22)} ใบสั่งงาน / คำสั่งซื้อ</span></div><div class="so-empty">เลือกแชตเพื่อเปิดใบสั่งงานของลูกค้ารายนั้น</div>`;return}
    if(S.ordLoading){box.innerHTML=`<div class="so-ohd"><span class="ttl">${ic('cart',22)} ใบสั่งงาน / คำสั่งซื้อ</span></div><div class="so-empty">กำลังโหลดใบสั่งงาน…</div>`;return}
    if(!S.ord){box.innerHTML=`<div class="so-ohd"><span class="ttl">${ic('cart',22)} ใบสั่งงาน / คำสั่งซื้อ</span></div><div class="so-empty"><b>โหลดใบสั่งงานไม่สำเร็จ</b><p>${E(S.errOrd||'ไม่ทราบสาเหตุ')}</p><p style="font-size:12.5px">ถ้าเพิ่งติดตั้งหน้านี้ ตรวจว่าติดตั้ง migration 002_sale_orders แล้ว</p><button type="button" class="so-btn" data-a="retrythread">ลองใหม่</button></div>`;return}
    const o=S.ord
    const dirty=isDirty()
    const c=(o.saved&&!dirty)?{sub:o.saved.subtotal,rate:o.saved.vat_rate,vat:o.saved.vat_amount,total:o.saved.total}:calc(o)
    const osel=S.ords.length?`<div class="so-osel">${S.ords.map(r=>`<button type="button" class="so-tab${o.id===r.id?' on':''}" data-a="pickord" data-id="${E(r.id)}" title="${E((JN[r.job_status]||{}).t||r.job_status)} · ${money(r.total)} บาท">${E(r.order_no)}</button>`).join('')}<button type="button" class="so-tab${o.id?'':' on'}" data-a="newordbtn">+ ใบใหม่</button></div>`:''
    const rows=o.items.map((i,x)=>`
      <tr>
        <td class="c w-no">${x+1}</td>
        <td class="w-name"><textarea rows="1" data-f="iname" data-i="${x}" placeholder="ชื่อสินค้า/งาน" aria-label="รายการที่ ${x+1}">${E(i.name)}</textarea>${i.kind==='service'?'<small>งานบริการ</small>':''}</td>
        <td class="w-qty" data-l="จำนวน"><input type="text" inputmode="decimal" class="n" data-f="iqty" data-i="${x}" value="${E(i.qty===''?'':qtyTxt(i.qty))}" aria-label="จำนวนของรายการที่ ${x+1}"></td>
        <td class="w-unit" data-l="หน่วย"><input type="text" data-f="iunit" data-i="${x}" value="${E(i.unit)}" list="so_units" aria-label="หน่วยของรายการที่ ${x+1}"></td>
        <td class="w-price" data-l="ราคา/หน่วย"><input type="text" inputmode="decimal" class="n" data-f="iprice" data-i="${x}" value="${E(i.unit_price===''?'':money(i.unit_price).replace(/,/g,''))}" aria-label="ราคาต่อหน่วยของรายการที่ ${x+1}"></td>
        <td class="r w-sum" data-l="รวม (บาท)" data-cell="line">${money(r2(r2(num(i.qty))*r2(num(i.unit_price))))}</td>
        <td class="w-del"><button type="button" class="so-del" data-a="delitem" data-i="${x}" aria-label="ลบรายการที่ ${x+1}">${ic('trash',16)}</button></td>
      </tr>`).join('')
    const vs=vatStores()
    const vatSel=vs.length
      ?`<select class="so-sel" style="width:auto;padding:4px 8px;font-size:12.5px" data-f="vat" aria-label="ภาษีมูลค่าเพิ่ม"><option value="">ไม่คิด VAT</option>${vs.map(s=>`<option value="${E(s.id)}"${o.vat_on&&o.vat_store_id===s.id?' selected':''}>VAT ${num(s.vat_rate)}% · ${E(s.name)}</option>`).join('')}</select>`
      :`<select class="so-sel" style="width:auto;padding:4px 8px;font-size:12.5px" disabled><option>ยังตั้งค่า VAT ไม่ได้${S.storesErr?' (โหลดข้อมูลร้านไม่ได้)':''}</option></select>`
    const partial=o.pay_status==='deposit'||o.pay_status==='partial'
    const basisSel=`<select class="so-sel" data-f="price_school" aria-label="ฐานราคา"><option value="">ราคาปกติ</option>${S.schools.map(s=>`<option value="${E(s.id)}"${o.price_school_id===s.id?' selected':''}>ราคาโรงเรียน · ${E(s.name)}</option>`).join('')}</select>`
    const prodBox=S.prodOpen?`<div class="so-prodbox">
        <input id="so_pq" class="so-in" type="search" placeholder="ค้นหาสินค้า (ชื่อหรือรหัส)…" value="${E(S.prodQ)}" autocomplete="off" aria-label="ค้นหาสินค้า">
        <div id="so_pres" style="display:flex;flex-direction:column;gap:6px">${S.prodBusy?'<small style="color:var(--so-mut)">กำลังค้นหา…</small>':S.prodRows.map(p=>{const sp=S.prodPrice[p.id];return `<button type="button" class="pr" data-a="prodpick" data-id="${E(p.id)}"><b>${E(p.name)}</b><br><small style="color:var(--so-mut)">${E(p.unit||'-')} · ${o.price_school_id&&sp!=null?`ราคาโรงเรียน ${money(sp)} (ปกติ ${money(p.price)})`:money(p.price)+' บาท'}</small></button>`}).join('')}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="so-btn sm" data-a="addblank" data-k="goods">+ สินค้าที่พิมพ์เอง</button><button type="button" class="so-btn sm" data-a="addblank" data-k="service">+ งานบริการ</button></div>
      </div>`:''
    box.innerHTML=`
      <div class="so-ohd">
        <span class="ttl">${ic('cart',22)} ใบสั่งงาน / คำสั่งซื้อ</span>
        ${o.id?`<span class="so-chip" style="--c:${(JN[o.saved?o.saved.job_status:o.job_status]||{}).c||'#7A8394'}">${E((JN[o.saved?o.saved.job_status:o.job_status]||{}).t||'')}</span>`:'<span class="so-chip lite">ใบใหม่ ยังไม่บันทึก</span>'}
      </div>
      ${custCard(t)}
      <div class="so-flashbox" data-where="ord" style="margin-top:-6px"></div>
      <div class="so-ob">
        ${osel}
        ${S.conflict?`<div class="so-dirty">ใบนี้ถูกแก้โดยคนอื่นระหว่างที่เปิดอยู่ — <button type="button" class="so-btn sm" data-a="reloadord">โหลดใบล่าสุด</button> (สิ่งที่แก้ค้างไว้จะหาย)</div>`:''}
        ${dirty?'<div class="so-dirty" role="status">มีการแก้ไขที่ยังไม่ได้บันทึก — กด "บันทึกออเดอร์" ก่อนย้ายไปแชตอื่น</div>':''}
        ${o.id?`<div><span class="so-chip" style="--c:${o.order_type==='docs'?'#8A5CC2':'#2F6FE4'}">${E(OTYPE[o.order_type]||o.order_type)}</span> <span class="so-hint">ประเภทใบเปลี่ยนไม่ได้หลังบันทึก</span></div>`
          :`<div class="so-seg" role="radiogroup" aria-label="ประเภทคำสั่งซื้อ">${Object.entries(OTYPE).map(([k,lb])=>`<button type="button" role="radio" aria-checked="${o.order_type===k}" class="${o.order_type===k?'on':''}" data-a="otype" data-k="${k}">${lb}</button>`).join('')}</div>`}
        <div class="so-frow"><label for="so_cn">ลูกค้า</label><div style="display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:8px"><input id="so_cn" class="so-in" type="text" data-f="customer_name" value="${E(o.customer_name)}" placeholder="ชื่อลูกค้า/หน่วยงาน"><input class="so-in" type="tel" data-f="phone" value="${E(o.phone)}" placeholder="เบอร์โทร" aria-label="เบอร์โทร"></div></div>
        <div class="so-frow"><span></span><div id="so_cnsug" class="so-sug" hidden></div></div>
        <div class="so-frow2"><label>อ้างอิง / เลขที่</label><input class="so-in" type="text" value="${E(o.order_no||'ออกเลขเมื่อบันทึก')}" disabled aria-label="เลขที่ใบ"><label for="so_od" style="font-size:13px;color:var(--so-mut)">วันที่สั่ง</label><input id="so_od" class="so-in" type="date" data-f="order_date" value="${E(o.order_date)}"></div>
        <div class="so-frow"><label>ราคา</label>${basisSel}</div>
        <div class="so-sech">
          <b>รายการสินค้า / งาน</b>
          <span style="display:flex;gap:6px">
            <button type="button" class="so-btn sm" data-a="parsechat" title="อ่านข้อความรายการจากลูกค้ามาเป็นรายการ ให้ตรวจก่อนเพิ่ม">${ic('wand',14)} สร้างรายการจากแชต</button>
            <span class="so-prod"><button type="button" class="so-btn sm sky" data-a="prodtoggle" aria-expanded="${S.prodOpen}">${ic('plus',14)} เพิ่มรายการ</button>${prodBox}</span>
          </span>
        </div>
        <div class="so-tbw"><table class="so-tb">
          <thead><tr><th class="c">ลำดับ</th><th>รายการ</th><th class="r">จำนวน</th><th>หน่วย</th><th class="r">ราคาต่อหน่วย</th><th class="r" style="padding-right:8px">รวม (บาท)</th><th></th></tr></thead>
          <tbody>${rows||'<tr><td colspan="7" style="text-align:center;color:var(--so-mut);padding:18px">ยังไม่มีรายการ — กด "เพิ่มรายการ" หรือ "สร้างรายการจากแชต"</td></tr>'}</tbody>
        </table></div>
        <datalist id="so_units">${UNIT_LIST.map(u=>`<option value="${u}">`).join('')}</datalist>
        <div class="so-two">
          <div class="so-fld"><span style="font-weight:600;color:var(--so-ink);font-size:13px">หมายเหตุ / รายละเอียดงาน</span><textarea class="so-in" rows="3" data-f="note" placeholder="เช่น ส่งของที่โรงเรียน ภายในวันที่ …">${E(o.note)}</textarea></div>
          <div class="so-sum">
            <div class="ln"><span>รวมเป็นเงิน (ไม่รวมภาษี)</span><b data-sum="sub">${money(c.sub)}</b></div>
            <div class="ln"><span>ภาษีมูลค่าเพิ่ม${c.rate>0?' '+num(c.rate)+'%':''}</span><b data-sum="vat">${money(c.vat)}</b></div>
            <div style="display:flex;justify-content:flex-end">${vatSel}</div>
            <div class="so-total"><span>ยอดรวมทั้งสิ้น</span><span data-sum="total">${money(c.total)} บาท</span></div>
            <span class="so-hint" data-sum="hint">${o.saved&&!dirty?`ยอดตรวจและบันทึกฝั่งเซิร์ฟเวอร์แล้ว · ${E(tFull(o.saved.updated_at))} โดย ${E(o.saved.updated_by||'-')}`:'ยอดบนจอคิดให้ดูก่อน — ตัวจริงระบบคิดซ้ำตอนกด "บันทึกออเดอร์"'}</span>
          </div>
        </div>
        <div class="so-grid3">
          <div class="so-fld"><span>การส่งมอบ</span><select class="so-sel" data-f="fulfil"><option value="pickup"${o.fulfil==='pickup'?' selected':''}>รับที่ร้าน</option><option value="delivery"${o.fulfil==='delivery'?' selected':''}>จัดส่ง</option></select></div>
          <div class="so-fld"><span>กำหนดส่ง/นัดรับ</span><input class="so-in" type="date" data-f="need_date" value="${E(o.need_date)}"></div>
          <div class="so-fld"><span>ผู้รับผิดชอบ</span><input class="so-in" type="text" data-f="assignee" value="${E(o.assignee)}" list="so_staff" placeholder="ชื่อพนักงาน"><datalist id="so_staff"><option value="หญิง"><option value="ฟิล์ม"><option value="พี่ปิ่น"></datalist></div>
        </div>
        <div class="so-stat">
          <div><h4>${ic('gear',18)} สถานะงาน</h4><select class="so-sel job" data-f="job_status" aria-label="สถานะงาน">${JOB.map(([k,lb])=>`<option value="${k}"${o.job_status===k?' selected':''}>${lb}</option>`).join('')}</select></div>
          <div><h4>${ic('card',18)} สถานะการชำระเงิน</h4><select class="so-sel pay" data-f="pay_status" aria-label="สถานะการชำระเงิน">${PAY.map(([k,lb])=>`<option value="${k}"${o.pay_status===k?' selected':''}>${lb}</option>`).join('')}</select>
            ${partial?`<input class="so-in" style="margin-top:6px" type="text" inputmode="decimal" data-f="paid_amount" value="${E(o.paid_amount||'')}" placeholder="ยอดที่รับแล้ว (บาท)" aria-label="ยอดที่รับแล้ว">`:''}</div>
        </div>
        <div class="so-att">
          <div class="so-sech"><b style="font-size:13.5px">ไฟล์แนบของใบนี้ (สลิป/ไฟล์งาน)</b><button type="button" class="so-btn sm" data-a="ordattach" ${S.attachBusy?'disabled':''}>${S.attachBusy?'กำลังอัปโหลด…':ic('clip',14)+' แนบไฟล์'}</button></div>
          ${o.attach.map((f,x)=>`<div class="f">${ic('file',16)}<b>${E(f.name||f.path)}</b><button type="button" class="so-btn sm" data-a="openfile" data-p="${E(f.path)}">เปิด</button><button type="button" class="so-del" data-a="delattach" data-i="${x}" aria-label="เอาไฟล์ ${E(f.name||'')} ออกจากใบ">${ic('trash',16)}</button></div>`).join('')||'<span class="so-hint">ยังไม่มีไฟล์แนบ</span>'}
          <span class="so-hint">แนบสลิปแล้วสถานะการชำระเงินไม่เปลี่ยนเอง — พนักงานต้องตรวจยอดแล้วเลือกสถานะเอง</span>
        </div>
        <div class="so-act2">
          <button type="button" class="so-btn pri" data-a="save" ${S.busySave?'disabled':''}>${ic('save')} ${S.busySave?'กำลังบันทึก…':'บันทึกออเดอร์'}</button>
          <button type="button" class="so-btn sky" data-a="summary" ${!o.id||dirty||S.busySave?'disabled':''} title="${!o.id||dirty?'บันทึกออเดอร์ก่อน แล้วค่อยส่งสรุป':'ตรวจสรุปและผู้รับก่อนส่ง'}">${ic('send')} ส่งสรุปให้ลูกค้า</button>
        </div>
      </div>`
    wrapMore(box)
    paintFlash()
  }

  // v4: ช่องที่ใช้ไม่บ่อยไปไว้ใต้ "เพิ่มเติม" — ข้อมูลไม่หาย แค่ซ่อนไว้จนกดเปิด (จำสถานะเปิด/ปิดไว้ตอนหน้าวาดใหม่)
  function wrapMore(box){
    const ob=box.querySelector('.so-ob');if(!ob||ob.querySelector('.so-more'))return
    const moved=[...ob.querySelectorAll('.so-seg,.so-grid3,.so-att')]
    const basis=ob.querySelector('select[data-f="price_school"]')
    const basisRow=basis&&basis.closest('.so-frow')
    if(basisRow)moved.unshift(basisRow)
    if(!moved.length)return
    const d=document.createElement('details');d.className='so-more';d.open=!!S.moreOpen
    d.innerHTML='<summary>เพิ่มเติม · ประเภท ราคา การส่งมอบ ผู้รับผิดชอบ ไฟล์แนบ</summary><div class="so-morebody"></div>'
    d.addEventListener('toggle',()=>{S.moreOpen=d.open})
    const body=d.querySelector('.so-morebody')
    moved.forEach(el=>body.appendChild(el))
    ob.insertBefore(d,ob.querySelector('.so-act2')||null)
  }

  function updateTotals(){
    const o=S.ord;if(!o)return
    const c=calc(o)
    const box=$('so_ord');if(!box)return
    const set=(k,v)=>{const el=box.querySelector(`[data-sum="${k}"]`);if(el)el.textContent=v}
    set('sub',money(c.sub));set('vat',money(c.vat));set('total',money(c.total)+' บาท')
    set('hint','ยอดบนจอคิดให้ดูก่อน — ตัวจริงระบบคิดซ้ำตอนกด "บันทึกออเดอร์"')
    paintDirtyBits()
  }
  function paintDirtyBits(){
    paintMTabs()
    const box=$('so_ord');if(!box||!S.ord)return
    const dirty=isDirty()
    const ob=box.querySelector('.so-ob');if(!ob)return
    let d=ob.querySelector('.so-dirty[role="status"]')
    if(dirty&&!d){d=document.createElement('div');d.className='so-dirty';d.setAttribute('role','status');d.textContent='มีการแก้ไขที่ยังไม่ได้บันทึก — กด "บันทึกออเดอร์" ก่อนย้ายไปแชตอื่น';ob.insertBefore(d,ob.firstChild&&ob.firstChild.classList&&ob.firstChild.classList.contains('so-osel')?ob.firstChild.nextSibling:ob.firstChild)}
    else if(!dirty&&d)d.remove()
    const sb2=box.querySelector('[data-a="summary"]');if(sb2)sb2.disabled=!S.ord.id||dirty||S.busySave
  }

  // ---------- ใบสั่งงาน: แก้รายการ ----------
  function addItem(it){S.ord.items.push(it);S.prodOpen=false;paintOrd()}
  async function prodSearch(text){
    S.prodQ=text
    const tk=++S.ptok
    const s=clean(text)
    if(!s){S.prodRows=[];S.prodBusy=false;paintProdKeep();return}
    S.prodBusy=true;paintProdKeep()
    const r=await q(()=>sb.from('products').select('id,name,unit,price,code,type').or(`name.ilike.*${s}*,code.ilike.*${s}*`).order('name').limit(8))
    if(tk!==S.ptok)return
    S.prodRows=errMsg(r)?[]:(r.data||[])
    S.prodPrice={}
    if(S.ord&&S.ord.price_school_id&&S.prodRows.length){
      const pm=await priceMap(S.prodRows.map(p=>p.id),S.ord.price_school_id)
      if(tk!==S.ptok)return
      if(pm.map)S.prodPrice=pm.map
    }
    S.prodBusy=false
    paintProdKeep()
  }
  function paintProdKeep(){
    const i=$('so_pq');const pos=i?i.selectionStart:null
    paintOrd()
    const j=$('so_pq');if(j){j.focus();if(pos!=null)j.setSelectionRange(pos,pos)}
  }

  function setBasis(v){
    const o=S.ord;if(!o)return
    const nv=v||null
    if(nv===o.price_school_id)return
    o.price_school_id=nv
    paintOrd()
    const bound=o.items.filter(i=>i.product_id)
    if(!bound.length)return
    openModal({kind:'confirm',title:'ปรับราคารายการที่มีอยู่?',
      body:`ใบนี้มี ${bound.length} รายการที่ผูกกับสินค้าในระบบ — ปรับราคาต่อหน่วยให้เป็น${nv?'ราคาโรงเรียน ('+schoolName(nv)+')':'ราคาปกติ'}เลยไหม? (ราคาที่แก้เองในรายการเหล่านั้นจะถูกแทน · รายการที่พิมพ์เองไม่เปลี่ยน)`,
      yes:'ปรับราคา',no:'ไม่ต้อง',onYes:()=>reprice()})
  }
  async function reprice(){
    const o=S.ord;if(!o)return
    const ids=[...new Set(o.items.filter(i=>i.product_id).map(i=>i.product_id))]
    const pm=await priceMap(ids,o.price_school_id)
    if(pm.error){flash('ดึงราคาไม่สำเร็จ: '+pm.error,true,'ord');return}
    let n=0
    o.items.forEach(i=>{if(i.product_id&&pm.map[i.product_id]!=null){i.unit_price=pm.map[i.product_id];n++}})
    paintOrd()
    flash('ปรับราคาแล้ว '+n+' รายการ — ตรวจแล้วกด "บันทึกออเดอร์"',false,'ord')
  }

  // ---------- สร้างรายการจากแชต (ตรวจก่อนเพิ่ม ไม่บันทึกเอง) ----------
  // ---- กติกาอ่านรายการจากข้อความลูกค้า: คัดลอกตรงตัวจาก stationery-bot/src/picklist.js (parseOrderText) ----
  // แก้ที่ src/picklist.js แล้วคัดลอกมาที่นี่ทุกครั้ง — เทสต์ db/test/saleorders-module-sql.test.js เทียบผลทั้งสองที่
  const PL_UNIT_ALIAS = { 'แพค': 'แพ็ค', 'แพ็ก': 'แพ็ค', 'แพก': 'แพ็ค', 'แพ๊ค': 'แพ็ค', 'แกลอน': 'แกลลอน', 'กป': 'กระป๋อง', 'กล.': 'กล่อง', 'ม.': 'เมตร' };
  const PL_UNITS = 'อัน|ชิ้น|ด้าม|แท่ง|กล่อง|ห่อ|แพ็ค|แพค|แพ็ก|แพก|แพ๊ค|โหล|ลัง|รีม|เล่ม|แผ่น|ม้วน|ขวด|แกลลอน|แกลอน|ถุง|ชุด|ตัว|ใบ|คู่|กระป๋อง|กป|ซอง|ก้อน|หลอด|เส้น|เมตร|หลา|ถัง|แผง|ลูก|ผืน|ตลับ|กระปุก|คัน|หัว|ลูกบาศก์|ม\\.';
  const RE = {
    zw: new RegExp('[' + String.fromCharCode(0x200b, 0xa0, 9) + ']', 'g'),
    tail: /\s*(?:ครับ|คับ|ค้าบ|ค่ะ|คะ|ค่า|นะคะ|นะครับ|นะ|จ้า|จ้ะ|จ๊ะ|น้า|เน้อ|เจ้า|ฮะ|จิ่มเน้อ|จิ่ม|ด้วย|ด้วยนะ)+\s*[.!~]*$/,
    lead: /^(?:[-–•*·▪●○◦✓✔☑>]+\s*|\d{1,2}[.)]\s+)/,
    time: /^\[?\d{1,2}[:.]\d{2}\]?\s*(?:น\.)?\s*/,
    note: /(วันที่|ฝาก|ประมาณ|รบกวน|ขอบคุณ|โทร|เบอร์|ราคา|ยอด|โอน|บาท|ส่งของ|มารับ|แวะ)/,
    day: /วันที่\s*(\d{1,2})(?!\d)/,
    tailUnit: new RegExp('^(.*?[^\\d\\s])\\s*(\\d+(?:[.,]\\d+)?)\\s*(' + PL_UNITS + ')?\\s*$'),
    headQty: new RegExp('^(\\d+(?:[.,]\\d+)?)\\s*(' + PL_UNITS + ')?\\s+(.+)$'),
  };
  const normUnit = (u) => {
    const s = String(u ?? '').trim().replace(/[.]+$/, '');
    return PL_UNIT_ALIAS[s] || PL_UNIT_ALIAS[s + '.'] || s;
  };
  const qtyOf = (s) => {
    let t = String(s ?? '');
    t = /^\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
    const n = Number(t);
    return Number.isFinite(n) && n > 0 && n <= 100000 ? n : null; // a phone number is not a quantity
  };
  const nameOf = (s) => String(s ?? '').replace(/[\s=:：＝\-–]+$/, '').replace(/^[\s=:：＝\-–]+/, '').replace(/\s+[x×X*]$/, '').trim();
  function readLine(t) {
    const sep = Math.max(t.lastIndexOf('='), t.lastIndexOf('＝'), t.lastIndexOf(':'), t.lastIndexOf('：'));
    if (sep > 0) {
      const nm = nameOf(t.slice(0, sep));
      const m = t.slice(sep + 1).trim().match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
      if (nm && m) {
        const q = qtyOf(m[1]);
        if (q) {
          let u = m[2].trim();
          let ex = '';
          const sp = u.indexOf(' ');
          if (sp > 0) {
            ex = u.slice(sp + 1).trim();
            u = u.slice(0, sp);
          }
          if (!/\d/.test(u) && u.length <= 12) return { name: ex ? nm + ' (' + ex + ')' : nm, qty: q, unit: normUnit(u), strong: true };
        }
      }
    }
    let m = t.match(RE.tailUnit);
    if (m) {
      const q = qtyOf(m[2]);
      const nm = nameOf(m[1]);
      if (q && nm) return { name: nm, qty: q, unit: normUnit(m[3] || ''), strong: Boolean(m[3]) || /\s+[x×X*]$/.test(m[1]) };
    }
    m = t.match(RE.headQty);
    if (m) {
      const q = qtyOf(m[1]);
      const nm = nameOf(m[3]);
      if (q && nm && !/\d{3,}/.test(nm)) return { name: nm, qty: q, unit: normUnit(m[2] || ''), strong: Boolean(m[2]) };
    }
    return null;
  }
  function parseOrderText(text) {
    const items = [];
    const notes = [];
    let day = null;
    for (const rawLine of String(text ?? '').replace(/\r/g, '').split('\n')) {
      let t = rawLine.replace(RE.zw, ' ').replace(/\s+/g, ' ').trim();
      if (!t) continue;
      t = t.replace(RE.time, '').replace(RE.lead, '').trim();
      if (!t) continue;
      const dm = t.match(RE.day);
      if (dm && !day) {
        const d = +dm[1];
        if (d >= 1 && d <= 31) day = d;
      }
      const c = t.replace(RE.tail, '').trim();
      const it = !dm && c.length <= 120 ? readLine(c) : null;
      if (it && /[A-Za-zก-๙]/.test(it.name) && it.name.length >= 2 && !RE.note.test(it.name)) items.push({ ...it, raw: t });
      else notes.push(t);
    }
    return { items, notes, day };
  }
  // ---- จบส่วนที่คัดลอก ----

  // เลขไทยในข้อความลูกค้า (๑๐ รีม) อ่านเป็นเลขอารบิกก่อน แล้วใช้กติกาเดียวกับบอท · แสดงได้ไม่เกิน 40 รายการ
  function parseLines(text){
    return parseOrderText(thd(text)).items.slice(0,40).map(it=>({use:true,name:it.name,qty:it.qty,unit:it.unit||'',unit_price:0,product_id:null,kind:'goods',bound:false}))
  }
  function openParse(){
    const t=S.list.find(x=>x.id===S.sel)
    const txt=S.msgs.filter(m=>m.dir==='in'&&(m.kind||'text')==='text').slice(-20).map(m=>m.body).join('\n')
    openModal({kind:'parse',text:txt,rows:txt?parseLines(txt):[],read:!!txt,title:t?t.title:''})
    if(txt)bindParsed()
  }
  async function bindParsed(){
    const m=S.modal;if(!m||m.kind!=='parse')return
    const gen=m.gen=(m.gen||0)+1
    const rows=m.rows.slice(0,15)
    const hits=await Promise.all(rows.map(async row=>{
      const s=clean(row.name);if(!s)return null
      const r=await q(()=>sb.from('products').select('id,name,unit,price').ilike('name','*'+s+'*').limit(2))
      return !errMsg(r)&&Array.isArray(r.data)&&r.data.length===1?r.data[0]:null
    }))
    if(!S.modal||S.modal!==m||m.gen!==gen||m.touched)return
    const sid=S.ord&&S.ord.price_school_id
    let pm={map:{}}
    const ids=hits.filter(Boolean).map(h=>h.id)
    if(sid&&ids.length)pm=await priceMap(ids,sid)
    if(!S.modal||S.modal!==m||m.gen!==gen||m.touched)return
    hits.forEach((h,i)=>{if(!h)return;const r=m.rows[i];r.product_id=h.id;r.name=h.name;r.unit=r.unit||h.unit||'';r.unit_price=pm.map&&pm.map[h.id]!=null?pm.map[h.id]:num(h.price);r.bound=true})
    paintModal()
  }

  // ---------- บันทึก ----------
  async function save(){
    const o=S.ord
    if(!o||S.busySave)return
    const t=S.list.find(x=>x.id===S.sel)
    if(!t){flash('ยังไม่ได้เลือกแชต',true,'ord');return}
    if(!o.customer_name.trim()){flash('ใส่ชื่อลูกค้าก่อนบันทึก',true,'ord');return}
    if(!o.items.length){flash('ต้องมีรายการอย่างน้อย 1 รายการ',true,'ord');return}
    for(let i=0;i<o.items.length;i++){
      const it=o.items[i]
      if(!String(it.name||'').trim()){flash('รายการที่ '+(i+1)+' ยังไม่มีชื่อ',true,'ord');return}
      if(!(num(it.qty)>0)){flash('จำนวนของรายการที่ '+(i+1)+' ต้องมากกว่า 0',true,'ord');return}
      if(num(it.unit_price)<0){flash('ราคาของรายการที่ '+(i+1)+' ติดลบไม่ได้',true,'ord');return}
    }
    const c=calc(o)
    if((o.pay_status==='deposit'||o.pay_status==='partial')&&!(num(o.paid_amount)>0&&num(o.paid_amount)<c.total)){
      flash('มัดจำ/ชำระบางส่วน ต้องใส่ยอดที่รับแล้วให้มากกว่า 0 และน้อยกว่ายอดรวม '+money(c.total)+' บาท',true,'ord');return
    }
    const was=o.saved?o.saved.job_status:null
    if(o.job_status==='closed'&&was!=='closed'&&!o._force&&(o.pay_status!=='paid'||was!=='delivered')){
      const why=[o.pay_status!=='paid'?'ยังชำระไม่ครบ ('+(PN[o.pay_status]||{}).t+')':null,was!=='delivered'?'ยังไม่ได้บันทึกว่า "ส่งมอบแล้ว"':null].filter(Boolean).join(' และ ')
      openModal({kind:'confirm',title:'ปิดออเดอร์ทั้งที่ยังไม่เรียบร้อย?',body:'ใบนี้'+why+' — ยืนยันจะปิดออเดอร์เลยหรือไม่? (ระบบบันทึกไว้ในประวัติว่าปิดแบบยืนยัน)',yes:'ยืนยันปิดออเดอร์',no:'ยังก่อน',danger:true,onYes:()=>{o._force=true;save()}})
      return
    }
    if(o.job_status==='canceled'&&was!=='canceled'&&!o.reason){
      openModal({kind:'prompt',title:'เหตุผลที่ยกเลิกใบนี้',body:'บันทึกไว้ในประวัติของใบ (ลูกค้าไม่เห็น)',ph:'เช่น ลูกค้าเปลี่ยนใจ / เปิดใบใหม่แทน',onYes:v=>{if(String(v||'').trim()){o.reason=String(v).trim();save()}}})
      return
    }
    S.busySave=true;paintOrd()
    if(!o.token)o.token=uuid()
    // v4: ลูกค้าลงบัญชี — ยังไม่มีบัญชีลูกค้าของแชตนี้ ก็เก็บชื่อกับเบอร์ลงรายชื่อลูกค้า (เบอร์ที่มีอยู่แล้วผูกกับบัญชีเดิม ไม่สร้างซ้ำ)
    if(!o.customer_id&&(o.customer_name.trim()||o.phone.trim())){
      const cu=await q(()=>sb.rpc('sale_customer_upsert',{p_thread:t.id,p_name:o.customer_name.trim(),p_phone:o.phone.trim(),p_source:isLine(t)?'สั่งผ่าน LINE':'หน้าร้าน/โทร'}))
      // ยังไม่ได้ติดตั้ง 004 (ไม่มีฟังก์ชันนี้): บันทึกใบต่อได้ตามปกติ เพียงยังไม่เปิดบัญชีลูกค้าอัตโนมัติ
      if(errMsg(cu)&&/could not find the function|does not exist|schema cache/i.test(errMsg(cu))){o.customer_id=null}
      else if(errMsg(cu)){S.busySave=false;paintOrd();flash('บันทึกบัญชีลูกค้าไม่สำเร็จ ('+niceErr(errMsg(cu))+') ยังไม่ได้บันทึกใบนี้',true,'ord');return}
      else o.customer_id=cu.data||null
    }
    const payload={id:o.id,version:o.version,thread_id:t.id,client_token:o.token,order_type:o.order_type,customer_id:o.customer_id,
      customer_name:o.customer_name.trim(),phone:o.phone.trim(),order_date:o.order_date||null,note:o.note,fulfil:o.fulfil,
      need_date:o.need_date||null,assignee:o.assignee.trim(),price_school_id:o.price_school_id||null,
      vat_on:!!(o.vat_on&&o.vat_store_id),vat_store_id:o.vat_on?o.vat_store_id:null,
      job_status:o.job_status,pay_status:o.pay_status,paid_amount:num(o.paid_amount),attach:o.attach,
      items:o.items.map(i=>({product_id:i.product_id||null,kind:i.kind||'goods',name:String(i.name).trim(),qty:num(i.qty),unit:String(i.unit||'').trim()||null,unit_price:num(i.unit_price)})),
      by_name:S.staff,force:!!o._force,reason:o.reason||null}
    const r=await q(()=>sb.rpc('sale_order_save',{p:payload}))
    S.busySave=false
    o._force=false
    if(errMsg(r)){
      const m=niceErr(errMsg(r))
      // คำขอนี้ไม่สำเร็จ: token ยังไม่ถูกใช้ ให้กดบันทึกใหม่ด้วย token เดิมได้ (ถ้าจริง ๆ แล้วบันทึกไปแล้ว ระบบจะคืนใบเดิม ไม่สร้างซ้ำ)
      if(/version/.test(m))S.conflict=true
      paintOrd()
      flash('บันทึกไม่สำเร็จ: '+m,true,'ord')
      return
    }
    const d=r.data||{}
    const row=d.order
    if(!row){paintOrd();flash('บันทึกไม่สำเร็จ: คำตอบจากระบบไม่ครบ',true,'ord');return}
    S.ord=ordFromRow(row,d.items||[])
    delete S.odrafts[S.sel]
    const ix=S.ords.findIndex(x=>x.id===row.id)
    if(ix<0)S.ords.unshift(row);else S.ords[ix]=row
    const li=S.idx[row.thread_id]=S.idx[row.thread_id]||[]
    const lx=li.findIndex(x=>x.id===row.id)
    const lite={id:row.id,thread_id:row.thread_id,order_no:row.order_no,job_status:row.job_status,pay_status:row.pay_status,updated_at:row.updated_at}
    if(lx<0)li.unshift(lite);else li[lx]=lite
    S.conflict=false
    paintOrd();paintList()
    flash((d.duplicate?'ใบนี้บันทึกไว้แล้ว (กันบันทึกซ้ำ) · ':'บันทึกแล้ว · ')+row.order_no+' · ยอดรวม '+money(row.total)+' บาท',false,'ord')
  }

  // ---------- ส่งสรุป (ตามช่องทางที่มีจริงเท่านั้น) ----------
  function summaryText(){
    const o=S.ord
    const sv=o.saved||{}
    const L=[]
    L.push('สรุปใบสั่งงาน — นัฐภรณ์ เชียงกลาง (NATTA GROUP)')
    L.push('เลขที่ '+(o.order_no||'-')+' · '+(OTYPE[o.order_type]||'')+' · วันที่สั่ง '+dTH(o.order_date))
    L.push('ลูกค้า: '+o.customer_name+(o.phone?' · โทร '+o.phone:''))
    L.push('')
    L.push('รายการ:')
    o.items.forEach((i,x)=>{L.push((x+1)+') '+i.name+' × '+qtyTxt(i.qty)+(i.unit?' '+i.unit:'')+' · '+money(i.unit_price)+' = '+money(r2(r2(num(i.qty))*r2(num(i.unit_price))))+' บาท')})
    L.push('')
    L.push('รวมเป็นเงิน '+money(sv.subtotal)+' บาท'+(num(sv.vat_rate)>0?' · VAT '+num(sv.vat_rate)+'% '+money(sv.vat_amount)+' บาท':''))
    L.push('ยอดรวมทั้งสิ้น '+money(sv.total)+' บาท')
    if(o.pay_status==='account')L.push('ลงบัญชี · ลูกค้าชำระทีหลัง (ยังไม่ได้รับเงิน)')
    else if(o.pay_status!=='unpaid')L.push('รับชำระแล้ว '+money(o.pay_status==='paid'?sv.total:o.paid_amount)+' บาท ('+(PN[o.pay_status]||{}).t+')'+(o.pay_status!=='paid'?' · คงเหลือ '+money(r2(num(sv.total)-num(o.paid_amount)))+' บาท':''))
    L.push((o.fulfil==='delivery'?'จัดส่ง':'รับที่ร้าน')+(o.need_date?' · กำหนด '+dTH(o.need_date):''))
    if(o.note)L.push('หมายเหตุ: '+o.note)
    L.push('')
    L.push('รบกวนตรวจสอบรายการและยืนยันกลับมาได้เลยนะคะ ขอบคุณค่ะ')
    return L.join('\n')
  }
  async function copySummary(){
    const m=S.modal;if(!m)return
    let ok=false
    try{if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(m.text);ok=true}}catch(e){}
    if(!ok){try{const ta=$('so_sumtxt');if(ta){ta.removeAttribute('readonly');ta.focus();ta.select();ok=document.execCommand('copy');ta.setAttribute('readonly','')}}catch(e){}}
    const lg=await q(()=>sb.rpc('sale_order_log_send',{p_order:S.ord.id,p_channel:'copy',p_ok:ok,p_detail:ok?'คัดลอกจากหน้าจอไปส่งเอง':'คัดลอกอัตโนมัติไม่สำเร็จ',p_by:S.staff}))
    if(S.modal!==m)return
    m.copied=ok;m.copyFail=!ok;m.logErr=errMsg(lg)?niceErr(errMsg(lg)):''
    paintModal()
  }
  async function chatSummary(){
    const m=S.modal;if(!m||m.busy)return
    m.busy=true;paintModal()
    const id=S.sel
    const now=new Date().toISOString()
    const r=await q(()=>sb.from('sale_msgs').insert({thread_id:id,dir:'out',kind:'text',body:m.text.slice(0,4000),by_name:S.staff}))
    if(errMsg(r)){m.busy=false;m.chatErr='บันทึกลงแชตไม่สำเร็จ: '+errMsg(r);paintModal();return}
    await q(()=>sb.from('sale_threads').update({last_text:'สรุปใบสั่งงาน '+(S.ord.order_no||''),last_at:now,updated_at:now}).eq('id',id))
    await q(()=>sb.rpc('sale_order_log_send',{p_order:S.ord.id,p_channel:'chat',p_ok:true,p_detail:'บันทึกข้อความสรุปลงแชตในระบบ (ยังไม่ถึงลูกค้า)',p_by:S.staff}))
    closeModal()
    loadList()
    await reloadMsgs(id)
    flash('บันทึกสรุปลงแชตแล้ว — ยังไม่ถูกส่งถึงลูกค้า (LINE OA ยังไม่ได้เชื่อมต่อ)')
  }

  // ---------- แนบไฟล์ ----------
  function pickFile(inputId,cb){const el=$(inputId);if(!el)return;el.onchange=()=>{const f=el.files&&el.files[0];el.value='';if(f)cb(f)};el.click()}
  function checkFile(f){
    if(!OKTYPE.test(f.type||''))return 'รับเฉพาะรูป (PNG/JPG/WebP/GIF) หรือ PDF'
    if(!(f.size>0))return 'ไฟล์ว่าง'
    if(f.size>MAXF)return 'ไฟล์ใหญ่เกิน 10 MB'
    return ''
  }
  const safeName=n=>{const s=String(n||'file').normalize('NFC').replace(/[^\w.ก-๙-]+/g,'_').replace(/_{2,}/g,'_');return s.slice(-80)||'file'}
  // ส่งเป็นไบต์ตรง ๆ พร้อมชนิดไฟล์ (ไฟล์ที่เก็บคือไฟล์จริง ไม่ห่อเป็น form)
  const upload=async(path,f)=>{const buf=await f.arrayBuffer();return sb.storage.from(BUCKET).upload(path,buf,{contentType:f.type,upsert:false})}

  async function chatAttach(f){
    const id=S.sel;if(!id)return
    const bad=checkFile(f);if(bad){flash(bad,true,'chat');return}
    S.chatAttachBusy=true;paintChat()
    const path='chat/'+id+'/'+Date.now()+'-'+safeName(f.name)
    const up=await q(()=>upload(path,f))
    if(errMsg(up)){S.chatAttachBusy=false;paintChat();flash('อัปโหลดไม่สำเร็จ: '+errMsg(up),true,'chat');return}
    const kind=/^image\//.test(f.type)?'image':'file'
    const now=new Date().toISOString()
    // แชตจาก LINE: ส่งรูป/ไฟล์ถึงลูกค้าจากหน้านี้ยังไม่รองรับ จึงเก็บเป็นโน้ตภายใน (ไม่ทำให้ดูเหมือนส่งไปแล้ว)
    const asNote=isLine(S.list.find(x=>x.id===id))
    const r=await q(()=>sb.from('sale_msgs').insert({thread_id:id,dir:asNote?'note':'out',kind,body:f.name,by_name:S.staff,meta:{path,name:f.name,size:f.size,type:f.type}}))
    if(!errMsg(r))await q(()=>sb.from('sale_threads').update({last_text:(asNote?'[โน้ต] ':'')+(kind==='image'?'[รูป] ':'[ไฟล์] ')+f.name,last_at:now,updated_at:now}).eq('id',id))
    S.chatAttachBusy=false
    if(errMsg(r)){paintChat();flash('บันทึกไฟล์ลงแชตไม่สำเร็จ: '+errMsg(r),true,'chat');return}
    loadList()
    await reloadMsgs(id)
    flash((kind==='image'?'แนบรูปแล้ว':'แนบไฟล์แล้ว')+(asNote?' เป็นโน้ตภายใน — ไม่ได้ส่งถึงลูกค้า (ส่งรูปทาง LINE จากหน้านี้ยังไม่รองรับ)':' (บันทึกในระบบ ยังไม่ถึงลูกค้า)'),false,'chat')
  }

  async function ordAttach(f){
    const o=S.ord;if(!o)return
    const bad=checkFile(f);if(bad){flash(bad,true,'ord');return}
    if(o.attach.length>=30){flash('ใบหนึ่งแนบได้ไม่เกิน 30 ไฟล์',true,'ord');return}
    S.attachBusy=true;paintOrd()
    const path='order/'+S.sel+'/'+Date.now()+'-'+safeName(f.name)
    const up=await q(()=>upload(path,f))
    S.attachBusy=false
    if(errMsg(up)){paintOrd();flash('อัปโหลดไม่สำเร็จ: '+errMsg(up),true,'ord');return}
    if(S.ord!==o){flash('อัปโหลดแล้ว แต่ใบที่เปิดเปลี่ยนไป — แนบใหม่ในใบที่ต้องการ',true,'ord');return}
    o.attach.push({path,name:String(f.name).slice(0,200),size:f.size,type:f.type})
    paintOrd()
    flash('แนบไฟล์เข้าใบแล้ว — กด "บันทึกออเดอร์" เพื่อเก็บ (สถานะการชำระเงินไม่เปลี่ยนเอง)',false,'ord')
  }

  // ---------- แชต: บันทึกข้อความ / ขั้นการขาย / แชตใหม่ ----------
  async function send(){
    if(S.busySend||!S.sel)return
    const id=S.sel
    const ta=$('so_txt')
    const body=String((ta&&ta.dataset.id===id?ta.value:S.drafts[id])||'').trim()
    if(!body){flash('พิมพ์ข้อความก่อน',true,'chat');return}
    const note=S.note,now=new Date().toISOString()
    const viaOa=!note&&S.oaLog&&isLine(S.list.find(x=>x.id===id))
    // แชตที่มาจาก LINE: ข้อความธรรมดาไปทางคิวส่ง LINE (โน้ตภายในยังบันทึกในระบบเฉย ๆ)
    if(!note&&!viaOa&&isLine(S.list.find(x=>x.id===id))){await sendLine(id,body);return}
    S.busySend=true;paintChat()
    // คำตอบที่ตอบใน LINE OA Manager แล้ว: บันทึกเข้าแชตให้ทุกคนเห็น — ไม่เข้าคิวส่ง ไม่นับโควตา
    const row={thread_id:id,dir:note?'note':'out',kind:'text',body:body.slice(0,4000),by_name:S.staff}
    if(viaOa)row.meta={src:'oa_manager',delivery:'logged',delivery_at:now}
    const r1=await q(()=>sb.from('sale_msgs').insert(row))
    if(!errMsg(r1))await q(()=>sb.from('sale_threads').update({last_text:(note?'[โน้ต] ':viaOa?'[จาก OA Manager] ':'')+body.slice(0,120),last_at:now,updated_at:now}).eq('id',id))
    S.busySend=false
    if(errMsg(r1)){paintChat();flash('บันทึกไม่สำเร็จ ข้อความยังอยู่ในช่องพิมพ์ ลองอีกครั้ง ('+errMsg(r1)+')',true,'chat');return}
    setDraft(id,'')
    loadList()
    await reloadMsgs(id)
    flash(note?'บันทึกโน้ตแล้ว':viaOa?'บันทึกคำตอบจาก LINE OA Manager แล้ว — ไม่ได้ส่งจากหน้านี้ ทุกคนในทีมเห็นแล้ว':'บันทึกข้อความแล้ว — ยังไม่ถูกส่งถึงลูกค้า',false,'chat')
  }

  async function setStage(k){
    const id=S.sel,t=S.list.find(x=>x.id===id)
    S.stageMenu=false
    if(!id||!t||!STG[k]||t.stage===k){paintChat();return}
    const now=new Date().toISOString()
    const r=await q(()=>sb.from('sale_threads').update({stage:k,updated_at:now}).eq('id',id))
    if(errMsg(r)){paintChat();flash('เปลี่ยนขั้นไม่สำเร็จ: '+errMsg(r),true,'chat');return}
    await q(()=>sb.from('sale_msgs').insert({thread_id:id,dir:'note',kind:'system',body:'ย้ายขั้นเป็น "'+STG[k].t+'"',by_name:S.staff}))
    t.stage=k
    paintList()
    await reloadMsgs(id)
    flash('ย้ายไป "'+STG[k].t+'" แล้ว',false,'chat')
  }

  async function setTag(k){
    const id=S.sel,t=S.list.find(x=>x.id===id)
    S.tagMenu=false
    if(!id||!t||(k&&!TAGN[k])||t.tag===k){paintChat();return}
    const now=new Date().toISOString()
    const r=await q(()=>sb.from('sale_threads').update({tag:k,updated_at:now}).eq('id',id))
    if(errMsg(r)){paintChat();flash('ติดป้ายไม่สำเร็จ: '+errMsg(r),true,'chat');return}
    await q(()=>sb.from('sale_msgs').insert({thread_id:id,dir:'note',kind:'system',body:k?'ติดป้าย "'+TAGN[k].t+'"':'เอาป้ายออก',by_name:S.staff}))
    t.tag=k
    paintList()
    await reloadMsgs(id)
    flash(k?'ติดป้าย "'+TAGN[k].t+'" แล้ว':'เอาป้ายออกแล้ว',false,'chat')
  }

  async function setAssignee(name){
    const id=S.sel,t=S.list.find(x=>x.id===id)
    S.assignMenu=false
    const v=String(name||'').trim().slice(0,80)||null
    if(!id||!t||t.assignee===v){paintChat();return}
    const now=new Date().toISOString()
    const r=await q(()=>sb.from('sale_threads').update({assignee:v,updated_at:now}).eq('id',id))
    if(errMsg(r)){paintChat();flash('ตั้งผู้รับผิดชอบไม่สำเร็จ: '+errMsg(r),true,'chat');return}
    await q(()=>sb.from('sale_msgs').insert({thread_id:id,dir:'note',kind:'system',body:v?'มอบหมายให้ "'+v+'" ดูแล':'เอาผู้รับผิดชอบออก',by_name:S.staff}))
    t.assignee=v
    paintList()
    await reloadMsgs(id)
    flash(v?'มอบหมายให้ "'+v+'" แล้ว':'เอาผู้รับผิดชอบออกแล้ว',false,'chat')
  }

  async function newThread(c,title){
    if(S.creating)return
    if(c){const old=S.list.find(x=>x.customer_id===c.id);if(old){S.picker=false;paintPicker();openThread(old.id);return}}
    const nm=String(c?c.name:title||'').trim().slice(0,200)
    if(!nm){flash('ใส่ชื่อก่อน',true);return}
    S.creating=true
    const now=new Date().toISOString()
    const row={title:nm,source:'manual',stage:'talk',last_at:now}
    if(c){row.customer_id=c.id;row.phone=c.phone||null}
    const r=await q(()=>sb.from('sale_threads').insert(row).select('id').single())
    S.creating=false
    if(errMsg(r)){flash('เปิดแชตไม่สำเร็จ: '+errMsg(r),true);return}
    S.picker=false;S.pick=[];S.pickQ=''
    paintPicker()
    await loadList()
    const id=r.data&&r.data.id
    if(id)await openThread(id)
  }

  // ---------- ตอบลูกค้าทาง LINE (เข้าคิว → บอทส่ง → บอทแจ้งผล) ----------
  // หน้านี้ไม่เคยเขียนว่า "ส่งแล้ว" เอง: ข้อความเข้าคิวในสถานะ "รอส่ง" และเปลี่ยนเป็น "ส่งถึง LINE แล้ว" ได้ทางเดียวคือบอทแจ้งว่า LINE รับแล้ว
  async function sendLine(id,body){
    // รหัสกันส่งซ้ำผูกกับข้อความที่พิมพ์: กดซ้ำ/ส่งซ้ำหลังเน็ตหลุด = ข้อความเดิมข้อความเดียว · แก้ข้อความแล้วส่งใหม่ = รหัสใหม่
    const cur=S.sendTok[id]
    const tok=cur&&cur.text===body?cur.tok:uuid()
    S.sendTok[id]={text:body,tok}
    S.busySend=true;paintChat()
    const r=await q(()=>sb.rpc('sale_line_send',{p_thread:id,p_text:body,p_token:tok,p_by:S.staff,p_order:null}))
    S.busySend=false
    if(errMsg(r)){paintChat();flash('ส่งไม่สำเร็จ ข้อความยังอยู่ในช่องพิมพ์ ('+niceErr(errMsg(r))+')',true,'chat');return}
    delete S.sendTok[id]
    setDraft(id,'')
    loadList(true)
    await reloadMsgs(id)
    flash('เข้าคิวส่งทาง LINE แล้ว — ยังไม่ถือว่าส่งถึงลูกค้า จนกว่า LINE จะรับข้อความ (ผลจะขึ้นที่ข้อความนั้น)',false,'chat')
    schedulePoll(true)
  }
  async function resend(outId){
    if(!outId||S.busyRetry[outId])return
    S.busyRetry[outId]=true;paintMsgs()
    const r=await q(()=>sb.rpc('sale_line_retry',{p_out:outId,p_by:S.staff}))
    delete S.busyRetry[outId]
    if(errMsg(r)){paintMsgs();flash('ส่งใหม่ไม่สำเร็จ: '+niceErr(errMsg(r)),true,'chat');return}
    await reloadMsgs(S.sel)
    flash(r.data&&r.data.changed===false?'ข้อความนี้ไม่อยู่ในสถานะที่ส่งใหม่ได้ ('+r.data.status+')':'เข้าคิวส่งใหม่แล้ว — รอ LINE รับข้อความ',false,'chat')
    schedulePoll(true)
  }
  const outMsg=m=>m&&m.lineOut?S.msgs.find(x=>x.meta&&x.meta.out_id===m.lineOut):null
  const lineDelivery=m=>{const x=outMsg(m);return (x&&x.meta.delivery)||(m&&m.lineStatus)||'queued'}
  // ส่งสรุปใบทาง LINE: ผลการส่งบันทึกลงประวัติของใบโดยฐานข้อมูลเองตอนที่ได้ผลสุดท้าย (ไม่ขึ้นกับว่าหน้านี้ยังเปิดอยู่)
  async function lineSummary(){
    const m=S.modal;if(!m||m.busy||m.lineOut)return
    const t=S.list.find(x=>x.id===S.sel);if(!isLine(t)||!S.ord||!S.ord.id)return
    m.busy=true;m.lineErr='';paintModal()
    const r=await q(()=>sb.rpc('sale_line_send',{p_thread:S.sel,p_text:m.text.slice(0,5000),p_token:m.tok||(m.tok=uuid()),p_by:S.staff,p_order:S.ord.id}))
    m.busy=false
    if(S.modal!==m)return
    if(errMsg(r)){m.lineErr=niceErr(errMsg(r));paintModal();return}
    m.lineOut=r.data&&r.data.out_id;m.lineStatus=(r.data&&r.data.status)||'queued'
    paintModal()
    loadList(true)
    await reloadMsgs(S.sel)
    if(S.modal===m)paintModal()
    schedulePoll(true)
  }
  function lineRow(m){
    const t=S.list.find(x=>x.id===S.sel),st=lineState()
    if(!isLine(t))return '<div class="c off"><b>ส่งทาง LINE OA</b><span class="mut">แชตนี้ไม่ได้มาจาก LINE OA</span></div>'
    if(!st.ok)return `<div class="c off"><b>ส่งทาง LINE OA</b><span class="mut">${E(st.t.replace('LINE OA: ',''))}</span></div>`
    if(m.lineOut)return '<div class="c"><b>ส่งทาง LINE OA</b><span class="mut">เข้าคิวแล้ว · ดูสถานะด้านล่าง</span></div>'
    return `<div class="c"><b>ส่งทาง LINE OA</b><button type="button" class="so-btn pri" data-a="sumline" ${m.busy?'disabled':''}>${m.busy?'กำลังเข้าคิว…':'ส่ง'}</button></div>`
  }
  function lineStatBox(m){
    if(m.lineErr)return `<div class="lstat bad">เข้าคิวส่งทาง LINE ไม่สำเร็จ: ${E(m.lineErr)}</div>`
    if(!m.lineOut)return ''
    const d=lineDelivery(m),x=outMsg(m)
    if(d==='sent')return '<div class="lstat ok">ส่งถึง LINE แล้ว (LINE รับข้อความแล้ว) · บันทึกผลในประวัติของใบแล้ว</div>'
    if(d==='queued'||d==='sending')return '<div class="lstat wait">เข้าคิวส่งทาง LINE แล้ว — รอ LINE รับข้อความ (ยังไม่ถือว่าส่งถึงลูกค้า)</div>'
    return `<div class="lstat bad">${d==='expired'?'ไม่ได้ส่ง: รอเกิน 30 นาทีโดยบอทไม่ได้เริ่มส่ง':d==='unknown'?'ไม่ทราบว่าถึงลูกค้าหรือไม่ (บอทหยุดกลางคัน) ตรวจใน LINE OA Manager ก่อน':'ส่งไม่สำเร็จ: '+E((x&&x.meta.error)||'ไม่ทราบสาเหตุ')} · กด "ส่งใหม่" ได้ที่ข้อความนั้นในแชต</div>`
  }

  // ---------- รีเฟรชอัตโนมัติ: ข้อความใหม่ สถานะการส่ง และสถานะบอท ----------
  const POLL_MS=2000,POLL_FAST_MS=1000
  const isPendingDelivery=d=>d==='queued'||d==='sending'
  const pendingOut=()=>S.msgs.some(m=>m.dir==='out'&&m.meta&&isPendingDelivery(m.meta.delivery))||!!(S.modal&&S.modal.lineOut&&isPendingDelivery(lineDelivery(S.modal)))
  const msgSig=a=>a.map(m=>[m.id,m.dir,m.kind,(m.meta&&m.meta.delivery)||'',(m.meta&&m.meta.error)||''].join('|')).join(';')
  function schedulePoll(soon){
    if(S.poll)clearTimeout(S.poll)
    S.poll=setTimeout(pollTick,soon||pendingOut()?POLL_FAST_MS:POLL_MS)
  }
  async function pollTick(){
    S.poll=null
    if(!$('so_root'))return // ออกจากหน้านี้แล้ว: หยุด (เมื่อกลับมา V.saleorders เริ่มใหม่)
    if(document.hidden){schedulePoll();return}
    try{
      S.pollN++
      if(S.pollN%4===0)await loadLine() // สัญญาณชีพของบอท: ทุก ~30 วินาที
      // ถามแบบเบา ๆ ก่อน (แชตที่อัปเดตล่าสุดเปลี่ยนไหม — ไม่กี่ร้อยไบต์) แล้วค่อยดึงรายชื่อทั้งหมดเมื่อมีอะไรเปลี่ยน · ทุก ~48 วินาทีดึงเต็มเพื่อกันพลาด
      // (ตัวเลข "ยังไม่อ่าน" ที่พนักงานคนอื่นเคลียร์ และสถานะใบ ไม่ขยับเวลาอัปเดตของแชต) — ไม่ดึงทั้งรายชื่อทุก 8 วินาที เพราะข้อมูลโตแล้วจะกินโควตาข้อมูลของ Supabase
      if((await probeList())||S.pollN%6===0)await loadList(true)
      await refreshOpen()
      // อ่านแล้วเมื่อห้องแชตอยู่บนจอจริง (มือถือที่ยังอยู่หน้ารายชื่อ = ยังไม่ได้อ่าน)
      const wide=!(window.matchMedia&&window.matchMedia('(max-width:900px)').matches)
      const t=S.list.find(x=>x.id===S.sel)
      if(t&&t.unread>0&&S.msgs.length&&!S.msgsLoading&&(wide||S.mode!=='list'))markRead(t)
    }catch(e){}
    schedulePoll()
  }
  async function markRead(t){
    const r=await q(()=>sb.from('sale_threads').update({unread:0}).eq('id',t.id))
    if(!errMsg(r)){t.unread=0;paintList();paintMTabs()}
  }
  // แชตที่อัปเดตล่าสุดเปลี่ยนไหม (แชตใหม่ ข้อความใหม่ ผลการส่ง — ฐานข้อมูลแตะเวลาอัปเดตของแชตทุกครั้งที่ข้อความเข้า/ออก/ผลการส่งมา)
  async function probeList(){
    const r=await q(()=>sb.from('sale_threads').select('id,updated_at').order('updated_at',{ascending:false}).limit(1))
    if(errMsg(r))return false
    const row=r.data&&r.data[0]
    const sig=row?row.id+'|'+row.updated_at:'none'
    const changed=sig!==S.probe
    S.probe=sig
    return changed
  }
  // แชตที่เปิดอยู่: ถามเวลาอัปเดตของแชตนี้ (~100 ไบต์) ถ้าเปลี่ยนค่อยโหลดข้อความ และวาดเฉพาะรายการข้อความเมื่อมีอะไรต่างจริง
  async function refreshOpen(){
    const id=S.sel;if(!id||S.msgsLoading)return
    const r=await q(()=>sb.from('sale_threads').select('updated_at').eq('id',id).limit(1))
    if(errMsg(r)||S.sel!==id)return
    const stamp=id+'|'+((r.data&&r.data[0]&&r.data[0].updated_at)||'')
    if(S.openStamp===stamp)return
    const m=await q(()=>sb.from('sale_msgs').select('*').eq('thread_id',id).order('created_at',{ascending:true}).limit(400))
    if(errMsg(m)||S.sel!==id)return
    S.openStamp=stamp
    const rows=m.data||[]
    if(rows.length===S.msgs.length&&msgSig(rows)===msgSig(S.msgs))return // เวลาอัปเดตขยับเพราะเหตุที่ไม่เห็นในห้องแชต (ขั้น ยังไม่อ่าน)
    S.msgs=rows;S.errMsgs=''
    paintMsgs()
    loadImages()
    if(S.modal&&S.modal.kind==='summary'&&S.modal.lineOut)paintModal()
  }

  // ---------- หน้าต่างยืนยัน / ตรวจ ----------
  function openModal(m){S.modal=m;paintModal()}
  function closeModal(){S.modal=null;paintModal()}
  // ยอดปิดงาน: ใบที่สถานะ "ปิดออเดอร์" นับตามวันที่ปิด (closed_at) แยกตามผู้รับผิดชอบ · ส่วนที่ส่งมอบแล้วแต่ยังไม่ปิดแสดงแยก ไม่นับในยอดปิด
  function sinceOf(p){
    const d=new Date()
    if(p==='today'){d.setHours(0,0,0,0)}
    else if(p==='week'){d.setDate(d.getDate()-6);d.setHours(0,0,0,0)}
    else if(p==='month'){d.setDate(1);d.setHours(0,0,0,0)}
    else return null
    return d.toISOString()
  }
  function openClosedSum(){openModal({kind:'closedsum',period:'month',rows:null,delivered:null,busy:true,err:''});loadClosedSum(S.modal)}
  async function loadClosedSum(m){
    let qb=sb.from('sale_orders').select('id,order_no,customer_name,total,assignee,closed_at').eq('job_status','closed').order('closed_at',{ascending:false}).limit(2000)
    const since=sinceOf(m.period)
    if(since)qb=qb.gte('closed_at',since)
    const r=await q(()=>qb)
    const d=await q(()=>sb.from('sale_orders').select('total,assignee').eq('job_status','delivered').limit(2000))
    if(S.modal!==m)return
    m.busy=false
    if(errMsg(r)||errMsg(d)){m.err=niceErr(errMsg(r)||errMsg(d))}
    else{m.rows=r.data||[];m.delivered=d.data||[]}
    paintModal()
  }
  function paintModal(){
    const host=$('so_modalhost');if(!host)return
    const m=S.modal
    if(!m){host.innerHTML='';return}
    let head='',body='',foot=''
    if(m.kind==='confirm'){
      head=`<b>${E(m.title||'ยืนยัน')}</b>`
      body=`<div>${E(m.body||'')}</div>`
      foot=`<button type="button" class="so-btn" data-a="mclose">${E(m.no||'ยกเลิก')}</button><button type="button" class="so-btn ${m.danger?'danger':'pri'}" data-a="myes">${E(m.yes||'ตกลง')}</button>`
    }else if(m.kind==='prompt'){
      head=`<b>${E(m.title||'กรอกข้อมูล')}</b>`
      body=`<div class="mut">${E(m.body||'')}</div><input id="so_mp" type="text" style="width:100%;margin-top:10px;border:1px solid #E3E9F1;border-radius:10px;padding:9px 10px;font:inherit" placeholder="${E(m.ph||'')}" maxlength="500">`
      foot=`<button type="button" class="so-btn" data-a="mclose">ยกเลิก</button><button type="button" class="so-btn pri" data-a="myesprompt">ตกลง</button>`
    }else if(m.kind==='parse'){
      head=`<b>สร้างรายการจากแชต — ตรวจก่อนเพิ่ม</b>`
      body=`<div class="mut" style="margin-bottom:6px">${m.text&&m.read?'ข้อความล่าสุดของลูกค้าในแชตนี้':'วางข้อความรายการจากลูกค้า (เช่น คัดลอกจาก LINE OA)'} · หนึ่งบรรทัดต่อหนึ่งรายการ มีจำนวนท้ายบรรทัด เช่น "กระดาษ A4 10 รีม"</div>
        <textarea id="so_ptxt" rows="5" placeholder="กระดาษถ่ายเอกสาร A4 10 รีม&#10;ปากกาเจล สีน้ำเงิน 3 โหล">${E(m.text||'')}</textarea>
        <div style="display:flex;justify-content:flex-end;margin:6px 0 10px"><button type="button" class="so-btn" data-a="parseread">อ่านรายการ</button></div>
        ${m.read?(m.rows.length?`<div class="mut" style="margin-bottom:6px">พบ ${m.rows.length} รายการ · ติ๊กออกได้ แก้ชื่อ/จำนวน/ราคาได้ · ราคา 0 = ยังไม่ผูกกับสินค้า ให้ใส่ราคาเอง · ยังไม่มีอะไรถูกบันทึก</div>
        <table><thead><tr><th></th><th>รายการ</th><th>จำนวน</th><th>หน่วย</th><th>ราคา/หน่วย</th></tr></thead><tbody>
        ${m.rows.map((r,i)=>`<tr>
          <td><input type="checkbox" data-pf="use" data-i="${i}" ${r.use?'checked':''} aria-label="ใช้รายการที่ ${i+1}"></td>
          <td><input type="text" data-pf="name" data-i="${i}" value="${E(r.name)}" aria-label="ชื่อรายการที่ ${i+1}">${r.bound?'<span class="bound">ผูกกับสินค้าในระบบ</span>':''}</td>
          <td style="width:68px"><input type="text" inputmode="decimal" data-pf="qty" data-i="${i}" value="${E(qtyTxt(r.qty))}" aria-label="จำนวนรายการที่ ${i+1}"></td>
          <td style="width:64px"><input type="text" data-pf="unit" data-i="${i}" value="${E(r.unit)}" aria-label="หน่วยรายการที่ ${i+1}"></td>
          <td style="width:86px"><input type="text" inputmode="decimal" data-pf="unit_price" data-i="${i}" value="${E(r.unit_price)}" aria-label="ราคารายการที่ ${i+1}"></td>
        </tr>`).join('')}</tbody></table>`
        :`<div class="warn">อ่านเป็นรายการไม่ได้ — ต้องมีจำนวนท้ายบรรทัด เช่น "กระดาษ A4 10 รีม" (เพิ่มรายการเองได้จากปุ่ม "เพิ่มรายการ")</div>`):''}`
      foot=`<button type="button" class="so-btn" data-a="mclose">ปิด</button><button type="button" class="so-btn pri" data-a="parseadd" ${m.read&&m.rows.some(r=>r.use)?'':'disabled'}>เพิ่มเข้าใบ (เฉพาะที่ติ๊ก)</button>`
    }else if(m.kind==='summary'){
      const o=S.ord
      head=`<b>ส่งสรุปให้ลูกค้า — ${E(o.order_no)}</b>`
      body=`
        <div class="rcpt"><b>ผู้รับ:</b> ${E(o.customer_name)}${o.phone?' · โทร '+E(o.phone):''}<br><span class="mut">ตรวจรายการ ยอด และผู้รับให้ถูกต้องก่อนส่ง</span></div>
        ${m.copied?'<div class="okx">คัดลอกแล้ว — นำไปวางส่งในแชตกับลูกค้าเอง (ระบบบันทึกว่า "คัดลอกไปส่งเอง" ยังไม่ได้ส่งจากระบบ)</div>':''}
        ${m.copyFail?'<div class="warn">คัดลอกอัตโนมัติไม่สำเร็จ — กดค้างในกล่องข้อความแล้วเลือกคัดลอกเอง</div>':''}
        ${m.chatErr?`<div class="warn">${E(m.chatErr)}</div>`:''}
        ${m.logErr?`<div class="warn">บันทึกประวัติการส่งไม่สำเร็จ: ${E(m.logErr)}</div>`:''}
        <textarea id="so_sumtxt" rows="12" readonly aria-label="ข้อความสรุป">${E(m.text)}</textarea>
        <div class="chan">
          ${lineRow(m)}
          <div class="c off"><b>ส่งทาง Facebook</b><span class="mut">ยังไม่ได้เชื่อมต่อ</span></div>
          <div class="c"><b>คัดลอกข้อความไปส่งเอง</b><button type="button" class="so-btn pri" data-a="sumcopy">คัดลอก</button></div>
          <div class="c"><b>บันทึกสรุปลงแชตในระบบ</b><button type="button" class="so-btn" data-a="sumchat" ${m.busy?'disabled':''}>${m.busy?'กำลังบันทึก…':'บันทึก'}</button></div>
        </div>
        ${lineStatBox(m)}
        ${(m.copied||(m.lineOut&&lineDelivery(m)==='sent'))&&o.job_status==='pending'?'<div style="margin-top:10px;display:flex;justify-content:flex-end"><button type="button" class="so-btn" data-a="setawait">ตั้งสถานะงานเป็น "รอลูกค้ายืนยัน" แล้วบันทึก</button></div>':''}
        <div class="mut" style="margin-top:8px">ระบบจะไม่แสดงว่า "ส่งสำเร็จ" จนกว่าจะส่งถึงลูกค้าจริง — ช่องทางที่ใช้ได้ตอนนี้: ${isLine(S.list.find(x=>x.id===S.sel))&&lineState().ok?'ส่งทาง LINE OA · ':''}คัดลอกไปส่งเอง</div>`
      foot=`<button type="button" class="so-btn" data-a="mclose">ปิด</button>`
    }else if(m.kind==='closedsum'){
      const PER=[['today','วันนี้'],['week','7 วันล่าสุด'],['month','เดือนนี้'],['all','ทั้งหมด']]
      head=`<b>ยอดปิดงาน</b>`
      const list=m.rows||[]
      const by={};let sum=0
      for(const r of list){const k=String(r.assignee||'').trim()||'ไม่ระบุผู้รับผิดชอบ';const t=num(r.total);sum+=t;by[k]=by[k]||{n:0,t:0};by[k].n++;by[k].t+=t}
      const people=Object.entries(by).sort((a,b)=>b[1].t-a[1].t)
      const dl=m.delivered||[];const dsum=dl.reduce((s,r)=>s+num(r.total),0)
      body=`<div class="mut" style="margin-bottom:8px">${PER.map(([k,t])=>`<button type="button" class="so-tab${m.period===k?' on':''}" data-a="cspan" data-p="${k}">${t}</button>`).join('')}</div>
        ${m.err?`<div class="warn">${E(m.err)}</div>`:''}
        ${m.busy?'<div class="mut">กำลังโหลด…</div>':`
        <div class="rcpt"><b>ปิดงานแล้ว ${list.length} ใบ · รวม ${money(sum)} บาท</b><br><span class="mut">ยอดตามที่ระบุในใบ (รวมภาษีถ้ามี) · นับตามวันที่ปิดงาน</span></div>
        <table><thead><tr><th>ผู้รับผิดชอบ</th><th>ปิดแล้ว</th><th>ยอดรวม (บาท)</th></tr></thead><tbody>
        ${people.map(([k,v])=>`<tr><td>${E(k)}</td><td>${v.n}</td><td>${money(v.t)}</td></tr>`).join('')||'<tr><td colspan="3" class="mut">ยังไม่มีใบที่ปิดในช่วงนี้</td></tr>'}</tbody></table>
        <div class="mut" style="margin:10px 0 6px">ส่งมอบแล้ว รอปิดงาน ${dl.length} ใบ · ${money(dsum)} บาท (ไม่นับในยอดปิด)</div>
        ${list.length?`<table><thead><tr><th>เลขที่</th><th>ลูกค้า</th><th>ผู้รับผิดชอบ</th><th>วันที่ปิด</th><th>ยอด</th></tr></thead><tbody>
        ${list.slice(0,30).map(r=>`<tr><td>${E(r.order_no)}</td><td>${E(r.customer_name)}</td><td>${E(String(r.assignee||'').trim()||'ไม่ระบุ')}</td><td>${E(r.closed_at?new Date(r.closed_at).toLocaleDateString('th-TH'):'')}</td><td>${money(r.total)}</td></tr>`).join('')}</tbody></table>`:''}
        ${list.length>30?`<div class="mut">แสดง 30 ใบแรกจากทั้งหมด ${list.length} ใบ</div>`:''}`}`
      foot=`<button type="button" class="so-btn" data-a="mclose">ปิด</button>`
    }
    host.innerHTML=`<div id="so_modalwrap" data-a="mwrap"><div id="so_modal" role="dialog" aria-modal="true" aria-label="${E((m.title||m.kind))}"><div class="mh">${head}<button type="button" class="so-del" data-a="mclose" aria-label="ปิด" style="font-size:20px">×</button></div><div class="mb">${body}</div><div class="mf">${foot}</div></div></div>`
    const inp=$('so_mp');if(inp)inp.focus()
  }

  // ---------- เหตุการณ์ ----------
  function onInput(e){
    const t=e.target
    if(t.id==='so_q'){S.q=t.value;paintList();return}
    if(t.id==='so_txt'){if(t.dataset.id)S.drafts[t.dataset.id]=t.value;return}
    if(t.id==='so_cq'){searchCust(t.value);return}
    if(t.id==='so_clq'){searchThreadCust(t.value);return}
    if(t.id==='so_pq'){prodSearch(t.value);return}
    if(t.id==='so_ptxt'&&S.modal&&S.modal.kind==='parse'){S.modal.text=t.value;return}
    if(t.dataset&&t.dataset.pf&&S.modal&&S.modal.kind==='parse'){
      S.modal.touched=true
      const r=S.modal.rows[+t.dataset.i];if(!r)return
      const f=t.dataset.pf
      if(f==='use'){r.use=t.checked;const b=document.querySelector('#so_modal [data-a="parseadd"]');if(b)b.disabled=!S.modal.rows.some(x=>x.use)}
      else if(f==='qty'||f==='unit_price')r[f]=num(t.value)
      else r[f]=t.value
      return
    }
    const f=t.dataset&&t.dataset.f
    if(!f||!S.ord)return
    if(t.dataset.i!=null&&/^i(name|qty|unit|price)$/.test(f)){
      const it=S.ord.items[+t.dataset.i];if(!it)return
      if(f==='iname')it.name=t.value
      else if(f==='iqty')it.qty=t.value
      else if(f==='iunit')it.unit=t.value
      else it.unit_price=t.value
      const tr=t.closest('tr');if(tr){const cell=tr.querySelector('[data-cell="line"]');if(cell)cell.textContent=money(r2(r2(num(it.qty))*r2(num(it.unit_price))))}
      updateTotals()
      return
    }
    if(f==='customer_name'){
      if(S.ord.customer_id&&S.ord.linkedName!==t.value)S.ord.customer_id=null
      S.ord.customer_name=t.value;paintDirtyBits();searchOrdCust(t.value);return
    }
    if(['customer_name','phone','note','assignee'].includes(f)){S.ord[f]=t.value;paintDirtyBits();return}
    if(f==='paid_amount'){S.ord.paid_amount=t.value;paintDirtyBits();return}
  }

  function onChange(e){
    const t=e.target
    const f=t.dataset&&t.dataset.f
    if(!f||!S.ord)return
    const o=S.ord
    if(f==='vat'){o.vat_on=!!t.value;o.vat_store_id=t.value||null;paintOrd();return}
    if(f==='price_school'){setBasis(t.value);return}
    if(f==='pay_status'){o.pay_status=t.value;if(t.value!=='deposit'&&t.value!=='partial')o.paid_amount=0;paintOrd();return}
    if(['fulfil','job_status','order_date','need_date'].includes(f)){o[f]=t.value;if(f==='job_status'&&t.value!=='canceled')o.reason='';paintOrd();return}
    if(/^i(qty|price)$/.test(f)&&t.dataset.i!=null){
      // จัดรูปตัวเลขเมื่อออกจากช่อง (ค่าเดียวกัน แค่แสดงให้อ่านง่าย)
      const it=o.items[+t.dataset.i];if(!it)return
      if(f==='iqty')it.qty=num(it.qty);else it.unit_price=num(it.unit_price)
      updateTotals()
    }
  }

  function onKey(e){
    if(e.target.id==='so_txt'&&e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send();return}
    if(e.target.dataset&&e.target.dataset.f==='iname'&&e.key==='Enter'){e.preventDefault();return} // ชื่อรายการเป็นบรรทัดเดียว (แค่ตัดคำให้อ่านได้)
    if(e.target.id==='so_mp'&&e.key==='Enter'&&!e.isComposing){e.preventDefault();const m=S.modal;const v=e.target.value;closeModal();if(m&&m.onYes)m.onYes(v);return}
    if(e.key==='Escape'){
      if(S.modal){closeModal();return}
      if(S.prodOpen){S.prodOpen=false;paintOrd();return}
      if(S.stageMenu){S.stageMenu=false;paintChat();return}
      if(S.picker){S.picker=false;S.pick=[];paintPicker()}
    }
  }

  function guardSwitch(go,what){
    if(S.ord&&isDirty())openModal({kind:'confirm',title:'ยังไม่ได้บันทึก',body:'ใบที่เปิดอยู่มีการแก้ไขที่ยังไม่ได้บันทึก '+what+'เลยหรือไม่? (สิ่งที่แก้ค้างไว้จะหาย)',yes:what,no:'อยู่ต่อ',danger:true,onYes:go})
    else go()
  }

  function onClick(e){
    const el=e.target.closest('[data-a]')
    if(!el)return
    const a=el.dataset.a
    if(a==='mwrap'){if(e.target.id==='so_modalwrap')closeModal();return}
    if(a==='mclose'){closeModal();return}
    if(a==='closedsum'){openClosedSum();return}
    if(a==='cspan'){const m=S.modal;if(!m||m.kind!=='closedsum')return;m.period=el.dataset.p;m.busy=true;m.err='';paintModal();loadClosedSum(m);return}
    if(a==='myes'){const m=S.modal;closeModal();if(m&&m.onYes)m.onYes();return}
    if(a==='myesprompt'){const m=S.modal;const v=($('so_mp')||{}).value;closeModal();if(m&&m.onYes)m.onYes(v);return}
    if(a==='tab'){S.tab=el.dataset.k;paintList();return}
    if(a==='open'){openThread(el.dataset.id);return}
    if(a==='retrylist'){S.errList='';loadList();return}
    if(a==='retrythread'){openThread(S.sel,true);return}
    if(a==='send'){send();return}
    if(a==='note'){S.note=!S.note;if(S.note)S.oaLog=false;paintChat();return}
    if(a==='oalog'){S.oaLog=!S.oaLog;if(S.oaLog)S.note=false;paintChat();return}
    if(a==='tplpick'){
      const txt=(TPL[+el.dataset.k]||[])[1];if(!txt||!S.sel)return
      const id=S.sel
      const ta=$('so_txt')
      const cur=ta&&ta.dataset.id===id?ta.value:(S.drafts[id]||'')
      setDraft(id,cur.trim()?cur.replace(/\s*$/,'')+'\n'+txt:txt)
      const ta2=$('so_txt');if(ta2)ta2.focus()
      return
    }
    if(a==='stagemenu'){S.stageMenu=!S.stageMenu;S.tagMenu=false;S.assignMenu=false;paintChat();return}
    if(a==='stage'){setStage(el.dataset.k);return}
    if(a==='tagmenu'){S.tagMenu=!S.tagMenu;S.stageMenu=false;S.assignMenu=false;paintChat();return}
    if(a==='tag'){setTag(el.dataset.k||null);return}
    if(a==='assignmenu'){S.assignMenu=!S.assignMenu;S.stageMenu=false;S.tagMenu=false;paintChat();return}
    if(a==='assign'){setAssignee(el.dataset.k);return}
    if(a==='assigncustom'){const i=$('so_assignc');setAssignee(i?i.value:'');return}
    if(a==='custlinktoggle'){S.custLink=!S.custLink;S.custLinkQ='';S.custLinkRows=[];paintOrd();const i=$('so_clq');if(i)i.focus();return}
    if(a==='pickthreadcust'){pickThreadCust(el.dataset.id,el.dataset.n,el.dataset.p);return}
    if(a==='picker'){S.picker=!S.picker;if(!S.picker){S.pick=[];S.pickQ=''}paintPicker();const i=$('so_cq');if(i)i.focus();return}
    if(a==='pickc'){const c=S.pick.find(x=>x.id===el.dataset.id);if(c)newThread(c);return}
    if(a==='picknew'){newThread(null,S.pickQ);return}
    if(a==='mmode'){if(el.dataset.k!=='list'&&!S.sel)return;setMode(el.dataset.k);if(el.dataset.k==='chat'){const ms=$('so_msgs');if(ms)ms.scrollTop=ms.scrollHeight}return}
    if(a==='chatattach'){pickFile('so_chatfile',chatAttach);return}
    if(a==='openfile'){openFile(el.dataset.p);return}
    if(a==='pickord'){const id=el.dataset.id;if(S.ord&&S.ord.id===id)return;guardSwitch(()=>{const tk=S.tok;loadOrd(id,tk).then(()=>{if(tk===S.tok)paintOrd()});paintOrd()},'สลับใบ');return}
    if(a==='newordbtn'){if(S.ord&&!S.ord.id)return;guardSwitch(()=>{S.ord=newOrd(S.list.find(x=>x.id===S.sel));S.conflict=false;paintOrd()},'เปิดใบใหม่');return}
    if(a==='reloadord'){const oid=S.ord&&S.ord.id;if(!oid)return;const id=S.sel;S.ord.base=serializeOrd(S.ord);openThread(id,true).then(()=>{const r=S.ords.find(x=>x.id===oid);if(r&&S.ord&&S.ord.id!==oid){const tk=S.tok;loadOrd(oid,tk).then(()=>{if(tk===S.tok)paintOrd()})}});return}
    if(a==='otype'){if(S.ord&&!S.ord.id){S.ord.order_type=el.dataset.k==='docs'?'docs':'goods';paintOrd()}return}
    if(a==='prodtoggle'){S.prodOpen=!S.prodOpen;S.prodQ='';S.prodRows=[];S.prodPrice={};paintOrd();const i=$('so_pq');if(i)i.focus();return}
    if(a==='prodpick'){
      const p=S.prodRows.find(x=>x.id===el.dataset.id);if(!p||!S.ord)return
      const sp=S.prodPrice[p.id]
      addItem({product_id:p.id,kind:p.type==='งานบริการ'?'service':'goods',name:p.name,qty:1,unit:p.unit||'',unit_price:S.ord.price_school_id&&sp!=null?sp:num(p.price)})
      return
    }
    if(a==='addblank'){if(S.ord)addItem({product_id:null,kind:el.dataset.k==='service'?'service':'goods',name:'',qty:1,unit:el.dataset.k==='service'?'งาน':'',unit_price:0});const ins=document.querySelectorAll('#so_ord [data-f="iname"]');if(ins.length)ins[ins.length-1].focus();return}
    if(a==='delitem'){if(S.ord){S.ord.items.splice(+el.dataset.i,1);paintOrd()}return}
    if(a==='parsechat'){openParse();return}
    if(a==='parseread'){const m=S.modal;if(!m||m.kind!=='parse')return;const ta=$('so_ptxt');m.text=ta?ta.value:m.text;m.rows=parseLines(m.text);m.read=true;m.touched=false;paintModal();bindParsed();return}
    if(a==='parseadd'){
      const m=S.modal;if(!m||m.kind!=='parse'||!S.ord)return
      const rows=m.rows.filter(r=>r.use&&String(r.name||'').trim()&&num(r.qty)>0)
      closeModal()
      if(!rows.length){flash('ไม่มีรายการที่เลือก',true,'ord');return}
      rows.forEach(r=>S.ord.items.push({product_id:r.product_id||null,kind:'goods',name:String(r.name).trim(),qty:num(r.qty),unit:r.unit||'',unit_price:num(r.unit_price)}))
      paintOrd()
      flash('เพิ่ม '+rows.length+' รายการเข้าใบแล้ว — ตรวจราคาแล้วกด "บันทึกออเดอร์"',false,'ord')
      return
    }
    if(a==='ordattach'){pickFile('so_ordfile',ordAttach);return}
    if(a==='delattach'){if(S.ord){S.ord.attach.splice(+el.dataset.i,1);paintOrd()}return}
    if(a==='pickordcust'){pickOrdCust(el.dataset.id,el.dataset.n,el.dataset.p);return}
    if(a==='save'){save();return}
    if(a==='summary'){if(!S.ord||!S.ord.id||isDirty())return;openModal({kind:'summary',text:summaryText()});return}
    if(a==='sumcopy'){copySummary();return}
    if(a==='sumchat'){chatSummary();return}
    if(a==='sumline'){lineSummary();return}
    if(a==='resend'){resend(el.dataset.o);return}
    if(a==='setawait'){closeModal();if(S.ord&&S.ord.job_status==='pending'){S.ord.job_status='awaiting';paintOrd();save()}return}
  }

  window.addEventListener('beforeunload',e=>{if(S.ord&&isDirty()){e.preventDefault();e.returnValue=''}})

  V.saleorders=function(){
    css()
    mount()
    S.mode=S.sel?(S.mode==='list'?'chat':S.mode):'list'
    paintAll()
    loadStaff()
    loadRefs().then(()=>{if(S.ord)paintOrd()})
    loadLine()
    loadList().then(()=>{if(S.sel)openThread(S.sel,true)})
    schedulePoll() // ข้อความใหม่ สถานะการส่ง และสถานะบอท มาเองโดยไม่ต้องรีเฟรชหน้า (หยุดเองเมื่อออกจากหน้านี้)
  }
  window.NattaSaleOrders={open:openThread,reload:loadList,parseOrderText,tick:pollTick,line:()=>loadLine(true)}
})()
$so$, updated_at = now() where name = 'saleorders';
  raise notice 'saleorders: now v11 (enabled and seq unchanged)';
end
$do$;
