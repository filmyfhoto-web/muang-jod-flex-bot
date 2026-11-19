// The LINE official accounts (OA) that send customers' messages to this bot, other than the main one.
// The main OA keeps its secret and token in Render's environment (the webhook at /webhook is unchanged); every other OA is a row
// in line_channels, with its own webhook at /webhook/ch/<key>. Each OA's messages are kept apart by that key, and a reply always
// goes out with the token of the OA the customer wrote to.
const TTL_MS = 60_000;

export function createChannelRegistry({ store, now = () => Date.now() }) {
  const cache = new Map();
  return {
    // → { key, name, shop_label, channel_secret, channel_token, bot_user_id } for an enabled OA, or null
    async get(key) {
      const hit = cache.get(key);
      if (hit && now() - hit.at < TTL_MS) return hit.row;
      const row = await store.getChannel(key).catch(() => null);
      cache.set(key, { at: now(), row });
      return row;
    },
  };
}
