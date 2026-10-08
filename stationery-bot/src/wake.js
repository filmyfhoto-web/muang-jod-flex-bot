// A customer bringing the bot back after they had chosen a person to talk to.
export const isWakeWord = (text) =>
  /^(?:เมนู|บอท|menu|เริ่มใหม่)\s*(?:ค่ะ|คะ|ครับ|คับ|นะคะ|นะครับ|นะ)*$/i.test(String(text ?? '').trim());
