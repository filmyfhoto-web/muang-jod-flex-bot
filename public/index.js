import { api, escapeHtml, initApp, money, setBusy, thaiDate, toast } from './common.js';

const chat = document.querySelector('#chat');
const form = document.querySelector('#composer');
const input = document.querySelector('#message');
const sendButton = document.querySelector('#send');

function scrollChat() { chat.scrollTop = chat.scrollHeight; }

function addMine(text) {
  chat.insertAdjacentHTML('beforeend', `<div class="message-row me"><div class="bubble-text">${escapeHtml(text)}</div></div>`);
  scrollChat();
}

function cardShell(content) {
  const row = document.createElement('div');
  row.className = 'message-row';
  row.innerHTML = `<img class="avatar" src="/assets/mamung-card.png" alt=""><div>${content}</div>`;
  chat.append(row);
  scrollChat();
  return row;
}

function renderConfirm(batch) {
  const rows = batch.entries.map((item, index) => `
    <div class="line-item"><span>${index + 1}. ${escapeHtml(item.description)}</span><strong class="${item.type || 'expense'}">฿${money(item.amount)}</strong></div>
    <div class="meta">${item.type === 'income' ? 'รายรับ' : item.type === 'expense' ? 'รายจ่าย' : 'ยังไม่ระบุ'} · ${escapeHtml(item.category)}</div>
  `).join('');
  const total = batch.entries.reduce((sum, item) => sum + Number(item.amount), 0);
  const row = cardShell(`<article class="confirm-card"><div class="card-head"><div><h3>ตรวจสอบก่อนบันทึก</h3><p>กดยืนยันแล้วจึงจะบันทึกข้อมูล</p></div><img class="card-mascot" src="/assets/mamung-card.png" alt=""></div><div class="card-body">${rows}<hr class="divider"><div class="line-item"><strong>รวม</strong><strong>฿${money(total)}</strong></div></div><div class="card-actions"><button class="btn ghost" data-cancel>ยกเลิก</button><button class="btn primary" data-confirm>ยืนยันบันทึก</button></div></article>`);
  row.querySelector('[data-cancel]').addEventListener('click', async (event) => {
    setBusy(event.currentTarget, true);
    try { await api('/api/demo/cancel', { method: 'POST', body: JSON.stringify({ batchId: batch.id }) }); row.remove(); toast('ยกเลิกแล้ว ยังไม่ได้บันทึก'); }
    catch (error) { toast(error.message); setBusy(event.currentTarget, false); }
  });
  row.querySelector('[data-confirm]').addEventListener('click', async (event) => {
    setBusy(event.currentTarget, true, 'กำลังบันทึก…');
    try {
      const result = await api('/api/demo/confirm', { method: 'POST', body: JSON.stringify({ batchId: batch.id }) });
      row.remove();
      if (result.transactions.length === 1) renderTransaction(result.transactions[0]);
      else renderSavedBatch(result.transactions);
    } catch (error) { toast(error.message); setBusy(event.currentTarget, false); }
  });
}

function renderSavedBatch(items) {
  const total = items.reduce((sum, item) => sum + Number(item.amount), 0);
  const rows = items.map((item, index) => `<div class="line-item"><span>${index + 1}. ${escapeHtml(item.description)}</span><strong class="${item.type}">฿${money(item.amount)}</strong></div>`).join('<hr class="divider">');
  cardShell(`<article class="transaction-card"><div class="card-head"><div><h3>บันทึกให้ ${items.length} รายการแล้ว ✅</h3><p>ตรวจสอบหรือแก้ไขได้จากหน้ารายการ</p></div><img class="card-mascot" src="/assets/mamung-card.png" alt=""></div><div class="card-body">${rows}<hr class="divider"><div class="line-item"><strong>รวม</strong><strong>฿${money(total)}</strong></div></div><div class="card-actions" style="grid-template-columns:1fr"><a class="btn primary" href="/transactions">ดูรายการล่าสุด</a></div></article>`);
}

function renderTransaction(item) {
  const typeLabel = item.type === 'income' ? 'รายรับ' : 'รายจ่าย';
  const row = cardShell(`<article class="transaction-card"><div class="card-head"><div><h3>จดสำเร็จ ✅</h3><p>อย่าลืมตรวจสอบรายการที่จดด้วยนะคะ</p></div><img class="card-mascot" src="/assets/mamung-card.png" alt=""></div><div class="card-body"><span class="tag ${item.type}">${typeLabel}</span> <strong>– ${escapeHtml(item.category)}</strong><div class="meta">${thaiDate(item.occurredAt)}</div><div class="line-item"><span>${escapeHtml(item.description)}</span><strong class="${item.type}">฿${money(item.amount)}</strong></div><hr class="divider"><div class="month-row"><span>เดือนนี้ · ${escapeHtml(item.category)}</span><strong>฿${money(item.amount)}</strong></div>${item.paymentMethod ? `<div class="meta">ชำระ: ${escapeHtml(item.paymentMethod)}</div>` : ''}</div><div class="card-actions"><a class="btn secondary" href="/edit?t=${encodeURIComponent(item.editToken)}">✏️ แก้ไข</a><button class="btn ghost" data-delete>✕ ยกเลิก</button></div></article>`);
  row.querySelector('[data-delete]').addEventListener('click', async () => {
    if (!confirm(`ยืนยันยกเลิก “${item.description}” ?`)) return;
    try { await api(`/api/transactions/${encodeURIComponent(item.id)}`, { method: 'DELETE' }); row.remove(); toast('ยกเลิกรายการแล้ว'); }
    catch (error) { toast(error.message); }
  });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message) return;
  addMine(message);
  setBusy(sendButton, true, 'กำลังอ่าน…');
  try {
    const result = await api('/api/demo/preview', { method: 'POST', body: JSON.stringify({ text: message }) });
    renderConfirm(result.batch);
  } catch (error) {
    cardShell(`<div class="bubble-text">${escapeHtml(error.message)}<br><br>ลองพิมพ์ “รายจ่าย กาแฟ 50”</div>`);
  } finally { setBusy(sendButton, false); }
});

document.querySelector('[data-action="focus"]').addEventListener('click', () => { input.focus(); input.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
document.querySelector('[data-action="cancel-latest"]').addEventListener('click', () => { window.location.href = '/transactions'; });
document.querySelector('[data-action="help"]').addEventListener('click', () => { cardShell('<div class="bubble-text">พิมพ์รายการกับจำนวนเงินได้เลยค่ะ ระบบจะถามยืนยันก่อนบันทึกทุกครั้ง</div>'); });

initApp().catch((error) => cardShell(`<div class="error-box">${escapeHtml(error.message)}</div>`));
