import { reply } from '../services/lineService.js';
import { setState, STATES } from '../services/stateService.js';

// postback action=search_jobs — ask for a query, then wait for the text.
export async function searchJobsPrompt({ replyToken, profile }) {
  await setState(profile.id, STATES.WAITING_FOR_SEARCH, {});
  await reply(replyToken, {
    type: 'text',
    text: '🔍 พิมพ์คำค้นได้เลยค่ะ\nค้นได้จาก: ชื่อลูกค้า / ชื่องาน / เลขที่งาน (เช่น MJ-20260907-0001) 💜',
  });
}
