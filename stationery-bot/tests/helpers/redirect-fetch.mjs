// Preloaded into the server under test (node --import): sends the calls meant for LINE to a local stand-in.
const base = process.env.TEST_LINE_BASE;
const real = globalThis.fetch;
if (base) {
  globalThis.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const m = /^https:\/\/api(?:-data)?\.line\.me(\/.*)$/.exec(url);
    return real(m ? base + m[1] : input, init);
  };
}
