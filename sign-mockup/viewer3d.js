/* หน้าดูป้าย 3 มิติที่ร้านส่งลิงก์ให้ลูกค้า (/sign/v/<id>) — โหลดไฟล์ .glb ของป้ายจากเซิร์ฟเวอร์ (ตัวดูอยู่ใน viewer3d-core.js) */
import { mountViewer } from './viewer3d-core.js';

const data = JSON.parse(document.getElementById('data').textContent);
mountViewer({ url: `/sign/v/${data.id}/model.glb`, name: 'sign-3d-' + data.id });

/* คนเปิดดู: แจ้งเซิร์ฟเวอร์ว่ามาจากไหน (Facebook/LINE/อื่น ๆ) ใช้มือถือหรือคอม — ไม่เก็บว่าใคร
 * เครื่องของร้านที่สร้างลิงก์นี้เอง (เปิดเช็กงาน) ไม่นับ */
function store(k, v) {
  try {
    if (v === undefined) return localStorage.getItem(k);
    localStorage.setItem(k, v);
  } catch (e) {}
  return null;
}
const ua = navigator.userAgent || '';
const src = /[?&]fbclid=/.test(location.search) || /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Messenger/i.test(ua) || /facebook\.com|instagram\.com/.test(document.referrer) ? 'facebook' : /\bLine\//.test(ua) || /line\.me/.test(document.referrer) ? 'line' : 'other';
const dev = /Mobi|Android|iPhone|iPad/i.test(ua) ? 'mobile' : 'desktop';
if (!store('own-' + data.id)) {
  const first = !store('seen-' + data.id);
  store('seen-' + data.id, '1');
  fetch(`/sign/v/${data.id}/seen`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ src, dev, first }), keepalive: true }).catch(() => {});
}

// ปุ่ม "สนใจ / ขอราคา"
const dlg = document.getElementById('leadDlg');
const form = document.getElementById('leadForm');
const msg = document.getElementById('leadMsg');
const send = document.getElementById('leadSend');
document.getElementById('lead').addEventListener('click', () => {
  msg.textContent = '';
  if (dlg.showModal) dlg.showModal();
  else dlg.setAttribute('open', '');
  setTimeout(() => form.elements.name.focus(), 50);
});
document.getElementById('leadCancel').addEventListener('click', () => (dlg.close ? dlg.close() : dlg.removeAttribute('open')));
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const body = { name: form.elements.name.value, phone: form.elements.phone.value, note: form.elements.note.value, src };
  send.disabled = true;
  msg.textContent = 'กำลังส่ง…';
  fetch(`/sign/v/${data.id}/lead`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    .then((r) => r.json().catch(() => ({})).then((j) => ({ ok: r.ok, j })))
    .then(({ ok, j }) => {
      send.disabled = false;
      if (!ok) {
        msg.textContent = j.message || 'ส่งไม่สำเร็จ ลองใหม่อีกครั้ง';
        return;
      }
      form.reset();
      msg.textContent = 'ส่งแล้ว ขอบคุณค่ะ ร้านจะติดต่อกลับเร็ว ๆ นี้';
      document.getElementById('lead').textContent = 'ส่งความสนใจแล้ว ✓';
      setTimeout(() => (dlg.close ? dlg.close() : dlg.removeAttribute('open')), 1800);
    })
    .catch(() => {
      send.disabled = false;
      msg.textContent = 'ส่งไม่สำเร็จ (ไม่มีอินเทอร์เน็ต?) ลองใหม่อีกครั้ง';
    });
});
