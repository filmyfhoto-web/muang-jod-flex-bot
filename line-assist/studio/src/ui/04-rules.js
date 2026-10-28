// ---------------------------------------------------------------------------------------------------------------
// Left column: the kinds of answer to drag in, and the list of rules (checked top to bottom, the first match answers).
// ---------------------------------------------------------------------------------------------------------------
const TYPE_INFO = {
  card: { tag: 'CARD', name: 'การ์ด', icon: 'card', hint: 'หัวเรื่อง + ข้อความ + รูป + ปุ่มลิงก์' },
  text: { tag: 'TEXT', name: 'ข้อความ', icon: 'text', hint: 'ข้อความธรรมดา' },
  image: { tag: 'IMAGE', name: 'รูปภาพ', icon: 'image', hint: 'รูปจากลิงก์ https' },
  sticker: { tag: 'STICKER', name: 'สติกเกอร์', icon: 'sticker', hint: 'สติกเกอร์ LINE' },
  flex: { tag: 'FLEX', name: 'Flex เอง', icon: 'flex', hint: 'การ์ดที่ออกแบบเองจาก LINE Flex Simulator' },
  silent: { tag: 'ไม่ตอบ', name: 'ไม่ตอบ', icon: 'silent', hint: 'บอทเงียบ ให้แอดมินตอบเอง' },
};
const PALETTE = ['text', 'card', 'image', 'sticker', 'silent'];

function newReply(type) {
  switch (type) {
    case 'text':
      return { type: 'text', text: '' };
    case 'card':
      return { type: 'card', title: '', text: '', image: '', button: null };
    case 'image':
      return { type: 'image', url: '', previewUrl: '' };
    case 'sticker':
      return { type: 'sticker', packageId: '446', stickerId: '1988' };
    case 'flex':
      return {
        type: 'flex',
        altText: 'ข้อความจากร้าน',
        contents: { type: 'bubble', body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: 'สวัสดีค่ะ', weight: 'bold', size: 'lg', wrap: true }] } },
      };
    default:
      return { type: 'silent' };
  }
}

function newRule(type) {
  return { id: uid(), name: 'กฎใหม่', enabled: true, match: 'contains', keywords: [], replies: [newReply(type)], quick: true };
}

// what is missing before a rule can answer
function problemsOf(rule) {
  const p = [];
  if (!rule.keywords?.length) p.push('ยังไม่มีคำที่ลูกค้าพิมพ์');
  const rs = rule.replies || [];
  if (!rs.length) p.push('ยังไม่มีคำตอบ');
  rs.forEach((r, i) => {
    const n = rs.length > 1 ? ` (คำตอบที่ ${i + 1})` : '';
    if (r.type === 'text' && !String(r.text || '').trim()) p.push('ข้อความว่าง' + n);
    if (r.type === 'card' && !String(r.text || '').trim()) p.push('การ์ดยังไม่มีข้อความ' + n);
    if (r.type === 'card' && r.button && String(r.button.url || '').trim() && !/^https:\/\//i.test(r.button.url)) p.push('ลิงก์ปุ่มต้องขึ้นต้น https://' + n);
    if (r.type === 'image' && !/^https:\/\//i.test(String(r.url || ''))) p.push('รูปต้องเป็นลิงก์ https://' + n);
    if (r.type === 'sticker' && !(/^\d+$/.test(String(r.packageId || '')) && /^\d+$/.test(String(r.stickerId || '')))) p.push('เลขสติกเกอร์ไม่ถูกต้อง' + n);
    if (r.type === 'flex' && !(r.contents && ['bubble', 'carousel'].includes(r.contents.type))) p.push('JSON ของ Flex ไม่ถูกต้อง' + n);
  });
  return p;
}

const typesOf = (rule) => [...new Set((rule.replies || []).map((r) => r.type))];

function ruleItem(rule, index) {
  const probs = problemsOf(rule);
  const li = h('li', { class: 'rule' + (rule.id === S.sel ? ' sel' : '') + (rule.enabled === false ? ' off' : ''), draggable: 'true', dataset: { id: rule.id }, tabindex: '0' });
  const tags = h('div', { class: 'tags' });
  for (const t of typesOf(rule)) tags.append(h('span', { class: 'tag t-' + t }, TYPE_INFO[t]?.tag || t));
  tags.append(h('span', { class: 'tag t-match' }, rule.match === 'exact' ? 'ตรงทั้งข้อความ' : 'มีคำนี้'));
  if (rule.quick !== false && typesOf(rule)[0] !== 'silent') tags.append(h('span', { class: 't-quick tag' }, 'ปุ่มลัด'));
  if (probs.length) tags.append(h('span', { class: 'tag t-warn', title: probs.join(' · ') }, 'ยังไม่ครบ'));
  const kw = (rule.keywords || []).join(', ');
  li.append(
    h('span', { class: 'grip', title: 'ลากเพื่อสลับลำดับ' }, icon('grip', 16)),
    h(
      'div',
      { class: 'rule-main' },
      h('div', { class: 'rule-title' }, h('b', {}, `${index + 1}. `), rule.name || '(ไม่มีชื่อ)'),
      tags,
      h('div', { class: 'rule-kw' }, icon('key', 13), h('span', {}, kw ? clip(kw, 70) : 'ยังไม่มีคำ'))
    ),
    h(
      'div',
      { class: 'rule-act' },
      h('label', { class: 'switch', title: rule.enabled === false ? 'ปิดอยู่ (บอทข้ามกฎนี้)' : 'เปิดใช้' }, h('input', { type: 'checkbox', checked: rule.enabled !== false, 'aria-label': 'เปิดใช้กฎนี้', onchange: (e) => ((rule.enabled = e.target.checked), touch()) }), h('i')),
      h('button', { type: 'button', class: 'iconbtn', title: 'ทำสำเนา', onclick: (e) => (e.stopPropagation(), duplicateRule(rule.id)) }, icon('copy', 15)),
      h('button', { type: 'button', class: 'iconbtn danger', title: 'ลบกฎนี้', onclick: (e) => (e.stopPropagation(), deleteRule(rule.id)) }, icon('trash', 15))
    )
  );
  li.addEventListener('click', (e) => {
    if (e.target.closest('.rule-act')) return;
    selectRule(rule.id);
  });
  li.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target === li) {
      e.preventDefault();
      selectRule(rule.id);
    }
  });
  return li;
}

function renderPalette() {
  const box = $('#palette');
  if (!box) return;
  box.replaceChildren(
    ...PALETTE.map((t) => {
      const info = TYPE_INFO[t];
      const b = h('button', { type: 'button', class: 'pal pal-' + t, draggable: 'true', title: info.hint + ' — ลากไปวาง หรือกดเพื่อสร้างกฎใหม่' }, icon(info.icon, 20), h('span', {}, info.name));
      b.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/x-new-reply', t);
        e.dataTransfer.effectAllowed = 'copy';
      });
      b.addEventListener('click', () => addRule(t));
      return b;
    })
  );
}

function renderRules() {
  const ul = $('#rules');
  if (!ul) return;
  const rules = S.content?.rules || [];
  const q = S.q.trim().toLowerCase();
  const shown = rules.map((r, i) => ({ r, i })).filter(({ r }) => !q || (r.name || '').toLowerCase().includes(q) || (r.keywords || []).some((k) => k.toLowerCase().includes(q)));
  ul.replaceChildren(...shown.map(({ r, i }) => ruleItem(r, i)));
  if (!shown.length) ul.append(h('li', { class: 'rules-empty' }, rules.length ? 'ไม่พบกฎที่ค้นหา' : 'ยังไม่มีกฎ กด “เพิ่มกฎใหม่” หรือลากชนิดคำตอบมาวางที่นี่'));
  const cnt = $('#rules-count');
  if (cnt) cnt.textContent = String(rules.length);
}

// ---- changing the list ------------------------------------------------------------------------------------------

function touch() {
  updateHeader();
  renderRules();
  refreshTurns();
}

function selectRule(id) {
  S.sel = id;
  if (S.view !== 'editor' && S.view !== 'flow') S.view = 'editor';
  S.pane = 'center';
  renderRules();
  renderCenter();
  renderPane();
}

function addRule(type, at) {
  const r = newRule(type);
  const list = S.content.rules;
  if (list.length >= Engine.MAX_RULES) return toast(`ใส่ได้ไม่เกิน ${Engine.MAX_RULES} กฎค่ะ`, 'warn');
  if (at == null || at > list.length) list.push(r);
  else list.splice(at, 0, r);
  S.sel = r.id;
  S.view = 'editor';
  S.pane = 'center';
  S.q = '';
  const qi = $('#rule-q');
  if (qi) qi.value = '';
  touch();
  renderCenter();
  renderPane();
  setTimeout(() => $('#f-name')?.select(), 0);
}

function duplicateRule(id) {
  const i = S.content.rules.findIndex((r) => r.id === id);
  if (i < 0) return;
  const copy = clone(S.content.rules[i]);
  copy.id = uid();
  copy.name = (copy.name || 'กฎ') + ' (สำเนา)';
  S.content.rules.splice(i + 1, 0, copy);
  S.sel = copy.id;
  touch();
  renderCenter();
}

function deleteRule(id) {
  const i = S.content.rules.findIndex((r) => r.id === id);
  if (i < 0) return;
  const [gone] = S.content.rules.splice(i, 1);
  if (S.sel === id) S.sel = S.content.rules[Math.min(i, S.content.rules.length - 1)]?.id ?? null;
  touch();
  renderCenter();
  toast(`ลบ “${clip(gone.name || 'กฎ', 24)}” แล้ว (ยังไม่บันทึกจนกว่าจะกดบันทึก)`, 'info');
}

function moveRule(id, delta) {
  const list = S.content.rules;
  const i = list.findIndex((r) => r.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  touch();
  renderCenter();
}

// ---- drag and drop --------------------------------------------------------------------------------------------

function wireRulesDnD() {
  const ul = $('#rules');
  if (!ul) return;
  let overEl = null;
  let overAfter = false;
  const clear = () => {
    $$('.drop-before,.drop-after', ul).forEach((e) => e.classList.remove('drop-before', 'drop-after'));
    ul.classList.remove('drop-end');
    overEl = null;
  };
  ul.addEventListener('dragstart', (e) => {
    const li = e.target.closest?.('li.rule');
    if (!li) return;
    e.dataTransfer.setData('text/x-rule', li.dataset.id);
    e.dataTransfer.effectAllowed = 'move';
    li.classList.add('dragging');
  });
  ul.addEventListener('dragend', () => {
    $$('.dragging', ul).forEach((e) => e.classList.remove('dragging'));
    clear();
  });
  ul.addEventListener('dragover', (e) => {
    const types = Array.from(e.dataTransfer?.types || []);
    if (!types.includes('text/x-rule') && !types.includes('text/x-new-reply')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = types.includes('text/x-rule') ? 'move' : 'copy';
    clear();
    const li = e.target.closest('li.rule');
    if (li) {
      const r = li.getBoundingClientRect();
      overAfter = e.clientY > r.top + r.height / 2;
      overEl = li;
      li.classList.add(overAfter ? 'drop-after' : 'drop-before');
    } else {
      ul.classList.add('drop-end');
    }
  });
  ul.addEventListener('dragleave', (e) => {
    if (!ul.contains(e.relatedTarget)) clear();
  });
  ul.addEventListener('drop', (e) => {
    e.preventDefault();
    const rid = e.dataTransfer.getData('text/x-rule');
    const nt = e.dataTransfer.getData('text/x-new-reply');
    const list = S.content.rules;
    let at = list.length;
    if (overEl) {
      const i = list.findIndex((r) => r.id === overEl.dataset.id);
      at = overAfter ? i + 1 : i;
    }
    clear();
    if (rid) {
      const from = list.findIndex((r) => r.id === rid);
      if (from < 0) return;
      const [moved] = list.splice(from, 1);
      if (from < at) at -= 1;
      list.splice(Math.max(0, Math.min(at, list.length)), 0, moved);
      touch();
      renderCenter();
    } else if (nt) {
      addRule(nt, at);
    }
  });
}
