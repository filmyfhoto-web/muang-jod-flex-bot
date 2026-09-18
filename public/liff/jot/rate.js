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
    { id: 'tier', label: 'ตามช่วง ตร.ม.', per: 'ตร.ม.', piece: 'แผ่น' },
  ];

  /* ตารางราคาสติ๊กเกอร์กระดาษ ขาวมัน / ขาวด้าน — ตามที่ร้านให้มา
   *
   *   1–3 ตร.ม.      300 บาท/ตร.ม.   (เฉลี่ยแผ่นละ 50)
   *   4–9 ตร.ม.      250 บาท/ตร.ม.   (เฉลี่ยแผ่นละ 41.67)
   *   10–14 ตร.ม.    200 บาท/ตร.ม.   (เฉลี่ยแผ่นละ 33.33)
   *   15 ตร.ม.ขึ้นไป  180 บาท/ตร.ม.   (เฉลี่ยแผ่นละ 30)
   *
   * หมายเหตุบนตารางของร้าน: "เมื่อยอดรวมถึงแต่ละช่วง จะคิดราคาตามเรตของช่วงนั้น"
   * — คือคิดเรตเดียวทั้งออเดอร์ ไม่ใช่คิดเป็นขั้นบันไดทีละช่วง ซึ่งแปลว่าสั่ง
   * 10 ตร.ม. (2,000) ถูกกว่าสั่ง 9 ตร.ม. (2,250) จริง ๆ ตามตารางที่ร้านทำไว้
   *
   * ราคาพวกนี้ฝังอยู่ในโค้ด เปลี่ยนเมื่อไหร่ต้องแก้ที่นี่ที่เดียว
   */
  var STICKER_TIERS = [
    { min: 1, rate: 300 },
    { min: 4, rate: 250 },
    { min: 10, rate: 200 },
    { min: 15, rate: 180 },
  ];

  // 6 แผ่น = 1 ตร.ม. ตามหัวตารางของร้าน ใช้เมื่อยังไม่ได้ใส่ขนาดแผ่นเอง
  var SHEETS_PER_SQM = 6;

  // ป้ายช่วง: "1–3 ตร.ม." / "15 ตร.ม.ขึ้นไป" — อ่านจากจุดเริ่มของช่วงถัดไป
  function tierLabel(tiers, i) {
    var next = tiers[i + 1];
    if (!next) return tiers[i].min + ' ตร.ม.ขึ้นไป';
    return tiers[i].min + '–' + round2(next.min - 1) + ' ตร.ม.';
  }

  /* ช่วงราคาของยอดรวมหนึ่งค่า
   *
   * "เมื่อยอดรวมถึงแต่ละช่วง" = เอาช่วงที่สูงที่สุดที่ยอดไปถึง ยอดที่ยังไม่ถึง
   * ช่วงแรก (เช่น 0.5 ตร.ม.) ก็คิดเรตของช่วงแรก ไม่ใช่ปฏิเสธไม่คิดราคาให้
   */
  function tierFor(sqm, tiers) {
    var list = tiers && tiers.length ? tiers : STICKER_TIERS;
    var found = 0;
    for (var i = 0; i < list.length; i++) {
      if ((Number(sqm) || 0) >= list[i].min) found = i;
    }
    return { min: list[found].min, rate: list[found].rate, label: tierLabel(list, found), index: found };
  }

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

  /* พื้นที่ของหนึ่งแผ่น — จากขนาดที่กรอก ถ้ายังไม่กรอกก็ใช้ 6 แผ่น = 1 ตร.ม.
   *
   * ห้ามปัดตรงนี้ ตารางของร้านเขียนว่าแผ่นละ 0.1667 ตร.ม. ซึ่งคือ 1/6 พอดี
   * ปัดเหลือทศนิยมสองตำแหน่งได้ 0.17 แล้ว 6 แผ่นจะกลายเป็น 1.02 ตร.ม. —
   * ทุกยอดในตารางของร้านจะเพี้ยนสูงไป 2% ตั้งแต่แถวแรก
   * ปัดเฉพาะตอนเอาไปแสดงผลเท่านั้น
   */
  function sqmPerSheet(item) {
    var f = FACTORS[(item && item.unit) in FACTORS ? item.unit : 'cm'];
    var w = Number(item && item.w) || 0;
    var h = Number(item && item.h) || 0;
    if (w > 0 && h > 0) return w * f * (h * f);
    return 1 / SHEETS_PER_SQM;
  }

  /* ราคาของหนึ่งรายการ — ทั้งราคาต่อชิ้นและยอดรวม
   *
   * โหมดช่วงราคาคิดจาก "ยอดรวม" ก่อน แล้วค่อยหารกลับเป็นราคาต่อแผ่น ไม่ใช่
   * ทางกลับกัน — ถ้าคิดราคาต่อแผ่นก่อนแล้วคูณจำนวน ยอดจะเพี้ยนไปหลักสตางค์
   * (4 ตร.ม. = 1,000 บาท หาร 24 แผ่น = 41.67 คูณกลับได้ 1,000.08) และใบเสร็จ
   * ที่บวกไม่ลงตัวคือใบที่ร้านต้องมานั่งอธิบายลูกค้า
   *
   * opts.tierSqm — ยอดรวมที่ใช้ตัดสินช่วง เผื่องานเดียวมีสติ๊กเกอร์หลายรายการ
   * ซึ่งตารางของร้านบอกว่าให้รวมกันก่อนค่อยดูช่วง
   */
  function quote(item, opts) {
    var m = mode(item && item.rateMode);
    var qty = Number(item && item.qty) > 0 ? Number(item.qty) : 1;
    var rate = Number(item && item.rate) || 0;

    if (m.id === 'tier') {
      var per = sqmPerSheet(item);
      // ยอด ตร.ม. ปัดสี่ตำแหน่ง ไม่ใช่สอง — 24 แผ่นต้องได้ 4 ตร.ม. พอดี
      // ไม่ใช่ 4.08 ซึ่งกระโดดข้ามช่วงราคาไปเลย
      var sqm = Math.round(per * qty * 10000) / 10000;
      var lookup = (opts && Number(opts.tierSqm) > 0) ? Number(opts.tierSqm) : sqm;
      var tier = tierFor(lookup, opts && opts.tiers);
      var total = round2(sqm * tier.rate);
      return { sqm: sqm, sqmPerSheet: per, tier: tier, lookupSqm: round2(lookup), price: round2(total / qty), total: total };
    }

    var price = suggested(item);
    return { sqm: null, sqmPerSheet: null, tier: null, lookupSqm: 0, price: price, total: round2(price * qty), rate: rate };
  }

  // ยอดรวม ตร.ม. ของทุกรายการที่คิดแบบช่วงราคา — ใช้ตัดสินช่วงให้ทั้งงาน
  function tierSqmOf(items) {
    var sum = 0;
    for (var i = 0; i < (items || []).length; i++) {
      var it = items[i];
      if (mode(it && it.rateMode).id !== 'tier') continue;
      var qty = Number(it.qty) > 0 ? Number(it.qty) : 1;
      sum += sqmPerSheet(it) * qty;
    }
    return round2(sum);
  }

  root.MJRate = {
    MODES: MODES,
    STICKER_TIERS: STICKER_TIERS,
    SHEETS_PER_SQM: SHEETS_PER_SQM,
    tierFor: tierFor,
    tierLabel: tierLabel,
    sqmPerSheet: sqmPerSheet,
    quote: quote,
    tierSqmOf: tierSqmOf,
    FACTORS: FACTORS,
    UNIT_LABELS: UNIT_LABELS,
    mode: mode,
    sqmOf: sqmOf,
    suggested: suggested,
    yieldPerSqm: yieldPerSqm,
    round2: round2,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
