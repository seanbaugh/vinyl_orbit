import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { initialPlayerState, playerReducer, type PlayerState, type QueueItem } from './queue';

export interface PlayerApi {
  state: PlayerState;
  current: QueueItem | null;
  progress: number;
  duration: number;
  play(items: QueueItem[], start: number): void;
  toggle(): void;
  next(): void;
  prev(): void;
  stop(): void;
  seek(fraction: number): void;
  isPlayingRelease(releaseId: number): boolean;
  isCurrent(releaseId: number, trackIdx: number): boolean;
}

const PlayerContext = createContext<PlayerApi | null>(null);

/** One audio element for the whole app; survives navigation because it lives above the router outlet. */
export function PlayerProvider({ children, createAudio = () => new Audio(), onClipError }: {
  children: ReactNode;
  createAudio?: () => HTMLAudioElement;
  /** Called once when a clip fails to load (e.g. an expired preview URL). */
  onClipError?: (item: QueueItem) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  if (!audioRef.current) audioRef.current = createAudio();
  const audio = audioRef.current;

  const [state, dispatch] = useReducer(playerReducer, initialPlayerState);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const current = state.queue[state.index] ?? null;
  const currentRef = useRef(current);
  currentRef.current = current;
  const onClipErrorRef = useRef(onClipError);
  onClipErrorRef.current = onClipError;

  // Events from a clip that is no longer current (late 'ended', 'error' after a switch) are ignored.
  const isCurrentSrc = useCallback(() => !!currentRef.current && audio.src === currentRef.current.previewUrl, [audio]);

  useEffect(() => {
    const handlers: [string, () => void][] = [
      ['playing', () => isCurrentSrc() && dispatch({ type: 'playing' })],
      ['pause', () => isCurrentSrc() && !audio.ended && dispatch({ type: 'paused' })],
      ['ended', () => isCurrentSrc() && dispatch({ type: 'ended' })],
      ['error', () => {
        if (!isCurrentSrc()) return;
        onClipErrorRef.current?.(currentRef.current!);
        dispatch({ type: 'error' });
      }],
      ['timeupdate', () => {
        if (!isCurrentSrc()) return;
        setDuration(audio.duration || 0);
        setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
      }],
    ];
    for (const [type, fn] of handlers) audio.addEventListener(type, fn);
    return () => { for (const [type, fn] of handlers) audio.removeEventListener(type, fn); };
  }, [audio, isCurrentSrc]);

  // Drive the element from state.
  useEffect(() => {
    if (!current) {
      audio.pause();
      setProgress(0);
      return;
    }
    if (audio.src !== current.previewUrl) {
      audio.src = current.previewUrl;
      setProgress(0);
    }
    if (state.status === 'loading') {
      const src = current.previewUrl;
      audio.play().catch((e: unknown) => {
        if (audio.src !== src) return; // superseded
        // Load failures are handled once, by the 'error' event; only a blocked autoplay needs handling here.
        if ((e as { name?: string })?.name === 'NotAllowedError') dispatch({ type: 'paused' });
      });
    } else if (state.status === 'paused' && !audio.paused) {
      audio.pause();
    }
  }, [audio, current, state.status, state.index, state.queue]);

  useEffect(() => {
    if (state.restart) audio.currentTime = 0;
  }, [audio, state.restart]);

  const api = useMemo<PlayerApi>(() => ({
    state,
    current,
    progress,
    duration,
    play: (items, start) => dispatch({ type: 'play', items, start }),
    toggle: () => dispatch({ type: 'toggle' }),
    next: () => dispatch({ type: 'next' }),
    prev: () => dispatch({ type: 'prev', currentTime: audio.currentTime }),
    stop: () => dispatch({ type: 'stop' }),
    seek: (fraction) => {
      if (audio.duration) audio.currentTime = Math.min(1, Math.max(0, fraction)) * audio.duration;
    },
    isPlayingRelease: (releaseId) => current?.releaseId === releaseId && (state.status === 'playing' || state.status === 'loading'),
    isCurrent: (releaseId, trackIdx) => current?.releaseId === releaseId && current.trackIdx === trackIdx,
  }), [audio, state, current, progress, duration]);

  // OS media controls (keyboard media keys, macOS Now Playing).
  useEffect(() => {
    const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
    if (!ms || typeof MediaMetadata === 'undefined') return;
    ms.metadata = current
      ? new MediaMetadata({ title: current.title, artist: current.artists, album: current.releaseTitle,
        artwork: current.coverUrl ? [{ src: current.coverUrl }] : [] })
      : null;
    const actions: [MediaSessionAction, () => void][] = [
      ['play', api.toggle], ['pause', api.toggle], ['nexttrack', api.next], ['previoustrack', api.prev], ['stop', api.stop],
    ];
    for (const [action, fn] of actions) {
      try { ms.setActionHandler(action, fn); } catch { /* unsupported action */ }
    }
  }, [current, api]);

  return <PlayerContext.Provider value={api}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerApi {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer outside PlayerProvider');
  return ctx;
}
