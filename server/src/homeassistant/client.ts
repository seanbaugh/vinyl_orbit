import type { HaPair } from './match.js';

export const ALBUM_ENTITY = 'input_text.vinyl_album';
export const ARTIST_ENTITY = 'input_text.vinyl_artist';

export interface HaClientOptions {
  url: string;
  token: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export interface HaClient {
  /** Reads the two helpers. Rejects on any failure, including a helper that is unavailable or unknown. */
  readHelpers(): Promise<HaPair>;
}

/** Read-only: only ever GETs entity states. Error messages never include the token. */
export function createHaClient(opts: HaClientOptions): HaClient {
  const base = opts.url.replace(/\/+$/, '');
  const doFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 5000;

  async function readState(entity: string): Promise<string> {
    let res: Response;
    try {
      res = await doFetch(`${base}/api/states/${entity}`, {
        headers: { Authorization: `Bearer ${opts.token}` },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const reason = (err as Error).name === 'TimeoutError' || (err as Error).name === 'AbortError'
        ? 'timed out' : 'request failed';
      throw new Error(`Home Assistant ${entity}: ${reason}`);
    }
    if (!res.ok) throw new Error(`Home Assistant ${entity}: HTTP ${res.status}`);
    const body = (await res.json()) as { state?: unknown };
    if (typeof body.state !== 'string') throw new Error(`Home Assistant ${entity}: no state`);
    if (body.state === 'unavailable' || body.state === 'unknown') {
      throw new Error(`Home Assistant ${entity} is ${body.state}`);
    }
    return body.state;
  }

  return {
    async readHelpers() {
      const [album, artist] = await Promise.all([readState(ALBUM_ENTITY), readState(ARTIST_ENTITY)]);
      return { album, artist };
    },
  };
}
