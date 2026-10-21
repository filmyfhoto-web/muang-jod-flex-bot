// ---------------------------------------------------------------------------------------------------------------
// The phone: a customer typing, and what the bot would answer (the bot's own code decides, not the page).
// ---------------------------------------------------------------------------------------------------------------

// What the bot would do with one message. pure = look only, change nothing (used to refresh an earlier turn after an edit).
function simulate(text, { pure = false } = {}) {
  const shop = currentShop();
  const r = Engine.buildReply(text, shop, { awaitingSchool: S.awaiting });
  if (!pure) S.awaiting = Boolean(r.awaitingSchool);
  let messages = r.messages;
  let note = '';
  if (r.needsPhotos) {
    messages = shop.contact.people.length ? [Engine.contactCard(shop, r.askText ?? shop.contact.ask, {})] : [];
  } else if (r.greeting && !shop.engineGreeting && !r.menuRequest) {
    messages = [];
    note = 'แค่ทักทาย: บอทนี้ไม่ตอบ (การ์ดเมนูของระบบร้านทักให้อยู่แล้ว)';
  } else if (r.silent) {
    note = r.matched ? 'กฎนี้ตั้งไว้ "ไม่ตอบ": แอดมินตอบเอง' : 'บอทไม่รู้จักเรื่องนี้: ไม่ตอบ แอดมินเห็นแชทแล้วตอบเอง';
  }
  const holiday = !pure && !S.holidayShown && !/ขอบคุณ/.test(text) ? Engine.holidayNotice(shop, new Date()) : null;
  if (holiday && messages.length) {
    messages = [holiday.message, ...messages].slice(0, 5);
    S.holidayShown = true;
  }
  const out = Engine.withSender(messages, '', r.quick === false ? undefined : Engine.quick(shop));
  return { stage: r.stage || 'fallback', matched: r.matched ?? null, which: r.which ?? null, msgs: out, note, silent: Boolean(r.silent) || !out.length };
}

function sendUser(text) {
  const t = String(text ?? '').trim();
  if (!t) return;
  const turn = { id: uid(), text: t, ...simulate(t) };
  S.chat.push(turn);
  if (S.chat.length > 40) S.chat.shift();
  S.lastRun = { text: t, stage: turn.stage, matched: turn.matched, which: turn.which };
  renderSim();
  if (S.view === 'flow') renderCenter();
  else renderTestLine();
}

// after an edit: the earlier answers that came from the rule being edited are redrawn with the new wording
const refreshTurns = debounce(() => {
  let changed = false;
  for (const t of S.chat) {
    if (t.matched && t.matched === S.sel) {
      Object.assign(t, simulate(t.text, { pure: true }));
      changed = true;
    }
  }
  if (changed) renderSim();
}, 250);

function resetChat() {
  S.chat = [];
  S.awaiting = false;
  S.lastRun = null;
  S.holidayShown = false;
  renderSim();
  renderTestLine();
  if (S.view === 'flow') renderCenter();
}

// ---- drawing --------------------------------------------------------------------------------------------------

const botName = () => {
  try {
    return currentShop().name || 'ร้านนัฐภรณ์';
  } catch {
    return 'ร้านนัฐภรณ์';
  }
};

function onFlexAction(a) {
  if (a.type === 'message') sendUser(a.text ?? a.label);
  else if (a.type === 'uri') toast('ปุ่มนี้เปิดลิงก์: ' + clip(a.uri, 70), 'info');
}

function mediaBox(kind, label, sub) {
  return h('div', { class: 'media-ph media-' + kind }, icon(kind === 'sticker' ? 'sticker' : 'image', 26), h('b', {}, label), sub ? h('small', {}, sub) : null);
}

function botMessage(m) {
  switch (m.type) {
    case 'text':
      return h('div', { class: 'bubble bot' }, m.text);
    case 'flex':
      return h('div', { class: 'flexwrap' }, renderFlex(m, { onAction: onFlexAction }));
    case 'image':
      return mediaBox('image', 'รูปภาพ', clip(m.originalContentUrl || '', 46));
    case 'sticker':
      return mediaBox('sticker', 'สติกเกอร์', `${m.packageId} / ${m.stickerId}`);
    default:
      return h('div', { class: 'bubble bot' }, `(${m.type})`);
  }
}

function renderChat(box) {
  box.replaceChildren();
  if (!S.chat.length) {
    box.append(h('div', { class: 'chat-empty' }, icon('bot', 30), h('p', {}, 'พิมพ์ข้อความของลูกค้าด้านล่าง หรือกดตัวอย่างด้านบน แล้วดูว่าบอทตอบอะไร')));
    return;
  }
  S.chat.forEach((t, i) => {
    box.append(h('div', { class: 'row user' }, h('div', { class: 'bubble me' }, t.text)));
    const botRow = h('div', { class: 'row bot' }, h('div', { class: 'avatar' }, icon('bot', 18)));
    const col = h('div', { class: 'bot-col' });
    if (!t.msgs.length) col.append(h('div', { class: 'silent-note' }, icon('silent', 14), t.note || 'ไม่ตอบ'));
    for (const m of t.msgs) col.append(botMessage(m));
    const last = t.msgs[t.msgs.length - 1];
    if (i === S.chat.length - 1 && last?.quickReply?.items?.length) {
      col.append(
        h(
          'div',
          { class: 'quick' },
          last.quickReply.items.map((it) =>
            h(
              'button',
              {
                type: 'button',
                class: 'qchip',
                onclick: () => (it.action?.type === 'message' ? sendUser(it.action.text ?? it.action.label) : toast('ปุ่มนี้เปิดลิงก์: ' + clip(it.action?.uri || '', 70), 'info')),
              },
              it.action?.label || ''
            )
          )
        )
      );
    }
    if (t.msgs.length && t.note) col.append(h('div', { class: 'silent-note small' }, t.note));
    botRow.append(col);
    box.append(botRow);
  });
  // stay at the newest message, also after the card pictures have loaded and made the chat taller
  const toBottom = () => (box.scrollTop = box.scrollHeight);
  toBottom();
  requestAnimationFrame(toBottom);
  box.querySelectorAll('img').forEach((img) => {
    if (!img.complete) img.addEventListener('load', toBottom, { once: true });
  });
}

function payloadOf(turn) {
  return JSON.stringify({ replyToken: '<replyToken>', messages: turn.msgs }, null, 2);
}

function renderSim() {
  const root = $('#sim');
  if (!root) return;
  root.replaceChildren();
  const shop = (() => {
    try {
      return currentShop();
    } catch {
      return { name: 'ร้านนัฐภรณ์' };
    }
  })();

  const head = h(
    'div',
    { class: 'sim-head' },
    h('span', { class: 'sim-title' }, h('i', { class: 'live-dot' }), 'LINE Live Simulator'),
    h(
      'div',
      { class: 'seg seg-sm' },
      h('button', { type: 'button', class: S.simTab === 'chat' ? 'on' : '', onclick: () => ((S.simTab = 'chat'), renderSim()) }, 'หน้าจอแชท'),
      h('button', { type: 'button', class: S.simTab === 'json' ? 'on' : '', onclick: () => ((S.simTab = 'json'), renderSim()) }, '{ } JSON')
    )
  );
  root.append(head);

  const samples = sampleMessages();
  root.append(
    h(
      'div',
      { class: 'try' },
      h('span', {}, 'ลองพิมพ์:'),
      samples.map((s) => h('button', { type: 'button', class: 'chip', onclick: () => sendUser(s) }, s))
    )
  );

  if (S.simTab === 'json') {
    const last = [...S.chat].reverse().find((t) => t.msgs.length);
    const text = last ? payloadOf(last) : '// ยังไม่มีคำตอบ ลองพิมพ์ข้อความทางซ้ายก่อน';
    root.append(
      h(
        'div',
        { class: 'json-pane' },
        h('div', { class: 'json-bar' }, h('span', {}, last ? `คำตอบของ “${clip(last.text, 24)}”` : 'JSON Payload'), last ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => copyText(text) }, icon('copy', 14), 'คัดลอก') : null),
        h('pre', { class: 'code' }, text)
      )
    );
    return;
  }

  const phone = h('div', { class: 'phone' });
  phone.append(
    h(
      'div',
      { class: 'phone-bar' },
      h('span', { class: 'phone-back' }, '‹'),
      h('div', { class: 'phone-name' }, h('b', {}, shop.name || 'ร้านนัฐภรณ์'), h('small', {}, 'Official Account')),
      h('button', { type: 'button', class: 'iconbtn light', title: 'เริ่มแชทใหม่', onclick: resetChat }, icon('refresh', 16))
    )
  );
  const chat = h('div', { class: 'chat', id: 'chat' });
  renderChat(chat);
  phone.append(chat);
  const input = h('input', { class: 'chat-input', id: 'chat-input', type: 'text', placeholder: 'พิมพ์ข้อความทดสอบบอท…', autocomplete: 'off' });
  const go = () => {
    const v = input.value;
    input.value = '';
    sendUser(v);
    input.focus();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      go();
    }
  });
  phone.append(h('div', { class: 'phone-input' }, input, h('button', { type: 'button', class: 'send', title: 'ส่ง', onclick: go }, icon('send', 18))));
  root.append(phone);
}

// a few messages worth trying: the usual questions, then the first keyword of the owner's own rules
function sampleMessages() {
  const base = ['เวลาเปิดร้าน', 'สั่งของ', 'อุปกรณ์การเรียน 2-69', 'ที่ตั้งร้าน', 'ขอบคุณค่ะ', 'คุยกับแอดมิน', 'สั่งทำป้ายไวนิล', 'เมนู'];
  const seen = new Set(base);
  const extra = [];
  for (const r of S.content?.rules || []) {
    const k = r.keywords?.[0];
    if (r.enabled !== false && k && !seen.has(k)) {
      seen.add(k);
      extra.push(k);
    }
    if (extra.length >= 5) break;
  }
  return [...base, ...extra];
}

function copyText(text) {
  const done = () => toast('คัดลอกแล้ว');
  const fallback = () => {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    try {
      document.execCommand('copy');
      done();
    } catch {
      toast('คัดลอกไม่ได้ เลือกข้อความแล้วกด Ctrl+C ค่ะ', 'warn');
    }
    ta.remove();
  };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, fallback);
  else fallback();
}
