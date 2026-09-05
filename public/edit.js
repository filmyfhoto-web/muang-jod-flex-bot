import { api, escapeHtml, initApp, setBusy, showError, toast } from './common.js';

const state = document.querySelector('#state');
const form = document.querySelector('#edit-form');
const token = new URLSearchParams(location.search).get('t');
let current = null;

function toLocalInput(iso) {
  const date = new Date(iso);
  const bangkok = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  bangkok.setMinutes(bangkok.getMinutes() - bangkok.getTimezoneOffset());
  return bangkok.toISOString().slice(0, 16);
}

async function load() {
  if (!token) throw new Error('ไม่พบรหัสรายการ กรุณาเปิดจากปุ่มแก้ไขบนการ์ด');
  const { item } = await api(`/api/transactions/token/${encodeURIComponent(token)}`);
  current = item;
  document.querySelector('#description').value = item.description;
  document.querySelector(`input[name="type"][value="${item.type}"]`).checked = true;
  document.querySelector('#category').value = item.category;
  document.querySelector('#amount').value = item.amount;
  document.querySelector('#payment').value = item.paymentMethod || '';
  document.querySelector('#occurred-at').value = toLocalInput(item.occurredAt);
  form.hidden = false;
  state.innerHTML = '';
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = document.querySelector('#save');
  setBusy(button, true, 'กำลังบันทึก…');
  try {
    await api(`/api/transactions/${encodeURIComponent(current.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        description: document.querySelector('#description').value,
        type: form.elements.type.value,
        category: document.querySelector('#category').value,
        amount: document.querySelector('#amount').value,
        paymentMethod: document.querySelector('#payment').value,
        occurredAt: new Date(document.querySelector('#occurred-at').value).toISOString()
      })
    });
    toast('บันทึกการแก้ไขแล้ว');
    setTimeout(() => { location.href = '/transactions'; }, 700);
  } catch (error) { showError(state, error); setBusy(button, false); }
});

document.querySelector('#delete').addEventListener('click', async () => {
  if (!current || !confirm(`ยืนยันยกเลิก “${current.description}” ?`)) return;
  try {
    await api(`/api/transactions/${encodeURIComponent(current.id)}`, { method: 'DELETE' });
    toast('ยกเลิกรายการแล้ว');
    setTimeout(() => { location.href = '/transactions'; }, 700);
  } catch (error) { showError(state, error); }
});

state.innerHTML = '<div class="panel">กำลังโหลดรายการ…</div>';
initApp().then(load).catch((error) => showError(state, error));
