import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminToken, keyMatches, readKey } from '../src/routes/admin.js';
import {
  installRichMenu,
  resolveImage,
  getRichMenuStatus,
  ensureRichMenu,
  menuIsCurrent,
  imageFingerprint,
  expectedMenuName,
  RICH_MENU_NAME,
} from '../src/services/richMenuInstaller.js';
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

  assert.equal(line.calls.created.name, expectedMenuName(buildAreas().length));
  assert.ok(line.calls.created.name.startsWith(RICH_MENU_NAME), 'still recognisably ours');
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

function fakeStatus({ menus = [], defaultId = null } = {}) {
  return {
    client: {
      getRichMenuList: async () => ({ richmenus: menus }),
      getDefaultRichMenuId: async () => {
        if (!defaultId) throw Object.assign(new Error('not found'), { statusCode: 404 });
        return { richMenuId: defaultId };
      },
    },
    blobClient: {},
  };
}

test('status says which menu LINE is actually using', async () => {
  const status = await getRichMenuStatus(
    fakeStatus({
      defaultId: 'rm-old',
      menus: [
        { richMenuId: 'rm-old', name: RICH_MENU_NAME, size: { width: 2500, height: 1686 }, areas: new Array(12) },
        { richMenuId: 'rm-other', name: 'someone-else', size: { width: 2500, height: 843 }, areas: new Array(2) },
      ],
    })
  );

  assert.equal(status.defaultId, 'rm-old');
  assert.equal(status.menus.length, 2);

  const active = status.menus.find((m) => m.isDefault);
  assert.equal(active.id, 'rm-old');
  assert.equal(active.isOurs, true);
  // The stale menu has 12 areas where the current one has 9, which is what
  // lets the page say "still the old menu" instead of guessing.
  assert.equal(active.areas, 12);
  assert.equal(status.expected.areas, buildAreas().length);
  assert.notEqual(active.areas, status.expected.areas);

  assert.equal(status.menus.find((m) => m.id === 'rm-other').isOurs, false);
});

test('a channel with no default at all is reported, not thrown', async () => {
  // LINE answers 404 rather than an empty value, which would otherwise take
  // the whole page down instead of telling the shop what is wrong.
  const status = await getRichMenuStatus(
    fakeStatus({ menus: [{ richMenuId: 'rm-1', name: RICH_MENU_NAME, size: {}, areas: [] }] })
  );
  assert.equal(status.defaultId, null);
  assert.equal(status.menus.every((m) => !m.isDefault), true);

  const empty = await getRichMenuStatus(fakeStatus({}));
  assert.deepEqual(empty.menus, []);
});

test('boot installs the menu only when the live one does not match', async () => {
  const name = expectedMenuName(buildAreas().length);
  const current = {
    menus: [{ id: 'rm-1', name, size: { width: 2500, height: 1686 }, areas: buildAreas().length, isDefault: true }],
    expected: { name, size: { width: 2500, height: 1686 }, areas: buildAreas().length },
  };
  assert.equal(menuIsCurrent(current), true, 'same name, size and area count');

  // The old menu: same name and size, twelve areas instead of nine.
  const stale = { ...current, menus: [{ ...current.menus[0], areas: 12 }] };
  assert.equal(menuIsCurrent(stale), false, 'a different area count is a different menu');

  // Nothing set as default, and somebody else's menu, are both "not ours".
  assert.equal(menuIsCurrent({ ...current, menus: [{ ...current.menus[0], isDefault: false }] }), false);
  assert.equal(menuIsCurrent({ ...current, menus: [{ ...current.menus[0], name: 'other-bot' }] }), false);
  assert.equal(menuIsCurrent({ menus: [], expected: current.expected }), false);
});

test('a menu drawn from different artwork is stale, even with the same buttons', async () => {
  // The bug this exists for: shipping the shop's own picture changed nothing
  // but the image — same nine areas, same size, same name — so boot compared
  // those three, found them equal, and installed nothing. The shop kept seeing
  // the previous artwork and there was no way to tell from the phone.
  //
  // LINE cannot hand back the image of an installed menu, so the only place a
  // "which picture is this" can live is the menu's name.
  const areas = buildAreas().length;
  const size = { width: 2500, height: 1686 };
  const expected = { name: expectedMenuName(areas), size, areas };

  const sameArtwork = { expected, menus: [{ id: 'rm-1', name: expected.name, size, areas, isDefault: true }] };
  assert.equal(menuIsCurrent(sameArtwork), true);

  const otherArtwork = {
    expected,
    menus: [{ id: 'rm-1', name: `${RICH_MENU_NAME}-${areas}-0000000000`, size, areas, isDefault: true }],
  };
  assert.equal(menuIsCurrent(otherArtwork), false, 'a new picture over the same buttons must reinstall');
});

test('the fingerprint follows the file, and a missing file does not throw', () => {
  const real = imageFingerprint(resolveImage({}).path);
  assert.match(real, /^[0-9a-f]{10}$/, 'ten hex characters of sha256');
  assert.notEqual(imageFingerprint('/nowhere/rich-menu.jpg'), real, 'a different file, a different name');
  assert.equal(imageFingerprint('/nowhere/rich-menu.jpg'), 'noimage', 'naming the menu must not be what fails');
  assert.equal(expectedMenuName(9, resolveImage({}).path), `${RICH_MENU_NAME}-9-${real}`);
});

test('boot never lets a menu failure stop the bot', async () => {
  // The bot answering messages matters more than its menu being current.
  const exploding = {
    client: {
      getRichMenuList: async () => {
        throw new Error('LINE is down');
      },
      getDefaultRichMenuId: async () => null,
    },
    blobClient: {},
  };
  const result = await ensureRichMenu({}, exploding);
  assert.ok(result.error, 'the failure is reported, not thrown');
});

test('boot does nothing when the menu is already live, or when switched off', async () => {
  const line = fakeLine();
  const live = {
    ...line,
    client: {
      ...line.client,
      getRichMenuList: async () => ({
        richmenus: [
          {
            richMenuId: 'rm-live',
            // Named for the artwork this build actually ships, which is what
            // makes it the same menu rather than merely the same shape.
            name: expectedMenuName(buildAreas().length),
            size: { width: 2500, height: 1686 },
            areas: buildAreas(),
          },
        ],
      }),
      getDefaultRichMenuId: async () => ({ richMenuId: 'rm-live' }),
    },
  };

  const skipped = await ensureRichMenu({}, live);
  assert.equal(skipped.skipped, 'already current');
  assert.equal(line.calls.created, null, 'a restart must not re-upload the same menu');

  const off = await ensureRichMenu({ RICH_MENU_AUTO_INSTALL: '0' }, live);
  assert.equal(off.skipped, 'disabled');
});

test('boot installs when the live menu is the old one', async () => {
  const line = fakeLine([{ richMenuId: 'rm-old', name: RICH_MENU_NAME }]);
  const stale = {
    ...line,
    client: {
      ...line.client,
      getRichMenuList: async () => ({
        richmenus: [
          // The old menu: right name, twelve areas.
          { richMenuId: 'rm-old', name: RICH_MENU_NAME, size: { width: 2500, height: 1686 }, areas: new Array(12) },
        ],
      }),
      getDefaultRichMenuId: async () => ({ richMenuId: 'rm-old' }),
    },
    readImage: async () => Buffer.from('IMAGEDATA'),
  };

  const result = await ensureRichMenu({}, stale);

  assert.ok(result.richMenuId, 'a menu was installed');
  assert.equal(line.calls.created.areas.length, buildAreas().length, 'the current areas went up');
  assert.equal(line.calls.def, result.richMenuId, 'and it was made the default');
});
