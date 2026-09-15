import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  startCollecting,
  readTurn,
  nextQuestion,
  nextSlot,
  acknowledge,
  toDraftInput,
  lineTotal,
  totalWorking,
  parseCollectCommand,
  previousSlot,
  forget,
  questionSet,
} from '../src/utils/slots.js';
import { extractDueDate } from '../src/utils/thaiDate.js';

const handler = readFileSync(new URL('../src/handlers/messageHandler.js', import.meta.url), 'utf8');

// ร้านขอให้ม่วง "สนทนาและถามเก็บรายละเอียดงานทีละข้อ เหมือนผู้ช่วยประจำร้าน"
// ของเดิมอ่านข้อความทั้งก้อนครั้งเดียว ขาดอะไรก็ขึ้นการ์ด ฿0 มาเฉย ๆ

// เดินบทสนทนาทั้งบทแล้วคืนคำถามที่ถูกถามไปตามลำดับ กับสิ่งที่เก็บได้
function converse(first, turns) {
  let state = startCollecting(first);
  assert.ok(state, `"${first}" ไม่ถูกอ่านว่าเป็นงาน`);
  const asked = [];
  for (const answer of turns) {
    const q = nextQuestion(state);
    if (!q) break;
    asked.push(q.text);
    state = readTurn({ ...state, asking: q.id }, answer).state;
  }
  return { state, asked, done: !nextQuestion(state) };
}

test('the bot asks one thing at a time, in order, and stops when it has enough', () => {
  const { asked, state, done } = converse('มีงานกรอบรูป', [
    '12 × 18 นิ้ว',
    '2 กรอบ',
    '350 บาท',
    'คุณแอน',
    'วันศุกร์',
    'ไม่ต้อง',
  ]);

  assert.deepEqual(asked, [
    'ขนาดเท่าไหร่คะ?',
    'จำนวนกี่กรอบคะ?',
    'ราคากรอบละเท่าไหร่คะ?',
    'ลูกค้าชื่ออะไรคะ?',
    'นัดรับวันไหนคะ?',
    'ต้องการแนบรูปหรือหลักฐานประกอบงานไหมคะ?',
  ]);
  assert.ok(done, 'ถามครบแล้วแต่ยังไม่ยอมไปสรุป');

  assert.equal(state.fields.qty.count, 2);
  assert.equal(state.fields.qty.unit, 'กรอบ');
  assert.equal(state.fields.unitPrice, 350);
  assert.equal(state.fields.customer, 'คุณแอน');
  assert.equal(state.fields.size.unit, 'inch');

  // ยอดรวมคิดให้ได้ แต่ต้องบอกวิธีคิดด้วย ห้ามให้ตัวเลขมาลอย ๆ
  assert.equal(lineTotal(state.fields), 700);
  assert.equal(totalWorking(state.fields), '350 × 2 = 700 บาท');
});

test('everything in one message means nothing gets asked twice', () => {
  // "หากผู้ใช้ตอบหลายข้อมูลในข้อความเดียว ให้ดึงข้อมูลทั้งหมดและข้ามคำถามที่ได้รับคำตอบแล้ว"
  const state = startCollecting(
    'มีงานกรอบรูป 12×18 จำนวน 2 กรอบ กรอบละ 350 ลูกค้าคุณแอน รับวันศุกร์'
  );
  assert.equal(nextSlot(state), 'attach', 'ยังจะถามเรื่องที่บอกมาแล้วอีก');
  assert.equal(state.fields.qty.count, 2);
  assert.equal(state.fields.unitPrice, 350);
  assert.equal(state.fields.customer, 'คุณแอน');
  assert.ok(state.fields.due, 'วันนัดรับหายไป');

  // ตอบสองเรื่องพร้อมกันกลางทางก็ข้ามให้เหมือนกัน
  const half = converse('มีงานกรอบรูป', ['12×18 จำนวน 2 กรอบ']);
  assert.equal(nextSlot(half.state), 'unitPrice', 'ตอบจำนวนมาด้วยแล้วยังถามจำนวนซ้ำ');
});

test('a correction mid-conversation edits the answer and carries on', () => {
  // ร้าน: "เปลี่ยนเป็น 3 กรอบนะ" → "แก้จำนวนเป็น 3 กรอบแล้วค่ะ ราคากรอบละเท่าไหร่คะ?"
  let state = startCollecting('มีงานกรอบรูป');
  state = readTurn({ ...state, asking: 'size' }, '12×18 จำนวน 2 กรอบ').state;
  assert.equal(nextSlot(state), 'unitPrice');

  const turn = readTurn({ ...state, asking: 'unitPrice' }, 'เปลี่ยนเป็น 3 กรอบนะ');
  assert.deepEqual(turn.changed, ['qty'], 'ไม่ได้ถือว่าเป็นการแก้ของเดิม');
  assert.equal(turn.state.fields.qty.count, 3);
  assert.equal(acknowledge(turn.state, turn.changed), 'แก้จำนวนเป็น 3 กรอบแล้วค่ะ');
  // แล้วถามต่อจากจุดที่ค้างอยู่ ไม่ใช่เริ่มใหม่
  assert.equal(nextSlot(turn.state), 'unitPrice');
});

test('each kind of work has its own questions, and they mention the right thing', () => {
  const vinyl = converse('มีงานป้ายไวนิล', ['160x300 ซม.', '2 ป้าย', 'เจาะตาไก่']);
  assert.deepEqual(vinyl.asked, ['ขนาดกว้าง × สูงเท่าไหร่คะ?', 'จำนวนกี่ป้ายคะ?', 'ต้องการเจาะตาไก่ไหมคะ?']);
  assert.equal(vinyl.state.fields.eyelet, true);

  const copy = converse('ถ่ายเอกสาร', ['ขาวดำ', 'หน้าหลัง', '120 หน้า']);
  assert.deepEqual(copy.asked, ['ขาวดำหรือสีคะ?', 'หน้าเดียวหรือหน้าหลังคะ?', 'จำนวนกี่หน้าคะ?']);
  assert.equal(copy.state.fields.colour, 'ขาวดำ');
  assert.equal(copy.state.fields.sides, 'หน้าหลัง');

  const sticker = converse('งานสติ๊กเกอร์', ['10x10 ซม.', '50 แผ่น', 'ไดคัท']);
  assert.equal(sticker.state.fields.diecut, true);

  // งานที่ไม่รู้จักก็ยังคุยได้ ใช้ชุดคำถามพื้นฐาน
  assert.deepEqual(questionSet('ไม่มีหมวดนี้'), questionSet('other'));

  // ประโยคที่ไม่ใช่การสั่งงาน ต้องไม่ถูกลากเข้าโหมดถาม
  assert.equal(startCollecting('สวัสดีค่ะ'), null);
  assert.equal(startCollecting('วันนี้ขายดีไหม'), null);
});

test('the shop can say they do not know yet, and it does not get asked again', () => {
  const { state, asked } = converse('มีงานกรอบรูป', ['12×18 นิ้ว', '2 กรอบ', 'ยังไม่รู้', 'คุณแอน']);
  assert.ok(state.skipped.includes('unitPrice'), 'ข้ามราคาไปแล้วแต่ไม่ได้จำไว้');
  assert.ok(!asked.includes('ราคากรอบละเท่าไหร่คะ?') || asked.filter((a) => a.startsWith('ราคา')).length === 1,
    'ถามราคาซ้ำทั้งที่บอกว่ายังไม่รู้');
  assert.equal(nextSlot(state), 'due', 'ข้ามราคาแล้วต้องไปต่อ ไม่ใช่ติดอยู่ที่เดิม');
  // ยอดเป็นศูนย์ได้ ร้านรับงานก่อนคิดราคาทีหลังเป็นเรื่องปกติ
  assert.equal(lineTotal(state.fields), 0);
});

test('the typed commands work, because a card can scroll off the screen', () => {
  assert.deepEqual(parseCollectCommand('ยกเลิก'), { kind: 'cancel' });
  assert.deepEqual(parseCollectCommand('เริ่มใหม่'), { kind: 'restart' });
  assert.deepEqual(parseCollectCommand('ย้อนกลับ'), { kind: 'back' });
  assert.deepEqual(parseCollectCommand('สรุปให้ดู'), { kind: 'summary' });
  assert.deepEqual(parseCollectCommand('บันทึกเลย'), { kind: 'save' });
  assert.deepEqual(parseCollectCommand('แก้ขนาด'), { kind: 'ask', field: 'size' });
  assert.deepEqual(parseCollectCommand('แก้จำนวน'), { kind: 'ask', field: 'qty' });
  assert.deepEqual(parseCollectCommand('แก้ราคา'), { kind: 'ask', field: 'unitPrice' });
  assert.deepEqual(parseCollectCommand('เปลี่ยนชื่อลูกค้า'), { kind: 'ask', field: 'customer' });
  assert.deepEqual(parseCollectCommand('เปลี่ยนวันรับ'), { kind: 'ask', field: 'due' });
  assert.deepEqual(parseCollectCommand('ไม่แนบรูป'), { kind: 'answer', field: 'attach', value: false });

  // คำสั่งที่พ่วงคำตอบมาด้วย ไม่ต้องถามซ้ำ ปล่อยให้อ่านค่าไปเลย
  assert.equal(parseCollectCommand('แก้จำนวนเป็น 3 กรอบ'), null);
  // คำตอบธรรมดาไม่ใช่คำสั่ง
  assert.equal(parseCollectCommand('12x18 นิ้ว'), null);
  assert.equal(parseCollectCommand('คุณแอน'), null);
});

test('going back reopens the previous answer, not the whole conversation', () => {
  const { state } = converse('มีงานกรอบรูป', ['12×18 นิ้ว', '2 กรอบ']);
  assert.equal(nextSlot(state), 'unitPrice');

  const back = previousSlot(state);
  assert.equal(back, 'qty', 'ย้อนกลับไปผิดข้อ');

  const reopened = forget(state, back);
  assert.equal(nextSlot(reopened), 'qty');
  assert.ok(reopened.fields.size, 'ย้อนกลับหนึ่งข้อแล้วข้อก่อนหน้าหายไปด้วย');
});

test('what the conversation collected becomes the same draft a typed job makes', () => {
  const { state } = converse('มีงานกรอบรูป', ['12 × 18 นิ้ว', '2 กรอบ', '350 บาท', 'คุณแอน', 'วันศุกร์', 'ไม่ต้อง']);
  const draft = toDraftInput(state);

  assert.equal(draft.jobName, 'กรอบรูป');
  assert.equal(draft.customerName, 'คุณแอน');
  assert.equal(draft.total, 700);
  assert.equal(draft.items.length, 1);
  assert.equal(draft.items[0].size, '12 × 18 นิ้ว');
  assert.equal(draft.items[0].quantity, 2);
  assert.equal(draft.items[0].unit_price, 350);
  assert.match(draft.note, /350 × 2 = 700/, 'วิธีคิดยอดรวมไม่ได้ติดไปกับงาน');

  // รายละเอียดที่ไม่ใช่ขนาด/จำนวน/ราคา ไม่หายไปไหน
  const vinyl = converse('มีงานป้ายไวนิล', ['160x300 ซม.', '1 ป้าย', 'เจาะตาไก่', '990', 'พี่นก', 'พรุ่งนี้', 'ไม่ต้อง']);
  assert.match(toDraftInput(vinyl.state).note, /เจาะตาไก่/);
});

test('a pickup day can be a weekday, because that is how a shop books work', () => {
  const tue = new Date('2026-09-15T03:00:00Z'); // อังคาร
  assert.equal(extractDueDate('นัดรับวันศุกร์', tue).date, '2026-09-18');
  assert.equal(extractDueDate('รับวันจันทร์', tue).date, '2026-09-21');
  // วันเดียวกับวันนี้แปลว่าอีกสัปดาห์ ใครนัดวันอังคารในวันอังคารหมายถึงอีกเจ็ดวัน
  assert.equal(extractDueDate('นัดรับวันอังคาร', tue).date, '2026-09-22');
  // "ศุกร์นี้" คือศุกร์ที่กำลังจะถึง
  assert.equal(extractDueDate('นัดรับศุกร์นี้', tue).date, '2026-09-18');
  // ของเดิมยังต้องใช้ได้เหมือนเดิม
  assert.equal(extractDueDate('นัดรับพรุ่งนี้', tue).date, '2026-09-16');
  assert.equal(extractDueDate('นัดรับ 20 ก.ย.', tue).date, '2026-09-20');
});

test('the chat wires the loop up, and still never saves before confirming', () => {
  assert.match(handler, /STATES\.COLLECTING_JOB/, 'ไม่มีสถานะสำหรับการถามทีละข้อ');
  assert.match(handler, /const collecting = startCollecting\(text\)/, 'ไม่มีอะไรเริ่มโหมดถาม');
  assert.match(handler, /async function handleCollectTurn/);

  // คำถามที่มีตัวเลือกต้องมาเป็น Quick Reply ไม่ใช่ให้พิมพ์เอง
  assert.match(handler, /quickReply: \{/, 'คำถามแบบเลือกตอบไม่มีปุ่มให้กด');
  assert.match(handler, /type: 'message', label, text: label/);

  // ครบแล้วไปที่การ์ดยืนยัน ไม่ใช่บันทึกเลย
  const finish = handler.slice(handler.indexOf('async function finishCollect'), handler.indexOf('async function handleCollectTurn'));
  assert.match(finish, /STATES\.CONFIRMING_JOB/, 'เก็บครบแล้วบันทึกทันทีโดยไม่ถาม');
  assert.match(finish, /jobPreviewMessage/);
  assert.ok(!/createJob|saveJob/.test(finish), 'มีการบันทึกงานก่อนกดยืนยัน');
});
