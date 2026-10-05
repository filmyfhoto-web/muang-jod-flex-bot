import { reply } from '../services/lineService.js';
import { publicBaseUrl } from '../utils/brand.js';
import { liffPage } from '../utils/liff.js';

const PAGES = [
  ['📊 แดชบอร์ดวันนี้', ''],
  ['📝 จดงาน (ฟอร์ม)', 'jot'],
  ['📒 สมุดลูกค้า', 'book'],
  ['🧾 บัญชีรายวัน', 'ledger'],
];

// action=web_links — ลิงก์เปิดบนคอม/เบราว์เซอร์ ตอนไม่ได้ถือโทรศัพท์
export async function webLinks({ replyToken }) {
  const base = publicBaseUrl();
  const url = (path) => (base ? `${base}/app/${path}${path ? '/' : ''}` : liffPage(path));

  const lines = PAGES.map(([label, path]) => ({ label, href: url(path) })).filter((p) => p.href);
  if (!lines.length) {
    return reply(replyToken, { type: 'text', text: 'ยังไม่มีลิงก์ให้เปิดค่ะ ต้องตั้ง PUBLIC_BASE_URL หรือ LIFF_ID ใน Render ก่อนนะคะ 💜' });
  }

  return reply(replyToken, {
    type: 'text',
    text:
      '💻 เปิดม่วงจดบนคอมได้เลยค่ะ\n\n' +
      lines.map((p) => `${p.label}\n${p.href}`).join('\n\n') +
      '\n\nครั้งแรกจะขึ้นหน้าเข้าสู่ระบบ LINE ให้สแกน QR ด้วยมือถือหนเดียว หรือใส่อีเมลกับรหัสผ่าน LINE ค่ะ',
  });
}
