// อัปเดตปลั๊กอินในแผง: เทียบรุ่น + เลือกไฟล์ที่ต้องโหลดใหม่
//
//   เซิร์ฟเวอร์ของร้าน (/nesting-cut/update.json) บอกรุ่นล่าสุด + รายการไฟล์ (path, size, sha256)
//   แผงจำไว้ในไฟล์ update-state.json (ในโฟลเดอร์ปลั๊กอิน) ว่าแต่ละไฟล์เป็นรุ่นไหน → รอบหน้าโหลดเฉพาะไฟล์ที่เปลี่ยน
//   ยังไม่เคยอัปเดต (ติดตั้งจาก zip/ตัวติดตั้ง) → โหลดใหม่ทุกไฟล์ (ทั้งโฟลเดอร์ ~1 MB)
(function (root, factory) {
  if (typeof module === 'object' && module.exports && typeof window === 'undefined') {
    module.exports = factory();
  } else {
    var ns = (root.NestingCut = root.NestingCut || {});
    ns.update = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // '1.10.0' กับ '1.9.2' → 1 (ใหม่กว่า) · เทียบทีละตัวเลข ไม่ใช่ตัวอักษร
  function compareVersion(a, b) {
    var x = String(a || '0').split('.');
    var y = String(b || '0').split('.');
    for (var i = 0; i < Math.max(x.length, y.length); i++) {
      var p = parseInt(x[i], 10) || 0;
      var q = parseInt(y[i], 10) || 0;
      if (p !== q) return p > q ? 1 : -1;
    }
    return 0;
  }

  // ไฟล์ที่ต้องโหลด: ไม่มีในบันทึก หรือ sha ไม่ตรง · path แปลก ๆ (.. / ขึ้นต้นด้วย /) ไม่รับ
  function filesToFetch(info, state) {
    var known = (state && state.files) || {};
    return ((info && info.files) || []).filter(function (f) {
      return safePath(f.path) && known[f.path] !== f.sha256;
    });
  }

  function safePath(p) {
    var s = String(p || '');
    return !!s && s.charAt(0) !== '/' && !/^[A-Za-z]:/.test(s) && !/(^|\/)\.\.(\/|$)/.test(s) && !/\\/.test(s);
  }

  // บันทึกหลังอัปเดตเสร็จ: รุ่น + sha ของทุกไฟล์
  function newState(info, when) {
    var files = {};
    ((info && info.files) || []).forEach(function (f) {
      if (safePath(f.path)) files[f.path] = f.sha256;
    });
    return { version: info.version, at: when || '', files: files };
  }

  // โฟลเดอร์ที่ต้องสร้างก่อนเขียนไฟล์ (เรียงจากตื้นไปลึก ไม่ซ้ำ)
  function dirsFor(paths) {
    var out = [];
    paths.forEach(function (p) {
      var parts = String(p).split('/');
      for (var i = 1; i < parts.length; i++) {
        var d = parts.slice(0, i).join('/');
        if (out.indexOf(d) < 0) out.push(d);
      }
    });
    return out;
  }

  return { compareVersion: compareVersion, filesToFetch: filesToFetch, safePath: safePath, newState: newState, dirsFor: dirsFor };
});
