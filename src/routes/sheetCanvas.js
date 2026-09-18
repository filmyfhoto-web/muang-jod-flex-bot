/* เครื่องมือวาด "กระดาษหนึ่งใบ" ลงแคนวาส ใช้ร่วมกันระหว่างใบเสร็จกับใบสรุป
 *
 * แยกออกมาเพราะบทเรียนเรื่อง ctx.textAlign ต้องไม่ต้องเรียนใหม่อีกครั้งบนหน้า
 * ที่สอง — ร้านส่งภาพมาว่า "ยอดเด้งไม่ตรงกรอบ" เพราะเบราว์เซอร์ในแอปไลน์บน
 * เครื่องของร้านไม่สนใจค่า textAlign ที่โค้ดตั้งไว้ ทุกยอดเลยถูกวาดชิดซ้ายจาก
 * ขอบขวาแล้ววิ่งออกนอกกระดาษ ถ้าปล่อยให้แต่ละหน้าเขียนฟังก์ชันจัดชิดขวาเอง
 * หน้าใหม่ก็จะพลาดแบบเดิมได้อีก
 *
 * เป็นสตริงของสคริปต์ ไม่ใช่โมดูล เพราะโค้ดนี้รันในเบราว์เซอร์ของลูกค้าที่เปิด
 * ลิงก์ใบเสร็จ — หน้าพวกนี้ไม่โหลดอะไรจาก CDN เลย ใบเสร็จต้องใช้ได้ทันทีที่
 * ต้องใช้
 */
export const SHEET_CANVAS_JS = String.raw`
var MJSheet = (function () {
  function font(ctx, weight, size) {
    ctx.font = weight + ' ' + size + "px 'Noto Sans Thai', -apple-system, sans-serif";
  }

  // ตัดบรรทัดให้พอดีความกว้าง ชื่องานยาว ๆ จะได้ซ้อนลงมาแทนที่จะวิ่งออกนอกรูป
  function wrap(ctx, text, maxWidth) {
    var words = String(text).split(/\s+/).filter(Boolean);
    if (!words.length) return [''];
    var lines = [], line = words[0];
    for (var i = 1; i < words.length; i++) {
      var next = line + ' ' + words[i];
      if (ctx.measureText(next).width <= maxWidth) line = next;
      else { lines.push(line); line = words[i]; }
    }
    lines.push(line);
    // คำเดียวยาว ๆ ที่ไม่มีช่องว่างให้ตัด ยังล้นได้อยู่ — ตัดทีละตัวอักษร
    var out = [];
    for (var j = 0; j < lines.length; j++) {
      var l = lines[j];
      while (ctx.measureText(l).width > maxWidth && l.length > 1) {
        var k = l.length;
        while (k > 1 && ctx.measureText(l.slice(0, k)).width > maxWidth) k--;
        out.push(l.slice(0, k));
        l = l.slice(k);
      }
      out.push(l);
    }
    return out;
  }

  // ข้อความที่มีที่ให้แค่ n บรรทัด ตัดแล้วบอกว่าตัด ไม่ใช่หายไปเฉย ๆ
  function clip(ctx, text, maxWidth, maxLines) {
    var lines = wrap(ctx, text, maxWidth);
    if (lines.length <= maxLines) return lines;
    var kept = lines.slice(0, maxLines);
    var last = kept[maxLines - 1];
    while (last.length > 1 && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
    kept[maxLines - 1] = last + '…';
    return kept;
  }

  /* วางตัวเลขเอง ไม่พึ่ง ctx.textAlign
   *
   * วัดความกว้างเองแล้วลบออกจากขอบขวา ซึ่งได้ผลเท่ากันทุกเบราว์เซอร์ และไม่มี
   * ค่าอะไรค้างไว้ให้ลืมตั้งกลับ
   */
  function textRight(ctx, text, rightX, y, minX) {
    var s = String(text);
    var x = rightX - ctx.measureText(s).width;
    // ยอดที่ยาวจนล้นไปทับชื่อ ให้หยุดที่ขอบซ้ายที่ยอมได้ ดีกว่าไปทับกัน
    if (minX != null && x < minX) x = minX;
    ctx.fillText(s, x, y);
  }

  function textCenter(ctx, text, centerX, y) {
    var s = String(text);
    ctx.fillText(s, centerX - ctx.measureText(s).width / 2, y);
  }

  function roundRect(ctx, x, y, w, h, r, fill) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  return {
    font: font, wrap: wrap, clip: clip,
    textRight: textRight, textCenter: textCenter, roundRect: roundRect,
  };
})();
`;

/* ปุ่ม "บันทึกเป็นรูป" ทั้งชุด: ทำรูป → เปิดดู → แชร์/บันทึก
 *
 * เบราว์เซอร์ในแอป LINE ไม่ยอมให้ดาวน์โหลดจาก data: URL — มันอ่านว่ากำลังจะ
 * เปิดแอปข้างนอก แล้วเด้งถามว่า "อนุญาต / ไม่อนุญาต" ซึ่งกดยังไงก็ไม่ได้ไฟล์
 * ทางที่มีอยู่จริงบนมือถือคือ share sheet ของเครื่อง ซึ่งมีทั้ง "บันทึกรูป" และ
 * "ส่งเข้าแชตไลน์" ในที่เดียว — ตรงกับสิ่งที่ร้านจะทำต่ออยู่แล้ว
 *
 * ตัวเรียกส่งฟังก์ชัน draw() ที่คืน data URL มาให้ ที่เหลือเหมือนกันทุกหน้า
 */
export const SHEET_SHOT_JS = String.raw`
var MJShot = (function () {
  function mount(opts) {
    var shot = document.getElementById('shot');
    var img = document.getElementById('shot-img');
    var dl = document.getElementById('shot-dl');
    var share = document.getElementById('shot-share');
    var hint = document.getElementById('shot-hint');
    var frame = document.getElementById('shot-frame');
    var btn = document.getElementById(opts.button || 'make');
    if (!shot || !img || !btn) return;

    // แตะรูปเพื่อสลับ "พอดีจอ" กับ "ขนาดจริง" — ย่อให้พอดีจอกว้าง 360 จุด
    // ตัวเลขเหลือครึ่งเดียวของที่วาดไว้ ซึ่งร้านบอกว่ามองไม่เห็น
    //
    // ขยายแล้วเลื่อนไปทางขวาสุด ไม่ใช่กึ่งกลาง — ที่กดขยายเพราะอยากอ่านตัวเลข
    // และตัวเลขอยู่ชิดขวาทั้งหมด กึ่งกลางคือช่องว่างระหว่างชื่อของกับราคา
    frame.onclick = function () {
      if (!img.src) return;
      var zoomed = frame.classList.toggle('zoom');
      if (zoomed) frame.scrollLeft = frame.scrollWidth - frame.clientWidth;
    };

    // กรอบสูงเท่าสัดส่วนของรูปจริง เพื่อให้ object-fit:contain มีที่พอดีใบ
    // ไม่มีขอบว่างบนล่าง และไม่มีวันตัดขอบขวาทิ้งไม่ว่ากรอบจะกว้างเท่าไหร่
    img.addEventListener('load', function () {
      if (!img.naturalWidth || !img.naturalHeight) return;
      // ตั้งเป็นตัวแปร ไม่ใช่ style ตรง ๆ ไม่งั้นตอนกดขยาย inline style จะชนะ
      // กฎ .zoom แล้วกรอบจะยังสูงเท่าเดิมทั้งที่รูปกว้างขึ้นเป็นสองเท่า
      frame.style.setProperty('--ar', img.naturalWidth + ' / ' + img.naturalHeight);
    });

    function fileOf(dataUrl) {
      var bin = atob(dataUrl.split(',')[1]);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new File([bytes], (dl.getAttribute('download') || 'sheet.png'), { type: 'image/png' });
    }

    function canShareFiles(file) {
      try {
        return Boolean(navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share);
      } catch (e) {
        return false;
      }
    }

    if (share) {
      share.onclick = async function () {
        if (!img.src) return;
        var file;
        try { file = fileOf(img.src); } catch (e) { file = null; }

        if (file && canShareFiles(file)) {
          try {
            await navigator.share({ files: [file], title: opts.title || 'ใบสรุป' });
            return;
          } catch (e) {
            // กดยกเลิกเองไม่ใช่ความผิดพลาด อย่าไปบอกว่าพัง
            if (e && e.name === 'AbortError') return;
          }
        }

        // แชร์ไม่ได้ ก็ลองดาวน์โหลดตรง ๆ ซึ่งได้ผลบนคอมและ Chrome ของแอนดรอยด์
        dl.click();
        if (hint) {
          hint.innerHTML =
            'ถ้ายังบันทึกไม่ได้ ให้ <b>แตะรูปค้างไว้</b> แล้วเลือก “บันทึกรูปภาพ” ค่ะ<br />' +
            'หรือเปิดหน้านี้ในเบราว์เซอร์ปกติ (ปุ่ม ⋯ มุมขวาบน) แล้วกดอีกครั้งนะคะ 💜';
        }
      };
    }

    btn.onclick = async function () {
      btn.disabled = true;
      var label = btn.textContent;
      btn.textContent = 'กำลังทำรูป…';
      try {
        // วาดหลังฟอนต์ไทยมาแล้ว ไม่งั้นตัวหนังสือจะกลายเป็นฟอนต์สำรอง
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
        var url = opts.draw();
        img.src = url;
        dl.href = url;
        frame.classList.remove('zoom');
        shot.hidden = false;
        shot.scrollTop = 0;
      } catch (e) {
        btn.textContent = 'ทำรูปไม่สำเร็จ ลองใหม่อีกครั้งนะคะ';
        setTimeout(function () { btn.textContent = label; btn.disabled = false; }, 2200);
        return;
      }
      btn.textContent = label;
      btn.disabled = false;
    };

    var close = document.getElementById('shot-close');
    if (close) close.onclick = function () { shot.hidden = true; };
  }

  return { mount: mount };
})();
`;

/* หน้าตาของชั้นดูรูป เหมือนกันทั้งใบเสร็จและใบสรุป
 *
 * ของเดิมจับรูปยัดให้พอดีจอด้วย max-height ซึ่งบนมือถือแปลว่ารูปกว้าง 1440 จุด
 * ถูกย่อเหลือ ~354 จุด ตัวหนังสือเลยเล็กจนอ่านไม่ออก ตอนนี้ให้รูปเต็มความกว้าง
 * แล้วเลื่อนดูส่วนที่เกินจอแทน — ยาวไม่ใช่ปัญหา เล็กสิเป็น
 *
 * กรอบใช้ aspect-ratio เท่ารูปจริง + object-fit:contain ต่อให้เบราว์เซอร์คิด
 * ความกว้างของกรอบพลาด ทั้งใบก็ยังอยู่ในกรอบเสมอ อย่างแย่ที่สุดคือมีขอบว่าง
 * ไม่ใช่เลขทางขวาหายไป
 */
export const SHEET_SHOT_CSS = `
  .shot{position:fixed;inset:0;background:rgba(31,41,55,.97);z-index:9;overflow:auto;
        overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:14px 14px 0}
  .shot .wrap{max-width:560px;margin:0 auto}
  .shot .frame{overflow:hidden;border-radius:12px;aspect-ratio:var(--ar,auto);
        box-shadow:0 8px 30px rgba(0,0,0,.35);background:#fff;line-height:0;cursor:zoom-in}
  .shot .frame img{width:100%;max-width:100%;height:100%;object-fit:contain;display:block}
  .shot .frame.zoom{overflow-x:auto;aspect-ratio:auto;cursor:zoom-out}
  .shot .frame.zoom img{width:200%;max-width:none;height:auto;object-fit:fill}
  .shot p{margin:0;color:#fff;font-size:13.5px;text-align:center;line-height:1.5}
  .shot .bar{position:sticky;bottom:0;padding:12px 0 14px;
        display:flex;flex-direction:column;gap:10px;align-items:center;
        background:linear-gradient(180deg,rgba(31,41,55,0),rgba(31,41,55,.94) 30%)}
  .shot .row{display:flex;gap:10px;width:100%}
  .shot a,.shot button{flex:1;text-align:center;padding:12px;border:0;border-radius:12px;font:inherit;
        font-weight:700;font-size:14.5px;text-decoration:none}
  .shot button{background:#fff;color:#1f2937}
  .shot [hidden]{display:none}
`;
