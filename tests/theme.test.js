import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLORS, themed, themedContents, paymentPresentation } from '../src/flex/theme.js';
import { todaySummaryFlex } from '../src/flex/todaySummaryFlex.js';
import { confirmCancelFlex } from '../src/flex/confirmationFlex.js';
import { categoryGroupsFlex, categoryTypesFlex } from '../src/flex/categoryPickerFlex.js';
import { remindPickerFlex, reminderSetFlex } from '../src/flex/reminderFlex.js';
import { pendingPaymentFlex } from '../src/flex/pendingPaymentFlex.js';
import { searchResultsFlex } from '../src/flex/searchResultsFlex.js';
import { paymentConfirmationFlex } from '../src/flex/paymentFlex.js';
import { reportMenuFlex } from '../src/flex/reportFlex.js';
import { recentJobsFlex } from '../src/flex/recentJobsFlex.js';
import { jobCardMessage, jobPreviewMessage } from '../src/flex/jobCard.js';
import { homeFlex } from '../src/flex/homeFlex.js';

// A card that keeps Flex's white default is unreadable in this palette, so the
// surface being stamped on every bubble is the thing that must not regress.

test('themed styles only the sections a bubble actually has', () => {
  const bare = themed({ type: 'bubble', body: { type: 'box' } });
  assert.deepEqual(bare.styles, { body: { backgroundColor: COLORS.surface } });

  const full = themed({ type: 'bubble', header: {}, body: {}, footer: {} });
  assert.deepEqual(Object.keys(full.styles), ['header', 'body', 'footer']);

  // No header in the bubble, no header in the styles.
  assert.equal('header' in bare.styles, false);
});

test("themed leaves a builder's own choice alone", () => {
  const custom = themed({
    type: 'bubble',
    body: {},
    footer: {},
    styles: { body: { backgroundColor: '#000000' } },
  });
  assert.equal(custom.styles.body.backgroundColor, '#000000', 'an explicit surface wins');
  assert.equal(custom.styles.footer.backgroundColor, COLORS.surface, 'the rest still get one');
});

test('themedContents reaches every bubble in a carousel, and passes anything else through', () => {
  const carousel = themedContents({
    type: 'carousel',
    contents: [
      { type: 'bubble', body: {} },
      { type: 'bubble', body: {}, footer: {} },
    ],
  });
  assert.equal(carousel.type, 'carousel');
  assert.ok(carousel.contents.every((b) => b.styles.body.backgroundColor === COLORS.surface));

  assert.deepEqual(themedContents(undefined), undefined);
  assert.deepEqual(themedContents({ type: 'box' }), { type: 'box' }, 'not a bubble: untouched');
});

// WCAG relative luminance + contrast, so the two accents can be checked
// rather than eyeballed.
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('every colour on the card can actually be read on it', () => {
  // accent is a FILL: white button labels and the numbered circle sit on it.
  assert.ok(
    contrast(COLORS.white, COLORS.accent) >= 4.5,
    `white on accent is only ${contrast(COLORS.white, COLORS.accent).toFixed(2)}:1`
  );

  // Everything that is TEXT on the card, at the sizes cards actually use.
  for (const name of ['accentText', 'title', 'ink', 'sub', 'green', 'orange', 'red']) {
    const ratio = contrast(COLORS[name], COLORS.surface);
    assert.ok(ratio >= 4.5, `${name} on the card is only ${ratio.toFixed(2)}:1`);
  }
  // grey is for small print — 3:1 is the floor before it stops being text.
  assert.ok(contrast(COLORS.grey, COLORS.surface) >= 3, 'grey is invisible on the card');

  // The tint panel sits on the card, so the two must not be the same colour.
  assert.notEqual(COLORS.tint, COLORS.surface, 'the inner panel would disappear');
});

test('every colour is a hex value, and the status colours differ from each other', () => {
  for (const [name, value] of Object.entries(COLORS)) {
    assert.match(value, /^#[0-9A-Fa-f]{6}$/, `${name} is not a hex colour`);
  }
  const seen = new Set(['paid', 'partial', 'pending'].map((s) => paymentPresentation(s).color));
  assert.equal(seen.size, 3, 'a status has to be tellable from its colour');
  for (const status of ['paid', 'partial', 'pending', 'anything-else']) {
    const p = paymentPresentation(status);
    assert.match(p.bg, /^#[0-9A-Fa-f]{6}$/);
    assert.ok(p.text.length);
  }
});


// The real cards, put through the same transform the send path applies. The
// surface is set explicitly on every bubble rather than left to LINE's default
// — a card that relies on that default silently breaks the day the palette
// moves, and that is not visible from a unit test of any single builder.
const JOB = {
  id: 'job-1',
  job_number: 'MJ-0001',
  job_name: 'ป้ายไวนิล 60x100',
  job_date: '2026-09-08',
  total: 150,
  paid_amount: 0,
  balance_due: 150,
  payment_status: 'pending',
  items: [{ item_name: 'ป้ายไวนิล', size: '60x100', quantity: 1, total: 150 }],
};

function bubblesOf(message) {
  const c = themedContents(message.contents);
  return c?.type === 'carousel' ? c.contents : [c];
}

test('every card the bot sends comes out on the card surface', () => {
  const cards = {
    todaySummary: todaySummaryFlex({ date: '2026-09-08', jobCount: 1, total: 150, paid: 0, pending: 150 }),
    confirmCancel: confirmCancelFlex(JOB),
    categoryGroups: categoryGroupsFlex('job-1'),
    categoryTypes: categoryTypesFlex('print', 'job-1'),
    remindPicker: remindPickerFlex(JOB),
    reminderSet: reminderSetFlex({ id: 'r1', message: 'ทวงงาน', remind_at: '2026-09-09T02:00:00Z' }, JOB),
    pending: pendingPaymentFlex([JOB]),
    pendingEmpty: pendingPaymentFlex([]),
    search: searchResultsFlex([JOB], 'ป้าย'),
    payment: paymentConfirmationFlex(JOB),
    reportMenu: reportMenuFlex(),
    recent: recentJobsFlex([JOB]),
    recentEmpty: recentJobsFlex([]),
    jobCard: jobCardMessage(JOB),
    jobPreview: jobPreviewMessage(JOB),
    home: homeFlex({ date: '2026-09-08', total: 150, jobCount: 1, pending: 150 }),
  };

  for (const [name, message] of Object.entries(cards)) {
    assert.equal(message.type, 'flex', `${name}: not a flex message`);
    const bubbles = bubblesOf(message);
    assert.ok(bubbles.length, `${name}: no bubbles`);
    for (const bubble of bubbles) {
      assert.equal(bubble.type, 'bubble', `${name}: carousel holds something else`);
      assert.equal(
        bubble.styles?.body?.backgroundColor,
        COLORS.surface,
        `${name}: body is not on the card surface`
      );
    }
  }
});

// Flex text sizes, smallest first. LINE has larger ones (xl…5xl) and the cards
// used to reach for them; on a phone that turns a job name into two lines of
// headline and pushes the card off the screen.
const SIZES = ['xxs', 'xs', 'sm', 'md', 'lg', 'xl', 'xxl', '3xl', '4xl', '5xl'];
const BIGGEST_ALLOWED = SIZES.indexOf('lg');

function textSizesIn(node, found = []) {
  if (Array.isArray(node)) {
    for (const n of node) textSizesIn(n, found);
    return found;
  }
  if (!node || typeof node !== 'object') return found;
  if (node.type === 'text' && typeof node.size === 'string') found.push(node.size);
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') textSizesIn(value, found);
  }
  return found;
}

test('nothing on a card is set in headline type', () => {
  const cards = {
    todaySummary: todaySummaryFlex({ date: '2026-09-08', jobCount: 1, total: 150, paid: 0, pending: 150 }),
    confirmCancel: confirmCancelFlex(JOB),
    categoryGroups: categoryGroupsFlex('job-1'),
    categoryTypes: categoryTypesFlex('print', 'job-1'),
    remindPicker: remindPickerFlex(JOB),
    reminderSet: reminderSetFlex({ id: 'r1', message: 'ทวงงาน', remind_at: '2026-09-09T02:00:00Z' }, JOB),
    pending: pendingPaymentFlex([JOB]),
    search: searchResultsFlex([JOB], 'ป้าย'),
    payment: paymentConfirmationFlex(JOB),
    reportMenu: reportMenuFlex(),
    recent: recentJobsFlex([JOB]),
    jobCard: jobCardMessage(JOB),
    jobPreview: jobPreviewMessage(JOB),
    home: homeFlex({ date: '2026-09-08', total: 150, jobCount: 1, pending: 150 }),
  };

  for (const [name, message] of Object.entries(cards)) {
    for (const size of textSizesIn(themedContents(message.contents))) {
      const rank = SIZES.indexOf(size);
      assert.ok(rank > -1, `${name}: "${size}" is not a Flex text size`);
      assert.ok(rank <= BIGGEST_ALLOWED, `${name}: text at "${size}" is bigger than lg`);
    }
  }
});
