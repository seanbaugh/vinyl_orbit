export interface QueueItem {
  releaseId: number;
  trackIdx: number;
  title: string;
  artists: string;
  releaseTitle: string;
  coverUrl: string | null;
  previewUrl: string;
}

export interface PlayerState {
  queue: QueueItem[];
  index: number;
  status: 'idle' | 'loading' | 'playing' | 'paused';
  /** Incremented to ask the audio element to jump back to 0. */
  restart: number;
}

export type PlayerAction =
  | { type: 'play'; items: QueueItem[]; start: number }
  | { type: 'toggle' }
  | { type: 'next' }
  | { type: 'prev'; currentTime: number }
  | { type: 'ended' }
  | { type: 'error' }
  | { type: 'stop' }
  | { type: 'playing' }
  | { type: 'paused' };

export const initialPlayerState: PlayerState = { queue: [], index: 0, status: 'idle', restart: 0 };

export function playerReducer(s: PlayerState, a: PlayerAction): PlayerState {
  switch (a.type) {
    case 'play':
      if (!a.items.length) return initialPlayerState;
      return { ...s, queue: a.items, index: Math.min(Math.max(0, a.start), a.items.length - 1), status: 'loading' };
    case 'next':
    case 'ended':
    case 'error':
      if (!s.queue.length || s.index >= s.queue.length - 1) return initialPlayerState;
      return { ...s, index: s.index + 1, status: 'loading' };
    case 'prev':
      if (!s.queue.length) return s;
      if (a.currentTime > 3 || s.index === 0) return { ...s, restart: s.restart + 1 };
      return { ...s, index: s.index - 1, status: 'loading' };
    case 'toggle':
      if (!s.queue.length) return s;
      return { ...s, status: s.status === 'playing' || s.status === 'loading' ? 'paused' : 'loading' };
    case 'playing':
      return s.queue.length ? { ...s, status: 'playing' } : s;
    case 'paused':
      return s.queue.length ? { ...s, status: 'paused' } : s;
    case 'stop':
      return initialPlayerState;
  }
}
