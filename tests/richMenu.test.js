import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveMenuCommand } from '../src/utils/menuCommands.js';
import { POSTBACK_ACTIONS } from '../src/utils/validation.js';
import { buildAreas, LAYOUT, BUTTONS, FOOTER, GAME, SIGN } from '../scripts/create-rich-menu.js';
import { richMenuObject } from '../scripts/export-rich-menu-json.mjs';

// The Rich Menu is artwork plus a list of tappable rectangles, kept in step by
// hand. These guard the ways that pairing silently breaks.

const builder = readFileSync(new URL('../scripts/build-rich-menu.mjs', import.meta.url), 'utf8');
const nOf = (key) => Number(new RegExp(`${key} = (\\d+)`).exec(builder)?.[1]);

test('every button reaches a handler, by tap and by text', () => {
  const all = [...BUTTONS, SIGN, FOOTER, GAME];
  assert.equal(all.length, 11, 'eight cards, the sign-mockup card, the brand footer, and the game card');

  for (const btn of all) {
    const action = /action=([a-z_]+)/.exec(btn.data)?.[1];
    // A postback whose action the router does not know is a dead button.
    assert.ok(POSTBACK_ACTIONS.includes(action), `${btn.label}: unknown action "${action}"`);
    // A menu built in OA Manager sends the label as text instead, so that
    // path has to land on the same action.
    assert.equal(resolveMenuCommand(btn.label), action, `${btn.label}: text does not resolve to ${action}`);
  }
});

const config = readFileSync(new URL('../scripts/create-rich-menu.js', import.meta.url), 'utf8');
const cOf = (key) => Number(new RegExp(`${key} = (\\d+)`).exec(config)?.[1]);

test('the artwork and the tap areas describe the same geometry', () => {
  // Both files declare the grid independently; edit one alone and the buttons
  // drift off the cards they are drawn on.
  for (const key of ['PAD', 'GAP_X', 'GAP_Y', 'LEFT_W', 'COL_W', 'ROW_H', 'ROW3_H', 'ROW1_Y', 'GAME_W', 'SIGN_W']) {
    const drawn = nOf(key);
    const tapped = cOf(key);
    assert.ok(Number.isFinite(drawn), `${key} not declared in build-rich-menu.mjs`);
    assert.ok(Number.isFinite(tapped), `${key} not declared in create-rich-menu.js`);
    assert.equal(tapped, drawn, `${key}: artwork says ${drawn}, tap areas say ${tapped}`);
  }
  assert.equal(nOf('W'), LAYOUT.width);
  assert.equal(nOf('H'), LAYOUT.height);
});

test('the areas stay inside the image, never overlap, and are big enough to tap', () => {
  const areas = buildAreas();
  assert.equal(areas.length, BUTTONS.length + 3); // + การ์ดจำลองป้าย + แถวแบรนด์ + การ์ดเกม

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

test('the areas cover the whole image, so no press lands on nothing', () => {
  const areas = buildAreas();
  const covered = areas.reduce((sum, a) => sum + a.bounds.width * a.bounds.height, 0);
  assert.equal(covered, LAYOUT.width * LAYOUT.height, 'the tap areas leave a gap or overlap');

  // Every edge is reached, so a press near the rim is not lost.
  assert.ok(areas.some((a) => a.bounds.x === 0));
  assert.ok(areas.some((a) => a.bounds.y === 0));
  assert.ok(areas.some((a) => a.bounds.x + a.bounds.width === LAYOUT.width));
  assert.ok(areas.some((a) => a.bounds.y + a.bounds.height === LAYOUT.height));
});

test('the committed richmenu.json is what the code would generate', () => {
  // assets/richmenu.json is what the curl installer posts. It is generated, so
  // the failure it guards is editing the areas and shipping a stale file — the
  // artwork and the SDK path would move, the curl path would not.
  const onDisk = JSON.parse(readFileSync(new URL('../assets/richmenu.json', import.meta.url), 'utf8'));
  assert.deepEqual(onDisk, richMenuObject(), 'run: node scripts/export-rich-menu-json.mjs');
});

test('จดงาน is the biggest target, and the brand footer is tappable', () => {
  const areas = buildAreas();
  const jot = areas[0];
  assert.equal(jot.action.data, 'action=add_job');
  const biggest = areas.reduce((a, b) => (a.bounds.width * a.bounds.height >= b.bounds.width * b.bounds.height ? a : b));
  assert.equal(biggest.action.data, jot.action.data, 'จดงาน should be the largest area');

  // เดิมแถวแบรนด์กินเต็มความกว้าง — ตั้งแต่ร้านสั่งเชื่อมเกม (23 พ.ย. 69)
  // ปลายขวาของแถวเป็นการ์ดเกม สองพื้นที่ต่อกันพอดีเต็มความกว้างเหมือนเดิม
  // ต้นซ้ายของแถวเป็นการ์ดจำลองป้าย 3D (ร้านขอ 24 พ.ย. 69) สามพื้นที่ต่อกันพอดีเต็มความกว้าง
  const sign = areas.at(-3);
  const footer = areas.at(-2);
  const game = areas.at(-1);
  assert.equal(footer.action.data, FOOTER.data);
  assert.equal(sign.bounds.x, 0);
  assert.equal(footer.bounds.x, sign.bounds.width);
  assert.equal(sign.bounds.y + sign.bounds.height, LAYOUT.height);
  assert.equal(footer.bounds.y + footer.bounds.height, LAYOUT.height);
  assert.equal(game.action.data ?? 'action=open_game', 'action=open_game');
  assert.equal(sign.bounds.width + footer.bounds.width + game.bounds.width, LAYOUT.width);
  assert.equal(game.bounds.x + game.bounds.width, LAYOUT.width);
  assert.equal(game.bounds.y + game.bounds.height, LAYOUT.height);
  // มีแค่ PUBLIC_BASE_URL → ปุ่มเกมเปิด /game/ โหมดสาธิตตรง ๆ (ทางสำรอง)
  const linked = buildAreas({ PUBLIC_BASE_URL: 'https://shop.example' }).at(-1);
  assert.equal(linked.action.type, 'uri');
  assert.equal(linked.action.uri, 'https://shop.example/game/');

  /* มี LIFF (ของจริงบน Render ตั้งไว้แล้ว) → ปุ่มเกมเปิดผ่าน liff.line.me
   * = /app/game โหมดต่อระบบจริง ไลน์ล็อกอินให้เอง (ร้านสั่งเชื่อม 24 พ.ย. 69) */
  const real = buildAreas({ PUBLIC_BASE_URL: 'https://shop.example', LIFF_ID: '1234567890-abcdefgh' }).at(-1);
  assert.equal(real.action.type, 'uri');
  assert.equal(real.action.uri, 'https://liff.line.me/1234567890-abcdefgh/game');
});

test('การ์ดจำลองป้าย 3D: เปิดแอปจำลองป้าย /sign/ ตรง ๆ · ไม่มี base URL ถอยไป postback ให้บอตตอบลิงก์ · พิมพ์ "จำลองป้าย" ก็ได้', () => {
  const none = buildAreas({}).find((a) => a.action.label === 'จำลองป้าย 3D');
  assert.equal(none.action.type, 'postback');
  assert.equal(none.action.data, 'action=open_sign');
  const linked = buildAreas({ PUBLIC_BASE_URL: 'https://shop.example', LIFF_ID: '1234567890-abcdefgh' }).find((a) => a.action.label === 'จำลองป้าย 3D');
  assert.equal(linked.action.type, 'uri');
  assert.equal(linked.action.uri, 'https://shop.example/sign/');
  for (const t of ['จำลองป้าย 3D', 'จำลองป้าย', 'ทำภาพ 3 มิติ']) assert.equal(resolveMenuCommand(t), 'open_sign', t);
  const handler = readFileSync(new URL('../src/handlers/postbackHandler.js', import.meta.url), 'utf8');
  assert.match(handler, /case 'open_sign':\n\s*return openSign\(ctx\);/);
  const tile = readFileSync(new URL('../scripts/add-sign-tile.mjs', import.meta.url), 'utf8');
  assert.match(tile, /const SIGN_W = 840;/);
  assert.match(tile, /const FOOT_Y = 1418;/);
});
