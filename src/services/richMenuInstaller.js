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
