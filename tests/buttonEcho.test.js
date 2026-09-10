import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withoutEcho } from '../src/services/lineService.js';
import { buildAreas, pageUrl } from '../scripts/create-rich-menu.js';
import { receiptFlex } from '../src/flex/receiptFlex.js';

const LIFF = { LIFF_ID: '1234567890-AbCdEfGh' };

// A postback's displayText posts the button's own label into the chat as if
// the shop had typed it, so every tap left a line of its own words above the
// answer. The shop asked for a tap to just do the thing.

test('nothing sent to LINE echoes the button that was tapped', () => {
  const card = receiptFlex({ id: 'job-1', job_name: 'งาน', total: 100, items: [] });
  assert.ok(JSON.stringify(card).includes('displayText'), 'the fixture stopped covering this');

  const sent = JSON.stringify(withoutEcho(card));
  assert.ok(!sent.includes('displayText'), 'a button still speaks for the shop');

  // What the buttons are for must survive: the label is what is printed on
  // them, and the data is the only thing that says what to do.
  assert.ok(sent.includes('action=bill_job&jobId=job-1'));
  assert.ok(sent.includes('🧾 ออกใบเสร็จ'));
});

test('only postbacks lose it — a message of your own keeps its text', () => {
  const messages = [
    { type: 'text', text: 'สวัสดีค่ะ' },
    { type: 'flex', contents: { type: 'bubble', body: {
      type: 'box', layout: 'vertical', contents: [
        { type: 'text', text: 'ยอดรวม' },
        { type: 'button', action: { type: 'uri', label: 'เปิด', uri: 'https://example.com' } },
        { type: 'button', action: { type: 'postback', label: 'ลบ', data: 'action=x', displayText: 'ลบรายการ' } },
      ],
    } } },
  ];

  const out = withoutEcho(messages);
  assert.equal(out[0].text, 'สวัสดีค่ะ', 'a text message is not a button');
  const [, , btn] = out[1].contents.body.contents;
  assert.deepEqual(btn.action, { type: 'postback', label: 'ลบ', data: 'action=x' });
  assert.equal(out[1].contents.body.contents[1].action.uri, 'https://example.com');
  assert.equal(out[1].contents.body.contents[0].text, 'ยอดรวม', 'a text inside a card is not a button either');

  // The original is left alone — the strip happens on the way out.
  assert.equal(messages[1].contents.body.contents[2].action.displayText, 'ลบรายการ');
});

test('menu buttons that only open a page go straight there', () => {
  const areas = buildAreas(LIFF);
  const by = (label) => areas.find((a) => a.action.label === label).action;

  // จดงาน used to be: post "จดงาน" into the chat, wait for two greeting lines
  // and a carousel, then tap "กรอกในฟอร์ม" inside it. Three steps to the form.
  assert.equal(by('จดงาน').type, 'uri');
  assert.match(by('จดงาน').uri, /\/jot\?quick=1$/);
  assert.match(by('ตั้งค่า').uri, /\?tab=settings$/);
  assert.match(by('งานค้าง').uri, /\?tab=pending$/);
  assert.match(by('รายการล่าสุด\/แก้ไข').uri, /\?tab=today$/);

  // These start a conversation — wait for a photo, pick a customer, choose a
  // category — so there is no page for a link to open.
  for (const label of ['บันทึก/แนบสลิป', 'หมวดงาน', 'ออกใบเสร็จ', 'ช่วยเหลือ']) {
    assert.equal(by(label).type, 'postback', `${label} has no page to open`);
  }

  // And not one of the nine speaks for the shop.
  assert.equal(areas.filter((a) => a.action.displayText).length, 0);
});

test('with no LIFF app the same buttons still work, through the bot', () => {
  assert.equal(pageUrl('jot', {}), null);
  const areas = buildAreas({});
  assert.equal(areas.length, 9);
  assert.equal(areas.filter((a) => a.action.type === 'postback').length, 9);
  assert.equal(areas.find((a) => a.action.label === 'จดงาน').action.data, 'action=add_job');
});
