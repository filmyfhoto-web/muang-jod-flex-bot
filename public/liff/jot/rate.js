/* วิธีคิดราคาของหนึ่งรายการ — ตารางเมตร หรือ ต่อแผ่น/ชิ้น/อัน
 *
 * ร้านถามว่า "งานสติ๊กเกอร์ต้องลงรายละเอียดอีกแบบไหม เช่น ตรม ละ ....... ได้กี่แผ่น
 * หรือ 13X19 แผ่นละ 50 บาท ค่าส่ง ....."
 *
 * ของเดิมฟอร์มมีช่องเรตช่องเดียว ป้ายว่า "ตรมละ (บาท)" ซึ่งเป็นวิธีคิดของงานป้าย
 * — ไวนิล 160×300 ตรมละ 165 คิดพื้นที่แล้วคูณ ถูกต้องสำหรับป้าย แต่สติ๊กเกอร์
 * ร้านขายเป็นแผ่น: 13×19 นิ้ว แผ่นละ 50 บาท ขนาดไม่ได้เอาไปคูณราคาเลย มันเป็น
 * แค่สเปกที่ต้องจดไว้ให้ถูก
 *
 * สองวิธีนี้จึงต้องเลือกได้ ไม่ใช่มีแค่แบบเดียวแล้วให้ร้านคิดเลขในหัวเอง
 *
 * ไฟล์นี้เป็นสูตรล้วน ๆ ที่หน้าฟอร์มกับเทสต์ใช้ตัวเดียวกัน จะได้ไม่มีวันที่ตัวเลข
 * บนจอกับตัวเลขที่เทสต์ยืนยันเป็นคนละสูตร
 */
(function (root) {
  var FACTORS = { cm: 0.01, m: 1, inch: 0.0254, ft: 0.3048 };
  var UNIT_LABELS = { cm: 'ซม.', m: 'ม.', inch: 'นิ้ว', ft: 'ฟุต' };

  // วิธีคิดราคา — id ถูกเก็บลงร่างในเครื่อง เปลี่ยนคำได้ แต่ห้ามเปลี่ยน id
  var MODES = [
    { id: 'sqm', label: 'ตร.ม. ละ', per: 'ตร.ม.', piece: 'ชิ้น' },
    { id: 'sheet', label: 'แผ่นละ', per: 'แผ่น', piece: 'แผ่น' },
    { id: 'piece', label: 'ชิ้นละ', per: 'ชิ้น', piece: 'ชิ้น' },
    { id: 'unit', label: 'อันละ', per: 'อัน', piece: 'อัน' },
    { id: 'set', label: 'ชุดละ', per: 'ชุด', piece: 'ชุด' },
  ];

  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function mode(id) {
    for (var i = 0; i < MODES.length; i++) if (MODES[i].id === id) return MODES[i];
    return MODES[0];
  }

  // พื้นที่ของหนึ่งชิ้น เป็นตารางเมตร คืน null เมื่อยังไม่ได้ใส่ขนาดครบ
  function sqmOf(w, h, unit) {
    var f = FACTORS[unit] || FACTORS.cm;
    var width = Number(w) || 0;
    var height = Number(h) || 0;
    if (!(width > 0) || !(height > 0)) return null;
    return {
      sqm: round2(width * f * (height * f)),
      label: width + ' × ' + height + ' ' + (UNIT_LABELS[unit] || UNIT_LABELS.cm),
    };
  }

  /* ราคาต่อหนึ่งชิ้นที่คิดได้จากเรต
   *
   * โหมดตารางเมตรต้องมีขนาดก่อนจึงคิดได้ ส่วนโหมดต่อแผ่น/ชิ้น เรตคือราคาเลย
   * ขนาดไม่เกี่ยว — 13×19 แผ่นละ 50 คือ 50 บาท ไม่ใช่ 50 คูณอะไร
   */
  function suggested(item) {
    var rate = Number(item && item.rate) || 0;
    if (!(rate > 0)) return 0;
    if (mode(item.rateMode).id !== 'sqm') return round2(rate);
    var size = sqmOf(item.w, item.h, item.unit);
    return size ? round2(size.sqm * rate) : 0;
  }

  /* "ตรมละ ....... ได้กี่แผ่น" — คำถามของร้านตรง ๆ
   *
   * วัสดุซื้อมาเป็นตารางเมตร แต่ตัดขายเป็นแผ่น เลยต้องรู้ว่าหนึ่งตารางเมตร
   * ได้กี่แผ่น และต้นทุนต่อแผ่นเท่าไหร่
   *
   * คิดจากพื้นที่ล้วน ๆ ซึ่ง "ไม่รวมเศษตัด" — ของจริงตัดจากม้วนกว้างคงที่
   * ย่อมเหลือเศษ ตัวเลขนี้จึงเป็นเพดานบน ไม่ใช่จำนวนที่ได้แน่ ๆ และต้องเขียน
   * บอกไว้ ไม่ใช่ปล่อยให้ร้านตั้งราคาจากเลขที่ดีกว่าความจริง
   */
  function yieldPerSqm(item) {
    var size = sqmOf(item && item.w, item && item.h, item && item.unit);
    if (!size || !(size.sqm > 0)) return null;
    var rate = Number(item && item.rate) || 0;
    return {
      sqmPerSheet: size.sqm,
      // ปัดลง เพราะครึ่งแผ่นขายไม่ได้
      sheets: Math.floor(1 / size.sqm),
      exact: round2(1 / size.sqm),
      costPerSheet: rate > 0 ? round2(size.sqm * rate) : 0,
    };
  }

  root.MJRate = {
    MODES: MODES,
    FACTORS: FACTORS,
    UNIT_LABELS: UNIT_LABELS,
    mode: mode,
    sqmOf: sqmOf,
    suggested: suggested,
    yieldPerSqm: yieldPerSqm,
    round2: round2,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
