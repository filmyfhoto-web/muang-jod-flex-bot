// Preloaded into the server under test (node --import): sends the calls meant for LINE to a local stand-in.
const base = process.env.TEST_LINE_BASE;
const aiBase = process.env.TEST_AI_BASE; // stands in for the AI providers (chatai.js)
const real = globalThis.fetch;
if (base || aiBase) {
  globalThis.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const m = base && /^https:\/\/api(?:-data)?\.line\.me(\/.*)$/.exec(url);
    if (m) return real(base + m[1], init);
    const a = aiBase && /^https:\/\/(?:generativelanguage\.googleapis\.com|api\.anthropic\.com)(\/.*)$/.exec(url);
    return real(a ? aiBase + a[1] : input, init);
  };
}
