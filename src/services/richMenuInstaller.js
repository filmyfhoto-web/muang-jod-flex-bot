import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import linebot from '@line/bot-sdk';
import { lineConfig } from '../config/line.js';
import { buildAreas, LAYOUT } from '../../scripts/create-rich-menu.js';
import { logger } from './logger.js';

// Installs the Rich Menu from inside the running bot, so it can be done from a
// browser instead of a terminal. The geometry comes from create-rich-menu.js —
// the same module the CLI and the tests use, so there is one definition of
// where the buttons are.

const { MessagingApiClient, MessagingApiBlobClient } = linebot.messagingApi;

export const RICH_MENU_NAME = 'muang-jod-main';

// The artwork is a JPEG now: two photographic cut-outs over wide gradients came
// to ~1.5 MB as a PNG, over LINE's 1 MB cap. This used to name the .png
// outright, so after that change the install button threw ENOENT and the menu
// silently never appeared. Look for whichever file is actually there, and take
// the content type from its name rather than assuming.
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CANDIDATES = ['assets/rich-menu.jpg', 'assets/rich-menu.png'];

export function resolveImage(env = process.env, root = ROOT) {
  const override = String(env.RICH_MENU_IMAGE_PATH ?? '').trim();
  const path = override || CANDIDATES.map((c) => root + c).find((c) => existsSync(c)) || root + CANDIDATES[0];
  const contentType = /\.png$/i.test(path) ? 'image/png' : 'image/jpeg';
  return { path, contentType };
}

function clients(deps = {}) {
  if (deps.client && deps.blobClient) return deps;
  const channelAccessToken = lineConfig.channelAccessToken;
  return {
    client: deps.client || new MessagingApiClient({ channelAccessToken }),
    blobClient: deps.blobClient || new MessagingApiBlobClient({ channelAccessToken }),
  };
}

// What LINE actually has right now. "ริชเมนูไม่เปลี่ยน" has several causes that
// look identical from the phone — the install never ran, it installed but the
// app is showing a cached menu, or something else in the channel is set as the
// default. Guessing between them from a screenshot is not possible; this reads
// the answer out of LINE.
export async function getRichMenuStatus(deps = {}) {
  const { client } = clients(deps);
  const [list, defaultId] = await Promise.all([
    client.getRichMenuList(),
    // A channel with no default set answers 404 rather than an empty value.
    client.getDefaultRichMenuId().then(
      (r) => r?.richMenuId ?? r ?? null,
      () => null
    ),
  ]);

  const menus = (list?.richmenus || []).map((m) => ({
    id: m.richMenuId,
    name: m.name,
    size: m.size,
    chatBarText: m.chatBarText,
    areas: (m.areas || []).length,
    isDefault: m.richMenuId === defaultId,
    isOurs: m.name === RICH_MENU_NAME,
  }));

  return { defaultId, menus, expected: { name: RICH_MENU_NAME, size: LAYOUT, areas: buildAreas().length } };
}

// Is LINE already showing the menu this build ships?
//
// The menu is identified by its shape, not by an id we store: the id changes
// every install, and the thing that actually matters is whether what the shop
// sees matches what the code draws. A different area count is the reliable
// tell — the old menu had 12 where this one has 9.
export function menuIsCurrent(status) {
  const active = status?.menus?.find((m) => m.isDefault);
  if (!active) return false;
  return (
    active.name === status.expected.name &&
    active.areas === status.expected.areas &&
    active.size?.width === status.expected.size.width &&
    active.size?.height === status.expected.size.height
  );
}

// Install the menu on boot when it is not already the live one.
//
// Every other way in costs the shop a step somewhere else — an env var to set,
// a page to find, a terminal to open — and each of those is a place to get
// stuck. The bot already holds the channel token, so it can just do this.
//
// Safe to run on every boot: it looks first and does nothing when the live menu
// already matches, so a restart is not an upload. It never throws — a menu that
// failed to install must not stop the bot from answering messages.
// RICH_MENU_AUTO_INSTALL=0 turns it off.
export async function ensureRichMenu(env = process.env, deps = {}) {
  if (String(env.RICH_MENU_AUTO_INSTALL ?? '1') === '0') {
    logger.info('richmenu.auto_skipped', { reason: 'disabled' });
    return { skipped: 'disabled' };
  }

  try {
    const status = await getRichMenuStatus(deps);
    if (menuIsCurrent(status)) {
      logger.info('richmenu.auto_ok', { richMenuId: status.defaultId });
      return { skipped: 'already current', richMenuId: status.defaultId };
    }

    const active = status.menus.find((m) => m.isDefault);
    logger.info('richmenu.auto_installing', {
      was: active ? `${active.name} · ${active.areas} areas` : 'none',
      want: `${status.expected.name} · ${status.expected.areas} areas`,
    });

    const result = await installRichMenu(deps);
    logger.info('richmenu.auto_installed', { richMenuId: result.richMenuId, areas: result.areas });
    return result;
  } catch (err) {
    logger.error('richmenu.auto_failed', { message: err?.body ? JSON.stringify(err.body) : err?.message });
    return { error: err?.message || String(err) };
  }
}

// Create the menu, upload its image, make it the default, then clear away the
// menus this bot created before. Only menus carrying our own name are removed,
// and never the one just installed — anything else in the channel is somebody
// else's and is left alone.
export async function installRichMenu(deps = {}) {
  const { client, blobClient } = clients(deps);
  const { path, contentType } = deps.image || resolveImage();
  const readImage = deps.readImage || (() => readFile(path));

  const image = await readImage();

  const richMenu = {
    size: { width: LAYOUT.width, height: LAYOUT.height },
    selected: true,
    name: RICH_MENU_NAME,
    chatBarText: 'เมนูม่วงจด',
    areas: buildAreas(),
  };

  const { richMenuId } = await client.createRichMenu(richMenu);
  await blobClient.setRichMenuImage(richMenuId, new Blob([image], { type: deps.contentType || contentType }));
  await client.setDefaultRichMenu(richMenuId);

  const removed = [];
  try {
    const list = await client.getRichMenuList();
    for (const menu of list?.richmenus || []) {
      if (menu.richMenuId === richMenuId || menu.name !== RICH_MENU_NAME) continue;
      await client.deleteRichMenu(menu.richMenuId);
      removed.push(menu.richMenuId);
    }
  } catch (err) {
    // The new menu is already live; a leftover old one is untidy, not broken.
    logger.warn('richmenu.cleanup_failed', { message: err?.message });
  }

  logger.info('richmenu.installed', { richMenuId, areas: richMenu.areas.length, removed: removed.length, image: path });
  return { richMenuId, areas: richMenu.areas.length, removed };
}
