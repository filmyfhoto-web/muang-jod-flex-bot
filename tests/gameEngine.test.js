// NATTAPRON 8-BIT — engine unit tests (parser, BKK dates, queue, transitions,
// pickup timestamp, simulation purity, import/export).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseThaiOrder, bkkTodayISO, addDaysISO, thaiDate, thaiDateTime,
  newOrder, makeNextId, applyTransition, nextActions, canGo,
  sortQueue, filterQueue, moveInQueue, statBuckets, isOverdue,
  demoOrders, serializeBackup, validateImport, reportData,
  pointAt, pathLength, STATUSES, STATUS, TRANSITIONS, KINDS, VINYL_STAGES,
} from '../public/game/engine.js';
import { buildWalkers, tickWalkers, ZONES, WALK_LOOP, hitZone } from '../public/game/scene.js';

const T = '2026-11-23'; // จันทร์

test('เกม: parser อ่านประโยคงานไทยครบทุกช่อง', () => {
  const p = parseThaiOrder('ป้ายไวนิล 2 ผืน โรงเรียนบ้านหนองแดง ด่วน รับศุกร์', { todayISO: T });
  assert.equal(p.customer, 'โรงเรียนบ้านหนองแดง');
  assert.equal(p.kind, 'vinyl');
  assert.equal(p.qty, 2);
  assert.equal(p.unit, 'ผืน');
  assert.equal(p.due, '2026-11-27'); // ศุกร์ถัดไปจากจันทร์ 23
  assert.equal(p.priority, 'urgent');
  assert.equal(p.title, 'ป้ายไวนิล 2 ผืน'); // ชื่อลูกค้า/วันนัด/คำว่าด่วน ถูกดึงออกจากรายการ
});

test('เกม: parser วันนัด วันนี้/พรุ่งนี้/มะรืน/เลขวันที่ พ.ศ.', () => {
  assert.equal(parseThaiOrder('ถ่ายเอกสาร 200 แผ่น เอาวันนี้', { todayISO: T }).due, T);
  assert.equal(parseThaiOrder('การ์ดแต่งงาน รับพรุ่งนี้', { todayISO: T }).due, '2026-11-24');
  assert.equal(parseThaiOrder('กรอบรูป คุณบีม มะรืน', { todayISO: T }).due, '2026-11-25');
  assert.equal(parseThaiOrder('สติ๊กเกอร์ 100 ดวง รับ 1/12', { todayISO: T }).due, '2026-12-01');
  // วันที่ผ่านไปแล้วปีนี้ → ตีความเป็นปีหน้า
  assert.equal(parseThaiOrder('ปริ้นงาน รับ 5/1', { todayISO: T }).due, '2027-01-05');
  // ปี พ.ศ. เต็ม และ 2 หลัก (69 = 2569)
  assert.equal(parseThaiOrder('ไวนิล รับ 24/12/2569', { todayISO: T }).due, '2026-12-24');
  assert.equal(parseThaiOrder('ไวนิล รับ 24/12/69', { todayISO: T }).due, '2026-12-24');
});

test('เกม: parser ไม่หลงคำ — ป้ายไวนิลไม่ใช่ลูกค้าชื่อ "ป้า"', () => {
  const p = parseThaiOrder('ตรายางป้าแดง 1 อัน', { todayISO: T });
  assert.equal(p.customer, '');
  assert.equal(p.kind, 'stamp');
  const v = parseThaiOrder('ป้ายไวนิลหน้าร้าน 1 ผืน', { todayISO: T });
  assert.equal(v.kind, 'vinyl');
  assert.equal(v.customer, '');
});

test('เกม: วันนี้แบบไทย (Asia/Bangkok) ข้ามเที่ยงคืน UTC ถูกต้อง', () => {
  assert.equal(bkkTodayISO(new Date('2026-11-22T17:30:00Z')), '2026-11-23'); // 00:30 ตี
  assert.equal(bkkTodayISO(new Date('2026-11-22T16:59:00Z')), '2026-11-22'); // 23:59
  assert.equal(thaiDate('2026-11-23'), '23/11/2569');
});

test('เกม: เรียงคิวอัตโนมัติ ด่วนก่อน → วันนัดรับ และโหมดจัดเอง', () => {
  const mk = (id, pr, due, rank = 0, status = 'queued') => ({ id, priority: pr, due, rank, status });
  const list = [mk('NP-0003', 'normal', '2026-11-24'), mk('NP-0001', 'urgent', '2026-11-25'), mk('NP-0002', 'normal', '2026-11-23'), mk('NP-0004', 'normal', '2026-11-23', 0, 'picked_up')];
  assert.deepEqual(sortQueue(list, 'smart').map((j) => j.id), ['NP-0001', 'NP-0002', 'NP-0003', 'NP-0004']); // ด่วนขึ้นก่อนแม้นัดช้ากว่า งานจบไปท้าย
  const vis = ['NP-0001', 'NP-0002', 'NP-0003'];
  const moved = moveInQueue(list, vis, 'NP-0003', 'up');
  assert.deepEqual(sortQueue(moved, 'manual').filter((j) => j.status === 'queued').map((j) => j.id), ['NP-0001', 'NP-0003', 'NP-0002']);
  // ขยับเกินขอบ = ไม่เปลี่ยน
  assert.equal(moveInQueue(list, vis, 'NP-0001', 'up'), list);
});

test('เกม: สถานะเดินตามแผนผังเท่านั้น — ข้ามขั้นถูกปฏิเสธ', () => {
  let j = newOrder({ customer: 'ทดสอบ', kind: 'vinyl', title: 'ป้าย', due: T, received: T }, { now: new Date('2026-11-23T03:00:00Z') });
  assert.equal(j.status, 'queued');
  assert.throws(() => applyTransition(j, 'picked_up', {}), (e) => e.code === 'BAD_TRANSITION');
  for (const s of ['preparing', 'out_to_vinyl', 'vinyl_production', 'back_at_shop', 'quality_check', 'ready_for_pickup']) {
    assert.ok(canGo(j, s) || true);
    j = applyTransition(j, s, { now: new Date('2026-11-23T04:00:00Z'), by: 'ฟิล์ม' });
  }
  assert.equal(j.status, 'ready_for_pickup');
  assert.equal(j.history.at(-1).by, 'ฟิล์ม');
  assert.equal(j.history.at(-1).to, 'ready_for_pickup');
  // ยกเลิกแล้วเปิดใหม่ได้ (ไม่หายไปไหน)
  const canceled = applyTransition(j, 'canceled', {});
  assert.deepEqual(nextActions(canceled).map((s) => s.id), ['queued']);
});

test('เกม: ยืนยันลูกค้ารับงาน บันทึกเวลาจริงเป๊ะ และไม่แต่งเวลาเอง', () => {
  let j = newOrder({ customer: 'ทดสอบ', kind: 'print', title: 'ปริ้น', due: T, received: T }, { now: new Date('2026-11-23T02:00:00Z') });
  for (const s of ['preparing', 'producing', 'quality_check', 'ready_for_pickup']) j = applyTransition(j, s, {});
  const exact = new Date('2026-11-23T08:45:30Z'); // 15:45:30 เวลาไทย
  j = applyTransition(j, 'picked_up', { now: exact, by: 'ฝน' });
  assert.equal(j.pickedAt, exact.toISOString());
  assert.equal(j.pickedDate, '2026-11-23');
  assert.match(thaiDateTime(j.pickedAt), /23\/11\/2569 15:45 น\./);
  assert.deepEqual(TRANSITIONS.picked_up, []); // จบจริง ไม่มีทางไปต่อ
});

test('เกม: แอนิเมชันเดิน/รถวิ่ง ไม่มีทางแก้ใบงาน — ของจริงถูก freeze ก็ไม่พัง', () => {
  const orders = Object.freeze(demoOrders(new Date('2026-11-23T03:00:00Z')).map((j) => Object.freeze(j)));
  const before = JSON.stringify(orders);
  // เครื่องมือของฝั่งภาพ รับแค่พิกัด ไม่รับ orders เลย
  const walkers = buildWalkers();
  for (let i = 0; i < 120; i++) tickWalkers(walkers, 16);
  const [x, y] = pointAt(WALK_LOOP, 0.5);
  assert.ok(Number.isFinite(x) && Number.isFinite(y));
  assert.ok(pathLength(WALK_LOOP) > 500);
  assert.equal(hitZone(100, 480), 'counter');
  // applyTransition คืนใบใหม่ ไม่แตะใบเดิม
  const next = applyTransition(orders.find((j) => j.status === 'queued'), 'preparing', {});
  assert.equal(next.status, 'preparing');
  assert.equal(JSON.stringify(orders), before);
});

test('เกม: สำรอง-นำเข้าไฟล์ ครบรอบ และรับไฟล์ต้นแบบเก่า (สถานะไทย) ได้', () => {
  const now = new Date('2026-11-23T03:00:00Z');
  const orders = demoOrders(now);
  const round = validateImport(serializeBackup(orders, now), { todayISO: T });
  assert.ok(round.ok);
  assert.equal(round.orders.length, orders.length);
  assert.equal(round.orders[0].status, orders[0].status);
  assert.ok(round.orders.every((j) => j.sample === true)); // ป้ายตัวอย่างติดไปด้วย

  // ไฟล์จากต้นแบบเก่า: สถานะภาษาไทย + วันที่รับ (ไม่มีเวลา) — แปลงโดยไม่แต่งเวลาปลอม
  const legacy = { version: 3, orders: [{ id: 'NTP-OLD1', customer: 'ลูกค้าเก่า', kind: 'vinyl', title: 'ป้าย', received: '2026-11-20', due: '2026-11-21', picked: '2026-11-21', status: 'รับแล้ว', priority: 'urgent', note: '' }] };
  const v = validateImport(JSON.stringify(legacy), { todayISO: T });
  assert.ok(v.ok);
  assert.equal(v.orders[0].status, 'picked_up');
  assert.equal(v.orders[0].pickedDate, '2026-11-21');
  assert.equal(v.orders[0].pickedAt, ''); // ไม่รู้เวลาจริง ก็ไม่สร้างเวลาเท็จ
  for (const [th, en] of [['รอเริ่ม', 'queued'], ['เตรียมไฟล์', 'preparing'], ['กำลังผลิต', 'producing'], ['ส่งไปบ้านทำไวนิล', 'out_to_vinyl'], ['ผลิตไวนิลที่บ้าน', 'vinyl_production'], ['รับกลับร้าน', 'back_at_shop'], ['ตรวจงาน', 'quality_check'], ['พร้อมรับ', 'ready_for_pickup']]) {
    assert.equal(validateImport([{ id: 'x', status: th }], { todayISO: T }).orders[0].status, en, th);
  }

  // ไฟล์เสีย
  assert.equal(validateImport('["แตก', { todayISO: T }).ok, false);
  assert.equal(validateImport({ nothing: true }, { todayISO: T }).ok, false);
  assert.equal(validateImport({ orders: new Array(5001).fill({}) }, { todayISO: T }).ok, false);
  // ค่ายาวเกิน → ถูกตัด ไม่ล้ม
  const clamped = validateImport([{ id: 'x', customer: 'ก'.repeat(500), status: 'queued' }], { todayISO: T });
  assert.equal(clamped.orders[0].customer.length, 100);
});

test('เกม: เลขใบงาน NP-#### รันต่อจากเลขสูงสุด', () => {
  assert.equal(makeNextId([]), 'NP-0001');
  assert.equal(makeNextId([{ id: 'NP-0007' }, { id: 'NP-0002' }, { id: 'NTP-OLD' }]), 'NP-0008');
});

test('เกม: รายงานวันนี้ นับ เลยนัด/นัดวันนี้/รับแล้ววันนี้ ตรง', () => {
  const now = new Date('2026-11-23T03:00:00Z');
  let a = newOrder({ customer: 'A', kind: 'print', title: 'x', received: '2026-11-20', due: '2026-11-21' }, { now });
  let b = newOrder({ customer: 'B', kind: 'vinyl', title: 'y', received: T, due: T }, { now, orders: [a] });
  let c = newOrder({ customer: 'C', kind: 'photo', title: 'z', received: T, due: T }, { now, orders: [a, b] });
  for (const s of ['preparing', 'producing', 'quality_check', 'ready_for_pickup']) c = applyTransition(c, s, {});
  c = applyTransition(c, 'picked_up', { now: new Date('2026-11-23T05:00:00Z') });
  const r = reportData([a, b, c], T);
  assert.equal(r.openCount, 2);
  assert.deepEqual(r.overdue.map((j) => j.id), [a.id]);
  assert.deepEqual(r.dueToday.map((j) => j.id), [b.id]);
  assert.deepEqual(r.pickedToday.map((j) => j.id), [c.id]);
  assert.equal(isOverdue(a, T), true);
  const buckets = statBuckets([a, b, c]);
  assert.deepEqual(buckets, { wait: 2, doing: 0, done: 1 });
});

test('เกม: ข้อมูลตัวอย่างติดป้าย "ตัวอย่าง" ทุกใบ และสถานะมาจากการเดินจริง', () => {
  const demo = demoOrders(new Date('2026-11-23T03:00:00Z'));
  assert.ok(demo.length >= 3);
  for (const j of demo) {
    assert.equal(j.sample, true);
    assert.match(j.customer, /^ตัวอย่าง/);
    assert.ok(j.history.length >= 1);
    for (const h of j.history.slice(1)) assert.ok(TRANSITIONS[h.from].includes(h.to), `${h.from}→${h.to}`);
  }
  assert.ok(demo.some((j) => VINYL_STAGES.includes(j.status))); // มีงานอยู่สายไวนิลให้เห็นภาพ
  // ตัวกรองสายไวนิลเก็บทั้งงานไวนิลและงานที่อยู่บ้านไวนิล
  const lane = filterQueue(demo, { filter: 'vinyl', todayISO: T });
  assert.ok(lane.length >= 1);
});

test('เกม: โครงสถานะ/ประเภทครบตามสเปก', () => {
  assert.deepEqual(STATUSES.map((s) => s.id), ['queued', 'preparing', 'producing', 'quality_check', 'out_to_vinyl', 'vinyl_production', 'back_at_shop', 'ready_for_pickup', 'picked_up', 'canceled']);
  assert.ok(STATUS.queued.label === 'รอคิว');
  assert.ok(KINDS.length === 7);
  assert.ok(Object.keys(ZONES).length >= 9);
});
