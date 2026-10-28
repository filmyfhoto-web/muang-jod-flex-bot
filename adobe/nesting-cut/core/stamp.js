// ตรายางยิงเลเซอร์: เส้นตัดรอบดวงตรา + งานแกะ (กลับด้าน / กลับสี)
//
// ธรรมเนียมไฟล์เลเซอร์: เส้นแดงบาง = ตัดขาด · พื้นดำ = ยิงแกะออก
// ตรายางต้อง “กลับด้าน” (Mirror) เพื่อให้ปั๊มออกมาอ่านถูก และ “กลับสี” (Negative)
// เพราะเลเซอร์เผาส่วนที่เป็นพื้นทิ้ง เหลือตัวหนังสือนูนไว้รับหมึก
// งานแกะแบบกลับสี = รูปทรงเส้นตัด + เส้นของงาน รวมแบบ even-odd:
//   พื้นในกรอบ (1 ชั้น) = ดำ/ยิงออก · ตัวอักษร (2 ชั้น) = ขาว/เหลือนูน · รูในตัวอักษร (3 ชั้น) = ดำ
// พิกัด มม. (y ลง) เหมือนเอนจินตัวอื่น
(function (root, factory) {
  if (typeof module === 'object' && module.exports && typeof window === 'undefined') {
    module.exports = factory(require('./geometry.js'), require('./contour.js'), require('./diecut.js'));
  } else {
    var ns = (root.NestingCut = root.NestingCut || {});
    ns.stamp = factory(ns.geometry, ns.contour, ns.diecut);
  }
})(typeof window !== 'undefined' ? window : this, function (G, C, DC) {
  'use strict';

  var SHAPES = [
    { id: 'rounded', label: 'สี่เหลี่ยมมุมมน' },
    { id: 'rect', label: 'สี่เหลี่ยม' },
    { id: 'circle', label: 'วงกลม' },
    { id: 'oval', label: 'วงรี' },
    { id: 'contour', label: 'ตามรูปทรงงาน' },
  ];

  function shift(ring, dx, dy) {
    return ring.map(function (p) {
      return [p[0] + dx, p[1] + dy];
    });
  }

  // รูปทรงเส้นตัดรอบงาน · opts: { shape, margin, radius } · box = กรอบของงาน (ใช้เมื่อไม่มีเส้นเวกเตอร์)
  function cutShape(rings, box, opts) {
    var o = opts || {};
    var m = Math.max(0, o.margin || 0);
    var b = rings && rings.length ? G.bounds(rings) : box;
    var w = b.maxX - b.minX;
    var h = b.maxY - b.minY;
    var cx = (b.minX + b.maxX) / 2;
    var cy = (b.minY + b.maxY) / 2;
    var shape = o.shape || 'rounded';
    if (shape === 'contour' && rings && rings.length) {
      var loops = C.offsetOutline(rings, { offset: Math.max(m, 0.2), join: 'round', fillHoles: true });
      var outer = loops.filter(function (lp) {
        return !lp.hole;
      });
      if (outer.length) {
        return outer.map(function (lp) {
          return lp.points;
        });
      }
      shape = 'rounded';
    }
    if (shape === 'circle') {
      // วงกลมล้อมงานทั้งหมด (ศูนย์กลางกรอบ) + ระยะขอบ
      var r = 0;
      (rings && rings.length ? rings : [[[b.minX, b.minY], [b.maxX, b.maxY]]]).forEach(function (ring) {
        ring.forEach(function (p) {
          r = Math.max(r, Math.hypot(p[0] - cx, p[1] - cy));
        });
      });
      if (!(rings && rings.length)) r = Math.hypot(w, h) / 2;
      return [shift(DC.shapeRing('circle', 2 * (r + m), 2 * (r + m)), cx, cy)];
    }
    if (shape === 'oval') {
      // วงรีผ่านมุมกรอบ (กึ่งแกน × √2) + ระยะขอบ
      return [shift(DC.shapeRing('oval', w * Math.SQRT2 + 2 * m, h * Math.SQRT2 + 2 * m), cx, cy)];
    }
    var kind = shape === 'rect' ? 'rect' : 'rounded';
    return [shift(DC.shapeRing(kind, w + 2 * m, h + 2 * m, o.radius || 0), cx, cy)];
  }

  // กลับด้านซ้าย↔ขวา รอบเส้นแนวตั้ง x = axis
  function mirror(rings, axis) {
    return rings.map(function (ring) {
      return ring
        .map(function (p) {
          return [2 * axis - p[0], p[1]];
        })
        .reverse();
    });
  }

  // งานตรายางหนึ่งดวง · opts: { shape, margin, radius, mirror, negative }
  // คืน { cut: [ring], engrave: [ring] | null, box, axis }
  function stamp(rings, box, opts) {
    var o = opts || {};
    var cut = cutShape(rings, box, o);
    var cb = G.bounds(cut);
    var axis = (cb.minX + cb.maxX) / 2;
    var art = rings || [];
    var engrave = o.negative && art.length ? cut.concat(art) : null;
    if (o.mirror) {
      cut = mirror(cut, axis);
      if (engrave) engrave = mirror(engrave, axis);
    }
    return { cut: cut, engrave: engrave, box: G.bounds(cut), axis: axis };
  }

  // จุดนี้ถูกยิงแกะออกไหม (even-odd ของงานแกะแบบกลับสี) — ใช้ในเทสต์/พรีวิว
  function isEngraved(p, engrave) {
    return G.pointInShape(p, engrave);
  }

  return { SHAPES: SHAPES, cutShape: cutShape, mirror: mirror, stamp: stamp, isEngraved: isEngraved };
});
