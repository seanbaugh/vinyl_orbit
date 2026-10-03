import type { SideGroup, TrackRow } from '../api-types.js';

export function parseDuration(d: string): number | null {
  if (!/^\d+(:\d{1,2}){1,2}$/.test(d.trim())) return null;
  return d.trim().split(':').reduce((acc, part) => acc * 60 + Number(part), 0);
}

export function sideOf(position: string): string {
  const p = position.trim();
  const letters = /^([A-Z]+)(\d|$)/.exec(p);
  if (letters) return letters[1];
  const disc = /^(\d+)-\d+/.exec(p);
  if (disc) return `Disc ${disc[1]}`;
  return '';
}

export function groupTracks(tracks: TrackRow[]): SideGroup[] {
  const groups: SideGroup[] = [];
  let pendingHeadings: TrackRow[] = [];
  let current: SideGroup | null = null;

  for (const track of tracks) {
    if (track.type === 'heading') {
      pendingHeadings.push(track);
      continue;
    }
    const side = sideOf(track.position);
    if (!current || current.side !== side) {
      current = { side, tracks: [], totalSeconds: null };
      groups.push(current);
    }
    current.tracks.push(...pendingHeadings, track);
    pendingHeadings = [];
    const secs = parseDuration(track.duration);
    if (secs !== null) current.totalSeconds = (current.totalSeconds ?? 0) + secs;
  }
  if (pendingHeadings.length) {
    if (current) current.tracks.push(...pendingHeadings);
    else groups.push({ side: '', tracks: pendingHeadings, totalSeconds: null });
  }
  return groups;
}
