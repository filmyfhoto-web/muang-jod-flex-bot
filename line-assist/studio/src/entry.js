// What the Reply Studio page takes from the bot's own code, so that what the page shows is what the bot does.
// (Bundled into the page by build.mjs; nothing here talks to a network.)
export { buildShop, modeOf, DEFAULT_ADMINS } from '../../src/config.js';
export { buildReply, withSender, quick } from '../../src/replies.js';
export { cleanRules, cleanRule, cleanReply, rulesFromFaq, ruleMessages, REPLY_TYPES, PICTURE_NAMES, MAX_RULES, MAX_KEYWORDS, MAX_REPLIES } from '../../src/rules.js';
export { matchIntent, findRule, normalize } from '../../src/matcher.js';
export { contactCard } from '../../src/flex.js';
export { holidayNotice } from '../../src/holiday.js';
export { default as defaults } from '../../src/data.js';
