export interface Autosaver {
  change(text: string): void;
  flush(): void;
  dispose(): void;
}

interface Options {
  initial: string;
  delay: number;
  save: (text: string) => Promise<unknown>;
  /** Persist an unsaved draft locally (null clears it). */
  draft: (text: string | null) => void;
  onState?: (s: 'saving' | 'saved' | 'failed') => void;
  retryMs?: number;
}

/** Debounced autosave that writes a local draft on every change and can flush synchronously. */
export function createAutosaver(o: Options): Autosaver {
  let latest = o.initial;
  let lastSent = o.initial;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clear = () => { if (timer) clearTimeout(timer); timer = null; };

  const send = () => {
    clear();
    if (latest === lastSent) return;
    const text = latest;
    lastSent = text;
    o.onState?.('saving');
    o.save(text).then(
      () => { if (latest === text) o.draft(null); o.onState?.('saved'); },
      () => {
        lastSent = '\u0000unsaved'; // force a retry
        o.onState?.('failed');
        if (!timer) timer = setTimeout(send, o.retryMs ?? 5000);
      },
    );
  };

  return {
    change(text) {
      latest = text;
      o.draft(text);
      clear();
      timer = setTimeout(send, o.delay);
    },
    flush: send,
    dispose: send,
  };
}
