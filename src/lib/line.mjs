export class LineClient {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.baseUrl = 'https://api.line.me/v2/bot';
  }

  async request(path, body) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.accessToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`LINE API ${response.status}: ${detail}`);
    }
    return response.status === 204 ? null : response.json();
  }

  async reply(replyToken, messages) {
    if (!replyToken) throw new Error('ไม่พบ replyToken');
    const safeMessages = Array.isArray(messages) ? messages.slice(0, 5) : [messages];
    return this.request('/message/reply', { replyToken, messages: safeMessages });
  }

  async push(to, messages) {
    const safeMessages = Array.isArray(messages) ? messages.slice(0, 5) : [messages];
    return this.request('/message/push', { to, messages: safeMessages });
  }
}

export function textMessage(text, quickReply = null) {
  return { type: 'text', text, ...(quickReply ? { quickReply } : {}) };
}
