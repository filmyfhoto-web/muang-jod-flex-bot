import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveMenuCommand } from '../src/utils/menuCommands.js';

// The Rich Menu is artwork plus a list of tappable rectangles, and the two are
// kept in step by hand. These guard the ways that pairing silently breaks.

const script = readFileSync(new URL('../scripts/create-rich-menu.js', import.meta.url), 'utf8');
const builder = readFileSync(new URL('../scripts/build-rich-menu.mjs', import.meta.url), 'utf8');

const num = (src, key) => Number(new RegExp(`${key}:\\s*(\\d+)`).exec(src)?.[1]);
const LAYOUT = {
  width: num(script, 'width'),
  height: num(script, 'height'),
  cols: num(script, 'cols'),
  rows: num(script, 'rows'),
  marginLeft: num(script, 'marginLeft'),
  marginRight: num(script, 'marginRight'),
  marginTop: num(script, 'marginTop'),
  footerHeight: num(script, 'footerHeight'),
};

// Every label printed on a card must reach a handler. A Rich Menu built in OA
// Manager sends these as plain text, so a typo here is a dead button.
const LABELS = [...script.matchAll(/label:\s*'([^']+)'/g)].map((m) => m[1]);

test('every Rich Menu button label resolves to an action', () => {
  assert.equal(LABELS.length, LAYOUT.cols * LAYOUT.rows, 'one label per grid cell');
  for (const label of LABELS) {
    assert.ok(resolveMenuCommand(label), `"${label}" resolves to no action`);
  }
});

test('the artwork and the tap grid describe the same geometry', () => {
  const b = {
    W: num(builder, 'W = 2500') || Number(/const W = (\d+)/.exec(builder)?.[1]),
    H: Number(/H = (\d+)/.exec(builder)?.[1]),
    panel: Number(/PANEL_W = (\d+)/.exec(builder)?.[1]),
    top: Number(/TOP = (\d+)/.exec(builder)?.[1]),
    footer: Number(/FOOTER_H = (\d+)/.exec(builder)?.[1]),
    cols: Number(/COLS = (\d+)/.exec(builder)?.[1]),
    rows: Number(/ROWS = (\d+)/.exec(builder)?.[1]),
  };
  assert.equal(b.W, LAYOUT.width);
  assert.equal(b.H, LAYOUT.height);
  assert.equal(b.panel, LAYOUT.marginLeft);
  assert.equal(b.top, LAYOUT.marginTop);
  assert.equal(b.footer, LAYOUT.footerHeight);
  assert.equal(b.cols, LAYOUT.cols);
  assert.equal(b.rows, LAYOUT.rows);
});

test('the tap areas tile the grid and stay inside the image', () => {
  const gridW = LAYOUT.width - LAYOUT.marginLeft - LAYOUT.marginRight;
  const gridH = LAYOUT.height - LAYOUT.marginTop - LAYOUT.footerHeight;
  const cellW = Math.floor(gridW / LAYOUT.cols);
  const cellH = Math.floor(gridH / LAYOUT.rows);

  // LINE requires at least 1px; anything under a finger's width is a bug.
  assert.ok(cellW >= 200 && cellH >= 200, `cells too small: ${cellW}x${cellH}`);

  const seen = new Set();
  for (let i = 0; i < LAYOUT.cols * LAYOUT.rows; i += 1) {
    const x = LAYOUT.marginLeft + (i % LAYOUT.cols) * cellW;
    const y = LAYOUT.marginTop + Math.floor(i / LAYOUT.cols) * cellH;
    assert.ok(x >= LAYOUT.marginLeft, 'area starts left of the grid');
    assert.ok(x + cellW <= LAYOUT.width, 'area runs past the right edge');
    assert.ok(y + cellH <= LAYOUT.height, 'area runs past the bottom edge');
    const key = `${x},${y}`;
    assert.ok(!seen.has(key), `two areas share the corner ${key}`);
    seen.add(key);
  }
});
