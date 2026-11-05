/* ช่องที่ migration เพิ่งเพิ่ม ยังไม่มีในฐานข้อมูล
 *
 * ของเดิมเคสนี้ตกไปเป็น error 500 แล้วหน้าเว็บขึ้นว่า "บันทึกไม่สำเร็จ" เฉย ๆ
 * ปุ่มเด้งกลับที่เดิมทุกครั้ง ร้านเห็นเป็น "กดไม่ได้" โดยไม่มีอะไรบอกว่าต้อง
 * ทำอะไรถึงจะกดได้ — บอกไปตรง ๆ ดีกว่าให้เดา
 */
export function missingColumn(err, ...fields) {
  const code = String(err?.code || '');
  const text = `${err?.message || ''} ${err?.details || ''}`;
  if (!fields.some((f) => text.includes(f))) return false;
  return code === 'PGRST204' || code === '42703' || /column|schema cache/i.test(text);
}

