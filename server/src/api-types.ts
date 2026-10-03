// JSON shapes shared between server and web. Types only — no runtime imports.

export interface TrackRow {
  position: string;
  type: string;
  title: string;
  duration: string;
  artists: string;
  credits: string;
}

export interface SideGroup {
  side: string;
  tracks: TrackRow[];
  totalSeconds: number | null;
}
