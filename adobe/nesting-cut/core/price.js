// คิดราคาให้ลูกค้าอัตโนมัติจากผลจัดวาง
//
//   ร้านขายเป็นแผ่น (ม้วน = เมตร): ราคารวม = จำนวนแผ่น × ราคาแผ่นละ
//   ลูกค้าตกดวงละ = ราคารวม ÷ จำนวนดวงที่ได้
//
// งานดวงเดียวซ้ำ (เต็มแผ่น / ไดคัทต่อเนื่อง) ใส่ “จำนวนที่ลูกค้าสั่ง” ได้ → คิดจำนวนแผ่นให้เอง (แผ่นสุดท้ายนับเต็มแผ่น)
(function (root, factory) {
  if (typeof module === 'object' && module.exports && typeof window === 'undefined') {
    module.exports = factory();
  } else {
    var ns = (root.NestingCut = root.NestingCut || {});
    ns.price = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // ช่องว่าง / ติดลบ / พิมพ์ผิด = 0
  function pos(v) {
    var x = parseFloat(v);
    return isFinite(x) && x > 0 ? x : 0;
  }

  // o: { repeat, perSheet, sheets, roll, meters, pieces, orderQty, price }
  // คืน null ถ้ายังไม่ใส่ราคา หรือยังไม่มีชิ้นงาน
  function quote(o) {
    var perSheet = Math.floor(pos(o.perSheet));
    var order = Math.floor(pos(o.orderQty));
    var byOrder = !!(o.repeat && !o.roll && order && perSheet);
    var sheets = byOrder ? Math.ceil(order / perSheet) : pos(o.sheets);
    var pieces = byOrder ? sheets * perSheet : Math.floor(pos(o.pieces)); // ดวงที่ลูกค้าได้จริง
    var units = o.roll ? pos(o.meters) : sheets;
    var price = pos(o.price);
    if (!pieces || !units || !price) return null;
    var total = units * price;
    return {
      roll: !!o.roll,
      units: units,
      sheets: sheets,
      perSheet: perSheet,
      pieces: pieces,
      byOrder: byOrder,
      order: byOrder ? order : 0,
      spare: byOrder ? pieces - order : 0, // ดวงที่ได้เกินจากแผ่นสุดท้าย
      price: price,
      total: total,
      per: total / pieces,
    };
  }

  // 1,250 · 12.5 · 0.83 — หลักร้อยขึ้นไปไม่มีทศนิยม
  function baht(v) {
    var d = v >= 100 ? 0 : 2;
    var t = v.toFixed(d);
    if (d) t = t.replace(/\.00$/, '');
    return t.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  return { quote: quote, baht: baht };
});
