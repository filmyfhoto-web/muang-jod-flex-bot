import express from 'express';
import linebot from '@line/bot-sdk';
import { lineConfig } from '../config/line.js';
import { getOrCreateProfile } from '../services/userService.js';
import { handleTextMessage } from '../handlers/messageHandler.js';
import { handleImageMessage } from '../handlers/imageHandler.js';
import { handlePostback } from '../handlers/postbackHandler.js';
import { handleFollow } from '../handlers/followHandler.js';
import { markEventProcessed } from '../services/webhookEventService.js';
import { reply } from '../services/lineService.js';
import { logger, maskUserId } from '../services/logger.js';

const { middleware } = linebot;
const router = express.Router();

const GENERIC_ERROR = 'ขออภัยค่ะ ระบบมีปัญหาชั่วคราว กรุณาลองใหม่อีกครั้ง 💜';

function actionOf(event) {
  if (event.type !== 'postback') return undefined;
  try {
    return new URLSearchParams(event.postback?.data || '').get('action') || undefined;
  } catch {
    return undefined;
  }
}

async function dispatch(event, profile) {
  switch (event.type) {
    case 'message': {
      const mtype = event.message?.type;
      if (mtype === 'text') return handleTextMessage(event, profile);
      if (mtype === 'image' || mtype === 'file') return handleImageMessage(event, profile);
      logger.info('webhook.unsupported_message', { mtype });
      return;
    }
    case 'postback':
      return handlePostback(event, profile);
    case 'follow':
      return handleFollow(event, profile);
    default:
      logger.info('webhook.unhandled_event', { type: event.type });
      return;
  }
}

// Process one event: dedupe, resolve the owner profile, dispatch, log timing.
// Every path starts from the event's own user — the per-user security anchor.
async function processEvent(event) {
  const started = Date.now();
  const lineUserId = event.source?.userId;
  const base = { eventType: event.type, user: maskUserId(lineUserId), action: actionOf(event) };

  if (!lineUserId) {
    logger.warn('webhook.no_user', base);
    return;
  }

  // Idempotency — skip if this LINE event id was already processed.
  const { isNew } = await markEventProcessed(event.webhookEventId, event.type);
  if (!isNew) {
    logger.info('webhook.skip_duplicate', base);
    return;
  }

  try {
    const profile = await getOrCreateProfile(lineUserId);
    await dispatch(event, profile);
    logger.info('webhook.ok', { ...base, ms: Date.now() - started, result: 'success' });
  } catch (err) {
    // Log full detail server-side; never send a stack trace to the user.
    logger.error('webhook.failed', {
      ...base,
      ms: Date.now() - started,
      result: 'failure',
      message: err?.message,
      status: err?.statusCode,
    });
    if (event.replyToken) {
      // DEBUG_ERRORS=1 makes the bot tell its owner what actually broke, so a
      // deployment can be diagnosed from the chat instead of the server logs.
      const detail = process.env.DEBUG_ERRORS
        ? `\n\n[debug] ${err?.code || ''} ${err?.message || err}`.trimEnd()
        : '';
      try {
        await reply(event.replyToken, { type: 'text', text: GENERIC_ERROR + detail });
      } catch (e2) {
        logger.error('webhook.error_reply_failed', { message: e2?.message });
      }
    }
  }
}

// LINE middleware verifies X-Line-Signature against the channel secret.
router.post('/', middleware(lineConfig), async (req, res) => {
  const events = req.body?.events || [];
  // Acknowledge fast so LINE doesn't retry; process afterwards.
  res.status(200).json({ ok: true });
  for (const event of events) {
    await processEvent(event);
  }
});

export default router;
