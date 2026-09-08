import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminToken, keyMatches } from '../src/routes/admin.js';
import { installRichMenu, RICH_MENU_NAME } from '../src/services/richMenuInstaller.js';
import { buildAreas } from '../scripts/create-rich-menu.js';

// The page installs a menu every user of the bot then sees, so the guard on it
// matters as much as the install itself.

test('the page stays off until a long enough ADMIN_TOKEN is set', () => {
  assert.equal(adminToken({}), null, 'no token: off');
  assert.equal(adminToken({ ADMIN_TOKEN: '   ' }), null, 'blank: off');
  assert.equal(adminToken({ ADMIN_TOKEN: 'short' }), null, 'a guessable token is not accepted');
  assert.equal(adminToken({ ADMIN_TOKEN: 'a'.repeat(16) }), 'a'.repeat(16));
});

test('the key has to match exactly, and a wrong length is rejected not thrown', () => {
  const secret = 's3cret-token-abcdefgh';
  assert.equal(keyMatches(secret, secret), true);
  assert.equal(keyMatches(secret.slice(0, -1), secret), false, 'shorter');
  assert.equal(keyMatches(secret + 'x', secret), false, 'longer');
  assert.equal(keyMatches('', secret), false);
  assert.equal(keyMatches(undefined, secret), false);
  assert.equal(keyMatches(secret, null), false, 'no expected key means no match');
});

function fakeLine(existing = []) {
  const calls = { created: null, image: null, def: null, deleted: [] };
  let n = 0;
  return {
    calls,
    client: {
      createRichMenu: async (menu) => {
        calls.created = menu;
        return { richMenuId: `rm-new-${++n}` };
      },
      setDefaultRichMenu: async (id) => {
        calls.def = id;
      },
      getRichMenuList: async () => ({ richmenus: existing }),
      deleteRichMenu: async (id) => {
        calls.deleted.push(id);
      },
    },
    blobClient: {
      setRichMenuImage: async (id, blob) => {
        calls.image = { id, size: blob.size, type: blob.type };
      },
    },
  };
}

test('installing uploads the image, sets the default, and sweeps up our old menus', async () => {
  const line = fakeLine([
    { richMenuId: 'rm-old', name: RICH_MENU_NAME },
    { richMenuId: 'rm-someone-else', name: 'another-bot-menu' },
  ]);

  const result = await installRichMenu({ ...line, readImage: async () => Buffer.from('PNGDATA') });

  assert.equal(line.calls.created.name, RICH_MENU_NAME);
  assert.equal(line.calls.created.areas.length, buildAreas().length, 'the CLI and the page install the same areas');
  assert.deepEqual(line.calls.created.size, { width: 2500, height: 1686 });
  assert.equal(line.calls.image.id, result.richMenuId, 'the image goes to the menu just created');
  assert.equal(line.calls.image.type, 'image/png');
  assert.equal(line.calls.def, result.richMenuId, 'and that menu becomes the default');

  assert.deepEqual(line.calls.deleted, ['rm-old'], 'only our own old menu is removed');
  assert.deepEqual(result.removed, ['rm-old']);
});

test('a menu that cannot be swept up does not fail the install', async () => {
  const line = fakeLine([{ richMenuId: 'rm-old', name: RICH_MENU_NAME }]);
  line.client.getRichMenuList = async () => {
    throw new Error('LINE list unavailable');
  };

  const result = await installRichMenu({ ...line, readImage: async () => Buffer.from('PNGDATA') });
  assert.equal(line.calls.def, result.richMenuId, 'the new menu is live regardless');
  assert.deepEqual(result.removed, []);
});
