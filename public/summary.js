import { api, escapeHtml, initApp, money, showError } from './common.js';

const root = document.querySelector('#summary');
let period = 'today';

function render(summary) {
  const max = Math.max(1, ...summary.categories.map((item) => item.income + item.expense));
  const categories = summary.categories.length ? summary.categories.map((item) => {
    const total = item.income + item.expense;
    return `<div class="category-row"><div class="category-line"><span>${escapeHtml(item.category)} <small>(${item.count})</small></span><strong>฿${money(total)}</strong></div><div class="bar"><i style="width:${Math.max(4, total / max * 100)}%"></i></div></div>`;
  }).join('') : '<div class="empty">ยังไม่มีรายการในช่วงนี้</div>';
  root.innerHTML = `<section class="panel summary-hero"><small>${escapeHtml(summary.label)}</small><strong>฿${money(summary.balance)}</strong><small>คงเหลือ</small></section><div class="summary-grid"><div class="stat income"><small>รายรับ</small><strong>฿${money(summary.income)}</strong></div><div class="stat expense"><small>รายจ่าย</small><strong>฿${money(summary.expense)}</strong></div></div><section class="panel" style="margin-top:14px"><strong>สรุปตามหมวด</strong>${categories}</section>`;
}

async function load() {
  root.innerHTML = '<div class="panel">กำลังคำนวณ…</div>';
  try { render((await api(`/api/summary?period=${period}`)).summary); }
  catch (error) { showError(root, error); }
}

document.querySelectorAll('[data-period]').forEach((button) => button.addEventListener('click', () => {
  period = button.dataset.period;
  document.querySelectorAll('[data-period]').forEach((item) => item.classList.toggle('active', item === button));
  load();
}));

initApp().then(load).catch((error) => showError(root, error));
