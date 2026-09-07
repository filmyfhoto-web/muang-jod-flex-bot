// Guess a job category from item names so the receipt can show a friendly
// heading like "งานพิมพ์ / ป้ายโฆษณา" instead of the first item's name.
// Order matters: earlier categories win when keywords overlap.

const CATEGORIES = [
  {
    label: 'งานพิมพ์ / ป้ายโฆษณา',
    icon: '🪧',
    keys: ['ป้าย', 'ไวนิล', 'แบนเนอร์', 'โฟมบอร์ด', 'ฟิวเจอร์บอร์ด', 'อิงค์เจ็ท', 'โรลอัพ', 'x-stand', 'ตัวอักษร'],
  },
  {
    label: 'สติกเกอร์ / ฉลาก',
    icon: '🏷️',
    keys: ['สติกเกอร์', 'ฉลาก', 'label'],
  },
  {
    label: 'งานเอกสาร / ถ่ายเอกสาร',
    icon: '🖨️',
    keys: ['ถ่ายเอกสาร', 'ปริ้น', 'พิมพ์เอกสาร', 'เข้าเล่ม', 'สแกน', 'เคลือบ', 'นามบัตร', 'ใบปลิว', 'โบรชัวร์', 'แผ่นพับ'],
  },
  {
    label: 'งานออกแบบ',
    icon: '🎨',
    keys: ['ออกแบบ', 'ดีไซน์', 'โลโก้', 'artwork', 'อาร์ตเวิร์ค', 'รีทัช'],
  },
  {
    label: 'อาหาร & เครื่องดื่ม',
    icon: '☕',
    keys: ['กาแฟ', 'อาหาร', 'ขนม', 'เครื่องดื่ม', 'ข้าว', 'เบเกอรี่'],
  },
  {
    label: 'ค่าจัดส่ง / ขนส่ง',
    icon: '🚚',
    keys: ['จัดส่ง', 'ขนส่ง', 'ค่าส่ง', 'ค่ารถ', 'แมสเซนเจอร์'],
  },
];

function matchCategory(name) {
  const n = String(name || '').toLowerCase();
  if (!n) return null;
  for (const cat of CATEGORIES) {
    if (cat.keys.some((k) => n.includes(k))) return cat;
  }
  return null;
}

// Category of the first item that matches one, or null.
export function guessCategory(items = []) {
  for (const it of items) {
    const cat = matchCategory(it?.item_name);
    if (cat) return cat;
  }
  return null;
}

// Emoji for an item row.
export function itemIcon(itemName) {
  return matchCategory(itemName)?.icon || '📦';
}

// Job heading: category label when recognised, else derived from the items.
export function deriveJobName(items = []) {
  if (!items.length) return null;
  const cat = guessCategory(items);
  if (cat) return cat.label;
  if (items.length === 1) return items[0].item_name;
  return `${items[0].item_name} +${items.length - 1} รายการ`;
}
