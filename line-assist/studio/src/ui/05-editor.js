// ---------------------------------------------------------------------------------------------------------------
// Form pieces, and the rule editor (centre column, "แก้ไขกฎ").
// ---------------------------------------------------------------------------------------------------------------
function field(label, control, hint, cls) {
  return h('div', { class: 'field' + (cls ? ' ' + cls : '') }, h('label', { class: 'f-label' }, label), control, hint ? h('p', { class: 'f-hint' }, hint) : null);
}

function textInput(value, onInput, attrs = {}) {
  const el = h('input', { type: 'text', class: 'input', autocomplete: 'off', ...attrs });
  el.value = value ?? '';
  el.addEventListener('input', () => onInput(el.value));
  return el;
}

function textArea(value, onInput, rows = 4, attrs = {}) {
  const el = h('textarea', { class: 'input area', rows: String(rows), ...attrs });
  el.value = value ?? '';
  el.addEventListener('input', () => onInput(el.value));
  return el;
}

function seg(options, value, onChange) {
  return h('div', { class: 'seg' }, options.map(([v, label, hint]) => h('button', { type: 'button', class: v === value ? 'on' : '', title: hint || '', onclick: () => onChange(v) }, label)));
}

function toggle(checked, label, onChange, id) {
  return h('label', { class: 'toggle' }, h('span', { class: 'switch' }, h('input', { type: 'checkbox', id, checked: !!checked, onchange: (e) => onChange(e.target.checked) }), h('i')), h('span', {}, label));
}

// words as little tags: type, press Enter or comma to add
function chipsInput(values, onChange, { placeholder = 'พิมพ์คำแล้วกด Enter', max = 40, maxLen = 60 } = {}) {
  const box = h('div', { class: 'chips-in' });
  const list = values;
  const draw = () => {
    box.replaceChildren();
    list.forEach((v, i) =>
      box.append(
        h(
          'span',
          { class: 'kchip' },
          v,
          h(
            'button',
            {
              type: 'button',
              title: 'เอาออก',
              onclick: () => {
                list.splice(i, 1);
                onChange(list);
                draw();
              },
            },
            icon('x', 12)
          )
        )
      )
    );
    const inp = h('input', { type: 'text', class: 'chips-field', placeholder: list.length ? '' : placeholder, autocomplete: 'off' });
    const add = () => {
      const parts = inp.value.split(/[,\n]/).map((s) => s.trim().slice(0, maxLen)).filter(Boolean);
      if (!parts.length) return;
      let n = 0;
      for (const p of parts) {
        if (list.length >= max) break;
        if (list.some((x) => x.toLowerCase() === p.toLowerCase())) continue;
        list.push(p);
        n++;
      }
      inp.value = '';
      if (n) {
        onChange(list);
        draw();
        box.querySelector('.chips-field')?.focus();
      }
    };
    inp.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ',') && !e.isComposing) {
        e.preventDefault();
        add();
      } else if (e.key === 'Backspace' && !inp.value && list.length) {
        list.pop();
        onChange(list);
        draw();
        box.querySelector('.chips-field')?.focus();
      }
    });
    inp.addEventListener('blur', add);
    box.append(inp);
  };
  draw();
  box.addEventListener('click', (e) => {
    if (e.target === box) box.querySelector('.chips-field')?.focus();
  });
  return box;
}

// ---- the editor -----------------------------------------------------------------------------------------------------

const flexRaw = new WeakMap(); // the text of a Flex JSON box while it is being typed

function replyBlock(rule, reply, index) {
  const info = TYPE_INFO[reply.type] || TYPE_INFO.text;
  const total = rule.replies.length;
  const head = h(
    'div',
    { class: 'rb-head' },
    h('span', { class: 'tag t-' + reply.type }, info.tag),
    h('b', {}, `คำตอบที่ ${index + 1}: ${info.name}`),
    h(
      'div',
      { class: 'rb-act' },
      total > 1 ? h('button', { type: 'button', class: 'iconbtn', title: 'เลื่อนขึ้น', disabled: index === 0, onclick: () => moveReply(rule, index, -1) }, icon('up', 15)) : null,
      total > 1 ? h('button', { type: 'button', class: 'iconbtn', title: 'เลื่อนลง', disabled: index === total - 1, onclick: () => moveReply(rule, index, 1) }, icon('down', 15)) : null,
      h('button', { type: 'button', class: 'iconbtn danger', title: 'เอาคำตอบนี้ออก', onclick: () => removeReply(rule, index) }, icon('trash', 15))
    )
  );
  const body = h('div', { class: 'rb-body' });
  const upd = () => touch();

  switch (reply.type) {
    case 'text':
      body.append(field('ข้อความที่บอทส่ง', textArea(reply.text, (v) => ((reply.text = v), upd()), 5, { maxlength: '5000', placeholder: 'พิมพ์คำตอบ…' })));
      break;
    case 'card':
      body.append(
        field('หัวเรื่อง', textInput(reply.title, (v) => ((reply.title = v), upd()), { maxlength: '40', placeholder: 'เช่น เวลาเปิดร้าน' })),
        field('ข้อความในการ์ด', textArea(reply.text, (v) => ((reply.text = v), upd()), 5, { maxlength: '2000', placeholder: 'พิมพ์รายละเอียด…' })),
        field('รูปตัวการ์ตูนมุมการ์ด', picturePicker(reply, upd)),
        field(
          'ปุ่มลิงก์ (ไม่ใส่ก็ได้)',
          h(
            'div',
            { class: 'two' },
            textInput(reply.button?.label ?? '', (v) => ((reply.button = { label: v, url: reply.button?.url ?? '' }), upd()), { maxlength: '20', placeholder: 'ชื่อปุ่ม เช่น เปิดแผนที่' }),
            textInput(reply.button?.url ?? '', (v) => ((reply.button = { label: reply.button?.label ?? '', url: v }), upd()), { placeholder: 'https://…' })
          ),
          'ลิงก์ต้องขึ้นต้นด้วย https:// ถ้าไม่ใส่ลิงก์ ปุ่มจะไม่แสดง'
        )
      );
      break;
    case 'image':
      body.append(
        field('ลิงก์รูป (https)', textInput(reply.url, (v) => ((reply.url = v), upd()), { placeholder: 'https://…/รูป.png' }), 'ไฟล์ JPEG หรือ PNG ไม่เกิน 10 MB ในหน้านี้จะเห็นเป็นกรอบ รูปจริงจะแสดงใน LINE'),
        field('รูปตัวอย่างเล็ก (ไม่ใส่ก็ได้)', textInput(reply.previewUrl, (v) => ((reply.previewUrl = v), upd()), { placeholder: 'https://… ไม่เกิน 1 MB' }))
      );
      break;
    case 'sticker':
      body.append(
        field(
          'เลขสติกเกอร์',
          h(
            'div',
            { class: 'two' },
            textInput(reply.packageId, (v) => ((reply.packageId = v.trim()), upd()), { inputmode: 'numeric', placeholder: 'Package ID เช่น 446' }),
            textInput(reply.stickerId, (v) => ((reply.stickerId = v.trim()), upd()), { inputmode: 'numeric', placeholder: 'Sticker ID เช่น 1988' })
          ),
          'ดูเลขได้ที่ developers.line.biz → Messaging API → Sticker list (ใช้ได้เฉพาะชุดที่ LINE อนุญาตให้บอทส่ง)'
        )
      );
      break;
    case 'flex': {
      if (!flexRaw.has(reply)) flexRaw.set(reply, JSON.stringify(reply.contents ?? {}, null, 2));
      const msg = h('p', { class: 'f-hint' });
      const check = () => {
        try {
          const j = JSON.parse(flexRaw.get(reply));
          if (!j || !['bubble', 'carousel'].includes(j.type)) throw new Error('ต้องขึ้นต้นด้วย "type": "bubble" หรือ "carousel"');
          reply.contents = j;
          msg.textContent = 'JSON ถูกต้อง';
          msg.className = 'f-hint ok';
        } catch (e) {
          msg.textContent = 'ยังใช้ไม่ได้: ' + clip(e.message, 90);
          msg.className = 'f-hint bad';
        }
      };
      const area = textArea(flexRaw.get(reply), (v) => (flexRaw.set(reply, v), check(), upd()), 10, { class: 'input area mono', spellcheck: 'false' });
      area.classList.add('mono');
      check();
      body.append(
        field('ข้อความสำรอง (แสดงในแจ้งเตือน)', textInput(reply.altText, (v) => ((reply.altText = v), upd()), { maxlength: '400' })),
        field('JSON ของ Flex Message', area, 'สร้างและทดลองที่ LINE Flex Message Simulator แล้ววางเฉพาะส่วนที่ขึ้นต้นด้วย { "type": "bubble" …'),
        msg
      );
      break;
    }
    default:
      body.append(h('p', { class: 'note' }, 'กฎนี้ให้บอทเงียบ ไม่ส่งอะไรและไม่แจ้งเตือนใคร แอดมินเห็นแชทแล้วตอบเอง ใช้กับเรื่องที่อยากตอบเอง เช่น เลขบัญชี ใบเสร็จ'));
  }
  return h('section', { class: 'rblock' }, head, body);
}

function picturePicker(reply, upd) {
  const names = [['', 'ไม่ใช้'], ['staff', 'ร้าน'], ['admin', 'แอดมิน'], ['order', 'สั่งของ'], ['school', 'โรงเรียน'], ['ask', 'ถาม']];
  const box = h('div', { class: 'pics' });
  const draw = () => {
    box.replaceChildren(
      ...names.map(([v, label]) =>
        h(
          'button',
          {
            type: 'button',
            class: 'pic' + ((reply.image || '') === v ? ' on' : ''),
            title: label,
            onclick: () => {
              reply.image = v;
              upd();
              draw();
            },
          },
          v ? h('img', { src: `img/${v}.png`, alt: '', draggable: 'false' }) : h('span', { class: 'pic-none' }, '–'),
          h('small', {}, label)
        )
      )
    );
  };
  draw();
  return box;
}

function moveReply(rule, i, d) {
  const j = i + d;
  if (j < 0 || j >= rule.replies.length) return;
  [rule.replies[i], rule.replies[j]] = [rule.replies[j], rule.replies[i]];
  touch();
  renderCenter();
}

function removeReply(rule, i) {
  rule.replies.splice(i, 1);
  touch();
  renderCenter();
}

function addReply(rule, type) {
  if (type === 'silent') rule.replies = [newReply('silent')];
  else {
    if (rule.replies.some((r) => r.type === 'silent')) rule.replies = [];
    if (rule.replies.length >= Engine.MAX_REPLIES) return toast(`หนึ่งกฎส่งได้ไม่เกิน ${Engine.MAX_REPLIES} ข้อความค่ะ`, 'warn');
    rule.replies.push(newReply(type));
  }
  touch();
  renderCenter();
}

function renderEditor(root) {
  const rule = ruleById(S.sel);
  if (!rule) {
    root.append(
      h(
        'div',
        { class: 'empty-state' },
        icon('card', 34),
        h('h3', {}, 'เลือกกฎทางซ้าย หรือสร้างกฎใหม่'),
        h('p', {}, 'กฎ = “ลูกค้าพิมพ์คำนี้ → บอทตอบแบบนี้” บอทไล่ดูจากบนลงล่าง เจอกฎแรกที่ตรงก็ตอบเลย'),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => addRule('card') }, icon('plus', 16), 'เพิ่มกฎใหม่')
      )
    );
    return;
  }
  const i = S.content.rules.findIndex((r) => r.id === rule.id);
  const probs = problemsOf(rule);

  const head = h(
    'div',
    { class: 'ed-head' },
    h('div', {}, h('h2', {}, `กฎที่ ${i + 1}`), h('p', { class: 'sub' }, 'ลูกค้าพิมพ์คำที่ตั้งไว้ → บอทตอบตามนี้')),
    h(
      'div',
      { class: 'ed-act' },
      h('button', { type: 'button', class: 'btn btn-soft btn-sm', title: 'ลองพิมพ์คำแรกของกฎนี้ในโทรศัพท์จำลอง', onclick: () => (rule.keywords.length ? sendUser(rule.keywords[0]) : toast('ใส่คำที่ลูกค้าพิมพ์ก่อนค่ะ แล้วค่อยลอง', 'warn')) }, icon('play', 14), 'ลองกฎนี้'),
      h('button', { type: 'button', class: 'iconbtn', title: 'เลื่อนขึ้น (ตรวจก่อน)', disabled: i === 0, onclick: () => moveRule(rule.id, -1) }, icon('up', 16)),
      h('button', { type: 'button', class: 'iconbtn', title: 'เลื่อนลง (ตรวจทีหลัง)', disabled: i === S.content.rules.length - 1, onclick: () => moveRule(rule.id, 1) }, icon('down', 16)),
      h('button', { type: 'button', class: 'iconbtn', title: 'ทำสำเนา', onclick: () => duplicateRule(rule.id) }, icon('copy', 16)),
      h('button', { type: 'button', class: 'iconbtn danger', title: 'ลบกฎนี้', onclick: () => deleteRule(rule.id) }, icon('trash', 16))
    )
  );

  const name = field(
    'ชื่อกฎ (ไว้ดูเอง ลูกค้าไม่เห็น)',
    h('div', { class: 'name-row' }, textInput(rule.name, (v) => ((rule.name = v), touch()), { id: 'f-name', maxlength: '60' }), toggle(rule.enabled !== false, 'เปิดใช้', (v) => ((rule.enabled = v), touch(), renderCenter())))
  );

  const matchRow = field(
    'ลูกค้าพิมพ์แบบไหนบอทถึงจะตอบ',
    h(
      'div',
      { class: 'stack' },
      seg(
        [
          ['contains', 'มีคำเหล่านี้อยู่ในข้อความ', 'เช่น คำว่า เปิด อยู่ใน “ร้านเปิดกี่โมงคะ”'],
          ['exact', 'พิมพ์ตรงทั้งข้อความ', 'ต้องเป็นคำนั้นคำเดียว (คำว่า ค่ะ/ครับ ไม่นับ)'],
        ],
        rule.match === 'exact' ? 'exact' : 'contains',
        (v) => ((rule.match = v), touch(), renderCenter())
      ),
      chipsInput(rule.keywords, () => touch(), { placeholder: 'พิมพ์คำที่ลูกค้าอาจพิมพ์ แล้วกด Enter (เพิ่มได้หลายคำ)' })
    ),
    'ไม่ต้องกังวลเรื่องช่องว่าง ตัวพิมพ์เล็ก/ใหญ่ หรือคำลงท้าย ค่ะ คะ ครับ'
  );

  const replies = h('div', { class: 'replies' }, ...rule.replies.map((r, k) => replyBlock(rule, r, k)));
  if (!rule.replies.length) replies.append(h('p', { class: 'note warn' }, 'ยังไม่มีคำตอบ: เพิ่มจากปุ่มด้านล่าง หรือลากชนิดคำตอบจากด้านซ้ายมาวางตรงนี้'));
  replies.addEventListener('dragover', (e) => {
    if (Array.from(e.dataTransfer?.types || []).includes('text/x-new-reply')) {
      e.preventDefault();
      replies.classList.add('drop-here');
    }
  });
  replies.addEventListener('dragleave', () => replies.classList.remove('drop-here'));
  replies.addEventListener('drop', (e) => {
    const t = e.dataTransfer.getData('text/x-new-reply');
    replies.classList.remove('drop-here');
    if (t) {
      e.preventDefault();
      addReply(rule, t);
    }
  });

  const adders = h(
    'div',
    { class: 'adders' },
    h('span', {}, 'เพิ่มคำตอบ:'),
    ['text', 'card', 'image', 'sticker', 'flex', 'silent'].map((t) => h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => addReply(rule, t) }, icon(TYPE_INFO[t].icon, 14), TYPE_INFO[t].name))
  );

  const quick = toggle(rule.quick !== false, 'ให้มีปุ่มหัวข้อลัด (เวลาเปิดร้าน สั่งของ …) ใต้ข้อความสุดท้าย', (v) => ((rule.quick = v), touch()));

  root.append(head, name, matchRow, h('h3', { class: 'sec-title' }, 'คำตอบ ', h('small', {}, `${rule.replies.length}/${Engine.MAX_REPLIES} ข้อความ`)), replies, adders, h('div', { class: 'field' }, quick));
  if (probs.length) root.append(h('div', { class: 'problems' }, icon('warn', 16), h('div', {}, h('b', {}, 'ยังไม่ครบ บอทจะยังไม่ใช้กฎนี้:'), h('ul', {}, probs.map((p) => h('li', {}, p))))));
}
