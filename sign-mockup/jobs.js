/* นัดพอน Sign Mockup — เก็บงานไว้ในเครื่อง (IndexedDB)
 * งานที่บันทึกชื่อไว้ + งานปัจจุบัน ("current") ที่บันทึกเองอัตโนมัติ เปิดแอปใหม่/อัปเดตแล้วงานไม่หาย */
(function (root) {
  'use strict';
  var NS = (root.SignMockup = root.SignMockup || {});
  var DB = 'np-sign-mockup';
  var STORE = 'jobs';
  var dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      if (!root.indexedDB) return reject(new Error('เครื่องนี้เก็บงานไม่ได้'));
      var r;
      try {
        r = root.indexedDB.open(DB, 1);
      } catch (e) {
        return reject(e);
      }
      r.onupgradeneeded = function () {
        r.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      r.onsuccess = function () {
        resolve(r.result);
      };
      r.onerror = function () {
        reject(r.error);
      };
    });
    dbp.catch(function () {
      dbp = null;
    });
    return dbp;
  }

  function run(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, mode);
        var req = fn(t.objectStore(STORE));
        t.oncomplete = function () {
          resolve(req ? req.result : undefined);
        };
        t.onerror = function () {
          reject(t.error);
        };
        t.onabort = function () {
          reject(t.error || new Error('ยกเลิก'));
        };
      });
    });
  }

  NS.jobs = {
    put: function (job) {
      return run('readwrite', function (s) {
        return s.put(job);
      });
    },
    get: function (id) {
      return run('readonly', function (s) {
        return s.get(id);
      });
    },
    del: function (id) {
      return run('readwrite', function (s) {
        return s.delete(id);
      });
    },
    // งานที่ตั้งชื่อบันทึกไว้ ใหม่สุดก่อน (ไม่รวมงานปัจจุบันที่บันทึกอัตโนมัติ)
    list: function () {
      return run('readonly', function (s) {
        return s.getAll();
      }).then(function (all) {
        return (all || [])
          .filter(function (j) {
            return j && j.id.indexOf('current') !== 0;
          })
          .sort(function (a, b) {
            return (b.updated || 0) - (a.updated || 0);
          });
      });
    },
  };
})(typeof self !== 'undefined' ? self : this);
