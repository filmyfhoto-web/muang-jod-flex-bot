// เดาชื่อลูกค้าจากชิ้นงานที่ดึงมา — ร้านไม่มีเวลากรอกช่อง “ลูกค้า”
//
//   1. ตัวหนังสือในงาน (Live Text) — เอาตัวที่ใหญ่สุด (ชื่อสินค้า/ชื่อร้านมักตัวใหญ่สุดบนฉลาก)
//      ชื่อที่ซ้ำกันหลายแบบ (หลายรส หลายสี แบรนด์เดียวกัน) ได้คะแนนเพิ่ม
//   2. ชื่อไฟล์รูปที่วางในงาน (เช่น “ร้านป้าแดง.png”)
//   3. ชื่อไฟล์งาน Illustrator (เช่น “งานป้าแดง สติ๊กเกอร์.ai” → “ป้าแดง”)
//   (ชื่อชิ้นงานใน Layers ไม่ใช้ — มักเป็นชื่อแบบ เช่น “ดาว x10” ไม่ใช่ชื่อลูกค้า)
//
// ตัดของที่ไม่ใช่ชื่อทิ้ง: เบอร์โทร · เว็บ · ราคา/น้ำหนัก · วันผลิต/หมดอายุ/ส่วนประกอบ · ชื่ออัตโนมัติของโปรแกรม (Untitled-1, IMG_1234, S__123…)
(function (root, factory) {
  if (typeof module === 'object' && module.exports && typeof window === 'undefined') {
    module.exports = factory();
  } else {
    var ns = (root.NestingCut = root.NestingCut || {});
    ns.customer = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var MAX_LEN = 40;

  var FROM = {
    text: 'ตัวหนังสือในงาน',
    file: 'ชื่อไฟล์รูป',
    doc: 'ชื่อไฟล์งาน',
  };

  // ข้อความบนฉลากที่ไม่ใช่ชื่อสินค้า/ชื่อร้าน
  var BOILER =
    /(ผลิต|หมดอายุ|ควรบริโภค|ส่วนประกอบ|ส่วนผสม|น้ำหนักสุทธิ|ปริมาณสุทธิ|ปริมาตร|วิธีใช้|วิธีทำ|คำเตือน|เก็บรักษา|ราคา|บาท|โทร|ติดต่อ|สั่งซื้อ|ที่อยู่|เลขที่|ถนน|ตำบล|อำเภอ|จังหวัด|อย\.|\bnet\s*(wt|weight)?\b|\bexp\b|\bmfg\b|\bbbe\b|\btel\b|line\s*(id)?\s*[:@]|\bid\s*line\b|facebook|\bfb\s*[:.]|instagram|\big\s*:|tiktok|shopee|lazada|www|https?:|\.com\b|\.co\.th\b|@)/i;
  // ชื่ออัตโนมัติของโปรแกรม / กล้อง / LINE (ต้องตามด้วยเลข/ช่องว่าง/จบ เช่น “Untitled-1” “IMG 1234” — “รูปหัวใจ” ไม่นับ)
  var AUTO_NAME =
    /^(?:<[^>]*>|untitled|ไม่มีชื่อ|ไม่ได้ตั้งชื่อ|group|กลุ่ม|path|เส้นทาง|layer|เลเยอร์|clipping|clip group|compound path|image|img|dsc|dcim|pxl|photo|picture|pic|รูปภาพ|รูป|ภาพ|screenshot|screen shot|ภาพหน้าจอ|line album|scan|copy|สำเนา|artwork|ตัวอย่างของนัดพอน)(?=$|[\s_\-.\d(])/i;
  var JOB_WORDS = '(?:งาน|สติ๊กเกอร์|สติกเกอร์|sticker|ฉลาก|label|ไดคัท|ไดคัต|diecut|die cut|โลโก้|logo|ไฟล์|ลูกค้า|ป้าย|ปริ้น|ปริ้นท์|print)';
  var JOB_HEAD = new RegExp('^\\s*' + JOB_WORDS + '\\s*', 'i');
  var JOB_TAIL = new RegExp('\\s*' + JOB_WORDS + '\\s*$', 'i');
  var JOB_ONLY = new RegExp('^(?:' + JOB_WORDS + '\\s*)+$', 'i');
  // คำกลาง ๆ ที่ไม่ใช่ชื่อใคร (“โลโก้ร้าน.ai” → ไม่ใช้)
  var GENERIC = /^(?:ร้าน|ร้านค้า|shop|store|บริษัท|company|ลูกค้า|customer|โลโก้|logo|ใหม่|new|test|ทดสอบ)$/i;
  var NOISE_TAIL = /[\s_.-]*(\(\d+\)|copy|สำเนา|final|ล่าสุด|แก้|edit|v\d+|ver\.?\s*\d+|\d{3,}|\d+\s*[x×]\s*\d+(\s*(cm|ซม|mm|มม)\.?)?)\s*$/i;

  function letters(s) {
    var m = s.match(/[a-zA-Zก-ฮ]/g);
    return m ? m.length : 0;
  }

  // ทำข้อความให้เรียบ: ขึ้นบรรทัด/ช่องว่างซ้อน → ช่องเดียว · ตัดเครื่องหมายหัวท้าย · ยาวเกินตัดที่คำ
  function tidy(s) {
    var t = String(s == null ? '' : s)
      .replace(/[\r\n\t\u0003]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[\s"'“”‘’«»()[\]{}*•·:;,.!?\-–—_|/\\]+|[\s"'“”‘’«»()[\]{}*•·:;,.!?\-–—_|/\\]+$/g, '');
    if (t.length > MAX_LEN) {
      var cut = t.lastIndexOf(' ', MAX_LEN);
      t = t.slice(0, cut > MAX_LEN / 2 ? cut : MAX_LEN);
    }
    return t;
  }

  function junk(s) {
    if (!s || letters(s) < 2) return true;
    if (GENERIC.test(s) || JOB_ONLY.test(s)) return true;
    if (BOILER.test(s)) return true;
    if (AUTO_NAME.test(s) || /^[\d\s.,-]+$/.test(s)) return true;
    if (/\d{2,3}[\s-]?\d{3}[\s-]?\d{3,4}/.test(s)) return true; // เบอร์โทร
    if (/^\d+([.,]\d+)?\s*(g|kg|ml|l|กรัม|กก|มล|ลิตร|ซีซี|cc|ชิ้น|ดวง|แผ่น|ซอง|ขวด|กล่อง|%)\.?$/i.test(s)) return true; // ราคา/น้ำหนัก
    return false;
  }

  // ชื่อไฟล์ → ชื่อคน: ตัดโฟลเดอร์ นามสกุล ขีด/ขีดล่าง เลขท้าย “copy” “final” ขนาดงาน
  function fromFileName(name) {
    var t = String(name || '')
      .split(/[\\/]/)
      .pop()
      .replace(/\.[a-z0-9]{2,5}$/i, '')
      .replace(/[_]+/g, ' ')
      .replace(/\s*-\s*/g, ' ');
    for (var i = 0; i < 4; i++) t = t.replace(NOISE_TAIL, '');
    // คำบอกประเภทงานหัว/ท้ายชื่อไฟล์ (“งานป้าแดง สติ๊กเกอร์” → “ป้าแดง”) — เหลือสั้นเกินไปใช้ชื่อเดิม
    var bare = t;
    for (var j = 0; j < 3; j++) bare = bare.replace(JOB_HEAD, '').replace(JOB_TAIL, '');
    bare = tidy(bare);
    if (GENERIC.test(bare)) return '';
    return letters(bare) >= 2 ? bare : tidy(t);
  }

  function key(s) {
    return s.toLowerCase().replace(/\s+/g, '');
  }

  // ตัวหนังสือในงานทุกแบบ → เลือกชื่อที่ใหญ่สุด (ซ้ำหลายแบบได้คะแนนเพิ่ม)
  function fromTexts(parts) {
    var best = {};
    parts.forEach(function (p, pi) {
      (p.texts || []).forEach(function (tx) {
        var s = tidy(tx && tx.s);
        if (junk(s)) return;
        var h = Math.max(0, Number(tx.h) || 0);
        var k = key(s);
        var b = best[k] || (best[k] = { name: s, h: 0, parts: {} });
        b.h = Math.max(b.h, h);
        b.parts[pi] = true;
      });
    });
    var pick = null;
    var top = -1;
    Object.keys(best).forEach(function (k) {
      var b = best[k];
      var n = Object.keys(b.parts).length;
      var score = (b.h || 1) * (1 + 0.6 * (n - 1));
      if (score > top) {
        top = score;
        pick = b.name;
      }
    });
    return pick;
  }

  function firstGood(list, clean) {
    var seen = {};
    for (var i = 0; i < list.length; i++) {
      var s = clean(list[i]);
      if (junk(s) || seen[key(s)]) continue;
      seen[key(s)] = true;
      return s;
    }
    return null;
  }

  // scan = ผลจาก np_scan: { document, parts: [{ name, texts: [{ s, h }], files: [ชื่อไฟล์] }] }
  // → { name, from: 'text'|'file'|'doc', fromText } หรือ null ถ้าเดาไม่ได้
  function guess(scan) {
    var parts = (scan && scan.parts) || [];
    var files = [];
    parts.forEach(function (p) {
      (p.files || []).forEach(function (f) {
        files.push(f);
      });
      if (p.typename === 'PlacedItem' && p.name) files.push(p.name);
    });
    var tries = [
      ['text', fromTexts(parts)],
      ['file', firstGood(files, fromFileName)],
      ['doc', firstGood([(scan && scan.document) || ''], fromFileName)],
    ];
    for (var i = 0; i < tries.length; i++) {
      if (tries[i][1]) return { name: tries[i][1], from: tries[i][0], fromText: FROM[tries[i][0]] };
    }
    return null;
  }

  return { guess: guess, tidy: tidy, junk: junk, fromFileName: fromFileName, FROM: FROM };
});
