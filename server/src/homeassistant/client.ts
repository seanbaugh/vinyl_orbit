import type { HaReading } from './match.js';

export const ALBUM_ENTITY = 'input_text.vinyl_album';
export const ARTIST_ENTITY = 'input_text.vinyl_artist';
/** The tag automation: its last_triggered changes on every scan, even of the record that is already showing. */
export const TAG_AUTOMATION_ENTITY = 'automation.vinyl_now_playing';

export interface HaClientOptions {
  url: string;
  token: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export interface HaClient {
  /**
   * Reads the two helpers, and when the tag automation last ran. Rejects if a helper cannot be read, including one that
   * is unavailable or unknown; the automation's time is a bonus, so any trouble reading it just gives null.
   */
  readHelpers(): Promise<HaReading>;
}

/** Read-only: only ever GETs entity states. Error messages never include the token. */
export function createHaClient(opts: HaClientOptions): HaClient {
  const base = opts.url.replace(/\/+$/, '');
  const doFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 5000;

  async function getState(entity: string): Promise<{ state?: unknown; attributes?: Record<string, unknown> }> {
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
    return (await res.json()) as { state?: unknown; attributes?: Record<string, unknown> };
  }

  async function readState(entity: string): Promise<string> {
    const body = await getState(entity);
    if (typeof body.state !== 'string') throw new Error(`Home Assistant ${entity}: no state`);
    if (body.state === 'unavailable' || body.state === 'unknown') {
      throw new Error(`Home Assistant ${entity} is ${body.state}`);
    }
    return body.state;
  }

  async function readTriggeredAt(): Promise<string | null> {
    try {
      const last = (await getState(TAG_AUTOMATION_ENTITY)).attributes?.last_triggered;
      return typeof last === 'string' && last ? last : null;
    } catch {
      return null;
    }
  }

  return {
    async readHelpers() {
      const [album, artist, triggeredAt] = await Promise.all([
        readState(ALBUM_ENTITY), readState(ARTIST_ENTITY), readTriggeredAt(),
      ]);
      return { album, artist, triggeredAt };
    },
  };
}
