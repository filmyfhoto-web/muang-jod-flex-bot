'use strict';
// ---------------------------------------------------------------------------------------------------------------
// Small helpers. Everything the page shows is built with h(): text goes in as text, never as markup.
// ---------------------------------------------------------------------------------------------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

// Icons: fixed strings of our own, never user text.
const ICONS = {
  key: '<path d="M14.5 9.5a4 4 0 1 0-3.9 3.1L12 14h1.5v1.5H15V17h1.5l1-1v-1.7l-3.9-3.9a4 4 0 0 0 .9-.9Z" /><circle cx="9.5" cy="8.5" r="1"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  up: '<path d="m6 14 6-6 6 6"/>',
  down: '<path d="m6 10 6 6 6-6"/>',
  grip: '<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>',
  text: '<path d="M5 6h14M12 6v13M9 19h6"/>',
  card: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 11h16M8 15h5"/>',
  image: '<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m5 18 5-5 3 3 2-2 4 4"/>',
  sticker: '<path d="M12 4a8 8 0 1 0 8 8c0-3-2-4-4-4a4 4 0 0 1-4-4Z"/><circle cx="9" cy="12" r="1"/><circle cx="14" cy="14" r="1"/>',
  silent: '<path d="M5 5l14 14M9 9v3a3 3 0 0 0 5 2m1-3V8a3 3 0 0 0-6-1M6 12a6 6 0 0 0 9 5m3-5v0"/>',
  flex: '<path d="M8 8 4 12l4 4M16 8l4 4-4 4M13.5 6l-3 12"/>',
  send: '<path d="m4 12 16-7-6 15-2-6-8-2Z"/>',
  play: '<path d="M7 5v14l12-7Z"/>',
  refresh: '<path d="M4 12a8 8 0 0 1 14-5l2-2v6h-6l2.2-2.2A5.5 5.5 0 0 0 6.5 12M20 12a8 8 0 0 1-14 5l-2 2v-6h6l-2.2 2.2A5.5 5.5 0 0 0 17.5 12"/>',
  save: '<path d="M5 4h11l3 3v13H5Z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
  history: '<path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4M12 8v5l3 2"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  warn: '<path d="M12 4 3 20h18Z"/><path d="M12 10v5M12 17.5v.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  bot: '<rect x="5" y="8" width="14" height="10" rx="3"/><path d="M12 4v4M9 13v1M15 13v1"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.2-4.2"/>',
};
function icon(name, size = 16) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[name] || '';
  return svg;
}

const debounce = (fn, ms) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};
const clone = (x) => JSON.parse(JSON.stringify(x));
const clip = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));

function toast(text, kind = 'ok') {
  const box = $('#toasts');
  if (!box) return;
  const t = h('div', { class: 'toast toast-' + kind, role: 'status' }, text);
  box.append(t);
  setTimeout(() => t.classList.add('out'), 3200);
  setTimeout(() => t.remove(), 3700);
}

// UTF-8 text → base64 (so any text can travel inside a SQL statement without quoting trouble)
function b64(str) {
  const bytes = new TextEncoder().encode(str);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const sqlText = (str) => `convert_from(decode('${b64(str)}', 'base64'), 'UTF8')`;

// "19 ต.ค. 23:44" in Bangkok time
function thaiTime(iso) {
  try {
    const d = new Date(iso);
    const parts = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
    return parts;
  } catch {
    return String(iso);
  }
}
