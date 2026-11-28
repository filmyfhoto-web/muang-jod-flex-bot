// A rich-menu button can be a *postback* instead of a message — and only a postback can open the keyboard. The bot then receives a
// postback event carrying the button's `data` and no text. This turns such an event into the text message the customer would have
// sent (the button's `text`), so every rule that answers that text — the "who do you want to talk to?" card, the quiet window, the
// burst limit — works unchanged. Any other postback is left alone (returned as it came).
export function postbackAsMessage(ev, shop) {
  if (ev?.type !== 'postback') return ev;
  const data = String(ev.postback?.data ?? '').trim();
  if (!data) return ev;
  const area = (shop?.richMenu?.areas ?? []).find((a) => a && String(a.postback ?? '').trim() === data);
  const text = String(area?.text ?? '').trim();
  if (!area || !text) return ev;
  return {
    ...ev,
    type: 'message',
    message: { type: 'text', id: `postback-${ev.webhookEventId ?? ev.timestamp ?? Date.now()}`, text },
  };
}
