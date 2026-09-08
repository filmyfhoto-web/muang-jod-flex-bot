import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveMenuCommand } from '../src/utils/menuCommands.js';
import { POSTBACK_ACTIONS } from '../src/utils/validation.js';
import { buildAreas, LAYOUT, BUTTONS, STRIP, PANEL } from '../scripts/create-rich-menu.js';

// The Rich Menu is artwork plus a list of tappable rectangles, kept in step by
// hand. These guard the ways that pairing silently breaks.

const builder = readFileSync(new URL('../scripts/build-rich-menu.mjs', import.meta.url), 'utf8');
const nOf = (key) => Number(new RegExp(`${key} = (\\d+)`).exec(builder)?.[1]);

test('every button reaches a handler, by tap and by text', () => {
  const all = [...BUTTONS, ...STRIP, PANEL];
  assert.equal(all.length, LAYOUT.cols * LAYOUT.rows + LAYOUT.stripCols + 1);

  for (const btn of all) {
    const action = /action=([a-z_]+)/.exec(btn.data)?.[1];
    // A postback whose action the router does not know is a dead button.
    assert.ok(POSTBACK_ACTIONS.includes(action), `${btn.label}: unknown action "${action}"`);
    // A menu built in OA Manager sends the label as text instead, so that
    // path has to land on the same action.
    assert.equal(resolveMenuCommand(btn.label), action, `${btn.label}: text does not resolve to ${action}`);
  }
});

test('the artwork and the tap areas describe the same geometry', () => {
  assert.equal(nOf('W'), LAYOUT.width);
  assert.equal(nOf('H'), LAYOUT.height);
  assert.equal(nOf('PANEL_W'), LAYOUT.marginLeft);
  assert.equal(nOf('RIGHT'), LAYOUT.marginRight);
  assert.equal(nOf('TOP'), LAYOUT.marginTop);
  assert.equal(nOf('STRIP_H'), LAYOUT.stripHeight);
  assert.equal(nOf('COLS'), LAYOUT.cols);
  assert.equal(nOf('ROWS'), LAYOUT.rows);
  assert.equal(nOf('STRIP_COLS'), LAYOUT.stripCols);
});

test('the areas stay inside the image, never overlap, and are big enough to tap', () => {
  const areas = buildAreas();
  assert.equal(areas.length, BUTTONS.length + STRIP.length + 1);

  for (const { bounds, action } of areas) {
    assert.ok(bounds.width >= 200 && bounds.height >= 200, `${action.displayText}: ${bounds.width}x${bounds.height} too small`);
    assert.ok(bounds.x >= 0 && bounds.y >= 0, `${action.displayText}: starts outside the image`);
    assert.ok(bounds.x + bounds.width <= LAYOUT.width, `${action.displayText}: runs past the right edge`);
    assert.ok(bounds.y + bounds.height <= LAYOUT.height, `${action.displayText}: runs past the bottom edge`);
  }

  // No two rectangles may share a pixel — LINE would take whichever it likes.
  for (let i = 0; i < areas.length; i += 1) {
    for (let j = i + 1; j < areas.length; j += 1) {
      const a = areas[i].bounds;
      const b = areas[j].bounds;
      const apart =
        a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
      assert.ok(apart, `${areas[i].action.displayText} overlaps ${areas[j].action.displayText}`);
    }
  }
});

test('the grid clears the brand panel and the strip reaches both edges', () => {
  const areas = buildAreas();
  const grid = areas.slice(0, BUTTONS.length);
  const strip = areas.slice(BUTTONS.length, BUTTONS.length + STRIP.length);

  for (const a of grid) {
    assert.ok(a.bounds.x >= LAYOUT.marginLeft, `${a.action.displayText} sits on the brand panel`);
    assert.ok(a.bounds.y + a.bounds.height <= LAYOUT.height - LAYOUT.stripHeight, 'grid runs into the strip');
  }

  assert.equal(strip[0].bounds.x, 0);
  const last = strip[strip.length - 1].bounds;
  assert.equal(last.x + last.width, LAYOUT.width, 'the strip leaves a gap at the right edge');
  assert.ok(strip.every((a) => a.bounds.y === LAYOUT.height - LAYOUT.stripHeight));
});

test('the mascot panel is tappable and covers everything left of the grid', () => {
  const panel = buildAreas().at(-1);
  assert.equal(panel.action.data, PANEL.data);
  assert.deepEqual(panel.bounds, {
    x: 0,
    y: 0,
    width: LAYOUT.marginLeft,
    height: LAYOUT.height - LAYOUT.stripHeight,
  });
  // It is the biggest target on the menu, so a gap here would be the most
  // annoying kind: a press that lands on nothing.
  assert.ok(panel.bounds.width * panel.bounds.height > 1_000_000);
});
