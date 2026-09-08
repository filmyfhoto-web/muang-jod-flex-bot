// Escaping for the two pages the bot serves itself (the receipt and the admin
// setup page). Kept here rather than on a route so importing it does not drag
// in that route's database client.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}
