import { api, escapeHtml, initApp, money, showError } from './common.js';

const root = document.querySelector('#categories');

async function load() {
  try {
    const { summary } = await api('/api/summary?period=month');
    if (!summary.categories.length) { root.innerHTML = '<div class="panel empty">ยังไม่มีหมวดที่ใช้งาน</div>'; return; }
    root.innerHTML = `<section class="panel"><strong>ยอดเดือนนี้</strong>${summary.categories.map((item) => `<div class="category-row"><div class="category-line"><span>${escapeHtml(item.category)}</span><strong>฿${money(item.income + item.expense)}</strong></div><div class="meta">${item.income ? `รายรับ ฿${money(item.income)}` : ''}${item.income && item.expense ? ' · ' : ''}${item.expense ? `รายจ่าย ฿${money(item.expense)}` : ''}</div></div>`).join('')}</section><div class="notice">การตั้งวงเงินรายหมวดจะเพิ่มในรอบถัดไป หลังยืนยันรูปแบบการ์ดนี้</div>`;
  } catch (error) { showError(root, error); }
}

initApp().then(load).catch((error) => showError(root, error));
