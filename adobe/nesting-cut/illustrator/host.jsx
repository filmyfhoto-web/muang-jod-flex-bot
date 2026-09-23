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
  NP = { parts: [], stock: [], sourceDoc: null, layoutDoc: null, detectRed: true };
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

// Cut lines are STROKES (a red fill is artwork, not a cut line):
//  - a spot color whose name is in `names` or contains cut / die / thru / kiss
//  - or, when NP.detectRed is on, a plain red stroke: RGB red, or CMYK M+Y without C/K
function np_isRed(c) {
  if (!c) return false;
  if (c.typename === 'RGBColor') return c.red >= 200 && c.green <= 80 && c.blue <= 80;
  if (c.typename === 'CMYKColor') return c.magenta >= 80 && c.yellow >= 80 && c.cyan <= 20 && c.black <= 20;
  return false;
}

function np_isCutStroke(p, names) {
  try {
    if (!p.stroked) return false;
    var c = p.strokeColor;
    if (!c) return false;
    if (c.typename === 'SpotColor') {
      var n = np_norm(c.spot.name);
      for (var i = 0; i < names.length; i++) if (np_norm(names[i]) === n) return true;
      if (/cut|die|thru|kiss/.test(n)) return true;
      return NP.detectRed && np_isRed(c.spot.color);
    }
    return NP.detectRed && np_isRed(c);
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
  return np_drawPathColor(container, sp, np_spotColor(spot), width, spot.name);
}

function np_drawPathColor(container, sp, color, width, name) {
  var p = container.pathItems.add();
  np_applyPoints(p, sp);
  p.filled = false;
  p.stroked = true;
  p.strokeColor = color;
  p.strokeWidth = width > 0 ? width : 0.25;
  p.strokeOverprint = true;
  if (name) p.name = name;
  return p;
}

// set anchors + handles of a path item from { closed, points: [{ a, l, r }] }
function np_applyPoints(p, sp) {
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
  NP.detectRed = args.detectRed !== false;
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

// layer by name: reuse (unlocked + visible) or create
function np_layer(doc, name) {
  var lay = null;
  try {
    lay = doc.layers.getByName(name);
  } catch (e) {}
  if (!lay) {
    lay = doc.layers.add();
    lay.name = name;
  }
  try {
    lay.locked = false;
    lay.visible = true;
  } catch (e2) {}
  return lay;
}

// every cut path inside the given items (only the new copies - the originals stay put)
function np_collectCutItems(it, names, out, depth) {
  if (depth > 40) return;
  var t = it.typename;
  var k;
  if (t === 'PathItem') {
    if (np_isCutStroke(it, names)) out.push(it);
  } else if (t === 'CompoundPathItem') {
    if (it.pathItems.length && np_isCutStroke(it.pathItems[0], names)) out.push(it);
  } else if (t === 'GroupItem') {
    for (k = 0; k < it.pageItems.length; k++) np_collectCutItems(it.pageItems[k], names, out, depth + 1);
  }
}

// straight cut lines across the whole grid: [[x1, y1, x2, y2], ...] in pt, artboard-relative, y down
function np_drawLines(layer, lines, ox, oy, spot, width) {
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i];
    var p = layer.pathItems.add();
    p.setEntirePath([
      [ox + l[0], oy - l[1]],
      [ox + l[2], oy - l[3]]
    ]);
    p.closed = false;
    p.filled = false;
    p.stroked = true;
    p.strokeColor = np_spotColor(spot);
    p.strokeWidth = width > 0 ? width : 0.25;
    p.strokeOverprint = true;
    p.name = spot.name;
  }
}

// continuous cut lines: [{ closed, points: [[x, y], ...] }] in pt, artboard-relative, y down
function np_drawPolys(layer, polys, ox, oy, spot, width) {
  for (var i = 0; i < polys.length; i++) {
    var pts = polys[i].points;
    var anchors = [];
    for (var k = 0; k < pts.length; k++) anchors.push({ a: [ox + pts[k][0], oy - pts[k][1]] });
    np_drawPath(layer, { closed: polys[i].closed !== false, points: anchors }, spot, width);
  }
}

// args: {
//   target: 'artboard' (new artboards next to the existing ones in the source document, default)
//         | 'document' (a separate new document - used for exporting),
//   sheets: [{ w, h, name, pieces: [{ part, angle, tx, ty, name }], marks: [], header: {}, gridLines: [] }],
//   layerNames: { pieces, cut, marks, header }, cutNames, spotName, strokeWidth, dropPieceCuts
// } all lengths in pt, positions relative to the artboard top-left with y going down
function np_buildLayout(args) {
  var src = np_sourceDoc();
  var sheets = args.sheets;
  if (!sheets || !sheets.length) throw np_E('NOTHING_PLACED');
  var i;
  var k;
  for (i = 0; i < sheets.length; i++) {
    for (k = 0; k < sheets[i].pieces.length; k++) np_part(sheets[i].pieces[k].part);
  }
  var names = args.layerNames || {};
  var cutNames = args.cutNames && args.cutNames.length ? args.cutNames : ['CutContour'];
  var newDoc = args.target === 'document';
  var doc;
  var GAP = 60;
  var left;
  var top;
  if (newDoc) {
    doc = app.documents.add(DocumentColorSpace.CMYK, sheets[0].w, sheets[0].h);
    doc.layers[0].name = names.pieces || 'Pieces';
    var ab0 = doc.artboards[0].artboardRect;
    left = ab0[0];
    top = ab0[1];
  } else {
    doc = src;
    doc.activate();
    // to the right of every existing artboard, tops aligned with the first one
    left = -1e9;
    for (i = 0; i < doc.artboards.length; i++) {
      var r0 = doc.artboards[i].artboardRect;
      if (r0[2] > left) left = r0[2];
    }
    left += GAP;
    top = doc.artboards[0].artboardRect[1];
  }
  NP.layoutDoc = doc;
  NP.layoutTemp = newDoc;
  NP.stock = [];
  var layPieces = np_layer(doc, names.pieces || 'Pieces');
  var layCut = names.cut ? np_layer(doc, names.cut) : null;
  var layMarks = np_layer(doc, names.marks || 'Marks');
  var layHeader = np_layer(doc, names.header || 'Header');
  var color = np_black(doc);
  var spot = np_spot(doc, args.spotName || 'CutContour');

  var x = left;
  var rowLeft = left;
  var rowH = 0;
  var placed = 0;
  var firstIndex = -1;
  var groups = [];
  for (i = 0; i < sheets.length; i++) {
    var sh = sheets[i];
    if (i > 0 && x + sh.w - rowLeft > 15000) {
      x = rowLeft;
      top -= rowH + GAP;
      rowH = 0;
    }
    var rect = [x, top, x + sh.w, top - sh.h];
    var abIndex;
    try {
      if (newDoc && i === 0) {
        doc.artboards[0].artboardRect = rect;
        abIndex = 0;
      } else {
        doc.artboards.add(rect);
        abIndex = doc.artboards.length - 1;
      }
    } catch (eAb) {
      throw np_E('CANVAS_FULL');
    }
    if (firstIndex < 0) firstIndex = abIndex;
    try {
      if (sh.name) doc.artboards[abIndex].name = sh.name;
    } catch (eName) {}
    x = rect[2] + GAP;
    if (sh.h > rowH) rowH = sh.h;

    for (k = 0; k < sh.pieces.length; k++) {
      var pc = sh.pieces[k];
      groups.push(np_placePiece(np_stockFor(pc.part, layPieces), layPieces, pc, rect[0], rect[1]));
      placed++;
    }
    if (sh.marks && sh.marks.length) np_drawMarks(layMarks, sh.marks, rect[0], rect[1], color);
    if (sh.header) np_drawHeader(layHeader, sh.header, rect[0], rect[1], color);
    if (sh.gridLines && sh.gridLines.length) np_drawLines(layCut || layPieces, sh.gridLines, rect[0], rect[1], spot, args.strokeWidth);
    if (sh.cutPolys && sh.cutPolys.length) np_drawPolys(layCut || layPieces, sh.cutPolys, rect[0], rect[1], spot, args.strokeWidth);
  }
  for (i = 0; i < NP.stock.length; i++) {
    if (NP.stock[i] && np_alive(NP.stock[i].item)) NP.stock[i].item.remove();
  }
  NP.stock = [];

  // cut lines of the new copies: onto the cut layer, or away entirely when grid lines replace them
  var cuts = [];
  for (i = 0; i < groups.length; i++) np_collectCutItems(groups[i], cutNames, cuts, 0);
  for (i = 0; i < cuts.length; i++) {
    try {
      if (args.dropPieceCuts) cuts[i].remove();
      else if (layCut) cuts[i].move(layCut, ElementPlacement.PLACEATEND);
    } catch (eMove) {}
  }
  try {
    doc.artboards.setActiveArtboardIndex(firstIndex);
    doc.selection = null;
    app.executeMenuCommand('fitin');
  } catch (eView) {}
  return { document: doc.name, sheets: sheets.length, pieces: placed, newDocument: newDoc, firstArtboard: firstIndex };
}

// close a separate layout document made only for exporting
function np_closeLayout() {
  var doc = NP.layoutDoc;
  if (NP.layoutTemp && np_alive(doc)) doc.close(SaveOptions.DONOTSAVECHANGES);
  NP.layoutTemp = false;
  NP.layoutDoc = null;
  try {
    if (np_alive(NP.sourceDoc)) NP.sourceDoc.activate();
  } catch (e) {}
  return { closed: true };
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

// ---------------------------------------------------------------- die cut by shape

// the current selection, skipping locked / hidden items
function np_selItems() {
  if (!app.documents.length) throw np_E('NO_DOC');
  var doc = app.activeDocument;
  var sel = doc.selection;
  if (!sel || sel.typename === 'TextRange' || !sel.length) throw np_E('NO_SELECTION');
  var out = [];
  for (var i = 0; i < sel.length; i++) {
    try {
      if (sel[i].locked || sel[i].hidden) continue;
    } catch (e) {}
    out.push(sel[i]);
  }
  if (!out.length) throw np_E('ALL_LOCKED');
  NP.dcDoc = doc;
  return out;
}

function np_countKinds(it, c, depth) {
  if (depth > 40) return;
  var t = it.typename;
  var k;
  if (t === 'PlacedItem' || t === 'RasterItem') c.images++;
  else if (t === 'TextFrame') c.texts++;
  else if (t === 'PathItem' || t === 'CompoundPathItem') c.vectors++;
  else if (t === 'GroupItem') {
    if (it.clipped) c.clips++;
    for (k = 0; k < it.pageItems.length; k++) np_countKinds(it.pageItems[k], c, depth + 1);
  }
}

// render the whole selection as one PNG (clipping masks, live text and effects included)
// args: { ppi }
function np_exportSelection(args) {
  var items = np_selItems();
  var src = app.activeDocument;
  var kinds = { images: 0, texts: 0, vectors: 0, clips: 0 };
  var vb = null;
  var i;
  for (i = 0; i < items.length; i++) {
    np_countKinds(items[i], kinds, 0);
    var b = items[i].visibleBounds;
    if (!vb) vb = [b[0], b[1], b[2], b[3]];
    else vb = [Math.min(vb[0], b[0]), Math.max(vb[1], b[1]), Math.max(vb[2], b[2]), Math.min(vb[3], b[3])];
  }
  var w = vb[2] - vb[0];
  var h = vb[1] - vb[3];
  if (!(w > 0.01 && h > 0.01)) throw np_E('EMPTY_ITEM');
  // keep the longest side under maxPx pixels (big photos would otherwise eat the memory)
  var ppi = Math.min(args.ppi || 300, 600, ((args.maxPx || 3000) * 72) / Math.max(w, h));
  ppi = Math.max(36, ppi);
  var f = new File(Folder.temp.fsName + '/nudpon_dc_' + new Date().getTime() + '.png');
  var tmp = app.documents.add(DocumentColorSpace.RGB, Math.max(1, w), Math.max(1, h));
  try {
    var g = tmp.layers[0].groupItems.add();
    for (i = 0; i < items.length; i++) items[i].duplicate(g, ElementPlacement.PLACEATEND);
    var ab = tmp.artboards[0].artboardRect;
    var gvb = g.visibleBounds;
    g.translate(ab[0] - gvb[0], ab[1] - gvb[1]);
    gvb = g.visibleBounds;
    tmp.artboards[0].artboardRect = [gvb[0], gvb[1], gvb[2], gvb[3]];
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
  return { file: f.fsName, bounds: np_rb(vb), count: items.length, kinds: kinds };
}

function np_walkClips(it, out, depth) {
  if (depth > 40) return;
  var t = it.typename;
  var k;
  if (t === 'PathItem') {
    if (it.clipping) out.push(np_readPath(it));
  } else if (t === 'CompoundPathItem') {
    if (it.pathItems.length && it.pathItems[0].clipping) {
      for (k = 0; k < it.pathItems.length; k++) out.push(np_readPath(it.pathItems[k]));
    }
  } else if (t === 'GroupItem') {
    for (k = 0; k < it.pageItems.length; k++) np_walkClips(it.pageItems[k], out, depth + 1);
  }
}

// edges of every clipping mask inside the selection
function np_readClipPaths(args) {
  var items = np_selItems();
  var out = [];
  for (var i = 0; i < items.length; i++) np_walkClips(items[i], out, 0);
  return { paths: out, count: items.length };
}

function np_red(doc) {
  if (doc.documentColorSpace === DocumentColorSpace.CMYK) {
    var c = new CMYKColor();
    c.cyan = 0;
    c.magenta = 100;
    c.yellow = 100;
    c.black = 0;
    return c;
  }
  var r = new RGBColor();
  r.red = 255;
  r.green = 0;
  r.blue = 0;
  return r;
}

// '#rrggbb' -> colour for the document (RGB, or a plain CMYK conversion)
function np_hexColor(doc, hex) {
  var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ''));
  var r = m ? parseInt(m[1], 16) : 0;
  var g = m ? parseInt(m[2], 16) : 0;
  var b = m ? parseInt(m[3], 16) : 0;
  if (doc.documentColorSpace === DocumentColorSpace.CMYK) {
    var rr = r / 255;
    var gg = g / 255;
    var bb = b / 255;
    var k = 1 - Math.max(rr, gg, bb);
    var c = new CMYKColor();
    c.black = k * 100;
    c.cyan = k < 1 ? ((1 - rr - k) / (1 - k)) * 100 : 0;
    c.magenta = k < 1 ? ((1 - gg - k) / (1 - k)) * 100 : 0;
    c.yellow = k < 1 ? ((1 - bb - k) / (1 - k)) * 100 : 0;
    return c;
  }
  var o = new RGBColor();
  o.red = r;
  o.green = g;
  o.blue = b;
  return o;
}

// draw the cut lines on their own layer at the top of the stack
// args: { paths: [{ closed, points: [{ a, l, r }] }], layer, strokeWidth, color: 'red' | 'spot', spotName }
function np_drawDieCut(args) {
  var doc = np_alive(NP.dcDoc) ? NP.dcDoc : app.documents.length ? app.activeDocument : null;
  if (!doc) throw np_E('NO_DOC');
  doc.activate();
  var lay = np_layer(doc, args.layer || 'Die cut');
  try {
    lay.zOrder(ZOrderMethod.BRINGTOFRONT);
  } catch (eZ) {}
  var color;
  var name = args.layer || 'Die cut';
  if (args.color === 'spot') {
    var spot = np_spot(doc, args.spotName || 'CutContour');
    color = np_spotColor(spot);
    name = spot.name;
  } else if (args.color === 'hex') color = np_hexColor(doc, args.hex);
  else color = np_red(doc);
  var g = lay.groupItems.add();
  g.name = args.layer || 'Die cut';
  var n = 0;
  for (var i = 0; i < args.paths.length; i++) {
    np_drawPathColor(g, args.paths[i], color, args.strokeWidth, name);
    n++;
  }
  doc.selection = null;
  try {
    g.selected = true;
  } catch (eSel) {}
  return { count: n, layer: lay.name };
}

// ---------------------------------------------------------------- CNC: rounded corners

function np_cloneColor(c) {
  if (!c) return null;
  var o;
  try {
    if (c.typename === 'RGBColor') {
      o = new RGBColor();
      o.red = c.red;
      o.green = c.green;
      o.blue = c.blue;
      return o;
    }
    if (c.typename === 'CMYKColor') {
      o = new CMYKColor();
      o.cyan = c.cyan;
      o.magenta = c.magenta;
      o.yellow = c.yellow;
      o.black = c.black;
      return o;
    }
    if (c.typename === 'GrayColor') {
      o = new GrayColor();
      o.gray = c.gray;
      return o;
    }
    if (c.typename === 'SpotColor') {
      o = new SpotColor();
      o.spot = c.spot;
      o.tint = c.tint;
      return o;
    }
  } catch (e) {}
  return null;
}

// text frames inside a (duplicated) item become outlines
function np_outlineTexts(it, depth) {
  if (depth > 40) return it;
  if (it.typename === 'TextFrame') return it.createOutline();
  if (it.typename === 'GroupItem') {
    for (var k = it.pageItems.length - 1; k >= 0; k--) {
      var c = it.pageItems[k];
      if (c.typename === 'TextFrame') c.createOutline();
      else if (c.typename === 'GroupItem') np_outlineTexts(c, depth + 1);
    }
  }
  return it;
}

// closed, visible paths (no guides / clipping paths)
function np_collectFills(it, out, count, depth) {
  if (depth > 40) return;
  var t = it.typename;
  var k;
  if (t === 'PathItem') {
    if (it.guides || it.clipping || !it.closed || it.pathPoints.length < 2) return;
    count.n += it.pathPoints.length;
    if (count.n > count.max) throw np_E('TOO_COMPLEX');
    out.push(np_readPath(it));
    if (!NP.cncFill && it.filled) NP.cncFill = np_cloneColor(it.fillColor);
  } else if (t === 'CompoundPathItem') {
    for (k = 0; k < it.pathItems.length; k++) np_collectFills(it.pathItems[k], out, count, depth + 1);
  } else if (t === 'GroupItem') {
    for (k = 0; k < it.pageItems.length; k++) np_collectFills(it.pageItems[k], out, count, depth + 1);
  }
}

// read the shapes of the selection (text is outlined on a throw-away copy, the original stays live)
function np_readShapes(args) {
  var items = np_selItems();
  var out = [];
  var count = { n: 0, max: (args && args.maxPoints) || 200000 };
  var kinds = { images: 0, texts: 0, vectors: 0, clips: 0 };
  var vb = null;
  var per = [];
  NP.cncItems = items;
  NP.cncFill = null;
  for (var i = 0; i < items.length; i++) {
    var from = out.length;
    np_countKinds(items[i], kinds, 0);
    var b = items[i].geometricBounds;
    vb = vb ? [Math.min(vb[0], b[0]), Math.max(vb[1], b[1]), Math.max(vb[2], b[2]), Math.min(vb[3], b[3])] : [b[0], b[1], b[2], b[3]];
    var dup = items[i].duplicate();
    try {
      dup = np_outlineTexts(dup, 0);
      np_collectFills(dup, out, count, 0);
    } finally {
      try {
        dup.remove();
      } catch (eRm) {}
    }
    per.push({ idx: i, from: from, to: out.length, vb: np_rb(b) });
  }
  return { paths: out, count: items.length, kinds: kinds, bounds: np_rb(vb), items: per };
}

// args: { paths: [{ closed, points }], mode: 'copy' | 'replace', name, flags: [{ x, y, r }], flagLayer }
function np_drawShapes(args) {
  var doc = np_alive(NP.dcDoc) ? NP.dcDoc : app.activeDocument;
  var items = NP.cncItems || [];
  var lay = null;
  try {
    lay = items[0].layer;
    if (lay.locked || !lay.visible) lay = null;
  } catch (e) {}
  if (!lay) lay = np_layer(doc, 'CNC');
  var fill = NP.cncFill || np_black(doc);
  var cp = lay.compoundPathItems.add();
  for (var i = 0; i < args.paths.length; i++) {
    var p = cp.pathItems.add();
    np_applyPoints(p, args.paths[i]);
    p.closed = true;
  }
  for (var j = 0; j < cp.pathItems.length; j++) {
    cp.pathItems[j].filled = true;
    cp.pathItems[j].fillColor = fill;
    cp.pathItems[j].stroked = false;
  }
  if (args.name) cp.name = args.name;
  var removed = 0;
  if (args.mode === 'replace') {
    for (var k = 0; k < items.length; k++) {
      try {
        if (np_alive(items[k])) {
          items[k].remove();
          removed++;
        }
      } catch (eR) {}
    }
    NP.cncItems = [];
  }
  var nFlags = 0;
  if (args.flags && args.flags.length) {
    var fl = np_layer(doc, args.flagLayer || 'Check');
    var red = np_red(doc);
    for (var f = 0; f < args.flags.length; f++) {
      var q = args.flags[f];
      var e = fl.pathItems.ellipse(q.y + q.r, q.x - q.r, 2 * q.r, 2 * q.r);
      e.filled = false;
      e.stroked = true;
      e.strokeColor = red;
      e.strokeWidth = 0.75;
      nFlags++;
    }
  }
  doc.selection = null;
  try {
    cp.selected = true;
  } catch (eS) {}
  return { count: args.paths.length, removed: removed, flags: nFlags };
}

// ---------------------------------------------------------------- rubber stamp (laser)

// args: { stamps: [{ cut: [sp], engrave: { mode: 'negative', paths: [sp] } | { mode: 'dup', items: [idx], dx, mirror } }],
//         cutLayer, engraveLayer, cutWidth (pt), cutHex }
function np_drawStamps(args) {
  var doc = np_alive(NP.dcDoc) ? NP.dcDoc : app.activeDocument;
  var items = NP.cncItems || [];
  var cutLay = np_layer(doc, args.cutLayer || 'Laser cut');
  var engLay = np_layer(doc, args.engraveLayer || 'Laser engrave');
  try {
    cutLay.zOrder(ZOrderMethod.BRINGTOFRONT);
  } catch (eZ) {}
  var cutColor = np_hexColor(doc, args.cutHex || '#ff0000');
  var black = np_black(doc);
  var width = args.cutWidth > 0 ? args.cutWidth : 0.03;
  var nCut = 0;
  for (var i = 0; i < args.stamps.length; i++) {
    var st = args.stamps[i];
    var k;
    for (k = 0; k < st.cut.length; k++) {
      np_drawPathColor(cutLay, st.cut[k], cutColor, width, 'Laser cut');
      nCut++;
    }
    var eg = st.engrave;
    if (eg.mode === 'negative') {
      var cp = engLay.compoundPathItems.add();
      cp.name = 'Engrave';
      for (k = 0; k < eg.paths.length; k++) {
        var p = cp.pathItems.add();
        np_applyPoints(p, eg.paths[k]);
        p.closed = true;
      }
      for (k = 0; k < cp.pathItems.length; k++) {
        var q = cp.pathItems[k];
        q.filled = true;
        q.fillColor = black;
        q.stroked = false;
        try {
          q.evenodd = true;
        } catch (eEo) {}
      }
    } else {
      var g = engLay.groupItems.add();
      g.name = 'Engrave';
      for (k = 0; k < eg.items.length; k++) {
        var src = items[eg.items[k]];
        if (np_alive(src)) src.duplicate(g, ElementPlacement.PLACEATEND);
      }
      g.translate(eg.dx || 0, 0);
      if (eg.mirror) g.resize(-100, 100);
    }
  }
  doc.selection = null;
  return { stamps: args.stamps.length, cuts: nCut, cutLayer: cutLay.name, engraveLayer: engLay.name };
}

// ---------------------------------------------------------------- clear old work

// remove the die-cut sheets this plug-in made in the active document:
// artboards whose name starts with args.marker, plus the items on args.layers that sit on them
function np_clearSheets(args) {
  if (!app.documents.length) throw np_E('NO_DOC');
  var doc = app.activeDocument;
  var marker = String(args.marker || '');
  var removedBoards = 0;
  var removedItems = 0;
  var kept = 0;
  if (!marker) return { artboards: 0, items: 0, kept: 0 };
  for (var a = doc.artboards.length - 1; a >= 0; a--) {
    var ab = doc.artboards[a];
    if (String(ab.name).substr(0, marker.length) !== marker) continue;
    var r = ab.artboardRect;
    var tol = 1;
    for (var l = 0; l < (args.layers || []).length; l++) {
      var lay = null;
      try {
        lay = doc.layers.getByName(args.layers[l]);
      } catch (eL) {}
      if (!lay) continue;
      try {
        lay.locked = false;
      } catch (eLk) {}
      for (var i = lay.pageItems.length - 1; i >= 0; i--) {
        var it = lay.pageItems[i];
        var b = it.visibleBounds;
        if (b[0] >= r[0] - tol && b[2] <= r[2] + tol && b[1] <= r[1] + tol && b[3] >= r[3] - tol) {
          try {
            it.locked = false;
            it.remove();
            removedItems++;
          } catch (eR) {}
        }
      }
    }
    if (doc.artboards.length > 1) {
      doc.artboards.remove(a);
      removedBoards++;
    } else kept++;
  }
  NP.layoutDoc = null;
  NP.layoutTemp = false;
  return { artboards: removedBoards, items: removedItems, kept: kept };
}

// remove whole result layers by name (a document keeps at least one layer: that one is emptied instead)
function np_clearLayers(args) {
  if (!app.documents.length) throw np_E('NO_DOC');
  var doc = app.activeDocument;
  var removed = 0;
  var emptied = 0;
  for (var n = 0; n < (args.names || []).length; n++) {
    var lay = null;
    try {
      lay = doc.layers.getByName(args.names[n]);
    } catch (e) {}
    if (!lay) continue;
    try {
      lay.locked = false;
      lay.visible = true;
    } catch (e2) {}
    if (doc.layers.length > 1) {
      lay.remove();
      removed++;
    } else {
      while (lay.pageItems.length) lay.pageItems[0].remove();
      emptied++;
    }
  }
  return { removed: removed, emptied: emptied };
}

// ---------------------------------------------------------------- dimensions

function np_readBounds(args) {
  var items = np_selItems();
  var out = [];
  for (var i = 0; i < items.length; i++) out.push({ vb: np_rb(items[i].geometricBounds), name: np_nameOf(items[i]) });
  return { items: out };
}

function np_textStyle(doc, tf, st, font) {
  var ca = tf.textRange.characterAttributes;
  if (font) {
    try {
      ca.textFont = font;
    } catch (eF) {}
  }
  if (st.size > 0) ca.size = st.size;
  if (st.hex) ca.fillColor = np_hexColor(doc, st.hex);
  if (st.underline != null) {
    try {
      ca.underline = !!st.underline;
    } catch (eU) {}
  }
  if (st.align) {
    var j = st.align === 'left' ? Justification.LEFT : st.align === 'right' ? Justification.RIGHT : Justification.CENTER;
    try {
      tf.textRange.paragraphAttributes.justification = j;
    } catch (eJ) {}
  }
}

// args: { dims: [{ lines, arrows, text: { str, size, vertical, side, line, mid, gap } }], layer, hex, strokeWidth, clear, font }
function np_drawDimensions(args) {
  var doc = np_alive(NP.dcDoc) ? NP.dcDoc : app.activeDocument;
  var lay = np_layer(doc, args.layer || 'Dimension');
  var cleared = 0;
  if (args.clear) {
    while (lay.pageItems.length) {
      lay.pageItems[0].remove();
      cleared++;
    }
  }
  var color = np_hexColor(doc, args.hex || '#e6007e');
  var font = np_thaiFont(args.font);
  var width = args.strokeWidth > 0 ? args.strokeWidth : 0.5;
  for (var i = 0; i < args.dims.length; i++) {
    var d = args.dims[i];
    var g = lay.groupItems.add();
    g.name = 'Dimension';
    var k;
    for (k = 0; k < d.lines.length; k++) {
      var l = d.lines[k];
      var p = g.pathItems.add();
      p.setEntirePath([[l[0], l[1]], [l[2], l[3]]]);
      p.closed = false;
      p.filled = false;
      p.stroked = true;
      p.strokeColor = color;
      p.strokeWidth = width;
    }
    for (k = 0; k < d.arrows.length; k++) {
      var a = g.pathItems.add();
      a.setEntirePath(d.arrows[k]);
      a.closed = true;
      a.stroked = false;
      a.filled = true;
      a.fillColor = color;
    }
    var t = d.text;
    var tf = g.textFrames.pointText([0, 0]);
    tf.contents = t.str;
    np_textStyle(doc, tf, { size: t.size, hex: args.hex || '#e6007e', align: 'center' }, font);
    if (t.vertical) tf.rotate(90);
    var gb = tf.geometricBounds;
    var dx = 0;
    var dy = 0;
    if (t.side === 'top') {
      dx = t.mid - (gb[0] + gb[2]) / 2;
      dy = t.line + t.gap - gb[3];
    } else if (t.side === 'bottom') {
      dx = t.mid - (gb[0] + gb[2]) / 2;
      dy = t.line - t.gap - gb[1];
    } else if (t.side === 'right') {
      dx = t.line + t.gap - gb[0];
      dy = t.mid - (gb[1] + gb[3]) / 2;
    } else {
      dx = t.line - t.gap - gb[2];
      dy = t.mid - (gb[1] + gb[3]) / 2;
    }
    tf.translate(dx, dy);
  }
  return { count: args.dims.length, cleared: cleared, layer: lay.name };
}

// ---------------------------------------------------------------- numbering

function np_walkTexts(it, out, depth) {
  if (depth > 40) return;
  if (it.typename === 'TextFrame') out.push(it);
  else if (it.typename === 'GroupItem') {
    for (var k = 0; k < it.pageItems.length; k++) np_walkTexts(it.pageItems[k], out, depth + 1);
  }
}

function np_readTexts(args) {
  var items = np_selItems();
  var list = [];
  for (var i = 0; i < items.length; i++) np_walkTexts(items[i], list, 0);
  NP.texts = list;
  var out = [];
  for (var j = 0; j < list.length; j++) out.push({ idx: j, contents: list[j].contents, vb: np_rb(list[j].geometricBounds) });
  return { texts: out };
}

// args: { items: [{ idx, text }], style: null | { font, size, hex, align, underline } }
function np_setTexts(args) {
  var doc = np_alive(NP.dcDoc) ? NP.dcDoc : app.activeDocument;
  var font = args.style && args.style.font ? np_thaiFont(args.style.font) : null;
  var n = 0;
  for (var i = 0; i < args.items.length; i++) {
    var tf = (NP.texts || [])[args.items[i].idx];
    if (!np_alive(tf)) continue;
    tf.contents = args.items[i].text;
    if (args.style) np_textStyle(doc, tf, args.style, font);
    n++;
  }
  return { count: n };
}

function np_readArtboards(args) {
  if (!app.documents.length) throw np_E('NO_DOC');
  var doc = app.activeDocument;
  NP.dcDoc = doc;
  var out = [];
  for (var i = 0; i < doc.artboards.length; i++) out.push({ index: i, rect: np_rb(doc.artboards[i].artboardRect), name: doc.artboards[i].name });
  return { artboards: out };
}

// args: { pages: [{ x, y, text, justify }], style: { font, size, hex, underline }, layer, clear }
function np_pageNumbers(args) {
  var doc = np_alive(NP.dcDoc) ? NP.dcDoc : app.activeDocument;
  var lay = np_layer(doc, args.layer || 'Page numbers');
  if (args.clear) {
    for (var c = lay.pageItems.length - 1; c >= 0; c--) {
      if (lay.pageItems[c].name === 'PageNo') lay.pageItems[c].remove();
    }
  }
  var st = args.style || {};
  var font = np_thaiFont(st.font);
  for (var i = 0; i < args.pages.length; i++) {
    var pg = args.pages[i];
    var tf = lay.textFrames.pointText([pg.x, pg.y]);
    tf.contents = pg.text;
    tf.name = 'PageNo';
    np_textStyle(doc, tf, { size: st.size || 10, hex: st.hex || '#000000', underline: st.underline, align: pg.justify }, font);
  }
  return { count: args.pages.length, layer: lay.name };
}

// ---------------------------------------------------------------- one-key workflow

// the panel says it is open (the quick script checks this before it fires the event)
function np_panelReady(args) {
  $.global.NP_PANEL_READY = true;
  return { ready: true };
}

// write the quick script into Illustrator's Scripts menu folder (falls back to Documents)
// args: { code, fileName }
function np_installQuickScript(args) {
  var name = args.fileName || 'NudPon Quick Nest.jsx';
  var dirs = [
    app.path + '/Presets/' + app.locale + '/Scripts',
    app.path + '/Presets.localized/' + app.locale + '/Scripts'
  ];
  for (var i = 0; i < dirs.length; i++) {
    var d = new Folder(dirs[i]);
    if (!d.exists) continue;
    var f = new File(d.fsName + '/' + name);
    f.encoding = 'UTF-8';
    if (f.open('w')) {
      f.write(args.code);
      f.close();
      return { installed: true, path: f.fsName };
    }
  }
  var home = new Folder(Folder.myDocuments.fsName + '/NudPon');
  if (!home.exists) home.create();
  var g = new File(home.fsName + '/' + name);
  g.encoding = 'UTF-8';
  if (!g.open('w')) throw np_E('FS', g.fsName);
  g.write(args.code);
  g.close();
  return { installed: false, path: g.fsName, scripts: dirs[0] };
}

// select every cut line in the active document (so a cutter plug-in such as
// Cutting Master / CutStudio / FineCut can send just those)
// args: { cutNames }
function np_selectCutLines(args) {
  if (!app.documents.length) throw np_E('NO_DOC');
  var doc = app.activeDocument;
  var names = args.cutNames && args.cutNames.length ? args.cutNames : ['CutContour'];
  NP.detectRed = args.detectRed !== false;
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
