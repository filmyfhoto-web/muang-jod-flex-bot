import { customerKind } from './customerKind.js';
import { findGroup, OTHER_GROUP } from './category.js';
import { round2 } from './currency.js';

/* สมุดลูกค้า — งานย้อนหลัง เก็บแยกทีละเจ้า ไม่กองรวมกัน
 *
 * ร้านบอกว่า "หากมีคนมาสั่งงานเราบอกบอทให้แยกไว้แต่ละโรงเรียนงี้น่าจะหาง่ายกว่า
 * เวลาเข้าไปดูย้อนหลัง ส่วนงานหน้าร้านให้จัดเป็นงานทั่วไป แต่แยกหมวดงาน"
 *
 * สองประโยคนี้บอกว่าลูกค้าสองแบบต้องหาคนละวิธี:
 *
 *   หน่วยงาน   หาด้วย "ชื่อเจ้า" — รร.สบกอนสั่งอะไรไปบ้าง ค้างเท่าไหร่ เพราะ
 *              ต้องวางบิลและตามเก็บเป็นรายเจ้า
 *   หน้าร้าน   หาด้วย "หมวดงาน" — เดือนนี้ทำป้ายไวนิลไปกี่งาน เพราะจ่ายจบไป
 *              ตั้งแต่หน้าร้านแล้ว ชื่อคนไม่ได้ช่วยให้หาเจอ
 *
 * บัญชีรายเจ้าคิดจากชื่อลูกค้าที่มีอยู่แล้ว ไม่ได้เพิ่มตารางลูกค้าใหม่ — งานเก่า
 * ทุกใบที่ร้านจดไว้แล้วจึงเข้าสมุดได้ทันทีโดยไม่ต้องไปไล่ผูกให้ทีละใบ
 */

export const UNNAMED_ACCOUNT = 'ไม่ได้ใส่ชื่อ';

/* กุญแจของบัญชีหนึ่งเจ้า
 *
 * ตัดจุด เว้นวรรค และขีดออก เพราะชื่อเดียวกันร้านพิมพ์ได้หลายแบบ — "รร.สบกอน"
 * วันนี้ "รร สบกอน" พรุ่งนี้ "รรสบกอน" มะรืนนี้ ถ้านับเป็นคนละเจ้าก็จะได้บัญชี
 * สามใบของโรงเรียนเดียว ซึ่งแปลว่ายอดค้างที่เห็นไม่ใช่ยอดจริงสักใบ
 */
export function accountKey(name) {
  const raw = String(name ?? '').trim();
  if (!raw) return '';
  return raw.replace(/[\s.·,\-–—]/g, '').toLowerCase();
}

/* ชื่อหน่วยงานที่ร้านผูกไว้ให้ลูกค้าคนนี้ ("ครูแนน" → "รร.พระธาตุพิทยาคม")
 *
 * orgs = Map(กุญแจชื่อลูกค้า → ชื่อหน่วยงาน) จาก customer_orgs ไม่มีการผูก = ใช้ชื่อลูกค้าเดิม
 */
function asOrgMap(orgs) {
  if (orgs instanceof Map) return orgs;
  if (Array.isArray(orgs)) return new Map(orgs.map((o) => [o.customer_key, o.org_name]));
  return new Map();
}

function linkedOrg(job, links) {
  const key = accountKey(job?.customer_name);
  return (key && links.get(key)) || null;
}

// ยอดที่ยังไม่ได้เก็บของงานใบหนึ่ง — balance_due ถ้ามี ไม่งั้นคิดจากยอดลบที่จ่ายมา
export function jobOwed(job) {
  if (job?.status === 'cancelled') return 0;
  const due = Number(job?.balance_due);
  if (Number.isFinite(due)) return round2(Math.max(due, 0));
  const total = Number(job?.total) || 0;
  const paid = Number(job?.paid_amount) || 0;
  return round2(Math.max(total - paid, 0));
}

function jobMoment(job) {
  return job?.created_at || (job?.job_date ? `${job.job_date}T00:00:00+07:00` : '');
}

function groupOf(job) {
  return findGroup(job?.category) || OTHER_GROUP;
}

/* ชื่อที่จะโชว์ของบัญชีหนึ่งเจ้า — สะกดแบบที่ร้านใช้บ่อยที่สุด
 * เสมอกันให้เอาแบบที่พิมพ์ล่าสุด เพราะร้านมักแก้ให้ถูกขึ้นเรื่อย ๆ
 */
function pickName(entries) {
  const count = new Map();
  for (const { name, at } of entries) {
    const prev = count.get(name) || { n: 0, at: '' };
    count.set(name, { n: prev.n + 1, at: at > prev.at ? at : prev.at });
  }
  let best = null;
  for (const [name, info] of count) {
    if (!best || info.n > best.n || (info.n === best.n && info.at > best.at)) best = { name, ...info };
  }
  return best?.name || UNNAMED_ACCOUNT;
}

/* หน้าสมุด: บัญชีหน่วยงานรายเจ้า + งานหน้าร้านรายหมวด */
export function buildBook(jobs = [], orgsInput = null) {
  const links = asOrgMap(orgsInput);
  const people = new Map();
  const accounts = new Map();
  const cats = new Map();
  let orgOwed = 0;
  let walkinTotal = 0;

  for (const job of jobs) {
    if (!job || job.status === 'cancelled') continue;
    const total = round2(Number(job.total) || 0);
    const owed = jobOwed(job);
    const at = jobMoment(job);

    const linked = linkedOrg(job, links);
    if (linked || customerKind(job) === 'org') {
      const shown = linked || String(job.customer_name || '').trim();
      const key = accountKey(shown);
      const entry = accounts.get(key) || { key, names: [], contacts: new Set(), jobCount: 0, total: 0, owed: 0, lastAt: '', openCount: 0 };
      entry.names.push({ name: shown || UNNAMED_ACCOUNT, at });
      if (linked) entry.contacts.add(String(job.customer_name).trim());
      entry.jobCount += 1;
      entry.total = round2(entry.total + total);
      entry.owed = round2(entry.owed + owed);
      if (owed > 0) entry.openCount += 1;
      if (at > entry.lastAt) entry.lastAt = at;
      accounts.set(key, entry);
      orgOwed = round2(orgOwed + owed);
      continue;
    }

    // ลูกค้าหน้าร้านที่มีชื่อ — เก็บไว้ให้ร้านเลือกผูกกับหน่วยงานได้
    const person = String(job.customer_name || '').trim();
    if (person) {
      const pKey = accountKey(person);
      const p = people.get(pKey) || { name: person, jobCount: 0 };
      p.jobCount += 1;
      people.set(pKey, p);
    }

    const group = groupOf(job);
    const cat = cats.get(group.id) || {
      id: group.id,
      label: group.label,
      icon: group.icon,
      color: group.color || null,
      jobCount: 0,
      total: 0,
      owed: 0,
      lastAt: '',
    };
    cat.jobCount += 1;
    cat.total = round2(cat.total + total);
    cat.owed = round2(cat.owed + owed);
    if (at > cat.lastAt) cat.lastAt = at;
    cats.set(group.id, cat);
    walkinTotal = round2(walkinTotal + total);
  }

  const orgs = [...accounts.values()]
    .map(({ names, contacts, ...rest }) => ({ ...rest, name: pickName(names), contacts: [...contacts].sort() }))
    // ค้างมากอยู่บน เพราะนั่นคือเจ้าที่ต้องตามก่อน เท่ากันให้เจ้าที่เพิ่งสั่งอยู่บน
    .sort((a, b) => b.owed - a.owed || (a.lastAt < b.lastAt ? 1 : -1));

  const walkins = [...cats.values()].sort((a, b) => b.total - a.total || (a.lastAt < b.lastAt ? 1 : -1));

  return {
    orgs,
    walkins,
    people: [...people.values()].sort((a, b) => b.jobCount - a.jobCount).slice(0, 80),
    totals: {
      orgCount: orgs.length,
      orgOwed,
      walkinJobs: walkins.reduce((n, c) => n + c.jobCount, 0),
      walkinTotal,
    },
  };
}

/* หน้าบัญชีของเจ้าเดียว — งานทุกใบ แยกตามหมวดงาน
 *
 * งานแต่ละใบอยู่ของมันเอง ไม่ถูกยุบรวมเป็นก้อน เพราะร้านจะติ๊กเลือกทีละใบว่า
 * รอบนี้จะออกบิลใบไหนบ้าง
 */
export function buildAccount(jobs = [], key = '', orgsInput = null) {
  const links = asOrgMap(orgsInput);
  const want = String(key || '');
  const shownName = (j) => linkedOrg(j, links) || j.customer_name;
  const mine = jobs.filter((j) => j && j.status !== 'cancelled' && accountKey(shownName(j)) === want);
  if (!mine.length) return null;

  const groups = new Map();
  let total = 0;
  let owed = 0;

  for (const job of mine) {
    const group = groupOf(job);
    const bucket = groups.get(group.id) || {
      id: group.id,
      label: group.label,
      icon: group.icon,
      color: group.color || null,
      total: 0,
      owed: 0,
      jobs: [],
    };
    const jobTotal = round2(Number(job.total) || 0);
    const jobDue = jobOwed(job);
    bucket.total = round2(bucket.total + jobTotal);
    bucket.owed = round2(bucket.owed + jobDue);
    bucket.jobs.push({
      id: job.id,
      jobNumber: job.job_number || null,
      jobName: job.job_name || null,
      jobDate: job.job_date || null,
      total: jobTotal,
      owed: jobDue,
      // ออกบิลไปแล้วก็เลือกซ้ำไม่ได้ — ใบเดียวกันไปโผล่สองบิลไม่ได้
      billed: Boolean(job.bill_id),
      paid: jobDue === 0,
    });
    groups.set(group.id, bucket);
    total = round2(total + jobTotal);
    owed = round2(owed + jobDue);
  }

  for (const bucket of groups.values()) {
    bucket.jobs.sort((a, b) => (a.jobDate || '') < (b.jobDate || '') ? 1 : -1);
  }

  const lastAt = mine.reduce((max, j) => (jobMoment(j) > max ? jobMoment(j) : max), '');

  return {
    key: want,
    name: pickName(mine.map((j) => ({ name: String(shownName(j) || '').trim() || UNNAMED_ACCOUNT, at: jobMoment(j) }))),
    kind: mine.some((j) => linkedOrg(j, links)) ? 'org' : customerKind(mine[0]),
    jobCount: mine.length,
    total,
    owed,
    lastAt,
    groups: [...groups.values()].sort((a, b) => b.total - a.total),
  };
}
