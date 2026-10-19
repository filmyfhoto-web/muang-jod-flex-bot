// Shared by the tests: the shipped content plus three people the customer can ask for.
import data from '../src/data.js';

export const IDS = { หญิง: 'U' + '1'.repeat(32), ฟิล์ม: 'U' + '2'.repeat(32), พี่ปิ่น: 'U' + '3'.repeat(32) };
export const PEOPLE = Object.entries(IDS).map(([name, userId]) => ({ name, userId }));

export const makeShop = (extra = {}) => {
  const s = JSON.parse(JSON.stringify(data));
  s.contact.people = PEOPLE.map((p) => ({ ...p }));
  s.chatLinkTemplate = undefined;
  s.contact.chatLinkTemplate = 'https://chat.example/oa?x=1';
  s.assetBase = 'https://pics.example/line-assist';
  return Object.assign(s, extra);
};
