import { parsePostbackData, parseTransactions } from './parser.mjs';
import {
  buildConfirmFlex, buildDeleteConfirmFlex, buildSavedBatchFlex,
  buildSavedFlex, buildSummaryFlex
} from './flex.mjs';
import { signOpaqueId } from './security.mjs';
import { textMessage } from './line.mjs';

function helpMessage() {
  return textMessage([
    'ม่วงจดให้ 🐶',
    'พิมพ์รายการแบบธรรมดาได้เลย เช่น',
    '• กาแฟ 50',
    '• ขายรูปติดบัตร 240 พร้อมเพย์',
    '• ป้ายไวนิล 60*100 150 บาท โฟมบอร์ด 40*60 250 บาท',
    '',
    'ระบบจะแสดงรายการให้ตรวจสอบก่อนบันทึกทุกครั้งค่ะ'
  ].join('\n'));
}

async function savedMessage(transaction, lineUserId, deps) {
  const monthCategoryTotal = await deps.store.getMonthCategoryTotal(lineUserId, transaction.category);
  return buildSavedFlex(transaction, {
    baseUrl: deps.config.publicBaseUrl,
    liffId: deps.config.line.liffId,
    signedId: signOpaqueId(transaction.id, deps.config.signingSecret),
    monthCategoryTotal
  });
}

async function latestMessages(lineUserId, deps) {
  const items = await deps.store.listTransactions(lineUserId, { limit: 4 });
  if (!items.length) return [textMessage('ยังไม่มีรายการที่บันทึกค่ะ')];
  const messages = [];
  for (const item of items) messages.push(await savedMessage(item, lineUserId, deps));
  return messages;
}

async function handleText(event, deps) {
  const lineUserId = event.source?.userId;
  const text = String(event.message?.text || '').trim();
  if (!lineUserId) return [textMessage('ไม่พบข้อมูลผู้ใช้ LINE')];
  if (/^(ช่วยเหลือ|help|วิธีใช้)$/i.test(text)) return [helpMessage()];
  if (/^(รายการล่าสุด|ดูรายการล่าสุด|รายการ)$/i.test(text)) return latestMessages(lineUserId, deps);
  if (/^(สรุปวันนี้|สรุป)$/i.test(text)) {
    const summary = await deps.store.getSummary(lineUserId, 'today');
    return [buildSummaryFlex(summary, { liffId: deps.config.line.liffId })];
  }
  if (/^(สรุปเดือนนี้|เดือนนี้)$/i.test(text)) {
    const summary = await deps.store.getSummary(lineUserId, 'month');
    return [buildSummaryFlex(summary, { liffId: deps.config.line.liffId })];
  }
  if (/^(แก้ไขล่าสุด)$/i.test(text)) {
    const [item] = await deps.store.listTransactions(lineUserId, { limit: 1 });
    return item ? [await savedMessage(item, lineUserId, deps)] : [textMessage('ยังไม่มีรายการให้แก้ไขค่ะ')];
  }
  if (/^(ยกเลิกล่าสุด|ลบล่าสุด)$/i.test(text)) {
    const [item] = await deps.store.listTransactions(lineUserId, { limit: 1 });
    return item ? [buildDeleteConfirmFlex(item)] : [textMessage('ยังไม่มีรายการให้ยกเลิกค่ะ')];
  }

  const parsed = parseTransactions(text);
  if (!parsed.entries.length || parsed.issues.length) {
    return [textMessage(`ยังบันทึกไม่ได้ค่ะ\n${parsed.issues.map((issue) => `• ${issue}`).join('\n')}\n\nลองพิมพ์ เช่น “รายจ่าย กาแฟ 50”`)];
  }
  const batch = await deps.store.createPending({
    lineUserId, sourceText: text, sourceMessageId: event.message?.id || null, entries: parsed.entries
  });
  return [buildConfirmFlex(batch)];
}

async function handlePostback(event, deps) {
  const lineUserId = event.source?.userId;
  const data = parsePostbackData(event.postback?.data);
  if (!lineUserId) return [textMessage('ไม่พบข้อมูลผู้ใช้ LINE')];
  switch (data.action) {
    case 'confirm_batch': {
      const transactions = await deps.store.confirmPending(data.batchId, lineUserId);
      const first = transactions[0];
      const monthCategoryTotal = first ? await deps.store.getMonthCategoryTotal(lineUserId, first.category) : 0;
      return [buildSavedBatchFlex(transactions, {
        baseUrl: deps.config.publicBaseUrl,
        liffId: deps.config.line.liffId,
        signedId: first ? signOpaqueId(first.id, deps.config.signingSecret) : '',
        monthCategoryTotal
      })];
    }
    case 'cancel_batch':
      await deps.store.cancelPending(data.batchId, lineUserId);
      return [textMessage('ยกเลิกแล้วค่ะ ยังไม่มีการบันทึกข้อมูล')];
    case 'request_delete': {
      const item = await deps.store.getTransaction(data.id, lineUserId);
      return item ? [buildDeleteConfirmFlex(item)] : [textMessage('ไม่พบรายการ หรือรายการถูกยกเลิกแล้ว')];
    }
    case 'confirm_delete': {
      const deleted = await deps.store.softDeleteTransaction(data.id, lineUserId);
      return [textMessage(deleted ? 'ยกเลิกรายการแล้วค่ะ ✅' : 'ไม่พบรายการ หรือรายการถูกยกเลิกไปแล้ว')];
    }
    case 'keep':
      return [textMessage('เก็บรายการไว้เหมือนเดิมค่ะ')];
    default:
      return [helpMessage()];
  }
}

export async function handleLineEvent(event, deps) {
  if (event.type === 'message' && event.message?.type === 'text') return handleText(event, deps);
  if (event.type === 'message' && event.message?.type === 'audio') {
    return [textMessage('ได้รับเสียงแล้วค่ะ 🎙️ โมดูลการถอดเสียงยังปิดในรอบ TEST นี้ กรุณาพิมพ์รายการก่อนนะคะ')];
  }
  if (event.type === 'postback') return handlePostback(event, deps);
  if (event.type === 'follow') return [helpMessage()];
  return [];
}

export { helpMessage };
