// ---------------------------------------------------------------------------------------------------------------
// The frame: header, tabs, the three columns, phone navigation, saving, history, start-up.
// ---------------------------------------------------------------------------------------------------------------
const TABS = [
  ['editor', 'แก้ไขกฎ'],
  ['flow', 'ผังการตอบ'],
  ['texts', 'ข้อความทั่วไป'],
  ['schools', 'โรงเรียน'],
  ['bot', 'สถานะบอท'],
  ['json', 'Export / Import'],
];

const LOGO = () => {
  const s = icon('bot', 22);
  s.setAttribute('stroke-width', '2');
  return s;
};

function skeleton() {
  const app = $('#app');
  app.replaceChildren(
    h(
      'header',
      { class: 'top' },
      h('div', { class: 'brand' }, h('span', { class: 'logo' }, LOGO()), h('div', { class: 'brand-t' }, h('b', {}, 'Reply Studio'), h('small', {}, 'ร้านนัฐภรณ์ · แก้คำตอบบอท LINE')), h('span', { id: 'conn-pill', class: 'pill' }), h('button', { type: 'button', id: 'conn-retry', class: 'btn btn-ghost btn-sm', hidden: true, onclick: reloadAll }, 'ลองเชื่อมใหม่')),
      h('nav', { id: 'tabs', class: 'tabs', 'aria-label': 'หน้า' }),
      h('div', { id: 'actions', class: 'actions' })
    ),
    h(
      'main',
      { class: 'grid' },
      h(
        'aside',
        { class: 'col col-rules' },
        h('section', { class: 'pal-sec' }, h('h3', { class: 'col-title' }, '1. สร้างคำตอบ ', h('small', {}, '(ลากมาวาง)')), h('div', { id: 'palette', class: 'palette' })),
        h(
          'section',
          { class: 'list-sec' },
          h('h3', { class: 'col-title' }, '2. คำถาม–คำตอบ ', h('small', {}, h('span', { id: 'rules-count' }), ' กฎ')),
          h(
            'div',
            { class: 'list-tools' },
            h('div', { class: 'searchbox' }, icon('search', 15), h('input', { id: 'rule-q', type: 'search', placeholder: 'ค้นหาคำหรือชื่อกฎ…', autocomplete: 'off' })),
            h('button', { type: 'button', id: 'add-rule', class: 'btn btn-soft' }, icon('plus', 15), 'เพิ่มกฎใหม่')
          ),
          h('ul', { id: 'rules', class: 'rules' }),
          h('p', { class: 'col-foot' }, 'ลากสลับลำดับได้ กฎบนสุดถูกตรวจก่อน เจอกฎที่ตรงก็ตอบเลย')
        )
      ),
      h('section', { class: 'col col-center' }, h('div', { id: 'center' })),
      h('aside', { class: 'col col-sim' }, h('div', { id: 'sim' }))
    ),
    h('nav', { id: 'bottomnav', class: 'bottomnav', 'aria-label': 'ส่วนของหน้า' }),
    h('div', { id: 'modal-root' })
  );
  $('#rule-q').addEventListener('input', (e) => {
    S.q = e.target.value;
    renderRules();
  });
  $('#add-rule').addEventListener('click', () => addRule('text'));
  wireRulesDnD();
}

function renderTabs() {
  const nav = $('#tabs');
  if (!nav) return;
  nav.replaceChildren(
    ...TABS.map(([v, label]) =>
      h(
        'button',
        {
          type: 'button',
          class: 'tab' + (S.view === v ? ' on' : ''),
          onclick: () => {
            S.view = v;
            S.pane = 'center';
            renderTabs();
            renderCenter();
            renderPane();
          },
        },
        label
      )
    )
  );
}

function updateHeader() {
  const pill = $('#conn-pill');
  if (pill) {
    const [cls, text] = { ready: ['ok', 'เชื่อมฐานข้อมูลแล้ว'], connecting: ['info', 'กำลังเชื่อม…'], offline: ['warn', 'โหมดดูตัวอย่าง'], error: ['bad', 'เชื่อมไม่สำเร็จ'] }[S.conn] || ['info', ''];
    pill.className = 'pill ' + cls;
    pill.textContent = text;
  }
  const retry = $('#conn-retry');
  if (retry) retry.hidden = S.busy || (S.conn !== 'error' && S.conn !== 'offline');
  const box = $('#actions');
  if (!box) return;
  const d = dirty();
  const canSave = d && S.conn === 'ready' && !S.busy;
  box.replaceChildren();
  if (d) box.append(h('span', { class: 'dirty' }, h('i'), 'ยังไม่ได้บันทึก'));
  if (d) box.append(h('button', { type: 'button', class: 'btn btn-ghost btn-sm', disabled: S.busy, onclick: discardChanges, title: 'ทิ้งสิ่งที่แก้ กลับไปใช้ที่บันทึกไว้' }, 'ยกเลิกที่แก้'));
  box.append(h('button', { type: 'button', class: 'btn btn-ghost btn-sm', disabled: S.conn !== 'ready', onclick: openHistory, title: 'เวอร์ชันที่เคยบันทึก' }, icon('history', 15), h('span', { class: 'lbl' }, 'ประวัติ')));
  if (S.saveConfirm && canSave) {
    box.append(
      h('span', { class: 'savecfm' }, 'บอทจะใช้คำตอบนี้ทันที'),
      h('button', { type: 'button', class: 'btn btn-primary', onclick: doSave }, icon('check', 16), 'ยืนยันบันทึก'),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => ((S.saveConfirm = false), updateHeader()) }, 'ยกเลิก')
    );
  } else {
    box.append(
      h(
        'button',
        {
          type: 'button',
          id: 'save-btn',
          class: 'btn btn-primary',
          disabled: !canSave,
          title: S.conn !== 'ready' ? 'ต้องเชื่อมฐานข้อมูลร้านก่อนถึงจะบันทึกได้' : d ? '' : 'ยังไม่มีอะไรเปลี่ยน',
          onclick: askSave,
        },
        icon('save', 16),
        'บันทึกการตั้งค่า'
      )
    );
  }
}

function askSave() {
  if (!dirty() || S.conn !== 'ready') return;
  const bad = (S.content.rules || []).filter((r) => problemsOf(r).length);
  if (bad.length) toast(`มี ${bad.length} กฎที่ยังไม่ครบ บอทจะข้ามกฎเหล่านั้น`, 'warn');
  S.saveConfirm = true;
  updateHeader();
  clearTimeout(askSave.t);
  askSave.t = setTimeout(() => {
    S.saveConfirm = false;
    updateHeader();
  }, 8000);
}

async function doSave() {
  S.busy = true;
  S.saveConfirm = false;
  updateHeader();
  try {
    await saveAll('จากหน้า Reply Studio');
    toast('บันทึกแล้ว บอทใช้คำตอบใหม่ทันที');
  } catch (e) {
    toast(explain(e), 'bad');
  }
  S.busy = false;
  renderAll();
}

function discardChanges() {
  S.content = contentFrom(S.row, S.bot);
  if (!ruleById(S.sel)) S.sel = S.content.rules[0]?.id ?? null;
  renderAll();
  toast('กลับไปใช้ที่บันทึกไว้แล้ว', 'info');
}

async function reloadAll() {
  S.busy = true;
  renderAll();
  await connect();
  S.busy = false;
  renderAll();
}

function renderCenter() {
  const root = $('#center');
  if (!root) return;
  const hadFocus = document.activeElement?.id === 'test-input';
  const typed = $('#test-input')?.value ?? S.testText ?? '';
  S.testText = typed;
  root.replaceChildren();
  const withTest = S.view === 'editor' || S.view === 'flow';
  if (withTest) {
    const bar = testBar();
    $('input', bar).value = typed;
    $('input', bar).addEventListener('input', (e) => (S.testText = e.target.value));
    root.append(bar);
  }
  const body = h('div', { class: 'center-body view-' + S.view });
  root.append(body);
  if (!S.content) {
    body.append(h('div', { class: 'empty-state' }, h('p', {}, 'กำลังเชื่อมต่อฐานข้อมูลร้าน…')));
    return;
  }
  switch (S.view) {
    case 'flow':
      renderFlow(body);
      break;
    case 'texts':
      renderTexts(body);
      break;
    case 'schools':
      renderSchools(body);
      break;
    case 'bot':
      renderBotView(body);
      break;
    case 'json':
      renderJson(body);
      break;
    default:
      renderEditor(body);
  }
  if (withTest) renderTestLine();
  if (hadFocus) $('#test-input')?.focus();
}

function renderPane() {
  const app = $('#app');
  if (app) app.dataset.pane = S.pane;
  const nav = $('#bottomnav');
  if (nav) {
    nav.replaceChildren(
      ...[
        ['rules', 'กฎ', 'card'],
        ['center', 'แก้ไข', 'text'],
        ['sim', 'ตัวอย่าง', 'bot'],
      ].map(([v, label, ic]) => h('button', { type: 'button', class: S.pane === v ? 'on' : '', onclick: () => ((S.pane = v), renderPane()) }, icon(ic, 18), h('span', {}, label)))
    );
  }
}

// ---- history ----------------------------------------------------------------------------------------------------------

function openHistory() {
  S.modal = 'history';
  renderModal();
}

function renderModal() {
  const root = $('#modal-root');
  if (!root) return;
  root.replaceChildren();
  if (S.modal !== 'history') return;
  const close = () => {
    S.modal = null;
    renderModal();
  };
  const items = S.history.length
    ? S.history.map((hv) =>
        h(
          'li',
          {},
          h('div', {}, h('b', {}, thaiTime(hv.saved_at)), h('small', {}, hv.note || '')),
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn-ghost btn-sm',
              disabled: S.busy || dirty(),
              title: dirty() ? 'บันทึกหรือยกเลิกสิ่งที่แก้อยู่ก่อน' : '',
              onclick: async () => {
                S.busy = true;
                renderModal();
                try {
                  await restoreVersion(hv.id);
                  toast('ย้อนกลับแล้ว บอทใช้เวอร์ชันนี้ทันที');
                  S.modal = null;
                } catch (e) {
                  toast(explain(e), 'bad');
                }
                S.busy = false;
                renderAll();
                renderModal();
              },
            },
            'ใช้เวอร์ชันนี้'
          )
        )
      )
    : [h('li', { class: 'empty' }, 'ยังไม่มีประวัติ เวอร์ชันเก่าจะถูกเก็บไว้ทุกครั้งที่กดบันทึก')];
  root.append(
    h(
      'div',
      { class: 'modal-back', onclick: (e) => e.target === e.currentTarget && close() },
      h(
        'div',
        { class: 'modal', role: 'dialog', 'aria-label': 'ประวัติการบันทึก' },
        h('div', { class: 'modal-head' }, h('h3', {}, 'ประวัติการบันทึก'), h('button', { type: 'button', class: 'iconbtn', onclick: close, title: 'ปิด' }, icon('x', 16))),
        h('p', { class: 'f-hint' }, 'ทุกครั้งที่บันทึก ระบบเก็บ “ก่อนบันทึก” ไว้ให้ กดใช้เวอร์ชันนี้เพื่อย้อนกลับ (20 ครั้งล่าสุด)'),
        h('ul', { class: 'hist' }, items)
      )
    )
  );
}

// ---- start --------------------------------------------------------------------------------------------------------------

function renderAll() {
  updateHeader();
  renderTabs();
  renderPalette();
  renderRules();
  renderCenter();
  renderSim();
  renderPane();
  renderModal();
}

function wireKeys() {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      askSave();
    } else if (e.key === 'Escape' && S.modal) {
      S.modal = null;
      renderModal();
    }
  });
}

async function startStudio() {
  skeleton();
  wireKeys();
  updateHeader();
  renderTabs();
  renderPalette();
  renderPane();
  renderCenter();
  await connect();
  renderAll();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startStudio);
else startStudio();
