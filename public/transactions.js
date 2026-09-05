import { api, escapeHtml, initApp, money, showError, thaiDate } from './common.js';

const root = document.querySelector('#list');

async function load() {
  try {
    const { items } = await api('/api/transactions?limit=100');
    if (!items.length) { root.innerHTML = '<div class="panel empty">ยังไม่มีรายการ</div>'; return; }
    root.innerHTML = items.map((item) => `<a class="tx-row" href="/edit?t=${encodeURIComponent(item.editToken)}"><span class="name">${escapeHtml(item.description)}</span><span class="amount ${item.type}">${item.type === 'income' ? '+' : '-'}฿${money(item.amount)}</span><span class="small">${escapeHtml(item.category)} · ${thaiDate(item.occurredAt)}</span></a>`).join('');
  } catch (error) { showError(root, error); }
}

initApp().then(load).catch((error) => showError(root, error));
