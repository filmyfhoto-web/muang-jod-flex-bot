import linebot from '@line/bot-sdk';
import { lineConfig } from '../config/line.js';
import { themedContents } from '../flex/theme.js';

const { MessagingApiClient, MessagingApiBlobClient } = linebot.messagingApi;

const client = new MessagingApiClient({
  channelAccessToken: lineConfig.channelAccessToken,
});

const blobClient = new MessagingApiBlobClient({
  channelAccessToken: lineConfig.channelAccessToken,
});

// Flex gives a bubble a white background unless told otherwise, so the card's
// surface is stamped on here rather than in each builder — one place to get it
// right, and a new card cannot forget. A builder that sets its own `styles`
// still wins.
function toArray(messages) {
  return (Array.isArray(messages) ? messages : [messages]).map((m) =>
    m?.type === 'flex' ? { ...m, contents: themedContents(m.contents) } : m
  );
}

// Reply to an event using its replyToken.
export async function reply(replyToken, messages) {
  try {
    await client.replyMessage({ replyToken, messages: toArray(messages) });
  } catch (err) {
    console.error('[lineService] reply failed:', err?.body || err?.message || err);
    throw err;
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
