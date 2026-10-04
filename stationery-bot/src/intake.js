// "BOT MODE helps take the job": when a customer writes something the shop has no ready
// answer for, the bot asks once for the job details, thanks them once for the reply, and
// then keeps quiet so the admin can take over. After `windowMinutes` without a message
// from that customer the cycle starts again.
import { noteCard } from './flex.js';

export function createIntake(now = () => Date.now()) {
  const seen = new Map(); // userId → { state, last }
  return {
    // → 'prompt' | 'ack' | 'silent'
    next(userId, windowMs) {
      const t = now();
      for (const [id, e] of seen) if (t - e.last > windowMs) seen.delete(id); // forget old chats
      const e = seen.get(userId);
      if (!e) {
        seen.set(userId, { state: 'prompted', last: t });
        return 'prompt';
      }
      e.last = t;
      if (e.state === 'prompted') {
        e.state = 'acked';
        return 'ack';
      }
      return 'silent';
    },
  };
}

export function intakeMessages(shop, kind) {
  const cfg = shop.intake;
  if (!cfg || kind === 'silent') return [];
  const text = kind === 'prompt' ? cfg.prompt : cfg.ack;
  return [noteCard(shop, 'staff', shop.name, text) ?? { type: 'text', text }];
}

export const intakeWindowMs = (shop) => (shop.intake?.windowMinutes ?? 20) * 60 * 1000;
