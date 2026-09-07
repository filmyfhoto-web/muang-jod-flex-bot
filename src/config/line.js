const { LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET } = process.env;

if (!LINE_CHANNEL_ACCESS_TOKEN || !LINE_CHANNEL_SECRET) {
  throw new Error(
    'Missing LINE env vars. Set LINE_CHANNEL_ACCESS_TOKEN and LINE_CHANNEL_SECRET.'
  );
}

export const lineConfig = {
  channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: LINE_CHANNEL_SECRET,
};

export const LINE_API_BASE = 'https://api.line.me/v2/bot';
export const LINE_DATA_API_BASE = 'https://api-data.line.me/v2/bot';
