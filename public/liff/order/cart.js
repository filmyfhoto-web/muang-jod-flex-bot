/* ตะกร้าของหน้าสร้างคำสั่งซื้อ — สูตรล้วน ๆ ที่หน้าเว็บกับเทสต์ใช้ตัวเดียวกัน
 *
 * ร้านอยากได้หน้าสั่งของแบบ Pancake: กดเลือกสินค้าจากรายการ ใส่จำนวน ราคา
 * แล้วกดสร้างคำสั่งซื้อ ไม่ต้องพิมพ์ประโยคให้ม่วงแยก
 *
 * ยอดเงินที่บันทึกจริงเซิร์ฟเวอร์บวกใหม่เองเสมอ (POST /api/jobs) ตัวเลขในไฟล์นี้
 * มีไว้ให้จอโชว์ตรงกับที่เซิร์ฟเวอร์จะได้ — ปัดสองตำแหน่งแบบเดียวกัน
 */
(function (root) {
  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  // ชื่อเดียวกันหน่วยเดียวกันคือของชิ้นเดียวกัน กดซ้ำ = เพิ่มจำนวน ไม่ใช่แถวใหม่
  function keyOf(item) {
    return (String(item.name || '').trim() + '|' + String(item.unit || '').trim()).toLowerCase();
  }

  function add(lines, item) {
    var k = keyOf(item);
    for (var i = 0; i < lines.length; i++) {
      if (keyOf(lines[i]) === k) {
        var copy = lines.slice();
        copy[i] = Object.assign({}, lines[i], { qty: round2((Number(lines[i].qty) || 0) + 1) });
        return copy;
      }
    }
    return lines.concat([
      {
        name: String(item.name || '').trim(),
        unit: String(item.unit || '').trim(),
        size: String(item.size || '').trim(),
        qty: 1,
        price: Number(item.price) > 0 ? round2(item.price) : 0,
      },
    ]);
  }

  function lineTotal(line) {
    return round2((Number(line.qty) || 0) * (Number(line.price) || 0));
  }

  /* ยอดของทั้งออเดอร์
   *
   * ส่วนลดเกินยอดไม่ได้ ที่จ่ายแล้วเกินยอดสุทธิไม่ได้ — เซิร์ฟเวอร์ตัดแบบเดียวกัน
   * จอจึงไม่โชว์ "ค้างชำระ −50" ที่ไม่มีวันเกิดขึ้นจริง
   */
  function totals(lines, opts) {
    var o = opts || {};
    var subtotal = round2(lines.reduce(function (s, l) { return s + lineTotal(l); }, 0));
    var discount = round2(Math.min(Math.max(Number(o.discount) || 0, 0), subtotal));
    var total = round2(subtotal - discount);
    var paid = round2(Math.min(Math.max(Number(o.paid) || 0, 0), total));
    return { subtotal: subtotal, discount: discount, total: total, paid: paid, due: round2(total - paid), count: lines.length };
  }

  // แถวที่บันทึกได้ — ไม่มีชื่อหรือจำนวนเป็นศูนย์ เซิร์ฟเวอร์ปฏิเสธทั้งใบ จึงคัดออกก่อน
  function toItems(lines) {
    return lines
      .filter(function (l) { return String(l.name || '').trim() && Number(l.qty) > 0; })
      .map(function (l) {
        return {
          item_name: String(l.name).trim().slice(0, 200),
          size: String(l.size || '').trim() || null,
          quantity: round2(l.qty),
          unit: String(l.unit || '').trim() || null,
          unit_price: round2(Math.max(Number(l.price) || 0, 0)),
        };
      });
  }

  /* "ขายบ่อย" — ของที่ร้านเคยจด เรียงตามจำนวนครั้ง พร้อมราคาต่อหน่วยครั้งล่าสุด
   *
   * งานมาเรียงใหม่ → เก่า ราคาตัวแรกที่เจอจึงเป็นราคาล่าสุด ไม่ใช่ราคาเฉลี่ย —
   * ร้านขึ้นราคาไปแล้วก็ต้องได้ราคาใหม่ ไม่ใช่ค่ากลางที่ไม่มีใครตั้ง
   */
  function frequentFrom(jobs, limit) {
    var map = new Map();
    (jobs || []).forEach(function (job) {
      (job.items || []).forEach(function (it) {
        var name = String(it.item_name || '').trim();
        if (!name) return;
        var item = { name: name, unit: String(it.unit || '').trim(), size: String(it.size || '').trim() };
        var k = keyOf(item);
        var hit = map.get(k);
        if (hit) hit.count += 1;
        else map.set(k, Object.assign(item, { price: round2(it.unit_price), count: 1 }));
      });
    });
    return Array.from(map.values())
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, limit || 24);
  }

  root.OrderCart = { round2: round2, add: add, lineTotal: lineTotal, totals: totals, toItems: toItems, frequentFrom: frequentFrom };
})(typeof globalThis !== 'undefined' ? globalThis : this);
