import express from 'express';
import linebot from '@line/bot-sdk';
import { lineConfig } from '../config/line.js';
import { getOrCreateProfile } from '../services/userService.js';
import { handleTextMessage } from '../handlers/messageHandler.js';
import { handleImageMessage } from '../handlers/imageHandler.js';
import { handlePostback } from '../handlers/postbackHandler.js';
import { handleFollow } from '../handlers/followHandler.js';
import { markEventProcessed } from '../services/webhookEventService.js';
import { reply, rememberReplyTarget } from '../services/lineService.js';
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

// Append the real cause to the error reply unless explicitly switched off.
export function debugErrorsEnabled(env = process.env) {
  const v = String(env.DEBUG_ERRORS ?? '').trim().toLowerCase();
  return !(v === '0' || v === 'false' || v === 'off' || v === 'no');
}

// A one-line, human-readable cause. LINE SDK errors keep the useful part in
// `body` (e.g. which Flex property was rejected), Supabase errors in
// code/details/hint — so gather all of them, not just `message`.
export function errorDetail(err) {
  if (!err) return 'unknown error';
  const body = err.body ?? err.originalError?.response?.data;
  const parts = [
    err.code,
    err.status ?? err.statusCode,
    err.message,
    typeof body === 'string' ? body : body ? JSON.stringify(body) : '',
    err.details,
    err.hint,
  ].filter(Boolean);
  return parts.join(' | ').slice(0, 900);
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
    // So a refused reply token can still reach this user as a push, instead of
    // the bot going quiet on them.
    rememberReplyTarget(event.replyToken, lineUserId);

    const profile = await getOrCreateProfile(lineUserId);
    await dispatch(event, profile);
    logger.info('webhook.ok', { ...base, ms: Date.now() - started, result: 'success' });
  } catch (err) {
    // Log full detail server-side; never send a stack trace to the user.
    logger.error('webhook.failed', {
      ...base,
      ms: Date.now() - started,
      result: 'failure',
      detail: errorDetail(err),
    });
    if (event.replyToken) {
      // The bot tells its owner what actually broke, so a deployment can be
      // diagnosed from the chat instead of the server logs. Set DEBUG_ERRORS=0
      // (or false) once the bot has other users than its owner.
      const detail = debugErrorsEnabled() ? `\n\n[debug] ${errorDetail(err)}` : '';
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
