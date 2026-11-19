// Runs the work for one customer one message at a time, in the order the messages came.
// LINE can put several events in one webhook call (a customer who sends three lines in a
// row), and handling them side by side let every one of them see "nothing sent yet" and
// answer — three cards for three lines. Different customers still run side by side.
export function createSerial() {
  const tails = new Map(); // key → promise of the latest queued job
  return {
    run(key, job) {
      const prev = tails.get(key) ?? Promise.resolve();
      const next = prev.then(job, job); // a failed job never blocks the ones behind it
      const tail = next.catch(() => {}).finally(() => {
        if (tails.get(key) === tail) tails.delete(key);
      });
      tails.set(key, tail);
      return next;
    },
    size: () => tails.size,
  };
}
