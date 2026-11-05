import { reply } from '../services/lineService.js';
import { addExpense, listExpenses, sumExpenses, cancelExpense } from '../services/expenseService.js';
import { listBranches, pickBranch } from '../services/branchService.js';
import { formatBaht } from '../utils/currency.js';
import { formatThaiDate } from '../utils/dates.js';
import { COLORS } from '../flex/theme.js';
import { logger } from '../services/logger.js';

/* รายจ่าย — "ซื้อกระดาษ A4 350" → การ์ดสั้น ๆ ให้ยืนยันก่อนบันทึก (V2 §8)
 *
 *   💸 รายจ่าย — ซื้อกระดาษ A4
 *   350 บาท · เงินสด
 *   [✅ บันทึกรายจ่าย] [ยกเลิก]
 *
 * ข้อมูลทั้งใบอยู่ใน postback ของปุ่มยืนยัน (ไม่เก็บสเตต) — การ์ดเก่าที่เลื่อน
 * ผ่านไปแล้วก็ยังกดได้ และไม่ไปทับร่างงานที่อาจค้างอยู่
 */

const METHOD_LABEL = { cash: '💵 เงินสด', transfer: '🏦 โอน' };

export function expenseConfirmMessage({ item, amount, payMethod }) {
  const data =
    'action=exp_save' +
    `&i=${encodeURIComponent(String(item).slice(0, 80))}` +
    `&a=${encodeURIComponent(amount)}` +
    (payMethod ? `&m=${payMethod}` : '');
  return {
    type: 'flex',
    altText: `รายจ่าย ${item} ${formatBaht(amount)}`,
    contents: {
      type: 'bubble',
      size: 'kilo',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: 'lg',
        backgroundColor: COLORS.surface,
        contents: [
          { type: 'text', text: '💸 รายจ่าย', size: 'xs', weight: 'bold', color: COLORS.red },
          { type: 'text', text: item, size: 'md', weight: 'bold', color: COLORS.ink, wrap: true },
          {
            type: 'text',
            text: formatBaht(amount) + (METHOD_LABEL[payMethod] ? ' · ' + METHOD_LABEL[payMethod] : ''),
            size: 'sm',
            color: COLORS.sub,
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        paddingAll: 'lg',
        paddingTop: 'none',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: COLORS.accent,
            height: 'sm',
            action: { type: 'postback', label: '✅ บันทึกรายจ่าย', data, displayText: 'บันทึกรายจ่าย' },
          },
          {
            type: 'button',
            style: 'secondary',
            height: 'sm',
            action: { type: 'postback', label: 'ยกเลิก', data: 'action=exp_cancel', displayText: 'ยกเลิก' },
          },
        ],
      },
    },
  };
}

// ประโยครายจ่ายจากแชต → การ์ดยืนยัน (ยังไม่บันทึก)
export async function confirmExpense({ replyToken }, parsed) {
  return reply(replyToken, expenseConfirmMessage(parsed));
}

// action=exp_save&i&a&m — บันทึกจริง
export async function saveExpense({ replyToken, profile, params }, deps = {}) {
  const add = deps.addExpense || addExpense;
  const list = deps.listExpenses || listExpenses;
  const item = String(params.i || '').trim();
  const amount = Number(params.a);
  if (!item || !(amount > 0)) {
    return reply(replyToken, { type: 'text', text: 'ใบรายจ่ายนี้อ่านไม่ออกแล้วค่ะ พิมพ์ใหม่ เช่น "ซื้อกระดาษ A4 350" นะคะ' });
  }

  // ร้านเดียว = ลงร้านนั้นเลย หลายร้านไม่ถาม (รายจ่ายส่วนกลางมีจริง) — ย้ายทีหลังได้ในฐานข้อมูล
  let branchId = null;
  try {
    const branches = await (deps.listBranches || listBranches)(profile.id);
    if (branches.length === 1) branchId = branches[0].id;
    if (params.b) branchId = pickBranch(branches, params.b)?.id || branchId;
  } catch (err) {
    logger.warn('expense.branches_failed', { message: err?.message });
  }

  const out = await add(profile.id, { item, amount, payMethod: params.m || null, branchId });
  if (!out.ok) return reply(replyToken, { type: 'text', text: out.message });

  const today = await list(profile.id, {});
  const total = sumExpenses(today);
  return reply(replyToken, {
    type: 'text',
    text:
      `บันทึกรายจ่ายแล้วค่ะ 💸\n${item} — ${formatBaht(amount)}` +
      (METHOD_LABEL[params.m] ? ` (${METHOD_LABEL[params.m].slice(2).trim()})` : '') +
      `\nวันนี้จ่ายไปแล้ว ${today.length} รายการ รวม ${formatBaht(total)}`,
    quickReply: {
      items: [
        { type: 'action', action: { type: 'postback', label: '📄 รายจ่ายวันนี้', data: 'action=expense_list', displayText: 'รายจ่ายวันนี้' } },
        { type: 'action', action: { type: 'postback', label: '📊 สรุปยอดร้าน', data: 'action=today_summary', displayText: 'สรุปยอดร้าน' } },
      ],
    },
  });
}

export async function cancelExpenseDraft({ replyToken }) {
  return reply(replyToken, { type: 'text', text: 'ไม่บันทึกรายจ่ายนี้ค่ะ 💜' });
}

// action=expense_list — รายจ่ายวันนี้ พร้อมปุ่มลบทีละรายการ
export async function expenseList({ replyToken, profile }, deps = {}) {
  const rows = await (deps.listExpenses || listExpenses)(profile.id, {});
  if (!rows.length) {
    return reply(replyToken, {
      type: 'text',
      text: 'วันนี้ยังไม่มีรายจ่ายค่ะ 💜\nจดได้เลย เช่น "ซื้อกระดาษ A4 350" หรือ "จ่ายค่าไฟ 1,200 โอน"',
    });
  }
  const total = sumExpenses(rows);
  const line = (r) => ({
    type: 'box',
    layout: 'horizontal',
    spacing: 'sm',
    alignItems: 'center',
    contents: [
      { type: 'text', text: r.item, size: 'sm', color: COLORS.ink, wrap: true, flex: 5 },
      { type: 'text', text: formatBaht(r.amount), size: 'sm', weight: 'bold', color: COLORS.red, align: 'end', flex: 2 },
      {
        type: 'text',
        text: '🗑',
        size: 'sm',
        flex: 0,
        action: { type: 'postback', label: 'ลบ', data: `action=exp_del&id=${encodeURIComponent(r.id)}`, displayText: 'ลบรายจ่าย' },
      },
    ],
  });
  return reply(replyToken, {
    type: 'flex',
    altText: `รายจ่ายวันนี้ ${formatBaht(total)}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingAll: 'lg',
        backgroundColor: COLORS.surface,
        contents: [
          { type: 'text', text: `💸 รายจ่ายวันนี้ · ${formatThaiDate(rows[0].spent_date)}`, size: 'md', weight: 'bold', color: COLORS.title, wrap: true },
          ...rows.slice(0, 12).map(line),
          ...(rows.length > 12 ? [{ type: 'text', text: `และอีก ${rows.length - 12} รายการ`, size: 'xs', color: COLORS.grey }] : []),
          { type: 'separator', color: COLORS.line },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: 'รวมจ่ายวันนี้', size: 'sm', color: COLORS.sub, flex: 1 },
              { type: 'text', text: formatBaht(total), size: 'md', weight: 'bold', color: COLORS.red, align: 'end', flex: 1 },
            ],
          },
        ],
      },
    },
  });
}

// action=exp_del&id → ถามก่อน · exp_del_yes&id → ลบจริง (ปิดสถานะ)
export async function deleteExpenseAsk({ replyToken, params }) {
  return reply(replyToken, {
    type: 'text',
    text: 'ลบรายจ่ายนี้ใช่ไหมคะ?',
    quickReply: {
      items: [
        { type: 'action', action: { type: 'postback', label: '🗑 ลบเลย', data: `action=exp_del_yes&id=${encodeURIComponent(params.id || '')}`, displayText: 'ลบรายจ่าย' } },
        { type: 'action', action: { type: 'postback', label: 'ไม่ลบ', data: 'action=exp_cancel', displayText: 'ไม่ลบ' } },
      ],
    },
  });
}

export async function deleteExpense({ replyToken, profile, params }, deps = {}) {
  const gone = await (deps.cancelExpense || cancelExpense)(profile.id, params.id);
  if (!gone) return reply(replyToken, { type: 'text', text: 'ไม่พบรายจ่ายนี้แล้วค่ะ (อาจถูกลบไปแล้ว)' });
  return reply(replyToken, { type: 'text', text: `ลบ "${gone.item}" ${formatBaht(gone.amount)} ออกจากรายจ่ายแล้วค่ะ 💜` });
}

/* action=money_note — ปุ่ม "จดรายรับ–รายจ่าย" บนหน้าแรก
 *
 * ไม่ใช่ฟอร์ม ไม่ใช่เมนูซ้อนเมนู — แค่บอกวิธีพิมพ์ (ซึ่งคือทั้งหมดที่ต้องรู้)
 * พร้อมปุ่มดูของวันนี้สองใบ
 */
export async function moneyNote({ replyToken }) {
  return reply(replyToken, {
    type: 'text',
    text:
      'จดได้เลยค่ะ พิมพ์สิ่งที่ทำจริง 💜\n\n' +
      '💰 รายรับ (งาน)\n' +
      '• อัดรูป 150 เงินสด\n' +
      '• ครูแอนสั่งป้าย 2x1 ราคา 600 มัดจำ 200 รับพรุ่งนี้\n\n' +
      '💸 รายจ่าย\n' +
      '• ซื้อกระดาษ A4 350\n' +
      '• จ่ายค่าไฟ 1,200 โอน',
    quickReply: {
      items: [
        { type: 'action', action: { type: 'postback', label: '📄 รายจ่ายวันนี้', data: 'action=expense_list', displayText: 'รายจ่ายวันนี้' } },
        { type: 'action', action: { type: 'postback', label: '📊 สรุปยอดร้าน', data: 'action=today_summary', displayText: 'สรุปยอดร้าน' } },
        { type: 'action', action: { type: 'postback', label: '💵 งานเงินสดวันนี้', data: 'action=money_list&k=cash', displayText: 'งานเงินสด' } },
      ],
    },
  });
}
