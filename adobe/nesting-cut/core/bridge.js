// แปลงระหว่างพิกัดของ Illustrator กับพิกัดของเอนจิน
//
// Illustrator: pt, y ชี้ขึ้น (พิกัดเอกสาร)
// เอนจิน:      mm, y ชี้ลง (พิกัดแผ่น (0,0) = มุมซ้ายบน)
//
// จุด p ของชิ้นงาน (พิกัด Illustrator) → เอนจินใช้ e(p) = (x·k, −y·k), k = 25.4/72
// ผลจัดวาง: q = R(θ)·e(p) + t  (mm บนแผ่น)
// กลับไปที่อาร์ตบอร์ดที่มุมซ้ายบนอยู่ที่ (L, T):  Q = (L + q.x/k, T − q.y/k)
// รวมแล้ว Q = R(−θ)·p + (L + t.x/k, T − t.y/k)  → ใน Illustrator คือ "หมุน −θ แล้วเลื่อน"
(function (root, factory) {
  if (typeof module === 'object' && module.exports && typeof window === 'undefined') {
    module.exports = factory(require('./geometry.js'));
  } else {
    var ns = (root.NestingCut = root.NestingCut || {});
    ns.bridge = factory(ns.geometry);
  }
})(typeof window !== 'undefined' ? window : this, function (G) {
  'use strict';

  var K = 25.4 / 72; // mm ต่อ pt

  function aiToEngine(p) {
    return [p[0] * K, -p[1] * K];
  }

  // เส้นเบซิเยร์จาก Illustrator → วงของเอนจิน (mm) ตัดเส้นเปิดทิ้ง (ไม่มีพื้นที่ให้จัดวาง)
  function subpathsToRings(subpaths, tolPt) {
    var rings = [];
    (subpaths || []).forEach(function (sp) {
      if (!sp || sp.closed === false || !sp.points || sp.points.length < 2) return;
      var poly = G.dedupe(G.flattenBezier(sp.points, true, tolPt || 0.25));
      if (poly.length >= 3) rings.push(poly.map(aiToEngine));
    });
    return rings;
  }

  // เส้นเปิดก็เอาไปทำไฟล์ตัดได้ (เช่นเส้นปรุ)
  function subpathsToPolylines(subpaths, tolPt) {
    return (subpaths || [])
      .filter(function (sp) {
        return sp && sp.points && sp.points.length >= 2;
      })
      .map(function (sp) {
        var closed = sp.closed !== false;
        return { closed: closed, points: G.dedupe(G.flattenBezier(sp.points, closed, tolPt || 0.25)).map(aiToEngine) };
      });
  }

  // ผลจัดวางของเอนจิน → คำสั่งสำหรับ host.jsx (pt, สัมพัทธ์กับมุมซ้ายบนของอาร์ตบอร์ด)
  function placementForIllustrator(pl) {
    return { angle: -pl.angle || 0, tx: pl.tx / K, ty: pl.ty / K };
  }

  // สิ่งที่ host.jsx ทำกับจุดหนึ่งจุด (ใช้ในเทสต์ยืนยันว่าตรงกับเอนจิน)
  function applyIllustratorPlacement(p, cmd, artboardLeft, artboardTop) {
    var r = G.rotatePoint(p, cmd.angle);
    return [r[0] + artboardLeft + cmd.tx, r[1] + artboardTop - cmd.ty];
  }

  // พิกัดแผ่น (mm) → พิกัดสัมพัทธ์อาร์ตบอร์ดของ host.jsx (pt, y ลง)
  function sheetToPt(v) {
    return v / K;
  }

  return {
    MM_PER_PT: K,
    aiToEngine: aiToEngine,
    subpathsToRings: subpathsToRings,
    subpathsToPolylines: subpathsToPolylines,
    placementForIllustrator: placementForIllustrator,
    applyIllustratorPlacement: applyIllustratorPlacement,
    sheetToPt: sheetToPt,
  };
});
