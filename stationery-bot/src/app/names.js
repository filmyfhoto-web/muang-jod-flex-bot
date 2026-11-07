// The app calls its admins "เจ้ปิ่น / หญิง / ฟิล์ม"; shop.json may say "พี่ปิ่น". Same person: compare without the title.
const clean = (s) => String(s ?? '').replace(/\s+/g, '').replace(/^(?:พี่|เจ้|น้อง|ครู|คุณ|แอดมิน)/, '').toLowerCase();

export const sameAdmin = (a, b) => {
  const x = clean(a);
  return x !== '' && x === clean(b);
};
