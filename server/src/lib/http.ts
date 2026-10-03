import type { RateLimiter } from '../discogs/rateLimiter.js';

const MAX_RETRIES = 5;

export interface JsonRequest {
  url: string;
  headers: Record<string, string>;
  fetch: typeof fetch;
  limiter: RateLimiter;
  sleep: (ms: number) => Promise<void>;
  /** Builds the error thrown for a non-OK response. */
  fail: (message: string, status: number) => Error;
}

/** Rate-limited GET returning JSON; retries 429 up to 5 times (Retry-After seconds, else 2^n s). */
export async function getJson<T>(req: JsonRequest): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    await req.limiter.take();
    const res = await req.fetch(req.url, { headers: req.headers });
    if (res.ok) return (await res.json()) as T;
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get('Retry-After'));
      await req.sleep(retryAfter > 0 ? retryAfter * 1000 : 2 ** (attempt + 1) * 1000);
      continue;
    }
    let message = res.statusText || `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string; errorMessage?: string };
      message = body.message ?? body.errorMessage ?? message;
    } catch {
      // non-JSON error body
    }
    throw req.fail(`${message} (${req.url})`, res.status);
  }
}
