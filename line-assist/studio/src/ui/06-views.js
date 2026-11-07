// ---------------------------------------------------------------------------------------------------------------
// Centre column: the test line, the answer-order map (flow), general texts, schools, the bot's state, export/import.
// ---------------------------------------------------------------------------------------------------------------
const STAGE_NAMES = {
  thanks: 'ขอบคุณ (ระบบ)',
  school: 'ลูกค้าบอกชื่อโรงเรียน (ระบบ)',
  supplies: 'อุปกรณ์การเรียน → ถามว่าโรงเรียนไหน (ระบบ)',
  contact: 'คุยกับแอดมิน (ระบบ)',
  document: 'ส่งเอกสารโครงการ (ระบบ)',
  order: 'สั่งงาน/สั่งทำ → เลือกแอดมิน (ระบบ)',
  ask: 'ถามเรื่องที่บอทไม่รู้ → เลือกแอดมิน (ระบบ)',
  greeting: 'ทักทาย / เมนู (ระบบ)',
  fallback: 'ไม่ตรงกฎไหน → บอทไม่ตอบ',
};

// which box of the map a test message ended in
function stageKeyOf(run) {
  if (!run) return null;
  switch (run.stage) {
    case 'school-ask':
      return 'supplies';
    case 'order':
      return run.which === 'documentAsk' ? 'document' : 'order';
    case 'rule':
    case 'off':
      return run.matched ? 'rule:' + run.matched : 'fallback';
    default:
      return run.stage;
  }
}

function runLabel(run) {
  const key = stageKeyOf(run);
  if (!key) return '';
  if (key.startsWith('rule:')) {
    const i = S.content.rules.findIndex((r) => r.id === key.slice(5));
    const r = S.content.rules[i];
    return r ? `กฎที่ ${i + 1}: ${r.name}${run.stage === 'off' ? ' (ตั้งไว้ไม่ตอบ)' : ''}` : 'กฎที่เพิ่งลบ';
  }
  return STAGE_NAMES[key] || key;
}

function renderTestLine() {
  const el = $('#test-result');
  if (!el) return;
  el.replaceChildren();
  if (!S.lastRun) {
    el.append(h('span', { class: 'muted' }, 'พิมพ์ข้อความลูกค้า กด “ทดสอบ” จะบอกว่าตรงกับกฎไหน และโทรศัพท์ทางขวาจะแสดงคำตอบ'));
    return;
  }
  const silent = S.lastRun.stage === 'fallback' || S.lastRun.stage === 'off';
  el.append(h('span', { class: 'matched' + (silent ? ' none' : '') }, icon(silent ? 'silent' : 'check', 14), h('b', {}, silent ? 'บอทไม่ตอบ' : 'ตรงกับ'), ' ', runLabel(S.lastRun)));
}

function testBar() {
  const input = h('input', { id: 'test-input', class: 'input', type: 'text', placeholder: 'ข้อความของลูกค้า เช่น ร้านเปิดกี่โมงคะ', autocomplete: 'off' });
  const go = () => {
    const v = input.value;
    if (!v.trim()) return;
    sendUser(v);
    input.select();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      go();
    }
  });
  return h(
    'div',
    { class: 'testbar' },
    h('div', { class: 'testrow' }, h('label', { for: 'test-input' }, 'ทดสอบข้อความ'), input, h('button', { type: 'button', class: 'btn btn-primary', onclick: go }, icon('play', 14), 'ทดสอบ')),
    h('div', { id: 'test-result', class: 'test-result' })
  );
}

// ---- the answer-order map -----------------------------------------------------------------------------------------

function replySummary(replies) {
  const rs = replies || [];
  if (!rs.length) return 'ยังไม่มีคำตอบ';
  if (rs[0].type === 'silent') return 'ไม่ตอบ';
  const first = rs[0];
  const t = first.type === 'card' ? first.title || first.text : first.type === 'text' ? first.text : first.type === 'image' ? first.url : first.type === 'sticker' ? `${first.packageId}/${first.stickerId}` : first.altText;
  return `${rs.length} คำตอบ · ${TYPE_INFO[first.type]?.tag || first.type}${t ? ' “' + clip(String(t).replace(/\s+/g, ' '), 26) + '”' : ''}`;
}

function flowStages(shop) {
  const c = shop.contact;
  const sup = shop.schoolSupplies;
  const sys = (key, name, when, out, go) => ({ key, name, when, out, sys: true, go });
  const first = [
    sys('thanks', 'ขอบคุณ', 'ลูกค้าพิมพ์ ขอบคุณ / thanks / ขอบใจ', 'การ์ดตอบรับ', 'texts'),
    sys('school', 'ลูกค้าบอกชื่อโรงเรียน', 'หลังบอทถามว่าโรงเรียนไหน', 'การ์ดลิงก์รายการอุปกรณ์', 'schools'),
    sys('supplies', sup.label, 'พิมพ์ ' + (sup.keywords || []).slice(0, 3).join(' / '), 'ถามว่าโรงเรียนไหน', 'schools'),
    sys('contact', 'คุยกับแอดมิน', 'กดปุ่ม ' + [c.button, ...(c.buttonAliases || [])].filter(Boolean).join(' / '), 'การ์ดเลือกชื่อแอดมิน', 'texts'),
    sys('document', 'ส่งเอกสารโครงการ', 'พิมพ์ ' + (c.documentWords || []).slice(0, 3).join(' / '), 'การ์ดเลือกชื่อแอดมิน', 'texts'),
    sys('order', 'สั่งงาน / สั่งทำ', 'พิมพ์ ' + (c.orderWords || []).slice(0, 4).join(' / ') + ((c.orderWords || []).length > 4 ? ' …' : ''), 'การ์ดเลือกชื่อแอดมิน', 'texts'),
  ];
  const rules = (S.content.rules || []).map((r, i) => ({ key: 'rule:' + r.id, name: `${i + 1}. ${r.name}`, rule: r, i }));
  const last = [
    sys('ask', 'ถามที่บอทไม่รู้', 'พิมพ์ ' + (c.askWords || []).slice(0, 3).join(' / ') + ((c.askWords || []).length > 3 ? ' …' : ''), 'การ์ดเลือกชื่อแอดมิน', 'texts'),
    sys('greeting', 'ทักทาย / เมนู', 'พิมพ์ สวัสดี / เมนู', 'การ์ดเมนู', 'texts'),
    sys('fallback', 'เรื่องอื่น ๆ', 'ไม่ตรงอะไรเลย', 'ไม่ตอบ (แอดมินเห็นแชทแล้วตอบเอง)', null),
  ];
  return [...first, ...rules, ...last];
}

function renderFlow(root) {
  const shop = currentShop();
  const hitKey = stageKeyOf(S.lastRun);
  root.append(
    h('p', { class: 'sub' }, 'บอทไล่ดูจากบนลงล่าง เจอที่ตรงก่อนก็ตอบเลยและหยุด กล่องสีเทาคือขั้นตอนของระบบ กล่องสีขาวคือกฎของร้าน (คลิกเพื่อแก้ไข)')
  );
  if (S.lastRun) root.append(h('div', { class: 'hitbar' }, icon('check', 14), h('b', {}, 'ข้อความ “' + clip(S.lastRun.text, 30) + '” '), runLabel(S.lastRun)));
  const list = h('div', { class: 'flow' });
  list.append(h('div', { class: 'flow-start' }, h('i', { class: 'live-dot' }), h('div', {}, h('b', {}, 'ข้อความเข้า'), h('small', {}, 'จากแชท LINE ของลูกค้า'))));
  let passed = Boolean(hitKey);
  for (const st of flowStages(shop)) {
    const hit = st.key === hitKey;
    if (hit) passed = false;
    const node = h('div', { class: 'flow-row' + (hit ? ' hit' : '') + (passed ? ' passed' : '') + (!hit && hitKey && !passed ? ' skipped' : '') });
    const left = h('button', { type: 'button', class: 'stage' + (st.sys ? ' sys' : ' own') + (st.rule && st.rule.id === S.sel ? ' sel' : ''), onclick: () => (st.rule ? selectRuleFromFlow(st.rule.id) : st.go ? ((S.view = st.go), renderTabs(), renderCenter()) : null) });
    if (st.rule) {
      const r = st.rule;
      left.append(
        h('div', { class: 'stage-name' }, st.name, r.enabled === false ? h('span', { class: 'tag t-off' }, 'ปิดอยู่') : null),
        h('div', { class: 'tags' }, typesOf(r).map((t) => h('span', { class: 'tag t-' + t }, TYPE_INFO[t]?.tag || t)), h('span', { class: 'tag t-match' }, r.match === 'exact' ? 'ตรงทั้งข้อความ' : 'มีคำนี้')),
        h('div', { class: 'rule-kw' }, icon('key', 13), h('span', {}, r.keywords.length ? clip(r.keywords.join(', '), 60) : 'ยังไม่มีคำ'))
      );
    } else {
      left.append(h('div', { class: 'stage-name' }, st.name), h('div', { class: 'stage-when' }, st.when));
    }
    const right = h('div', { class: 'out' + (st.rule && st.rule.replies[0]?.type === 'silent' ? ' silent' : '') }, st.rule ? replySummary(st.rule.replies) : st.out);
    node.append(left, h('div', { class: 'arrow' }, h('span', {}, 'ตรง'), h('i')), right);
    list.append(h('div', { class: 'nomatch' + (hit ? ' stop' : '') }, hit ? '' : 'ไม่ตรง ↓'), node);
  }
  root.append(list);
}

function selectRuleFromFlow(id) {
  S.sel = id;
  S.view = 'editor';
  renderTabs();
  renderRules();
  renderCenter();
}

// ---- general texts -------------------------------------------------------------------------------------------------

const WEEKDAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

function renderTexts(root) {
  const c = S.content;
  c.contact = c.contact || {};
  const words = (key) => {
    c.contact[key] = Array.isArray(c.contact[key]) ? c.contact[key] : [];
    return c.contact[key];
  };
  const holiday = (c.holiday = c.holiday || { weekday: 6, message: '' });
  root.append(
    h('div', { class: 'ed-head' }, h('div', {}, h('h2', {}, 'ข้อความทั่วไป'), h('p', { class: 'sub' }, 'ข้อความของระบบที่ไม่ใช่กฎถามตอบ'))),
    h(
      'section',
      { class: 'card-sec' },
      h('h3', { class: 'sec-title' }, 'ทักทายและขอบคุณ'),
      field('ข้อความทักทาย (การ์ดเมนูตอนลูกค้าพิมพ์ “เมนู”)', textArea(c.greeting, (v) => ((c.greeting = v), touch()), 3, { maxlength: '1000' })),
      field('ข้อความตอบ “ขอบคุณ”', textArea(c.thanks, (v) => ((c.thanks = v), touch()), 2, { maxlength: '500' }))
    ),
    h(
      'section',
      { class: 'card-sec' },
      h('h3', { class: 'sec-title' }, 'วันหยุดประจำสัปดาห์'),
      field(
        'วันที่ร้านหยุด',
        h(
          'div',
          { class: 'stack' },
          seg(
            [['none', 'ไม่มีวันหยุด'], ...WEEKDAYS.map((d, i) => [String(i), d])],
            holiday.weekday == null ? 'none' : String(holiday.weekday),
            (v) => ((holiday.weekday = v === 'none' ? null : Number(v)), touch(), renderCenter())
          ),
          textArea(holiday.message, (v) => ((holiday.message = v), touch()), 3, { maxlength: '500', placeholder: 'ข้อความแจ้งวันหยุด (ส่งนำหน้าคำตอบแรกของลูกค้าในวันนั้น วันละครั้ง)' })
        ),
        'นับเวลาประเทศไทย บอทแจ้งลูกค้าคนละครั้งต่อวัน'
      )
    ),
    h(
      'section',
      { class: 'card-sec' },
      h('h3', { class: 'sec-title' }, 'เรียกแอดมิน'),
      field('ข้อความเหนือปุ่มเลือกแอดมิน (ทั่วไป)', textArea(c.contact.ask, (v) => ((c.contact.ask = v), touch()), 3, { maxlength: '500' })),
      field('ข้อความเมื่อลูกค้าสั่งงาน/สั่งทำ', textArea(c.contact.orderAsk, (v) => ((c.contact.orderAsk = v), touch()), 3, { maxlength: '500' })),
      field('ข้อความเมื่อลูกค้าจะส่งเอกสารโครงการ', textArea(c.contact.documentAsk, (v) => ((c.contact.documentAsk = v), touch()), 3, { maxlength: '500' })),
      field('คำที่แปลว่า “สั่งงาน/สั่งทำ”', chipsInput(words('orderWords'), () => touch(), { max: 60, maxLen: 40 }), 'ลูกค้าพิมพ์คำเหล่านี้ → บอทให้เลือกแอดมิน'),
      field('คำที่แปลว่า “ขอถามเรื่องที่บอทไม่รู้”', chipsInput(words('askWords'), () => touch(), { max: 60, maxLen: 40 }), 'ถ้าไม่ตรงกฎไหนแต่มีคำเหล่านี้ → ให้เลือกแอดมิน'),
      field('คำที่แปลว่า “ส่งเอกสารโครงการ”', chipsInput(words('documentWords'), () => touch(), { max: 20, maxLen: 40 }))
    ),
    h('p', { class: 'note' }, 'รายชื่อแอดมิน (เจ้ปิ่น หญิง ฟิล์ม) และเวลาที่บอทเงียบหลังลูกค้าเลือก ตั้งในหน้าตั้งค่า LINE ของร้าน หน้านี้ไม่ได้แก้ส่วนนั้น')
  );
}

// ---- schools ---------------------------------------------------------------------------------------------------------

function renderSchools(root) {
  const sup = S.content.schoolSupplies;
  sup.schools = Array.isArray(sup.schools) ? sup.schools : [];
  sup.keywords = Array.isArray(sup.keywords) ? sup.keywords : [];
  const q = S.schoolQ.trim().toLowerCase();
  const rows = sup.schools.map((s, i) => ({ s, i })).filter(({ s }) => !q || (s.name || '').toLowerCase().includes(q) || (s.aliases || []).some((a) => a.toLowerCase().includes(q)));

  const table = h('div', { class: 'schools' });
  for (const { s, i } of rows) {
    s.aliases = Array.isArray(s.aliases) ? s.aliases : [];
    const bad = !/^https:\/\//i.test(String(s.link || '')) || !String(s.name || '').trim();
    table.append(
      h(
        'div',
        { class: 'school' + (bad ? ' bad' : '') },
        h('div', { class: 'school-main' }, textInput(s.name, (v) => ((s.name = v), updateHeader()), { placeholder: 'ชื่อโรงเรียน เช่น โรงเรียนบ้านกอก', maxlength: '80' }), textInput(s.link, (v) => ((s.link = v), updateHeader()), { placeholder: 'https://www.nattagroup.com/…' })),
        h('div', { class: 'school-alias' }, chipsInput(s.aliases, () => updateHeader(), { placeholder: 'ชื่อเรียกอื่น (ไม่บังคับ)', max: 10, maxLen: 60 })),
        h(
          'button',
          {
            type: 'button',
            class: 'iconbtn danger',
            title: 'ลบโรงเรียนนี้',
            onclick: () => {
              sup.schools.splice(i, 1);
              updateHeader();
              renderCenter();
            },
          },
          icon('trash', 15)
        )
      )
    );
  }
  if (!rows.length) table.append(h('p', { class: 'note' }, sup.schools.length ? 'ไม่พบโรงเรียนที่ค้นหา' : 'ยังไม่มีโรงเรียน กด “เพิ่มโรงเรียน”'));

  const search = textInput(S.schoolQ, (v) => {
    S.schoolQ = v;
    renderCenterKeepFocus('#school-q');
  }, { id: 'school-q', placeholder: 'ค้นหาโรงเรียน…' });

  root.append(
    h('div', { class: 'ed-head' }, h('div', {}, h('h2', {}, 'โรงเรียน · อุปกรณ์การเรียน'), h('p', { class: 'sub' }, `${sup.schools.length} โรงเรียน · ลูกค้าพิมพ์ “${(sup.keywords || [])[0] || 'อุปกรณ์การเรียน'}” → บอทถามชื่อโรงเรียน → ส่งลิงก์`))),
    h(
      'section',
      { class: 'card-sec' },
      field('ชื่อหัวข้อ (เช่น ภาคเรียน)', textInput(sup.label, (v) => ((sup.label = v), updateHeader()), { maxlength: '40' }), 'เปลี่ยนเป็น “อุปกรณ์การเรียน 1-70” เมื่อขึ้นภาคเรียนใหม่ แล้วอย่าลืมเปลี่ยนปุ่มลัดในหน้าตั้งค่า LINE ของร้านให้ตรงกัน'),
      field('คำที่แปลว่าถามหาอุปกรณ์การเรียน', chipsInput(sup.keywords, () => updateHeader(), { max: 20, maxLen: 40 })),
      field('ข้อความถามชื่อโรงเรียน', textArea(sup.ask, (v) => ((sup.ask = v), updateHeader()), 3, { maxlength: '500' })),
      field('ข้อความตอนส่งลิงก์ ({school} = ชื่อโรงเรียน)', textArea(sup.found, (v) => ((sup.found = v), updateHeader()), 2, { maxlength: '500' })),
      field('ข้อความเมื่อไม่พบโรงเรียน', textArea(sup.notFound, (v) => ((sup.notFound = v), updateHeader()), 2, { maxlength: '500' }))
    ),
    h('div', { class: 'toolbar' }, search, h('button', { type: 'button', class: 'btn btn-primary', onclick: () => {
      sup.schools.push({ name: '', aliases: [], link: '' });
      S.schoolQ = '';
      updateHeader();
      renderCenter();
      setTimeout(() => $$('.school .input').slice(-2)[0]?.focus(), 0);
    } }, icon('plus', 16), 'เพิ่มโรงเรียน')),
    table
  );
}

function renderCenterKeepFocus(sel) {
  const el = $(sel);
  const pos = el ? el.selectionStart : null;
  renderCenter();
  const again = $(sel);
  if (again) {
    again.focus();
    if (pos != null) again.setSelectionRange(pos, pos);
  }
}

// ---- the bot's state ----------------------------------------------------------------------------------------------------

const MODES = [
  ['off', 'บอทเดิมตอบทุกคน', 'คำตอบมาจากไฟล์ตั้งค่าเดิมของบอท (shop.json) เหมือนก่อนใช้หน้านี้ ที่แก้ในหน้านี้ยังไม่ถูกใช้'],
  ['admins', 'ทดลอง: เฉพาะแอดมิน', 'เฉพาะข้อความของแอดมินที่ผูก LINE ไว้ ได้คำตอบตามที่แก้ในหน้านี้ ลูกค้าทั่วไปยังได้คำตอบจากบอทเดิม'],
  ['all', 'ทุกคนได้คำตอบตามที่แก้ในหน้านี้', 'ลูกค้าทุกคนได้คำตอบที่แก้ในหน้านี้ (คำตอบในไฟล์เดิมไม่ถูกใช้)'],
];

function onoff(v) {
  return h('span', { class: 'pill ' + (v ? 'on' : 'off') }, v ? 'เปิด' : 'ปิด');
}

function renderBotView(root) {
  const row = S.row || {};
  const bot = S.bot || {};
  const mode = Engine.modeOf(row);
  const people = (row.admins || []).map((a) => a.name);
  const status = {
    ready: ['ok', 'เชื่อมฐานข้อมูลร้านแล้ว'],
    connecting: ['info', 'กำลังเชื่อมต่อ…'],
    offline: ['warn', 'ยังไม่ได้เชื่อมฐานข้อมูล (โหมดดูตัวอย่าง)'],
    error: ['bad', 'เชื่อมต่อไม่สำเร็จ'],
  }[S.conn];

  const modeList = h(
    'div',
    { class: 'modes' },
    MODES.map(([v, name, desc]) =>
      h(
        'button',
        { type: 'button', class: 'mode' + (v === mode ? ' on' : ''), disabled: S.conn !== 'ready' || S.busy, onclick: () => ((S.modeAsk = v === mode ? null : v), renderCenter()) },
        h('span', { class: 'radio' }),
        h('div', {}, h('b', {}, name), h('small', {}, desc))
      )
    )
  );

  const ask = S.modeAsk
    ? h(
        'div',
        { class: 'confirm' },
        h('p', {}, S.modeAsk === 'all' ? 'เปลี่ยนเป็น “ทุกคนได้คำตอบตามที่แก้ในหน้านี้” ลูกค้าทุกคนจะได้คำตอบใหม่ทันที ยืนยัน?' : S.modeAsk === 'off' ? 'เปลี่ยนกลับเป็น “บอทเดิมตอบทุกคน” ยืนยัน?' : 'เปลี่ยนเป็นโหมดทดลองเฉพาะแอดมิน ยืนยัน?'),
        h(
          'div',
          {},
          h('button', { type: 'button', class: 'btn btn-primary btn-sm', disabled: S.busy, onclick: () => applyMode(S.modeAsk) }, 'ยืนยัน'),
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => ((S.modeAsk = null), renderCenter()) }, 'ยกเลิก')
        )
      )
    : null;

  root.append(
    h('div', { class: 'ed-head' }, h('div', {}, h('h2', {}, 'สถานะบอท'), h('p', { class: 'sub' }, 'ใครได้คำตอบที่แก้ในหน้านี้ และสวิตช์ของแอปที่เกี่ยวข้อง'))),
    S.connMsg ? h('div', { class: 'banner ' + (S.conn === 'error' ? 'bad' : 'warn') }, icon('warn', 16), S.connMsg) : null,
    h('section', { class: 'card-sec' }, h('h3', { class: 'sec-title' }, 'การเชื่อมต่อ'), h('p', { class: 'statusline' }, h('span', { class: 'pill ' + status[0] }, status[1]), S.conn === 'error' ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: reloadAll }, 'ลองอีกครั้ง') : null)),
    h('section', { class: 'card-sec' }, h('h3', { class: 'sec-title' }, 'ใครได้คำตอบที่แก้ในหน้านี้'), modeList, ask),
    h(
      'section',
      { class: 'card-sec' },
      h('h3', { class: 'sec-title' }, 'แอดมินที่บอทแจ้งเตือน'),
      h('p', { class: 'people' }, people.length ? people.map((n) => h('span', { class: 'kchip static' }, n)) : 'ยังไม่มีแอดมินที่ผูก LINE ไว้'),
      h('p', { class: 'f-hint' }, 'ลูกค้าส่งรูปหรือไฟล์ → แจ้งทั้ง 3 คน (ไม่เกินครั้งละ 5 ชั่วโมงต่อลูกค้า)')
    ),
    h(
      'section',
      { class: 'card-sec' },
      h('h3', { class: 'sec-title' }, 'ตั้งค่าบอทในระบบร้าน (ดูอย่างเดียว)'),
      h(
        'dl',
        { class: 'kv' },
        h('dt', {}, 'ฟีเจอร์ของแอปทั้งหมด (ปิด = บอทเดิมตอบเองหมด)'), h('dd', {}, onoff(bot.enabled !== false)),
        h('dt', {}, 'การ์ดเมนูตอนเพิ่มเพื่อน / พิมพ์ “เมนู”'), h('dd', {}, onoff(bot.menu_card !== false)),
        h('dt', {}, 'เลือกชื่อแอดมินแล้วบอทเงียบ'), h('dd', {}, onoff(bot.admin_pick !== false), ' ', bot.silence_hours ? `${bot.silence_hours} ชม.` : ''),
        h('dt', {}, 'ส่งเอกสารโครงการ'), h('dd', {}, onoff(bot.docs !== false))
      ),
      h('p', { class: 'f-hint' }, 'สวิตช์เหล่านี้อยู่ในหน้าตั้งค่า LINE ของเว็บร้าน บอทอ่านค่าใหม่ทุกประมาณ 15 วินาที ที่นี่ดูได้อย่างเดียว')
    )
  );
}

async function applyMode(mode) {
  S.busy = true;
  renderCenter();
  try {
    await setMode(mode);
    toast('เปลี่ยนโหมดแล้ว');
  } catch (e) {
    toast(explain(e), 'bad');
  }
  S.busy = false;
  S.modeAsk = null;
  renderCenter();
}

// ---- export / import -----------------------------------------------------------------------------------------------------

function exportText() {
  const out = clone(S.content);
  out.rules = Engine.cleanRules(out.rules);
  return JSON.stringify(out, null, 2);
}

function renderJson(root) {
  const area = h('textarea', { class: 'input area mono', rows: '18', spellcheck: 'false', id: 'json-area' });
  area.value = exportText();
  const msg = h('p', { class: 'f-hint' }, 'ข้อมูลทั้งหมดที่หน้านี้บันทึก (กฎ โรงเรียน ข้อความ) คัดลอกเก็บไว้เป็นสำรอง หรือวางข้อมูลที่เคยสำรองไว้แล้วกด “นำเข้า”');
  root.append(
    h('div', { class: 'ed-head' }, h('div', {}, h('h2', {}, 'Export / Import JSON'), h('p', { class: 'sub' }, 'สำรองและย้ายข้อมูลของบอท'))),
    area,
    msg,
    h(
      'div',
      { class: 'toolbar' },
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => copyText(area.value) }, icon('copy', 15), 'คัดลอก'),
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-primary',
          onclick: () => {
            try {
              const j = JSON.parse(area.value);
              if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error('ต้องเป็น JSON แบบ { … }');
              const next = clone(S.content);
              if (Array.isArray(j.rules)) next.rules = Engine.cleanRules(j.rules);
              if (j.schoolSupplies && Array.isArray(j.schoolSupplies.schools)) next.schoolSupplies = j.schoolSupplies;
              for (const k of ['greeting', 'thanks']) if (typeof j[k] === 'string') next[k] = j[k];
              if (j.holiday && typeof j.holiday === 'object') next.holiday = j.holiday;
              if (j.contact && typeof j.contact === 'object') next.contact = { ...next.contact, ...pick(j.contact, CONTACT_KEYS) };
              S.content = next;
              if (!ruleById(S.sel)) S.sel = next.rules[0]?.id ?? null;
              touch();
              renderCenter();
              toast('นำเข้าแล้ว (ยังไม่บันทึกจนกว่าจะกดบันทึก)');
            } catch (e) {
              msg.textContent = 'นำเข้าไม่ได้: ' + clip(e.message, 100);
              msg.className = 'f-hint bad';
            }
          },
        },
        icon('save', 15),
        'นำเข้า'
      )
    )
  );
}
