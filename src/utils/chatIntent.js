import { extractCustomer } from './nlParser.js';

// Talking to the bot in sentences, not commands.
//
// "ม่วง จดงานให้หน่อย" is how a person actually opens a conversation, and it
// used to land on the catch-all "พิมพ์งานมาได้เลย" reply, which reads as not
// having been heard. "ชื่อลูกค้า ผู้ใหญ่สมศรี" is the other half: the shop
// names the customer first and gives the work after, the way they would tell a
// person, and expects the name to be held in the meantime.
//
// Only these two shapes are recognised. Everything else falls through to the
// existing parser, which is the thing that actually reads jobs — a chattier
// guess here would start swallowing job text.

const MUANG = '(?:ม่วง(?:จด(?:ให้)?)?)';
const PLEASE = '(?:\\s*(?:หน่อย|ที|ด้วย|ให้ที|นะ|น๊า|ค่ะ|คะ|ครับ|จ้า|จ้ะ)\\s*)*';

// "ม่วง จดงานให้หน่อย" / "จดงานให้หน่อย" / "ช่วยจดงานที" / "ม่วงจดให้หน่อย"
const START_JOB = new RegExp(
  `^${MUANG}?\\s*(?:ช่วย)?\\s*(?:จด(?:งาน)?(?:ให้)?|บันทึกงาน|ลงงาน)${PLEASE}$`,
  'i'
);

// "ชื่อลูกค้า X" / "ลูกค้าชื่อ X" / "ลูกค้า X" / "งานของ X"
// The label is required: a bare name is indistinguishable from a job.
const CUSTOMER = new RegExp(
  `^${MUANG}?\\s*(?:ช่วย)?\\s*(?:จด|บันทึก)?\\s*` +
    '(?:ชื่อลูกค้า|ลูกค้าชื่อ|ลูกค้า|งานของ|ของลูกค้า)\\s*(?:คือ|ชื่อ)?\\s*(.+)$',
  'i'
);

// Politeness that would otherwise end up inside the name.
const TRAILING = /(?:\s*(?:หน่อย|ที|ด้วย|นะคะ|นะครับ|นะ|ค่ะ|คะ|ครับ|จ้า|จ้ะ|ค๊า))+$/i;

function tidy(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanName(raw) {
  const name = tidy(raw).replace(TRAILING, '').replace(/[.,、]+$/, '').trim();
  // A "name" this long is a sentence, and a one-character one is a slip.
  return name.length >= 2 && name.length <= 80 ? name : null;
}

// Returns { kind: 'start_job' } | { kind: 'set_customer', customerName, rest }
// | null. `rest` is anything the shop typed after the name on the same line —
// "ลูกค้า ผู้ใหญ่สมศรี ป้ายไวนิล 500" is one message doing both jobs, and
// throwing the work away because a name came first would be worse than useless.
export function parseChatIntent(text) {
  const clean = tidy(text);
  if (!clean) return null;

  if (START_JOB.test(clean)) return { kind: 'start_job' };

  const m = CUSTOMER.exec(clean);
  if (!m) return null;

  const after = tidy(m[1]);
  if (!after) return null;

  // Where the name stops and the work starts has no marker, so let the job
  // parser's own name-finder decide — it knows the honorifics (ผู้ใหญ่, ป้า,
  // รพ.สต., โรงเรียน…) and the words that are never a name. Splitting on word
  // count here instead turned "ผู้ใหญ่สมศรี ป้ายไวนิล 500" into a customer
  // called "ผู้ใหญ่สมศรี ป้ายไวนิล".
  const found = extractCustomer(after);
  if (found.customerName) {
    const name = cleanName(found.customerName);
    if (name) return { kind: 'set_customer', customerName: name, rest: tidy(found.rest) || null };
  }

  // No honorific to go on. A short phrase with no numbers in it is a name;
  // anything longer is a name plus work, and only the first word is safe.
  const words = after.split(' ');
  const plain = words.length <= 3 && !/\d/.test(after) ? after : words[0];
  const name = cleanName(plain);
  if (!name) return null;

  const rest = tidy(after.slice(plain.length));
  return { kind: 'set_customer', customerName: name, rest: rest || null };
}
