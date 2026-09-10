import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminToken, keyMatches, readKey } from '../src/routes/admin.js';
import { installRichMenu, resolveImage, RICH_MENU_NAME } from '../src/services/richMenuInstaller.js';
import { existsSync, statSync } from 'node:fs';
import { buildAreas } from '../scripts/create-rich-menu.js';

// The page installs a menu every user of the bot then sees, so the guard on it
// matters as much as the install itself.

test('the page stays off until a long enough ADMIN_TOKEN is set', () => {
  assert.equal(adminToken({}), null, 'no token: off');
  assert.equal(adminToken({ ADMIN_TOKEN: '   ' }), null, 'blank: off');
  assert.equal(adminToken({ ADMIN_TOKEN: 'short' }), null, 'a guessable token is not accepted');
  assert.equal(adminToken({ ADMIN_TOKEN: 'a'.repeat(16) }), 'a'.repeat(16));
});

test('the key is read from a header, Basic auth, or the query — in that order', () => {
  const req = (headers = {}, query = {}) => ({
    get: (name) => headers[name.toLowerCase()],
    query,
  });
  const basic = (user, pass) => `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;

  assert.equal(readKey(req({ 'x-admin-token': 'from-header' }, { key: 'from-query' })), 'from-header');
  assert.equal(readKey(req({ authorization: basic('admin', 'from-basic') })), 'from-basic');
  assert.equal(readKey(req({}, { key: 'from-query' })), 'from-query');
  assert.equal(readKey(req()), '', 'nothing supplied');

  // The username is ignored, and a password containing a colon survives.
  assert.equal(readKey(req({ authorization: basic('', 'a:b:c') })), 'a:b:c');
  assert.equal(readKey(req({ authorization: 'Basic !!not-base64!!' })), '');
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
  // Whatever the artwork actually is — hardcoding png here is what let the
  // rename slip through unnoticed.
  assert.equal(line.calls.image.type, resolveImage({}).contentType);
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

test('the artwork the installer will upload actually exists', () => {
  // The other tests here stub readImage, so when the artwork was renamed from
  // .png to .jpg they all still passed while the install button threw ENOENT
  // and the menu silently never appeared. This one touches the real file.
  const { path, contentType } = resolveImage({});
  assert.ok(existsSync(path), `installer points at ${path}, which is not there`);
  assert.equal(contentType, /\.png$/i.test(path) ? 'image/png' : 'image/jpeg');

  // LINE rejects anything over 1 MB, and the upload is the only place that
  // would tell you — after the menu row has already been created.
  const kb = statSync(path).size / 1024;
  assert.ok(kb <= 1024, `${path} is ${kb.toFixed(0)} KB, over LINE's 1024 KB limit`);
});

test('an explicit RICH_MENU_IMAGE_PATH wins, and sets its own content type', () => {
  assert.deepEqual(resolveImage({ RICH_MENU_IMAGE_PATH: '/tmp/menu.png' }), {
    path: '/tmp/menu.png',
    contentType: 'image/png',
  });
  assert.equal(resolveImage({ RICH_MENU_IMAGE_PATH: '/tmp/menu.jpg' }).contentType, 'image/jpeg');
});
