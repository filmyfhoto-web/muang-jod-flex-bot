import linebot from '@line/bot-sdk';
import { lineConfig } from '../config/line.js';
import { themedContents } from '../flex/theme.js';
import { withQuickReply } from '../flex/quickReply.js';

const { MessagingApiClient, MessagingApiBlobClient } = linebot.messagingApi;

const client = new MessagingApiClient({
  channelAccessToken: lineConfig.channelAccessToken,
});

const blobClient = new MessagingApiBlobClient({
  channelAccessToken: lineConfig.channelAccessToken,
});

// Two things every outgoing message gets, stamped here rather than in each
// builder — one place to get right, and a new card cannot forget:
//
//   1) the card surface, because Flex defaults a bubble to white
//   2) the quick-reply bar, which is the only always-visible way to reach the
//      menu on LINE for desktop
//
// A builder that sets its own `styles` or `quickReply` still wins.
function toArray(messages) {
  const themed = (Array.isArray(messages) ? messages : [messages]).map((m) =>
    m?.type === 'flex' ? { ...m, contents: themedContents(m.contents) } : m
  );
  return withQuickReply(themed).map(withoutEcho);
}

// A postback's `displayText` posts the button's own label into the chat as if
// the shop had typed it, so every tap left a line of its own words sitting
// above the answer to it. The shop asked for a tap to just do the thing.
//
// Done here rather than at each of the forty-odd buttons: it is one rule about
// how this bot's buttons behave, and a rule kept in forty places is a rule that
// is already broken in one of them.
export function withoutEcho(value) {
  if (Array.isArray(value)) return value.map(withoutEcho);
  if (!value || typeof value !== 'object') return value;

  const out = {};
  for (const [key, v] of Object.entries(value)) {
    // `text` is the same field under a different name on older payloads.
    if (value.type === 'postback' && (key === 'displayText' || key === 'text')) continue;
    out[key] = withoutEcho(v);
  }
  return out;
}

// A reply token is good for about a minute and for one use. Reading a
// photographed document means downloading it and asking a model about it, and
// on a slow day that can outlast the token — at which point the bot says
// NOTHING, which is the one outcome a user cannot tell apart from a broken
// bot. So remember who each token belongs to, and if replying is refused,
// push the same messages instead. Late beats silent.
//
// Bounded and short-lived: tokens are useless after a minute anyway, and this
// must never become a way for a busy day to eat the process's memory.
const REPLY_TARGET_TTL_MS = 5 * 60 * 1000;
const MAX_REPLY_TARGETS = 500;
const replyTargets = new Map();

export function rememberReplyTarget(replyToken, userId) {
  if (!replyToken || !userId) return;
  if (replyTargets.size >= MAX_REPLY_TARGETS) {
    // Insertion-ordered, so the oldest is the first key.
    replyTargets.delete(replyTargets.keys().next().value);
  }
  replyTargets.set(replyToken, { userId, at: Date.now() });
}

function takeReplyTarget(replyToken) {
  const hit = replyTargets.get(replyToken);
  replyTargets.delete(replyToken);
  if (!hit || Date.now() - hit.at > REPLY_TARGET_TTL_MS) return null;
  return hit.userId;
}

// Reply to an event using its replyToken.
export async function reply(replyToken, messages) {
  try {
    await client.replyMessage({ replyToken, messages: toArray(messages) });
    replyTargets.delete(replyToken);
  } catch (err) {
    console.error('[lineService] reply failed:', err?.body || err?.message || err);

    const userId = takeReplyTarget(replyToken);
    if (!userId) throw err;

    try {
      await client.pushMessage({ to: userId, messages: toArray(messages) });
      console.warn('[lineService] reply token was refused; pushed instead');
      return;
    } catch (pushErr) {
      console.error('[lineService] push fallback failed:', pushErr?.body || pushErr?.message || pushErr);
      throw err; // the original failure is the useful one
    }
  }
}

// Push a message proactively to a user.
export async function push(to, messages) {
  try {
    await client.pushMessage({ to, messages: toArray(messages) });
  } catch (err) {
    console.error('[lineService] push failed:', err?.body || err?.message || err);
    throw err;
  }
}

// Fetch a user's LINE profile.
export async function getProfile(userId) {
  try {
    return await client.getProfile(userId);
  } catch (err) {
    console.error('[lineService] getProfile failed:', err?.body || err?.message || err);
    return null;
  }
}

// Download message content (image/file) as a Buffer.
export async function getMessageContentBuffer(messageId) {
  const stream = await blobClient.getMessageContent(messageId);
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export { client, blobClient };
