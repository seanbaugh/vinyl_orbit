export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** Serialises callers so that consecutive take() calls resolve at least `intervalMs` apart. */
export class RateLimiter {
  private chain: Promise<void> = Promise.resolve();
  private last: number | null = null;

  constructor(private readonly intervalMs: number, private readonly clock: Clock = realClock) {}

  take(): Promise<void> {
    const next = this.chain.then(async () => {
      if (this.last !== null) {
        const wait = this.last + this.intervalMs - this.clock.now();
        if (wait > 0) await this.clock.sleep(wait);
      }
      this.last = this.clock.now();
    });
    this.chain = next.catch(() => {});
    return next;
  }
}
