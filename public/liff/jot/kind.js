/* จับชนิดงานจากชื่อที่พิมพ์ — เพื่อเลือก "หน่วยราคา" ให้ถูกตั้งแต่ยังไม่แตะช่องเงิน
 *
 * ร้านบอกว่า "แต่ละงานบางอันหน่วยไม่ใช่ตรม" — กรอบรูปคิดบานละ ตรายางอันละ
 * ป้ายค่อยคิดตามตารางเมตร ฟอร์มจึงต้องรู้ชนิดงานจากชื่อก่อน
 *
 * entries มาจาก /api/config (ชุดตั้งต้น ใช้ก่อนล็อกอิน) หรือ /api/categories
 * (รวมหมวด/คำค้นที่ร้านตั้งเอง) — เรียงตามลำดับการจับคำมาแล้ว รายการแรกที่เจอชนะ
 * ตรรกะต้องเหมือน classifyItem ฝั่งเซิร์ฟเวอร์ทุกประการ จะได้ไม่มีวันที่ฟอร์ม
 * กับเลขงานมองงานเดียวกันเป็นคนละชนิด
 */
(function (root) {
  // ทุกวงเล็บของ all ต้องเจออย่างน้อยหนึ่งคำ (งานสองอย่างรวมกัน เขียนสลับลำดับได้)
  function allHit(n, groups) {
    for (var i = 0; i < groups.length; i++) {
      var alts = groups[i] || [];
      var hit = false;
      for (var j = 0; j < alts.length; j++) {
        if (alts[j] && n.indexOf(String(alts[j])) !== -1) { hit = true; break; }
      }
      if (!hit) return false;
    }
    return true;
  }

  // → entry ({ keys, all?, label, price: { mode, unit } }) หรือ null เมื่อไม่รู้จัก
  function match(name, entries) {
    var n = String(name || '').toLowerCase();
    if (!n || !entries || !entries.length) return null;
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i] || {};
      if (e.all && allHit(n, e.all)) return e;
      var keys = e.keys || [];
      for (var j = 0; j < keys.length; j++) {
        if (keys[j] && n.indexOf(String(keys[j]).toLowerCase()) !== -1) return e;
      }
    }
    return null;
  }

  root.MJKind = { match: match };
})(typeof globalThis !== 'undefined' ? globalThis : this);
