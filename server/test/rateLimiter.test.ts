import { expect, test } from 'vitest';
import { RateLimiter } from '../src/discogs/rateLimiter.js';

function fakeClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => { t += ms; },
  };
}

test('spaces calls by the interval', async () => {
  const clock = fakeClock();
  const limiter = new RateLimiter(2500, clock);
  const times: number[] = [];
  await Promise.all([1, 2, 3].map(() => limiter.take().then(() => times.push(clock.now()))));
  expect(times).toEqual([0, 2500, 5000]);
});

test('no wait when the interval has already elapsed', async () => {
  const clock = fakeClock();
  const limiter = new RateLimiter(1000, clock);
  await limiter.take();
  await clock.sleep(5000);
  await limiter.take();
  expect(clock.now()).toBe(5000);
});
