import { RateLimiter, realClock } from './rateLimiter.js';
import type { CollectionPage, DiscogsRelease } from './types.js';

const API = 'https://api.discogs.com';
export const USER_AGENT = 'VinylOrbit/1.0 +https://github.com/seanmikel/vinyl-orbit';
const MAX_RETRIES = 5;

export class DiscogsError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'DiscogsError';
  }
}

export interface DiscogsClient {
  getCollectionPage(page: number, perPage?: number): Promise<CollectionPage>;
  getRelease(id: number, currency: string): Promise<DiscogsRelease>;
  downloadImage(url: string): Promise<Buffer>;
}

export interface DiscogsClientOptions {
  username: string;
  token: string | null;
  fetch?: typeof fetch;
  limiter?: RateLimiter;
  sleep?: (ms: number) => Promise<void>;
}

export function createDiscogsClient(opts: DiscogsClientOptions): DiscogsClient {
  const doFetch = opts.fetch ?? fetch;
  const limiter = opts.limiter ?? new RateLimiter(opts.token ? 1100 : 2500);
  const sleep = opts.sleep ?? realClock.sleep;

  const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
  if (opts.token) headers.Authorization = `Discogs token=${opts.token}`;

  async function getJson<T>(url: string): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      await limiter.take();
      const res = await doFetch(url, { headers });
      if (res.ok) return (await res.json()) as T;
      if (res.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = Number(res.headers.get('Retry-After'));
        await sleep(retryAfter > 0 ? retryAfter * 1000 : 2 ** (attempt + 1) * 1000);
        continue;
      }
      let message = res.statusText || `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { message?: string };
        if (body.message) message = body.message;
      } catch {
        // non-JSON error body
      }
      throw new DiscogsError(`${message} (${url})`, res.status);
    }
  }

  return {
    getCollectionPage(page, perPage = 100) {
      const user = encodeURIComponent(opts.username);
      return getJson<CollectionPage>(
        `${API}/users/${user}/collection/folders/0/releases?page=${page}&per_page=${perPage}&sort=added&sort_order=desc`,
      );
    },
    getRelease(id, currency) {
      return getJson<DiscogsRelease>(`${API}/releases/${id}?curr_abbr=${encodeURIComponent(currency)}`);
    },
    async downloadImage(url) {
      const res = await doFetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (!res.ok) throw new DiscogsError(`Image download failed (${url})`, res.status);
      return Buffer.from(await res.arrayBuffer());
    },
  };
}
