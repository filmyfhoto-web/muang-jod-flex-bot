import { reply } from '../services/lineService.js';
import { publicBaseUrl } from '../utils/brand.js';
import { liffPage } from '../utils/liff.js';

const PAGES = [
  ['📊 แดชบอร์ดวันนี้', ''],
  ['📝 จดงาน (ฟอร์ม)', 'jot'],
  ['📒 สมุดลูกค้า', 'book'],
  ['🧾 บัญชีรายวัน', 'ledger'],
];

// action=open_game — ปุ่มเกมบนริชเมนู: ปกติปุ่มเป็นลิงก์เปิดเกมตรง ๆ อยู่แล้ว
// เคสนี้คือทางสำรอง (เมนูที่ส่ง label เป็นข้อความ หรือยังไม่ได้ตั้ง PUBLIC_BASE_URL)
export async function openGame({ replyToken }) {
  const base = publicBaseUrl();
  if (!base) {
    return reply(replyToken, { type: 'text', text: 'ยังเปิดเกมไม่ได้ค่ะ ต้องตั้ง PUBLIC_BASE_URL ใน Render ก่อนนะคะ 💜' });
  }
  return reply(replyToken, {
    type: 'text',
    text: `🎮 เกมร้านนัฐภรณ์ 8-BIT เปิดเล่นได้เลยค่ะ\n${base}/game/\n\nบอร์ดงานหน้าร้านแบบเกม — คิวงาน รถส่งไวนิล และน้องหมาบนเคาน์เตอร์ 💜`,
  });
}

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
