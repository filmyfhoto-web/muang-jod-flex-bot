import express from 'express';
import linebot from '@line/bot-sdk';
import { lineConfig } from '../config/line.js';

const { middleware, HTTPError } = linebot;
import { getOrCreateProfile } from '../services/userService.js';
import { handleTextMessage } from '../handlers/messageHandler.js';
import { handleImageMessage } from '../handlers/imageHandler.js';
import { handlePostback } from '../handlers/postbackHandler.js';
import { handleFollow } from '../handlers/followHandler.js';

const router = express.Router();

// Dispatch a single LINE event to the right handler.
// Every path starts by resolving the user's own profile — the security anchor.
async function handleEvent(event) {
  const lineUserId = event.source?.userId;
  if (!lineUserId) {
    console.warn('[webhook] event without userId, skipping:', event.type);
    return;
  }

  const profile = await getOrCreateProfile(lineUserId);

  switch (event.type) {
    case 'message': {
      const mtype = event.message?.type;
      if (mtype === 'text') return handleTextMessage(event, profile);
      if (mtype === 'image' || mtype === 'file') return handleImageMessage(event, profile);
      console.log(`[webhook] unsupported message type: ${mtype}`);
      return;
    }
    case 'postback':
      return handlePostback(event, profile);
    case 'follow':
      return handleFollow(event, profile);
    default:
      console.log(`[webhook] unhandled event type: ${event.type}`);
      return;
  }
}

// LINE middleware verifies the X-Line-Signature header against the channel secret.
router.post('/', middleware(lineConfig), async (req, res) => {
  const events = req.body?.events || [];
  // Acknowledge quickly so LINE doesn't retry; process afterwards.
  res.status(200).json({ ok: true });

  for (const event of events) {
    try {
      await handleEvent(event);
    } catch (err) {
      if (err instanceof HTTPError) {
        console.error('[webhook] LINE API error:', err.statusCode, err.message);
      } else {
        console.error('[webhook] handler error:', err?.message || err);
      }
    }
  }
});

export default router;
