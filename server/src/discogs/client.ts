import { getJson as getJsonWithRetry } from '../lib/http.js';
import { RateLimiter, realClock } from './rateLimiter.js';
import type { CollectionPage, DiscogsRelease } from './types.js';

const API = 'https://api.discogs.com';
export const USER_AGENT = 'VinylOrbit/1.0 +https://github.com/seanmikel/vinyl-orbit';

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

  const getJson = <T>(url: string) =>
    getJsonWithRetry<T>({ url, headers, fetch: doFetch, limiter, sleep, fail: (m, status) => new DiscogsError(m, status) });

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
