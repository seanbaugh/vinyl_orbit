import { USER_AGENT } from '../discogs/client.js';
import { RateLimiter, realClock } from '../discogs/rateLimiter.js';
import { getJson } from '../lib/http.js';

export interface ItunesAlbum {
  collectionId: number;
  collectionName: string;
  artistName: string;
  trackCount: number;
  releaseDate?: string;
  artworkUrl100?: string;
  collectionViewUrl?: string;
}

export interface ItunesSong {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionId: number;
  discNumber?: number;
  trackNumber?: number;
  previewUrl?: string;
  trackViewUrl?: string;
}

export interface ItunesClient {
  searchAlbums(term: string): Promise<ItunesAlbum[]>;
  lookupAlbum(collectionId: number): Promise<{ album: ItunesAlbum | null; songs: ItunesSong[] }>;
  searchSongs(term: string): Promise<ItunesSong[]>;
}

export class ItunesError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ItunesError';
  }
}

type Result = { wrapperType?: string } & Record<string, unknown>;

export function createItunesClient(opts: {
  country: string;
  fetch?: typeof fetch;
  limiter?: RateLimiter;
  sleep?: (ms: number) => Promise<void>;
}): ItunesClient {
  // Apple allows ~20 requests/minute: average 1 per 3 s, with bursts so one record matches quickly.
  const limiter = opts.limiter ?? new RateLimiter(3000, realClock, { burst: 8 });
  const country = encodeURIComponent(opts.country);
  const get = (url: string) =>
    getJson<{ results?: Result[] }>({
      url,
      headers: { 'User-Agent': USER_AGENT },
      fetch: opts.fetch ?? fetch,
      limiter,
      sleep: opts.sleep ?? realClock.sleep,
      fail: (m, status) => new ItunesError(m, status),
    }).then((r) => r.results ?? []);

  const search = (term: string, entity: 'album' | 'song', limit: number) =>
    get(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=${entity}&country=${country}&limit=${limit}`);

  return {
    async searchAlbums(term) {
      return (await search(term, 'album', 10)) as unknown as ItunesAlbum[];
    },
    async searchSongs(term) {
      return (await search(term, 'song', 5)).filter((r) => r.wrapperType === 'track') as unknown as ItunesSong[];
    },
    async lookupAlbum(collectionId) {
      const results = await get(`https://itunes.apple.com/lookup?id=${collectionId}&entity=song&country=${country}`);
      const album = (results.find((r) => r.wrapperType === 'collection') ?? null) as unknown as ItunesAlbum | null;
      const songs = results.filter((r) => r.wrapperType === 'track') as unknown as ItunesSong[];
      return { album, songs };
    },
  };
}
