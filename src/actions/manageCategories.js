import { reply } from '../services/lineService.js';
import { addCategory } from '../services/categoryService.js';
import { taxonomyOf } from '../utils/category.js';
import { liffPage } from '../utils/liff.js';
import { publicBaseUrl } from '../utils/brand.js';
import { COLORS } from '../flex/theme.js';

/* หมวดงานของร้าน — ดู เพิ่ม แก้ไข
 *
 * ร้านขอ "แก้ไขหมวดงานเองได้ เพราะมันจะมีเพิ่มเติม" หน้าแก้ไขเต็ม ๆ อยู่บนเว็บ
 * (เปลี่ยนชื่อ ซ่อน ประเภทย่อย คำค้น) ส่วนการเพิ่มหมวดใหม่ทำได้เลยในแชต
 */

// หน้าแก้ไขหมวด: ลิงก์ LIFF เปิดในไลน์ ถ้ายังไม่ได้ตั้ง LIFF ใช้ที่อยู่เว็บตรง ๆ
export function categoriesUrl(env = process.env) {
  const liff = liffPage('categories', {}, env);
  if (liff) return liff;
  const base = publicBaseUrl(env);
  return base ? `${base}/app/categories/` : null;
}

const SHOWN = 14;

const line = (g, extra = '') => ({
  type: 'box',
  layout: 'horizontal',
  spacing: 'sm',
  contents: [
    { type: 'text', text: g.icon || '📦', size: 'sm', flex: 0 },
    { type: 'text', text: g.label + extra, size: 'sm', color: COLORS.ink, wrap: true, flex: 1 },
  ],
});

// การ์ดรายการหมวดของร้าน + ปุ่มไปหน้าแก้ไข
export function categoriesMessage(tax, url) {
  const shown = [...tax.groups, tax.other];
  const hidden = tax.allGroups.filter((g) => g.hidden);

  const rows = shown.slice(0, SHOWN).map((g) => line(g, g.custom ? '  ✨' : ''));
  if (shown.length > SHOWN) {
    rows.push({ type: 'text', text: `และอีก ${shown.length - SHOWN} หมวด`, size: 'xs', color: COLORS.grey });
  }

  const body = [
    { type: 'text', text: '📂 หมวดงานของร้าน', weight: 'bold', size: 'md', color: COLORS.title },
    ...rows,
    ...(hidden.length
      ? [{ type: 'text', text: `ซ่อนอยู่: ${hidden.map((g) => g.label).join(', ')}`, size: 'xs', color: COLORS.grey, wrap: true }]
      : []),
    {
      type: 'text',
      text: 'เพิ่มหมวดใหม่ได้เลยในแชต พิมพ์ว่า\n"เพิ่มหมวด 🥤 แก้วสกรีน"\nแล้วม่วงจะจัดงานที่มีคำว่าแก้วสกรีนเข้าหมวดนี้ให้เองค่ะ',
      size: 'xs',
      color: COLORS.sub,
      wrap: true,
      margin: 'md',
    },
  ];

  return {
    type: 'flex',
    altText: 'หมวดงานของร้าน',
    contents: {
      type: 'bubble',
      size: 'mega',
      body: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: 'lg', backgroundColor: COLORS.surface, contents: body },
      ...(url
        ? {
            footer: {
              type: 'box',
              layout: 'vertical',
              paddingAll: 'lg',
              paddingTop: 'none',
              contents: [
                {
                  type: 'button',
                  style: 'primary',
                  color: COLORS.accent,
                  height: 'sm',
                  action: { type: 'uri', label: '✏️ เพิ่ม / แก้ไขหมวด', uri: url },
                },
              ],
            },
          }
        : {}),
    },
  };
}

// action=manage_categories — "แก้ไขหมวด" / "เพิ่มหมวด" เฉย ๆ
export async function manageCategories({ replyToken, profile }) {
  const tax = taxonomyOf(profile.id);
  const url = categoriesUrl();
  const msgs = [categoriesMessage(tax, url)];
  if (!url) {
    msgs.push({ type: 'text', text: 'หน้าแก้ไขหมวดจะเปิดได้เมื่อตั้ง LIFF_ID หรือ PUBLIC_BASE_URL ใน Render แล้วค่ะ 💜 (เพิ่มหมวดจากแชตใช้ได้เลย)' });
  }
  return reply(replyToken, msgs);
}

// ข้อความหลังเพิ่มหมวดสำเร็จ
export function addedMessage(group, url) {
  const sample = `${group.label} 12 ชิ้น 300`;
  return {
    type: 'text',
    text:
      `เพิ่มหมวด "${group.icon} ${group.label}" แล้วค่ะ 💜\n` +
      `ต่อไปพิมพ์ "${sample}" ม่วงจะจัดเข้าหมวดนี้ให้เองเลยนะคะ\n` +
      'อยากเปลี่ยนสี เพิ่มคำค้น หรือใส่ประเภทย่อย กดปุ่มด้านล่างได้เลยค่ะ',
    ...(url ? { quickReply: { items: [{ type: 'action', action: { type: 'uri', label: '✏️ แก้ไขหมวด', uri: url } }] } } : {}),
  };
}

// "เพิ่มหมวด 🥤 แก้วสกรีน"
export async function addCategoryFromChat({ replyToken, profile }, { label, icon }, deps = {}) {
  const out = await addCategory(profile.id, { label, icon }, deps);
  const url = categoriesUrl();

  if (out.ok) return reply(replyToken, addedMessage(out.group, url));

  const hint = out.status === 400 ? '\nถ้าหมวดนั้นซ่อนอยู่ เปิดให้แสดงได้ที่หน้าแก้ไขหมวดค่ะ' : '';
  return reply(replyToken, {
    type: 'text',
    text: `${out.message}${hint}`,
    ...(url ? { quickReply: { items: [{ type: 'action', action: { type: 'uri', label: '✏️ เปิดหน้าหมวดงาน', uri: url } }] } } : {}),
  });
}
