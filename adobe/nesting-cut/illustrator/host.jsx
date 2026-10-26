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

// fonts with proper OpenType Thai first (system font on Mac / Windows), Tahoma after them
function np_thaiFont(preferred) {
  var names = ['Thonburi', 'LeelawadeeUI', 'Leelawadee', 'Tahoma', 'SukhumvitSet-Text', 'Sarabun-Regular',
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

// Thai vowel and tone marks need Illustrator's World-Ready ("Optyca") composer - the default
// Latin composer stacks them in the wrong place. The enum value name differs between versions,
// so look it up by name; false when this Illustrator has none.
function np_worldReady(tf) {
  try {
    var props = ComposerEngineType.reflect.properties;
    for (var i = 0; i < props.length; i++) {
      if (/optyca/i.test(props[i].name)) {
        tf.textRange.paragraphAttributes.composerEngine = ComposerEngineType[props[i].name];
        return true;
      }
    }
  } catch (e) {}
  return false;
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
    var shaped = np_worldReady(tf);
    var sc = Math.min(1, hd.text.w / Math.max(1, tf.width), hd.text.h / Math.max(1, tf.height));
    if (sc < 1) ca.size = Math.max(4, (hd.text.size || 12) * sc);
    tf.position = [ox + hd.text.x, oy - hd.text.y];
    // shaped correctly -> outlines, so the RIP or another computer without the font shows the same thing
    // (otherwise stay live text: Paragraph panel > World-Ready composer still fixes it by hand)
    if (shaped) {
      try {
        tf.createOutline();
      } catch (e2) {}
    }
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
    np_tag(p);
  }
}

// continuous cut lines: [{ closed, points: [[x, y], ...] }] in pt, artboard-relative, y down
function np_drawPolys(layer, polys, ox, oy, spot, width) {
  for (var i = 0; i < polys.length; i++) {
    var pts = polys[i].points;
    var anchors = [];
    for (var k = 0; k < pts.length; k++) anchors.push({ a: [ox + pts[k][0], oy - pts[k][1]] });
    np_tag(np_drawPath(layer, { closed: polys[i].closed !== false, points: anchors }, spot, width));
  }
}

// ---------------------------------------------------------------- shop template (open artboard)
//
// The shop's own template (e.g. 13 x 19 in with Cutting Master 5 marks + a logo/QR header) stays as it is:
// the stickers are laid into the free area of that artboard. Everything the plugin places is tagged
// (note = NP_TAG) so a second run replaces the previous layout instead of piling on top of it.

var NP_TAG = 'nongploy-nestingcut';

function np_tag(it) {
  try {
    if (it) it.note = NP_TAG;
  } catch (e) {}
  return it;
}

function np_tagged(it) {
  try {
    return it.note === NP_TAG;
  } catch (e) {
    return false;
  }
}

// DOM references are not always identical objects - same type + same bounds counts as the same item
function np_isPart(it) {
  var b = null;
  for (var i = 0; i < NP.parts.length; i++) {
    var p = NP.parts[i];
    try {
      if (p === it) return true;
      if (!np_alive(p) || p.typename !== it.typename) continue;
      if (!b) b = it.visibleBounds;
      var q = p.visibleBounds;
      if (Math.abs(q[0] - b[0]) + Math.abs(q[1] - b[1]) + Math.abs(q[2] - b[2]) + Math.abs(q[3] - b[3]) < 0.01) return true;
    } catch (e) {}
  }
  return false;
}

function np_overlaps(b, r) {
  return !(b[2] <= r[0] || b[0] >= r[2] || b[1] <= r[3] || b[3] >= r[1]);
}

function np_inside(b, r) {
  var tol = 1;
  return b[0] >= r[0] - tol && b[2] <= r[2] + tol && b[1] <= r[1] + tol && b[3] >= r[3] - tol;
}

// top-level items of the template artboard (on visible layers), without the selected parts and earlier layouts
function np_templateItems(doc, r) {
  var out = [];
  function walk(lay, depth) {
    try {
      if (!lay.visible) return;
    } catch (e0) {}
    var k;
    for (k = 0; k < lay.pageItems.length; k++) {
      var it = lay.pageItems[k];
      try {
        if (it.hidden || (it.typename === 'PathItem' && it.guides)) continue;
      } catch (e1) {}
      if (np_tagged(it) || np_isPart(it)) continue;
      if (np_overlaps(it.visibleBounds, r)) out.push(it);
    }
    if (depth < 5) {
      for (k = 0; k < lay.layers.length; k++) walk(lay.layers[k], depth + 1);
    }
  }
  for (var i = 0; i < doc.layers.length; i++) walk(doc.layers[i], 0);
  return out;
}

// boxes the stickers must stay away from; a big group (e.g. every mark in one group) is opened up,
// a single page-size shape (background / frame) is ignored
function np_boxesOf(it, r, mark, out, depth) {
  var b = it.visibleBounds;
  var abArea = (r[2] - r[0]) * (r[1] - r[3]);
  var area = (b[2] - b[0]) * (b[1] - b[3]);
  var t = it.typename;
  var k;
  if (area > abArea * 0.25 && depth < 10) {
    if (t === 'GroupItem' && !it.clipped) {
      for (k = 0; k < it.pageItems.length; k++) np_boxesOf(it.pageItems[k], r, mark, out, depth + 1);
      return;
    }
    if (t === 'CompoundPathItem') {
      for (k = 0; k < it.pathItems.length; k++) np_boxesOf(it.pathItems[k], r, mark, out, depth + 1);
      return;
    }
    if (area > abArea * 0.5) return;
  }
  if (!np_overlaps(b, r)) return;
  out.push({ x: np_r(b[0] - r[0]), y: np_r(r[1] - b[1]), w: np_r(b[2] - b[0]), h: np_r(b[1] - b[3]), mark: mark ? 1 : 0 });
}

function np_layerOf(it) {
  try {
    var lay = it.layer;
    while (lay.parent && lay.parent.typename === 'Layer') lay = lay.parent;
    return lay;
  } catch (e) {
    return null;
  }
}

// args: {} - the artboard that is active in the document the parts came from
function np_readTemplate(args) {
  var doc = np_alive(NP.sourceDoc) ? NP.sourceDoc : app.documents.length ? app.activeDocument : null;
  if (!doc) throw np_E('NO_DOC');
  var abIndex = doc.artboards.getActiveArtboardIndex();
  var r = doc.artboards[abIndex].artboardRect;
  var items = np_templateItems(doc, r);
  var boxes = [];
  var marks = 0;
  var fx0 = 1e9;
  var fy0 = 1e9;
  var fx1 = -1e9;
  var fy1 = -1e9;
  for (var i = 0; i < items.length; i++) {
    var lay = np_layerOf(items[i]);
    var mark = !!lay && np_isRegLayer(lay.name);
    var start = boxes.length;
    np_boxesOf(items[i], r, mark, boxes, 0);
    if (!mark) continue;
    for (var k = start; k < boxes.length; k++) {
      var b = boxes[k];
      marks++;
      if (b.x < fx0) fx0 = b.x;
      if (b.y < fy0) fy0 = b.y;
      if (b.x + b.w > fx1) fx1 = b.x + b.w;
      if (b.y + b.h > fy1) fy1 = b.y + b.h;
    }
  }
  var old = 0;
  var onBoard = 0;
  var p;
  for (p = 0; p < NP.parts.length; p++) {
    if (np_alive(NP.parts[p]) && np_overlaps(NP.parts[p].visibleBounds, r)) onBoard++;
  }
  for (p = 0; p < doc.layers.length; p++) {
    for (var q = 0; q < doc.layers[p].pageItems.length; q++) {
      var it = doc.layers[p].pageItems[q];
      if (np_tagged(it) && np_inside(it.visibleBounds, r)) old++;
    }
  }
  return {
    document: doc.name,
    abIndex: abIndex,
    abName: doc.artboards[abIndex].name,
    w: np_r(r[2] - r[0]),
    h: np_r(r[1] - r[3]),
    frame: marks >= 2 ? { x: fx0, y: fy0, w: np_r(fx1 - fx0), h: np_r(fy1 - fy0) } : null,
    boxes: boxes,
    marks: marks,
    parts: onBoard,
    old: old
  };
}

// a previous layout on the template artboard (only what the plugin placed)
function np_removeTagged(doc, r) {
  var n = 0;
  for (var l = 0; l < doc.layers.length; l++) {
    var lay = doc.layers[l];
    for (var i = lay.pageItems.length - 1; i >= 0; i--) {
      var it = lay.pageItems[i];
      if (!np_tagged(it) || !np_inside(it.visibleBounds, r)) continue;
      try {
        lay.locked = false;
        it.locked = false;
        it.remove();
        n++;
      } catch (e) {}
    }
  }
  return n;
}

// copy the template (marks, header, logo ...) onto another sheet - same document or a new one
// (a locked template layer, e.g. the CM5 marks, is unlocked only while copying)
function np_copyTemplate(items, src, doc, rect) {
  var dx = rect[0] - src[0];
  var dy = rect[1] - src[1];
  var relock = [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var lay = np_layerOf(it);
    var name = lay ? lay.name : 'Template';
    var target = null;
    try {
      target = doc.layers.getByName(name);
    } catch (e0) {}
    if (!target) target = np_layer(doc, name);
    try {
      if (target.locked) {
        target.locked = false;
        relock.push(target);
      }
    } catch (e1) {}
    var pos = it.position;
    var dup = it.duplicate(target, ElementPlacement.PLACEATEND);
    dup.position = [pos[0] + dx, pos[1] + dy];
  }
  for (var k = 0; k < relock.length; k++) {
    try {
      relock[k].locked = true;
    } catch (e2) {}
  }
}

// selected originals that sit on the template artboard move to the pasteboard on its left
function np_parkParts(r) {
  var moved = 0;
  for (var i = 0; i < NP.parts.length; i++) {
    var it = NP.parts[i];
    if (!np_alive(it)) continue;
    var b = it.visibleBounds;
    if (!np_overlaps(b, r)) continue;
    try {
      it.translate(r[0] - 36 - b[2], 0);
      moved++;
    } catch (e) {}
  }
  return moved;
}

// ---------------------------------------------------------------- Graphtec (Cutting Master) marks
//
// Cutting Master keeps its mark settings in layer names (margin / color / reg_2 / reg_1, top to bottom)
// and the marks themselves inside reg_1. np_readMarks learns them from the shop's own template file,
// np_buildLayout re-creates the same layers + marks on every new sheet.

function np_isRegLayer(name) {
  return /^(margin|color|reg_\d+)(\s|$)/i.test(String(name));
}

function np_colorObj(c) {
  if (!c) return null;
  var t = c.typename;
  if (t === 'CMYKColor') return { t: 'cmyk', v: [c.cyan, c.magenta, c.yellow, c.black] };
  if (t === 'RGBColor') return { t: 'rgb', v: [c.red, c.green, c.blue] };
  if (t === 'GrayColor') return { t: 'gray', v: [c.gray] };
  if (t === 'SpotColor') return { t: 'spot', name: c.spot.name, tint: c.tint, base: np_colorObj(c.spot.color) };
  return null;
}

function np_makeColor(doc, o) {
  if (!o) return null;
  var c;
  if (o.t === 'cmyk') {
    c = new CMYKColor();
    c.cyan = o.v[0];
    c.magenta = o.v[1];
    c.yellow = o.v[2];
    c.black = o.v[3];
    return c;
  }
  if (o.t === 'rgb') {
    c = new RGBColor();
    c.red = o.v[0];
    c.green = o.v[1];
    c.blue = o.v[2];
    return c;
  }
  if (o.t === 'gray') {
    c = new GrayColor();
    c.gray = o.v[0];
    return c;
  }
  if (o.t === 'spot') {
    var spot = null;
    try {
      spot = doc.spots.getByName(o.name);
    } catch (e) {}
    if (!spot) {
      var base = np_makeColor(doc, o.base);
      if (!base) return null;
      try {
        spot = doc.spots.add();
        spot.name = o.name;
        spot.colorType = ColorModel.SPOT;
        spot.color = base;
      } catch (e2) {
        return base;
      }
    }
    c = new SpotColor();
    c.spot = spot;
    c.tint = o.tint == null ? 100 : o.tint;
    return c;
  }
  return null;
}

// one path of a mark, relative to the artboard top-left with y going down: [ax, ay, lx, ly, rx, ry]
function np_markPath(p, ab, cp) {
  var pts = p.pathPoints;
  var list = [];
  for (var k = 0; k < pts.length; k++) {
    var q = pts[k];
    list.push([
      np_r(q.anchor[0] - ab[0]), np_r(ab[1] - q.anchor[1]),
      np_r(q.leftDirection[0] - ab[0]), np_r(ab[1] - q.leftDirection[1]),
      np_r(q.rightDirection[0] - ab[0]), np_r(ab[1] - q.rightDirection[1])
    ]);
  }
  return {
    closed: p.closed,
    cp: cp,
    fill: p.filled ? np_colorObj(p.fillColor) : null,
    stroke: p.stroked ? np_colorObj(p.strokeColor) : null,
    sw: p.stroked ? p.strokeWidth : 0,
    pts: list
  };
}

function np_walkMarks(it, layerName, ab, out, depth) {
  if (depth > 20 || out.length > 400) return;
  var t = it.typename;
  var k;
  if (t === 'GroupItem') {
    for (k = 0; k < it.pageItems.length; k++) np_walkMarks(it.pageItems[k], layerName, ab, out, depth + 1);
    return;
  }
  if (t !== 'PathItem' && t !== 'CompoundPathItem') return;
  // only what sits on the active artboard
  var b = it.geometricBounds;
  if (b[2] < ab[0] || b[0] > ab[2] || b[1] < ab[3] || b[3] > ab[1]) return;
  if (t === 'PathItem') {
    var one = np_markPath(it, ab, 0);
    one.layer = layerName;
    out.push(one);
    return;
  }
  NP.cpSeq = (NP.cpSeq || 0) + 1;
  for (k = 0; k < it.pathItems.length; k++) {
    var sub = np_markPath(it.pathItems[k], ab, NP.cpSeq);
    sub.layer = layerName;
    out.push(sub);
  }
}

function np_walkRegLayer(lay, name, ab, out, depth) {
  var k;
  for (k = 0; k < lay.pageItems.length; k++) np_walkMarks(lay.pageItems[k], name, ab, out, 0);
  if (depth < 5) {
    for (k = 0; k < lay.layers.length; k++) np_walkRegLayer(lay.layers[k], name, ab, out, depth + 1);
  }
}

// args: {} - reads the active document + active artboard
function np_readMarks(args) {
  if (!app.documents.length) throw np_E('NO_DOC');
  var doc = app.activeDocument;
  var ab = doc.artboards[doc.artboards.getActiveArtboardIndex()].artboardRect;
  var names = [];
  var items = [];
  for (var i = 0; i < doc.layers.length; i++) {
    var lay = doc.layers[i];
    if (!np_isRegLayer(lay.name)) continue;
    names.push(lay.name);
    np_walkRegLayer(lay, lay.name, ab, items, 0);
  }
  if (!names.length) throw np_E('NO_REG_LAYERS');
  if (!items.length) throw np_E('NO_REG_MARKS');
  return { document: doc.name, w: np_r(ab[2] - ab[0]), h: np_r(ab[1] - ab[3]), layers: names, items: items };
}

// the reg layers in the same order as the template (top to bottom), above everything the layout made
function np_regLayers(doc, names) {
  var out = {};
  for (var i = names.length - 1; i >= 0; i--) {
    var lay = np_layer(doc, names[i]);
    try {
      lay.zOrder(ZOrderMethod.BRINGTOFRONT);
    } catch (e) {}
    out[names[i]] = lay;
  }
  return out;
}

// the layer that holds the marks: reg_1 (else the bottom one)
function np_regMarkLayer(names) {
  for (var i = 0; i < names.length; i++) {
    if (/^reg_1(\s|$)/i.test(names[i])) return names[i];
  }
  return names[names.length - 1];
}

// marks learned with np_readMarks: [{ layer, closed, cp, fill, stroke, sw, pts }] already moved for this sheet
function np_drawMarkPaths(doc, layers, fallback, paths, ox, oy) {
  var cps = {};
  for (var i = 0; i < paths.length; i++) {
    var m = paths[i];
    var lay = layers[m.layer] || fallback;
    var p;
    if (m.cp) {
      var key = m.layer + '#' + m.cp;
      if (!cps[key]) cps[key] = lay.compoundPathItems.add();
      p = cps[key].pathItems.add();
    } else p = lay.pathItems.add();
    var sp = { closed: m.closed, points: [] };
    for (var k = 0; k < m.pts.length; k++) {
      var q = m.pts[k];
      sp.points.push({ a: [ox + q[0], oy - q[1]], l: [ox + q[2], oy - q[3]], r: [ox + q[4], oy - q[5]] });
    }
    np_applyPoints(p, sp);
    var fill = np_makeColor(doc, m.fill);
    var stroke = np_makeColor(doc, m.stroke);
    p.filled = !!fill;
    if (fill) p.fillColor = fill;
    p.stroked = !!stroke;
    if (stroke) {
      p.strokeColor = stroke;
      p.strokeWidth = m.sw;
    }
  }
}

// args: {
//   target: 'artboard' (new artboards next to the existing ones in the source document, default)
//         | 'document' (a separate new document - used for exporting),
//   sheets: [{ w, h, name, pieces: [{ part, angle, tx, ty, name }], marks: [], markPaths: [], header: {}, gridLines: [] }],
//   layerNames: { pieces, cut, marks, header }, cutNames, spotName, strokeWidth, dropPieceCuts,
//   regLayers: ['margin ...', 'color ...', 'reg_2 ...', 'reg_1 ...'] (Graphtec: marks go into regLayers[last])
//   template: { abIndex } - the shop's template artboard: with target 'artboard' sheet 1 goes straight into it
//             (an earlier layout there is replaced), every other sheet gets a copy of the template
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
  var tplRect = null;
  var tplItems = [];
  var removed = 0;
  if (args.template) {
    tplRect = src.artboards[args.template.abIndex].artboardRect;
    tplItems = np_templateItems(src, tplRect);
  }
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
  var layHeader = np_layer(doc, names.header || 'Header');
  var regNames = args.regLayers && args.regLayers.length ? args.regLayers : null;
  var regs = regNames ? np_regLayers(doc, regNames) : null;
  var layMarks = regs ? regs[np_regMarkLayer(regNames)] : np_layer(doc, names.marks || 'Marks');
  var color = np_black(doc);
  var spot = np_spot(doc, args.spotName || 'CutContour');

  var x = left;
  var rowLeft = left;
  var rowH = 0;
  var placed = 0;
  var firstIndex = -1;
  var groups = [];
  var inPlace = !!tplRect && !newDoc;
  if (inPlace) removed = np_removeTagged(doc, tplRect);
  for (i = 0; i < sheets.length; i++) {
    var sh = sheets[i];
    if (i > 0 && x + sh.w - rowLeft > 15000) {
      x = rowLeft;
      top -= rowH + GAP;
      rowH = 0;
    }
    var rect = [x, top, x + sh.w, top - sh.h];
    var abIndex;
    if (inPlace && i === 0) {
      // sheet 1 = the template artboard itself
      rect = [tplRect[0], tplRect[1], tplRect[2], tplRect[3]];
      abIndex = args.template.abIndex;
      firstIndex = abIndex;
      for (k = 0; k < sh.pieces.length; k++) {
        groups.push(np_tag(np_placePiece(np_stockFor(sh.pieces[k].part, layPieces), layPieces, sh.pieces[k], rect[0], rect[1])));
        placed++;
      }
      if (sh.gridLines && sh.gridLines.length) np_drawLines(layCut || layPieces, sh.gridLines, rect[0], rect[1], spot, args.strokeWidth);
      if (sh.cutPolys && sh.cutPolys.length) np_drawPolys(layCut || layPieces, sh.cutPolys, rect[0], rect[1], spot, args.strokeWidth);
      continue;
    }
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
    if (tplRect) np_copyTemplate(tplItems, tplRect, doc, rect);

    for (k = 0; k < sh.pieces.length; k++) {
      var pc = sh.pieces[k];
      groups.push(np_tag(np_placePiece(np_stockFor(pc.part, layPieces), layPieces, pc, rect[0], rect[1])));
      placed++;
    }
    if (sh.marks && sh.marks.length) np_drawMarks(layMarks, sh.marks, rect[0], rect[1], color);
    if (sh.markPaths && sh.markPaths.length) np_drawMarkPaths(doc, regs || {}, layMarks, sh.markPaths, rect[0], rect[1]);
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
      else if (layCut) {
        cuts[i].move(layCut, ElementPlacement.PLACEATEND);
        np_tag(cuts[i]);
      }
    } catch (eMove) {}
  }
  var parked = inPlace ? np_parkParts(tplRect) : 0;
  try {
    doc.artboards.setActiveArtboardIndex(firstIndex);
    doc.selection = null;
    app.executeMenuCommand('fitin');
  } catch (eView) {}
  return {
    document: doc.name,
    sheets: sheets.length,
    pieces: placed,
    newDocument: newDoc,
    firstArtboard: firstIndex,
    template: inPlace,
    replaced: removed,
    parked: parked
  };
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
  // layouts laid into the shop template (tagged, on any artboard)
  removedItems += np_removeTagged(doc, [-1e9, 1e9, 1e9, -1e9]);
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
