// สะพานระหว่างแผง (CEP / Chromium) กับ Illustrator (ExtendScript)
//
// ไม่ต้องพึ่ง CSInterface.js — ใช้ window.__adobe_cep__ กับ window.cep.fs ที่ CEP ใส่มาให้ทุกแผงอยู่แล้ว
// ถ้าเปิดหน้านี้ในเบราว์เซอร์ธรรมดา (ไม่มี __adobe_cep__) main.js จะใช้ NPDemoHost แทน
(function (root) {
  'use strict';

  var cepApi = root.__adobe_cep__;
  if (!cepApi) return;

  // โฟลเดอร์ของปลั๊กอิน (มาจากที่อยู่ของหน้านี้เอง)
  function extensionRoot() {
    var p = decodeURIComponent(root.location.pathname);
    p = p.replace(/\/[^/]*$/, '');
    if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1); // Windows: /C:/... → C:/...
    return p;
  }

  // ExtendScript อ่านสคริปต์ด้วย code page ของเครื่อง — ส่งเป็น ASCII ล้วน (\uXXXX) กันภาษาไทยเพี้ยน
  function toAscii(s) {
    return s.replace(/[\u007f-\uffff]/g, function (c) {
      return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
    });
  }

  function evalScript(code) {
    return new Promise(function (resolve) {
      cepApi.evalScript(code, resolve);
    });
  }

  var hostLoaded = false;

  function ensureHost() {
    if (hostLoaded) return Promise.resolve();
    return evalScript('typeof np_run').then(function (t) {
      if (t === 'function') {
        hostLoaded = true;
        return;
      }
      var file = extensionRoot() + '/illustrator/host.jsx';
      return evalScript('$.evalFile(' + toAscii(JSON.stringify(file)) + ')').then(function () {
        hostLoaded = true;
      });
    });
  }

  function HostError(code, detail, raw) {
    var e = new Error(raw || code);
    e.code = code;
    e.detail = detail || '';
    return e;
  }

  function call(fn, args) {
    return ensureHost()
      .then(function () {
        return evalScript('np_run(' + fn + ',' + toAscii(JSON.stringify(args || {})) + ')');
      })
      .then(function (res) {
        var out;
        try {
          out = JSON.parse(res);
        } catch (e) {
          hostLoaded = false;
          throw HostError('SCRIPT', '', String(res));
        }
        if (!out.ok) throw HostError(out.code, out.detail, out.error);
        return out.data;
      });
  }

  function fsResult(r) {
    if (!r || r.err) throw HostError('FS', r ? String(r.err) : '', 'file error ' + (r ? r.err : ''));
    return r.data;
  }

  var fs = root.cep && root.cep.fs;
  var enc = root.cep && root.cep.encoding;

  root.NPHost = {
    demo: false,
    extensionRoot: extensionRoot,
    call: call,
    readText: function (path) {
      return fsResult(fs.readFile(path, enc.UTF8));
    },
    readBase64: function (path) {
      return fsResult(fs.readFile(path, enc.Base64));
    },
    writeText: function (path, text) {
      fsResult(fs.writeFile(path, text, enc.UTF8));
      return path;
    },
    writeBase64: function (path, b64) {
      fsResult(fs.writeFile(path, b64, enc.Base64));
      return path;
    },
    makeDir: function (path) {
      var r = fs.makedir(path);
      return !r || !r.err || r.err === fs.ERR_FILE_EXISTS;
    },
    openFile: function (title, types) {
      var fn = fs.showOpenDialogEx || fs.showOpenDialog;
      var r = fn.call(fs, false, false, title, '', types || []);
      return r && !r.err && r.data && r.data.length ? r.data[0] : '';
    },
    // สีพื้นแผงของ Illustrator → ธีมสว่าง/มืด
    skin: function () {
      try {
        var env = JSON.parse(cepApi.getHostEnvironment());
        var c = env.appSkinInfo.panelBackgroundColor.color;
        return { r: c.red, g: c.green, b: c.blue };
      } catch (e) {
        return null;
      }
    },
    onSkinChange: function (fn) {
      try {
        cepApi.addEventListener('com.adobe.csxs.events.ThemeColorChanged', fn);
      } catch (e) {}
    },
  };
})(window);
