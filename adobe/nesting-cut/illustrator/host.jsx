/*
 * Nong Ploy Nesting Cut - Illustrator host script (ExtendScript / ES3)
 *
 * Keep this file ASCII-only: ExtendScript may read it with the system code page, and
 * the UTF-8 bytes of Thai text can turn into line breaks inside comments. Every Thai
 * string (names, header text) comes from the panel, and errors go back as short codes
 * that the panel translates (see ERRORS in illustrator/main.js).
 *
 * No JSON, Array.prototype.forEach/map/indexOf, String.prototype.trim here - ES3 only.
 *
 * Every public function is called by the panel as
 *     np_run(np_xxx, { ...args })
 * and returns a JSON string { ok: true, data } or { ok: false, code, error }.
 */

var NP = $.global.NP_STATE;
if (!NP) {
  NP = { parts: [], stock: [], sourceDoc: null, layoutDoc: null };
  $.global.NP_STATE = NP;
}

var NP_VERSION = '1.0.0';

// ---------------------------------------------------------------- JSON out

function np_quote(s) {
  return (
    '"' +
    String(s).replace(/[\\"]|[^\x20-\x7e]/g, function (c) {
      if (c === '"') return '\\"';
      if (c === '\\') return '\\\\';
      if (c === '\n') return '\\n';
      if (c === '\r') return '\\r';
      if (c === '\t') return '\\t';
      var h = c.charCodeAt(0).toString(16);
      while (h.length < 4) h = '0' + h;
      return '\\u' + h;
    }) +
    '"'
  );
}

function np_str(v) {
  if (v === null || v === undefined) return 'null';
  var t = typeof v;
  if (t === 'number') return isFinite(v) ? String(v) : 'null';
  if (t === 'boolean') return v ? 'true' : 'false';
  if (t === 'string') return np_quote(v);
  var i;
  var out = [];
  if (v instanceof Array) {
    for (i = 0; i < v.length; i++) out.push(np_str(v[i]));
    return '[' + out.join(',') + ']';
  }
  for (var k in v) {
    if (v.hasOwnProperty(k) && typeof v[k] !== 'function') out.push(np_quote(k) + ':' + np_str(v[k]));
  }
  return '{' + out.join(',') + '}';
}

function np_E(code, detail) {
  var e = new Error('NP:' + code + (detail ? ':' + detail : ''));
  e.npCode = code;
  e.npDetail = detail || '';
  return e;
}

function np_run(fn, args) {
  var level = null;
  try {
    level = app.userInteractionLevel;
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
  } catch (e0) {}
  try {
    return np_str({ ok: true, data: fn(args || {}) });
  } catch (e) {
    return np_str({
      ok: false,
      code: e && e.npCode ? e.npCode : 'SCRIPT',
      detail: e && e.npDetail ? e.npDetail : '',
      error: e && e.message ? e.message + (e.line ? ' @' + e.line : '') : String(e)
    });
  } finally {
    try {
      if (level !== null) app.userInteractionLevel = level;
    } catch (e1) {}
  }
}

// ---------------------------------------------------------------- helpers

function np_r(n) {
  return Math.round(n * 1000) / 1000;
}

function np_rp(p) {
  return [np_r(p[0]), np_r(p[1])];
}

function np_rb(b) {
  return [np_r(b[0]), np_r(b[1]), np_r(b[2]), np_r(b[3])];
}

function np_norm(s) {
  return String(s).toLowerCase().replace(/[\s_\-]/g, '');
}

function np_alive(obj) {
  try {
    return !!obj && !!obj.typename;
  } catch (e) {
    return false;
  }
}

function np_part(idx) {
  var it = NP.parts[idx];
  if (!it) throw np_E('PART_MISSING');
  if (!np_alive(it)) throw np_E('PART_GONE');
  return it;
}

function np_sourceDoc() {
  if (!np_alive(NP.sourceDoc)) throw np_E('PART_GONE');
  return NP.sourceDoc;
}

// exact values for right angles, same as core/geometry.js
function np_cs(deg) {
  var d = ((deg % 360) + 360) % 360;
  if (d === 0) return [1, 0];
  if (d === 90) return [0, 1];
  if (d === 180) return [-1, 0];
  if (d === 270) return [0, -1];
  return [Math.cos((d * Math.PI) / 180), Math.sin((d * Math.PI) / 180)];
}

function np_isCutStroke(p, names) {
  try {
    if (!p.stroked) return false;
    var c = p.strokeColor;
    if (!c || c.typename !== 'SpotColor') return false;
    var n = np_norm(c.spot.name);
    for (var i = 0; i < names.length; i++) if (np_norm(names[i]) === n) return true;
  } catch (e) {}
  return false;
}

function np_readPath(p) {
  var pts = p.pathPoints;
  var out = [];
  for (var i = 0; i < pts.length; i++) {
    var q = pts[i];
    out.push({ a: np_rp(q.anchor), l: np_rp(q.leftDirection), r: np_rp(q.rightDirection) });
  }
  return { closed: p.closed, points: out };
}

function np_collectCut(it, names, out, depth) {
  if (depth > 40) return;
  var t = it.typename;
  var k;
  if (t === 'PathItem') {
    if (np_isCutStroke(it, names)) out.push(np_readPath(it));
  } else if (t === 'CompoundPathItem') {
    if (it.pathItems.length && np_isCutStroke(it.pathItems[0], names)) {
      for (k = 0; k < it.pathItems.length; k++) out.push(np_readPath(it.pathItems[k]));
    }
  } else if (t === 'GroupItem') {
    for (k = 0; k < it.pageItems.length; k++) np_collectCut(it.pageItems[k], names, out, depth + 1);
  }
}

function np_isVectorOnly(it, depth) {
  if (depth > 40) return false;
  var t = it.typename;
  if (t === 'PathItem' || t === 'CompoundPathItem') return true;
  if (t !== 'GroupItem' || it.clipped) return false;
  for (var k = 0; k < it.pageItems.length; k++) if (!np_isVectorOnly(it.pageItems[k], depth + 1)) return false;
  return it.pageItems.length > 0;
}

function np_nameOf(it) {
  try {
    if (it.name) return it.name;
    if (it.typename === 'PlacedItem') return decodeURI(it.file.name);
  } catch (e) {}
  return '';
}

function np_describe(it, idx, names) {
  var cut = [];
  np_collectCut(it, names, cut, 0);
  var note = '';
  try {
    note = it.note || '';
  } catch (e) {}
  return {
    idx: idx,
    name: np_nameOf(it),
    typename: it.typename,
    vb: np_rb(it.visibleBounds),
    gb: np_rb(it.geometricBounds),
    note: note,
    cut: cut,
    vectorOnly: np_isVectorOnly(it, 0)
  };
}

function np_spot(doc, name) {
  try {
    return doc.spots.getByName(name);
  } catch (e) {}
  var s = doc.spots.add();
  s.name = name;
  var c = new CMYKColor();
  c.cyan = 0;
  c.magenta = 100;
  c.yellow = 0;
  c.black = 0;
  s.color = c;
  s.colorType = ColorModel.SPOT;
  return s;
}

function np_spotColor(spot) {
  var sc = new SpotColor();
  sc.spot = spot;
  sc.tint = 100;
  return sc;
}

function np_black(doc) {
  if (doc.documentColorSpace === DocumentColorSpace.CMYK) {
    var c = new CMYKColor();
    c.cyan = 0;
    c.magenta = 0;
    c.yellow = 0;
    c.black = 100;
    return c;
  }
  var r = new RGBColor();
  r.red = 0;
  r.green = 0;
  r.blue = 0;
  return r;
}

function np_same(a, b) {
  return Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
}

// sp = { closed, points: [{ a, l, r }] } in document coordinates
function np_drawPath(container, sp, spot, width) {
  var p = container.pathItems.add();
  var pts = sp.points;
  var anchors = [];
  var curved = false;
  var i;
  for (i = 0; i < pts.length; i++) {
    anchors.push(pts[i].a);
    if ((pts[i].l && !np_same(pts[i].l, pts[i].a)) || (pts[i].r && !np_same(pts[i].r, pts[i].a))) curved = true;
  }
  p.setEntirePath(anchors);
  if (curved) {
    for (i = 0; i < pts.length; i++) {
      var q = p.pathPoints[i];
      var l = pts[i].l || pts[i].a;
      var r = pts[i].r || pts[i].a;
      q.pointType = np_same(l, pts[i].a) || np_same(r, pts[i].a) ? PointType.CORNER : PointType.SMOOTH;
      q.leftDirection = l;
      q.rightDirection = r;
    }
  }
  p.closed = sp.closed !== false;
  p.filled = false;
  p.stroked = true;
  p.strokeColor = np_spotColor(spot);
  p.strokeWidth = width > 0 ? width : 0.25;
  p.strokeOverprint = true;
  p.name = spot.name;
  return p;
}

// group that will hold artwork + cut line (a plain group is reused, anything else is wrapped)
function np_cutHolder(it) {
  if (it.typename === 'GroupItem' && !it.clipped) return it;
  var g = it.parent.groupItems.add();
  g.move(it, ElementPlacement.PLACEBEFORE);
  var name = '';
  try {
    name = it.name;
  } catch (e) {}
  it.move(g, ElementPlacement.PLACEATEND);
  if (name) g.name = name;
  return g;
}

function np_thaiFont(preferred) {
  var names = ['Tahoma', 'LeelawadeeUI', 'Leelawadee', 'Thonburi', 'SukhumvitSet-Text', 'Sarabun-Regular',
    'THSarabunNew', 'Kanit-Regular', 'Prompt-Regular', 'ArialUnicodeMS'];
  if (preferred) names.unshift(preferred);
  for (var i = 0; i < names.length; i++) {
    try {
      return app.textFonts.getByName(names[i]);
    } catch (e) {}
  }
  return null;
}

// ---------------------------------------------------------------- API

function np_ping() {
  var hasSel = false;
  try {
    hasSel = app.documents.length > 0 && app.activeDocument.selection.length > 0;
  } catch (e) {}
  return { version: NP_VERSION, app: app.version, documents: app.documents.length, selection: hasSel };
}

// args: { cutNames: [] }
function np_scan(args) {
  if (!app.documents.length) throw np_E('NO_DOC');
  var doc = app.activeDocument;
  var sel = doc.selection;
  if (!sel || sel.typename === 'TextRange' || !sel.length) throw np_E('NO_SELECTION');
  var names = args.cutNames && args.cutNames.length ? args.cutNames : ['CutContour'];
  NP.sourceDoc = doc;
  NP.parts = [];
  NP.stock = [];
  var out = [];
  for (var i = 0; i < sel.length; i++) {
    var it = sel[i];
    try {
      if (it.locked || it.hidden) continue;
    } catch (e) {}
    NP.parts.push(it);
    out.push(np_describe(it, NP.parts.length - 1, names));
  }
  if (!out.length) throw np_E('ALL_LOCKED');
  return { document: doc.name, parts: out };
}

// all paths of a pure-vector part (the vectors themselves are the cut lines)
// args: { idx, maxPoints }
function np_readVectors(args) {
  var it = np_part(args.idx);
  var out = [];
  var count = { n: 0, max: args.maxPoints || 60000 };
  np_walkVectors(it, out, count, 0);
  return { paths: out };
}

function np_walkVectors(it, out, count, depth) {
  if (depth > 40) return;
  var t = it.typename;
  var k;
  if (t === 'PathItem') {
    if (it.guides || it.clipping || it.pathPoints.length < 2) return;
    count.n += it.pathPoints.length;
    if (count.n > count.max) throw np_E('TOO_COMPLEX');
    out.push(np_readPath(it));
  } else if (t === 'CompoundPathItem') {
    for (k = 0; k < it.pathItems.length; k++) np_walkVectors(it.pathItems[k], out, count, depth + 1);
  } else if (t === 'GroupItem') {
    for (k = 0; k < it.pageItems.length; k++) np_walkVectors(it.pageItems[k], out, count, depth + 1);
  }
}

// render one part to a transparent PNG so the panel can trace its outline
// args: { idx, ppi }
function np_exportSilhouette(args) {
  var it = np_part(args.idx);
  var src = np_sourceDoc();
  var vb = it.visibleBounds;
  var w = vb[2] - vb[0];
  var h = vb[1] - vb[3];
  if (!(w > 0.01 && h > 0.01)) throw np_E('EMPTY_ITEM');
  var ppi = Math.max(36, Math.min(args.ppi || 300, 550));
  var f = new File(Folder.temp.fsName + '/nongploy_sil_' + args.idx + '_' + new Date().getTime() + '.png');
  var tmp = app.documents.add(DocumentColorSpace.RGB, Math.max(1, w), Math.max(1, h));
  try {
    var dup = it.duplicate(tmp.layers[0], ElementPlacement.PLACEATEND);
    var ab = tmp.artboards[0].artboardRect;
    var dvb = dup.visibleBounds;
    dup.translate(ab[0] - dvb[0], ab[1] - dvb[1]);
    dvb = dup.visibleBounds;
    tmp.artboards[0].artboardRect = [dvb[0], dvb[1], dvb[2], dvb[3]];
    var o = new ExportOptionsPNG24();
    o.antiAliasing = true;
    o.transparency = true;
    o.artBoardClipping = true;
    o.horizontalScale = (ppi / 72) * 100;
    o.verticalScale = (ppi / 72) * 100;
    tmp.exportFile(f, ExportType.PNG24, o);
  } finally {
    tmp.close(SaveOptions.DONOTSAVECHANGES);
    try {
      src.activate();
    } catch (e) {}
  }
  if (!f.exists) throw np_E('EXPORT_FAILED');
  return { file: f.fsName, bounds: np_rb(vb) };
}

// add cut lines (spot color stroke) into the parts of the source document
// args: { items: [{ idx, paths: [{ closed, points }] }], spotName, strokeWidth, cutNames }
function np_addCutLines(args) {
  var doc = np_sourceDoc();
  var spot = np_spot(doc, args.spotName || 'CutContour');
  var names = args.cutNames && args.cutNames.length ? args.cutNames : [spot.name];
  var out = [];
  for (var i = 0; i < args.items.length; i++) {
    var item = args.items[i];
    var holder = np_cutHolder(np_part(item.idx));
    for (var k = 0; k < item.paths.length; k++) {
      var cut = np_drawPath(holder, item.paths[k], spot, args.strokeWidth);
      cut.move(holder, ElementPlacement.PLACEATBEGINNING);
    }
    NP.parts[item.idx] = holder;
    NP.stock[item.idx] = null;
    out.push(np_describe(holder, item.idx, names));
  }
  return { parts: out };
}

// place one copy: duplicate the stock item, rotate it, then move it so that the
// source point h lands exactly where the nesting engine put it.
// A helper point rides along through the rotation, so Illustrator's choice of
// rotation center never matters.
function np_placePiece(stock, layer, pc, ox, oy) {
  var g = layer.groupItems.add();
  if (pc.name) g.name = pc.name;
  stock.item.duplicate(g, ElementPlacement.PLACEATEND);
  var hx = stock.ref[0];
  var hy = stock.ref[1];
  var helper = g.pathItems.add();
  helper.setEntirePath([
    [hx, hy],
    [hx + 1, hy]
  ]);
  helper.filled = false;
  helper.stroked = false;
  if (pc.angle) g.rotate(pc.angle, true, true, true, true, Transformation.CENTER);
  var now = helper.pathPoints[0].anchor;
  var sx = hx - stock.d[0];
  var sy = hy - stock.d[1];
  var cs = np_cs(pc.angle || 0);
  var ex = cs[0] * sx - cs[1] * sy + ox + pc.tx;
  var ey = cs[1] * sx + cs[0] * sy + oy - pc.ty;
  g.translate(ex - now[0], ey - now[1]);
  helper.remove();
  return g;
}

// one copy of every part inside the layout document, parked where it is, removed at the end
function np_stockFor(idx, layer) {
  if (NP.stock[idx] && np_alive(NP.stock[idx].item)) return NP.stock[idx];
  var src = np_part(idx);
  var item = src.duplicate(layer, ElementPlacement.PLACEATEND);
  var sp = src.position;
  var dp = item.position;
  NP.stock[idx] = { item: item, ref: [dp[0], dp[1]], d: [dp[0] - sp[0], dp[1] - sp[1]] };
  return NP.stock[idx];
}

function np_drawMarks(layer, marks, ox, oy, color) {
  for (var i = 0; i < marks.length; i++) {
    var m = marks[i];
    var e;
    if (m.kind === 'circle') e = layer.pathItems.ellipse(oy - (m.cy - m.r), ox + m.cx - m.r, 2 * m.r, 2 * m.r);
    else e = layer.pathItems.rectangle(oy - m.y, ox + m.x, m.w, m.h);
    e.filled = true;
    e.fillColor = color;
    e.stroked = false;
  }
}

function np_drawHeader(layer, hd, ox, oy, color) {
  if (hd.logo && hd.logo.file) {
    var f = new File(hd.logo.file);
    if (f.exists) {
      var pl = layer.placedItems.add();
      pl.file = f;
      pl.width = hd.logo.w;
      pl.height = hd.logo.h;
      pl.position = [ox + hd.logo.x, oy - hd.logo.y];
      try {
        pl.embed();
      } catch (e) {}
    }
  }
  if (hd.text && hd.text.lines && hd.text.lines.length) {
    var tf = layer.textFrames.add();
    tf.contents = hd.text.lines.join('\r');
    var ca = tf.textRange.characterAttributes;
    ca.size = hd.text.size || 12;
    ca.fillColor = color;
    var font = np_thaiFont(hd.text.font);
    if (font) ca.textFont = font;
    var sc = Math.min(1, hd.text.w / Math.max(1, tf.width), hd.text.h / Math.max(1, tf.height));
    if (sc < 1) ca.size = Math.max(4, (hd.text.size || 12) * sc);
    tf.position = [ox + hd.text.x, oy - hd.text.y];
  }
}

// args: {
//   sheets: [{ w, h, name, pieces: [{ part, angle, tx, ty, name }], marks: [], header: {} }],
//   layerNames: { pieces, marks, header }
// } all lengths in pt, positions relative to the artboard top-left with y going down
function np_buildLayout(args) {
  np_sourceDoc();
  var sheets = args.sheets;
  if (!sheets || !sheets.length) throw np_E('NOTHING_PLACED');
  var i;
  var k;
  for (i = 0; i < sheets.length; i++) {
    for (k = 0; k < sheets[i].pieces.length; k++) np_part(sheets[i].pieces[k].part);
  }
  var names = args.layerNames || {};
  var doc = app.documents.add(DocumentColorSpace.CMYK, sheets[0].w, sheets[0].h);
  NP.layoutDoc = doc;
  NP.stock = [];
  var layPieces = doc.layers[0];
  layPieces.name = names.pieces || 'Pieces';
  var layMarks = doc.layers.add();
  layMarks.name = names.marks || 'Marks';
  var layHeader = doc.layers.add();
  layHeader.name = names.header || 'Header';
  var color = np_black(doc);

  var GAP = 60;
  var ab0 = doc.artboards[0].artboardRect;
  var left = ab0[0];
  var top = ab0[1];
  var x = left;
  var rowH = 0;
  var placed = 0;
  for (i = 0; i < sheets.length; i++) {
    var sh = sheets[i];
    if (i > 0 && x + sh.w - left > 15000) {
      x = left;
      top -= rowH + GAP;
      rowH = 0;
    }
    var rect = [x, top, x + sh.w, top - sh.h];
    try {
      if (i === 0) doc.artboards[0].artboardRect = rect;
      else doc.artboards.add(rect);
    } catch (eAb) {
      throw np_E('CANVAS_FULL');
    }
    try {
      if (sh.name) doc.artboards[i].name = sh.name;
    } catch (eName) {}
    x = rect[2] + GAP;
    if (sh.h > rowH) rowH = sh.h;

    for (k = 0; k < sh.pieces.length; k++) {
      var pc = sh.pieces[k];
      np_placePiece(np_stockFor(pc.part, layPieces), layPieces, pc, rect[0], rect[1]);
      placed++;
    }
    if (sh.marks && sh.marks.length) np_drawMarks(layMarks, sh.marks, rect[0], rect[1], color);
    if (sh.header) np_drawHeader(layHeader, sh.header, rect[0], rect[1], color);
  }
  for (i = 0; i < NP.stock.length; i++) {
    if (NP.stock[i] && np_alive(NP.stock[i].item)) NP.stock[i].item.remove();
  }
  NP.stock = [];
  try {
    doc.artboards.setActiveArtboardIndex(0);
    doc.selection = null;
    app.executeMenuCommand('fitall');
  } catch (eView) {}
  return { document: doc.name, sheets: sheets.length, pieces: placed };
}

function np_defaultFolder() {
  var base = null;
  try {
    if (np_alive(NP.sourceDoc) && NP.sourceDoc.path && NP.sourceDoc.path.fsName) base = NP.sourceDoc.path;
  } catch (e) {}
  if (!base) base = Folder.myDocuments;
  return { folder: base.fsName + '/NestingCut' };
}

// args: { title }
function np_chooseFolder(args) {
  var f = Folder.selectDialog(args.title || 'Select folder');
  return { folder: f ? f.fsName : '' };
}

// save the layout document as PDF (for RIP print & cut) and/or .ai
// args: { folder, base, pdf, ai, pdfPreset }
function np_export(args) {
  var doc = NP.layoutDoc;
  if (!np_alive(doc)) throw np_E('NO_LAYOUT');
  doc.activate();
  var folder = new Folder(args.folder);
  if (!folder.exists && !folder.create()) throw np_E('FOLDER', args.folder);
  var files = [];
  if (args.pdf) {
    var pf = new File(folder.fsName + '/' + args.base + '.pdf');
    var o = new PDFSaveOptions();
    if (args.pdfPreset) {
      try {
        o.pDFPreset = args.pdfPreset;
      } catch (ePreset) {}
    }
    o.compatibility = PDFCompatibility.ACROBAT7;
    o.preserveEditability = false;
    o.viewAfterSaving = false;
    doc.saveAs(pf, o);
    files.push(pf.fsName);
  }
  if (args.ai) {
    var af = new File(folder.fsName + '/' + args.base + '.ai');
    doc.saveAs(af, new IllustratorSaveOptions());
    files.push(af.fsName);
  }
  return { folder: folder.fsName, files: files };
}

// select every cut line in the active document (so a cutter plug-in such as
// Cutting Master / CutStudio / FineCut can send just those)
// args: { cutNames }
function np_selectCutLines(args) {
  if (!app.documents.length) throw np_E('NO_DOC');
  var doc = app.activeDocument;
  var names = args.cutNames && args.cutNames.length ? args.cutNames : ['CutContour'];
  doc.selection = null;
  var n = 0;
  for (var i = 0; i < doc.pathItems.length; i++) {
    var p = doc.pathItems[i];
    if (!np_isCutStroke(p, names)) continue;
    try {
      p.selected = true;
      n++;
    } catch (e) {}
  }
  return { count: n };
}

// bring in a pack exported by the Photoshop panel
// args: { pack, folder, spotName, strokeWidth, embed, groupNote }
function np_importPack(args) {
  var pack = args.pack;
  var doc;
  if (!app.documents.length) doc = app.documents.add(DocumentColorSpace.CMYK, 2000, 2000);
  else doc = app.activeDocument;
  var spot = np_spot(doc, args.spotName || 'CutContour');
  var lay = doc.activeLayer;
  if (lay.locked || !lay.visible) {
    lay = doc.layers.add();
  }
  var ab = doc.artboards[doc.artboards.getActiveArtboardIndex()].artboardRect;
  var maxW = Math.max(500, ab[2] - ab[0]);
  var x = ab[0];
  var y = ab[1];
  var rowH = 0;
  var s = 72 / pack.ppi;
  var groups = [];
  for (var i = 0; i < pack.items.length; i++) {
    var it = pack.items[i];
    var w = it.widthPx * s;
    var h = it.heightPx * s;
    if (x > ab[0] && x + w > ab[0] + maxW) {
      x = ab[0];
      y -= rowH + 20;
      rowH = 0;
    }
    var f = new File(args.folder + '/' + it.image);
    if (!f.exists) throw np_E('IMAGE_MISSING', it.image);
    var g = lay.groupItems.add();
    if (it.name) g.name = it.name;
    var pl = g.placedItems.add();
    pl.file = f;
    pl.width = w;
    pl.height = h;
    pl.position = [x, y];
    if (args.embed) {
      try {
        pl.embed();
      } catch (eEmbed) {}
    }
    for (var c = 0; c < it.cut.length; c++) {
      var sp = it.cut[c];
      var pts = [];
      for (var p = 0; p < sp.points.length; p++) {
        var q = sp.points[p];
        pts.push({
          a: [x + q.a[0] * s, y - q.a[1] * s],
          l: [x + (q.l || q.a)[0] * s, y - (q.l || q.a)[1] * s],
          r: [x + (q.r || q.a)[0] * s, y - (q.r || q.a)[1] * s]
        });
      }
      var path = np_drawPath(g, { closed: sp.closed !== false, points: pts }, spot, args.strokeWidth);
      path.move(g, ElementPlacement.PLACEATBEGINNING);
    }
    g.note = 'np:qty=' + (it.quantity > 0 ? it.quantity : 1);
    groups.push(g);
    x += w + 20;
    if (h > rowH) rowH = h;
  }
  doc.selection = null;
  for (var j = 0; j < groups.length; j++) groups[j].selected = true;
  return { count: groups.length, document: doc.name };
}
