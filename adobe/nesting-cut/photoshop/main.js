// แผงนัดพอน Nesting Cut (Photoshop, UXP)
//
// แต่ละเลเยอร์ที่เลือก:
//   1. คัดลอกไปเอกสารชั่วคราว (ไฟล์งานของร้านไม่ถูกแตะ) รวมเป็นเลเยอร์เดียว
//   2. ครอปพอดีชิ้นงาน + เผื่อขอบไว้ให้เส้นตัด
//   3. เลือกจากความโปร่งใส → ขยาย (ระยะห่างขอบ) → ทำให้นุ่ม → Make Work Path ของ Photoshop เอง
//   4. อ่านเส้นกลับมา + บันทึก PNG
// สุดท้ายเขียน nestingcut-pack.json ให้แผงของ Illustrator นำเข้าไปจัดวางต่อ
(function () {
  'use strict';

  var ps = require('photoshop');
  var app = ps.app;
  var core = ps.core;
  var batchPlay = ps.action.batchPlay;
  var constants = ps.constants;
  var lfs = require('uxp').storage.localFileSystem;
  var NC = window.NestingCut;

  var STORE_KEY = 'nongploy.nestingcut.ps.v1';
  var TOKEN_KEY = 'nongploy.nestingcut.ps.folder';
  var settings = load();
  var layers = [];
  var folder = null;
  var busy = false;

  function $(id) {
    return document.getElementById(id);
  }

  function load() {
    var s = { offset: 2, smooth: 2, tolerance: 1, qty: {} };
    try {
      var saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      for (var k in saved) s[k] = saved[k];
    } catch (e) {
      /* ค่าเริ่มต้น */
    }
    return s;
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(settings));
    } catch (e) {
      /* ไม่เป็นไร */
    }
  }

  function status(text, kind) {
    var el = $('status');
    el.textContent = text;
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  function numberOf(id, fallback) {
    var v = parseFloat($(id).value);
    return isFinite(v) && v >= 0 ? v : fallback;
  }

  // ---------------------------------------------------------------- เลเยอร์

  function refresh() {
    var doc = app.activeDocument;
    if (!doc) {
      layers = [];
      render();
      status('ยังไม่ได้เปิดไฟล์ใน Photoshop', 'err');
      return;
    }
    layers = doc.activeLayers.map(function (l) {
      var remembered = settings.qty[l.name];
      return { ref: l, name: l.name, qty: NC.pack.parseQty(l.name) || remembered || 1 };
    });
    render();
    status(layers.length ? 'ได้ ' + layers.length + ' เลเยอร์ จาก “' + doc.name + '”' : 'ยังไม่ได้เลือกเลเยอร์');
  }

  function render() {
    var box = $('layerList');
    box.innerHTML = '';
    var total = 0;
    layers.forEach(function (l) {
      total += l.qty;
      var row = document.createElement('div');
      row.className = 'layer';
      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = l.name;
      var q = document.createElement('input');
      q.type = 'number';
      q.min = '1';
      q.value = String(l.qty);
      q.addEventListener('change', function () {
        l.qty = Math.max(1, parseInt(q.value, 10) || 1);
        settings.qty[l.name] = l.qty;
        save();
        renderTotal();
      });
      row.appendChild(name);
      row.appendChild(q);
      box.appendChild(row);
    });
    renderTotal();
  }

  function renderTotal() {
    var total = layers.reduce(function (s, l) {
      return s + l.qty;
    }, 0);
    $('layerTotal').textContent = layers.length ? 'รวม ' + total + ' ชิ้น จาก ' + layers.length + ' แบบ' : '';
  }

  // ---------------------------------------------------------------- โฟลเดอร์

  function restoreFolder() {
    var token = localStorage.getItem(TOKEN_KEY);
    if (!token) return Promise.resolve();
    return lfs
      .getEntryForPersistentToken(token)
      .then(function (f) {
        folder = f;
        $('folderName').textContent = f.nativePath;
      })
      .catch(function () {
        localStorage.removeItem(TOKEN_KEY);
      });
  }

  function pickFolder() {
    return lfs.getFolder().then(function (f) {
      if (!f) return;
      folder = f;
      $('folderName').textContent = f.nativePath;
      return lfs
        .createPersistentToken(f)
        .then(function (t) {
          localStorage.setItem(TOKEN_KEY, t);
        })
        .catch(function () {});
    });
  }

  // ---------------------------------------------------------------- เส้นตัด

  var SELECTION = [{ _ref: 'channel', _property: 'selection' }];

  function readWorkPath() {
    var targets = [
      [{ _ref: 'path', _property: 'workPath' }],
      [{ _ref: 'path', _enum: 'ordinal', _value: 'targetEnum' }],
    ];
    var i = 0;
    function next() {
      if (i >= targets.length) return Promise.resolve(null);
      var t = targets[i++];
      return batchPlay([{ _obj: 'get', _target: t }], {})
        .then(function (r) {
          if (r && r[0] && r[0].pathContents) return r[0].pathContents;
          return next();
        })
        .catch(next);
    }
    return next();
  }

  function makeCutPath(o) {
    var steps = [{ _obj: 'set', _target: SELECTION, to: { _ref: 'channel', _enum: 'channel', _value: 'transparencyEnum' } }];
    if (o.offsetPx >= 1) {
      steps.push({
        _obj: 'expand',
        by: { _unit: 'pixelsUnit', _value: Math.min(500, Math.round(o.offsetPx)) },
        selectionModifyEffectAtCanvasBounds: false,
      });
    }
    if (o.smoothPx >= 1) {
      steps.push({
        _obj: 'smoothness',
        radius: { _unit: 'pixelsUnit', _value: Math.min(100, Math.round(o.smoothPx)) },
        selectionModifyEffectAtCanvasBounds: false,
      });
    }
    steps.push({
      _obj: 'make',
      _target: [{ _ref: 'path' }],
      from: { _ref: 'selectionClass', _property: 'selection' },
      tolerance: { _unit: 'pixelsUnit', _value: Math.max(0.5, Math.min(10, o.tolerancePx)) },
    });
    steps.push({ _obj: 'set', _target: SELECTION, to: { _enum: 'ordinal', _value: 'none' } });
    return batchPlay(steps, {});
  }

  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function processLayer(src, layer, index, o) {
    var tmp;
    var result = null;
    try {
      app.activeDocument = src;
    } catch (e) {
      /* รุ่นเก่าตั้งไม่ได้ก็ไม่เป็นไร */
    }
    return app.documents
      .add({
        width: src.width,
        height: src.height,
        resolution: src.resolution,
        mode: constants.NewDocumentMode.RGB,
        fill: constants.DocumentFill.TRANSPARENT,
        name: 'nongploy-temp',
      })
      .then(function (doc) {
        tmp = doc;
        return layer.ref.duplicate(tmp);
      })
      .then(function (dup) {
        if (dup && !dup.visible) dup.visible = true;
        return tmp.mergeVisibleLayers();
      })
      .then(function () {
        var b = tmp.layers[0].bounds;
        if (!(b.right - b.left >= 1 && b.bottom - b.top >= 1)) throw new Error('เลเยอร์ “' + layer.name + '” ว่างเปล่า');
        var m = Math.ceil(o.offsetPx + o.smoothPx) + 4;
        return tmp
          .crop({ left: b.left, top: b.top, right: b.right, bottom: b.bottom })
          .then(function () {
            return tmp.resizeCanvas(tmp.width + 2 * m, tmp.height + 2 * m, constants.AnchorPosition.MIDDLECENTER);
          });
      })
      .then(function () {
        return makeCutPath(o);
      })
      .then(readWorkPath)
      .then(function (contents) {
        var cut = NC.pack.psPathToSubpaths(contents, { ppi: tmp.resolution, width: tmp.width, height: tmp.height });
        if (!cut.length) throw new Error('ทำเส้นตัดของ “' + layer.name + '” ไม่สำเร็จ (เลเยอร์โปร่งใสหมด?)');
        var image = pad(index + 1) + '-' + NC.pack.safeFileName(layer.name, 'layer') + '.png';
        result = { name: layer.name, image: image, widthPx: tmp.width, heightPx: tmp.height, quantity: layer.qty, cut: cut };
        return folder.createFile(image, { overwrite: true });
      })
      .then(function (file) {
        return tmp.saveAs.png(file, { compression: 6 }, true);
      })
      .then(
        function () {
          return tmp.closeWithoutSaving().then(function () {
            return result;
          });
        },
        function (err) {
          var close = tmp ? tmp.closeWithoutSaving().catch(function () {}) : Promise.resolve();
          return close.then(function () {
            throw err;
          });
        }
      );
  }

  function go() {
    if (busy) return;
    if (!layers.length) refresh();
    if (!layers.length) return status('เลือกเลเยอร์ที่จะส่งก่อน', 'err');
    var src = app.activeDocument;
    var ppi = src.resolution;
    var pxPerMm = ppi / 25.4;
    var o = {
      offsetPx: numberOf('offset', 2) * pxPerMm,
      smoothPx: numberOf('smooth', 2),
      tolerancePx: numberOf('tolerance', 1),
    };
    settings.offset = numberOf('offset', 2);
    settings.smooth = o.smoothPx;
    settings.tolerance = o.tolerancePx;
    save();
    var items = [];
    busy = true;
    $('btnGo').disabled = true;
    var ready = folder ? Promise.resolve() : pickFolder();
    return ready
      .then(function () {
        if (!folder) throw new Error('ยังไม่ได้เลือกโฟลเดอร์สำหรับส่งงาน');
        return core.executeAsModal(
          function (ctx) {
            var chain = Promise.resolve();
            layers.forEach(function (layer, i) {
              chain = chain.then(function () {
                status('นัดพอนกำลังทำเส้นตัด “' + layer.name + '” (' + (i + 1) + '/' + layers.length + ')…');
                try {
                  ctx.reportProgress({ value: i / layers.length, commandName: 'ทำเส้นตัด ' + layer.name });
                } catch (e) {
                  /* ไม่มี progress ก็ได้ */
                }
                return processLayer(src, layer, i, o).then(function (item) {
                  items.push(item);
                });
              });
            });
            return chain;
          },
          { commandName: 'นัดพอน: ทำเส้นตัดส่ง Illustrator' }
        );
      })
      .then(function () {
        try {
          app.activeDocument = src;
        } catch (e) {
          /* ไม่เป็นไร */
        }
        var pack = NC.pack.makePack({ app: 'photoshop', document: src.name, ppi: ppi, items: items });
        NC.pack.validatePack(pack);
        return folder.createFile(NC.pack.FILE_NAME, { overwrite: true }).then(function (f) {
          return f.write(JSON.stringify(pack));
        });
      })
      .then(function () {
        var total = items.reduce(function (s, it) {
          return s + it.quantity;
        }, 0);
        status('ส่งแล้ว ' + items.length + ' แบบ (' + total + ' ชิ้น) → ' + folder.nativePath + ' ไปกด “นำเข้าจาก Photoshop” ใน Illustrator ต่อได้เลย', 'ok');
      })
      .catch(function (e) {
        console.error(e);
        status((e && e.message) || String(e), 'err');
      })
      .then(function () {
        busy = false;
        $('btnGo').disabled = false;
      });
  }

  // ---------------------------------------------------------------- เริ่ม

  $('offset').value = String(settings.offset);
  $('smooth').value = String(settings.smooth);
  $('tolerance').value = String(settings.tolerance);
  $('btnRefresh').addEventListener('click', refresh);
  $('btnFolder').addEventListener('click', function () {
    pickFolder().catch(function (e) {
      status(e.message, 'err');
    });
  });
  $('btnGo').addEventListener('click', go);

  // เลือกเลเยอร์ใหม่ใน Photoshop → อัปเดตรายการให้เอง
  try {
    ps.action.addNotificationListener(['select'], function () {
      if (!busy) refresh();
    });
  } catch (e) {
    /* ไม่มีก็กดปุ่มดึงเอง */
  }

  restoreFolder().then(function () {
    try {
      refresh();
    } catch (e) {
      status('เปิดไฟล์แล้วเลือกเลเยอร์ที่จะทำเป็นสติ๊กเกอร์');
    }
  });
})();
