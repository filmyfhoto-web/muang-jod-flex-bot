let runtime = null;
let idToken = null;

export async function initApp() {
  runtime = await fetch('/api/runtime-config').then((response) => response.json());
  if (!runtime.demoMode) {
    if (!window.liff) throw new Error('โหลด LINE LIFF SDK ไม่สำเร็จ');
    await window.liff.init({ liffId: runtime.liffId });
    if (!window.liff.isLoggedIn()) {
      window.liff.login({ redirectUri: window.location.href });
      return new Promise(() => {});
    }
    idToken = window.liff.getIDToken();
    if (!idToken) throw new Error('ไม่พบ LINE ID token');
  }
  document.querySelectorAll('[data-test-badge]').forEach((el) => {
    el.textContent = runtime.demoMode ? 'TEST MODE' : 'LIVE';
    if (!runtime.demoMode) el.style.display = 'none';
  });
  return runtime;
}

export async function api(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (runtime?.demoMode) headers.set('x-test-user-id', runtime.testUserId || 'TEST-U001');
  else if (idToken) headers.set('authorization', `Bearer ${idToken}`);
  if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.issues?.join(' · ') || 'เกิดข้อผิดพลาด');
  return data;
}

export function money(value) {
  return new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 }).format(Number(value || 0));
}

export function thaiDate(value) {
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit'
  }).format(new Date(value));
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);
}

export function toast(message) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.append(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 2200);
}

export function showError(container, error) {
  container.innerHTML = `<div class="error-box">${escapeHtml(error.message || error)}</div>`;
}

export function setBusy(button, busy, label = 'กำลังทำงาน…') {
  if (!button) return;
  if (busy) {
    button.dataset.oldLabel = button.textContent;
    button.textContent = label;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.oldLabel || button.textContent;
    button.disabled = false;
  }
}
