import { reply, getMessageContentBuffer } from '../services/lineService.js';
import { transcribe, transcriberName, maxVoiceSeconds } from '../services/transcriptionService.js';
import { handleTextMessage } from './messageHandler.js';
import { logger } from '../services/logger.js';

const NO_PROVIDER =
  'ตอนนี้ยังฟังเสียงไม่ได้ค่ะ 🙏\n' +
  'พิมพ์มาได้เลยนะคะ เช่น\n10 กันยา ไก่ทอดน้ำปลา 278';

// A voice note is just another way of typing: transcribe it, then hand the
// words to the text handler unchanged. Every command that works typed works
// spoken, for free, and there is one place where a job gets understood.
export async function handleAudioMessage(event, profile) {
  const { replyToken, message } = event;

  if (!transcriberName()) {
    logger.info('voice.no_provider');
    return reply(replyToken, { type: 'text', text: NO_PROVIDER });
  }

  // LINE gives the length up front, so a long recording is refused before it
  // is downloaded and paid for rather than after.
  const seconds = Math.round((Number(message?.duration) || 0) / 1000);
  const limit = maxVoiceSeconds();
  if (seconds > limit) {
    logger.warn('voice.too_long', { seconds });
    return reply(replyToken, {
      type: 'text',
      text: `เสียงยาวเกินไปค่ะ 😢 รับได้ไม่เกิน ${limit} วินาที\nลองอัดสั้น ๆ ทีละงานนะคะ`,
    });
  }

  let buffer;
  try {
    buffer = await getMessageContentBuffer(message.id);
  } catch (err) {
    logger.error('voice.download_failed', { message: err?.message });
    return reply(replyToken, {
      type: 'text',
      text: 'ขออภัยค่ะ โหลดเสียงไม่สำเร็จ ลองส่งใหม่อีกครั้งนะคะ',
    });
  }

  const heard = await transcribe(buffer);
  if (!heard) {
    return reply(replyToken, {
      type: 'text',
      text: 'ขออภัยค่ะ ฟังไม่ออกเลย 😢\nลองพูดใกล้ ๆ ไมค์อีกครั้ง หรือพิมพ์มาก็ได้นะคะ',
    });
  }

  // The transcript rides along so the reply can show what was heard — without
  // it a mis-heard word looks like a bot that cannot count.
  return handleTextMessage(
    { ...event, message: { type: 'text', id: message.id, text: heard } },
    profile,
    { heard }
  );
}
