export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * Token bucket: up to `burst` calls may run back to back, after which calls are spaced by `intervalMs`.
 * Tokens refill at one per `intervalMs`, so the long-run rate never exceeds 1 / intervalMs. burst = 1 is a plain spacer.
 */
export class RateLimiter {
  private chain: Promise<void> = Promise.resolve();
  private tokens: number;
  private lastRefill: number;
  private readonly burst: number;

  constructor(private readonly intervalMs: number, private readonly clock: Clock = realClock, opts: { burst?: number } = {}) {
    this.burst = Math.max(1, opts.burst ?? 1);
    this.tokens = this.burst;
    this.lastRefill = clock.now();
  }

  private refill() {
    const now = this.clock.now();
    if (this.intervalMs > 0) this.tokens = Math.min(this.burst, this.tokens + (now - this.lastRefill) / this.intervalMs);
    this.lastRefill = now;
  }

  take(): Promise<void> {
    const next = this.chain.then(async () => {
      if (this.intervalMs <= 0) return;
      this.refill();
      if (this.tokens < 1) {
        await this.clock.sleep(Math.ceil((1 - this.tokens) * this.intervalMs));
        this.refill();
      }
      this.tokens -= 1;
    });
    this.chain = next.catch(() => {});
    return next;
  }
}
