// แพ็กส่งงานจาก Photoshop → Illustrator และตัวแปลงที่ใช้ร่วมกัน
//
// Photoshop เขียนโฟลเดอร์ที่มี
//   nestingcut-pack.json  +  รูป PNG ของแต่ละชิ้น (ครอปพอดีชิ้น + เผื่อขอบ)
// เส้นตัดเก็บเป็นเบซิเยร์ในหน่วยพิกเซลของ PNG (0,0 = มุมซ้ายบน, y ลง)
// Illustrator อ่านแล้ววางรูป + วาดเส้น CutContour ตรงตำแหน่ง แล้วถือเป็นชิ้นงานพร้อมจัดวาง
(function (root, factory) {
  if (typeof module === 'object' && module.exports && typeof window === 'undefined') {
    module.exports = factory();
  } else {
    var ns = (root.NestingCut = root.NestingCut || {});
    ns.pack = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var FORMAT = 'nongploy-nestingcut-pack';
  var VERSION = 1;
  var FILE_NAME = 'nestingcut-pack.json';

  // จำนวนชิ้นจากชื่อเลเยอร์/ชื่อชิ้นงาน: "โลโก้ร้าน x20", "logo ×5", "ป้าย*3", "สติ๊กเกอร์ 50 ดวง"
  function parseQty(name) {
    var s = String(name || '').trim();
    // ตัว x ต้องมีช่องว่างนำหน้า ("box2" ไม่ใช่ 2 ชิ้น) ส่วน × กับ * ติดชื่อได้เลย
    var m = s.match(/(?:(?:^|[\s_-])x|[×*])\s*(\d{1,5})\s*$/i) || s.match(/(\d{1,5})\s*(?:ชิ้น|ดวง|แผ่น|ใบ|pcs?)\s*$/i);
    if (!m) return null;
    var n = parseInt(m[1], 10);
    return n > 0 ? n : null;
  }

  // ชื่อไฟล์ที่ปลอดภัยทั้ง Windows/macOS (ภาษาไทยได้)
  function safeFileName(name, fallback) {
    var s = String(name || '')
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60);
    return s || fallback || 'item';
  }

  // ค่าจาก descriptor ของ Photoshop → พิกเซล
  function unitToPx(v, ppi) {
    if (typeof v === 'number') return v;
    if (!v || typeof v._value !== 'number') return NaN;
    switch (v._unit) {
      case 'pixelsUnit':
        return v._value;
      case 'distanceUnit':
      case 'pointsUnit':
        return (v._value * ppi) / 72;
      case 'millimetersUnit':
        return (v._value * ppi) / 25.4;
      default:
        return v._value;
    }
  }

  function pointOf(desc, ppi) {
    if (!desc) return null;
    return [unitToPx(desc.horizontal, ppi), unitToPx(desc.vertical, ppi)];
  }

  // pathContents จาก batchPlay get ของ work path → [{ closed, points:[{a,l,r}] }] หน่วยพิกเซล
  // Photoshop: forward = มือจับขาออก (ไปจุดถัดไป) = rightDirection ของ Illustrator, backward = ขาเข้า
  // opts.width/height (พิกเซลของเอกสาร) ใช้ตรวจหน่วย: บางเวอร์ชันส่งค่าเป็นพิกเซลทั้งที่ติดป้าย distanceUnit
  function psPathToSubpaths(pathContents, opts) {
    opts = opts || {};
    var ppi = opts.ppi || 72;
    var comps = (pathContents && pathContents.pathComponents) || [];
    function build(scalePpi) {
      var out = [];
      comps.forEach(function (comp) {
        (comp.subpathListKey || comp.subpathsList || []).forEach(function (sp) {
          var pts = (sp.points || []).map(function (p) {
            var a = pointOf(p.anchor, scalePpi);
            return { a: a, l: pointOf(p.backward, scalePpi) || a.slice(), r: pointOf(p.forward, scalePpi) || a.slice() };
          });
          if (pts.length >= 2) out.push({ closed: sp.closedSubpath !== false, points: pts });
        });
      });
      return out;
    }
    var sub = build(ppi);
    if (opts.width > 0 && opts.height > 0 && ppi !== 72 && sub.length) {
      var raw = build(72); // 72 ppi = ใช้ค่าตามที่ได้มาตรง ๆ
      if (fitScore(raw, opts) > fitScore(sub, opts)) sub = raw;
    }
    return sub;
  }

  // สัดส่วนจุดยึดที่อยู่ในขอบเอกสาร (เผื่อ 5%)
  function fitScore(subpaths, o) {
    var inside = 0;
    var total = 0;
    var mx = o.width * 0.05;
    var my = o.height * 0.05;
    subpaths.forEach(function (sp) {
      sp.points.forEach(function (p) {
        total++;
        if (p.a[0] >= -mx && p.a[0] <= o.width + mx && p.a[1] >= -my && p.a[1] <= o.height + my) inside++;
      });
    });
    return total ? inside / total : 0;
  }

  function makePack(info) {
    return {
      format: FORMAT,
      version: VERSION,
      createdAt: info.createdAt || new Date().toISOString(),
      source: { app: info.app || 'photoshop', document: info.document || '' },
      ppi: info.ppi,
      items: info.items || [],
    };
  }

  function isPoint(p) {
    return Array.isArray(p) && p.length === 2 && isFinite(p[0]) && isFinite(p[1]);
  }

  // ตรวจแพ็ก — โยน Error ภาษาไทยที่บอกว่าผิดตรงไหน
  function validatePack(pack) {
    if (!pack || pack.format !== FORMAT) throw new Error('ไฟล์นี้ไม่ใช่แพ็กของนัดพอน Nesting Cut');
    if (pack.version > VERSION) throw new Error('แพ็กนี้มาจากปลั๊กอินรุ่นใหม่กว่า — อัปเดตปลั๊กอินฝั่ง Illustrator ก่อน');
    if (!(pack.ppi > 0)) throw new Error('แพ็กไม่มีค่าความละเอียด (ppi)');
    if (!Array.isArray(pack.items) || !pack.items.length) throw new Error('แพ็กนี้ไม่มีชิ้นงาน');
    pack.items.forEach(function (it, i) {
      var label = 'ชิ้นที่ ' + (i + 1) + (it && it.name ? ' (' + it.name + ')' : '');
      if (!it || !it.image) throw new Error(label + ' ไม่มีไฟล์รูป');
      if (!(it.widthPx > 0 && it.heightPx > 0)) throw new Error(label + ' ไม่มีขนาดรูป');
      if (!Array.isArray(it.cut)) throw new Error(label + ' ไม่มีเส้นตัด');
      it.cut.forEach(function (sp) {
        if (!sp || !Array.isArray(sp.points)) throw new Error(label + ' เส้นตัดเสีย');
        sp.points.forEach(function (p) {
          if (!p || !isPoint(p.a)) throw new Error(label + ' เส้นตัดมีจุดเสีย');
        });
      });
    });
    return pack;
  }

  // ชิ้นในแพ็ก → พิกัด Illustrator (pt, y ขึ้น) เมื่อวางมุมซ้ายบนของรูปไว้ที่ origin
  function itemToIllustrator(item, ppi, origin) {
    var k = 72 / ppi;
    function f(p) {
      return [origin[0] + p[0] * k, origin[1] - p[1] * k];
    }
    return {
      widthPt: item.widthPx * k,
      heightPt: item.heightPx * k,
      cut: item.cut.map(function (sp) {
        return {
          closed: sp.closed !== false,
          points: sp.points.map(function (p) {
            return { a: f(p.a), l: f(p.l || p.a), r: f(p.r || p.a) };
          }),
        };
      }),
    };
  }

  return {
    FORMAT: FORMAT,
    VERSION: VERSION,
    FILE_NAME: FILE_NAME,
    parseQty: parseQty,
    safeFileName: safeFileName,
    unitToPx: unitToPx,
    psPathToSubpaths: psPathToSubpaths,
    makePack: makePack,
    validatePack: validatePack,
    itemToIllustrator: itemToIllustrator,
  };
});
