import { logger } from './logger.js';

// Turn a LINE voice message into Thai text.
//
// Claude has no ear, so this is the one job in the bot that goes to another
// vendor. Either key works and neither is required: with none set the bot says
// so instead of failing silently, exactly like the vision layer.
//
//   OPENAI_API_KEY  -> OpenAI transcription   (STT_MODEL, gpt-4o-mini-transcribe)
//   GEMINI_API_KEY  -> Gemini generateContent (STT_MODEL, gemini-flash-latest)

// LINE sends voice notes as m4a. The type is passed through to the provider
// because both of them sniff the container from it.
const AUDIO_TYPE = 'audio/m4a';

const PROMPT =
  'ถอดเสียงภาษาไทยนี้เป็นข้อความ ตอบเฉพาะข้อความที่ได้ยินเท่านั้น ' +
  'ห้ามแปล ห้ามสรุป ห้ามเติมคำอธิบาย ตัวเลขให้เขียนเป็นเลขอารบิก';

export function maxVoiceSeconds() {
  return Number(process.env.MAX_VOICE_SECONDS) || 120;
}

// Which provider is configured, or null. Exported so /health can say.
export function transcriberName() {
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  return null;
}

async function transcribeWithOpenAI(buffer) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: AUDIO_TYPE }), 'voice.m4a');
  form.append('model', process.env.STT_MODEL || 'gpt-4o-mini-transcribe');
  form.append('language', 'th');
  form.append('prompt', PROMPT);

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const json = await res.json();
  return json?.text || '';
}

async function transcribeWithGemini(buffer) {
  const model = process.env.STT_MODEL || 'gemini-flash-latest';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: PROMPT },
            { inline_data: { mime_type: AUDIO_TYPE, data: buffer.toString('base64') } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const json = await res.json();
  return (json?.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || '')
    .join('')
    .trim();
}

async function defaultTranscribe(buffer) {
  const provider = transcriberName();
  if (!provider) return null;
  return provider === 'openai' ? transcribeWithOpenAI(buffer) : transcribeWithGemini(buffer);
}

// Returns the spoken text, or null when transcription is unavailable or came
// back empty. Never throws — the caller has to say something either way.
export async function transcribe(buffer, deps = {}) {
  const run = deps.transcribeAudio || defaultTranscribe;
  try {
    const text = String((await run(buffer)) || '').trim();
    if (!text) return null;
    logger.info('voice.transcribed', { chars: text.length });
    return text;
  } catch (err) {
    logger.warn('voice.transcribe_failed', { message: err?.message });
    return null;
  }
}
